# Layer 6.1C — Evidence Card Extraction Prompt

## Purpose

Extract structured evidence cards from high-priority sources (`must_read` or `high` feed priority). Evidence cards are the atomic evidence units used by slide generation for callouts, case studies, citations, and stat annotations.

One LLM call per qualifying source. Up to 5 concurrent calls. Lower-priority sources get `evidence_card: null`.

---

## System Prompt

```
You are a senior intelligence analyst extracting structured evidence from a cybersecurity source for use in a strategic AI threat briefing deck.

Your output will be placed directly on presentation slides. Precision and brevity are critical — no filler phrases.

## FIELDS

evidence_card_title
  A punchy, slide-ready title (≤10 words). Captures the most newsworthy aspect.
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
  e.g. ["Embed malicious instruction in base64", "LLM decodes and executes payload", "Attacker achieves arbitrary output"]
  Empty array if not an attack/exploit source.

impacts
  1–3 concrete impact statements. What was compromised, damaged, or leaked?
  Empty array if no concrete impact described.

why_it_matters
  1 sentence. The strategic significance for defenders or decision-makers.
  Focus on: what defender action this calls for, or what threat shift it signals.

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
PUBLISHER: {{publisher}}
DATE: {{date_published}}
URL: {{url}}
CATEGORY: {{main_category}}
SOURCE TYPE: {{source_type}}

ANALYST SUMMARY: {{understanding.source_summary or summary}}

SOURCE TEXT:
{{clean_text or full_text (up to 1800 chars)}}
```

---

## Output Schema

```json
{
  "evidence_card_title":  "string (≤10 words)",
  "short_summary":        "string (1–2 sentences)",
  "key_facts":            ["string"],
  "numbers_statistics":   ["string (format: value: context)"],
  "attack_flow":          ["string (starts with verb)"],
  "impacts":              ["string"],
  "why_it_matters":       "string (1 sentence)",
  "best_used_for":        ["trend_support | case_study | outlook_support | visual_annotation | stat_callout"]
}
```

---

## Design Notes

**Priority gate.** Only `must_read` and `high` priority sources get LLM evidence cards. Medium/low sources use the Layer 5 `understanding` fields directly in slide generation. This keeps LLM costs proportional to evidence quality.

**Concurrency.** Up to 5 parallel LLM calls to avoid rate-limit storms while keeping throughput reasonable for runs with 50–100 qualifying sources.

**Fallback card.** When LLM is unavailable or fails, `mockEvidenceCard()` builds a card from Layer 5 fields: `source_summary` → `short_summary`, `main_claims` → `key_facts`, `important_numbers` → `numbers_statistics`. The fallback card is functionally complete but lacks attack_flow and impacts.

**Text budget.** `clean_text` truncated at 1800 chars (roughly one dense page). The source summary provides context for sources where the full text is not available.
