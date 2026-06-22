# Agentic Tooling Intelligence — Architecture

> **Status:** Design. Not yet implemented.
> **Date:** 2026-06-22
> **Separation:** This is a standalone intelligence system. It does NOT share
> tables, pipelines, or storage with the horizon-scanning evidence pipeline.
> Horizon scanning tracks incidents/vulns/campaigns. Tooling intelligence tracks
> tools/frameworks/capabilities/adoption.

---

## 1. What this answers

| Question | Source |
|---|---|
| What agent tools exist? | Discovery → `agent_tools` |
| What capabilities are growing? | Trend snapshots → `tool_snapshots` |
| What ecosystems are emerging? | Category trends → `tool_snapshots.by_category` |
| What attack surfaces are expanding? | Threat mapping → `tool_attack_surfaces` |
| Which capabilities are becoming common? | Capability counts → `tool_snapshots` |
| Which tools are growing fastest? | Metrics deltas → `tool_metrics` |

---

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DISCOVERY LAYER  (lead-generation — not evidence)                       │
│                                                                           │
│  Tier 1: Structured registries        Tier 2: Search       Tier 3: Social│
│  ┌──────────────────────────┐         ┌─────────────┐      ┌───────────┐ │
│  │ GitHub Search API        │         │ SerpAPI /   │      │ HN Algolia│ │
│  │ PyPI JSON API            │         │ Tavily      │      │ Product   │ │
│  │ npm registry API         │         │             │      │ Hunt API  │ │
│  │ Hugging Face Hub API     │         └──────┬──────┘      └─────┬─────┘ │
│  │ Docker Hub API           │                │                   │        │
│  │ MCP registry JSON        │         discovery candidates       │        │
│  │ VS Code Marketplace API  │         (URL leads only)           │        │
│  └──────────┬───────────────┘                │                   │        │
│             │ structured metadata            │                   │        │
└─────────────┼───────────────────────────────┼───────────────────┼────────┘
              │                               │                   │
              ▼                               ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RELEVANCE GATE  (deterministic — no LLM)                                │
│  name/description/topics must contain: agent|mcp|autonomous|tool-use|    │
│  llm-agent|multi-agent|browser-agent|coding-agent|workflow|orchestrat   │
│  ─── passes gate ──► enrichment queue   ─── fails ──► discard           │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ENRICHMENT LAYER                                                         │
│  GitHub README + package manifest → extract structured fields             │
│  LLM (Haiku): agent_type, capabilities[], boolean flags, deployment_model │
│  Deterministic grep overrides: shell/fs/exec/mcp flags from source code  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CLASSIFICATION + CAPABILITY EXTRACTION + THREAT MAPPING                 │
│  (all deterministic from enrichment output — no second LLM call)         │
│  Category: agent_framework|coding_agent|browser_agent|mcp_server|…      │
│  Capabilities: boolean flags stored as structured columns                 │
│  Attack surfaces: rule-based map from capability flags → threat vectors  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TREND TRACKING  (weekly scheduled job — no LLM)                          │
│  Aggregate capability counts, category growth, fastest-growing tools     │
│  Emit signals when surge thresholds crossed                               │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DASHBOARD  (read-only API + React pages)                                 │
│  Overview / Categories / Capabilities / Trends / Tool detail             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database schema

All tables are in a dedicated Supabase schema or prefixed `atool_` to avoid
collision with the existing `sources` / `snapshots` tables.

### 3.1 `atool_tools` — canonical tool record

