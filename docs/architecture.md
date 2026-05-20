# The Horizon — Full Pipeline Architecture

This document captures the complete intended architecture from raw source ingestion through to a published, QA-passed report with trend analytics and visualisations. It covers both what is already built (Stages 1–10) and what is planned (Stages 11–16).

Use this as the reference when making design decisions or implementing new stages.

---

## Hard Constraints (design everything around these)

1. **Vercel Hobby plan: 12 serverless function limit. Already at 12.** Any new feature that needs to run on a schedule or on-demand must use a local script or be carved out of an existing endpoint — not a new /api file. If the project graduates to Pro (100 functions), this relaxes significantly.

2. **Vercel function timeout: 10s (Hobby), 25s (Pro).** LLM calls, multi-section report generation, and batch analytics all exceed this. They must run as local Node.js scripts, not as serverless functions.

3. **No Python.** The stack is pure Node.js ESM. Adding Python creates a second runtime, a separate dependency graph, and deployment complexity. Everything needed for analytics (trend calculations, time-series comparisons, aggregations) can be done in PostgreSQL SQL and/or JavaScript. Python is not needed and should not be introduced.

4. **Cost discipline.** The Gemini free tier is 20 RPM / ~1500 calls/day. OpenAI gpt-4o-mini at scale is cheap but not free. Report generation must be designed to minimise LLM calls: one call per section is the ceiling, not the floor.

5. **Supabase is the source of truth.** All analytics, comparisons, and report data must be derived from the `sources` table (and future tables like `analytics_snapshots` and `reports`). Never build on ephemeral in-memory state.

---

## Data Flow (end to end)

```
Raw Internet Sources
        │
        ▼
[1] Ingestion — RSS feeds, arXiv, NVD, AI Incident DB
        │
        ▼
[2] Cleaning & Normalisation — deterministic ID, text sanitisation
        │
        ▼
[3] Date Window Filtering — SGT-anchored reporting window
        │
        ▼
[4] Deduplication — URL + title dedup, upsert-based cross-run dedup
        │
        ▼
[5] Validity & Filtering — trust tier, text quality, source type allow-list
        │
        ▼
[6] Initial Tagging — fast rule-based pre-tag before persistence
        │
        ▼
[7] Snapshot Persistence — Supabase upsert + Vercel Blob JSON archive
        │
        ▼
[8] Classification — LLM enrichment (OpenAI/Gemini) or rule-based fallback
        │  Produces: tags, main_category, ai_specificity_score, relevance_tier,
        │  short_summary, analyst_brief, intelligence (trend_signals, key_entities,
        │  threat_maturity, sector_impact, horizon_relevance, report_tier)
        │
        ▼
[9] Scoring — composite priority_score and report_score per source
        │
        ▼
[10] Structured Report Data — generateReport() produces JSON evidence packet
        │
        ├──▶ [11] Trend Analytics — SQL-derived statistics, WoW/MoM deltas, chart_data
        │
        ├──▶ [12] Horizon Scanning — tag frequency trends, weak signal detection, LLM synthesis
        │
        ▼
[13] Section Writer Agents — one LLM call per report block, with evidence packet + word limit
        │
        ▼
[14] Section QA — LLM review of each block: accuracy, citation coverage, overclaiming
        │  Only passing blocks advance
        │
        ▼
[15] Report Assembly — deterministic: approved blocks + charts + bibliography → Markdown/HTML
        │
        ▼
[16] Full-Report QA — single LLM pass: numbers match, no contradictions, complete bibliography
        │
        ▼
Published Report (stored in Supabase `reports` table + Vercel Blob)
```

---

## Stage 1–10: Current Pipeline (Built)

### Stage 1: Ingestion
- Entry: `lib/sources/collectRawSources.js`, called by `api/refresh.js`
- Runs RSS/Atom registry feeds + three API connectors (NVD, arXiv, AI Incident DB) in parallel
- arXiv runs 6 targeted security queries with 3s delays and exponential backoff on 429s
- `archiveSources` is called after tagging but wrapped in try/catch — failure is logged and skipped, does not abort ingestion
- Cron: daily at 22:00 UTC (06:00 SGT)

### Stage 2: Cleaning & Normalisation
- `lib/sources/normalizeSource.js`: deterministic ID = sha256(url).slice(0,36), forces https for arXiv
- `lib/cleaning/cleanSources.js`: light sanitisation across batch

