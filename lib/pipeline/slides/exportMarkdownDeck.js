/**
 * Layer 7 — Markdown Deck and Speaker Script Exporter
 *
 * Fully deterministic — no LLM calls. Converts finalized slide content objects
 * (from generateSlideContent + generateSpeakerNotes) to formatted Markdown strings.
 *
 * ── EXPORTED FUNCTIONS ───────────────────────────────────────────────────────
 * exportMarkdownDeck(slides) → string
 *   Full deck in Markdown: slide number, type, headline, bullets, evidence
 *   callouts (publisher + key_fact), citations. Structural slides (title,
 *   section_divider, appendix) use simplified formatting.
 *
 * exportSpeakerScript(slides) → string
 *   Speaker notes only: slide number + title header, then speaker_notes field
 *   (LLM-generated prose or deterministic fallback). Non-structural slides only.
 *
 * ── FIELD REFERENCES ─────────────────────────────────────────────────────────
 * Uses slide.title (set by generateSlideContent; falls back to slide.slide_title
 * for compatibility with older plan objects that used slide_title).
 * Evidence callouts: slide.evidence_callouts[].publisher + .key_fact
 * Citations: slide.citations[] (plain strings)
 * Speaker notes: slide.speaker_notes (plain text paragraph)
 */

function formatDate() {
  return new Date().toISOString().slice(0, 10);
}

function renderEvidenceCallouts(callouts) {
  if (!callouts || callouts.length === 0) return "";
  const lines = callouts
    .map((c) => `> **${c.publisher}** — *${c.title}*\n> ${c.key_fact}`)
    .join("\n\n");
  return `**Evidence:**\n\n${lines}\n`;
}

function renderCitations(citations) {
  if (!citations || citations.length === 0) return "";
  const lines = citations.map((c) => `- ${c}`).join("\n");
  return `**Citations:**\n${lines}\n`;
}

/**
 * Export the slide deck as a Markdown string.
 *
 * @param {object[]} slides - generated slide content objects
 * @returns {string} markdown deck
 */
export function exportMarkdownDeck(slides) {
  const header = `# AI Cyber Threat Horizon Scan\n## ${formatDate()}\n\n---\n\n`;

  const slidePages = slides.map((slide) => {
    const title = `## Slide ${slide.slide_number}: ${slide.title || slide.slide_title}`;
    const headline = slide.headline
      ? `### ${slide.headline}\n`
      : "";
    const bullets =
      slide.bullets && slide.bullets.length > 0
        ? slide.bullets.map((b) => `- ${b}`).join("\n") + "\n"
        : "";
    const viz =
      slide.visualization
        ? `\n**Visualization:** \`${slide.visualization.viz_id}\` — ${slide.visualization.caption}\n`
        : "";
    const evidence = renderEvidenceCallouts(slide.evidence_callouts);
    const speakerNotes = slide.speaker_notes
      ? `**Speaker Notes:**\n> ${slide.speaker_notes.replace(/\n/g, "\n> ")}\n`
      : "";
    const citations = renderCitations(slide.citations);

    return [title, headline, bullets, viz, evidence, speakerNotes, citations]
      .filter(Boolean)
      .join("\n");
  });

  return header + slidePages.join("\n\n---\n\n");
}

/**
 * Export the full speaker script as a Markdown string.
 *
 * @param {object[]} slides - generated slide content objects
 * @returns {string} markdown speaker script
 */
export function exportSpeakerScript(slides) {
  const header = `# AI Cyber Threat Horizon Scan — Speaker Script\n\n---\n\n`;

  const slideScripts = slides.map((slide) => {
    const title = `## Slide ${slide.slide_number}: ${slide.title || slide.slide_title}`;
    const speakerNotes = slide.speaker_notes || "(No speaker notes)";

    const talkingPoints =
      slide.bullets && slide.bullets.length > 0
        ? `### Talking Points:\n${slide.bullets.map((b) => `- ${b}`).join("\n")}\n`
        : "";

    const evidenceRef =
      slide.evidence_callouts && slide.evidence_callouts.length > 0
        ? `### Evidence to Reference:\n${slide.evidence_callouts
            .map((c) => `- **${c.publisher}**: ${c.key_fact}`)
            .join("\n")}\n`
        : "";

    return [title, speakerNotes, "", talkingPoints, evidenceRef]
      .filter((s) => s !== undefined)
      .join("\n");
  });

  return header + slideScripts.join("\n---\n\n");
}