```sql
CREATE TABLE atool_tools (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name         TEXT    NOT NULL,
  slug              TEXT    UNIQUE NOT NULL,       -- kebab-case, stable identifier
  description       TEXT,
  homepage          TEXT,
  github_url        TEXT    UNIQUE,
  package_url       TEXT,                         -- PyPI/npm/HuggingFace page
  documentation_url TEXT,
  source_platform   TEXT    NOT NULL,             -- github|pypi|npm|huggingface|docker|mcp_registry|vscode|search|social
  publisher         TEXT,
  maintainer        TEXT,
  license           TEXT,
  open_source       BOOLEAN DEFAULT TRUE,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at  TIMESTAMPTZ,
  enrichment_status TEXT    NOT NULL DEFAULT 'pending', -- pending|done|failed|skipped
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 `atool_metrics` — point-in-time snapshots (append-only)

```sql
CREATE TABLE atool_metrics (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id          UUID  NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  snapshot_date    DATE  NOT NULL,
  stars            INT,
  forks            INT,
  downloads_total  BIGINT,
  downloads_recent BIGINT,                        -- last 30d where available
  open_issues      INT,
  contributors     INT,
  raw_metadata     JSONB,
  UNIQUE (tool_id, snapshot_date)
);
```

### 3.3 `atool_classifications` — enriched tool profile

```sql
CREATE TABLE atool_classifications (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id                     UUID    NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  classified_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification_version      TEXT    NOT NULL DEFAULT 'v1',
  -- Category
  tool_category               TEXT,               -- see §4
  tool_subcategory            TEXT,
  agent_type                  TEXT,               -- framework|coding_agent|browser_agent|research_agent|workflow|mcp_server|mcp_registry|multi_agent|memory|evaluation|security|tooling_infra
  deployment_model            TEXT,               -- cloud|self_hosted|hybrid|desktop
  pricing_model               TEXT,               -- open_source|freemium|paid|enterprise
  integrations                TEXT[],
  capabilities                TEXT[],             -- free-text capability list
  -- Boolean capability flags (structured — queryable)
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
  -- Classification metadata
  classification_confidence   TEXT    DEFAULT 'medium',
  classification_reasoning    TEXT,
  classified_by               TEXT    DEFAULT 'llm',
  UNIQUE (tool_id, classification_version)
);
```

### 3.4 `atool_attack_surfaces` — threat surface mapping

```sql
CREATE TABLE atool_attack_surfaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id         UUID NOT NULL REFERENCES atool_tools(id) ON DELETE CASCADE,
  attack_surface  TEXT NOT NULL,                  -- shell_access|filesystem_access|credential_access|browser_control|mcp_integration|code_execution|multi_agent_coordination|memory_persistence|external_api|deployment_automation
  threat_vector   TEXT,                           -- maps to horizon taxonomy tag
  risk_level      TEXT DEFAULT 'medium',          -- high|medium|low
  notes           TEXT,
  mapped_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 `atool_snapshots` — weekly aggregate for trend tracking

```sql
CREATE TABLE atool_snapshots (
  id                      UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week           DATE  NOT NULL UNIQUE,  -- Monday of the week
  total_tools             INT,
  new_tools_this_week     INT,
  -- Capability counts (derived — no LLM)
  mcp_enabled_count       INT,
  shell_access_count      INT,
  browser_access_count    INT,
  filesystem_access_count INT,
  code_execution_count    INT,
  credential_access_count INT,
  autonomous_exec_count   INT,
  multi_agent_count       INT,
  -- Breakdown by category and platform
  by_category             JSONB,
  by_platform             JSONB,
  fastest_growing         JSONB,                  -- top 10 by star delta
  new_high_risk_tools     JSONB                   -- new tools with ≥3 high-risk capability flags
);
```

### 3.6 `atool_discovery_candidates` — search/social leads queue

