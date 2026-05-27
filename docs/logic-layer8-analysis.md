# Layer 8 — Category Analysis

**Orchestrator:** `lib/pipeline/analysis/runAnalysisLayer.js`
**LLM calls:** Step 8B (one per active category). Step 8D has an optional LLM call (disabled by default). Steps 8A and 8C are fully deterministic.

---

## Purpose

Produce structured intelligence analyses — one per active threat category — backed by traceable evidence. Every insight, early signal, and outlook statement must cite evidence IDs from the dossier. All LLM outputs go through a deterministic QA pass before being surfaced.

---

## Pipeline Steps

```
rawfact_sources[] + aggregates
    │
    ▼
8A: buildAllDossiers()           — deterministic evidence selection
    │
    ▼
8B: analyzeAllCategories()       — LLM per active category
    │
    ▼
8C: linkAnalysisEvidence()       — deterministic evidence_id resolution
    │
    ▼
8D: qaAllCategoryAnalyses()      — deterministic + optional LLM QA
    │
    ▼
category_analyses[] + dossiers[]
```

---

## Step 8A — Category Evidence Dossier Builder

**File:** `lib/pipeline/analysis/buildCategoryDossier.js`
**No LLM calls.** Fully deterministic.

Assembles a compact evidence dossier per threat category. The LLM in 8B never sees raw source objects — only this dossier.

**Categories processed:** `traditional_ai_threats`, `llm_threats`, `agentic_ai_threats`, `ai_enabled_threats`. Categories with zero sources are skipped.

### Rawfact Evidence Selection

Max **12 items** per category (`MAX_RAWFACT_EVIDENCE = 12`), selected in order:
1. Priority: `must_read` → `high` → `medium` → `low` → `archive_only`
2. Within same priority: cluster representatives first (`is_representative=true`)
3. Within same priority + representative: descending `rawfact_score`

Each item carries: `evidence_id` (`raw_<source_id>`), title, publisher, published_date, source_type, rawfact_score, rawfact_priority, evidence_card_title, short_summary, key_facts[], numbers_statistics[], attack_flow[], why_it_matters, analytics_attack_vectors[], analytics_signal_clusters[], cluster_id, cluster_size, is_cluster_representative.

### Analytics Evidence

Up to 4 analytics items per category:
- attack vector frequency: `agg_<category>_attack_vectors`
- maturity distribution: `agg_<category>_maturity`
- signal cluster counts: `agg_<category>_signal_clusters`
- operational status counts: `agg_<category>_operational_status`

Each carries an `analytics_id` (format: `agg_<category>_<metric>`) that the LLM can cite.

### Dossier Output

```json
{
  "category": "string",
  "source_count": number,
  "rawfact_evidence": [{ "evidence_id", "title", "publisher", ... }],
  "analytics_evidence": [{ "analytics_id", "metric_name", "value", ... }]
}
```

---

## Step 8B — Category Analysis LLM Call

**File:** `lib/pipeline/analysis/analyzeCategory.js`
**LLM call:** Yes — one call per active category.

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| **GROQ NOT USED** | Citation-traced structured output requires `json_schema`; Groq supports JSON mode only |
| Output format | Structured JSON via `CATEGORY_ANALYSIS_SCHEMA` |
| Label | `"Layer8B-<category>"` — one call per active category |
| Concurrency | 3 parallel calls (`analyzeAllCategories.js`) |
| Trigger | `source_count >= 2` AND at least one OPENAI or GEMINI key present |
| Fallback | `deterministicAnalysis()` — one insight per top rawfact item |

### System Prompt

