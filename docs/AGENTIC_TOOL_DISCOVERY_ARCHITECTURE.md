# Agentic Tool Discovery Pipeline — Architecture

> **Status:** Design proposal. Not yet implemented.
> **Date:** 2026-06-22
> **Purpose:** Continuously discover, enrich, classify, and track agentic AI tooling
> as a first-class evidence stream feeding horizon scans, category analysis, outlook
> generation, and dashboard insights.

---

## 1. Why this exists

The current horizon-scan corpus (1,213 pass sources) covers AI threats documented in
research papers, CVE advisories, and incident reports. It does not systematically
track **the tooling ecosystem** — the agent frameworks, coding agents, MCP servers,
browser agents, and workflow systems that are simultaneously expanding what AI agents
can do and what attackers can exploit.

The gap: a paper saying "agent shell access is dangerous" is already in the corpus.
A data point saying "tools with autonomous shell execution grew from 12 to 123 in
three months" is not — and that is the higher-signal horizon observation.

This pipeline makes tooling a primary evidence stream, not an afterthought.

---

## 2. Architecture overview

```
DISCOVERY (Phases 1–2)          INTELLIGENCE (Phases 3–5)       OUTPUT (Phases 6–8)
────────────────────────         ──────────────────────────       ─────────────────────
Tier-1 registries/APIs           LLM classification               Trend snapshots
  GitHub Search API     ──►      Capability extraction   ──►      Horizon scan feed
  PyPI JSON API                  Threat surface mapping           Dashboard widgets
  npm registry API               Risk profiling                   Category insights
  Hugging Face API                                                 Emerging signals
  Docker Hub API        ──►
                                                         ──►      alerting (new tool,
Tier-2 ecosystems                                                  new capability,
  MCP registries        ──►      Enrichment agent                 capability surge)
  VS Code marketplace             (targeted, not bulk)
  OpenAI / Anthropic   ──►
  plugin lists

Tier-3 signals (opt-in)
  Hacker News API       ──►
  Product Hunt API
```

**Core principle:** registry/API-first. Tools are discovered from structured
metadata (stars, downloads, package manifests). LLM enrichment runs only on
tools that pass a relevance gate. No bulk crawling, no recursive scraping.

---

## 3. Database schema

Six new tables. All use UUIDs as primary keys and carry `created_at` /
`updated_at` timestamps.

### 3.1 `agent_tools`  — canonical tool record

```sql
CREATE TABLE agent_tools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name        TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,           -- normalised kebab-case
  description      TEXT,
  homepage         TEXT,
  github_url       TEXT,
  package_url      TEXT,                           -- npm/PyPI/HuggingFace
  documentation_url TEXT,
  source_platform  TEXT NOT NULL,                  -- github|npm|pypi|huggingface|docker|mcp_registry|vscode|manual
  publisher        TEXT,
  license          TEXT,
  open_source      BOOLEAN DEFAULT TRUE,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ,
  enrichment_status TEXT DEFAULT 'pending',        -- pending|done|failed|skipped
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 `agent_tool_metrics` — point-in-time snapshots (append-only)

```sql
CREATE TABLE agent_tool_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id          UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  snapshot_date    DATE NOT NULL,
  stars            INTEGER,
  forks            INTEGER,
  downloads_total  BIGINT,
  downloads_recent BIGINT,                         -- last 30d where available
  open_issues      INTEGER,
  contributors     INTEGER,
  watchers         INTEGER,
  raw_metadata     JSONB,
  UNIQUE (tool_id, snapshot_date)
);
```

### 3.3 `agent_tool_classifications` — LLM-assigned category + capabilities

```sql
CREATE TABLE agent_tool_classifications (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id                    UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  classified_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification_version     TEXT NOT NULL DEFAULT 'v1',
  -- Category
  tool_category              TEXT NOT NULL,        -- see §4 taxonomy
  tool_subcategory           TEXT,
  agent_type                 TEXT,                 -- framework|coding_agent|browser_agent|research_agent|workflow|mcp|memory|evaluation|security
  deployment_model           TEXT,                 -- cloud|self_hosted|hybrid|desktop
  pricing_model              TEXT,                 -- open_source|freemium|paid|enterprise
  -- Boolean capability flags (Phase 4)
  mcp_enabled                BOOLEAN DEFAULT FALSE,
  multi_agent                BOOLEAN DEFAULT FALSE,
  memory_enabled             BOOLEAN DEFAULT FALSE,
  tool_use_enabled           BOOLEAN DEFAULT FALSE,
  browser_enabled            BOOLEAN DEFAULT FALSE,
  filesystem_enabled         BOOLEAN DEFAULT FALSE,
  shell_enabled              BOOLEAN DEFAULT FALSE,
  code_execution_enabled     BOOLEAN DEFAULT FALSE,
  autonomous_execution_enabled BOOLEAN DEFAULT FALSE,
  credential_access_enabled  BOOLEAN DEFAULT FALSE,
  email_enabled              BOOLEAN DEFAULT FALSE,
  slack_enabled              BOOLEAN DEFAULT FALSE,
  github_enabled             BOOLEAN DEFAULT FALSE,
  deploy_enabled             BOOLEAN DEFAULT FALSE,
  -- Structured capability list
  capabilities               TEXT[],              -- free-text list of named capabilities
  tools_used                 TEXT[],              -- named external tools/APIs
  authentication             TEXT,                -- oauth|api_key|none|saml
  -- Classification confidence
  classification_confidence  TEXT DEFAULT 'medium', -- high|medium|low
  classification_reasoning   TEXT,
  classified_by              TEXT DEFAULT 'llm',  -- llm|manual|rule
  UNIQUE (tool_id, classification_version)
);
```

### 3.4 `agent_tool_attack_surfaces` — threat surface mapping (Phase 5)

```sql
CREATE TABLE agent_tool_attack_surfaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id           UUID NOT NULL REFERENCES agent_tools(id) ON DELETE CASCADE,
  attack_surface    TEXT NOT NULL,                 -- see §5 surface taxonomy
  threat_vector     TEXT NOT NULL,                 -- maps to taxonomy tag (e.g. ASI02_tool_misuse)
  risk_level        TEXT DEFAULT 'medium',         -- high|medium|low
  notes             TEXT,
  mapped_at         TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 `agent_tool_snapshots` — weekly aggregate for trend tracking (Phase 6)

