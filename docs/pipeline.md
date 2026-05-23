# Pipeline Reference

This document traces data from raw source collection through to a published report. Each stage is a distinct step with its own module.

---

## LLM layers at a glance

Three pipeline stages can use LLMs. All other stages are deterministic.

| Stage | File | Purpose | Model(s) | API key(s) |
|---|---|---|---|---|
| **Ingestion — LLM Discovery** | `lib/sources/connectors/llmDiscoveryConnector.js` | Discover URLs that RSS feeds miss, using Google Search grounding | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| **Classification — Enrichment** | `lib/claims/enrichSource.js` | Assign tags, ai_specificity_score, short_summary, analyst_brief, intelligence, claims | `gpt-4o-mini` → `gpt-4o-mini(2)` → `llama-3.3-70b` → `gemini-2.0-flash` → `gemini-2.5-flash` → `gemini-2.0-flash(2)` → `gemini-2.5-flash(2)` | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| **Scoring v6 — Intel Extraction** | `lib/scoring/extractSourceIntelligence.js` | Extract publisher_type, event_type, evidence_level, exploitation_status for type-aware scoring | Same 7-provider rotation as enrichment | Same keys as enrichment |

**Enrichment provider rotation** (7 slots): OpenAI (`OPENAI_API_KEY`) → OpenAI-2 (`OPENAI_API_KEY_2`) → Groq (`GROQ_API_KEY`) → Gemini Flash (`GEMINI_API_KEY`) → Gemini 2.5 (`GEMINI_API_KEY`) → Gemini Flash-2 (`GEMINI_API_KEY_2`) → Gemini 2.5-2 (`GEMINI_API_KEY_2`). Providers are skipped if their key is absent or their quota is exhausted. Rate-limit responses cause a wait-and-retry on the same provider (up to 3 attempts, 30s max wait). Non-quota errors abort immediately.

**If no enrichment keys are set**: sources are stored but remain unclassified (`tag_version IS NULL`). All LLM-derived fields are absent until a key is configured and the enrich script is run. V6 scoring falls back to v5 rule-based behaviour when no intel is extracted.

---

## Stage 1: Ingestion

**Entry point**: `lib/sources/collectRawSources.js`
**Called by**: `api/refresh.js` (cron), `api/backfill.js`, `scripts/backfillSources.js`

`collectRawSources` accepts an optional time window. If none is given, it uses the Singapore daily window (06:00 SGT yesterday → 06:00 SGT today).

**Connectors run in parallel via `Promise.all`:**

### Registry feeds (RSS / Atom)
~35 curated feeds from `lib/sources/sourceRegistry.js`. Each entry calls `fetchRegistryFeedSources` (`lib/sources/connectors/registryFeedConnector.js`), which handles RSS and Atom generically. Up to 50 items per feed are extracted. Each connector has a 6-second timeout.

Trust tier is hardcoded per feed: `primary` (government agencies, AI labs), `high` (vendors, academic), `medium` (general security news).

### arXiv
**16 targeted search queries** across AI security subtopics (7 original + 9 new), using `ti:` (title match) as primary signal and `abs:` (abstract match) selectively for specific technical terms. 5-second delay between queries. 429 responses retry with exponential backoff (up to 3 attempts). 180-second total timeout.

New query topics added: RAG poisoning; ML supply chain attacks; AI-powered phishing; AI coding assistant security; adversarial robustness; privacy and training data extraction attacks; autonomous cyber operations; LLM agent tool abuse; synthetic identity and deepfake fraud.

Trust tier: `high` (academic institution).

### NVD (National Vulnerability Database)
Runs **17 keyword searches** (expanded from 1), deduplicating results by CVE ID across all searches. Searches run in parallel batches of 4 with 6.5-second inter-batch delays (NVD rate limit: 5 req/30s). Post-fetch filter checks CVE descriptions against 22 AI-relevant terms. Total timeout: 45 seconds.

Keywords: artificial intelligence, machine learning, large language model, neural network, deep learning, generative AI, LLM, AI model, AI assistant, foundation model, AI agent, prompt injection, adversarial machine learning, jailbreak, model poisoning, chatbot, Copilot.

### LLM Discovery — uses `gemini-2.5-flash` + `GEMINI_API_KEY`
Four prompts run **sequentially** against Gemini 2.5 Flash with Google Search grounding enabled. A 7-second delay between prompts respects Gemini's free-tier rate limit.

