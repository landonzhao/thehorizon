# Agentic Tooling Intelligence — Implementation Plan

> **Date:** 2026-06-22
> **Companion:** `docs/AGENTIC_TOOLING_INTELLIGENCE.md` (architecture + schema)
> **Principle:** Ship something queryable in Phase 1 before building anything else.

---

## Quick evaluation: sources ranked

Before phases, a clear-eyed ranking of every source by signal quality vs.
maintenance cost. This drives sequencing.

| Source | Signal | Maintenance | API quality | Cost | Verdict |
|---|---|---|---|---|---|
| **GitHub Search API** | ★★★★★ | Low | Excellent REST, auth'd, 30 req/min | Free | **Start here** |
| **MCP registries (mcp.so, Smithery)** | ★★★★★ | Low | JSON API if available | Free | **Phase 1** |
| **Hugging Face Hub API** | ★★★★ | Low | Clean REST, no auth needed | Free | **Phase 2** |
| **PyPI JSON API** | ★★★ | Low | Clean REST | Free | **Phase 2** |
| **npm registry** | ★★★ | Low | Clean REST | Free | **Phase 2** |
| **VS Code Marketplace API** | ★★★★ | Low | REST, undocumented but stable | Free | **Phase 2** |
| **Docker Hub search** | ★★ | Low | Simple REST | Free | **Phase 2** |
| **Hacker News Algolia API** | ★★★ | Low | Free, reliable | Free | **Phase 3** |
| **Product Hunt API** | ★★★ | Medium | Auth required, quota limited | Free tier | **Phase 4** |
| **SerpAPI / Tavily** | ★★★ | Medium | Already have keys | ~$0.01/query | **Phase 3** |
| **Twitter/X API** | ★★ | **High** | Expensive ($100+/month), unreliable | $100+/mo | **Avoid** |

**Twitter/X: do not implement.** The API costs are prohibitive for the signal quality, the
rate limits are aggressive, and the data is noisy. Hacker News captures the same
"new tool launch" signal for free and with better quality (technical audience,
links to primary sources).

---

## Phase 1 — GitHub + MCP registries

**Effort:** 4–5 days
**Expected tool volume:** 400–700 tools in first run, 30–50 new/week
**Expected value:** Immediately queryable tool database with category distribution and capability flags
**Maintenance burden:** Low — GitHub API is stable; weekly cron does the rest

### What to build

1. **Supabase migration** — 6 tables (`atool_tools`, `atool_metrics`, `atool_classifications`,
   `atool_attack_surfaces`, `atool_snapshots`, `atool_discovery_candidates`)

2. **`lib/tooling/connectors/githubConnector.js`**
   - Searches by 8 topics (`ai-agent`, `llm-agent`, `mcp-server`, `autonomous-agent`,
     `multi-agent`, `browser-agent`, `coding-agent`, `agent-framework`)
   - Filters: `stars:>5`, `pushed:>60 days ago`, `language:python OR typescript`
   - Output: normalised `atool_tools` row + `atool_metrics` snapshot
   - Dedup: upsert on `github_url`

3. **`lib/tooling/connectors/mcpRegistryConnector.js`**
   - `mcp.so`: attempt JSON API (`/api/servers`); fallback to structured page parse
   - `smithery.ai`: check for REST API; fallback to sitemap
   - `glama.ai`: JSON listing
   - These produce the highest-precision MCP tool records

4. **`lib/tooling/enricher.js`**
   - Relevance gate (deterministic keyword check)
   - GitHub README fetch (raw.githubusercontent.com)
   - Single Haiku call → classification JSON
   - Grep-based flag overrides
   - Threat surface mapping (rule table from §4 of architecture)
   - Writes `atool_classifications` + `atool_attack_surfaces`

5. **`scripts/discoverTools.js`**
   - Orchestrates: discovery connectors → relevance gate → enrichment queue
   - `--dry-run`, `--connector github|mcp|all`, `--limit N` flags

### APIs to use
- `api.github.com/search/repositories` — REST, needs `Authorization: token {PAT}`
- `mcp.so/api/*` — check availability on implementation; no key needed if public

### APIs to avoid
- GitHub GraphQL — overkill for simple search; REST is faster and simpler
- GitHub raw file scraping without the README endpoint — use `GET /repos/{owner}/{repo}/readme`

