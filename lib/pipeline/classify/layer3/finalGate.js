/**
 * Layer 3.5 — Final Gate
 *
 * Combines the outputs of 3.1–3.4 into a single Layer 3 decision.
 *
 * layer3_status values:
 *   pass    — source proceeds to Layer 4
 *   reject  — source is discarded (invalid, excluded, or definitively off-topic)
 *   review  — source proceeds but is flagged for human review
 *
 * downstream_route values:
 *   layer4              — normal path
 *   layer4_with_review  — passes to Layer 4 but marked needs_review = true
 *   discard             — removed from pipeline
 */

// Soft flags that trigger "review" rather than rejection.
const REVIEW_FLAGS = new Set([
  "missing_publisher",
  "possible_non_english",
  "date_before_2020",
  "minimal_text",
  "no_publish_date",
]);

/**
 * @param {object} validity  — output of 3.1 checkSourceValidity
 * @param {object} relevance — output of 3.2 assessAiRelevance
 * @param {object} typing    — output of 3.3 classifyDataType
 * @param {object} trust     — output of 3.4 assessTrustAndCredibility
 * @returns {{
 *   layer3_status: "pass"|"reject"|"review",
 *   final_validity_reason: string,
 *   downstream_route: "layer4"|"layer4_with_review"|"discard",
 * }}
 */
export function applyFinalGate(validity, relevance, typing, trust) {
  // ── Hard reject: failed validity or excluded publisher ────────────────────
  if (!validity.is_valid || trust.trust_tier === "exclude") {
    return {
      layer3_status:        "reject",
      final_validity_reason: validity.validity_reason,
      downstream_route:     "discard",
    };
  }

  // ── Hard reject: no AI signal — definitively off-topic
  // Exception: primary and high-trust sources get review instead of rejection
  // because rule-based scoring may miss relevance in authoritative publications.
  if (relevance.relevance_tier === "off_topic") {
    const isTrustedSource = trust.trust_tier === "primary" || trust.trust_tier === "high";
    if (isTrustedSource) {
      return {
        layer3_status:        "review",
        final_validity_reason: `off_topic_but_trusted: ai_specificity=${relevance.ai_specificity_score}; trust=${trust.trust_tier}`,
        downstream_route:     "layer4_with_review",
      };
    }
    return {
      layer3_status:        "reject",
      final_validity_reason: `off_topic: ai_specificity=${relevance.ai_specificity_score}`,
      downstream_route:     "discard",
    };
  }

  // ── Review: passes but has flags warranting human attention ──────────────
  const hasReviewFlag = validity.filter_flags.some((f) => REVIEW_FLAGS.has(f));
  const unknownType   = typing.source_type === "unknown";

  if (hasReviewFlag || unknownType) {
    return {
      layer3_status:        "review",
      final_validity_reason: validity.validity_reason,
      downstream_route:     "layer4_with_review",
    };
  }

  // ── Pass ──────────────────────────────────────────────────────────────────
  return {
    layer3_status:        "pass",
    final_validity_reason: validity.validity_reason,
    downstream_route:     "layer4",
  };
}
