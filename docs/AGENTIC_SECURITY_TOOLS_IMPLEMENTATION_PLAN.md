# Agentic Security Testing Tools — Implementation Plan

> **Date:** 2026-06-22
> **Companion:** `docs/AGENTIC_SECURITY_TOOLS_ARCHITECTURE.md`
> **Instruction:** Design only. Do not implement until approved.

---

## Source ranking

Before phases, a ranked assessment of every discovery source by
signal quality, precision, and engineering cost.

| Source | Precision | Volume | API quality | Cost | Verdict |
|---|---|---|---|---|---|
| **Black Hat Arsenal** | ★★★★★ | Medium (~200/yr) | No public API | Free | **Start here (Phase 4)** |
| **arXiv cs.CR** | ★★★★★ | High | Clean REST | Free | **Phase 1** |
| **GitHub Search API** | ★★★★ | High | Excellent | Free | **Phase 1** |
| **PyPI + npm** | ★★★ | Low (narrow domain) | Clean REST | Free | **Phase 2** |
| **Semantic Scholar** | ★★★★ | Pull-on-demand | REST, no auth | Free | **Phase 2** (citations) |
| **USENIX/IEEE/ACM proceedings** | ★★★★ | Medium | No API — scrape | Free | **Phase 4** |
| **Hacker News Algolia** | ★★★ | Low (filtered) | Free REST | Free | **Phase 3** |
| **SerpAPI / Tavily** | ★★★ | Medium | Existing keys | ~$0.30/run | **Phase 3** |
| **Reddit (r/netsec)** | ★★ | Low | OAuth required | Free tier | **Phase 5** |
| **Product Hunt** | ★★ | Low | Auth required | Free tier | **Phase 5** |
| **Twitter/X** | ★ | High (noisy) | $100+/month | Expensive | **Avoid** |

**Twitter/X is excluded.** The API cost is unjustifiable: $100+/month
for the Basic tier, which only allows reading tweets. Hacker News and
Reddit capture the same signal for free with better signal-to-noise.

**Black Hat Arsenal is the single highest-precision source** — every tool
there has been reviewed and live-demonstrated. It should anchor the
initial seed even if it requires manual import in Phase 4.

---

## Phase 1 — GitHub + arXiv (foundation)

**Effort:** 4–5 days
**Expected initial yield:** 150–250 validated tools
**Expected weekly new:** 10–20
**Value:** Builds the core validated database — the highest-signal half of the corpus
**Maintenance burden:** Low

### What to build

**Schema migration** — 5 tables (`ast_tools`, `ast_capabilities`, `ast_adoption`, `ast_snapshots`, `ast_sources`)

**`lib/securityTools/connectors/githubConnector.js`**
Security-scoped topic and keyword searches:
- Topics: `ai-pentesting`, `llm-security`, `red-teaming`, `prompt-injection`, `jailbreak`, `ai-security`, `llm-safety`, `ai-vulnerability`
- Keywords: `"autonomous pentesting"`, `"AI red team"`, `"LLM vulnerability scanner"`, `"agent security"`, `"LLM fuzzing"`, `"exploit generation AI"`
- Minimum stars: 3 (lower than general tooling — early-stage security research is valuable)
- Filter: repos pushed within last 90 days (active only)

**`lib/securityTools/connectors/arxivConnector.js`**
Different from the evidence pipeline's arXiv connector — this targets:
- Query: `cat:cs.CR AND (ti:"LLM" OR ti:"language model" OR ti:"AI agent") AND (ti:"attack" OR ti:"vulnerability" OR ti:"red team" OR ti:"adversarial" OR ti:"jailbreak" OR ti:"pentesting")`
- Filter: abstract must contain "github.com" OR "we release" OR "available at" OR "open source" — confirms a tool exists, not just theory
- Pull abstract + extract GitHub URL if present

