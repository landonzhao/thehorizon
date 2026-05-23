# Intelligence Layer — Architecture and Logic

The intelligence layer transforms scored and classified sources into two final products:

1. **Period page data** — daily, weekly, monthly, quarterly dashboard updates
2. **Monthly horizon scan report** — a strategic, analytical, trend-focused document

## Core Principle

> **Sources are evidence. Events are what happened. Trends are what is changing. Strategic shifts are what the monthly horizon scan is about.**

The monthly report's executive summary is driven by strategic shifts — not by a ranked list of sources. Sources exist as bibliography, not as headlines.

---

## Data Flow

```
Scored + classified sources
        │
        ▼
[1] Event Clustering          — deterministic, no LLM
        │   lib/events/clusterSourcesIntoEvents.js
        │   Groups sources describing the same real-world event
        │   into clusters using CVE IDs, product+date proximity,
        │   and title Jaccard similarity.
        │
        ▼
[2] Event Synthesis           — LLM (with deterministic fallback)
        │   lib/events/synthesiseEvent.js
        │   Synthesises each cluster into a rich event object:
        │   what_happened, how_it_happened, why_it_matters,
        │   defender_implications, maturity_level, confidence_level.
        │   Provider rotation: OpenAI → Groq → Gemini Flash → Gemini 2.5
        │
        ▼
[3] Event Scoring             — deterministic
        │   lib/events/scoreEvent.js
        │   Two independent scores:
        │   - event_priority_score: operational urgency (daily dashboard)
        │   - event_report_score:   strategic value (monthly report)
        │
        ▼
[4] Trend Clustering          — deterministic, no LLM
        │   lib/trends/clusterEventsIntoTrends.js
        │   Groups related events into broader trends.
        │   Requires: same threat_category + tag overlap + 90-day window.
        │   Each event is assigned to at most one trend (greedy).
        │
        ▼
[5] Trend Synthesis           — LLM (with deterministic fallback)
        │   lib/trends/synthesiseTrend.js
        │   Synthesises each trend cluster: trend_title, summary,
        │   trajectory, trend_strength, strategic_significance,
        │   operational_relevance, watch_window, key_indicators_next_month.
        │
        ▼
[6] Trend Scoring             — deterministic
        │   lib/trends/scoreTrend.js
        │   Produces trend_score (0–100).
        │
        ▼
[7] Strategic Synthesis       — LLM + deterministic
        │   detectStrategicShifts.js    — LLM: shift detection per period
        │   detectCrossCategoryConvergence.js — deterministic pattern match
        │   generateDefenderImplications.js   — deterministic aggregation
        │   generateWatchIndicators.js        — deterministic aggregation
        │   buildMaturityTrajectoryMatrix.js  — deterministic aggregation
        │
        ├──▶ [A] Period page data    generatePeriodPageData.js
        │        Event-first. Daily: sorted by event_priority_score.
        │        Weekly/monthly/quarterly: sorted by event_report_score.
        │
        └──▶ [B] Monthly horizon scan
                 buildMonthlyHorizonScanData.js  — structured data object
                 generateMonthlyHorizonScan.js   — Markdown renderer
```

---

## Stage 1 — Event Clustering

**File:** `lib/events/clusterSourcesIntoEvents.js`

**Output:** `{ clusters: EventCluster[], source_to_event: Map<sourceId, eventId> }`

Clustering strategy (in priority order):

1. **CVE ID match** — Two sources sharing any CVE ID are merged immediately. Multiple clusters that share a CVE are merged together (union-find style).
2. **Product + date proximity** — Sources with overlapping `affected_products` published within 14 days are merged.
3. **Title Jaccard similarity** — Titles with ≥0.35 Jaccard similarity of content tokens (stopwords removed) published within 14 days are merged.
4. **New cluster** — No match found; source seeds a new cluster.

**Event ID generation:**
- CVE-based clusters: `evt-cve-{sha256(sorted CVE IDs)}` — stable across runs for the same set of CVEs
- Other clusters: `evt-{sha256(primaryUrl + firstSeen)}`

**Key properties of clusters:**
- `source_count`: number of corroborating sources (used in scoring)
- `primary_source_id`: highest-scored source in the cluster
- `exploitation_status`: best (most severe) status across all sources
- `evidence_level`: best evidence level across all sources

---

## Stage 2 — Event Synthesis

**File:** `lib/events/synthesiseEvent.js`

Takes a cluster object (with `sources` attached) and produces a synthesised event with:

| Field | Description |
|-------|-------------|
| `event_title` | Concise title of the event |
| `event_type` | Type: `active_exploitation`, `vulnerability_disclosure`, `research_finding`, etc. |
| `summary` | One-paragraph synthesis |
| `what_happened` | Factual description of the event |
| `how_it_happened` | Technical mechanism |
| `why_it_matters` | Strategic/operational significance |
| `defender_implications` | What defenders should do |
| `watch_indicators` | Observable indicators to monitor |
| `maturity_level` | `research` → `emerging` → `growing` → `operational` → `mainstream` |
| `operationalization_level` | `theoretical` → `limited` → `moderate` → `widespread` → `commoditised` |
| `confidence_level` | `low` / `medium` / `high` |