```
You are a senior AI cybersecurity intelligence analyst preparing a category brief for a strategic AI threat horizon scan deck.

## YOUR TASK
Analyze the evidence dossier for ONE threat category and produce a structured category analysis.
You may ONLY draw conclusions that are directly supported by the provided evidence items.
Every insight, early signal, and outlook statement MUST cite the evidence_id(s) that support it.

## EVIDENCE ID FORMAT
Evidence IDs look like "raw_<alphanumeric>" (rawfact sources) or "agg_<category>_<metric>" (analytics aggregates).
Use EXACTLY the evidence_id strings as they appear in the dossier — do not invent or modify them.

## FIELDS

category — return exactly as provided, unchanged.

overview — 2–3 sentences. What is the dominant pattern in this category this reporting period?
  Focus on what changed or is escalating, not just what exists.
  Do NOT cite evidence_ids in overview — it is a synthesis statement.

top_insights — 3–5 insights (fewer if evidence does not support more).
  Each insight is a SHORT declarative sentence (≤25 words) drawing a cross-source conclusion.
  MUST include at least 1 supporting_evidence_id from the dossier.
  Good: "Threat actors are combining LLM jailbreaks with automated pipeline exploitation to bypass enterprise AI guardrails at scale."
  Bad: "A new paper describes a prompt injection technique." (single-source summary, not an insight)
  Never repeat the same claim across insights.

early_signals — 0–3 weak signals: topics with only 1–2 sources but high novelty or strategic significance.
  Each entry: signal (what is observed), implication (why it matters in 3–6 months).
  MUST cite at least 1 supporting_evidence_id.
  Return empty array [] if no genuine early signals exist in the dossier.

outlook — where this category is heading in the next 3–6 months.
  statement: 1–2 sentences. Name specific techniques, actors, or vectors where the evidence supports it.
  supporting_evidence_ids: cite the evidence items most relevant to this projection.
  time_horizon: always "3-6 months".

analysis_confidence — based solely on the dossier quality:
  "high": 6+ quality sources with evidence cards
  "medium": 3–5 quality sources
  "low": 1–2 sources or no evidence cards

key_source_ids — 3–5 source_ids (NOT evidence_ids) from the rawfact evidence that most shaped this analysis.

## RULES
- Cite ONLY evidence_ids that appear in the dossier provided.
- Analyze only what the evidence supports — no speculation beyond the sources.
- Do not repeat the same claim in overview, top_insights, early_signals, and outlook.
- Return strict JSON only — no markdown, no preamble.
```

### User Prompt

Built by `buildCategoryPrompt(dossier)`:

```
CATEGORY: <CATEGORY LABEL IN UPPERCASE>
Total sources in this category: <source_count>
Rawfact evidence items (top <N> by priority and score):

[<evidence_id>] <title>
  publisher=<publisher>  date=<date>  type=<source_type>  score=<score>  priority=<priority>
  card: <evidence_card_title>
  summary: <short_summary, first 200 chars>
  key facts: <key_facts[0..2], pipe-separated>
  stats: <numbers_statistics[0..2], pipe-separated>
  attack flow: <attack_flow[0..2], arrow-separated>
  why it matters: <why_it_matters, first 150 chars>
  attack vectors: <analytics_attack_vectors, comma-separated>
  signal clusters: <analytics_signal_clusters, comma-separated>
  cluster: <cluster_id> (<cluster_size> sources, representative=<bool>)

ANALYTICS EVIDENCE (cite analytics_id to reference):
[<analytics_id>] <metric_name>: { <top 8 entries as key:value> }

Produce the category analysis for "<category>" using ONLY the evidence above.
Every insight and early_signal must cite at least one evidence_id from this dossier.
```

### Output Schema (`CATEGORY_ANALYSIS_SCHEMA`)

```json
{
  "category": "string",
  "overview": "string (2-3 sentences)",
  "top_insights": [
    {
      "insight": "string (≤25 words)",
      "supporting_evidence_ids": ["raw_<id> or agg_<cat>_<metric>"],
      "confidence": "high | medium | low"
    }
  ],
  "early_signals": [
    {
      "signal": "string",
      "implication": "string",
      "supporting_evidence_ids": ["string"]
    }
  ],
  "outlook": {
    "statement": "string (1-2 sentences)",
    "supporting_evidence_ids": ["string"],
    "time_horizon": "3-6 months"
  },
  "analysis_confidence": "high | medium | low",
  "key_source_ids": ["string"]
}
```

### Deterministic Fallback