**`lib/securityTools/validationGate.js`**
The security-scope gate (V1–V4 rules from §5 of architecture doc):
- V1: security keyword match on name + description + topics + README
- V2: ≥1 confirmed URL (HTTP 200)
- V3: not-generic exclusion check
- V4: tool-level artefact check (has runnable code / package / benchmark)

**`lib/securityTools/enricher.js`**
Adapted from the general tooling enricher:
- README fetch → security-scope re-validation → Haiku LLM call
- System prompt instructs: "this is a security testing tool database; classify security capability precisely; output null for fields not evidenced in the text"
- Grep overrides for security-specific flags (exploit_gen, fuzzing, prompt_injection, etc.)

**`scripts/discoverSecurityTools.js`** — orchestrator
**`scripts/enrichSecurityTools.js`** — enrichment runner

### Seed tools to prime the database (known high-confidence)

These should be included as manual seeds even before connectors run, to
validate the schema and classification system immediately:

| Tool | Category | Source |
|---|---|---|
| Garak (nvidia/garak) | red_teaming | GitHub |
| PyRIT (Azure/PyRIT) | red_teaming | GitHub |
| HarmBench | safety_evaluation | GitHub |
| PromptBench | safety_evaluation | GitHub |
| LLM-attacks (GCG) | prompt_injection_testing | GitHub |
| PAIR (jailbreaking) | prompt_injection_testing | GitHub |
| Promptfoo | safety_evaluation | GitHub |
| Inspect AI (UK AISI) | safety_evaluation | GitHub |
| LM-Evaluation-Harness | safety_evaluation | GitHub |
| HELM (Stanford) | safety_evaluation | GitHub |
| PentestGPT | pentesting_agent | GitHub |
| HackingBuddy | pentesting_agent | GitHub |
| AgentDojo (ETH Zurich) | agent_security_testing | GitHub |
| Invariant | observability_guardrail | GitHub |
| LLM Guard | observability_guardrail | GitHub + PyPI |
| Rebuff | observability_guardrail | GitHub |
| Guardrails AI | observability_guardrail | GitHub + PyPI |
| AutoAttacker | attack_simulation | GitHub / arXiv |
| Semgrep AI | code_security_agent | GitHub |

### APIs to use
- `api.github.com/search/repositories` — free with PAT
- `export.arxiv.org/api/query` — free, no auth
- `raw.githubusercontent.com/{owner}/{repo}/main/README.md` — free

### APIs to avoid
- GitHub GraphQL — simpler to use REST for search
- Full paper PDF fetch from arXiv — use abstract only (abstracts are free text in the API response)

---

## Phase 2 — PyPI + npm + Semantic Scholar citations

**Effort:** 2–3 days
**Expected additional volume:** 30–60 tools (security tooling on PyPI/npm is narrow)
**Expected weekly new:** 2–5
**Value:** Catches maintainability signal (package releases) + citation depth for research tools
**Maintenance burden:** Low

### What to build

**`lib/securityTools/connectors/pypiConnector.js`**
Seed package list (security-focused):
```
garak, pyrit, llm-guard, rebuff, guardrails-ai, inspect-ai,
llm-security, agentbench, promptbench, llm-attacks,
semgrep (for AI mode), bandit (for AI augmentation)
```
PyPI search for: `"security" "llm"`, `"red team" "ai"`, `"vulnerability" "agent"`

**`lib/securityTools/connectors/npmConnector.js`**
Seed: `promptfoo`, `@promptfoo/promptfoo`, `llm-security-scanner`

**Semantic Scholar citation enrichment** (add to enricher)
For tools with a `paper_url` (arXiv ID or DOI):
```
GET https://api.semanticscholar.org/graph/v1/paper/arXiv:{id}?fields=citationCount,influentialCitationCount
```
Free, no auth needed. Add `citations` to `ast_adoption` snapshot.
High citation count (>50) → upgrade `maturity` to `widely_used` if also has ≥100 stars.

