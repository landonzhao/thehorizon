/**
 * Layer 5B — Feed Scoring
 * Scores each source by its usefulness as evidence.
 * Deterministic scoring rules — no LLM.
 *
 * @deprecated Superseded by lib/pipeline/rawfact/scoreRawfacts.js (Layer 7.1C).
 * Retained for backward compatibility. Do not add new logic here.
 */

const TRUST_TIER_SCORES = {
  primary: 90,
  curated: 85,
  high: 75,
  medium: 55,
  low: 30,
  unknown: 20,
};

const SOURCE_TYPE_SCORES = {
  vulnerability: 25,
  incident: 25,
  threat_intelligence: 20,
  research_finding: 15,
  benchmark_evaluation: 15,
  exploit_disclosure: 22,
  governance_signal: 10,
  ecosystem_signal: 8,
};

function getSourceTypeScore(sourceType) {
  return SOURCE_TYPE_SCORES[sourceType] ?? 8;
}

function buildScoringReason(source, components) {
  const parts = [];
  const tt = source.trust_tier || "unknown";
  parts.push(`${tt} trust tier`);

  const st = source.source_type || "unknown";
  parts.push(`${st.replace(/_/g, " ")} type`);

  if (components.category_relevance_score >= 18) parts.push("high AI relevance");
  else if (components.category_relevance_score >= 10) parts.push("medium AI relevance");
  else parts.push("low AI relevance");

  if (components.horizon_bonus > 0) parts.push("LLM-confirmed category");
  if (components.noise_penalty > 0) parts.push(`${Math.round(components.noise_penalty / 3)} filter flag(s)`);

  return parts.join(", ");
}

/**
 * Score a batch of sources for feed usefulness.
 *
 * @param {object[]} sources - sources with Layer 3 + taxonomy fields
 * @returns {object[]} sources with `feed_score_data` field added
 */
export function scoreFeedSources(sources) {
  return sources.map((source) => {
    const base_score = TRUST_TIER_SCORES[source.trust_tier] ?? 20;
    const source_type_score = getSourceTypeScore(source.source_type);

    // Normalize ai_specificity_score (0-100) to 0-25
    const raw_ai = source.ai_specificity_score ?? source.ai_relevance_score ?? 0;
    const category_relevance_score = Math.min(25, Math.round(raw_ai * 25 / 100));

    // Horizon bonus: LLM-confirmed offensive category (Layer 6 classification with
    // medium+ confidence — excludes unclear_or_adjacent and fallback-only runs)
    const mainCat = source.main_category || "";
    const catConfidence = source.classification_confidence || source.understanding?.category_confidence || "low";
    const knownCat = mainCat && mainCat !== "unclear_or_adjacent" && mainCat !== "uncategorised";
    const horizon_bonus = knownCat && catConfidence !== "low" && catConfidence !== "none" ? 10 : 0;

    // Credibility bonus: source_credibility_score (0-10) * 2
    const credibility_bonus = Math.round((source.source_credibility_score ?? 0) * 2);

    // Noise penalty: filter_flags.length * 3, max 15
    const noise_penalty = Math.min(15, (source.filter_flags?.length ?? 0) * 3);

    // Final feed score
    const feed_score = Math.min(
      100,
      base_score +
        source_type_score +
        Math.round(category_relevance_score / 4) +
        horizon_bonus +
        credibility_bonus -
        noise_penalty
    );

    // Priority tier
    let feed_priority;
    if (feed_score >= 80) feed_priority = "must_read";
    else if (feed_score >= 65) feed_priority = "high";
    else if (feed_score >= 45) feed_priority = "medium";
    else if (feed_score >= 25) feed_priority = "low";
    else feed_priority = "archive_only";

    const components = {
      base_score,
      source_type_score,
      category_relevance_score,
      horizon_bonus,
      credibility_bonus,
      noise_penalty,
    };

    const feed_score_data = {
      ...components,
      feed_score,
      feed_priority,
      scoring_reason: buildScoringReason(source, components),
    };

    return { ...source, feed_score_data };
  });
}
