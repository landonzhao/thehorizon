/**
 * Layer 8 QA — Slide Quality Assurance
 * Deterministic structural and content checks on generated slide content.
 */

function wordCount(str) {
  return str ? str.trim().split(/\s+/).length : 0;
}

// Structural slide types exempt from evidence and citation checks
const STRUCTURAL_TYPES = new Set(["title", "section_divider", "appendix"]);

// ── Check definitions ─────────────────────────────────────────────────────────
// Each entry: { severity, fn, msg }
// error   → blocks overall_pass (structural failure — visible on distributed deck)
// warning → advisory (quality issue)

const CHECKS = {
  has_headline: {
    severity: "error",
    fn:  (slide) => typeof slide.headline === "string" && slide.headline.trim().length > 0,
    msg: (slide) => `Slide ${slide.slide_number} is missing a headline.`,
  },

  bullet_count_ok: {
    severity: "error",
    fn:  (slide) => !slide.bullets || slide.bullets.length <= 5,
    msg: (slide) => `Slide ${slide.slide_number} has ${slide.bullets?.length} bullets (max 5).`,
  },

  bullets_not_too_long: {
    severity: "warning",
    fn:  (slide) => {
      if (!slide.bullets || slide.bullets.length === 0) return true;
      return slide.bullets.every((b) => wordCount(b) <= 15);
    },
    msg: (slide) => {
      const long = (slide.bullets || []).filter((b) => b.trim().split(/\s+/).length > 15);
      return `Slide ${slide.slide_number} has ${long.length} bullet(s) exceeding 15 words.`;
    },
  },

  has_speaker_notes: {
    severity: "warning",
    fn:  (slide) => typeof slide.speaker_notes === "string" && slide.speaker_notes.trim().length > 0,
    msg: (slide) => `Slide ${slide.slide_number} is missing speaker notes.`,
  },

  has_evidence_or_citations: {
    severity: "warning",
    fn: (slide) => {
      if (STRUCTURAL_TYPES.has(slide.slide_type)) return true;
      const hasCallouts  = Array.isArray(slide.evidence_callouts) && slide.evidence_callouts.length > 0;
      const hasCitations = Array.isArray(slide.citations) && slide.citations.length > 0;
      return hasCallouts || hasCitations;
    },
    msg: (slide) => `Slide ${slide.slide_number} has no evidence callouts and no citations.`,
  },

  callouts_have_evidence_id: {
    severity: "warning",
    fn: (slide) => {
      if (STRUCTURAL_TYPES.has(slide.slide_type)) return true;
      return (slide.evidence_callouts || []).every((c) => !!c.evidence_id?.trim());
    },
    msg: (slide) => `Slide ${slide.slide_number} has an evidence callout missing an evidence_id.`,
  },
};

/**
 * Run QA checks on generated slides.
 *
 * @param {object[]} slides      - Generated slide content objects.
 * @param {object[]} viewpoints  - Layer 6 viewpoints.
 * @param {object[]} feedSources - Feed sources.
 * @param {object[]} slidePlan   - Slide plan objects (for evidence/viewpoint context).
 * @returns {object} QA report.
 */
export function qaSlides(slides, viewpoints = [], feedSources = [], slidePlan = []) {
  const qa_issues    = [];
  const slide_results = [];
  let passed = 0;
  let failed = 0;

  const planByNumber = {};
  for (const p of slidePlan) planByNumber[p.slide_number] = p;

  for (const slide of slides) {
    const plan = planByNumber[slide.slide_number] || null;
    const checkResults = {};
    let slideFailed = false;

    for (const [checkName, check] of Object.entries(CHECKS)) {
      let pass;
      try {
        pass = !!check.fn(slide, viewpoints, feedSources, plan);
      } catch {
        pass = false;
      }

      checkResults[checkName] = pass;

      if (!pass) {
        if (check.severity === "error") slideFailed = true;
        qa_issues.push({
          slide_number: slide.slide_number,
          slide_title:  slide.title || slide.slide_title || `Slide ${slide.slide_number}`,
          check:        checkName,
          severity:     check.severity,
          message:      check.msg(slide),
        });
      }
    }

    if (slideFailed) failed++;
    else passed++;

    slide_results.push({
      slide_number: slide.slide_number,
      slide_title:  slide.title || slide.slide_title || `Slide ${slide.slide_number}`,
      checks:       checkResults,
    });
  }

  return {
    passed,
    failed,
    qa_issues,
    slide_results,
    overall_pass: failed === 0,
  };
}