```sql
CREATE TABLE agent_tool_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week     DATE NOT NULL,                 -- Monday of the week
  total_tools       INTEGER,
  new_tools         INTEGER,
  -- Capability counts (derived from classifications)
  mcp_enabled_count         INTEGER,
  shell_enabled_count       INTEGER,
  browser_enabled_count     INTEGER,
  filesystem_enabled_count  INTEGER,
  code_exec_enabled_count   INTEGER,
  credential_access_count   INTEGER,
  autonomous_exec_count     INTEGER,
  -- Category breakdown (JSONB for flexibility)
  by_category               JSONB,
  by_platform               JSONB,
  -- Fastest growing (top 10 by star growth)
  fastest_growing           JSONB,
  UNIQUE (snapshot_week)
);
```

### 3.6 `agent_tool_signals` — horizon-scan feed entries (Phase 7)

```sql
CREATE TABLE agent_tool_signals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type    TEXT NOT NULL,                    -- new_tool|capability_surge|ecosystem_shift|new_attack_surface
  signal_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  title          TEXT NOT NULL,
  summary        TEXT,
  evidence       JSONB,                            -- e.g. {metric: "mcp_enabled_count", before: 12, after: 48}
  tool_ids       UUID[],                           -- contributing tools
  threat_tags    TEXT[],                           -- horizon taxonomy tags
  horizon_category TEXT,                           -- which of the 4 main categories this feeds
  confidence     TEXT DEFAULT 'medium',
  reviewed       BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Tool taxonomy

### Categories (tool_category)

| Category | Examples |
|---|---|
| `agent_framework` | LangGraph, CrewAI, AutoGen, Haystack, Pydantic AI |
| `coding_agent` | OpenHands, Claude Code, Cursor Agent, Aider, Devin |
| `browser_agent` | Browser Use, OpenOperator, Playwright MCP, Stagehand |
| `research_agent` | Deep Research, Open Deep Research, Perplexity |
| `workflow_agent` | n8n AI, Flowise, Dify, LangFlow |
| `mcp_server` | MCP filesystem, GitHub MCP, Slack MCP, Brave Search MCP |
| `mcp_registry` | mcp.so, Smithery, Glama |
| `multi_agent_system` | OpenAI Swarm, AgentTorch, MetaGPT |
| `memory_system` | Mem0, Letta, MemGPT |
| `evaluation_tool` | Promptfoo, Inspect AI, HELM |
| `security_tool` | Invariant Guardrails, LLM Guard, Rebuff |
| `tooling_infra` | LiteLLM, LangSmith, Portkey, Helicone |

### Attack surface taxonomy (attack_surface)

| Surface | Threat vector | Risk |
|---|---|---|
| `shell_access` | Unexpected code execution, privilege escalation | High |
| `filesystem_access` | Data exfiltration, file manipulation | High |
| `credential_access` | Identity abuse, lateral movement | High |
| `browser_control` | Session hijacking, CSRF, web exfiltration | High |
| `mcp_integration` | Supply-chain compromise, tool poisoning | High |
| `code_execution` | Sandbox escape, malicious code deployment | High |
| `multi_agent_coordination` | Cascading failures, agent confusion | Medium |
| `memory_persistence` | Memory poisoning, context injection | Medium |
| `external_api_calls` | SSRF, data leakage via third-party | Medium |
| `deployment_automation` | Infrastructure compromise via agent | High |
| `email_slack_access` | Social engineering amplification | Medium |

---

## 5. Connectors

### Tier 1 — Structured registry APIs (zero LLM cost)

| Connector | API | What we pull | Volume |
|---|---|---|---|
| **GitHub Search** | `api.github.com/search/repositories` | Repos tagged `ai-agent`, `llm-agent`, `mcp-server`, `autonomous-agent` + topic filters | ~500 new/week at current ecosystem pace |
| **PyPI JSON** | `pypi.org/pypi/{pkg}/json` | Package metadata, download stats, dependencies; seed from GitHub repos | Pull on-demand |
| **npm registry** | `registry.npmjs.org/{pkg}` | Same as PyPI | Pull on-demand |
| **Hugging Face Hub** | `huggingface.co/api/models` | Models + Spaces tagged `agent`, `tool-use`, `mcp` | ~50 new/week |
| **Docker Hub** | `hub.docker.com/v2/search/` | Images tagged `ai-agent`, `mcp`, `autonomous` | ~20/week |

### Tier 2 — Ecosystem-specific (semi-structured)

| Connector | Method | What we pull |
|---|---|---|
| **MCP registries** | JSON/RSS (`mcp.so`, `smithery.ai`, `glama.ai`) | MCP server listings; structured JSON |
| **VS Code Marketplace** | REST API (`marketplace.visualstudio.com/api`) | Extensions tagged `ai-agent`, `copilot`, `mcp` |
| **OpenAI GPT Store** | Sitemap / public listing | GPT-based agents (limited metadata) |
| **Anthropic Claude** | Docs + announcements RSS | Tool-use patterns, MCP adoption |

### Tier 3 — Signal feeds (Tier-1/2 must show gap first)

| Connector | Method | When to activate |
|---|---|---|
| Hacker News | Algolia API (`hn.algolia.com`) | When a tool is mentioned in HN thread — contextual signal |
| Product Hunt | API | New AI agent/tool launches |
| AI newsletters | RSS (Substack, Buttondown) | Curated, low-volume — activate manually |

---

## 6. Enrichment flow (Phase 2)

Enrichment runs **only on tools that pass a relevance gate** (not on every
discovered tool). The gate is deterministic (keyword check on name/description)
before any LLM call.

```
Discovered tool
    │
    ▼
