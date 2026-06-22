# Agentic Security Testing Tools — Architecture

> **Status:** Design. Not yet implemented.
> **Date:** 2026-06-22
> **Separation:** This is a third standalone system. It shares no tables with:
> - The horizon-scanning evidence pipeline (`sources`, `snapshots`)
> - The general agentic tooling intelligence system (`atool_*`)
>
> **What this tracks:** tools, frameworks, benchmarks, and agents built
> *specifically* for security testing, red teaming, vulnerability discovery,
> safety evaluation, and offensive/defensive AI security research.
>
> **What this does NOT track:** generic chatbots, productivity agents,
> workflow automation tools, general coding assistants, or any tool without
> explicit security-testing scope.

---

## 1. Scope boundary

The single qualifying question for inclusion is:

> **"Is this tool's primary or documented secondary purpose to test,
> evaluate, attack, or defend AI systems / traditional systems using AI?"**

### In scope
| Category | Example tools |
|---|---|
| AI pentesting agents | PentestGPT, HackingBuddy, ReaperAI, AutoPT |
| AI vulnerability discovery | LLM-based fuzzing agents, AI-augmented bug-bounty tools |
| AI red teaming | Microsoft PyRIT, Nvidia Garak, RedAgent |
| Prompt injection / jailbreak testing | LLM-attacks (GCG), PromptBench, HarmBench, PAIR |
| LLM safety evaluation | Inspect AI, HELM, LM-Eval-Harness, SafetyBench |
| Agent security testing | AgentDojo, AgentBench security suites, AttackBench |
| MCP / tool-use security | MCP security scanners, tool-poisoning PoCs |
| Code security agents | Semgrep AI, CodeQL + AI, AI-SAST frameworks |
| Attack simulation / purple teaming | AutoAttacker, AI-driven purple-team platforms |
| Agent observability / sandboxing | Invariant, LLM Guard, Rebuff, Guardrails AI |

### Out of scope (explicit exclusions)
- Generic AI coding assistants (Cursor, GitHub Copilot) — unless they have a documented security-testing mode
- General productivity agents (n8n AI, Flowise) — unless explicitly used for attack simulation
- General LLM evaluation (general MMLU, HumanEval) — unless security-targeted
- AI research papers without a released tool or framework
- Commercial SaaS with no evaluable code, docs, or paper

---

## 2. Architecture overview

```
DISCOVERY                     VALIDATION            INTELLIGENCE
───────────────────────────   ──────────────────    ─────────────────────────
Tier 1 (structured):          Validation gate       Classification (LLM)
  GitHub Search API    ──►    ├─ security keyword   Capability extraction
  arXiv API            ──►    │  match required      Adoption tracking
  PyPI / npm JSON API  ──►    ├─ ≥1 confirmed URL   Trend snapshots
  Conference pages     ──►    └─ not a generic       Signal emission
                               chatbot/tool
Tier 2 (search/social):                             ──►  Dashboard
  SerpAPI / Tavily     ──►    Confirmation step      ──►  Horizon context
  Hacker News API      ──►    (GitHub/docs/paper)
  Reddit API           ──►
  Product Hunt

Social posts → candidate URLs → confirm → store
```

**Key principle:** social and search sources produce *candidate URLs only*.
A tool is not stored until a structured source (GitHub, PyPI, paper,
official docs) confirms it exists and has security-testing scope. One
LLM classification call runs after that confirmation, not before.

---

## 3. Database schema

One primary table (`ast_tools`) plus four supporting tables, all prefixed `ast_`
(Agentic Security Tools) to avoid collision.

### 3.1 `ast_tools` — canonical tool record