**Deterministic fallback:** If LLM synthesis fails, uses the primary source's title and summary.

---

## Stage 3 — Event Scoring

**File:** `lib/events/scoreEvent.js`

Two scores are computed independently:

### event_priority_score (operational urgency)
What analysts need to act on NOW. Components:
- Evidence level (confirmed exploitation > theoretical)
- Exploitation status (in the wild > PoC > not exploited)
- Source count (more corroboration = more significant)
- Recency (events in last 24h score highest)
- Scope (CVE count, affected products, sectors, AI stack layers)
- Singapore/ASEAN relevance bonus (+8)
- Event type bonus (active_exploitation = +20, analysis_essay = +2)

### event_report_score (strategic value)
What belongs in the monthly horizon scan. Components:
- Evidence level
- Maturity score (research and emerging score highest — they are the horizon)
- Novelty (novel technique > established)
- Source count
- Singapore/ASEAN relevance
- Event type bonus (research_finding = +18, active_exploitation = +15)

**Priority label** (from event_priority_score):
- `critical` ≥80, `high` ≥60, `medium` ≥40, `low` ≥20, `background` <20

---

## Stage 4 — Trend Clustering

**File:** `lib/trends/clusterEventsIntoTrends.js`

**Output:** `{ trends: TrendCluster[], event_to_trend: Map<eventId, trendId> }`

Events are sorted by `event_report_score` descending before clustering (most significant events anchor trends).

Merge conditions (all must be true):
1. Same `threat_category`
2. Within 90-day window of the cluster's representative event
3. Tag overlap ≥1 (direct tag match or same TAG_FAMILY_GROUP)

TAG_FAMILY_GROUPS allow semantically related tags to bridge clusters:
- `[prompt_injection, jailbreak, guardrail_bypass, insecure_output_handling]`
- `[agent_hijacking, excessive_agency, mcp_exploitation, tool_misuse]`
- `[rag_attack, data_poisoning, model_backdoor, embedding_attack]`
- `[ml_supply_chain, model_extraction, data_poisoning]`
- `[deepfake, voice_cloning, ai_generated_phishing, ai_generated_malware]`
- `[sensitive_data_disclosure, training_data_extraction, privacy_attack]`
- `[ai_reconnaissance, ai_enabled_attack_automation]`
- `[actively_exploited, proof_of_concept]`

---

## Stage 5 — Trend Synthesis

**File:** `lib/trends/synthesiseTrend.js`

The synthesis input is the **trend cluster object** — which contains the full `events` array of supporting event objects. The synthesis prompt instructs the LLM to analyse the events, not raw sources.

Key synthesised fields:

| Field | Values |
|-------|--------|
| `trajectory` | `accelerating`, `emerging`, `steady`, `plateauing`, `decelerating` |
| `trend_strength` | `weak`, `moderate`, `strong`, `dominant` |
| `confidence_level` | `low`, `medium`, `high` |
| `watch_window` | Human-readable timeframe (e.g., "1–3 months") |

---

## Stage 6 — Trend Scoring

**File:** `lib/trends/scoreTrend.js`

`trend_score` (0–100) considers: event count, max/avg event priority, trajectory momentum, maturity, source count, CVE breadth.

---

## Stage 7 — Strategic Synthesis

### Strategic Shift Detection
**File:** `lib/strategy/detectStrategicShifts.js` (LLM)

Input: all scored trends for the period.

Output: array of shift objects — each with:
- `shift_title`: the directional change in one sentence
- `previous_assumption`: what defenders previously believed
- `emerging_reality`: what the evidence now shows
- `implications_for_defenders`: what to change
- `confidence_level`, `maturity_level`, `expected_watch_window`

**The executive summary of the monthly report is built from these shifts, not from a source ranking.**

### Cross-Category Convergence Detection
**File:** `lib/strategy/detectCrossCategoryConvergence.js` (deterministic)

Six hardcoded convergence patterns are checked against the full event set:

| Pattern ID | Categories | Signal |
|------------|------------|--------|
| `prompt-mcp-orchestration` | llm_threats + agentic_ai_threats | Prompt injection + MCP/tool misuse |
| `ai-exploit-agentic` | ai_enabled_threats + agentic_ai_threats | AI exploit automation + autonomous agents |
| `deepfake-identity` | ai_enabled_threats | Deepfake + voice cloning + identity verification |
| `supply-chain-agents` | traditional_ai_threats + agentic_ai_threats | Model backdoor + agent deployment |
| `llm-data-exfil-enterprise` | llm_threats | Data disclosure + RAG + enterprise knowledge |
| `coding-ai-production-infra` | agentic_ai_threats + ai_enabled_threats | Coding AI + infrastructure risk |

A convergence point fires only when events from all required categories and tag groups are present.