```sql
CREATE TABLE atool_discovery_candidates (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT  NOT NULL,                 -- search|hn|producthunt|twitter
  query           TEXT,
  result_url      TEXT  NOT NULL,
  title           TEXT,
  snippet         TEXT,
  rank            INT,
  platform        TEXT,
  posted_at       TIMESTAMPTZ,
  candidate_tool  TEXT,
  status          TEXT  NOT NULL DEFAULT 'pending', -- pending|promoted|discarded
  promoted_tool_id UUID REFERENCES atool_tools(id),
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Tool taxonomy

### tool_category values

| Value | Description | Examples |
|---|---|---|
| `agent_framework` | Orchestration/composition layer | LangGraph, CrewAI, AutoGen, Pydantic AI, Haystack |
| `coding_agent` | Autonomously writes/modifies code | OpenHands, Claude Code, Cursor Agent, Aider, Devin |
| `browser_agent` | Controls a browser | Browser Use, Stagehand, OpenOperator, Playwright MCP |
| `research_agent` | Searches, reads, synthesises | Deep Research, Open Deep Research, Perplexity |
| `workflow_agent` | Visual/low-code agent builders | n8n AI, Flowise, Dify, LangFlow |
| `mcp_server` | Exposes a capability via MCP | GitHub MCP, Slack MCP, filesystem MCP, Brave Search MCP |
| `mcp_registry` | Lists/discovers MCP servers | mcp.so, Smithery, Glama |
| `multi_agent_system` | Coordinates multiple agents | MetaGPT, OpenAI Swarm, AgentTorch |
| `memory_system` | Agent memory / state persistence | Mem0, Letta, MemGPT, Zep |
| `evaluation_tool` | Tests/benchmarks agent behaviour | Promptfoo, Inspect AI, HELM, PromptBench |
| `security_tool` | Guards/monitors agents | Invariant, LLM Guard, Rebuff, Guardrails AI |
| `tooling_infra` | Routing, observability, gateways | LiteLLM, LangSmith, Portkey, Helicone |

### Capability flags → attack surfaces (deterministic mapping)

| Capability flag | Attack surface | Risk | Horizon threat tag |
|---|---|---|---|
| `shell_access` | Unexpected code execution | **High** | ASI05 |
| `filesystem_access` | Data exfiltration / file tampering | **High** | ASI05 |
| `credential_access` | Identity abuse, lateral movement | **High** | ASI03 |
| `browser_access` | Session hijacking, web exfiltration | **High** | ASI02 |
| `mcp_enabled` | Supply-chain compromise, tool poisoning | **High** | ASI04 |
| `code_execution` | Sandbox escape, malware deployment | **High** | ASI05 |
| `autonomous_execution` | Uncontrolled agent action | **High** | ASI01 |
| `multi_agent` | Cascading failures, agent confusion | Medium | ASI01 |
| `memory_enabled` | Memory poisoning, context injection | Medium | ASI06 |
| `api_access` | SSRF, third-party data leakage | Medium | ASI02 |
| `deploy_enabled` | Infrastructure compromise | **High** | ASI05 |
| `email_access` | Social engineering amplification | Medium | AE02 |
| `slack_access` | Internal comms exfiltration | Medium | AE02 |

---

## 5. Discovery layer detail

### Tier 1 — Structured registries (primary, no LLM)

**GitHub Search API** (`api.github.com/search/repositories`)
- Topics: `ai-agent`, `llm-agent`, `mcp-server`, `autonomous-agent`, `multi-agent`, `browser-agent`, `coding-agent`, `agent-framework`
- Filters: `language:python OR language:typescript`, `stars:>10`, `pushed:>30 days ago`
- Rate limit: 30 req/min authenticated → ~300 repos/min
- Metadata collected: name, description, homepage, topics, stars, forks, open_issues, license, created_at, updated_at, language

**PyPI JSON API** (`pypi.org/pypi/{name}/json`)
- Seed from GitHub repos (extract `install_requires` + PyPI links from README)
- Direct search: `pypi.org/search/?q=ai-agent&c=Framework+%3A%3A+...`
- Metadata: version, summary, author, homepage, project_urls, downloads (BigQuery public dataset)

**npm registry** (`registry.npmjs.org/{name}`)
- Seed from GitHub + keyword search API
- Metadata: description, homepage, repository, keywords, weekly_downloads

**Hugging Face Hub API** (`huggingface.co/api/models`)
- Filter: `library=langchain OR transformers`, `tags=agent OR tool-use OR mcp`
- Spaces API: `huggingface.co/api/spaces` for deployed demos
- Metadata: modelId, author, tags, downloads, likes, lastModified

**Docker Hub** (`hub.docker.com/v2/search/repositories/`)
- Query: `ai-agent`, `mcp-server`, `autonomous-agent`
- Metadata: name, description, pull_count, star_count, last_updated

**MCP registries**
- `mcp.so` — check for public JSON API; fallback to structured page parse
- `smithery.ai/api` — REST API where available
- `glama.ai` — JSON listing if exposed
- These are the highest-signal Tier 1 sources for MCP ecosystem tracking

**VS Code Marketplace** (`marketplace.visualstudio.com/_apis/public/gallery/extensionquery`)
- Query for extensions with tags: `ai-agent`, `copilot`, `mcp`, `coding-assistant`
- Metadata: displayName, publisher, installs, ratings, lastUpdated

### Tier 2 — Search discovery (lead-generation)

Uses SerpAPI (existing key) or Tavily (existing key) — no new credential needed.

**Seed queries:**
```
site:github.com "MCP server" new 2026
site:github.com "agent framework" OR "coding agent" stars:>50
site:pypi.org "ai agent" OR "mcp server"
site:npmjs.com "browser agent" OR "workflow agent"
"new agent tool" OR "new MCP server" 2026 site:news.ycombinator.com
```

Output stored in `atool_discovery_candidates` (status=`pending`). A human or
lightweight rule reviews candidates before promoting to `atool_tools`. Social
posts are discovery signals only — never stored as tools directly.

### Tier 3 — Social signals (low-priority, opt-in)

**Hacker News** (`hn.algolia.com/api/v1/search`)
- Query: `"MCP server" OR "agent framework" OR "coding agent"`, last 7 days
- Store post URL + linked URLs as candidates, not as tools
- Workflow: HN post → extract linked GitHub URL → add to Tier 1 enrichment queue

**Product Hunt** (`api.producthunt.com`)
- Topic: `artificial-intelligence`, tag: `developer-tools`
- New launches daily — low volume, high precision

**Twitter/X** — **not recommended** for automated discovery
- API access now expensive and unreliable
- Use manually when a notable tool launch is spotted; feed directly into candidates queue

---

## 6. Enrichment flow

Runs per-tool, after relevance gate passes.

```
1. Fetch GitHub README (raw.githubusercontent.com)
   └─ Extract: description, features list, install instructions, integration list

