/**
 * Layer 7 — Speaker Script Generator
 *
 * Runs AFTER slide content is finalized (Step 3 of the slides layer).
 * Generates 5–8 sentence presenter notes per slide using ONLY the finalized
 * slide content — no new claims may be introduced by the LLM.
 *
 * MUST be called after generateSlideContent(), never before or concurrently.
 *
 * ── LLM CALL ─────────────────────────────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 * Trigger: any OpenAI or Gemini key present AND skipLlm=false
 *          AND slide_type NOT IN (title, appendix)
 * Output:  plain text (parseJson: false) — a single spoken paragraph
 * Label:   "Layer7-notes-<slide_number>"
 * Concurrency: 3 parallel calls (default)
 *
 * System prompt: SYSTEM_PROMPT (constant, lines 18–36)
 *   Senior cybersecurity intelligence analyst presenter role.
 *   Requirements: 5–8 sentences, conversational but authoritative, starts with
 *   headline in plain terms, adds depth beyond bullets, references specific
 *   evidence by publisher/statistic/CVE, states strategic implication for
 *   defenders, one concrete call-to-action, bridging sentence at end.
 *   Hard rule: DO NOT introduce any claim not present in the provided slide content.
 *   Output: plain text paragraph only — no JSON, no markdown.
 *
 * User prompt: buildPrompt(slide) — slide number, type, headline, bullets,
 *   evidence callouts (publisher + key_fact), up to 3 citations, speaker intent.
 *
 * Fallback (no keys or skipLlm=true):
 *   deterministicNotes() — joins headline + key bullets + first evidence callout
 *   + speaker_note_intent into a brief paragraph.
 *   Structural slides (title, appendix): use speaker_note_intent directly.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * Returns slide with speaker_notes field set (plain text string).
 */

import { callLLM } from "../../llm/callLLM.js";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior cybersecurity intelligence analyst writing a presenter script for one slide in a strategic AI threat horizon scan briefing.

Audience: cybersecurity executives, policy analysts, and technical leads.

## TASK
Write 5–8 sentences of natural spoken presenter notes.

## REQUIREMENTS
- Write as if speaking aloud — conversational but authoritative
- Start with the headline in plain terms
- Add depth bullets don't cover: context, backstory, analyst judgment
- Reference specific evidence by publisher, statistic, or CVE where present
- State strategic implication: "What this means for defenders is..."
- Include one concrete recommendation or call-to-action where evidence supports it
- End with a bridging sentence or clear "so what"
- DO NOT introduce any claim not present in the provided slide content
- DO NOT invent facts, numbers, or sources

Return plain text only — a single paragraph. No JSON, no markdown.`;

// ── User prompt builder ───────────────────────────────────────────────────────

function buildPrompt(slide) {
  const parts = [
    `SLIDE ${slide.slide_number}: ${slide.title}`,
    `TYPE: ${slide.slide_type}`,
    `HEADLINE: ${slide.headline || "(none)"}`,
  ];

  if (slide.bullets?.length) {
    parts.push(`BULLETS:\n${slide.bullets.map((b) => `- ${b}`).join("\n")}`);
  }

  if (slide.evidence_callouts?.length) {
    parts.push(`EVIDENCE CALLOUTS:\n${slide.evidence_callouts
      .map((c) => `• ${c.publisher}: ${c.key_fact}`)
      .join("\n")}`);
  }

  if (slide.citations?.length) {
    parts.push(`CITATIONS:\n${slide.citations.slice(0, 3).join("\n")}`);
  }

  if (slide.speaker_note_intent) {
    parts.push(`INTENT (what this slide should accomplish):\n${slide.speaker_note_intent}`);
  }

  parts.push("\nWrite the presenter script paragraph (5–8 sentences). Do not add claims not in the slide content above.");

  return parts.join("\n\n");
}

// ── Deterministic fallback ────────────────────────────────────────────────────

function deterministicNotes(slide) {
  const parts = [`${slide.headline || slide.title}.`];

  if (slide.bullets?.length) {
    parts.push(`Key points: ${slide.bullets.slice(0, 3).join("; ")}.`);
  }

  if (slide.evidence_callouts?.length) {
    const ev = slide.evidence_callouts[0];
    parts.push(`${ev.publisher} reports: ${ev.key_fact}`);
  }

  if (slide.speaker_note_intent) {
    parts.push(slide.speaker_note_intent);
  }

  return parts.join(" ");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate speaker notes for a single finalized slide.
 *
 * @param {object}  slide
 * @param {object}  [opts]
 * @param {boolean} [opts.skipLlm=false]
 * @returns {Promise<object>} Slide with `speaker_notes` field set.
 */
export async function generateSpeakerNotes(slide, opts = {}) {
  const { skipLlm = false } = opts;

  // Structural slides — use intent as notes
  if (slide.slide_type === "title" || slide.slide_type === "appendix") {
    return { ...slide, speaker_notes: slide.speaker_note_intent || "" };
  }

  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  if (!hasLlm) {
    return { ...slide, speaker_notes: deterministicNotes(slide) };
  }

  try {
    const notes = await callLLM(SYSTEM_PROMPT, buildPrompt(slide), {
      parseJson: false,
      logLabel:  `Layer7-notes-${slide.slide_number}`,
    });
    const text = typeof notes === "string" ? notes.trim() : deterministicNotes(slide);
    return { ...slide, speaker_notes: text };
  } catch (err) {
    process.stdout.write(
      `  [Layer 7] Speaker notes failed for slide ${slide.slide_number}: ${err.message} — using fallback\n`
    );
    return { ...slide, speaker_notes: deterministicNotes(slide) };
  }
}

/**
 * Generate speaker notes for all slides in the deck.
 * Called AFTER slide content is fully finalized (QA'd).
 *
 * @param {object[]} slides
 * @param {object}   [opts]
 * @param {number}   [opts.concurrency=3]
 * @returns {Promise<object[]>}
 */
export async function generateSpeakerNotesForDeck(slides, opts = {}) {
  const { concurrency = 3 } = opts;
  const results = [];

  for (let i = 0; i < slides.length; i += concurrency) {
    const batch = slides.slice(i, i + concurrency);
    const done = await Promise.all(batch.map((s) => generateSpeakerNotes(s, opts)));
    results.push(...done);
  }

  return results;
}