Grounding chunks (Google-verified URIs) become discovered sources. `date_published` is set to collection time to pass the window filter. The connector now also attempts to infer the real publication date from URL patterns (`/YYYY/MM/DD/`). If inferred and older than 48 hours, `eligible_for_daily_report` is set to `false` (historical reference, not breaking news). `date_published_actual` carries the inferred date (null if unknown). `date_confidence` is `"estimated"` (URL pattern found) or `"low"` (no date inferable).

**Skipped if `GEMINI_API_KEY` is not set.**

---

## Stage 2: Cleaning and normalisation

`normalizeSource` (`lib/sources/normalizeSource.js`) runs on every source immediately after collection:
- ID: `sha256(url).slice(0, 36)` — deterministic, cross-run deduplication
- URL: arXiv HTTP → HTTPS; all others used as-is
- Text: `cleanPlaintext` on `title`, `full_text`, `summary`
- Date fields set at normalisation:
  - `date_published`: article publish date (null if missing/invalid)
  - `date_published_actual`: real article date (equals `date_published` for most sources; null for LLM Discovery when unknown)
  - `date_discovered`: always = collection timestamp
  - `date_confidence`: `"exact"` | `"estimated"` | `"low"` | `"none"`
- Content hash: `sha256("title|url|full_text")` for change detection

`cleanSources` (`lib/cleaning/cleanSources.js`) then runs batch sanitisation across the result.

---

## Stage 3: Window filtering

Sources outside `start_utc` / `end_utc` are discarded. Sources with no `date_published` are discarded. LLM Discovery sources always have `date_published` = collection time so they pass this filter.

---

## Stage 4: Deduplication

`dedupeSources` (`lib/utils/dedupe.js`) removes within-batch duplicates by canonical URL, normalised title, and content hash (when full_text > 200 chars). Canonical URL strips UTM parameters, click IDs, fragments, and trailing slashes.

**Quality-based selection**: when two sources share a key, the highest-quality one wins (trust tier + text richness + date confidence + CVE presence). A CISA advisory beats a news summary about the same CVE even if the news article arrived first.

Cross-run deduplication: Supabase upserts on `id` (URL-derived SHA256) silently overwrite rather than duplicate.

---

## Stage 5: Source type filtering and validity scoring

`filterAcceptableSources` (`lib/sources/filterAcceptableSources.js`) accepts sources in two tracks:

**Always accepted**: news, vendor_advisory, security_blog, government_advisory, policy_update, threat_intel, research_paper, security_framework, ai_lab_update, vulnerability_database

**Conditionally accepted**: incident_database (always), ai_threat_framework (always), social_signal (if trust_tier primary/high/curated), open_source_project (if contains CVE or security-advisory language), unknown (always, marked `needs_review = true`)

**Hard rejected**: missing title or URL only. Source type alone is never a hard rejection reason.

`attachValidityToSources` (`lib/validation/sourceValidity.js`) computes two separate scores:
- `structural_validity_score` (0–90): data completeness only — no trust tier bonus
- `publisher_trust_score` (0–10): trust tier weight, independent of structural quality

URL safety now uses `checkUrlSafety()` which follows HTTP→HTTPS redirects. HTTP URLs that redirect to a safe HTTPS destination are accepted; `final_url` records the HTTPS target.

Hard gates (structural score = 0, do_not_use): missing title; missing/unsafe/non-redirecting HTTP URL. Sources scoring `do_not_use` are discarded.

---

## Stage 6: Eligibility flags

`computeEligibilityFlags` (`lib/sources/eligibilityFlags.js`) computes 7 boolean flags per source:
`eligible_for_daily_report`, `eligible_for_weekly_report`, `eligible_for_monthly_report`, `eligible_for_archive`, `eligible_for_trend_analysis`, `eligible_for_reference_context`, `needs_review`.

---

## Stage 7: Initial tagging

`attachInitialTags` (`lib/sources/tagSource.js`) runs a lightweight phrase scan to attach rough tags before storage. Tags use the current `ALLOWED_TAGS` vocabulary. These are overwritten by LLM enrichment in Stage 9 — they serve as hints and quick-filter signals only.

---

## Stage 8: Snapshot persistence

`saveSnapshotToDatabase` (`lib/storage/snapshotDatabase.js`):
1. Uploads snapshot JSON to Vercel Blob at `snapshots/snapshot-YYYY-MM-DD.json`
2. Upserts a row in `snapshots` with metadata and `blob_path`
3. Upserts each source into `sources` with `onConflict: "id"`

`ingestion_runs` is updated by `api/refresh.js` via `ingestionRunStore` to record timing, status, and per-connector results.

---

## Stage 9: Classification (LLM enrichment + tag-to-category)

**Entry point**: `lib/classification/classifyStoredSources.js`
**Called by**: `api/classify-sources.js`