### Easiest wins in Phase 1
- GitHub topic search for `mcp-server` alone returns 200+ repos — instant MCP ecosystem map
- Capability flags for `mcp_enabled` are detectable by grep on the repo name/description alone
  (most MCP repos say "MCP" in the name) — high-confidence flag, no LLM needed

---

## Phase 2 — PyPI + npm + Hugging Face + Docker + VS Code

**Effort:** 3–4 days
**Expected additional volume:** 150–300 tools
**Expected value:** Package ecosystem coverage — agent libraries distributed via pip/npm
**Maintenance burden:** Low — all have clean JSON APIs

### What to build

1. **`lib/tooling/connectors/pypiConnector.js`**
   - Seed from GitHub repos already in `atool_tools` (follow PyPI links from README)
   - Direct search: `pypi.org/search/?q=ai-agent&format=json`
   - Metadata: `pypi.org/pypi/{name}/json` — description, homepage, downloads via
     `pypistats.org/api/packages/{name}/recent`

2. **`lib/tooling/connectors/npmConnector.js`**
   - `registry.npmjs.org/-/v1/search?text=ai-agent+mcp&size=100`
   - Weekly download stats: `api.npmjs.org/downloads/point/last-month/{name}`

3. **`lib/tooling/connectors/huggingfaceConnector.js`**
   - `huggingface.co/api/models?filter=agent&sort=downloads&limit=100`
   - `huggingface.co/api/spaces?filter=agent` (deployed demos)
   - No API key required

4. **`lib/tooling/connectors/dockerConnector.js`**
   - `hub.docker.com/v2/search/repositories/?query=ai-agent&page_size=100`
   - Low volume — mostly confirms tools already found via GitHub

5. **`lib/tooling/connectors/vscodeConnector.js`**
   - `marketplace.visualstudio.com/_apis/public/gallery/extensionquery` (POST)
   - Filter category: `AI` + tags containing `agent`, `mcp`, `copilot`
   - Installs count is a valuable adoption signal for coding agents specifically

### APIs to use
- `pypi.org/pypi/{name}/json` — free, no auth, highly reliable
- `pypistats.org/api/packages/{name}/recent` — free download stats
- `registry.npmjs.org/-/v1/search` — free, no auth
- `huggingface.co/api/models` — free, no auth needed for public models

### APIs to avoid
- npm's legacy `/-/all` endpoint — returns the entire registry, too large
- Docker Hub private/authenticated endpoints — public search is sufficient

---

## Phase 3 — Search discovery + Hacker News

**Effort:** 2–3 days
**Expected additional volume:** 20–50 new tools/week (net after dedup with Tier 1)
**Expected value:** Catches tools not yet in structured registries — early-stage projects
**Maintenance burden:** Medium — queries need occasional refreshing

### What to build

1. **`lib/tooling/connectors/searchConnector.js`**
   - Uses existing SerpAPI key (already in `.env`)
   - Seed queries (run weekly, not daily):
     ```
     site:github.com "mcp server" -site:github.com/topics pushed:2026
     site:github.com "coding agent" new framework 2026
     site:github.com "browser agent" autonomous 2026
     site:pypi.org "ai agent" 2026
     site:npmjs.com "mcp" "agent" 2026
     ```
   - Output: `atool_discovery_candidates` rows (status=`pending`)
   - A lightweight daily job reviews candidates: if URL is a GitHub repo not yet in
     `atool_tools`, promote to `pending` enrichment; otherwise discard.

2. **`lib/tooling/connectors/hnConnector.js`**
   - `hn.algolia.com/api/v1/search?query=mcp+server+agent&tags=story&numericFilters=created_at_i>X`
   - Runs weekly; extracts linked GitHub/package URLs from top-voted stories
   - Adds linked URLs as candidates, not stories themselves

### APIs to use
- SerpAPI: already have key; cost ~$0.01/search, 20 queries/week = ~$0.80/month
- Hacker News Algolia: free, no auth, reliable

### APIs to avoid
- Tavily for this purpose: better suited for evidence discovery (full-text return);
  overkill for URL lead-generation where SerpAPI SERP metadata is sufficient
- Google Custom Search JSON API: free tier is only 100 queries/day; SerpAPI is better

---

## Phase 4 — Product Hunt

**Effort:** 1–2 days
**Expected volume:** 5–15 new tools/week
**Expected value:** Early-stage launches before GitHub stars accumulate; good for trend-detection
**Maintenance burden:** Medium — API key required, quota management

### What to build