```sql
CREATE TABLE IF NOT EXISTS ast_tools (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT    NOT NULL,
  slug                TEXT    UNIQUE NOT NULL,
  description         TEXT,                           -- from actual fetched source
  description_source  TEXT,                           -- 'readme'|'paper_abstract'|'homepage'|'docs'
  homepage_url        TEXT,
  github_url          TEXT,
  docs_url            TEXT,
  paper_url           TEXT,                           -- arXiv or ACM/IEEE DOI
  package_url         TEXT,
  source_platform     TEXT    NOT NULL,               -- github|arxiv|pypi|npm|conference|manual
  publisher           TEXT,
  maintainer          TEXT,
  license             TEXT,
  open_source         BOOLEAN DEFAULT TRUE,

  -- Classification
  tool_category       TEXT    NOT NULL,               -- see §4
  tool_subcategory    TEXT,
  security_testing_type TEXT,                         -- more specific type within category

  -- Maturity
  maturity            TEXT    DEFAULT 'research',     -- research|prototype|open_source_tool|commercial_tool|widely_used
  confidence          TEXT    DEFAULT 'medium',       -- high|medium|low (in classification)

  -- Quality / validation
  url_verified        BOOLEAN DEFAULT FALSE,
  url_status          INT,
  validation_passed   BOOLEAN DEFAULT FALSE,          -- passed the security-scope validation gate
  validation_reason   TEXT,

  -- Enrichment state
  enrichment_status   TEXT    NOT NULL DEFAULT 'pending', -- pending|done|failed|no_content|skipped
  last_enriched_at    TIMESTAMPTZ,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 `ast_capabilities` — structured capability + agentic feature flags

```sql
CREATE TABLE IF NOT EXISTS ast_capabilities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id                UUID NOT NULL REFERENCES ast_tools(id) ON DELETE CASCADE,
  classified_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification_version TEXT NOT NULL DEFAULT 'v1',

  -- Target types (what the tool tests/attacks)
  targets_web            BOOLEAN DEFAULT FALSE,
  targets_api            BOOLEAN DEFAULT FALSE,
  targets_cloud          BOOLEAN DEFAULT FALSE,
  targets_code           BOOLEAN DEFAULT FALSE,
  targets_llm            BOOLEAN DEFAULT FALSE,
  targets_agent          BOOLEAN DEFAULT FALSE,
  targets_mcp            BOOLEAN DEFAULT FALSE,
  targets_browser        BOOLEAN DEFAULT FALSE,
  targets_network        BOOLEAN DEFAULT FALSE,
  targets_binary         BOOLEAN DEFAULT FALSE,

  -- Security testing capabilities
  cap_recon              BOOLEAN DEFAULT FALSE,
  cap_scanning           BOOLEAN DEFAULT FALSE,
  cap_vuln_discovery     BOOLEAN DEFAULT FALSE,
  cap_exploit_gen        BOOLEAN DEFAULT FALSE,
  cap_exploit_validation BOOLEAN DEFAULT FALSE,
  cap_fuzzing            BOOLEAN DEFAULT FALSE,
  cap_static_analysis    BOOLEAN DEFAULT FALSE,
  cap_dynamic_analysis   BOOLEAN DEFAULT FALSE,
  cap_prompt_injection   BOOLEAN DEFAULT FALSE,
  cap_jailbreak_testing  BOOLEAN DEFAULT FALSE,
  cap_guardrail_testing  BOOLEAN DEFAULT FALSE,
  cap_model_eval         BOOLEAN DEFAULT FALSE,
  cap_agent_eval         BOOLEAN DEFAULT FALSE,
  cap_report_generation  BOOLEAN DEFAULT FALSE,
  cap_patch_generation   BOOLEAN DEFAULT FALSE,
  cap_attack_simulation  BOOLEAN DEFAULT FALSE,

  -- Agentic features
  autonomous_planning    BOOLEAN DEFAULT FALSE,
  multi_step_execution   BOOLEAN DEFAULT FALSE,
  tool_use               BOOLEAN DEFAULT FALSE,
  browser_access         BOOLEAN DEFAULT FALSE,
  shell_access           BOOLEAN DEFAULT FALSE,
  filesystem_access      BOOLEAN DEFAULT FALSE,
  code_execution         BOOLEAN DEFAULT FALSE,
  memory                 BOOLEAN DEFAULT FALSE,
  multi_agent            BOOLEAN DEFAULT FALSE,
  mcp_enabled            BOOLEAN DEFAULT FALSE,
  human_in_the_loop      BOOLEAN DEFAULT FALSE,

  -- Free-text enrichment
  capabilities_list      TEXT[],                -- named capabilities from docs/README
  integrations           TEXT[],                -- named tools/APIs this integrates with
  classification_reasoning TEXT,
  classified_by          TEXT DEFAULT 'llm',

  UNIQUE (tool_id, classification_version)
);
```

### 3.3 `ast_adoption` — point-in-time adoption snapshots (append-only)

```sql
CREATE TABLE IF NOT EXISTS ast_adoption (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id           UUID  NOT NULL REFERENCES ast_tools(id) ON DELETE CASCADE,
  snapshot_date     DATE  NOT NULL,
  github_stars      INT,
  forks             INT,
  downloads         BIGINT,
  open_issues       INT,
  contributors      INT,
  citations         INT,                        -- from arXiv / Semantic Scholar
  last_release_date DATE,
  last_commit_date  DATE,
  raw_metadata      JSONB,
  UNIQUE (tool_id, snapshot_date)
);
```

### 3.4 `ast_snapshots` — weekly aggregate for trend tracking

```sql
CREATE TABLE IF NOT EXISTS ast_snapshots (
  id                        UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week             DATE  NOT NULL UNIQUE,
  total_tools               INT,
  new_tools_this_week       INT,
  validated_tools           INT,

  -- Category counts
  count_pentesting_agents   INT DEFAULT 0,
  count_vuln_discovery      INT DEFAULT 0,
  count_red_teaming         INT DEFAULT 0,
  count_prompt_injection    INT DEFAULT 0,
  count_safety_eval         INT DEFAULT 0,
  count_agent_security      INT DEFAULT 0,
  count_mcp_security        INT DEFAULT 0,
  count_code_security       INT DEFAULT 0,
  count_attack_simulation   INT DEFAULT 0,
  count_observability       INT DEFAULT 0,

  -- Capability flag counts
  count_exploit_gen         INT DEFAULT 0,
  count_prompt_injection_cap INT DEFAULT 0,
  count_agent_eval_cap      INT DEFAULT 0,
  count_shell_access        INT DEFAULT 0,
  count_autonomous_planning INT DEFAULT 0,

  by_maturity               JSONB,
  by_target_type            JSONB,
  fastest_growing           JSONB,              -- top 10 by star delta
  new_research_papers       JSONB               -- new arXiv-sourced tools

);
```

### 3.5 `ast_sources` — raw discovery candidates queue

```sql
CREATE TABLE IF NOT EXISTS ast_sources (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  origin          TEXT  NOT NULL,              -- github|arxiv|pypi|npm|search|hn|reddit|producthunt|conference|manual
  query           TEXT,
  candidate_url   TEXT  NOT NULL,
  candidate_name  TEXT,
  snippet         TEXT,
  status          TEXT  NOT NULL DEFAULT 'pending', -- pending|validated|rejected|duplicate
  rejection_reason TEXT,
  promoted_tool_id UUID REFERENCES ast_tools(id),
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Classification taxonomy

### Primary categories (`tool_category`)

| Value | Description | Key examples |
|---|---|---|
| `pentesting_agent` | Autonomous or semi-autonomous AI agent designed to conduct penetration testing end-to-end | PentestGPT, HackingBuddy, ReaperAI |
| `vuln_discovery` | AI/LLM-powered tools for discovering vulnerabilities (fuzzing, bug-finding, code scanning) | AI fuzzing agents, AI bug-bounty tools |
| `red_teaming` | Frameworks for adversarially testing LLMs, AI systems, or software at scale | Microsoft PyRIT, Nvidia Garak, RedAgent |
| `prompt_injection_testing` | Tools specifically for testing prompt injection, jailbreaks, and related LLM exploits | LLM-attacks (GCG), PAIR, Promptfoo security suite |
| `safety_evaluation` | Benchmarks and frameworks for evaluating LLM/agent safety and robustness | Inspect AI, HELM safety, LM-Eval, HarmBench, SafetyBench |
| `agent_security_testing` | Tools for testing the security of AI agents — goal hijacking, tool abuse, sandbox escapes | AgentDojo, AgentBench security, AttackBench |
| `mcp_security` | Scanners, testers, and PoC tools targeting MCP servers and tool-use attack surfaces | MCP Inspector, tool-poisoning PoCs |
| `code_security_agent` | AI-powered code security scanning, SAST, vulnerability review | Semgrep AI, CodeQL + AI wrappers |
| `attack_simulation` | AI-driven simulation of attacker behaviour for purple-team and adversary emulation | AutoAttacker, AI-driven purple-team platforms |
| `observability_guardrail` | Agent monitoring, sandboxing, guardrail testing, and AI content moderation evaluation | Invariant, LLM Guard, Rebuff, Guardrails AI |

### Maturity levels

| Value | Meaning |
|---|---|
| `research` | Academic paper only; no runnable code or demo |
| `prototype` | Code exists but limited docs/maintenance; PoC-grade |
| `open_source_tool` | Maintained open-source with docs, releases, and community use |
| `commercial_tool` | Commercial product or SaaS offering |
| `widely_used` | Widely adopted in industry red-team/security workflows |

---

## 5. Validation rules (the security-scope gate)

A candidate is accepted only when ALL of the following pass:

**V1 — Security scope keyword match (deterministic)**
At least one of these must appear in the tool name/description/topics/README:
```
penetration test | pentest | red team | vulnerability discover |
exploit | fuzzing | jailbreak | prompt injection | safety evaluation |
security scanner | guardrail | adversarial test | attack simulation |
security benchmark | CTF | capture the flag | bug bounty | SAST |
security audit | offensive security | purple team
```

**V2 — Confirmed URL (quality anchor)**
At least one URL must return HTTP 200:
`github_url` OR `paper_url` OR `homepage_url` OR `package_url`

**V3 — Not a generic tool (exclusion gate)**
Name/description must NOT match:
```
general chatbot | customer service bot | productivity | email assistant |
scheduling | CRM | writing assistant | code autocomplete
```
(unless the tool ALSO matches V1 in the same text — i.e. security testing *is* its purpose)

**V4 — Tool-level artefact (not just a mention)**
The candidate must be a tool/framework/benchmark, not just a paper describing a concept.
A GitHub repo, PyPI/npm package, runnable demo, or documented benchmark constitutes a tool.
A blog post mentioning "AI could be used for pentesting" does NOT.

---

## 6. Discovery connectors detail

### Tier 1 — Structured (highest precision, no LLM cost at discovery)

**GitHub Search API**
Primary search queries (security-scoped):
```
topic:ai-pentesting
topic:llm-security
topic:red-teaming
topic:prompt-injection
topic:jailbreak
"autonomous pentesting" language:python stars:>5
"AI red teaming" stars:>5
"LLM vulnerability" language:python
"agent security" "security testing"
"llm fuzzing" OR "AI fuzzing"
site-specific: garak, pyrit, harmBench, promptBench, lm-evaluation-harness
```

**arXiv API** (`export.arxiv.org/api/query`)
Query: `cat:cs.CR AND (ti:"LLM" OR ti:"AI agent" OR ti:"large language model") AND (ti:"security" OR ti:"attack" OR ti:"vulnerability" OR ti:"red team" OR ti:"adversarial")`
— Only pull papers that announce a tool/framework/benchmark, not pure theory.
Signal: look for "we release", "available at github.com", "open source" in abstract.

**PyPI JSON API** — seed packages:
`garak`, `pyrit`, `promptfoo` (npm), `llm-guard`, `rebuff`, `guardrails-ai`, `inspect-ai`

**npm registry** — seed packages:
`promptfoo`, `@promptfoo/promptfoo`, `llm-security`

**Security conference pages** (structured parse of tool/paper listings):
- Black Hat Arsenal (toolswatch.org API or scrape) — highest precision for released tools
- DEF CON CFP archive
- USENIX Security artifact appendices (papers with "available at" links)
- IEEE S&P and ACM CCS proceedings (arXiv shadow papers)
- AI safety conferences: NeurIPS SoLaR, ICLR safety track

### Tier 2 — Search discovery (lead-generation, not confirmation)

**SerpAPI / Tavily** (existing keys)
Run the query families from the spec. Store candidate URLs only.
Promotion to `ast_tools` requires V1–V4 validation after a GitHub/docs fetch.
Cost: ~$0.01/search, ~30 queries/run = ~$0.30/run.

**Hacker News Algolia API** (free)
Queries: `"pentesting agent"`, `"LLM red team"`, `"AI vulnerability"`, `"Garak"`, `"PyRIT"`, etc.
Extract linked URLs → add to `ast_sources` as candidates.

**Reddit API** (r/netsec, r/LLMSecurity, r/AIAlignment)
Search for tool announcements. Extract GitHub/package links as candidates.

**Product Hunt**
`topics: security + artificial-intelligence`. Low volume, moderate precision.

### Tier 3 — Not recommended for automated pipeline

**Twitter/X**: expensive API + noisy. Manual monitoring only; feed candidate URLs by hand.
**General AI newsletters**: too broad; the security-scope filter would reject >90%.

---

## 7. Enrichment flow

```
1. Fetch README (GitHub raw API)
   └─ If < 200 chars → enrichment_status = 'no_content'; no LLM

2. Fetch paper abstract (arXiv API if paper_url set)
   └─ Provides maturity signal (research vs tool)

3. Security-scope re-validation on fetched content
   └─ V1 keyword check on README + abstract
   └─ If fails → enrichment_status = 'skipped_irrelevant'

4. Single Haiku LLM call (on README excerpt, ≤4k chars)
   Input: name, platform, README excerpt, paper abstract
   Output: tool_category, security_testing_type, maturity, target_types[],
           capabilities[], agentic_features{}, confidence, reasoning
   Rule: LLM ONLY sees fetched content. description must be from README.

5. Deterministic grep overrides on README + source
   (same pattern as enricher.js — can only SET flags to true)

6. Fetch adoption metrics:
   GitHub: stars, forks, last_commit, contributors
   PyPI: downloads (via pypistats.org)
   arXiv: citation count (via Semantic Scholar API — free)

7. Persist ast_capabilities + ast_adoption rows
8. Set enrichment_status = 'done'
```

---

## 8. Threat-surface context for horizon scans

Tool records inform the horizon scan in two ways. Both are context — not
direct evidence for operational claims.

**Allowed horizon-scan context:**
> "MCP security tools are growing as a category — 12 new scanners released
> this quarter, suggesting the MCP attack surface is being operationalised."

**Not allowed (mixing tool growth with threat evidence):**
> "MCP attacks are increasing" — based solely on tool growth.

The bridge: `ast_snapshots` rows are optionally passed as
`tooling_security_context` in `runSynthesisOnly.js` for the
`agentic_ai_threats` category synthesis. The synthesis LLM uses this as
supporting context (ecosystem maturity signal), not as evidence of incidents.

---

## 9. Dashboard pages

**Overview** (`/tools/security`)
- Total confirmed tools | new this month | validated vs pending
- Category donut chart
- Fastest-growing by star delta (last 30 days)
- New research papers with released code (arXiv-sourced tools)

**Tool Table** (`/tools/security/list`)
Filterable/sortable grid:
- Name (link to detail) | Category | Maturity | Target types | Stars | Last commit

**Capability View** (`/tools/security/capabilities`)
- Bar chart: count of tools per security-testing capability
- Agentic features distribution (how many have shell access, autonomous planning, etc.)
- Filter: "show tools with exploit_gen=true AND shell_access=true"

**Trend View** (`/tools/security/trends`)
- Line chart: new tools per week by category
- Capability growth over time
- New research tools (arXiv papers with released code) vs production tools

**Tool Detail** (`/tools/security/:slug`)
- Description (source-attributed: "from README" / "from paper abstract")
- All URLs with verification status
- Category, maturity, confidence
- Target types and security-testing capabilities (chips)
- Agentic features (chips)
- Adoption metrics + trend sparkline
- Classification reasoning (one sentence from LLM)

---

## 10. Key design decisions

**Security scope over volume.** This database should have 200 highly-relevant
tools rather than 2,000 marginal ones. Every tool passes V1–V4 validation.
Quality is enforced structurally, not post-hoc.

**arXiv is Tier 1 here (unlike the general tooling DB).** Security research
papers frequently precede code releases by weeks/months. Tracking papers
with "we release" language and a GitHub link gives early-signal on what
tools are coming. The general tooling DB doesn't do this.

**Conference discovery is uniquely valuable here.** Black Hat Arsenal is
the single highest-precision source for released security tools — everything
accepted there has been reviewed and demonstrated. DEF CON tool releases are
similarly high-signal. Neither source is available to the general tooling DB.

**Maturity field is essential.** A `research`-grade tool (academic PoC)
and a `widely_used` tool (Semgrep AI, Garak) require very different treatment
in horizon-scan context. Always distinguish them.

**Semantic Scholar for citation counts.** Free API (`api.semanticscholar.org`),
no key required for low volume. Citation count separates influential research
tools from obscure PoCs. Add this alongside GitHub stars.

---

## 11. Open questions before implementation

1. **Black Hat Arsenal API:** `toolswatch.org` hosts the Arsenal list but
   has no documented public API — may require scrape or manual CSV import.
   Confirm approach before Phase 4.

2. **arXiv tool-detection heuristic:** not all cs.CR papers release code.
   The "we release at github.com" abstract pattern works for ~30–40% of
   papers; the rest require fetching the paper PDF (expensive). Proposed:
   accept only papers with an explicit GitHub link in the abstract.

3. **Database slot:** `api/security-tools.js` would add a 13th Vercel
   function. Must consolidate an existing endpoint first (same issue as the
   general tooling DB). Plan alongside that.

4. **Deduplication with general tooling DB (`atool_*`):** some tools appear
   in both (e.g., Guardrails AI, Invariant). These are separate tables with
   separate slugs — no synchronisation needed, but a shared slug convention
   would help avoid confusion if they are ever joined for analysis.
