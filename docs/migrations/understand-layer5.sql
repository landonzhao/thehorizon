-- understand-layer5.sql
-- New column for Layer 5 (Taxonomy + LLM Understanding) idempotency stamp.
-- Run AFTER archive-layer3.sql.
-- Safe to re-run: uses IF NOT EXISTS guard.

ALTER TABLE sources ADD COLUMN IF NOT EXISTS understand_version text;

CREATE INDEX IF NOT EXISTS idx_sources_understand_version
  ON sources (understand_version)
  WHERE understand_version IS NOT NULL;
