/**
 * Layer 8 QA — Number and Phrase Validation
 *
 * Three checks:
 *   validateNumbers         — percentage range, plausible year references
 *   checkNumberConsistency  — statistics cited in slides traced back to source text
 *   checkBannedPhrases      — filler/LLM-verbosity phrases that degrade slide quality
 */

// ── Banned phrases ────────────────────────────────────────────────────────────
// Filler and verbosity patterns that shouldn't appear in professional slide content.

const BANNED_PHRASES = [
  "it is important to note",
  "it's important to note",
  "it is worth noting",
  "it's worth noting",
  "needless to say",
  "with that being said",
  "having said that",
  "in conclusion",
  "in summary",
  "to summarize",
  "as mentioned previously",
  "as previously mentioned",
  "as we can see",
  "at the end of the day",
  "moving forward",
  "going forward",
  "in today's world",
  "in today's digital landscape",
  "in the digital age",
  "it cannot be overstated",
  "plays a crucial role",
  "plays a pivotal role",
  "it goes without saying",
  "it should be noted that",
  "this is a complex issue",
  "delve into",
  "dive into",
];

const YEAR_MIN = 2020;
const YEAR_MAX = 2030;

// ── validateNumbers ───────────────────────────────────────────────────────────

/**
 * Check that numbers appearing in headlines, bullets, and speaker notes are
 * structurally plausible: percentages in 0–100 range, year references recent.
 *
 * @param {object[]} slides
 * @returns {object[]} issues
 */
export function validateNumbers(slides) {
  const issues = [];

  for (const slide of slides) {
    const texts = [
      { field: "headline",       text: slide.headline || "" },
      { field: "bullets",        text: (slide.bullets || []).join(" ") },
      { field: "speaker_notes",  text: slide.speaker_notes || "" },
    ];

    for (const { field, text } of texts) {
      // Percentage range
      for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
        const val = parseFloat(m[1]);
        if (val > 100) {
          issues.push({
            slide_number: slide.slide_number,
            check:    "invalid_percentage",
            severity: "error",
            field,
            message:  `Slide ${slide.slide_number} ${field}: percentage ${val}% exceeds 100.`,
          });
        }
      }

      // Implausible year references
      for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
        const year = parseInt(m[1]);
        if (year < YEAR_MIN || year > YEAR_MAX) {
          issues.push({
            slide_number: slide.slide_number,
            check:    "implausible_year",
            severity: "warning",
            field,
            message:  `Slide ${slide.slide_number} ${field}: year ${year} is outside the expected range ${YEAR_MIN}–${YEAR_MAX}.`,
          });
        }
      }
    }
  }

  return issues;
}

// ── checkNumberConsistency ────────────────────────────────────────────────────

/**
 * Verify that percentage statistics cited in slide headlines and bullets appear
 * somewhere in the collected source text. Unverified statistics are flagged
 * as warnings (not errors — the LLM may have rephrased a valid claim).
 *
 * @param {object[]} slides
 * @param {object[]} feedSources - Sources with `full_text`, `clean_text`, or `understanding`.
 * @returns {object[]} issues
 */
export function checkNumberConsistency(slides, feedSources) {
  const issues = [];

  // Build a corpus from all source text + LLM-extracted numbers
  const corpus = feedSources
    .map((s) => [
      s.title            || "",
      s.clean_text       || "",
      s.full_text        || "",
      (s.understanding?.important_numbers || []).join(" "),
      (s.evidence_card?.numbers_statistics || []).join(" "),
    ].join(" "))
    .join(" ")
    .toLowerCase();

  for (const slide of slides) {
    const headline = slide.headline || "";
    const bullets  = (slide.bullets || []).join(" ");

    for (const text of [headline, bullets]) {
      for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
        const numStr  = m[1];
        const inCorpus = corpus.includes(numStr + "%")
          || corpus.includes(numStr + " %")
          || corpus.includes(numStr + " percent");

        if (!inCorpus) {
          issues.push({
            slide_number: slide.slide_number,
            check:    "unverified_statistic",
            severity: "warning",
            message:  `Slide ${slide.slide_number}: statistic "${numStr}%" not found in source text — verify accuracy.`,
          });
        }
      }
    }
  }

  return issues;
}

// ── checkBannedPhrases ────────────────────────────────────────────────────────

/**
 * Scan slide headlines, bullets, and speaker notes for filler and LLM-verbosity
 * phrases that degrade the professionalism of slide content.
 *
 * @param {object[]} slides
 * @returns {object[]} issues
 */
export function checkBannedPhrases(slides) {
  const issues = [];

  for (const slide of slides) {
    const fields = {
      headline:      slide.headline      || "",
      bullets:       (slide.bullets      || []).join(" "),
      speaker_notes: slide.speaker_notes || "",
    };

    for (const [field, text] of Object.entries(fields)) {
      const lower = text.toLowerCase();
      for (const phrase of BANNED_PHRASES) {
        if (lower.includes(phrase)) {
          issues.push({
            slide_number: slide.slide_number,
            check:    "banned_phrase",
            severity: "warning",
            field,
            phrase,
            message:  `Slide ${slide.slide_number} ${field}: contains filler phrase "${phrase}".`,
          });
        }
      }
    }
  }

  return issues;
}
