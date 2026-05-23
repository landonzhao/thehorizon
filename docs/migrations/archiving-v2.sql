-- archiving-v2.sql
-- New columns on sources + the source_snapshots table.
-- Run AFTER ingestion-v2.sql.
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.

-- ── New columns on sources ────────────────────────────────────────────────────

ALTER TABLE sources ADD COLUMN IF NOT EXISTS original_url   text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS canonical_url  text;

-- Raw and cleaned text kept separately so the cleaning pass is non-destructive.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS raw_text       text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS clean_text     text;

-- Structured content extracted before the cleaning pass.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extracted_code_blocks jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extracted_iocs        jsonb DEFAULT '{}'::jsonb;

-- Version stamps so stale sources can be re-processed.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS cleaning_version text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS trust_version    text;

-- Curated flag: purge-protection only; separate from trust_tier scoring.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_curated       boolean DEFAULT false;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS curated_metadata jsonb;

-- ── source_snapshots table ────────────────────────────────────────────────────
-- Point-in-time content captures.  One row per (source_id, content_hash) pair
-- so that changed articles get a new snapshot without overwriting prior ones.

CREATE TABLE IF NOT EXISTS source_snapshots (
  id                    bigserial PRIMARY KEY,

  source_id             text        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  snapshot_id           text        NOT NULL,   -- mirrors snapshots.snapshot_id
  captured_at           timestamptz NOT NULL DEFAULT now(),

  -- Content hashes link this row to the exact version of the article.
  content_hash          text        NOT NULL,
  clean_text_hash       text,

  -- Raw and cleaned text at the time of capture.
  raw_text              text        NOT NULL DEFAULT '',
  clean_text            text        NOT NULL DEFAULT '',
  raw_html              text        NOT NULL DEFAULT '',

  -- Cleaning version used to produce clean_text.
  cleaning_version      text,

  -- Structured content extracted before cleaning.
  extracted_code_blocks jsonb       NOT NULL DEFAULT '[]'::jsonb,
  extracted_iocs        jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Unique constraint: one snapshot per (source, content version).
  CONSTRAINT uq_source_snapshots_source_content UNIQUE (source_id, content_hash)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sources_canonical_url
  ON sources (canonical_url);

CREATE INDEX IF NOT EXISTS idx_sources_is_curated
  ON sources (is_curated)
  WHERE is_curated = true;

CREATE INDEX IF NOT EXISTS idx_sources_cleaning_version
  ON sources (cleaning_version);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_source_id
  ON source_snapshots (source_id);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_snapshot_id
  ON source_snapshots (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_source_snapshots_captured_at
  ON source_snapshots (captured_at DESC);