### Stage 3: Date Window Filtering
- `lib/time/reportingWindow.js`: anchored to 06:00 SGT boundaries
- Sources outside window or with no date_published are dropped

### Stage 4: Deduplication
- `lib/utils/dedupe.js`: within-batch dedup by canonical URL and normalised title
- Cross-run dedup via Supabase upsert on conflict:id

### Stage 5: Validity & Filtering
- `lib/sources/filterAcceptableSources.js`: source_type allow-list
- `lib/validation/sourceValidity.js`: 0–100 validity score; "do_not_use" sources discarded

### Stage 6: Initial Tagging
- `lib/sources/tagSource.js`: fast rule-based pre-tag before persistence

### Stage 7: Snapshot Persistence
- `lib/storage/snapshotDatabase.js`: Vercel Blob archive + Supabase upsert
- snapshot_id format: `snapshot-YYYY-MM-DD`
- ingestion_runs table: audit log per run

### Stage 8: Classification
- Entry: `lib/classification/classifyStoredSources.js`, called by `api/classify-sources.js`
- LLM path: `lib/claims/enrichSource.js` — OpenAI first (gpt-4o-mini), Gemini fallback (gemini-2.5-flash)
- Rule-based fallback: `lib/classification/ruleBasedClassifier.js` with PHRASE_RULES
- Produces: tags, main_category, ai_specificity_score, relevance_tier (core/adjacent/context)
- Hard-deletes sources with ai_specificity_score < 10 (except curated)
- LLM enrichment also writes: short_summary, analyst_brief, intelligence (jsonb)
- Each source processed in isolated try/catch — one failure is logged, does not abort the batch
- 7s rate-limit delay applied only when Gemini is the active provider; OpenAI calls have no delay

### Stage 9: Scoring
- Entry: `lib/scoring/scoreSource.js`, `lib/scoring/scoreStoredSources.js`
- `priority_score`: dashboard ranking (credibility, severity, novelty, operational impact, SG relevance)
- `report_score`: report inclusion ranking (quality, horizon signal, maturity)
- Each source processed in isolated try/catch — one write failure is logged, does not abort the batch

### Stage 10: Structured Report Data
- Entry: `lib/reports/generateReport.js`, called by `api/generate-report.js`
- Outputs: top_developments, emerging_threats, trend_signals, sector_alerts, key_entities, category_breakdown, statistics
- Already computes: category counts, priority distribution, threat maturity breakdown, report tier distribution
- LLM-dependent sections (trend_signals, emerging_threats, sector_alerts, key_entities) degrade gracefully when intelligence field is empty


---

## Stage 11: Trend Analytics Layer

**What it does:** Derives time-series statistics from the `sources` table. Answers questions like "this week vs last week" and "which tags are rising."

**Implementation approach:** Pure SQL + JavaScript. No Python. PostgreSQL window functions and CTEs handle all the aggregation. A new `analytics_snapshots` table stores one row per day with pre-computed counts so comparisons are fast and do not require scanning millions of rows.

**New Supabase table: `analytics_snapshots`**
```sql
analytics_snapshots (
  snapshot_date   date PRIMARY KEY,      -- SGT date of the snapshot
  period          text,                  -- 'daily' | 'weekly' | 'monthly'
  total_sources   int,
  by_category     jsonb,                 -- { llm_threats: 12, ... }
  by_priority     jsonb,                 -- { critical: 2, high: 8, ... }
  by_trust_tier   jsonb,
  by_source_type  jsonb,
  tag_frequencies jsonb,                 -- { "prompt injection": 14, ... }
  sector_counts   jsonb,
  avg_ai_specificity float,
  enrichment_rate float,                 -- fraction with claim_extraction_status = 'success'
  created_at      timestamptz
)
```

**New module: `lib/analytics/computeAnalytics.js`**
- Queries sources for a date range
- Computes all aggregate fields above
- Returns `analytics_summary` (flat stats) + `chart_data` (Recharts-compatible arrays)
- WoW: compare current week's analytics_snapshot to the snapshot from 7 days prior
- MoM: compare current month to 30 days prior

**chart_data format (Recharts-compatible):**
```js
{
  category_bar: [{ name: "LLM Threats", count: 42, prev: 35 }, ...],
  priority_pie: [{ name: "critical", value: 5 }, ...],
  tag_trend:    [{ date: "2026-05-13", tag: "prompt injection", count: 8 }, ...],
  sector_bar:   [{ sector: "finance", count: 12 }, ...],
  daily_volume: [{ date: "2026-05-13", core: 10, adjacent: 22 }, ...]
}
```