### Defender Implications Aggregation
**File:** `lib/strategy/generateDefenderImplications.js` (deterministic)

Collects and deduplicates implications across seven domains: monitoring, architecture, detection, identity_access, patching, governance, ai_deployment.

### Watch Indicators Aggregation
**File:** `lib/strategy/generateWatchIndicators.js` (deterministic)

Collects observable indicators from events, trends, and convergence points. Deduplicates by Jaccard similarity. Returns up to 20 sorted indicators.

### Maturity Trajectory Matrix
**File:** `lib/strategy/buildMaturityTrajectoryMatrix.js` (deterministic)

Produces a table of signals with `current_maturity`, `trajectory`, `confidence_level`, `expected_watch_window`, and `urgency`. Sorted by urgency (accelerating + operational = highest).

---

## Product A — Period Page Data

**File:** `lib/pages/generatePeriodPageData.js`

Supports four periods: `daily`, `weekly`, `monthly`, `quarterly`.

**Daily page** sorts `top_events` by `event_priority_score` (operational urgency).
**Weekly/monthly/quarterly** sort by `event_report_score` (strategic value).

Key fields:
- `active_exploitation_items` — events with `exploitation_status === "exploited_in_wild"`
- `top_events` — ranked by the period-appropriate score
- `top_trends` — ranked by `trend_score`
- `watch_indicators` — period-appropriate slice
- `convergence_points` — period-appropriate slice
- `source_appendix` — bibliography only; sources are not the headline

---

## Product B — Monthly Horizon Scan Report

**Files:**
- `lib/reports/buildMonthlyHorizonScanData.js` — builds the structured data object
- `lib/reports/generateMonthlyHorizonScan.js` — renders the Markdown report

### Report structure

| Section | Data source |
|---------|-------------|
| Cover page + Month at a Glance | `events`, `trends`, `strategicShifts` counts |
| Executive Summary | `strategicShifts` (not source rankings) |
| Methodology | Configuration constants + source tier breakdown |
| Threat Landscape Overview | Event/trend counts, category distribution |
| Strategic Shifts | `strategicShifts` array |
| Category sections (A–E) | Per-category top events + key trends + convergence signals |
| Cross-Category Convergence | `convergencePoints` array |
| Operational Implications | `defenderImplications` by domain |
| Maturity and Trajectory Matrix | `maturityMatrix` |
| Horizon Watch | Research-maturity events + research-stage trends + next-month indicators |
| Source Appendix | Bibliography only |

### Horizon Watch — weak signal inclusion

Research-maturity events appear in `horizon_watch.weak_signals` regardless of their `event_priority_score`. A signal that scores low on operational urgency (because it is not yet exploited) but high on strategic novelty still belongs in the horizon watch section. `event_report_score` governs their ordering within the section.

---

## Execution

Run the full intelligence pipeline with:

```sh
node scripts/buildIntelligenceBase.js \
  --period monthly \
  --start 2026-05-01 \
  --end 2026-05-31 \
  --limit 2000

# Skip LLM calls (deterministic fallbacks only):
node scripts/buildIntelligenceBase.js --skip-llm

# Build but do not write to Supabase or Blob:
node scripts/buildIntelligenceBase.js --dry-run
```

**Output written to Vercel Blob:**
- `intelligence/{date}/pages/daily.json`
- `intelligence/{date}/pages/weekly.json`
- `intelligence/{date}/pages/monthly.json`
- `intelligence/{date}/pages/quarterly.json`
- `intelligence/{date}/horizon-scan-data.json`
- `intelligence/{date}/horizon-scan-report.md`

**Supabase tables populated:** `events`, `event_sources`, `trends`, `trend_events`, `strategic_shifts`, `convergence_points`

Run the migration first if tables do not exist:
```sql
-- docs/migrations/intelligence-v1.sql
```

---

## Database Tables

See `docs/migrations/intelligence-v1.sql` for full schema.

| Table | Purpose |
|-------|---------|
| `events` | One row per event cluster; stores LLM synthesis, scoring, source linkage |
| `event_sources` | Maps sources to events (role: primary / supporting) |
| `trends` | One row per trend cluster; stores synthesis and scoring |
| `trend_events` | Maps events to trends |
| `strategic_shifts` | LLM-detected strategic shifts per reporting period |
| `convergence_points` | Detected cross-category convergence patterns |

---

## Tests

```sh
node tests/events.test.js
```

Covers:
- CVE-matched sources cluster into one event
- Trend clusters group multiple supporting events
- Trend synthesis input contains events, not raw sources
- Strategic shift data contract (previous_assumption, emerging_reality)
- Daily page ranks by event_priority_score; monthly by event_report_score
- Monthly report executive summary derived from strategic shifts, not source titles
- Research-maturity events appear in horizon watch regardless of low priority
- Active exploitation events rank above low-urgency events on daily page
- Maturity trajectory matrix has required fields and passes through to report
- Convergence layer fires for multi-category overlaps and correctly identifies supporting events
