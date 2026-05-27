/**
 * Layer 8A — Category Evidence Dossier Builder
 *
 * Fully deterministic — no LLM calls. Assembles a compact, structured evidence
 * dossier per threat category. This dossier is the sole input to the Layer 8B
 * category analysis LLM call — the LLM never sees raw source objects directly.
 *
 * ── RAWFACT EVIDENCE SELECTION ───────────────────────────────────────────────
 * Max MAX_RAWFACT_EVIDENCE = 12 items per category, selected in this order:
 *   1. Priority: must_read → high → medium → low → archive_only
 *   2. Within same priority: cluster representatives first (is_representative=true)
 *   3. Within same priority+rep: descending rawfact_score
 *
 * Each rawfact evidence item carries:
 *   evidence_id (format: "raw_<source_id>"), title, publisher, published_date,
 *   source_type, rawfact_score, rawfact_priority, evidence_card_title,
 *   short_summary, key_facts[], numbers_statistics[], attack_flow[],
 *   why_it_matters, analytics_attack_vectors[], analytics_signal_clusters[],
 *   cluster_id, cluster_size, is_cluster_representative
 *
 * ── ANALYTICS EVIDENCE ───────────────────────────────────────────────────────
 * Up to 4 analytics items per category (attack vectors, maturity, signal clusters,
 * operational status). Each carries an analytics_id (format: "agg_<category>_<metric>")
 * that can be cited by the LLM in supporting_evidence_ids.
 *
 * ── ACTIVE CATEGORIES ────────────────────────────────────────────────────────
 * Only categories with source_count > 0 are returned. Categories with no sources
 * are skipped entirely — analyzeCategory() is not called for empty dossiers.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * buildAllDossiers() → dossier[] where each dossier:
 *   { category, source_count, rawfact_evidence[], analytics_evidence[] }
 */

const MAX_RAWFACT_EVIDENCE = 12;

const PRIORITY_ORDER = { must_read: 0, high: 1, medium: 2, low: 3, archive_only: 4 };

const ANALYSIS_CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
];

// ── Evidence item builders ─────────────────────────────────────────────────────

function buildRawfactEvidenceItem(source) {
  const rf = source.rawfact_score_data || source.feed_score_data || {};
  const ec = source.evidence_card || {};
  const at = source.analytics_taxonomy || {};
  const cl = source.rawfact_cluster || {};

  return {
    evidence_id:              `raw_${source.id}`,
    source_id:                source.id,
    title:                    source.title || "",
    url:                      source.url || "",
    publisher:                source.publisher || "",
    published_date:           (source.date_published || "").slice(0, 10),
    source_type:              source.source_type || "unknown",
    rawfact_score:            rf.rawfact_score ?? rf.feed_score ?? 0,
    rawfact_priority:         rf.rawfact_priority ?? rf.feed_priority ?? "low",
    cluster_id:               cl.cluster_id || null,
    is_cluster_representative: cl.is_representative ?? true,
    cluster_size:             cl.cluster_size || 1,
    // evidence card (null if extraction was not run for this source)
    evidence_card_title:      ec.evidence_card_title || null,
    short_summary:            ec.short_summary || source.understanding?.source_summary || source.summary || null,
    key_facts:                ec.key_facts || source.understanding?.main_claims || [],
    numbers_statistics:       ec.numbers_statistics || source.understanding?.important_numbers || [],
    attack_flow:              ec.attack_flow || [],
    impacts:                  ec.impacts || [],
    why_it_matters:           ec.why_it_matters || null,
    best_used_for:            ec.best_used_for || [],
    // analytics taxonomy fields (context for the LLM)
    analytics_attack_vectors:     at.analytics_attack_vectors || [],
    analytics_maturity:           at.analytics_maturity || "unknown",
    analytics_signal_clusters:    at.analytics_signal_clusters || [],
    analytics_operational_status: at.analytics_operational_status || "unknown",
  };
}

