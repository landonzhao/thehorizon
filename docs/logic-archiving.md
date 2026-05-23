# Source Archiving Logic

## What it does

Archiving persists collected sources to two destinations: Vercel Blob (immutable JSON archives) and Supabase (structured database rows). Both happen after the full validation pipeline and before classification/scoring.

---

## Two archive destinations

### Vercel Blob — immutable run archives

Each ingestion run writes **two** blobs, both to `archives/YYYY-MM-DD/` (keyed to the SGT window end date):

1. **Immutable run archive** — `archives/YYYY-MM-DD/run-<ISO-timestamp>.json`  
   Written with `overwrite: false`. A new file is created on every ingestion run. Existing files are never overwritten. If the same daily window runs twice, both archives persist independently.

2. **Latest pointer** — `archives/YYYY-MM-DD/latest.json`  
   Always overwritten with the most recent run's data. Useful for quick ad-hoc access without knowing the exact run timestamp.

Each archive payload contains:
- `archive_schema_version` — version stamp (current: `"archive-v2.0"`)
- `snapshot_id`, `run_id`, `generated_at`, `reporting_window`
- Per-source records including:
  - **URL triple**: `original_url` (raw from connector), `canonical_url` (tracking params stripped), `final_url` (HTTPS destination after redirect)
  - **Citation**: title, publisher, author, url, date_published, date_accessed
  - **Provenance**: source_type, trust_tier, is_curated, date_confidence, date_discovered
  - **Validity**: credibility_label, structural_validity_score, publisher_trust_score, url_safety_status
  - **Integrity**: url_hash, content_hash, clean_text_hash, cleaning_version
  - **Content**: raw_text (pre-cleaning), clean_text (post-cleaning), raw_html, summary, extracted_code_blocks, extracted_iocs

**Why immutable archives**: rerunning ingestion on the same day is common during debugging and backfills. An overwrite-only design meant only the last run survived. Immutable filenames (using ISO timestamps) guarantee all historical runs are recoverable, even if the Supabase row is later updated.

### Supabase — snapshot table, sources table, source_snapshots table

**Snapshot row** (`snapshots` table):
- ID: `snapshot-YYYY-MM-DD` — one row per calendar day, keyed to the SGT window end date
- Stores: period, generated_at, window boundaries, source count, blob path
- Uses upsert on conflict: running the cron twice on the same day merges rather than duplicates

**Source rows** (`sources` table):
- One row per unique source, keyed by the `canonical_url`-derived SHA256 ID (tracking params stripped)
- Uses **upsert with `ignoreDuplicates: true`**: the same article re-ingested preserves all existing classification, scoring, and LLM enrichment fields — only ingestion-owned fields are updated on first insert
- Classification-owned fields (`main_category`, `ai_specificity_score`, `intelligence`, etc.) are intentionally absent from the ingestion write so re-ingestion never overwrites them

**Source snapshot rows** (`source_snapshots` table):
- One row per `(source_id, content_hash)` pair — captures point-in-time content
- Unique constraint prevents duplicate captures of identical content
- When a source's full text changes between runs (detected by `content_hash`), a new row is inserted and the old capture is preserved
- Fields: `raw_text`, `clean_text`, `raw_html`, `cleaning_version`, `extracted_code_blocks`, `extracted_iocs`, `captured_at`

This three-table design means: the `sources` table always reflects the current/latest version of a source, while `source_snapshots` preserves the complete content history across all ingestion runs.

---

## URL identity and the canonical_url

Source IDs are derived from `sha256(canonical_url).slice(0, 36)`. `canonical_url` strips tracking parameters (`utm_*`, `fbclid`, `ref`, etc.) and fragments so that the same article arriving from different referral links always gets the same ID.

Three URL fields are stored separately:

| Field | Meaning |
|---|---|
| `original_url` | Raw URL exactly as received from the connector |
| `canonical_url` | Tracking params stripped; used for source ID and dedup |
| `final_url` | HTTPS destination after following an HTTP→HTTPS redirect (set by `checkUrlSafety`) |

The `sources.url` column stores `canonical_url` (the stable identifier). `final_url` is stored separately and used when constructing links in reports.

---

## What is stored at each stage

After archiving, before classification:
- **Identity**: id, url (canonical), original_url, canonical_url, final_url, title, publisher, author
- **Temporal**: date_published, date_published_actual, date_discovered, date_confidence, snapshot_id
- **Content**: raw_text, clean_text, full_text (alias), summary, extracted_code_blocks, extracted_iocs
- **Validity**: structural_validity_score, publisher_trust_score, credibility_label, url_safety_status, url_reachable
- **Provenance**: source_type, trust_tier, is_curated, curated_metadata
- **Version stamps**: cleaning_version, trust_version
- **Eligibility flags**: eligible_for_daily_report, ..._weekly, ..._monthly, ..._archive, ..._trend_analysis, ..._reference_context, needs_review
- **Integrity**: content_hash, clean_text_hash, blob_path

Fields populated by later passes (null at this stage): `main_category`, `ai_specificity_score`, `relevance_tier`, `priority_score`, `report_score`, `intelligence`, `short_summary`, `analyst_brief`, `claim_extraction_status`.

---

## Graceful DB fallback

`snapshotDatabase.js` uses a three-tier fallback so the daily cron keeps running even if a migration hasn't been applied yet:

1. **v3** (all columns, including `archiving-v2.sql` additions): tried first
2. **v2** (ingestion-v2 columns only): tried if v3 returns code `42703` (column does not exist)
3. **v1** (original schema): final fallback

A missing `source_snapshots` table (code `42P01`) is caught separately and skipped gracefully with a console warning.

---

## Archive flow summary

```
ingestion → cleaning → window filter → dedup → type filter → validity →
tagging → eligibility flags → Blob upload (run + latest) → Supabase upsert
(sources + snapshots + source_snapshots)
```

Classification and scoring are separate passes that run against the already-archived sources:
```
stored sources → classify-sources → score-sources → generate-report
```
