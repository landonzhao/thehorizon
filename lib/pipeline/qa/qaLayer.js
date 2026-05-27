/**
 * QA Layer — Final quality gate before deck delivery.
 *
 * Runs four deterministic check modules:
 *   1. Viewpoint QA        — no-op (viewpoints replaced by category_analyses in Layer 8)
 *   2. Slide QA            — structural checks on every slide
 *   3. Citation validation — callout field integrity + high-priority source coverage
 *   4. Number/phrase QA    — percentage range, year plausibility, banned filler phrases
 *
 * All checks are deterministic — no LLM calls.
 *
 * Input:  deckResult (Layer 7) + synthesisResult (Layer 6/8).
 * Output: { overall_pass, viewpoint_qa, slide_qa, citation_qa, number_qa, summary, qa_version }.
 */

import { qaViewpoints }           from "./qaViewpoints.js";
import { qaSlides }               from "./qaSlides.js";
import { validateCitations, checkCitationCoverage } from "./validateCitations.js";
import { validateNumbers, checkNumberConsistency, checkBannedPhrases } from "./validateNumbers.js";

export const QA_VERSION = "qa-v8.0";

/**
 * Run the full Layer 8 QA pipeline.
 *
 * @param {object} deckResult       - Output of runSlidesLayer() (Layer 7).
 * @param {object} synthesisResult  - Output of runSynthesisLayer() (Layer 6).
 * @returns {QAResult}
 */
export function runQALayer(deckResult, synthesisResult) {
  const { slides, slide_plan }       = deckResult;
  const { feed_sources, viewpoints } = synthesisResult;

  if (!slides?.length) {
    return {
      overall_pass: false,
      viewpoint_qa: { passed: 0, failed: 0, qa_issues: [], overall_pass: true },
      slide_qa:     { passed: 0, failed: 0, qa_issues: [], overall_pass: true },
      citation_qa:  { high_priority: 0, covered: 0, coverage_pct: 100, issues: [] },
      number_qa:    { issues: [] },
      summary: {
        total_issues: 1,
        errors:   1,
        warnings: 0,
        infos:    0,
        all_issues: [{ module: "qa", check: "has_slides", severity: "error", message: "No slides were generated." }],
      },
      qa_version: QA_VERSION,
    };
  }

  // ── 1. Viewpoint QA ───────────────────────────────────────────────────────
  const viewpoint_qa = qaViewpoints(viewpoints || [], feed_sources || []);

  // ── 2. Slide QA ───────────────────────────────────────────────────────────
  const slide_qa = qaSlides(slides, viewpoints || [], feed_sources || [], slide_plan || []);

  // ── 3. Citation validation ────────────────────────────────────────────────
  const citation_struct   = validateCitations(slides, feed_sources || []);
  const citation_coverage = checkCitationCoverage(slides, feed_sources || [], slide_plan || []);
  const citation_qa = {
    high_priority: citation_coverage.high_priority,
    covered:       citation_coverage.covered,
    coverage_pct:  citation_coverage.coverage_pct,
    issues: [...citation_struct.issues, ...citation_coverage.issues],
  };

  // ── 4. Number + phrase QA ─────────────────────────────────────────────────
  const number_issues      = validateNumbers(slides);
  const consistency_issues = checkNumberConsistency(slides, feed_sources || []);
  const phrase_issues      = checkBannedPhrases(slides);
  const number_qa = {
    issues: [...number_issues, ...consistency_issues, ...phrase_issues],
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const all_issues = [
    ...viewpoint_qa.qa_issues.map((i) => ({ ...i, module: "viewpoints" })),
    ...slide_qa.qa_issues.map((i)     => ({ ...i, module: "slides" })),
    ...citation_qa.issues.map((i)     => ({ ...i, module: "citations" })),
    ...number_qa.issues.map((i)       => ({ ...i, module: "numbers" })),
  ];

  const errors   = all_issues.filter((i) => i.severity === "error").length;
  const warnings = all_issues.filter((i) => i.severity === "warning").length;
  const infos    = all_issues.filter((i) => i.severity === "info").length;

  return {
    // overall_pass is true only when there are zero errors
    overall_pass: errors === 0,

    viewpoint_qa,
    slide_qa,
    citation_qa,
    number_qa,

    summary: {
      total_issues: all_issues.length,
      errors,
      warnings,
      infos,
      all_issues,
    },

    qa_version: QA_VERSION,
  };
}
