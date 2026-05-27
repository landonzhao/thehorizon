# Layer 8D — Category Analysis QA Prompt (Optional)

## Purpose

Optional LLM fact-checking pass that verifies each insight is actually supported by the
evidence it cites. The deterministic QA pass already checks structural requirements
(evidence IDs exist, insights are non-empty). The LLM QA pass checks semantic alignment:
does the cited evidence actually support the claim?

**Use only when:** high-stakes analysis review is needed. Skip for standard pipeline runs
(`skipLlmQa: true` by default).

Implementation: `lib/pipeline/analysis/qaCategoryAnalysis.js` (`runLlmQa()`)

---

## System Prompt

```
You are a fact-checker for a strategic AI threat intelligence analysis.
Your task: verify that each insight is actually supported by the evidence provided.
Return strict JSON only. Do not invent facts.
```

---

## User Prompt Template

```
CATEGORY: {{category}}

For each insight below, verify it is genuinely supported by the evidence summaries provided.

{{insights formatted as:
  [index] INSIGHT: "insight text"
    EVIDENCE: summary1 | summary2 | summary3
}}

Return: { insight_verdicts: [{ insight_index, supported: true/false, reason: '...' }] }
```

---

## Output Schema

```json
{
  "insight_verdicts": [
    {
      "insight_index": 0,
      "supported": true,
      "reason": "string (brief explanation)"
    }
  ]
}
```

---

## QA Behavior

**Deterministic pass (always runs):**
- Insight with no `supporting_evidence_ids` → removed, flagged `no_evidence_cited`
- Insight with IDs that don't resolve in dossier → removed, flagged `evidence_not_resolved`
- Insight text < 15 chars → removed, flagged `insight_too_short`
- Same checks for early_signals and outlook

**After deterministic pass:**
- Confidence is downgraded if > 50% of insights were removed
- If > 20% removed AND confidence was "high" → downgraded to "medium"

**LLM pass (optional, `skipLlmQa: false`):**
- Only runs on insights that passed the deterministic pass
- Inserts `llm_unsupported: <reason>` into `qa_issues` for failed insights
- Failed insights are then removed from `top_insights`

---

## Token Budget

- Input: ~500–1,000 tokens per category (insights + evidence summaries)
- Output: ~100–200 tokens per category
- Total (4 categories): ~2,400–5,000 tokens ≈ $0.0003–0.0005 at gpt-4o-mini pricing