When `skipLlm=true`, no keys, or `source_count < 2`:
```js
{
  overview: "<N> sources identified in <category> this reporting period, with <X> classified as must-read.",
  top_insights: topItems.map(item => ({ insight: item.key_facts[0] || item.short_summary.slice(0, 120), ... })),
  early_signals: [],
  outlook: { statement: "Continued activity expected. Monitor high-priority sources for escalation.", ... },
  analysis_confidence: source_count >= 10 ? "medium" : "low",
  llm_used: false,
}
```

---

## Step 8C — Evidence Linking

**File:** `lib/pipeline/analysis/linkAnalysisEvidence.js`
**No LLM calls.** Fully deterministic.

Resolves all `supporting_evidence_ids` in the LLM output back to full evidence objects.

**ID formats resolved:**
- `raw_<source_id>` → full rawfact evidence item from the dossier
- `agg_<category>_<metric>` → full analytics evidence item from the dossier

**Process:**
1. Build flat index from all dossiers (`Map<evidence_id, {type, item}>`).
2. For each analysis, resolve IDs in `top_insights[].supporting_evidence_ids`, `early_signals[].supporting_evidence_ids`, `outlook.supporting_evidence_ids`.
3. Each insight/signal/outlook gains `resolved_evidence[]` — array of full evidence objects.
4. Build flat `citations[]` per analysis: `"Publisher — Title (Date)"` strings, deduplicated, from rawfact evidence only.

Unresolvable IDs are silently dropped. Step 8D's QA will flag any insight left with no `resolved_evidence`.

---

## Step 8D — Analysis QA

**File:** `lib/pipeline/analysis/qaCategoryAnalysis.js`
**LLM call:** Optional (disabled by default, `skipLlmQa=true`).

### Deterministic Pass (always runs)

**Insight checks:**
- `no_evidence_cited` — `supporting_evidence_ids` is empty
- `evidence_not_resolved` — `resolved_evidence` is empty (all IDs unresolvable)
- `insight_too_short` — insight text < 15 chars

**Early signal checks:**
- `no_evidence_cited`, `evidence_not_resolved`
- `signal_too_short` — signal < 10 chars
- `implication_too_short` — implication < 10 chars

**Outlook checks:**
- `no_evidence_cited`, `evidence_not_resolved`
- `statement_too_short` — statement < 20 chars

**Confidence downgrade:**
- `retention_rate < 0.5` → downgrade to `"low"`
- `retention_rate < 0.8` AND was `"high"` → downgrade to `"medium"`
- Outlook fails AND was `"high"` → downgrade to `"medium"`

### Optional LLM QA Pass (opt-in, `skipLlmQa: false`)

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | Any OPENAI/GEMINI key |
| Output format | Structured JSON (`LLM_QA_SCHEMA`) |
| Label | `"Layer8D-qa-<category>"` |

**System Prompt:**
```
You are a fact-checker for a strategic AI threat intelligence analysis.
Your task: verify that each insight is actually supported by the evidence provided.
Return strict JSON only. Do not invent facts.
```

**User Prompt:**
```
CATEGORY: <category>

For each insight below, verify it is genuinely supported by the evidence summaries provided.

[0] INSIGHT: "<insight text>"
  EVIDENCE: <evidence summary 1> | <evidence summary 2> | <evidence summary 3>

[1] INSIGHT: ...

Return: { insight_verdicts: [{ insight_index, supported: true/false, reason: '...' }] }
```

**Output schema:**
```json
{
  "insight_verdicts": [
    { "insight_index": number, "supported": boolean, "reason": "string" }
  ]
}
```

Unsupported verdicts add `"llm_unsupported: <reason>"` to the insight's `qa_issues` and set `qa_pass=false`.

---

## Output

```js
{
  category_analyses: object[],  // QA'd analyses, one per active category
  dossiers: object[],           // raw dossiers (threaded to slides layer)
  analysis_summary: {
    total_categories, total_insights, total_early_signals,
    categories_with_llm, categories_high_confidence,
    per_category: { [category]: { insights, early_signals, confidence, llm_used, citations } }
  },
  qa_report: {
    per_category: { [category]: { original, retained, removed, signal_issues, outlook_pass, adjusted_confidence, llm_qa_run } }
  },
  analysis_version: "analysis-v1.0",
}
```
