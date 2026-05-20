# Pipeline Reference

This document traces data from raw source collection through to a published report. Each stage is a distinct step with its own module.


## Stage 1: Ingestion (collectRawSources)

Entry point: lib/sources/collectRawSources.js
Called by: api/refresh.js (cron), api/backfill.js, scripts/backfillSources.js

collectRawSources accepts an optional time window and options object. If no window is given, it uses the Singapore daily window (06:00 SGT yesterday to 06:00 SGT today) from lib/time/reportingWindow.js.

The function builds two lists of connectors:

Registry connectors — every enabled entry in lib/sources/sourceRegistry.js becomes a connector that calls fetchRegistryFeedSources (lib/sources/connectors/registryFeedConnector.js), which handles RSS and Atom feeds generically.

API connectors — three hardcoded connectors:
- NVD (lib/sources/connectors/nvdConnector.js): queries the NIST vulnerability database for AI-related CVEs using ?keywordSearch=AI with a date range
- arXiv (lib/sources/connectors/arxivConnector.js): runs 6 targeted search queries across AI security subtopics with a 3s delay between queries and retry logic for 429 rate limits
- AI Incident Database (lib/sources/connectors/aiIncidentConnector.js): fetches the public RSS feed at incidentdatabase.ai/rss.xml, filters by date window

The options.connectors array filters which API connectors run (used by backfillSources.js to run one connector at a time). options.includeFeeds = false skips all registry/RSS connectors (used for historical backfill since RSS has no historical depth).

All connectors run in parallel via Promise.all, each wrapped by runConnector (lib/sources/runConnector.js) which enforces a per-connector timeout with AbortController and returns a standardized result object with status, count, and error fields.


## Stage 2: Cleaning and Normalization

Each connector returns sources already normalized via normalizeSource (lib/sources/normalizeSource.js). This function:
- Derives a deterministic ID: sha256(url).slice(0, 36) so the same article always gets the same ID
- Normalizes the URL (forces https for arxiv.org)
- Cleans title and full_text via cleanPlaintext
- Validates and normalizes date_published
- Computes content_hash and clean_text_hash

After all connectors finish, cleanSources (lib/cleaning/cleanSources.js) runs light sanitization across the batch.


## Stage 3: Date Window Filtering

Sources outside the reporting window's start_utc/end_utc are removed. Sources with no date_published are also removed. This is done before deduplication to avoid keeping wrong-dated duplicates.


## Stage 4: Deduplication

dedupeSources (lib/utils/dedupe.js) removes within-batch duplicates by canonical URL and normalized title. Canonical URL strips UTM parameters, trailing slashes, and lowercases. This handles the case where different connectors return the same article.

Cross-run deduplication happens at the Supabase upsert layer: since IDs are URL-derived, upserting with onConflict: "id" silently overwrites instead of creating a new row.


## Stage 5: Validity and Filtering

filterAcceptableSources (lib/sources/filterAcceptableSources.js) rejects sources with unsupported or explicitly rejected source_type values. The accepted list of source types is: news, vendor_advisory, security_blog, government_advisory, policy_update, threat_intel, research_paper, security_framework, ai_lab_update, vulnerability_database.

attachValidityToSources (lib/validation/sourceValidity.js) scores each source on a 0-100 scale based on trust tier, presence of title/URL/publisher/date, and text length. Sources with label "do_not_use" are discarded.


## Stage 6: Initial Tagging

attachInitialTags (lib/sources/tagSource.js) runs a fast rule-based pass to attach tags before the source is stored. This is a lightweight pre-tag; full classification happens later in the classify step.


## Stage 7: Snapshot Persistence

saveSnapshotToDatabase (lib/storage/snapshotDatabase.js):
1. Uploads the full snapshot JSON to Vercel Blob at snapshots/snapshot-YYYY-MM-DD.json
2. Upserts a row in the snapshots table with metadata and blob_path
3. Upserts each source row into the sources table with onConflict: "id"

The snapshot_id key is snapshot-{end_date_in_SGT}. Multiple ingestion runs on the same day overwrite each other in the snapshots table but source rows are preserved (upsert).

ingestion_runs table is updated by api/refresh.js via ingestionRunStore (lib/storage/ingestionRunStore.js) to record run timing, status, and connector results.


## Stage 8: Classification (classifyStoredSources)

Entry point: lib/classification/classifyStoredSources.js
Called by: api/classify-sources.js

This step reads sources from the database and classifies each one. The decision tree per source:

1. If OPENAI_API_KEY or GEMINI_API_KEY is set and claim_extraction_status is null (not yet enriched): call extractClaimsWithGemini (despite the name, this now tries OpenAI first, Gemini as fallback). The result provides tags, main_category, ai_specificity_score, short_summary, analyst_brief, and intelligence metadata.

2. If no LLM key or LLM call fails: run classifySourceWithRules (lib/classification/ruleBasedClassifier.js), which matches PHRASE_RULES against the source text to assign tags and main_category, then runs computeRuleAiSpecificity to score AI relevance based on weighted phrase matching from TAG_DEFINITIONS.

3. Deletion: if ai_specificity_score < 10 and trust_tier != "curated", the source is hard-deleted. Curated sources are never deleted.

4. Tier assignment based on ai_specificity_score:
   - core: score >= 40 (AI threat is the primary subject)
   - adjacent: score 20-39 (AI is a meaningful factor)
   - context: score 10-19 (AI mentioned incidentally)

