# Layer 8B — Category Analysis Prompt

## Purpose

One focused LLM call per active threat category. Produces a structured category brief
using ONLY the evidence in the dossier assembled by Layer 8A. Every insight, early signal,
and outlook statement must cite at least one `evidence_id` from the dossier.

**Evidence traceability is mandatory.** Claims without cited evidence are removed by Layer 8D QA.

Implementation: `lib/pipeline/analysis/analyzeCategory.js`

---

## System Prompt

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

---

## User Prompt Template

```
CATEGORY: {{category.toUpperCase()}}
Total sources in this category: {{source_count}}
Rawfact evidence items (top {{rawfact_evidence.length}} by priority and score):

{{rawfact_evidence formatted as:
  [evidence_id] title
    publisher=...  date=...  type=...  score=...  priority=...
    card: evidence_card_title (if present)
    summary: short_summary (200 chars max)
    key facts: fact1 | fact2 | fact3
    stats: stat1 | stat2
    attack flow: step1 → step2 → step3
    why it matters: (150 chars max)
    attack vectors: vector1, vector2
    signal clusters: cluster1, cluster2
    cluster: cluster_id (size, representative=true/false)
}}

ANALYTICS EVIDENCE (cite analytics_id to reference):
{{analytics_evidence formatted as:
  [analytics_id] metric_name: { key:count, key:count, ... (top 8) }
}}

Produce the category analysis for "{{category}}" using ONLY the evidence above.
Every insight and early_signal must cite at least one evidence_id from this dossier.
```

---

## Output Schema

```json
{
  "category": "string (returned unchanged)",
  "overview": "string (2–3 sentences, no evidence citations)",
  "top_insights": [
    {
      "insight": "string (≤25 words, declarative cross-source conclusion)",
      "supporting_evidence_ids": ["raw_<id>", "agg_<category>_<metric>"],
      "confidence": "high | medium | low"
    }
  ],
  "early_signals": [
    {
      "signal": "string (what is observed)",
      "implication": "string (why it matters in 3–6 months)",
      "supporting_evidence_ids": ["raw_<id>"]
    }
  ],
  "outlook": {
    "statement": "string (1–2 sentences, 3–6 month projection)",
    "supporting_evidence_ids": ["raw_<id>"],
    "time_horizon": "3-6 months"
  },
  "analysis_confidence": "high | medium | low",
  "key_source_ids": ["source_id (not evidence_id)"]
}
```

After LLM returns, `analyzeCategory.js` adds:
- `analysis_version` — "analysis-v1.0"
- `llm_used` — true

---

## Evidence ID Reference

| Format | Source |
|---|---|
| `raw_<source_id>` | Rawfact evidence item (built from source in dossier) |
| `agg_<category>_attack_vectors` | Analytics attack vector count for this category |
| `agg_<category>_maturity` | Maturity distribution for this category |
| `agg_<category>_signal_clusters` | Signal cluster counts for this category |
| `agg_<category>_operational_status` | Operational status distribution |

---

## Evidence Dossier Selection

Layer 8A selects up to 12 rawfact evidence items per category:
1. **Priority order**: must_read → high → medium → low → archive_only
2. **Within same priority**: cluster representatives before non-representative members
3. **Then by score descending**

Analytics evidence is always included (4 aggregate metrics per category).

---

## Token Budget

- Input: ~2,000–4,000 tokens per category (12 evidence items + 4 analytics items)
- Output: ~400–600 tokens per category
- Total per pipeline run (4 categories): ~10,000–20,000 tokens ≈ $0.001–0.002 at gpt-4o-mini pricing