1. **`lib/tooling/connectors/productHuntConnector.js`**
   - Product Hunt API v2 (GraphQL): `posts(topic: "artificial-intelligence", order: NEWEST)`
   - Filter: posts tagged `developer-tools`, `ai`, `productivity` with AI agent keywords in tagline
   - Output: candidates → promote if they link to a GitHub repo or package page

### Note on Twitter/X
Do not implement. The signal/cost ratio is poor:
- API access: $100–$5,000/month depending on tier
- Data quality: noisy, high volume of hype/marketing
- Coverage: everything worth tracking on Twitter surfaces on HN or Product Hunt within days
- Recommendation: monitor Twitter manually for notable launches; feed into candidates queue by hand

---

## Phase 5 — Dashboard + trend tracking

**Effort:** 4–6 days
**Expected value:** Makes the entire system visible; enables the horizon-scan integration
**Maintenance burden:** Low after initial build — read-only queries + scheduled aggregation

### What to build

1. **`scripts/buildToolSnapshot.js`** — weekly cron
   - Aggregates capability counts from `atool_classifications`
   - Computes star/download deltas from `atool_metrics`
   - Writes `atool_snapshots` row
   - Emits signals (capability_surge, new_high_risk, fastest_growing)

2. **`api/tooling.js`** — new Vercel serverless endpoint
   - `GET /api/tooling?page=overview|categories|capabilities|trends`
   - `GET /api/tooling?slug={slug}` — tool detail
   - ⚠️ **Vercel Hobby limit:** currently at 12/12 serverless functions.
     Must consolidate one existing endpoint (e.g. merge `api/evidence.js` into
     `api/sources.js`) before adding this one.

3. **React pages** (in `/src/pages/ToolingPage.jsx`)
   - Overview / Categories / Capabilities / Trends / Tool detail
   - Reuse existing ECharts setup from dashboard

4. **Horizon scan integration** (optional, low-effort)
   - Pass latest `atool_snapshots` row as `tooling_context` to `runSynthesisOnly.js`
   - Synthesis prompt uses it as supporting context for `agentic_ai_threats` category

---

## Estimated costs

| Item | Cost |
|---|---|
| GitHub API | Free (with PAT) |
| PyPI / npm / HuggingFace / Docker | Free |
| VS Code Marketplace | Free |
| MCP registries | Free |
| Hacker News Algolia | Free |
| SerpAPI (Phase 3, ~20 searches/week) | ~$0.80/month |
| Product Hunt API | Free tier (500 req/day) |
| Haiku enrichment (~50 new tools/week) | ~$0.02/week ≈ **$1/month** |
| Weekly snapshot job | Free (no LLM) |
| **Total ongoing** | **~$2/month** |

Initial seed run (1,000 tools enriched): ~$0.40 one-time.

---

## Sequencing summary

```
Phase 1 (4–5d):   GitHub + MCP registries + enricher + migration
                  → queryable tool DB with 400–700 tools
                  → capability flags, threat surfaces
                  → highest value, lowest cost

Phase 2 (3–4d):   PyPI + npm + HuggingFace + Docker + VS Code
                  → +150–300 tools
                  → package ecosystem coverage
                  → all free APIs

Phase 3 (2–3d):   SerpAPI search + Hacker News
                  → +20–50 tools/week from pre-registry sources
                  → early signal detection

Phase 4 (1–2d):   Product Hunt
                  → +5–15 tools/week from launches
                  → medium maintenance

Phase 5 (4–6d):   Dashboard + trend tracking + horizon integration
                  → system visible and actionable
                  → requires resolving Vercel function slot
```

**Milestone after Phase 1:** a queryable `atool_tools` table with 400–700 tools,
capability flags, and a simple `node scripts/discoverTools.js` command. That alone
answers "what MCP servers exist?", "which tools have shell access?", "which tools
are growing fastest?" — before a single dashboard page is built.

---

## Risk and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| MCP registry has no public JSON API | Medium | Fallback to structured HTML parse; low volume so manageable manually |
| GitHub PAT rate limits | Low | 30 req/min is sufficient; add backoff |
| Vercel 12-function cap | **High** | Consolidate `api/evidence.js` before Phase 5 |
| LLM misclassifies agent_type | Medium | Grep overrides catch the most important flags; manual review for high-risk tools |
| Tool ecosystem moves too fast | Low | Weekly cron re-discovers; metrics snapshots capture growth regardless of classification lag |
| Twitter/X API costs spike | N/A | Not implemented — no exposure |