Relevance gate (deterministic)
    ├─ name/description contains: agent|agentic|autonomous|mcp|tool-use|llm|
    │                             ai-powered|multi-agent|workflow|coding-assistant
    └─ passes → enrich  |  fails → skip (log, not delete)
                │
                ▼
         Targeted fetch
         ├─ GitHub README + package.json/setup.py/requirements.txt
         ├─ Homepage (if different from GitHub)
         └─ Docs URL (if extractable from README)
                │
                ▼
         LLM enrichment call (Haiku — cheap)
         Input: name, description, README excerpt (first 4000 chars)
         Output: agent_type, capabilities[], boolean flags, deployment_model,
                 pricing_model, authentication, classification confidence
                │
                ▼
         Deterministic flag overrides
         ├─ shell_enabled: grep for subprocess|os.system|bash|sh in code
         ├─ filesystem_enabled: grep for os.path|open(|readFile|writeFile
         ├─ mcp_enabled: grep for @modelcontextprotocol|mcp-server|MCPServer
         ├─ code_execution_enabled: grep for exec(|eval(|subprocess
         └─ credential_access_enabled: grep for keyring|secrets|vault|.env
                │
                ▼
         Threat surface mapping (deterministic rules from boolean flags)
                │
                ▼
         Write to agent_tool_classifications + agent_tool_attack_surfaces
```

**Cost estimate per tool:**
- GitHub README fetch: free
- Haiku enrichment call: ~2k tokens input, ~500 output = ~$0.0004/tool
- 1,000 tools enriched: ~$0.40 total

---

## 7. Classification LLM call

Single Haiku call per tool. Schema:

```json
{
  "agent_type": "framework|coding_agent|browser_agent|research_agent|workflow|mcp_server|mcp_registry|multi_agent|memory|evaluation|security|tooling_infra|unknown",
  "tool_category": "<from taxonomy §4>",
  "tool_subcategory": "<free text>",
  "deployment_model": "cloud|self_hosted|hybrid|desktop",
  "pricing_model": "open_source|freemium|paid|enterprise",
  "capabilities": ["<named capability list>"],
  "tools_used": ["<external tools/APIs this agent calls>"],
  "authentication": "oauth|api_key|none|saml|unknown",
  "mcp_enabled": true,
  "multi_agent": false,
  "memory_enabled": false,
  "tool_use_enabled": true,
  "browser_enabled": false,
  "filesystem_enabled": false,
  "shell_enabled": false,
  "code_execution_enabled": false,
  "autonomous_execution_enabled": false,
  "credential_access_enabled": false,
  "email_enabled": false,
  "slack_enabled": false,
  "github_enabled": false,
  "deploy_enabled": false,
  "classification_confidence": "high|medium|low",
  "classification_reasoning": "<one sentence>"
}
```

Deterministic flag overrides (grep-based) run after and can only **set** a flag
to `true`, never to `false` — if the LLM missed it, the grep catches it.

---

## 8. Trend detection (Phase 6)

Weekly scheduled job (`scripts/buildToolTrendSnapshot.js`):

1. Count tools per capability flag → write `agent_tool_snapshots` row.
2. Compare with previous week: if a capability count grew ≥50% week-over-week
   AND absolute count ≥5, emit a `capability_surge` signal.
3. Find tools where star growth in last 7 days > 2× median → emit `new_tool`
   or `fastest_growing` signal if tool is new to corpus.
4. Detect new attack surfaces: if a new tool has `shell_enabled=true` +
   `autonomous_execution_enabled=true` + `credential_access_enabled=true` →
   emit `new_attack_surface` signal at risk level `high`.

Example signal output:
```json
{
  "signal_type": "capability_surge",
  "title": "MCP-enabled tools grew 4× in 30 days",
  "evidence": { "metric": "mcp_enabled_count", "before": 12, "after": 48, "period_days": 30 },
  "horizon_category": "agentic_ai_threats",
  "threat_tags": ["ASI02_tool_misuse_exploitation", "ASI04_agentic_supply_chain_vulnerabilities"]
}
```

---

## 9. Horizon scan integration (Phase 7)

`agent_tool_signals` rows are ingested by `runSynthesisOnly.js` as a supplementary
evidence stream alongside `sources`. The synthesis prompt already accepts
`corpus_summary` context — tool signals extend this with an `agentic_tooling_context`
block:

```
Agentic tooling context (from tool discovery, last 30 days):
  Total tracked tools: 847  (+43 new)
  MCP-enabled tools:   123  (+31 vs last month)
  Shell-access tools:   67  (+12 vs last month)
  Fastest growing:     Browser Use (+4,200 stars), Stagehand (+1,800 stars)
  New attack surfaces detected: 3 tools with autonomous + shell + credential flags
  Signals: "MCP registry ecosystem fragmented across 4 competing registries"
```

This turns quantitative ecosystem data into synthesis context — so "MCP adoption
growing rapidly" becomes a horizon claim grounded in real ecosystem numbers, not
a paper citation.

---

## 10. Dashboard integration (Phase 8)

New top-level nav item: **Tooling** (between Landscape and Ask Agent).

Four sub-pages:

### Tooling Overview
- Total tools tracked | new this month | enrichment coverage %
- Category donut chart (frameworks / coding agents / browser / MCP / workflow / other)
- Top 10 by star growth this month
- Capability heatmap (which flags are most common across the ecosystem)

### Capabilities
- Bar chart: count of tools with each boolean capability flag
- Trend lines: capability growth over time (the MCP surge example)
- Filterable list: "show all tools where shell_enabled=true AND autonomous=true"

### Threat Surfaces
- Surface distribution across tracked tools
- Risk matrix: capability combination → attack surface → threat tags
- Newest high-risk tools (first seen in last 30 days, high risk profile)

### Tool Detail (`/tooling/:slug`)
- Name, description, links, category, agent_type
- Capability chip list
- Attack surfaces with threat vector links to taxonomy
- Star/download trend sparkline
- Signals this tool contributed to

---

## 11. Implementation phases

### Phase A — Schema + GitHub connector (3–4 days)
- Supabase migration: 6 tables above
- `lib/discovery/toolDiscovery/connectors/githubConnector.js`
  - GitHub Search API: repos by topic (`ai-agent`, `mcp-server`, `llm-agent`)
  - Normalises to the discovery output shape
  - Stores to `agent_tools` + `agent_tool_metrics`
- `scripts/discoverAgentTools.js` — orchestrator (discovery → relevance gate)
- Basic dedup by `github_url` / `slug`
- **No LLM yet.** Proves the connector and schema before spending money.
- Expected yield: ~300–500 tools in first run

### Phase B — Enrichment + classification (3–4 days)
- README fetcher (reuse `fetchPageText` from the source pipeline)
- `lib/discovery/toolDiscovery/enrichTool.js` — LLM Haiku call
- Deterministic grep-based flag overrides
- `scripts/enrichAgentTools.js` — processes `enrichment_status=pending` rows
- Threat surface mapping (deterministic rules from boolean flags)
- **Cost:** ~$0.40 per 1,000 tools

### Phase C — Tier-2 connectors (2–3 days)
- PyPI + npm connectors (JSON API, no scraping)
- Hugging Face connector (Hub API)
- MCP registry connector (mcp.so JSON API if available, else structured fetch)
- **No new enrichment cost** — same pipeline

### Phase D — Trend tracking + signals (2 days)
- `scripts/buildToolTrendSnapshot.js` — weekly job
- Signal emission logic
- Add to GitHub Actions cron (weekly, Sunday midnight UTC)

### Phase E — Horizon scan integration (1–2 days)
- Pass `agent_tool_signals` to `runSynthesisOnly.js` as context
- Update synthesis prompt to accept `agentic_tooling_context`
- Update `buildCorpusSummary` to include tool-signal counts

### Phase F — Dashboard (3–5 days)
- New Supabase queries / `api/tooling.js` endpoint
- React pages: Overview, Capabilities, Threat Surfaces, Tool Detail
- ECharts charts (consistent with existing dashboard)

**Total: ~14–18 engineering days** for a complete, production pipeline.
Quick-win milestone: Phase A + B alone (6–8 days) gives a queryable tool
database with capability flags and threat surfaces — useful before the
dashboard exists.

---

## 12. Expected volume and costs

| Source | Initial yield | Weekly new | Enrichment cost |
|---|---:|---:|---:|
| GitHub (Tier 1) | 400–600 | 30–50 | ~$0.20/week |
| PyPI + npm | 100–200 | 10–20 | ~$0.06/week |
| Hugging Face | 50–100 | 5–10 | ~$0.02/week |
| Docker Hub | 20–40 | 2–5 | ~$0.01/week |
| MCP registries | 50–150 | 10–30 | ~$0.04/week |
| **Total** | **620–1,090** | **57–115** | **~$0.33/week** |

Trend snapshots: deterministic, no LLM cost.
Signal emission: deterministic rules, no LLM cost.
Dashboard API: read-only DB queries, no LLM cost.

**LLM cost is dominated by enrichment: ~$0.33/week ongoing after seed run.**

---

## 13. What this does NOT do

- No crawling arbitrary websites
- No recursive link-following
- No LLM on every discovered page (only on tools that pass the relevance gate)
- No bulk Tavily/SerpAPI queries for tools (registry APIs are free and structured)
- No storing unstructured text blobs — all output is structured schema rows
- No running enrichment on tools that fail the relevance gate

---

## 14. Open questions before implementation

1. **Supabase table limit:** do we have headroom for 6 new tables, or should
   some be merged (e.g. metrics + snapshots into one time-series table)?
2. **MCP registry API availability:** `mcp.so` and `smithery.ai` don't currently
   expose a public JSON API — this connector may need a targeted fetch + parse
   approach rather than a clean API call.
3. **GitHub rate limits:** the Search API allows 30 requests/min authenticated.
   At ~10 tools/request (10 results per page), that's 300 tools/min — fine for
   initial seed, but the connector needs exponential backoff.
4. **Dashboard nav slot:** the Vercel Hobby plan caps at 12 serverless functions.
   `api/tooling.js` would be the 13th unless we consolidate an existing endpoint.
   Options: merge `api/evidence.js` into `api/sources.js`, or upgrade the plan.
5. **Classification versioning:** when the Haiku prompt improves (v2), how do we
   re-classify existing tools? Proposed: add `classification_version` column (done
   above) and re-run `enrichAgentTools.js --reclassify` on the `v1` rows.
