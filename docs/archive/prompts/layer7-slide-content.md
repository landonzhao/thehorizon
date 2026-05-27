# Layer 7 — Slide Content Generation Prompt

## Purpose

Generate structured slide content for each content slide in the deck. Takes a slide plan entry (from slide planning) plus the viewpoints and evidence sources it references, and produces: headline, bullets, evidence callouts, speaker notes, citations, and optional visualization reference.

One LLM call per content slide (slides 2–10; slides 1 and 11 are structural and use mock content). Calls run sequentially to avoid rate-limit issues on a 9-slide content batch.

---

## System Prompt

```
You are creating content for a professional AI cybersecurity threat horizon scan presentation deck.

Style: concise, strategic, evidence-backed. Suitable for government and conference briefings.

## FIELD REQUIREMENTS

slide_title — Keep the provided title exactly unless it is clearly wrong.

headline — The single strongest strategic statement for this slide (1 sentence, ≤20 words).
  Must be a strategic INSIGHT or CLAIM, not a description.
  Good: "Prompt injection has moved from research to operational exploitation in 12 months."
  Bad: "This slide covers prompt injection attacks."

bullets — 3–5 points (max 15 words each). Each bullet must be a distinct claim or fact.
  No bullet should repeat the headline. No filler bullets.

visualization — Only include if a viz_id from the provided list fits this slide naturally.
  Omit if no visualization fits — set to null.

evidence_callouts — 1–3 callouts from the provided evidence sources.
  key_fact must be a SPECIFIC fact from that source (number, name, or concrete claim).
  Do not invent facts.

speaker_notes — 3–5 sentences. Explain WHY this matters, not just WHAT it says.
  Reference evidence by publisher or CVE. Include strategic implication for defenders.

citations — Publisher + source title strings for all evidence sources used.

## ABSOLUTE RULES
- Do not speculate or invent facts not in the provided evidence
- Each claim must be traceable to the provided viewpoints or evidence
- Return strict JSON only — no markdown, no preamble
```

---

## User Prompt Template

```
SLIDE {{slide_number}}: {{slide_title}}
Purpose: {{slide_purpose}}
Core message: {{core_message}}
Goal: {{speaker_script_goal}}
{{Preferred visualization: {{viz_id}} | No specific visualization required}}

VIEWPOINTS:
[{{viewpoint_id}}] ({{category}}, {{claim_type}}, confidence:{{confidence}})
{{viewpoint}}
Speaker note: {{speaker_note}}

...

EVIDENCE:
[{{source_id}}] {{title}} — {{publisher}} ({{date}})
Summary: {{evidence_card.short_summary or understanding.source_summary}}
Key facts: {{evidence_card.key_facts[0:2] or understanding.main_claims[0:2]}}

...

ANALYTICS:
{{analytics_used lines}}
```

---

## Output Schema

```json
{
  "slide_title":  "string",
  "headline":     "string (≤20 words, strategic claim)",
  "bullets":      ["string (≤15 words each, 3–5 items)"],
  "visualization": {
    "viz_id":  "string",
    "caption": "string"
  },
  "evidence_callouts": [
    {
      "title":     "string",
      "key_fact":  "string (specific fact, not generic)",
      "publisher": "string"
    }
  ],
  "speaker_notes": "string (3–5 sentences)",
  "citations":     ["string (publisher — title format)"]
}
```

`visualization` may be `null` if no visualization fits the slide.

---

## Design Notes

**Structural slides bypass LLM.** Slides 1 (title) and 11 (appendix) always use mock content. Slide 11 populates `citations` with the top 30 sources by feed score — the appendix is a reference list, not a content slide.

**Evidence traceability.** The `evidence_used` list in the slide plan limits which sources appear in the evidence section of the user prompt. The LLM can only cite what it's given, preventing hallucinated citations.

**Citation deduplication.** The mock path deduplicates citations using a Set. The LLM path returns raw citations from the model; downstream QA checks for missing publishers.

**Fallback.** `mockSlideContent()` assembles content from Layer 6 viewpoints and evidence objects directly: viewpoint text → headline/bullets, evidence cards → callouts. No LLM required for structural testing.

**Per-slide token budget:** ~1,200 tokens input + ~500 tokens output = ~1,700 tokens per slide × 9 content slides ≈ 15,300 tokens per run ≈ $0.0023 at gpt-4o-mini pricing.