Queries `sources WHERE tag_version IS NULL` (unclassified). Processes each source sequentially with 2.5-second inter-call delay.

**Per source:**

### Step A — LLM enrichment (taxonomy layer)
`enrichSource` (`lib/claims/enrichSource.js`) sends the source to the 7-slot provider rotation:
1. OpenAI `gpt-4o-mini` (`OPENAI_API_KEY`)
2. OpenAI-2 `gpt-4o-mini` (`OPENAI_API_KEY_2`, secondary key)
3. Groq `llama-3.3-70b-versatile` (`GROQ_API_KEY`, free tier)
4. Gemini Flash `gemini-2.0-flash` (`GEMINI_API_KEY`, higher RPD than 2.5)
5. Gemini 2.5 `gemini-2.5-flash` (`GEMINI_API_KEY`)
6. Gemini Flash-2 `gemini-2.0-flash` (`GEMINI_API_KEY_2`, secondary key)
7. Gemini 2.5-2 `gemini-2.5-flash` (`GEMINI_API_KEY_2`, last resort)

The LLM assigns **tags** (from `ALLOWED_TAGS`) and **`ai_specificity_score`** (0–100). It also generates `short_summary`, `analyst_brief`, `intelligence`, and `claims`. **The LLM does not assign `main_category`** — that is derived in Step B.

### Step B — category derivation (classification layer)
`deriveCategory` (`lib/classification/deriveCategory.js`) counts threat tags per category using the `TAG_DEFINITIONS` mapping, then picks the dominant category. Ties are broken by severity rank (highest-positioned tag in `HIGH_SEVERITY_TAGS` then `ELEVATED_SEVERITY_TAGS` wins).

### Step C — deletion gate
If `ai_specificity_score < 10` and the source is not curated, the source is hard-deleted. Curated sources (trust_tier = "curated" OR tags includes "curated") are never deleted.

### Step D — relevance tier
- `core` (score ≥ 40): AI is a primary factor
- `adjacent` (20–39): AI is relevant but not primary
- `context` (10–19): AI mentioned incidentally

**Stamped fields**: `tag_version = "classify-v5.0"`, `claim_extraction_status = "success"`

---

## Stage 10: Scoring

**Entry points**: `lib/scoring/scoreSource.js` (v5), `lib/scoring/scoreSourceV6.js` (v6)
**Called by**: `api/score-sources.js`

Two scoring versions are supported. V5 is the default. V6 is activated by `?use_v6=true`.

### V5 scoring (default, no LLM)

`scoreSource` computes two composite scores using tags, categories, source type, trust tier, and enrichment fields. Fully deterministic.

**`priority_score`** (dashboard ranking, max 100):
- `ai_security_relevance` (0–20): scales `ai_specificity_score` + category bonus
- `severity_score` (0–20): confirmed exploitation, CVEs, threat actors, quantified impact
- `operational_impact_score` (0–20): IOCs, watch points, affected products, advisories
- `novelty_score` (0–15): source type quality, extracted facts, claims density
- `source_credibility_score` (0–10): trust tier lookup
- `singapore_relevance_score` (0–10): Singapore/ASEAN keyword matches
- `time_sensitivity_score` (0–5): publication recency + active exploitation

**`report_score`** (report ranking, max 100): ai_security_relevance + report_quality + horizon_signal + source_credibility + novelty.

Score version: `priority-v5.0`

### V6 scoring (opt-in, uses LLM extraction)

Two-phase pipeline. Phase 1 calls `extractSourceIntelligence` (same 7-provider rotation) to classify the source into `event_type`, `evidence_level`, `publisher_type`, `exploitation_status`, `attack_novelty`, and `geographic_scope`. These are stored in `llm_extracted_intelligence` and are idempotent — if already set, no API call is made.

Phase 2 runs `scoreSourceV6` (fully deterministic): uses extracted intel as primary scoring signals, falls back to v5 behaviour when intel is absent. Applies additive profile deltas per `event_type` to component scores, then enforces event-type score caps.

Key differences from v5:
- `severity_score` uses `evidence_level` directly (confirmed_exploitation = 20 pts vs poc_available = 12 pts vs theoretical = 5 pts) rather than keyword matching
- `source_credibility_score` is the average of `publisher_type` score and `trust_tier` score
- Event-type caps: e.g. `research_finding` is capped at priority 75 and report 100; `active_exploitation` at priority 100
- `attack_novelty` boosts both `report_quality_score` and `horizon_signal_score`
- Singapore/ASEAN term list expanded (17 terms vs 8)

Score version: `priority-v6.0-type-aware-horizon`

