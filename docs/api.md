# API Reference

All endpoints live in /api. Vercel serves each .js file as a serverless function. The Hobby plan limit is 12 functions; current count is exactly 12.

Authorization: most endpoints require the header "Authorization: Bearer {CRON_SECRET}". The generate-report GET endpoint is public (no auth). The Vercel cron sends the header "x-vercel-cron: 1" instead of Bearer.


## Cron-triggered Endpoints

### POST /api/refresh

The main daily ingestion endpoint. Triggered by Vercel cron at 22:00 UTC (06:00 SGT).

What it does: runs the full collectRawSources pipeline, saves the snapshot to Supabase and Vercel Blob, records the run in ingestion_runs.

Query params:
- days (default 1, max 30): widens the ingestion window. days=14 fetches sources from the past 14 days. Used to backfill recent periods that may have been missed.

When days > 1, the endpoint builds a custom window spanning that many days from now rather than using the standard daily SGT window.

Returns the full snapshot object including per-connector results and pipeline counts.


## Admin Endpoints (require CRON_SECRET)

### POST /api/classify-sources

Runs classifyStoredSources on up to N sources from the database.

Query params:
- limit (default 1000): max sources to process per call
- start, end: optional date filters on date_published

Reads sources from Supabase, runs rule-based classification on all of them, runs LLM enrichment on sources where claim_extraction_status is null (if API key present). Deletes sources with ai_specificity_score < 10 (except curated). Updates all surviving sources with tags, main_category, ai_specificity_score, relevance_tier, and optionally intelligence/summary fields.

Must be run 2-3 times after a large backfill to cover all sources, since the limit applies per call.

Returns: count, deleted_count, gemini_count, rule_count, tier_counts (core/adjacent/context).


### POST /api/score-sources

Runs scoreStoredSources on up to N sources.

Query params:
- limit (default 1000)
- start, end: optional date filters

Reads all sources (or filtered subset), runs scoreSource on each, writes back priority_score, priority_label, priority_reason, report_score, report_quality_score, horizon_signal_score, and all sub-scores.

Returns: count, score_version.


### POST /api/backfill

Serverless version of the backfill. Limited by Vercel's function timeout (~10s for Hobby). Only practical for fetching a few days; use scripts/backfillSources.js for anything longer.

Query params:
- days (default 14, max 30): how far back to look
- includeFeeds (default true): whether to include RSS feeds

Generally superseded by the local script for real backfills.


### POST /api/purge-irrelevant

Runs purgeIrrelevantSources, which deletes sources that are clearly off-topic.

Pass 1: classified sources with ai_specificity_score < 10 (skips curated).
Pass 2: unclassified sources with no tag matches at all.

Query params:
- limit (default 5000)

Use with caution. classify-sources handles deletion as part of classification, so this is mainly useful for cleaning up old sources that predate the current classification logic.


### POST /api/extract-claims

Runs LLM enrichment (extractClaimsWithGemini) directly on a batch of sources. Mostly superseded by classify-sources which now handles enrichment inline. Use scripts/enrichSources.js for bulk enrichment instead, which handles rate limits properly.


## Read Endpoints (public or lightly authenticated)

### GET /api/generate-report

Public (no auth required for GET). Generates the structured horizon scanning report from stored sources.

Query params:
- period: weekly (7d), monthly (30d), quarterly (91d). Default: weekly.
- tiers: comma-separated relevance tiers to include. Default: core,adjacent.

Returns the full report object. See lib/reports/generateReport.js for the shape. Key fields: statistics, top_developments, emerging_threats, trend_signals, sector_alerts, key_entities, category_breakdown.

The frontend Report page calls this endpoint directly.


### GET /api/sources

Returns sources for the current daily window (today in SGT). Used by the frontend Daily tab.

Reads directly from the sources table filtered to the current SGT day's date range.


### GET /api/period-sources

Returns sources for a given period window. Used by the frontend Weekly/Monthly/Quarterly tabs.

Query params:
- period: weekly, monthly, quarterly

These tabs show raw source cards grouped by category, ranked by priority_score. Different from the report view which uses report_score and the generate-report structure.


### GET /api/archive-sources

Returns sources filtered by arbitrary criteria. Used by the frontend Archive tab.

Query params: start, end (YYYY-MM-DD), publisher (partial match), source_type (exact), tag (array contains)

Returns up to 500 sources sorted by date_published descending.


### GET /api/snapshots

Returns the list of stored snapshots (ingestion run history). Used by the frontend if a snapshot history view is displayed.


### GET /api/ingestion-runs

Returns recent ingestion run records from the ingestion_runs table. Shows connector results, counts, and timing for each run.


## Vercel Cron Configuration

vercel.json defines one cron:
- path: /api/refresh
- schedule: "0 22 * * *" (22:00 UTC = 06:00 SGT next day)

This is the only automated trigger. Everything else (classify, score, report) must be called manually or added as additional crons.
