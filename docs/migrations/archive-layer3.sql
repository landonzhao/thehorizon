-- archive-layer3.sql
-- New columns for Layer 3 (Archive) and its Layer 2 validation inputs.
-- Run AFTER archiving-v2.sql.
-- Safe to re-run: all statements use IF NOT EXISTS guards.

-- ── Layer 1 eligibility (added in Layer 1 refactor) ──────────────────────────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_horizon_scan boolean DEFAULT false;

-- ── Layer 2 validation outputs ────────────────────────────────────────────────

-- validation_flags: array of flag strings from validateSource()
-- e.g. ["missing_publisher", "low_relevance_authoritative"]
ALTER TABLE sources ADD COLUMN IF NOT EXISTS validation_flags text[] DEFAULT '{}';

-- layer2_status: outcome of Layer 2 validation
-- "valid" | "invalid"
ALTER TABLE sources ADD COLUMN IF NOT EXISTS layer2_status text;

-- ai_relevance_score: raw AI-signal score (0–100) from the rule-based relevance
-- engine. Distinct from ai_specificity_score, which combines AI + cyber signals.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS ai_relevance_score integer;

-- archive_version: version stamp for the archive schema that wrote this row.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS archive_version text;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sources_eligible_horizon_scan
  ON sources (eligible_for_horizon_scan, date_published DESC)
  WHERE eligible_for_horizon_scan = true;

CREATE INDEX IF NOT EXISTS idx_sources_layer2_status
  ON sources (layer2_status)
  WHERE layer2_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_relevance_tier
  ON sources (relevance_tier)
  WHERE relevance_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_ai_specificity
  ON sources (ai_specificity_score DESC)
  WHERE ai_specificity_score IS NOT NULL;
