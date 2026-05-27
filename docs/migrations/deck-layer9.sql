-- deck-layer9.sql
-- Creates the `decks` table for storing generated pipeline output metadata.
-- Full deck payload (synthesis + slides + QA) is stored in Vercel Blob;
-- this table holds summary metadata and a pointer to the blob.
-- Safe to re-run: uses IF NOT EXISTS guards throughout.
-- Run after understand-layer5.sql.

CREATE TABLE IF NOT EXISTS decks (
  deck_id              text        PRIMARY KEY,   -- e.g. "deck-2026-05-26"
  generated_at         timestamptz NOT NULL,
  source_window_start  date,
  source_window_end    date,
  source_count         integer     DEFAULT 0,
  must_read_count      integer     DEFAULT 0,
  viewpoint_count      integer     DEFAULT 0,
  slide_count          integer     DEFAULT 0,
  synthesis_version    text,
  deck_version         text,
  qa_version           text,
  overall_pass         boolean,
  qa_errors            integer     DEFAULT 0,
  qa_warnings          integer     DEFAULT 0,
  coverage_pct         integer,
  blob_path            text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decks_generated_at
  ON decks (generated_at DESC);