DB columns required for v6: `llm_extracted_intelligence` (jsonb), `publisher_type` (text), `event_type` (text). See `docs/logic-scoring.md` for migration SQL. V6 writes these gracefully — if columns don't exist, it falls back to v5 column set automatically.

---

## Stage 11: Report generation

**Entry point**: `lib/reports/generateReport.js`
**Called by**: `api/generate-report.js`

No LLM involved. Queries sources by `date_published` and `relevance_tier` (core + adjacent), constructs:
- `top_developments`: top 10 by `report_score`
- `emerging_threats`: sources where `threat_maturity` is emerging/growing
- `trend_signals`: deduplicated from `intelligence.trend_signals`, sorted by `horizon_relevance`
- `sector_alerts`: most-mentioned sectors from `intelligence.sector_impact`
- `key_entities`: aggregated threat actors, tools, products, CVEs
- `category_breakdown`: per-category sections with top 8 sources each

Trend signals, emerging threats, entity, and sector sections are only populated when LLM enrichment has run. Without enrichment, the report functions but these sections are empty.

---

## Classification module structure

```
lib/classification/
  classifyStoredSources.js  — orchestrator: fetch → enrich → derive category → write
  deriveCategory.js         — deterministic tag→category mapping (no LLM)
  allowedTags.js            — ALLOWED_TAGS and MAIN_CATEGORIES (source of truth)
  tagDefinitions.js         — tag metadata: category and framework citation (no phrases/ai_weight)
  purgeIrrelevantSources.js — standalone purge: AI keyword pre-filter + score threshold delete
  ruleBasedClassifier.js    — deprecated stub (v5.0); no longer called
  phraseRules.js            — empty export (v5.0); phrase matching removed
```

---

## Source registry

`lib/sources/sourceRegistry.js` defines all RSS/Atom feeds. Each entry: name, publisher, type, url, source_type, trust_tier, retrieval_method, enabled. Disabled entries are skipped. ~35 feeds currently enabled covering: CISA, NCSC, CSA Singapore, ENISA, Anthropic, OpenAI, NIST, Google Cloud Security, Microsoft Security, Unit 42, CrowdStrike, Recorded Future, IBM Security, Trail of Bits, Elastic Security Labs, The Hacker News, Dark Reading, BleepingComputer, SecurityWeek, Wired, Ars Technica, Krebs, SANS ISC, Schneier on Security, HiddenLayer, Adversa AI, Lakera AI, Protect AI, Bishop Fox, Embrace the Red, Simon Willison, AVID, ML Safety Newsletter, The Register.

---

## Testing and evaluation

A test set workflow lets you validate prompt quality and scoring logic on a small representative sample without running the full pipeline.

### Test set scripts

```
# Select a fresh 12-source test set (3 per threat category)
node scripts/selectTestSet.js

# List what's currently in the test set
node scripts/selectTestSet.js --list

# Clear test set marks
node scripts/selectTestSet.js --clear
```

### Full test pipeline (single command)

```
# Score and evaluate existing test set
node scripts/runTestPipeline.js

# Select new sources, then score and evaluate
node scripts/runTestPipeline.js --new-set

# Force re-enrich (clears claim_extraction_status), then score and evaluate
node scripts/runTestPipeline.js --enrich

# Run v6 scoring with LLM intelligence extraction
node scripts/runTestPipeline.js --v6

# Full fresh pipeline: new set + re-enrich + v6 scoring
node scripts/runTestPipeline.js --new-set --enrich --v6 --delay=500
```

### What the evaluation report checks

The report prints every source in the test set sorted by `priority_score`, showing score components, tags, and v6 intel fields. It flags these quality issues automatically:

| Issue | Trigger |
|---|---|
| **FILLER** | `why_it_matters` starts with "This", "It", "These", or a vague "The growing/The importance of" opener |
| **MISSING** | `analyst_brief` fields `what_happened`, `how_it_happened`, or `why_it_matters` are empty or < 30 chars |
| **false ai_disinformation** | `ai_disinformation` tag on a source without influence operation language |
| **false model_extraction** | `model_extraction` tag alongside "probe", "steering", "activation", "gradient" etc. |
| **uncategorised with threat tags** | Source is `uncategorised` but carries non-context threat tags |
| **short brief fields** | Named analyst brief fields are short (< 30 chars) |

### Calibration tests

`tests/scoring.test.js` runs deterministic unit tests on the v6 scorer (no LLM calls). It verifies component max values, event-type caps, evidence-level ordering, v5 fallback behaviour, and that all 8 calibration examples in `data/scoringCalibrationExamples.json` fall within their expected priority ranges.

```
node tests/scoring.test.js
```
