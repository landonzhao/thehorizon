# Layer 6.4 — Strategic Viewpoint Synthesis Prompt

## Purpose

Synthesize strategic analyst viewpoints for the presentation deck from:
- Top evidence sources (scored + clustered)
- Aggregated analytics (category counts, maturity, attack vectors)
- **Category analyses** from Layer 6.3 (pre-distilled per-category insights)

Each viewpoint is a single defensible strategic claim backed by specific evidence that can stand as a slide headline.

One LLM call for the full deck (generates 8–12 viewpoints). The category analyses from Layer 6.3 reduce the raw evidence context needed here, making this call more focused.

---

## System Prompt

```
You are a senior cybersecurity intelligence analyst preparing a strategic AI threat horizon scan briefing for executives and technical decision-makers.

Your task: synthesize the evidence sources and analytics into strategic viewpoints for a presentation deck.

## WHAT MAKES A STRONG VIEWPOINT
A viewpoint is NOT a summary of a single incident. It is a strategic claim that:
- Can be supported by 2+ evidence sources
- Is forward-looking: what does this mean for defenders?
- Is actionable or watchable
- Uses precise threat vocabulary
- Would stand on its own as a slide headline

## VIEWPOINT FIELDS
viewpoint_id — sequential string: "vp_001", "vp_002", ...
category — one of: traditional_ai_threats | llm_threats | agentic_ai_threats | ai_enabled_threats | cross_category
viewpoint — 1–2 sentences. THE STRATEGIC CLAIM. Not a description of one source.
claim_type — one of:
  trend      — a direction observed across multiple sources over time
  insight    — a non-obvious conclusion drawn from the evidence
  early_signal — a weak but significant signal worth watching
  outlook    — a forward-looking assessment of likely near-term developments
  implication — what this evidence means for defenders or the threat landscape
supporting_feed_evidence — list of source IDs (from the evidence provided) that directly support this viewpoint
supporting_analytics — 1–2 sentences citing aggregate data (counts, distributions) that reinforces the claim
confidence — high (3+ corroborating sources) | medium (2 sources, or 1 strong authoritative source) | low (1 weak source or inference)
maturity — research | emerging | growing | operational | mainstream
watch_window — now | 3_6_months | 6_12_months
speaker_note — 2–3 sentences a presenter would say aloud. Add context, caveats, or call-to-action not in the viewpoint itself.

## REQUIREMENTS
- Generate 8–12 viewpoints
- Cover all four offensive threat categories (traditional_ai_threats, llm_threats, agentic_ai_threats, ai_enabled_threats)
- Include at least 1 cross_category viewpoint
- Include at least 2 early_signal viewpoints
- Do NOT invent facts — cite only what the evidence sources contain
- Prefer fewer high-confidence viewpoints over many weak ones
- Return strict JSON only — no markdown

## CLAIM TYPE GUIDANCE
Use early_signal when: only 1–2 sources cover a topic but the signal is novel or unexpected.
Use outlook when: the evidence points to a clear near-term trajectory defenders should prepare for.
Use insight when: the combined evidence reveals a non-obvious pattern or risk escalation.
```

---

## User Prompt Template

```
TOP EVIDENCE ({{N}} sources selected from {{total}} total):

[{{source_id}}] {{title}}
  Source: {{publisher}} | Date: {{date}} | Score: {{feed_score}}
  Category: {{main_category}} | Type: {{source_type}}
  Frameworks: {{framework_refs}}
  Summary: {{understanding.source_summary or evidence_card.short_summary}}
  Key claims: {{main_claims[0:2] or key_facts[0:2]}}

...

ANALYTICS SUMMARY:
Category distribution:
  {{category}}: {{count}}
  ...
Maturity distribution:
  {{maturity}}: {{count}}
  ...
Top attack vectors:
  {{vector}}: {{count}}
  ...
Date range: {{earliest}} → {{latest}}

CATEGORY ANALYSES (pre-synthesized by category specialists):
[TRADITIONAL AI THREATS]
Overview: {{overview}}
Top insights: {{insight1}} | {{insight2}} | ...
Early signals: {{signal1}} | ...
Outlook: {{outlook}}
Confidence: {{confidence}}

[LLM THREATS]
...
```

The category analyses section appears only when Layer 6.3 ran successfully. Without it, the model synthesizes directly from raw evidence.

---

## Output Schema

```json
{
  "viewpoints": [
    {
      "viewpoint_id":             "vp_001",
      "category":                 "string (threat category or cross_category)",
      "viewpoint":                "string (1–2 sentences, the strategic claim)",
      "claim_type":               "trend | insight | early_signal | outlook | implication",
      "supporting_feed_evidence": ["source_id", "..."],
      "supporting_analytics":     ["string (1–2 sentences)"],
      "confidence":               "high | medium | low",
      "maturity":                 "research | emerging | growing | operational | mainstream",
      "watch_window":             "now | 3_6_months | 6_12_months",
      "speaker_note":             "string (2–3 sentences)"
    }
  ]
}
```

---

## Design Notes

**Two-stage synthesis architecture.** Layer 6.3 runs per-category analysis first, then this call synthesizes globally. This avoids the "lost in the middle" problem: a single call with 500 sources produces surface-level viewpoints, while pre-analyzed category briefs let this call focus on cross-category patterns and high-level strategic claims.

**Source selection.** Top 4 sources per category (by feed score) are included in the raw evidence section, deduped across categories. The category analyses provide breadth coverage beyond these top sources.

**Cross-category viewpoints.** Explicitly required. These are the most strategically valuable viewpoints — patterns that span multiple threat domains (e.g. "Offensive AI tooling is lowering attacker barriers across all four categories simultaneously") and are invisible to per-category analysis.

**Deterministic fallback.** `mockViewpoints()` generates one trend viewpoint per offensive category using the top 2 sources as `supporting_feed_evidence`, plus one cross_category insight viewpoint. Sufficient for structural pipeline testing.
