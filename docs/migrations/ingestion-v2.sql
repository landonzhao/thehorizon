-- Ingestion v2 schema migration
-- Run once against your Supabase project before deploying the ingestion refactor.
-- All columns use safe defaults so existing rows are not affected.
--
-- To run: paste into Supabase SQL Editor and execute.

-- ── Date metadata ─────────────────────────────────────────────────────────────
-- date_published_actual: the real article date (may differ from date_published
--   for LLM Discovery sources where date_published = collection time).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS date_published_actual timestamptz;

-- date_discovered: when this ingestion run first found the URL.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS date_discovered timestamptz;

-- date_confidence: "exact" | "estimated" | "low" | "none"
--   exact      — date comes from the feed/API directly
--   estimated  — date inferred from URL pattern (/2025/01/)
--   low        — date is collection time (LLM Discovery, no URL pattern)
--   none       — no date available
ALTER TABLE sources ADD COLUMN IF NOT EXISTS date_confidence text DEFAULT 'exact';

-- ── URL safety ────────────────────────────────────────────────────────────────
-- url_safety_status: result of the async URL safety check
--   "safe" | "http_redirects_to_https" | "unsafe_redirect" | "private_ip" |
--   "unsafe_protocol" | "invalid"
ALTER TABLE sources ADD COLUMN IF NOT EXISTS url_safety_status text DEFAULT 'safe';

-- final_url: the HTTPS destination after following any HTTP redirect.
--   Same as url for HTTPS sources. May differ for HTTP→HTTPS redirects.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS final_url text;

-- url_reachable: true (200/405), false (4xx/5xx), null (timeout or network error)
ALTER TABLE sources ADD COLUMN IF NOT EXISTS url_reachable boolean;

-- ── Validity split ────────────────────────────────────────────────────────────
-- structural_validity_score: data completeness only (0–90). No trust tier bonus.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS structural_validity_score integer DEFAULT 0;

-- publisher_trust_score: trust tier weight (0–10). Separate from structural validity.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS publisher_trust_score integer DEFAULT 0;

-- ── Eligibility flags ─────────────────────────────────────────────────────────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_daily_report   boolean DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_weekly_report  boolean DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_monthly_report boolean DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_archive        boolean DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_trend_analysis boolean DEFAULT true;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS eligible_for_reference_context boolean DEFAULT false;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS needs_review                boolean DEFAULT false;

-- ── Event clustering (scaffolding — populated by a future clustering step) ────
ALTER TABLE sources ADD COLUMN IF NOT EXISTS event_cluster_id    text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS cluster_key         text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_primary_source   boolean;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_follow_on_source boolean;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS adds_new_information boolean;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS related_sources     text[];

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sources_eligible_daily   ON sources (eligible_for_daily_report)   WHERE eligible_for_daily_report = true;
CREATE INDEX IF NOT EXISTS idx_sources_needs_review     ON sources (needs_review)                WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_sources_event_cluster    ON sources (event_cluster_id)            WHERE event_cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_date_confidence  ON sources (date_confidence);
CREATE INDEX IF NOT EXISTS idx_sources_date_discovered  ON sources (date_discovered);