5. The source row is updated with tags, main_category, ai_specificity_score, relevance_tier, and if LLM enrichment ran: short_summary, analyst_brief, intelligence, claim_extraction_status = "success".

The classify step adds a 7s delay between LLM calls to stay within free-tier rate limits (approx 8 calls/minute against Gemini's 10 RPM free limit). OpenAI paid tier has no meaningful rate limit at this volume.


## Stage 9: Scoring (scoreStoredSources)

Entry point: lib/scoring/scoreSource.js, lib/scoring/scoreStoredSources.js
Called by: api/score-sources.js

scoreSource computes two composite scores for each source:

priority_score — used for dashboard ranking. Sum of:
- ai_security_relevance (0-20): derived from ai_specificity_score + category bonus
- severity_score (0-20): tag-based and keyword-based severity signals
- operational_impact_score (0-20): actionable terms, patching signals, affected sectors
- novelty_score (0-15): novelty language, source type (research paper scores high)
- source_credibility_score (0-10): directly from trust tier mapping
- singapore_relevance_score (0-10): SGT/ASEAN/sector keyword matches
- time_sensitivity_score (0-5): active exploitation, advisory signals

report_score — used for report ranking. Sum of:
- ai_security_relevance
- report_quality_score (0-25): fact density, source type quality, intelligence metadata
- horizon_signal_score (0-20): threat_maturity emerging/growing + horizon_relevance + report_tier
- source_credibility_score
- novelty_score

priority_label maps priority_score to: critical (>=90), high (>=75), medium (>=55), low (>=35), background.


## Stage 10: Report Generation

Entry point: lib/reports/generateReport.js
Called by: api/generate-report.js (GET, public)

generateReport accepts period (weekly/monthly/quarterly) which sets the lookback window (7/30/91 days from today). It queries sources filtered by date_published and relevance_tier (core + adjacent by default), deduplicates by URL, then constructs:

- top_developments: top 10 by report_score, with title, url, publisher, date, score, short_summary, why_it_matters
- emerging_threats: sources where intelligence.threat_maturity is "emerging" or "growing", sorted by horizon_relevance
- trend_signals: deduplicated signals from intelligence.trend_signals across all sources, sorted by horizon_relevance
- sector_alerts: sectors most frequently mentioned in intelligence.sector_impact
- key_entities: aggregated threat_actors, tools_and_techniques, affected_products, CVEs from intelligence.key_entities
- category_breakdown: per-category sections with top 8 sources each
- statistics: counts by tier, category, priority, threat_maturity, report_tier, gemini_enriched

The trend signals, emerging threats, entity, and sector sections are only populated when LLM enrichment has run (intelligence field populated). Without enrichment, the report still works but these sections are empty.


## Source Registry

lib/sources/sourceRegistry.js defines all RSS/Atom feed sources as a flat array of objects. Each entry has: name, publisher, type (rss/atom), url, source_type, trust_tier, retrieval_method, enabled.

Disabled entries (enabled: false) are skipped. Adding a new feed is just adding an entry to this array. All enabled entries are run in parallel during ingestion.

The registry currently has ~35 enabled feeds covering: CISA, NCSC UK, CSA Singapore, ENISA, Anthropic, OpenAI, NIST, Google Cloud/Security, Microsoft Security, Unit 42, CrowdStrike, Recorded Future, IBM Security, Trail of Bits, Elastic Security Labs, The Hacker News, Dark Reading, BleepingComputer, SecurityWeek, Wired, Ars Technica, Krebs, SANS ISC, MIT Technology Review, Georgetown CSET, Schneier on Security, HiddenLayer, Adversa AI, Lakera AI, Protect AI, Bishop Fox, Embrace the Red, Simon Willison, AVID, ML Safety Newsletter, The Register.


## arXiv Connector Detail

lib/sources/connectors/arxivConnector.js runs 6 search queries:
1. LLM jailbreaks and prompt injection
2. LLM and foundation model security
3. AI-enabled attacks, deepfakes, disinformation
4. ML model attacks — poisoning, extraction, evasion
5. Agentic AI and autonomous system security
6. AI safety and alignment with security implications

Each query uses the arXiv search API with submittedDate range filtering when a window is provided (format: YYYYMMDD0000 TO YYYYMMDD2359). Results are deduplicated by arXiv ID before returning. There is a 3s delay between queries. 429 responses trigger exponential backoff: 20s then 40s, max 3 attempts.


## LLM Enrichment Detail

lib/claims/extractClaimsWithGemini.js (the name is historical; it now supports both providers).

The prompt instructs the model to act as a senior AI security intelligence analyst and return a strict JSON object with:
- short_summary: 3 information-dense sentences
- analyst_brief: structured analysis (what_happened, who_was_affected, actor_or_attribution, how_it_happened, exploited_or_abused, impact, why_it_matters, watch_points)
- claims: array of specific falsifiable claims with evidence spans
- intelligence: trend_signals (2-4), key_entities (threat_actors, tools, products, orgs, CVEs), threat_maturity, sector_impact, horizon_relevance (1-5), report_tier
- classification: tags, main_category, ai_specificity_score, category_confidence, reasons

The response is parsed and validated by validateClaims.js which sanitizes all fields and enforces allowed values (e.g. threat_maturity must be one of emerging/growing/established/declining).

OpenAI is tried first if OPENAI_API_KEY is present. Gemini is used if only GEMINI_API_KEY is present. If both are absent, the function returns empty placeholders and classification falls back to rules.
