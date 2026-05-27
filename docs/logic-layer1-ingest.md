# Layer 1 — Ingestion

## Purpose

Collect credible AI-cyber sources from the past 12 months. All sources must be related to at least one of the four main threat categories: Traditional AI Threats, LLM Threats, Agentic AI Threats, or AI-Enabled Threats.

Layer 1 produces a set of normalised raw source objects, a set of eligibility flags per source, and an archive snapshot. Sources are not yet validated, cleaned, typed, or classified — that happens in Layers 2–6.

---

## Entry Points

| File | Purpose |
|------|---------|
| `lib/pipeline/ingest/collectRawSources.js` | Main entry point. Orchestrates all connectors and produces the Layer 1 output. |

```js
// Daily ingestion (cron, default)
const result = await collectRawSources();

// Horizon scan — 12-month window
const result = await collectRawSources(null, { mode: "horizon_scan" });

// Restrict to specific connectors
const result = await collectRawSources(null, { connectors: ["nvd", "arxiv"] });
```

---

## Connectors

### RSS/Atom Registry (`registryFeedConnector.js`)

Fetches the most recent 50 items from each enabled feed in `sourceRegistry.js`. Feeds always return recent items regardless of the reporting window — date filtering happens after collection.

Key sources in the registry:
- **Primary tier**: CISA, NCSC UK, CSA Singapore, ENISA, Anthropic, OpenAI, NIST
- **High tier**: Microsoft Security, Google Cloud Threat Intel, Google Security Blog, Unit 42, CrowdStrike, Recorded Future, IBM Security, SANS ISC, Krebs on Security, Trail of Bits, HiddenLayer, Protect AI, Lakera AI, Bishop Fox, Adversa AI, Embrace The Red, Simon Willison, AVID, Georgetown CSET, Elastic, MIT Technology Review, Schneier on Security
- **Medium tier**: The Hacker News, Dark Reading, BleepingComputer, SecurityWeek, Help Net Security, Ars Technica, Wired, The Register

### NVD (`nvdConnector.js`)

Queries the NVD REST API for CVE entries matching 17 AI-related keyword searches. Runs in batches of 4 to stay within NVD's unauthenticated rate limit (5 req/30s). Supports date-range queries from the reporting window — in `horizon_scan` mode, fetches CVEs from the full 12-month range.

### arXiv (`arxivConnector.js`)

Runs 16 targeted search queries against the arXiv API covering all four threat categories. Waits 5 seconds between queries to respect arXiv's rate limit. Supports date-range filtering via `submittedDate` — in `horizon_scan` mode, fetches papers from the full 12-month range. This is the primary source for academic research coverage.

### LLM Discovery (`llmDiscoveryConnector.js`)

Uses Gemini with Google Search grounding to surface primary-source URLs that RSS feeds miss. Runs 4 targeted prompts covering agentic AI security, MCP security, prompt injection in coding assistants, and AI-enabled threat intelligence. URLs are sourced from Gemini's grounding metadata and are real, verified URIs — not hallucinated. Requires `GEMINI_API_KEY`.

---

## Processing Pipeline (inside `collectRawSources`)

```
Connectors run in parallel
        ↓
cleanSources()          — normalise whitespace, extract code blocks and IOCs
        ↓
filterByPublishedDateWindow()  — drop sources outside the reporting window
        ↓
dedupeSources()         — remove sources with identical canonical URLs
        ↓
filterAcceptableSources()  — reject unsupported source_type values
        ↓
attachValidityToSources()  — URL safety check + structural score
        ↓
filter: validity.usable = true
        ↓
attachInitialTags()     — rule-based tag inference from title/text keywords
        ↓
computeEligibilityFlags()  — set daily/weekly/monthly/horizon_scan flags
        ↓
archiveSources()        — write snapshot to Vercel Blob
```

---

## Source Types (controlled vocabulary)

Defined in `lib/config/sourceTypes.js`. Connectors assign an initial type; Layer 5 LLM classification may override it.