### Cost
- All APIs free
- Extra enrichment LLM calls: ~$0.0004/tool × 50 = ~$0.02

---

## Phase 3 — Search discovery + Hacker News

**Effort:** 2 days
**Expected additional volume:** 5–15 new validated tools per run (most candidates fail V1–V4)
**Expected weekly new:** 2–5
**Value:** Catches tools not yet in GitHub topics or published on arXiv
**Maintenance burden:** Medium (queries need periodic refreshing)

### What to build

**`lib/securityTools/connectors/searchConnector.js`**
Uses existing SerpAPI key. Query families from the spec:
```
"autonomous pentesting agent" site:github.com
"AI red teaming framework" open source 2026
"LLM jailbreak testing" framework tool
"MCP security scanner" github
"agent security benchmark" 2026
"prompt injection testing tool" github
"LLM fuzzing" agent framework
```
Run weekly (not daily — search quota is finite). Store all result URLs as `ast_sources` candidates (status=`pending`). A nightly job promotes candidates that pass V1–V4 to `ast_tools`.

**`lib/securityTools/connectors/hnConnector.js`**
Algolia API. Queries: `"pentesting agent"`, `"LLM red team"`, `"AI vulnerability"`, `"Garak"`, `"PyRIT"`, `"jailbreak framework"`
Runs weekly. Extracts linked GitHub/paper URLs as candidates.

### Cost
- Hacker News: free
- SerpAPI: ~20 queries/run × $0.01 = **~$0.20/run, ~$0.80/month**

---

## Phase 4 — Conference + security blog discovery

**Effort:** 3–4 days
**Expected volume:** 50–150 high-confidence tools (one-time from historical conference data)
**Expected weekly new:** 5–10 (new conference releases)
**Value:** Black Hat Arsenal alone may be the single best source for confirmed released tools
**Maintenance burden:** Medium (conference schedule-dependent)

### What to build

**`lib/securityTools/connectors/conferenceConnector.js`**

**Black Hat Arsenal** (toolswatch.org)
- Historical data available at `toolswatch.org/blackhat-arsenal/` (scrape required)
- Filter: tools with "AI", "LLM", "agent", "machine learning", "neural", "GPT" in description
- Expected yield: 30–60 relevant tools from 2022–2026 Arsenal lists
- Note: may need user-agent rotation; confirm scrapeability first

**DEF CON CFP/tool archive**
- CFP submissions often include GitHub links
- Search `defcon.org` talks database for AI/LLM keywords

**USENIX Security / IEEE S&P / ACM CCS / NDSS**
- Use arXiv API as proxy: most USENIX/CCS/IEEE papers have arXiv shadow papers
- Filter arXiv cs.CR for papers whose title contains "tool" or "framework" or "benchmark" AND conference acceptance signals
- Supplement with Semantic Scholar venue filter: `venue:"USENIX Security" OR "IEEE S&P" OR "CCS" OR "NDSS"`

**Safety AI conferences** (new venues, high relevance)
- NeurIPS Workshop on Safety (papers with released code)
- ICLR safety track
- Pull from OpenReview API (`openreview.net/api2`) — has structured paper + code release metadata

### APIs
- Semantic Scholar venue filter: free REST API, no auth
- OpenReview: free REST API, no auth
- toolswatch.org: HTML scrape

---

## Phase 5 — Reddit + Product Hunt

**Effort:** 1–2 days
**Expected volume:** 3–8 new validated tools/month
**Expected weekly new:** 1–2
**Value:** Early-signal on tools before they reach GitHub stars threshold
**Maintenance burden:** Low (read-only, low frequency)

### What to build

**Reddit** (`oauth.reddit.com/r/netsec+LLMSecurity+AIAlignment/search.json`)
- OAuth app required (free, rate-limit: 60 req/min)
- Weekly query: `"AI pentesting"`, `"LLM red team"`, `"prompt injection tool"`
- Extract linked GitHub/package/paper URLs as `ast_sources` candidates

