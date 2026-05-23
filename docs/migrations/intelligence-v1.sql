-- intelligence-v1.sql
-- Creates the intelligence layer tables: events, event_sources, trends,
-- trend_events, strategic_shifts, convergence_points.
-- Run AFTER ingestion-v2.sql and archiving-v2.sql.
-- Safe to re-run: all statements use IF NOT EXISTS guards.

-- ── events ────────────────────────────────────────────────────────────────────
-- One row per unique event cluster. Primary key is a content-derived hash.

CREATE TABLE IF NOT EXISTS events (
  event_id              text        PRIMARY KEY,
  event_title           text,
  event_type            text,
  threat_category       text,

  -- Affected scope
  affected_ai_stack_layers text[]   NOT NULL DEFAULT '{}',
  affected_products     text[]      NOT NULL DEFAULT '{}',
  affected_sectors      text[]      NOT NULL DEFAULT '{}',
  cve_ids               text[]      NOT NULL DEFAULT '{}',
  threat_actors         text[]      NOT NULL DEFAULT '{}',
  geographic_scope      text[]      NOT NULL DEFAULT '{}',
  tags                  text[]      NOT NULL DEFAULT '{}',
  singapore_asean_relevance boolean NOT NULL DEFAULT false,

  -- LLM synthesis
  summary               text,
  what_happened         text,
  how_it_happened       text,
  why_it_matters        text,
  defender_implications text,
  strategic_implications text,
  watch_indicators      text[]      NOT NULL DEFAULT '{}',
  source_limitations    text,

  -- Evidence classification
  evidence_level        text,
  exploitation_status   text,
  maturity_level        text,
  operationalization_level text,
  confidence_level      text,

  -- Temporal
  first_seen            timestamptz,
  last_seen             timestamptz,

  -- Source linkage
  source_count          integer     NOT NULL DEFAULT 1,
  primary_source_id     text        REFERENCES sources(id) ON DELETE SET NULL,
  supporting_source_ids text[]      NOT NULL DEFAULT '{}',

  -- Scoring
  event_priority_score  integer     NOT NULL DEFAULT 0,
  event_report_score    integer     NOT NULL DEFAULT 0,
  priority_label        text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── event_sources ─────────────────────────────────────────────────────────────
-- Maps sources to events with role (primary / supporting).

CREATE TABLE IF NOT EXISTS event_sources (
  id           bigserial   PRIMARY KEY,
  event_id     text        NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  source_id    text        NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'supporting',  -- primary | supporting
  added_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_sources UNIQUE (event_id, source_id)
);

-- ── trends ────────────────────────────────────────────────────────────────────
-- One row per trend cluster. Trends group related events.

CREATE TABLE IF NOT EXISTS trends (
  trend_id              text        PRIMARY KEY,
  trend_title           text,
  threat_categories     text[]      NOT NULL DEFAULT '{}',
  affected_ai_stack_layers text[]   NOT NULL DEFAULT '{}',
  supporting_event_ids  text[]      NOT NULL DEFAULT '{}',
  supporting_source_count integer   NOT NULL DEFAULT 0,
  dominant_tags         text[]      NOT NULL DEFAULT '{}',
  cve_ids               text[]      NOT NULL DEFAULT '{}',
  geographic_scope      text[]      NOT NULL DEFAULT '{}',
  singapore_asean_relevance boolean NOT NULL DEFAULT false,
  affected_sectors      text[]      NOT NULL DEFAULT '{}',

  -- LLM synthesis
  summary               text,
  evidence_summary      text,
  trend_strength        text,
  maturity_level        text,
  trajectory            text,
  confidence_level      text,
  strategic_significance text,
  operational_relevance  text,
  watch_window          text,
  defender_implications text,
  key_indicators_next_month text[]  NOT NULL DEFAULT '{}',

  -- Temporal
  first_seen            timestamptz,
  latest_seen           timestamptz,

  -- Scoring
  trend_score           integer     NOT NULL DEFAULT 0,
  max_event_priority    integer     NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── trend_events ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trend_events (
  id        bigserial   PRIMARY KEY,
  trend_id  text        NOT NULL REFERENCES trends(trend_id) ON DELETE CASCADE,
  event_id  text        NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_trend_events UNIQUE (trend_id, event_id)
);

-- ── strategic_shifts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS strategic_shifts (
  shift_id              text        PRIMARY KEY,
  shift_title           text        NOT NULL,
  previous_assumption   text,
  emerging_reality      text,
  supporting_trend_titles text[]    NOT NULL DEFAULT '{}',
  implications_for_defenders text,
  confidence_level      text,
  maturity_level        text,
  expected_watch_window text,
  singapore_asean_relevance boolean NOT NULL DEFAULT false,
  why_this_matters      text,
  generated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── convergence_points ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS convergence_points (
  pattern_id            text        PRIMARY KEY,
  title                 text        NOT NULL,
  involved_categories   text[]      NOT NULL DEFAULT '{}',
  involved_stack_layers text[]      NOT NULL DEFAULT '{}',
  supporting_trend_ids  text[]      NOT NULL DEFAULT '{}',
  supporting_event_ids  text[]      NOT NULL DEFAULT '{}',
  supporting_event_count integer    NOT NULL DEFAULT 0,
  strategic_risk        text,
  defender_gap          text,
  watch_indicators      text[]      NOT NULL DEFAULT '{}',
  singapore_asean_relevance boolean NOT NULL DEFAULT false,
  detected_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_events_threat_category    ON events (threat_category);
CREATE INDEX IF NOT EXISTS idx_events_exploitation_status ON events (exploitation_status);
CREATE INDEX IF NOT EXISTS idx_events_maturity_level     ON events (maturity_level);
CREATE INDEX IF NOT EXISTS idx_events_event_priority     ON events (event_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_events_event_report       ON events (event_report_score DESC);
CREATE INDEX IF NOT EXISTS idx_events_singapore          ON events (singapore_asean_relevance) WHERE singapore_asean_relevance = true;
CREATE INDEX IF NOT EXISTS idx_events_first_seen         ON events (first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_events_cve_ids            ON events USING GIN (cve_ids);
CREATE INDEX IF NOT EXISTS idx_events_tags               ON events USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_event_sources_event       ON event_sources (event_id);
CREATE INDEX IF NOT EXISTS idx_event_sources_source      ON event_sources (source_id);

CREATE INDEX IF NOT EXISTS idx_trends_threat_categories  ON trends USING GIN (threat_categories);
CREATE INDEX IF NOT EXISTS idx_trends_trend_score        ON trends (trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_maturity           ON trends (maturity_level);
CREATE INDEX IF NOT EXISTS idx_trends_trajectory         ON trends (trajectory);
CREATE INDEX IF NOT EXISTS idx_trends_singapore          ON trends (singapore_asean_relevance) WHERE singapore_asean_relevance = true;

CREATE INDEX IF NOT EXISTS idx_trend_events_trend        ON trend_events (trend_id);
CREATE INDEX IF NOT EXISTS idx_trend_events_event        ON trend_events (event_id);

CREATE INDEX IF NOT EXISTS idx_strategic_shifts_generated ON strategic_shifts (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_convergence_detected       ON convergence_points (detected_at DESC);

-- ── Update trigger for events and trends ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_trends_updated_at ON trends;
CREATE TRIGGER trg_trends_updated_at
  BEFORE UPDATE ON trends
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
