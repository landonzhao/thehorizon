/**
 * Layer 8 QA — Viewpoint Quality Assurance
 *
 * Deterministic structural and content checks on the viewpoints produced by
 * Layer 6 synthesis. Validates required fields, controlled-vocabulary values,
 * length constraints, and that cited evidence IDs are resolvable.
 */

const VALID_CATEGORIES = new Set([
  "traditional_ai_threats", "llm_threats", "agentic_ai_threats",
  "ai_enabled_threats", "unclear_or_adjacent", "cross_category",
  // legacy values accepted from older DB rows
  "ai_for_security", "uncategorised",
]);
const VALID_CLAIM_TYPES  = new Set(["trend", "insight", "early_signal", "outlook", "implication"]);
const VALID_CONFIDENCE   = new Set(["high", "medium", "low"]);
const VALID_MATURITY     = new Set(["research", "emerging", "growing", "operational", "mainstream"]);
const VALID_WATCH_WINDOW = new Set(["now", "3_6_months", "6_12_months"]);

const MAX_VIEWPOINT_WORDS   = 60;
const MAX_SPEAKER_NOTE_WORDS = 120;

function wordCount(str) {
  return str ? str.trim().split(/\s+/).length : 0;
}

// ── Check definitions ─────────────────────────────────────────────────────────

const CHECKS = {
  has_viewpoint_text: {
    severity: "error",
    fn: (vp) => typeof vp.viewpoint === "string" && vp.viewpoint.trim().length > 0,
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: missing viewpoint text.`,
  },
  has_valid_category: {
    severity: "error",
    fn: (vp) => VALID_CATEGORIES.has(vp.category),
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: invalid category "${vp.category}".`,
  },
  has_valid_claim_type: {
    severity: "warning",
    fn: (vp) => VALID_CLAIM_TYPES.has(vp.claim_type),
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: invalid claim_type "${vp.claim_type}".`,
  },
  has_supporting_evidence: {
    severity: "error",
    fn: (vp) => Array.isArray(vp.supporting_feed_evidence) && vp.supporting_feed_evidence.length > 0,
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: no supporting_feed_evidence IDs.`,
  },
  evidence_ids_resolvable: {
    severity: "warning",
    fn: (vp, sourceIds) => {
      if (!sourceIds) return true;
      return (vp.supporting_feed_evidence || []).some((id) => sourceIds.has(id));
    },
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: none of the supporting_feed_evidence IDs resolve to a known source.`,
  },
  has_speaker_note: {
    severity: "warning",
    fn: (vp) => typeof vp.speaker_note === "string" && vp.speaker_note.trim().length > 0,
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: missing speaker_note.`,
  },
  has_valid_confidence: {
    severity: "warning",
    fn: (vp) => VALID_CONFIDENCE.has(vp.confidence),
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: invalid confidence "${vp.confidence}".`,
  },
  has_valid_maturity: {
    severity: "warning",
    fn: (vp) => VALID_MATURITY.has(vp.maturity),
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: invalid maturity "${vp.maturity}".`,
  },
  has_valid_watch_window: {
    severity: "warning",
    fn: (vp) => VALID_WATCH_WINDOW.has(vp.watch_window),
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: invalid watch_window "${vp.watch_window}".`,
  },
  viewpoint_not_too_long: {
    severity: "warning",
    fn: (vp) => wordCount(vp.viewpoint) <= MAX_VIEWPOINT_WORDS,
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: viewpoint text is ${wordCount(vp.viewpoint)} words (max ${MAX_VIEWPOINT_WORDS}).`,
  },
  speaker_note_not_too_long: {
    severity: "info",
    fn: (vp) => !vp.speaker_note || wordCount(vp.speaker_note) <= MAX_SPEAKER_NOTE_WORDS,
    msg: (vp) => `Viewpoint ${vp.viewpoint_id}: speaker_note is ${wordCount(vp.speaker_note)} words — consider trimming.`,
  },
};

/**
 * Run QA checks on all viewpoints.
 *
 * @param {object[]} viewpoints   - Layer 6 viewpoints.
 * @param {object[]} [feedSources=[]] - Feed sources for evidence ID resolution.
 * @returns {object} QA report.
 */
export function qaViewpoints(viewpoints, feedSources = []) {
  const sourceIds = feedSources.length > 0
    ? new Set(feedSources.map((s) => s.id))
    : null;

  const qa_issues      = [];
  const viewpoint_results = [];
  let passed = 0;
  let failed = 0;

  for (const vp of viewpoints) {
    const checkResults = {};
    let vpFailed = false;

    for (const [checkName, check] of Object.entries(CHECKS)) {
      let pass;
      try {
        pass = !!check.fn(vp, sourceIds);
      } catch {
        pass = false;
      }

      checkResults[checkName] = pass;

      if (!pass) {
        if (check.severity === "error") vpFailed = true;
        qa_issues.push({
          viewpoint_id: vp.viewpoint_id,
          check:        checkName,
          severity:     check.severity,
          message:      check.msg(vp),
        });
      }
    }

    if (vpFailed) failed++;
    else passed++;

    viewpoint_results.push({
      viewpoint_id: vp.viewpoint_id,
      category:     vp.category,
      claim_type:   vp.claim_type,
      checks:       checkResults,
    });
  }

  return {
    passed,
    failed,
    qa_issues,
    viewpoint_results,
    overall_pass: failed === 0,
  };
}
