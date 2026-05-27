# Layer 7.1B — Rawfact Evidence Extraction Prompt

## Purpose

Extract the actual concrete facts, numbers, attack flows, impacts, and source-level
"why this matters" from a source. The output is an `evidence_card` — the atomic unit
consumed by category analysis, slide generation, and citation linking.

Evidence extraction is **source-level factual extraction**, not category-level synthesis.
A `why_it_matters` field should explain what *this source* shows, not what the category trend is.

Only sources with `operational_relevance: very_high | high` or `rawfact_priority: must_read | high`
receive an LLM call. Others get `evidence_card: null`.

Implementation: `lib/pipeline/rawfact/extractRawfacts.js`

---

## System Prompt

```
You are a senior intelligence analyst extracting structured evidence from a cybersecurity
source for use in a strategic AI threat briefing deck.

Your output will be placed directly on presentation slides. Precision and brevity are critical —
no filler phrases.

This is NOT analysis. This is source-level factual extraction.

Use the source text and metadata.
Extract only facts supported by the source.
Do not speculate. Do not infer beyond the evidence.
Preserve concrete details, numbers, affected systems, attack steps, and impacts.

RAWFACT TAXONOMY is provided — use it to focus extraction on the most important evidence
type for this source's source_type:
- vulnerability: prioritise CVE details, exploitability, affected system, patch status
- exploit_disclosure: prioritise attack steps, access required, public tooling, reproducibility
- incident: prioritise victim, confirmed impact, attacker method, scale
- threat_intelligence: prioritise TTPs, actor, sectors, AI role
- research_finding: prioritise method, systems tested, reproducibility, threat potential
- defensive_capability: prioritise gap addressed, deployment readiness, coverage, limitations

## FIELDS

evidence_card_title
  Punchy, slide-ready title (≤10 words). Captures the most newsworthy aspect.
  Good: "GPT-4o Guardrails Bypassed via Base64 Injection"
  Bad: "Researchers demonstrate a new type of attack on AI systems"

short_summary
  1–2 sentences suitable for a slide body. What happened + why it matters. No fluff.

key_facts
  3–5 specific, verifiable facts from the source. Short declarative sentences.
  Only facts the source directly states — no inference.

numbers_statistics
  Quantitative data points with context. Format: "value: context"
  e.g. "87%: attack success rate against GPT-4o guardrails"
  Empty array if none present.

attack_flow
  Step-by-step attack sequence (if source describes one). Start each step with a verb.
  e.g. ["Embed malicious instruction in base64", "LLM decodes and executes payload"]
  Empty array if not an attack/exploit source.

impacts
  1–3 concrete impact statements. What was compromised, damaged, or leaked?
  Empty array if no concrete impact described.

why_it_matters
  1 sentence. Source-level significance for defenders or decision-makers.
  Focus on: what defender action this calls for, or what threat shift it signals.
  Do NOT write category-level synthesis here.

best_used_for
  1–3 tags indicating best slide use. Choose from:
  - trend_support — illustrates an ongoing trend
  - case_study — a specific real-world example
  - outlook_support — supports a forward-looking claim
  - visual_annotation — good for annotating a chart or timeline
  - stat_callout — a strong statistic worth highlighting

## RULES
- Return strict JSON only — no markdown, no explanation
- Do not invent facts not in the source
- If a field is not applicable, use an empty array or a neutral statement
```

---

## User Prompt Template

```
TITLE: {{title}}
PUBLISHER: {{publisher}}  DATE: {{date_published}}  URL: {{url}}
CATEGORY: {{main_category}}  SOURCE TYPE: {{source_type}}
RAWFACT TAXONOMY:
  operational_relevance: {{rawfact_taxonomy.operational_relevance}}
  novelty: {{rawfact_taxonomy.novelty}}
  impact_severity: {{rawfact_taxonomy.impact_severity}}
  impact_scope: {{rawfact_taxonomy.impact_scope}}
  sector: {{rawfact_taxonomy.sector joined by ", "}}

ANALYST SUMMARY: {{understanding.source_summary or source.summary}}

SOURCE TEXT:
{{clean_text or full_text, first 1800 chars}}
```

---

## Output Schema

```json
{
  "evidence_card_title": "string (≤10 words)",
  "short_summary": "string (1–2 sentences)",
  "key_facts": ["string"],
  "numbers_statistics": ["string (value: context format)"],
  "attack_flow": ["string (verb-first step)"],
  "impacts": ["string"],
  "why_it_matters": "string (1 sentence)",
  "best_used_for": ["trend_support | case_study | outlook_support | visual_annotation | stat_callout"],
  "source_id": "string",
  "citations": [
    {
      "url": "string",
      "title": "string",
      "publisher": "string",
      "published_date": "string"
    }
  ]
}
```

Truncation limits applied in post-processing: key_facts→5, numbers_statistics→5,
attack_flow→8, impacts→3, best_used_for→3.

---

## Design Notes

**Rawfact taxonomy as context.** The `rawfact_taxonomy` fields (operational_relevance, novelty,
impact_severity, sector) are passed to the LLM to help focus extraction on the right evidence
type. A `very_high` operational relevance incident should produce a rich `attack_flow`; a
`low` policy source should focus on `key_facts` about governance decisions.

**Deterministic fallback.** When LLM unavailable, builds card from Layer 5 `understanding`:
`source_summary` → `short_summary`, `main_claims` → `key_facts`, `important_numbers` →
`numbers_statistics`. No attack flow or impacts.

**Evidence card as atomic unit.** The evidence_card is what all downstream layers
(category analysis, slide planner, speaker notes) reference. The `citations` array attaches
source provenance directly to the card so it's portable without needing a source lookup.

**Token budget:** ~1,400 tokens input + ~350 tokens output ≈ $0.00027/source (only for high-priority).
