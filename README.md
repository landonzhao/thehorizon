# The Horizon

An automated AI threat intelligence and horizon scanning platform. It ingests sources from RSS feeds, academic databases, and threat intelligence APIs, classifies and scores them, and generates two final products:

1. **Period page data** — event-first dashboard updates for daily, weekly, monthly, and quarterly views
2. **Monthly horizon scan report** — a strategic intelligence document driven by events, trends, and shift analysis

---

## Architecture

```
Raw sources (RSS, arXiv, NVD, curated imports)
        │
        ▼
Ingestion → Cleaning → Dedup → Validation → Tagging
        │
        ▼
Snapshot persistence (Supabase + Vercel Blob)
        │
        ▼
Classification (LLM tags + AI specificity score) → Category derivation
        │
        ▼
Scoring (priority_score, report_score per source)
        │
        ▼ ── Intelligence Layer ──────────────────────────────────────────
        │
        ▼
Event clustering (CVE IDs → product+date → title similarity)
        │
        ▼
Event synthesis (LLM) → Event scoring
        │
        ▼
Trend clustering → Trend synthesis (LLM) → Trend scoring
        │
        ▼
Strategic synthesis:
  detectStrategicShifts      (LLM — one call per period)
  detectCrossCategoryConvergence  (deterministic pattern match)
  generateDefenderImplications    (deterministic aggregation)
  generateWatchIndicators         (deterministic aggregation)
  buildMaturityTrajectoryMatrix   (deterministic aggregation)
        │
        ├──▶ Product A: Period page data (daily / weekly / monthly / quarterly)
        │
        └──▶ Product B: Monthly horizon scan report (Markdown)
```

**Key principle:** Sources are evidence. Events are what happened. Trends are what is changing. Strategic shifts are what the monthly horizon scan is about. The executive summary is not a ranked source list — it is driven by LLM-detected strategic shifts.

---

## Tech Stack

- **Frontend:** React 19 + Vite (static SPA)
- **Backend:** Vercel serverless functions in `/api` (Node.js ESM)
- **Database:** Supabase (PostgreSQL) with service role key
- **File storage:** Vercel Blob (snapshot and intelligence archives)
- **LLM enrichment:** OpenAI `gpt-4o-mini` (primary) → Groq → Gemini Flash → Gemini 2.5 (fallback chain)
- **Deployment:** Vercel Hobby plan (12 serverless function limit — already at 12)
- **Scheduling:** Vercel cron — `/api/refresh` runs daily at 22:00 UTC (06:00 SGT)

---

## Directory Structure

```
/api          — Vercel serverless function handlers (12 files, at the plan limit)
/lib
  /sources    — ingestion: connectors, registry, normalisation, filtering
  /cleaning   — extractStructuredContent, cleanPlaintext, cleanSources
  /classification — tagging, categorisation, AI specificity scoring
  /claims     — LLM enrichment: enrichSource.js (provider rotation)
  /scoring    — priority and report scoring per source
  /events     — clusterSourcesIntoEvents, synthesiseEvent, scoreEvent
  /trends     — clusterEventsIntoTrends, synthesiseTrend, scoreTrend
  /strategy   — detectStrategicShifts, detectCrossCategoryConvergence,
                generateDefenderImplications, generateWatchIndicators,
                buildMaturityTrajectoryMatrix
  /pages      — generatePeriodPageData
  /reports    — buildMonthlyHorizonScanData, generateMonthlyHorizonScan
               (source-level reports: generateReport, buildChartData, etc.)
  /storage    — Supabase client, snapshot persistence, Vercel Blob, storeIntelligenceBase
  /validation — sourceValidity, urlSafety
  /utils      — dedupe
/scripts      — local Node.js scripts (longer operations, no Vercel timeout)
/src          — React frontend (ReportPage, SourcePage, ArchivePage, components)
/tests        — cleaning.test.js, scoring.test.js, ingestion.test.js, events.test.js
/docs
  /migrations — SQL migration files (run in order)
  NN-*.md     — per-layer logic documentation (01-ingestion through 09-intelligence)
```

---

## Running the Pipeline

### Daily ingestion (automated)
```
Vercel cron → POST /api/refresh
```

### Post-ingestion classification and scoring (run 2–3× until stable)
```sh
curl -X POST https://<your-app>/api/classify-sources?limit=1000
curl -X POST https://<your-app>/api/score-sources?limit=1000
```

### Intelligence base (run locally — exceeds Vercel timeout)
```sh
node scripts/buildIntelligenceBase.js \
  --period monthly \
  --start 2026-05-01 --end 2026-05-31 \
  --limit 2000

# Flags:
#   --skip-llm   deterministic fallbacks only (no API calls)
#   --dry-run    build but do not write to Supabase or Blob
```

### LLM enrichment backfill
```sh
node scripts/enrichSources.js [limit] [delay_ms]
# Default delay: 7000ms (Gemini free tier). Use 500ms with OpenAI.
```

### Source backfill
```sh
node scripts/backfillSources.js [start] [end] [connectors]
```

---

## Database Migrations

Apply in order:

```sh
# 1. Core ingestion tables
psql -f docs/migrations/ingestion-v2.sql

# 2. Archiving tables (source_snapshots, new columns on sources)
psql -f docs/migrations/archiving-v2.sql

# 3. Intelligence layer tables (events, trends, strategic_shifts, convergence_points)
psql -f docs/migrations/intelligence-v1.sql
```

---

## Tests

```sh
node tests/cleaning.test.js    # cleaning, archiving, trust logic
node tests/scoring.test.js     # source scoring
node tests/ingestion.test.js   # ingestion pipeline
node tests/events.test.js      # intelligence layer: events → trends → report
```

---

## Documentation

| File | Covers |
|------|--------|
| `docs/architecture.md` | Full pipeline plan (stages 1–16) + logic layer index |
| `docs/pipeline.md` | Ingestion pipeline detail (stages 1–10) |
| `docs/api.md` | All API endpoint documentation |
| `docs/01-ingestion.md` | Connectors, normalisation, deduplication, eligibility flags |
| `docs/02-cleaning.md` | Non-destructive cleaning architecture |
| `docs/03-validation.md` | Source type filter, validity scoring, URL safety |
| `docs/04-trust.md` | Trust tiers, curated sources, credibility scoring |
| `docs/05-archiving.md` | Immutable archive design, source_snapshots |
| `docs/06-taxonomy.md` | LLM tag assignment, AI specificity score, tag vocabulary |
| `docs/07-classification.md` | Tag→category derivation, relevance tier, purge *(stub)* |
| `docs/08-scoring.md` | Priority score, report score, v6 LLM extraction *(stub)* |
| `docs/09-intelligence.md` | Events, trends, strategic synthesis, horizon scan *(stub)* |

---

## Environment Variables

```
SUPABASE_URL                  Supabase project URL
SUPABASE_SERVICE_ROLE_KEY     Service role key (bypasses row-level security)
BLOB_READ_WRITE_TOKEN         Vercel Blob token
CRON_SECRET                   Bearer token for admin/mutation endpoints
OPENAI_API_KEY                Primary LLM (gpt-4o-mini)
GEMINI_API_KEY                Fallback LLM (gemini-2.5-flash; free tier: 20 req/day)
GROQ_API_KEY                  Fallback LLM (llama-3.3-70b-versatile)
```
