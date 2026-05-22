/**
 * Cross-category convergence finder.
 *
 * Identifies threat themes that appear across two or more threat categories,
 * with supporting evidence from each. These convergences are the most
 * strategically significant signals — they indicate systemic risks that
 * cut across the AI threat landscape rather than isolated domain issues.
 *
 * Approach: use the signal_clusters output from extractSignals.js (already
 * grouped by theme), filter for clusters that appear in 2+ categories, then
 * enrich each convergence with a structured description and evidence.
 *
 * Output shape:
 * [
 *   {
 *     theme: "Prompt injection at scale",
 *     categories: ["llm_threats", "agentic_ai_threats"],
 *     category_labels: [...],
 *     strength: 3,           // 2–5 based on source_count and category breadth
 *     horizon_relevance: 4.5,
 *     threat_maturity: "growing",
 *     source_count: 8,
 *     description: "...",    // one-sentence convergence description
 *     evidence: [...]        // top evidence items across all categories
 *   }
 * ]
 */

const CATEGORY_LABELS = {
  llm_threats:             "LLM & Foundation Model Threats",
  agentic_ai_threats:      "Agentic AI & Autonomous System Threats",
  ai_enabled_threats:      "AI-Enabled Attack Techniques",
  traditional_ai_threats:  "Traditional ML & Model Attacks",
  uncategorised:           "General AI Security Context",
};

// Convergence strength: 2 categories = 2, 3+ categories = 3,
// bonus points for source_count and horizon_relevance.
function convergenceStrength(cluster) {
  const catCount = cluster.categories.length;
  let strength = catCount;
  if (cluster.source_count >= 5)    strength++;
  if (cluster.horizon_relevance >= 4) strength++;
  return Math.min(5, strength);
}

// Generate a brief convergence description based on theme and category pairs.
function describeConvergence(theme, categories) {
  const labels = categories.map((c) => CATEGORY_LABELS[c] || c);
  if (labels.length === 2) {
    return `${theme} is emerging as a shared concern across ${labels[0]} and ${labels[1]}, suggesting coordinated or overlapping attack surfaces.`;
  }
  const last = labels.pop();
  return `${theme} cuts across ${labels.join(", ")}, and ${last} — indicating a systemic risk spanning the entire AI threat landscape.`;
}

/**
 * Find cross-category convergences from signal clusters.
 *
 * @param {object} signalClusters - output of extractSignalsWithEvidence()
 * @returns {object[]} convergences sorted by strength desc
 */
export function findConvergence(signalClusters) {
  const { all_clusters } = signalClusters;

  // Filter: must span 2+ categories and have at least 2 sources
  const convergent = all_clusters.filter(
    (c) => c.categories.length >= 2 && c.source_count >= 2
  );

  const convergences = convergent.map((cluster) => ({
    theme:           cluster.theme,
    categories:      cluster.categories,
    category_labels: cluster.categories.map((c) => CATEGORY_LABELS[c] || c),
    strength:        convergenceStrength(cluster),
    horizon_relevance: cluster.horizon_relevance,
    threat_maturity: cluster.threat_maturity,
    source_count:    cluster.source_count,
    signal_count:    cluster.signal_count,
    description:     describeConvergence(cluster.theme, [...cluster.categories]),
    evidence:        cluster.evidence
      .sort((a, b) => (b.horizon_relevance || 0) - (a.horizon_relevance || 0))
      .slice(0, 5),
    representative_signal: cluster.representative_signal,
  }));

  return convergences.sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return b.horizon_relevance - a.horizon_relevance;
  });
}

