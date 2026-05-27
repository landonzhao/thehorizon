# Layer 6.3 — Category Analysis Prompt

## Purpose

Produce a structured strategic brief for each active threat category before global viewpoint synthesis. Running one LLM call per category (instead of one call for all categories combined) lets the model focus deeply on each threat domain without context dilution.

The category analyses are passed as structured input to Layer 6.4 viewpoint synthesis. This two-step approach produces higher-quality viewpoints because the synthesis model receives pre-distilled category conclusions rather than hundreds of raw evidence snippets.

One LLM call per non-empty threat category (up to 5 calls). Up to 3 concurrent.

---

## System Prompt

```
You are a senior AI cybersecurity intelligence analyst. Your task is to analyze all evidence from ONE specific threat category and produce a structured category brief that will be used as input for a strategic presentation deck.

## YOUR ROLE
You are the category specialist for this threat domain. You have reviewed all sources in this category and must synthesize them into a concise, strategic analysis.

## FIELDS

category — the threat category name (return exactly as provided)

overview — 2–3 sentences. What is the dominant story in this category this reporting period? Focus on what changed or escalated, not just what exists.

top_insights — 3–5 non-obvious conclusions drawn from the evidence as a whole.
  Each insight should be a SHORT declarative sentence (≤25 words).
  Insights should be cross-source conclusions, NOT summaries of individual sources.
  Good: "Threat actors are combining LLM jailbreaks with automated pipeline exploitation to bypass enterprise AI guardrails at scale."
  Bad: "A new paper describes a prompt injection technique."

early_signals — 0–3 weak signals: topics with only 1–2 sources but high novelty or strategic significance.
  Each entry: "SIGNAL: [what] IMPLICATION: [why it matters in 3–6 months]"
  Empty array if no genuine early signals.

outlook — 1–2 sentences. Where is this category heading in the next 3–6 months based on the trajectory of current evidence? Be specific — name techniques, actors, or vectors.

recommended_visuals — 1–3 suggestions for charts or visuals that would best represent this category's data.
  E.g. "Timeline of incidents by month showing acceleration", "Radar chart of attack surface coverage"

confidence — high: 6+ quality sources | medium: 3–5 sources | low: 1–2 sources

key_source_ids — list of 3–5 source IDs (from the provided evidence) that were most influential in shaping this analysis.

## RULES
- Analyze only what the evidence supports — no speculation
- Do not repeat the same insight in multiple fields
- Return strict JSON only — no markdown, no preamble
```

---

## User Prompt Template

```
CATEGORY: {{CATEGORY NAME IN UPPERCASE}}
Total sources in category: {{count}}

TOP SOURCES (by score):
[{{source_id}}]{{[CLUSTER:cluster_id] if multi-source}} {{title}} — {{publisher}} ({{date}})
  Score: {{feed_score}} | Type: {{source_type}} | Priority: {{feed_priority}}
  Summary: {{evidence_card.short_summary or understanding.source_summary}}
  Key facts: {{evidence_card.key_facts[0:2] or understanding.main_claims[0:2]}}

CATEGORY ANALYTICS:
Source type breakdown:
  {{source_type}}: {{count}}
  ...
Maturity distribution:
  {{maturity}}: {{count}}
  ...
Top attack vectors: {{vector1}}, {{vector2}}, ...
```

The `[CLUSTER:...]` annotation appears when multiple sources have been grouped by `clusterRawfacts()` — it signals that the grouped sources likely describe the same event or campaign and should be treated as corroborating evidence.

---

## Output Schema

```json
{
  "category":            "string (exact category name)",
  "overview":            "string (2–3 sentences)",
  "top_insights":        ["string (≤25 words each, 3–5 items)"],
  "early_signals":       ["string (SIGNAL: ... IMPLICATION: ..., 0–3 items)"],
  "outlook":             "string (1–2 sentences)",
  "recommended_visuals": ["string (1–3 items)"],
  "confidence":          "high | medium | low",
  "key_source_ids":      ["string (3–5 source IDs)"]
}
```

---

## Design Notes

**Why per-category, not combined?** A single LLM call with all 500+ sources as context produces shallow, generic viewpoints. Per-category calls allow the model to reason about each threat domain in depth (8 top sources instead of 500) and surface genuinely non-obvious insights per category.

**Cluster annotations.** The `[CLUSTER:...]` tag in the prompt tells the model that multiple sources cover the same event. Without this signal, the model might count 3 sources about the same jailbreak as 3 independent data points. With it, the model can recognize corroboration vs. independent discovery.

**Top-N selection.** Only the top 8 sources per category (by feed score) are included in the prompt. This keeps the user prompt under ~2,500 tokens while ensuring the most authoritative sources drive the analysis.

**Deterministic fallback.** When LLM is unavailable, `deterministicCategoryAnalysis()` builds a brief from Layer 5 `main_claims` and evidence card `key_facts`. Confidence defaults to `low`. Early signals and outlook are generic placeholders.

**Token budget per category:** ~1,800–2,200 tokens → ~5 calls × ~2,000 = ~10,000 tokens per pipeline run ≈ $0.0015 at gpt-4o-mini pricing.
