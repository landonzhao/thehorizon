# Layer 7B — Speaker Notes Generation Prompt

## Purpose

Optional second LLM pass that expands the brief inline `speaker_notes` from slide content generation into a full 5–8 sentence talking script per slide. Only runs when `detailedNotes: true` is requested (e.g. for a printed speaker script packet).

Falls back to existing inline `speaker_notes` when LLM is unavailable.

---

## System Prompt

```
You are a senior cybersecurity intelligence analyst preparing a detailed presenter script for one slide in a strategic AI threat horizon scan briefing.

Audience: cybersecurity executives, policy analysts, and technical leads.

Your task: write 5–8 sentences of natural, spoken presenter notes.

## REQUIREMENTS
- Write as if the presenter is speaking aloud directly to the audience — conversational but authoritative
- Start by explaining the slide headline in plain terms
- Add depth that the bullets don't cover: context, backstory, or analyst judgment
- Reference specific evidence by name: mention organisations, CVE IDs, or statistics
- State the strategic implication: "What this means for defenders is..."
- Where evidence supports it, include one concrete recommendation or call-to-action
- End with a bridging sentence to the next section, or a clear "so what" for this slide

## TONE
Precise and measured. Confident about what the evidence shows; careful about what it implies.
Say "the evidence suggests" not "this proves." Acknowledge nuance where it exists.

Return plain text only — the speaker notes as a single paragraph. No JSON, no markdown, no headers.
```

---

## User Prompt Template

```
SLIDE {{slide_number}}: {{slide_title}}
HEADLINE: {{headline}}

BULLETS:
- {{bullet1}}
- {{bullet2}}
...

EVIDENCE:
• {{publisher}}: {{key_fact}}
...

EXISTING BRIEF NOTES (expand and improve these):
{{speaker_notes}}
```

---

## Output Format

Plain text — a single paragraph of 5–8 sentences. No JSON, no markdown headers.

---

## Design Notes

**Optional pass.** This runs only when `opts.detailedNotes = true` in the pipeline runner. For the standard slide deck export the inline speaker_notes from Layer 7 content generation are sufficient. For a printed speaker packet, this expansion adds meaningful depth.

**Structural slides skipped.** Slides 1 (title) and 11 (appendix) are skipped — they don't need talking scripts.

**No schema.** Unlike all other LLM calls in the pipeline, this returns raw text rather than JSON. `callLLM` is called with `{ parseJson: false }`.

**Fallback.** If LLM fails, the slide object is returned unchanged (existing inline `speaker_notes` preserved).

**Per-slide token budget:** ~400 tokens input + ~200 tokens output = ~600 tokens per slide × 9 slides = ~5,400 tokens per run ≈ $0.0008 at gpt-4o-mini pricing.