**Execution:** Run as `scripts/computeAnalytics.js` (local script, no Vercel timeout). Schedule via Vercel cron if the function slot opens up, or fold into the nightly refresh sequence. Store result in `analytics_snapshots`.

**What is already done in Stage 10:** `generateReport()` already computes `statistics.by_category`, `statistics.by_priority`, `statistics.threat_maturity`, `statistics.report_tier`. Stage 11 extends this by adding historical comparison and chart-ready output. The existing statistics block should feed into Stage 11 rather than duplicating it.

---

## Stage 12: Horizon Scanning Layer

**What it does:** Detects weak signals — threats that are not yet common but show velocity.

**Implementation approach:** Start with what we already have before adding embeddings. The `intelligence` field produced by LLM enrichment contains `threat_maturity`, `horizon_relevance`, `trend_signals`, and `sector_impact` — these are the primary signal source. Add tag velocity tracking (how fast a tag's frequency is growing) in Stage 11, then synthesise those signals with a single LLM call.

**Do not build embedding clustering yet.** True clustering requires: generating embeddings (cost), storing in pgvector (new Supabase extension), running HDBSCAN (Python or a JS port), topic labelling (another LLM call). This is significant complexity and cost for marginal gain over what the intelligence field already provides. Revisit when the source corpus exceeds ~5,000 enriched items.

**New module: `lib/horizon/detectHorizonSignals.js`**

Step 1 — Pull signals from existing data:
- Sources with `threat_maturity = "emerging"` or `"growing"` and `horizon_relevance >= 4`
- Tags whose frequency grew >50% WoW (from analytics_snapshots comparison)
- Tags that appeared this week that had zero count last week
- `intelligence.trend_signals` strings from top-scored sources

Step 2 — Deduplicate and cluster signals by semantic overlap:
- Simple approach: normalise signal strings, group by leading keyword, pick the highest-scored representative
- No embeddings: this is good enough for <200 signals per week

Step 3 — LLM synthesis (single call):
- Input: top 20 deduplicated horizon signals + top 10 emerging sources + tag velocity data
- Output: 5–8 `horizon_signal` objects with `confidence`, `timeframe`, `evidence`, `recommended_monitoring`
- Model: gpt-4o-mini (fast, cheap)
- Store result in `reports` table under `horizon_signals` column

**Output schema:**
```js
{
  signal: "AI-assisted spear phishing against finance sector",
  confidence: "medium",          // low | medium | high
  timeframe: "0-3 months",       // when this might become mainstream
  evidence: ["url1", "url2"],    // source URLs supporting the signal
  tag_velocity: "+120% WoW",
  recommended_monitoring: "Track phishing campaigns using LLM-generated lures"
}
```

---

## Stage 13: Section Writer Agents

**What it does:** Converts the structured evidence packet (Stages 10–12 output) into prose report sections. Avoids one massive LLM call by splitting into one call per section.

**Implementation:** `scripts/generateFullReport.js` — local script, no Vercel timeout.

**Report blocks and their evidence packets:**

| Block | Evidence input | Word limit |
|---|---|---|
| Executive Summary | top 5 developments + statistics + horizon signals | 250 |
| Key Numbers | statistics + WoW/MoM deltas | 150 (mostly structured, light prose) |
| Top Incidents | top 5 by report_score with analyst_brief | 400 |
| Top Developments | top 5 research/advisory by report_score | 400 |
| Category Analysis | category_breakdown for each of 5 categories | 200 per category |
| AI for Security | ai_for_security category sources | 250 |
| Singapore Relevance | sources with singapore_relevance_score > 0 | 200 |
| Trend Comparison | analytics WoW/MoM data + tag velocity | 300 |
| Critical Takeaways | top horizon signals + critical/high priority sources | 300 |
| Bibliography | all cited URLs | structured list, no prose |

**Per-block call structure:**
```
System: "You are a senior AI security analyst writing the {section_name} of a weekly intelligence report. Write factual, citation-backed prose. Do not invent claims not in the evidence. Do not over-attribute. Use the analyst brief watch_points and why_it_matters fields as the factual basis for claims."
User:   {evidence_packet as JSON} + word limit + required citations + style rules
```

**Cost estimate:** 10 sections × ~2000 tokens in + ~500 tokens out = ~25,000 tokens per report at gpt-4o-mini rates ≈ $0.01–0.02 per report.

**Output:** `draft_report_section` objects stored in memory during script execution. Passed to Stage 14 one at a time.

---

## Stage 14: Section-Level QA

**What it does:** Reviews each draft section before assembly. Blocks bad sections from reaching the final report.

**Implementation:** Second LLM call per section, same script (`scripts/generateFullReport.js`). Run inline, sequentially — no separate agent infrastructure needed at this volume.

**QA prompt structure:**
```
System: "You are a quality controller for an AI threat intelligence report. Your job is to catch errors, not to rewrite."
User:   {draft_section} + {evidence_packet_used_to_generate_it}

Return JSON: {
  verdict: "pass" | "revise" | "reject",
  issues: ["unsupported claim: X", "overclaims severity: Y"],
  suggested_edits: ["..."]
}
```

**QA checks (via prompt instruction, not code):**
- Accuracy: all claims traceable to the evidence packet
- Citation coverage: every factual claim has a source URL
- Overclaiming: no "unprecedented" or superlatives without clear evidence
- Missing caveats: attribution claims marked as preliminary where appropriate
- Singapore relevance quality: SG relevance not inserted artificially if no signal
- Severity exaggeration: priority labels match the source priority_score

**Retry logic:**
- `revise`: regenerate the section with the QA issues appended to the prompt, one retry
- `reject` after retry: substitute a safe fallback template (structured data only, no prose)
- Max 2 LLM calls per section (generation + QA). Retry adds a third, capped there.

**Cost:** ~10,000 tokens per report for QA pass = total report cost ~$0.03–0.05.

---

## Stage 15: Report Assembly

**What it does:** Deterministic combination of approved sections into a final document. No new analysis, no new LLM calls.

**Implementation:** `lib/reports/assembleReport.js`

**Rules:**
- Assembler only combines: approved sections + approved charts + approved citations + approved bibliography
- It does not add commentary, fill gaps, or rewrite anything
- Sections that were rejected and not replaced with a fallback are omitted with a note
- Chart references are inserted as Recharts component props (for frontend) or as markdown tables (for PDF)

**Output formats:**
- Markdown (`reports/weekly-2026-05-19.md`) — primary format, stored in Vercel Blob
- Structured JSON (`reports` Supabase table) — for the frontend report page
- PDF export is a future addition (puppeteer or @react-pdf/renderer), not MVP

**New Supabase table: `reports`**
```sql
reports (
  id              text PRIMARY KEY,    -- report-weekly-2026-05-19
  period          text,                -- weekly | monthly | quarterly
  date_range      jsonb,               -- { start, end }
  generated_at    timestamptz,
  status          text,                -- draft | approved | blocked
  qa_verdict      text,                -- pass | needs_revision | blocked
  qa_issues       jsonb,
  sections        jsonb,               -- { executive_summary: "...", ... }
  statistics      jsonb,
  chart_data      jsonb,
  horizon_signals jsonb,
  bibliography    jsonb,
  blob_path       text,                -- path to Markdown in Vercel Blob
  source_count    int,
  enrichment_rate float
)
```

---

## Stage 16: Full-Report QA

**What it does:** One final LLM pass over the assembled report. Checks cross-section consistency — things section QA cannot catch because it only sees one section at a time.

**Implementation:** Single call at the end of `scripts/generateFullReport.js`.

**Checks:**
- Numbers in prose match numbers in statistics block
- No claims contradicted across sections (e.g., "rising threat" in one section, "declining" in another)
- No important source mentioned in evidence packet that does not appear anywhere in the report
- No section repeated its main point more than once
- Bibliography covers all cited URLs
- SG relevance present if and only if there is genuine signal
- Tone: analytical but not sensational, critical but not alarmist

**Output:**
```js
{
  verdict: "approved" | "needs_revision" | "blocked",
  issues: [...],
  revision_targets: ["executive_summary", "trend_comparison"]
}
```

- `approved`: write to `reports` table, status = "approved", publish blob
- `needs_revision`: log issues, set status = "draft", alert via console/email — human review required
- `blocked`: set status = "blocked", do not publish — reserved for severe hallucination or contradiction

**The full QA pass costs ~5000 tokens (the full assembled report summary, not the raw sections). Total pipeline cost per report: ~$0.05–0.08.**

---

## Frontend Integration (Recharts + Report Page)

The frontend has been split from a single App.jsx into a structured component hierarchy:
- `src/constants.js` — shared category data
- `src/utils.js` — shared formatting and grouping utilities
- `src/components/` — SourceCard, CategorySection, Nav
- `src/pages/` — ReportPage, SourcePage, ArchivePage
- `src/App.jsx` — root routing only (~22 lines)

The existing Report tab needs to be extended to:

1. **Chart panel**: Call `GET /api/generate-report?period=weekly` and pull `chart_data`. Render:
   - `CategoryBarChart`: source count by category, current vs. previous period
   - `PriorityPieChart`: breakdown of critical/high/medium/low
   - `DailyVolumeChart`: stacked area chart of core + adjacent sources per day
   - `TagTrendTable`: top rising tags WoW

2. **Horizon signals panel**: Render the `horizon_signals` array as cards with confidence badge and timeframe

3. **Full report view**: Fetch the Markdown from Vercel Blob and render it (react-markdown)

4. **Key numbers strip**: Show WoW delta badges next to each statistic

Recharts is the right choice — it is already in the plan, it is the most popular React charting library, it works with server-side data arrays out of the box, and it has zero config for basic bar/pie/area charts.

---

## Execution Sequence (Next Steps in Order)

### Phase 1: Analytics Foundation (prerequisite for everything else)

1. Add `analytics_snapshots` table to Supabase
2. Write `lib/analytics/computeAnalytics.js` — queries sources, computes all aggregate fields, produces chart_data arrays
3. Write `scripts/computeAnalytics.js` — wraps the above, writes to analytics_snapshots
4. Extend `lib/reports/generateReport.js` to attach `chart_data` and WoW/MoM deltas to the report output by joining the last two analytics_snapshots rows
5. Run backfill: `node scripts/computeAnalytics.js --backfill 90` to populate historical rows
6. Add analytics computation to the nightly sequence (after score-sources, before generate-report)

### Phase 2: Horizon Signal Detection

7. Write `lib/horizon/detectHorizonSignals.js` using existing intelligence fields + analytics tag velocity
8. Add horizon signals to `generateReport()` output
9. Wire into `scripts/computeAnalytics.js` so horizon signals are computed alongside analytics

### Phase 3: Full Report Generation Script

10. Write `scripts/generateFullReport.js`:
    - Calls generateReport() + detectHorizonSignals()
    - Loops over 10 sections: generate → QA → retry on revise → fallback on reject
    - Calls assembleReport() → final QA → write to reports table + Vercel Blob
11. Write `lib/reports/assembleReport.js` — deterministic combiner
12. Create `reports` Supabase table

### Phase 4: Frontend Charts

13. Add recharts to package.json
14. Build chart components: CategoryBarChart, PriorityPieChart, DailyVolumeChart, TagTrendTable
15. Wire chart_data from generate-report API into the chart components
16. Add horizon signals card panel to the Report page
17. Add Markdown report renderer (react-markdown) for the full prose report

### Phase 5: Automation

18. Add Vercel cron for the nightly analytics computation (if a function slot opens) or document the manual sequence
19. Document the complete post-backfill runbook in docs/runbook.md

---

## What NOT to Build (Scope Constraints)

- **Python**: not needed, increases complexity
- **Embedding clustering**: revisit when corpus > 5,000 enriched sources; current intelligence field is sufficient
- **PDF export**: nice-to-have, not MVP; add after Markdown report is working
- **Multi-agent orchestration frameworks** (LangChain, AutoGen, CrewAI): overkill at this volume; sequential LLM calls in a script are simpler, cheaper, and more debuggable
- **New /api files**: the function slot limit is hard; new capabilities go in scripts or in lib/
- **Real-time streaming**: reports are generated nightly; polling the reports table is fine

---

## Cost Model (Monthly Estimate)

| Item | Frequency | Est. Cost |
|---|---|---|
| Daily ingestion (no LLM) | 30×/month | $0 |
| LLM enrichment (gpt-4o-mini) | ~50 sources/day × 30 | ~$0.30 |
| Nightly analytics computation | 30×/month | $0 (pure SQL) |
| Weekly report generation (13-16) | 4×/month | ~$0.20 |
| Monthly report generation | 1×/month | ~$0.08 |
| Supabase (free tier: 500MB) | — | $0 |
| Vercel Blob (storage) | — | ~$0 (tiny files) |
| **Total** | | **~$0.60/month** |

At this volume, cost is not a meaningful constraint. The pipeline is designed to stay cheap at the scales relevant to a single-team intelligence operation.
