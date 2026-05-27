# Layer 7.1C — Rawfact Semantic Scoring Prompt (Optional)

## Purpose

Optional LLM pass that supplements the deterministic scorer when key semantic fields
(`novelty`, `operational_relevance`, `evidence_concreteness`, `strategic_usefulness`)
could not be reliably determined from the rawfact taxonomy fields.

**Use only when:**
- `rawfact_taxonomy.llm_used === false` (taxonomy ran in fallback mode), AND
- Source has an offensive `main_category` (not `unclear_or_adjacent`), AND
- Initial rawfact_score is in the 40–70 band (where these fields matter most for priority tier)

For all other sources, skip this step — the deterministic scorer is sufficient.

Implementation: `lib/pipeline/rawfact/scoreRawfacts.js` (`semanticScoreBoost()` optional step)

---

## System Prompt

```
You are scoring a source's usefulness as factual evidence for an AI-cyber horizon scan.

Do not rescore everything.
Only judge these four semantic fields — use the source metadata provided:

novelty
  How new is the attack surface, tactic, or capability described?
  new_attack_surface → 10
  new_tactic → 8
  known_tactic_new_scale → 5
  known_tactic → 3
  incremental → 1
  unknown → 0

operational_relevance
  How actionable is this for defenders right now?
  very_high → 10
  high → 7
  medium → 4
  low → 1
  none → 0

evidence_concreteness
  How specific and verifiable are the facts?
  10 = multiple concrete facts, numbers, attack steps
  5  = some facts, limited detail
  0  = vague or opinion-only

strategic_usefulness
  How useful for a strategic deck briefing?
  10 = direct evidence for a key claim
  5  = supporting context
  0  = tangential

Return strict JSON only — no markdown, no prose outside JSON.
```

---

## User Prompt Template

```
SOURCE TYPE: {{source_type}}
MAIN CATEGORY: {{main_category}}
TRUST TIER: {{trust_tier}}
DATE: {{date_published}}

SUMMARY: {{understanding.source_summary or source.summary}}
PRIMARY SUBJECT: {{understanding.primary_subject}}

MAIN CLAIMS:
{{main_claims as numbered list}}

KEY ENTITIES: {{key_entities joined by ", "}}
IMPORTANT NUMBERS: {{important_numbers joined by " | "}}

EXISTING TAXONOMY:
  operational_relevance: {{rawfact_taxonomy.operational_relevance}}
  novelty: {{rawfact_taxonomy.novelty}}
  impact_severity: {{rawfact_taxonomy.impact_severity}}

Assess the four semantic scoring fields above.
```

---

## Output Schema

```json
{
  "novelty_score": 0,
  "operational_relevance_score": 0,
  "evidence_concreteness_score": 0,
  "strategic_usefulness_score": 0,
  "reason": "string (one sentence)"
}
```

Score range for each field: 0–10.

## How the boost is applied

```
semantic_boost = (novelty_score + operational_relevance_score + evidence_concreteness_score + strategic_usefulness_score) / 4
                 × 0.2   // max 2-point adjustment to final rawfact_score
```

The boost is capped at ±5 points — it can lift a source from low-medium to medium, but
cannot change a source's priority tier by more than one band.

---

## Design Notes

**Rarely needed in practice.** When Layer 5 taxonomy ran with LLM, the rawfact_taxonomy
already has `novelty` and `operational_relevance` filled in semantically. The deterministic
scorer reads those directly. This prompt only runs when taxonomy was fallback-only.

**Do not rescore everything.** The prompt explicitly instructs the LLM not to reconsider
base credibility, recency, or source-type-specific fields — those are already handled
deterministically and are not improved by semantic guessing.

**Token budget:** ~500 tokens input + ~100 tokens output ≈ $0.00006/source (rarely triggered).
