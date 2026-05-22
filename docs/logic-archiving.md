# Source Archiving Logic

## What it does

Archiving persists collected sources to two destinations: Vercel Blob (raw JSON archives) and Supabase (structured database rows). Both happen after the full validation pipeline and before classification/scoring.

---

## Two archive destinations

### Vercel Blob — daily JSON archives

A JSON file is written to Vercel Blob at `archives/YYYY-MM-DD/sources.json` (keyed to the end date of the reporting window in SGT).

Each record in the file captures:
- **Citation**: title, publisher, author, URL, date_published, date_accessed — a complete bibliographic reference
- **Reporting window**: the SGT window this source was collected in
- **Tags**: source_type, credibility_label, tag array at time of collection
- **Integrity hashes**: SHA256 of the URL and SHA256 of the full text — to detect if a page's content has changed between ingestion runs
- **Content**: full_text and raw_html at time of collection
- **Collection metadata**: connector name, retrieval method, collection timestamp

**Why JSON over structured storage for this**: The JSON archive is a point-in-time snapshot. If the database is later changed (columns added, sources re-classified, records deleted), the original collected content is still recoverable from Blob. The archive is append-friendly — running the same daily window twice overwrites the same file, not a problem since the content would be the same.

**When the local archive is skipped**: On Vercel, the `/archive/` local filesystem write is skipped gracefully (Vercel's filesystem is read-only). Blob is the authoritative archive.

### Supabase — snapshot table and sources table

**Snapshot row** (`snapshots` table):
- ID: `snapshot-YYYY-MM-DD` — one row per calendar day, keyed to the SGT window end date
- Stores: period, generated_at, window boundaries, source count, blob path
- Uses upsert on conflict: running the cron twice on the same day merges rather than duplicates

**Source rows** (`sources` table):
- One row per unique source, keyed by the URL-derived SHA256 ID
- Uses **upsert on conflict `id`**: the same article re-ingested on a later day updates the existing row rather than inserting a duplicate
- This is the cross-run deduplication mechanism. The in-memory deduplication in the validation layer handles within-run duplicates; the database upsert handles across-run duplicates.

**What is stored in the source row at this stage** (before classification and scoring):
- Identity: id, url, title, publisher, author
- Temporal: date_published, snapshot_id
- Content: full_text, summary
- Source metadata: source_type, trust_tier, credibility_label, validity_score, tags (initial quick tags from ingestion)
- Classification seeds: main_category, category_confidence, tag_version (all null at this point)
- Integrity: content_hash, clean_text_hash, blob_path

Fields like `priority_score`, `ai_specificity_score`, `relevance_tier`, `intelligence`, `short_summary`, and `analyst_brief` are all null after archiving. They are filled by the classification and scoring passes that run after storage.

---

## The ID scheme and why it matters

Every source ID is a SHA256 hash of the URL, truncated to 36 characters. Two properties follow from this:

1. **Deterministic**: the same URL always produces the same ID. If arXiv publishes a paper and both the arXiv connector and a security blog linking to it arrive in the same run, the deduplication logic picks one before archiving. If the same URL arrives in a future run, the database upsert updates the existing row.

2. **ID collision with null URL**: if a source has no URL (rare — validity rejects it, but normalizeSource still runs), a UUID is generated as fallback. These orphaned sources are typically discarded by the usability gate.

---

## Archive flow summary

```
ingestion → cleaning → window filter → dedup → type filter → validity →
initial tagging → [local archive: skipped on Vercel] → Blob upload → Supabase upsert
```

Classification and scoring are separate passes that run against the already-archived sources:
```
stored sources → classify-sources → score-sources → generate-report
```

This separation means the cron job (which has a tight timeout budget) only needs to handle ingestion through storage. The slower classification and scoring steps can be triggered separately, re-run independently, and are not gated on the daily window.
