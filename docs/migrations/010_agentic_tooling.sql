-- Agentic Tooling Intelligence — Supabase migration
-- Run via: node scripts/applyMigration.mjs lib/tooling/schema.sql
-- All tables prefixed atool_ to avoid collision with the evidence pipeline.

-- ── 1. Canonical tool record ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atool_tools (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name         TEXT    NOT NULL,
  slug              TEXT    UNIQUE NOT NULL,
  description       TEXT,                          -- from actual fetched content
  homepage          TEXT,
  github_url        TEXT    UNIQUE,
  package_url       TEXT,
  documentation_url TEXT,
  source_platform   TEXT    NOT NULL,              -- github|pypi|npm|huggingface|docker|mcp_registry|vscode|manual
  publisher         TEXT,
  maintainer        TEXT,
  license           TEXT,
  open_source       BOOLEAN DEFAULT TRUE,
  url_verified      BOOLEAN DEFAULT FALSE,         -- HEAD check passed
  url_status        INT,                           -- HTTP status of primary URL
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at  TIMESTAMPTZ,
  enrichment_status TEXT    NOT NULL DEFAULT 'pending', -- pending|done|failed|skipped|no_content
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS atool_tools_platform   ON atool_tools(source_platform);
CREATE INDEX IF NOT EXISTS atool_tools_enrich     ON atool_tools(enrichment_status);
CREATE INDEX IF NOT EXISTS atool_tools_first_seen ON atool_tools(first_seen_at DESC);

-- ── 2. Point-in-time metrics snapshots (append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS atool_metrics (
  id               UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id          UUID   NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  snapshot_date    DATE   NOT NULL,
  stars            INT,
  forks            INT,
  downloads_total  BIGINT,
  downloads_recent BIGINT,
  open_issues      INT,
  contributors     INT,
  raw_metadata     JSONB,
  UNIQUE (tool_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS atool_metrics_tool ON atool_metrics(tool_id);
CREATE INDEX IF NOT EXISTS atool_metrics_date ON atool_metrics(snapshot_date DESC);

-- ── 3. Enriched classification + capability flags ─────────────────────────────
CREATE TABLE IF NOT EXISTS atool_classifications (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id                     UUID    NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  classified_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification_version      TEXT    NOT NULL DEFAULT 'v1',

  -- Category
  tool_category               TEXT,    -- agent_framework|coding_agent|browser_agent|research_agent|workflow_agent|mcp_server|mcp_registry|multi_agent|memory_system|evaluation_tool|security_tool|tooling_infra
  tool_subcategory            TEXT,
  agent_type                  TEXT,
  deployment_model            TEXT,    -- cloud|self_hosted|hybrid|desktop
  pricing_model               TEXT,    -- open_source|freemium|paid|enterprise

  -- Lists (from actual page content)
  integrations                TEXT[],
  capabilities                TEXT[],  -- named capability strings from README

  -- Boolean capability flags (queryable columns — not buried in text)
  mcp_enabled                 BOOLEAN DEFAULT FALSE,
  multi_agent                 BOOLEAN DEFAULT FALSE,
  memory_enabled              BOOLEAN DEFAULT FALSE,
  tool_use_enabled            BOOLEAN DEFAULT FALSE,
  browser_access              BOOLEAN DEFAULT FALSE,
  filesystem_access           BOOLEAN DEFAULT FALSE,
  shell_access                BOOLEAN DEFAULT FALSE,
  code_execution              BOOLEAN DEFAULT FALSE,
  autonomous_execution        BOOLEAN DEFAULT FALSE,
  credential_access           BOOLEAN DEFAULT FALSE,
  api_access                  BOOLEAN DEFAULT FALSE,
  github_access               BOOLEAN DEFAULT FALSE,
  email_access                BOOLEAN DEFAULT FALSE,
  slack_access                BOOLEAN DEFAULT FALSE,
  deploy_enabled              BOOLEAN DEFAULT FALSE,

  -- Quality metadata
  description_source          TEXT,    -- 'readme'|'package_manifest'|'homepage'|'llm_generated' — flag hallucinations
  readme_length               INT,     -- 0 means no README fetched
  classification_confidence   TEXT    DEFAULT 'medium',
  classification_reasoning    TEXT,
  classified_by               TEXT    DEFAULT 'llm',

  UNIQUE (tool_id, classification_version)
);

CREATE INDEX IF NOT EXISTS atool_class_tool     ON atool_classifications(tool_id);
CREATE INDEX IF NOT EXISTS atool_class_category ON atool_classifications(tool_category);
CREATE INDEX IF NOT EXISTS atool_class_mcp      ON atool_classifications(mcp_enabled) WHERE mcp_enabled = TRUE;
CREATE INDEX IF NOT EXISTS atool_class_shell    ON atool_classifications(shell_access) WHERE shell_access = TRUE;

-- ── 4. Attack surface mapping (deterministic from capability flags) ───────────
CREATE TABLE IF NOT EXISTS atool_attack_surfaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id         UUID NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  attack_surface  TEXT NOT NULL,   -- shell_access|filesystem_access|credential_access|browser_control|mcp_integration|code_execution|multi_agent_coordination|memory_persistence|external_api|deployment_automation|communication_access
  threat_vector   TEXT,            -- horizon taxonomy tag e.g. ASI05_unexpected_code_execution
  risk_level      TEXT DEFAULT 'medium',  -- high|medium|low
  notes           TEXT,
  mapped_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS atool_surfaces_tool ON atool_attack_surfaces(tool_id);
CREATE INDEX IF NOT EXISTS atool_surfaces_risk ON atool_attack_surfaces(risk_level);

-- ── 5. Weekly aggregate snapshots for trend tracking ─────────────────────────
CREATE TABLE IF NOT EXISTS atool_snapshots (
  id                      UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week           DATE  NOT NULL UNIQUE,
  total_tools             INT,
  new_tools_this_week     INT,
  enriched_tools          INT,

  -- Capability counts (derived — no LLM)
  mcp_enabled_count       INT DEFAULT 0,
  shell_access_count      INT DEFAULT 0,
  browser_access_count    INT DEFAULT 0,
  filesystem_access_count INT DEFAULT 0,
  code_execution_count    INT DEFAULT 0,
  credential_access_count INT DEFAULT 0,
  autonomous_exec_count   INT DEFAULT 0,
  multi_agent_count       INT DEFAULT 0,
  deploy_enabled_count    INT DEFAULT 0,

  -- Breakdowns (JSONB for flexibility)
  by_category             JSONB,
  by_platform             JSONB,
  fastest_growing         JSONB,   -- top 10 by star delta this week
  new_high_risk_tools     JSONB    -- new tools with ≥3 high-risk capability flags
);

-- ── 6. Discovery candidates from search/social (leads queue) ─────────────────
CREATE TABLE IF NOT EXISTS atool_discovery_candidates (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT  NOT NULL,   -- search|hn|producthunt|manual
  query            TEXT,
  result_url       TEXT  NOT NULL,
  title            TEXT,
  snippet          TEXT,
  rank             INT,
  status           TEXT  NOT NULL DEFAULT 'pending',  -- pending|promoted|discarded
  promoted_tool_id UUID  REFERENCES atool_tools(id),
  discovered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS atool_candidates_status ON atool_discovery_candidates(status);