function buildAnalyticsEvidence(category, sources, aggregates) {
  const allSourceIds = sources.map((s) => s.id);
  const items = [];

  // Attack vector frequency
  const vectorCounts = {};
  for (const s of sources) {
    for (const v of (s.analytics_taxonomy?.analytics_attack_vectors || [])) {
      if (v) vectorCounts[v] = (vectorCounts[v] || 0) + 1;
    }
  }
  if (Object.keys(vectorCounts).length > 0) {
    items.push({
      analytics_id:        `agg_${category}_attack_vectors`,
      metric_name:         "attack_vector_frequency",
      value:               vectorCounts,
      data_source:         "analytics_aggregation_7.2B",
      source_ids:          allSourceIds,
      aggregation_method:  "count_by_field",
    });
  }

  // Maturity distribution
  const maturityCounts = {};
  for (const s of sources) {
    const m = s.analytics_taxonomy?.analytics_maturity || "unknown";
    maturityCounts[m] = (maturityCounts[m] || 0) + 1;
  }
  if (Object.keys(maturityCounts).length > 0) {
    items.push({
      analytics_id:        `agg_${category}_maturity`,
      metric_name:         "maturity_distribution",
      value:               maturityCounts,
      data_source:         "analytics_aggregation_7.2B",
      source_ids:          allSourceIds,
      aggregation_method:  "count_by_field",
    });
  }

  // Signal cluster counts
  const clusterCounts = {};
  for (const s of sources) {
    for (const c of (s.analytics_taxonomy?.analytics_signal_clusters || [])) {
      if (c) clusterCounts[c] = (clusterCounts[c] || 0) + 1;
    }
  }
  if (Object.keys(clusterCounts).length > 0) {
    items.push({
      analytics_id:        `agg_${category}_signal_clusters`,
      metric_name:         "signal_cluster_counts",
      value:               clusterCounts,
      data_source:         "analytics_aggregation_7.2B",
      source_ids:          allSourceIds,
      aggregation_method:  "count_by_field",
    });
  }

  // Operational status distribution
  const opStatusCounts = {};
  for (const s of sources) {
    const op = s.analytics_taxonomy?.analytics_operational_status || "unknown";
    opStatusCounts[op] = (opStatusCounts[op] || 0) + 1;
  }
  if (Object.keys(opStatusCounts).length > 0) {
    items.push({
      analytics_id:        `agg_${category}_operational_status`,
      metric_name:         "operational_status_distribution",
      value:               opStatusCounts,
      data_source:         "analytics_aggregation_7.2B",
      source_ids:          allSourceIds,
      aggregation_method:  "count_by_field",
    });
  }

  return items;
}

// ── Source selector ────────────────────────────────────────────────────────────

function selectTopSources(sources) {
  return [...sources].sort((a, b) => {
    const rfA = a.rawfact_score_data || a.feed_score_data || {};
    const rfB = b.rawfact_score_data || b.feed_score_data || {};

    const priA = PRIORITY_ORDER[rfA.rawfact_priority ?? rfA.feed_priority] ?? 4;
    const priB = PRIORITY_ORDER[rfB.rawfact_priority ?? rfB.feed_priority] ?? 4;
    if (priA !== priB) return priA - priB;

    // Within same priority: cluster representatives first
    const repA = a.rawfact_cluster?.is_representative ?? true;
    const repB = b.rawfact_cluster?.is_representative ?? true;
    if (repA !== repB) return repB ? 1 : -1;

    const scoreA = rfA.rawfact_score ?? rfA.feed_score ?? 0;
    const scoreB = rfB.rawfact_score ?? rfB.feed_score ?? 0;
    return scoreB - scoreA;
  }).slice(0, MAX_RAWFACT_EVIDENCE);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a compact evidence dossier for a single category.
 *
 * @param {string}   category  - One of the 4 threat category strings.
 * @param {object[]} sources   - All sources for this category (rawfact + analytics enriched).
 * @param {object}   aggregates - Output of aggregateAnalytics() from Layer 7.2B.
 * @returns {object} Category dossier with rawfact_evidence and analytics_evidence arrays.
 */
export function buildCategoryDossier(category, sources, aggregates) {
  const topSources = selectTopSources(sources);

  return {
    category,
    source_count: sources.length,
    rawfact_evidence: topSources.map(buildRawfactEvidenceItem),
    analytics_evidence: buildAnalyticsEvidence(category, sources, aggregates),
  };
}

/**
 * Build dossiers for all 4 active threat categories.
 *
 * @param {object[]} sources   - All enriched sources.
 * @param {object}   aggregates - Output of aggregateAnalytics().
 * @returns {object[]} Array of category dossiers (only non-empty categories included).
 */
export function buildAllDossiers(sources, aggregates) {
  const byCat = {};
  for (const source of sources) {
    const cat = source.main_category || "unclear_or_adjacent";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(source);
  }

  return ANALYSIS_CATEGORIES
    .filter((cat) => (byCat[cat] || []).length > 0)
    .map((cat) => buildCategoryDossier(cat, byCat[cat], aggregates));
}