| Type | Description |
|------|-------------|
| `vulnerability` | CVE disclosures, security advisories (NVD) |
| `exploit_disclosure` | PoC releases, exploit write-ups |
| `incident` | Confirmed security incidents |
| `threat_intelligence` | TTP reports, actor tracking, campaign analysis |
| `research_finding` | Security research, academic papers, blog findings (arXiv, research blogs) |
| `defensive_capability` | Security tools, mitigations, frameworks (OWASP) |
| `policy_regulatory_signal` | Government advisories, regulatory guidance (CISA, NCSC, NIST) |
| `governance_organizational_response` | Institutional responses, governance decisions |
| `ecosystem_market_signal` | Market shifts, adoption patterns |
| `societal_harm_signal` | Documented social harms from AI |
| `benchmark_evaluation` | Evaluations, capability assessments |
| `strategic_foresight_signal` | Forward-looking analysis, horizon signals |
| `adjacent_contextual` | Contextually relevant but not directly AI-cyber |
| `unknown` | Type not determinable — flagged for review, not rejected |

---

## Reporting Windows

| Mode | Window | Used by |
|------|--------|---------|
| `daily` (default) | 24h SGT boundary | Daily cron (`/api/refresh`) |
| `horizon_scan` | 12 months back from now (UTC) | Horizon scan pipeline |

Custom windows can be passed as the first argument to `collectRawSources()`.

---

## Eligibility Flags

Computed by `eligibilityFlags.js` and attached to every source in the output.

| Flag | Meaning |
|------|---------|
| `eligible_for_daily_report` | Published within the current 24h SGT window |
| `eligible_for_weekly_report` | Published within the last 7 days |
| `eligible_for_monthly_report` | Published within the last 30 days |
| `eligible_for_horizon_scan` | Published within the last 365 days |
| `eligible_for_archive` | Always true — every validated source is archived |
| `eligible_for_trend_analysis` | Has sufficient text (> 200 chars) for LLM processing |
| `eligible_for_reference_context` | From a primary/high/curated trust tier publisher |
| `needs_review` | Low date confidence, unknown source type, or incomplete key fields |

---

## Source Normalisation

All connectors produce raw items; `normalizeSource.js` maps them to a consistent shape:

- **Source ID**: SHA-256 of `canonical_url` (first 36 chars). Identical URLs always produce the same ID, enabling Supabase upsert-based deduplication across runs.
- **URL triple**: `original_url` (as received), `canonical_url` (tracking params stripped, lowercase), `final_url` (after HTTP→HTTPS redirect).
- **Date fields**: `date_published` (ISO string), `date_published_actual` (inferred historical date for LLM Discovery sources), `date_discovered`, `date_confidence` (exact/estimated/low/none).

---

## Output Structure

```js
{
  reporting_window: { timezone, start_utc, end_utc, ... },
  sources: [...],                   // tagged, eligibility-flagged source objects

  pipeline_counts: {
    connectors_run, raw, cleaned,
    within_publish_date_window, removed_by_publish_date,
    deduped, accepted, rejected,
    validity_checked, usable, discarded_by_validity
  },

  removed_by_publish_date: [...],   // dropped — published outside window
  rejected_sources: [...],          // dropped — unsupported source_type
  discarded_by_validity: [...],     // dropped — failed URL safety / structural check

  connector_results: [...],         // per-connector status, count, timing, errors
  archive: { archive_url, latest_url, run_id, archived_count }
}
```

---

## Key Design Decisions

**Source IDs from URL hashes.** Re-ingesting the same URL produces the same ID, so Supabase upsert on `conflict:id` is naturally idempotent. No separate deduplication table is needed.

**Curated sources are protected.** Sources with `trust_tier = "curated"` bypass source-type filtering and are never deleted by downstream purge logic.

**RSS feeds give recent items only.** The registryFeedConnector fetches at most 50 items per feed regardless of the reporting window. For 12-month historical coverage, use the backfill script (`scripts/backfillSources.js`) or the arXiv/NVD connectors which honour date-range queries.

**LLM Discovery URLs use collection date.** Gemini grounding returns real, verified URLs but without reliable publish dates. `date_published` is set to collection time so the source passes the daily window filter; `date_published_actual` carries any date inferred from the URL path.