**Product Hunt**
- Topics: `security` + `artificial-intelligence`
- Extract tools with security keywords in tagline
- Product Hunt API (free tier: 500 req/day, OAuth required)

**Twitter/X — explicit decision: excluded**
- API cost: $100–$5,000/month depending on access tier
- The signal is available on HN and Reddit with better quality
- If a major tool launches on Twitter, it will appear on HN/Reddit within 24h

---

## Phase 6 — Dashboard + trend tracking

**Effort:** 4–5 days
**Value:** Makes the entire system actionable and visible
**Maintenance burden:** Low after build

### What to build

**`scripts/buildSecurityToolSnapshot.js`** — weekly cron
- Aggregate category counts, capability flag counts, maturity distribution
- Star/download deltas vs previous week
- Write `ast_snapshots` row
- Emit signals: growing category, new research tool with GitHub, high-citation new paper

**`api/security-tools.js`** — new Vercel endpoint
- ⚠️ **Vercel slot:** at 12/12 before this. Must consolidate first.
  Recommended: merge `api/evidence.js` into `api/sources.js` (backcompat via `?mode=evidence` param)
  This frees one slot for `api/security-tools.js`.

**React pages** in `src/pages/SecurityToolsPage.jsx`
- Overview / Tool Table / Capabilities / Trends / Tool Detail
- Reuse ECharts from existing dashboard

**Horizon scan integration** (low-effort add-on)
- Pass latest `ast_snapshots` row as `security_tooling_context` to `runSynthesisOnly.js`
- Synthesis uses it as supporting context for `agentic_ai_threats` + `traditional_ai_threats`

---

## Cost summary

| Item | Per run | Monthly (weekly runs) |
|---|---|---|
| GitHub API | Free | Free |
| arXiv API | Free | Free |
| PyPI + npm | Free | Free |
| Semantic Scholar | Free | Free |
| Hacker News | Free | Free |
| SerpAPI search (Phase 3) | ~$0.20 | **~$0.80** |
| OpenReview / USENIX (Phase 4) | Free | Free |
| Reddit API | Free | Free |
| Product Hunt | Free | Free |
| Haiku enrichment (new tools only) | ~$0.004 (10 tools) | **~$0.016** |
| Snapshot job | Free | Free |
| **Total** | **~$0.22/run** | **~$0.82/month** |

Initial seed enrichment (200 tools × $0.0004): **~$0.08 one-time**.

---

## Recommended MVP (Phase 1 only)

**Ship Phase 1 first.** It delivers:
- A validated database of 150–250 confirmed security-testing tools
- Sourced from GitHub + arXiv (the two highest-precision, free sources)
- With classification, capability flags, and adoption metrics
- Seeded with the 19 known high-confidence tools listed above
- Total cost: ~$0.08 LLM enrichment + zero ongoing

This answers the core questions immediately:
- What prompt injection / jailbreak testing frameworks exist?
- Which red-teaming tools have MCP-enabled attack capability?
- What agent security benchmarks are researchers using?
- Which tools have exploit generation + shell access (highest-risk profile)?

Phases 2–6 add volume and coverage, but Phase 1 alone provides the
most strategically valuable slice of the database.

---

## Biggest risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Black Hat Arsenal has no clean API | **High** | Manual CSV import for historical data; conference connector added in Phase 4 only |
| arXiv "we release" heuristic misses many tools | Medium | Supplement with Semantic Scholar "has code" filter (free API) |
| Precision drops in Phase 3 (search) | Medium | V1–V4 validation gate rejects generic tools; store only candidates until confirmed |
| Vercel function count at 12/12 | **High** | Consolidate evidence endpoint before Phase 6 |
| Tool ecosystem moves fast; stale data | Low | Weekly cron + star-delta tracking ensures freshness |
| LLM misclassifies niche research tools | Low | Grep-based capability overrides + manual review for low-confidence rows |
