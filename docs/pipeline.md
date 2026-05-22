# Pipeline Reference

This document traces data from raw source collection through to a published report. Each stage is a distinct step with its own module.

---

## LLM layers at a glance

Two pipeline stages use LLMs. All other stages are deterministic.

| Stage | File | Purpose | Model(s) | API key(s) |
|---|---|---|---|---|
| **Ingestion — LLM Discovery** | `lib/sources/connectors/llmDiscoveryConnector.js` | Discover URLs that RSS feeds miss, using Google Search grounding | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| **Classification — Enrichment** | `lib/claims/enrichSource.js` | Assign tags, ai_specificity_score, short_summary, analyst_brief, intelligence, claims | `gpt-4o-mini` → `llama-3.3-70b-versatile` → `gemini-2.0-flash` → `gemini-2.5-flash` | `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` |

**Enrichment provider rotation**: providers are tried in the order listed above. A provider is skipped if its key is absent or its quota is exhausted. Rate-limit responses (429 with retry-after) cause a wait-and-retry on the same provider. Non-quota errors (auth failures, network) abort immediately without trying the next provider.

**If no enrichment keys are set**: sources are stored but remain unclassified (`tag_version IS NULL`). Classification and all LLM-derived fields (`short_summary`, `analyst_brief`, `intelligence`, tags, `ai_specificity_score`) are absent until a key is configured and the enrich script is run.

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
Seven targeted search queries across AI security subtopics, each using `ti:` (title match) against `cs.CR` and `cs.AI`. 5-second delay between queries. 429 responses retry with exponential backoff (up to 3 attempts). 120-second total timeout.

Trust tier: `high` (academic institution).

### NVD (National Vulnerability Database)
Queries CVEs published in the current window using `keywordSearch=artificial intelligence`. Post-fetch filter checks descriptions for AI-relevant terms. Catches AI CVEs same-day before CISA advisories lag.

### LLM Discovery — uses `gemini-2.5-flash` + `GEMINI_API_KEY`
Four prompts run **sequentially** against Gemini 2.5 Flash with Google Search grounding enabled. A 7-second delay between prompts respects Gemini's free-tier rate limit.

Grounding chunks (Google-verified URIs) become discovered sources. Date is set to collection time (not article date) to ensure they pass the window filter.

The four queries cover: agentic AI attacks and coding assistant vulnerabilities; MCP server security; prompt injection in coding tools; AI-enabled threats (deepfakes, AI malware, nation-state use).

**Skipped if `GEMINI_API_KEY` is not set.**

---

## Stage 2: Cleaning and normalisation

`normalizeSource` (`lib/sources/normalizeSource.js`) runs on every source immediately after collection:
- ID: `sha256(url).slice(0, 36)` — deterministic, cross-run deduplication
- URL: arXiv HTTP → HTTPS; all others used as-is
- Text: `cleanPlaintext` on `title`, `full_text`, `summary`
- Date: invalid/missing → `null` (source fails window filter and is discarded)
- Content hash: `sha256("title|url|full_text")` for change detection

`cleanSources` (`lib/cleaning/cleanSources.js`) then runs batch sanitisation across the result.

---

## Stage 3: Window filtering

Sources outside `start_utc` / `end_utc` are discarded. Sources with no `date_published` are discarded.

---

## Stage 4: Deduplication

`dedupeSources` (`lib/utils/dedupe.js`) removes within-batch duplicates by canonical URL and normalised title. Canonical URL strips UTM parameters, click IDs, fragments, and trailing slashes.

Cross-run deduplication: Supabase upserts on `id` (URL-derived SHA256) silently overwrite rather than duplicate.

---

## Stage 5: Validity and source type filtering

`filterAcceptableSources` (`lib/sources/filterAcceptableSources.js`) enforces a source-type whitelist. Accepted types: `news`, `vendor_advisory`, `security_blog`, `government_advisory`, `policy_update`, `threat_intel`, `research_paper`, `security_framework`, `ai_lab_update`, `vulnerability_database`. Unknown or explicitly rejected types are dropped.

`attachValidityToSources` (`lib/validation/sourceValidity.js`) scores each source 0–100. Hard gates (missing title, unsafe URL) immediately reject. Soft penalties for missing fields and unreachable URLs. Sources scoring `do_not_use` (< 30) are discarded.

URL reachability: async HEAD request with 3-second timeout runs concurrently for all sources. Confirmed error (4xx/5xx) applies −10 penalty. Timeout or network error applies no penalty.

---

## Stage 6: Initial tagging

`attachInitialTags` (`lib/sources/tagSource.js`) runs a lightweight phrase scan to attach rough tags before storage. Tags use the current `ALLOWED_TAGS` vocabulary. These are overwritten by LLM enrichment in Stage 8 — they serve as hints and quick-filter signals only.

---

## Stage 7: Snapshot persistence

`saveSnapshotToDatabase` (`lib/storage/snapshotDatabase.js`):
1. Uploads snapshot JSON to Vercel Blob at `snapshots/snapshot-YYYY-MM-DD.json`
2. Upserts a row in `snapshots` with metadata and `blob_path`
3. Upserts each source into `sources` with `onConflict: "id"`

`ingestion_runs` is updated by `api/refresh.js` via `ingestionRunStore` to record timing, status, and per-connector results.

---

## Stage 8: Classification (LLM enrichment + tag-to-category)

**Entry point**: `lib/classification/classifyStoredSources.js`
**Called by**: `api/classify-sources.js`

Queries `sources WHERE tag_version IS NULL` (unclassified). Processes each source sequentially with 2.5-second inter-call delay.

**Per source:**

### Step A — LLM enrichment (taxonomy layer)
`enrichSource` (`lib/claims/enrichSource.js`) sends the source to the provider rotation:
1. OpenAI `gpt-4o-mini` (`OPENAI_API_KEY`)
2. Groq `llama-3.3-70b-versatile` (`GROQ_API_KEY`)
3. Gemini `gemini-2.0-flash` (`GEMINI_API_KEY`)
4. Gemini `gemini-2.5-flash` (`GEMINI_API_KEY`, final fallback)

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

## Stage 9: Scoring

**Entry point**: `lib/scoring/scoreSource.js`, `lib/scoring/scoreStoredSources.js`
**Called by**: `api/score-sources.js`

No LLM involved. `scoreSource` computes two composite scores using tags, categories, source type, trust tier, and LLM-extracted intelligence fields.

**`priority_score`** (dashboard ranking, max ~95):
- `ai_security_relevance` (0–20): scales `ai_specificity_score` + category bonus
- `severity_score` (0–20): confirmed exploitation, CVEs, threat actors, quantified impact
- `operational_impact_score` (0–20): IOCs, watch points, affected products, advisories
- `novelty_score` (0–15): source type quality, extracted facts, claims density
- `source_credibility_score` (0–10): trust tier lookup
- `singapore_relevance_score` (0–10): Singapore/ASEAN keyword matches in text
- `time_sensitivity_score` (0–5): publication recency + active exploitation

**`report_score`** (report ranking, max ~70):
- `ai_security_relevance` (0–20)
- `report_quality_score` (0–25): horizon relevance, trend signals, threat maturity, intelligence density
- `horizon_signal_score` (0–20): threat maturity + horizon relevance + report tier
- `source_credibility_score` (0–10)
- `novelty_score` (0–15)

Score version: `priority-v5.0`

---

## Stage 10: Report generation

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