2. Fetch package manifest (package.json / setup.py / pyproject.toml)
   └─ Extract: dependencies, keywords, entry_points

3. Single LLM call (Haiku, ~2k tokens input / ~500 output)
   Input:  tool_name, description, README excerpt (first 4000 chars), topics
   Output: agent_type, tool_category, capabilities[], boolean flags,
           deployment_model, pricing_model, integrations[], confidence

4. Deterministic grep overrides (run on README + source files if accessible)
   These can only SET flags to true, never to false:
   shell_access:        /subprocess|os\.system|child_process|\.sh|bash -c/
   filesystem_access:   /open\(|fs\.read|readFileSync|os\.path|pathlib/
   code_execution:      /exec\(|eval\(|subprocess\.run|Runtime\.getRuntime/
   mcp_enabled:         /@modelcontextprotocol|MCPServer|mcp-server|FastMCP/
   credential_access:   /keyring|secrets\.get|vault|\.env|os\.environ.*KEY/
   browser_access:      /playwright|puppeteer|selenium|browser-use|Stagehand/
   autonomous_execution:/while True|loop.*agent|run_until|autonomous|no-human/
   multi_agent:         /CrewAI|AutoGen|swarm|multi.agent|agent.*communicate/

5. Write atool_classifications row
6. Map capabilities → attack surfaces (deterministic rules §4)
7. Write atool_attack_surfaces rows
8. Set enrichment_status = 'done', last_enriched_at = NOW()
```

**Cost:** ~$0.0004/tool (Haiku). 1,000 tools ≈ $0.40.

---

## 7. Trend tracking

Weekly scheduled job. Fully deterministic — zero LLM cost.

```
1. Aggregate capability counts across all classified tools
2. Compare with previous week snapshot
3. Compute star/download deltas per tool
4. Write atool_snapshots row
5. Signal emission rules:
   - capability_surge: count grew ≥50% week-over-week AND absolute ≥5
   - new_high_risk: new tool with ≥3 high-risk capability flags
   - ecosystem_shift: a category grew ≥30% month-over-month
   - fastest_growing: any tool gained ≥500 stars in 7 days
```

Example signal:
```json
{
  "type": "capability_surge",
  "metric": "mcp_enabled_count",
  "before": 12,
  "after": 48,
  "period_days": 30,
  "horizon_category": "agentic_ai_threats",
  "threat_tags": ["ASI04_agentic_supply_chain_vulnerabilities"]
}
```

---

## 8. Dashboard pages

**Overview** — `/tooling`
- Total tools | new this month | enriched %
- Category donut (agent_framework / coding_agent / browser_agent / mcp_server / workflow / other)
- Capability heatmap (which flags are most widespread)
- Top 10 fastest-growing (star delta, last 30 days)

**Categories** — `/tooling/categories`
- Bar chart per category, sorted by total count
- Click → filtered tool list

**Capabilities** — `/tooling/capabilities`
- Bar chart: count of tools per capability flag
- Trend lines: capability growth over time (key chart for horizon signals)
- Filter: "show tools where shell_access AND autonomous_execution"

**Trends** — `/tooling/trends`
- Line chart: mcp_enabled / browser_access / shell_access counts over weekly snapshots
- Capability surge alerts (from atool_snapshots)

**Tool detail** — `/tooling/:slug`
- Name, description, links, category, agent_type, license, pricing
- Capability chip list (boolean flags, colour-coded by risk)
- Attack surfaces with threat vector links
- Star/download trend sparkline (last 12 weeks)
- Source platform badge

---

## 9. Key design decisions

**Separation from horizon-scanning pipeline:**
Tools are not sources. `atool_*` tables are completely independent of
`sources` / `snapshots`. The only bridge is optional: trend signals from
`atool_snapshots` can be passed as context to `runSynthesisOnly.js` when
generating agentic-category analysis — but this is additive context, not
stored in the evidence DB.

**Registry-first, LLM-last:**
The Tier 1 registries provide structured metadata for free. LLM enrichment
runs only on tools that pass the relevance gate. A tool that the GitHub
Search API returns but whose name/description contains nothing agent-related
never consumes an LLM call.

**Deterministic capability overrides:**
Grep-based flag setting is cheap, fast, and auditable. The LLM call provides
the initial classification; the grep pass adds flags the LLM may have missed
(especially for flags that require reading source code, not just README prose).

**Capabilities as columns, not text:**
The whole value of this system is queryability — "how many tools have
shell_access=true AND autonomous_execution=true?" That requires columns, not
a text blob. Every capability flag is a dedicated boolean column.
