/**
 * Layer 7.2B — Analytics Aggregation
 *
 * Fully deterministic — no LLM calls. Aggregates per-source analytics_taxonomy
 * fields (set by Layer 7.2A) into structured counts, distributions, and timelines.
 *
 * ── INPUTS ────────────────────────────────────────────────────────────────────
 * Sources enriched by applyAnalyticsTaxonomies() — each has an analytics_taxonomy
 * field with: operational_status, threat_maturity, ai_layer_targeted,
 * attack_vectors[], signal_clusters[], regulatory_relevance, geographic_scope.
 *
 * ── OUTPUTS ──────────────────────────────────────────────────────────────────
 * aggregates object:
 *   category_counts          — { category_key: count }
 *   source_type_counts       — { source_type: count }
 *   trust_tier_counts        — { trust_tier: count }
 *   attack_vector_frequency  — { vector_name: count }, sorted desc
 *   signal_cluster_counts    — { cluster_name: count }, sorted desc
 *   maturity_distribution    — { maturity_level: count }
 *   ai_layer_distribution    — { ai_layer: count }
 *   monthly_timeline         — { "YYYY-MM": { total, by_category: {} } }
 *   category_breakdown       — { category: { vectors, clusters, maturity, types } }
 *   total_sources, total_with_taxonomy, date_range { start, end }
 */

// ── Utility helpers ────────────────────────────────────────────────────────────

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key != null && key !== "") counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countByArray(items, arrayFn) {
  const counts = {};
  for (const item of items) {
    for (const val of (arrayFn(item) || [])) {
      if (val) counts[val] = (counts[val] || 0) + 1;
    }
  }
  return counts;
}

function topN(countObj, n = 10) {
  return Object.entries(countObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function yearMonth(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.slice(0, 7); // "YYYY-MM"
  return /^\d{4}-\d{2}$/.test(d) ? d : null;
}

// Build { "YYYY-MM": { key: count } }
function monthlyCounts(sources, keyFn) {
  const result = {};
  for (const s of sources) {
    const at = s.analytics_taxonomy;
    if (!at) continue;
    const month = yearMonth(at.analytics_date);
    if (!month) continue;
    for (const key of ([].concat(keyFn(at) || []))) {
      if (!key) continue;
      if (!result[month]) result[month] = {};
      result[month][key] = (result[month][key] || 0) + 1;
    }
  }
  return result;
}

function buildCategoryBreakdown(sources) {
  const categories = [
    "traditional_ai_threats","llm_threats","agentic_ai_threats","ai_enabled_threats",
  ];
  const breakdown = {};

  for (const cat of categories) {
    const catSources = sources.filter(
      (s) => s.analytics_taxonomy?.analytics_category === cat
    );
    if (catSources.length === 0) {
      breakdown[cat] = { count: 0 };
      continue;
    }

    const sourceTypeCounts = countBy(catSources, (s) => s.analytics_taxonomy.analytics_source_type);
    const attackVectors    = countByArray(catSources, (at) => at.analytics_attack_vectors);
    const attackSurfaces   = countByArray(catSources, (at) => at.analytics_attack_surface);
    const maturityDist     = countBy(catSources, (s) => s.analytics_taxonomy.analytics_maturity);
    const signalClusters   = countByArray(catSources, (at) => at.analytics_signal_clusters);
    const themes           = countByArray(catSources, (at) => at.analytics_recurring_themes);
    const monthly          = monthlyCounts(catSources, (at) => [at.analytics_category]);

    // Top sources by rawfact_score
    const topSources = catSources
      .filter((s) => s.rawfact_score_data?.rawfact_score != null)
      .sort((a, b) => (b.rawfact_score_data.rawfact_score || 0) - (a.rawfact_score_data.rawfact_score || 0))
      .slice(0, 5)
      .map((s) => ({
        source_id:       s.id,
        title:           s.title,
        url:             s.url,
        publisher:       s.publisher,
        source_type:     s.source_type,
        rawfact_score:   s.rawfact_score_data?.rawfact_score,
        rawfact_priority:s.rawfact_score_data?.rawfact_priority,
        date:            s.analytics_taxonomy?.analytics_date,
      }));

    breakdown[cat] = {
      count:               catSources.length,
      source_type_counts:  sourceTypeCounts,
      top_attack_vectors:  topN(attackVectors, 5),
      top_attack_surfaces: topN(attackSurfaces, 5),
      maturity_distribution:  maturityDist,
      top_signal_clusters: topN(signalClusters, 5),
      top_recurring_themes:topN(themes, 5),
      monthly_counts:      monthly,
      top_sources:         topSources,
    };
  }

  return breakdown;
}

function buildTimelineEvents(sources) {
  return sources
    .filter((s) => s.analytics_taxonomy?.analytics_date)
    .map((s) => {
      const at = s.analytics_taxonomy;
      return {
        date:             at.analytics_date,
        source_id:        s.id,
        title:            s.title,
        url:              s.url,
        publisher:        s.publisher,
        category:         at.analytics_category,
        source_type:      at.analytics_source_type,
        rawfact_priority: at.rawfact_priority || null,
        rawfact_score:    at.rawfact_score || null,
        top_attack_vector:(at.analytics_attack_vectors || [])[0] || null,
        top_signal_cluster:(at.analytics_signal_clusters || [])[0] || null,
        source_summary:   s.understanding?.source_summary || s.summary || "",
        trust_tier:       s.trust_tier,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildTrendDeltas(monthlyCatCounts, monthlySrc) {
  const months = Object.keys(monthlyCatCounts).sort();
  if (months.length < 2) return null;

  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const catLast = monthlyCatCounts[lastMonth] || {};
  const catPrev = monthlyCatCounts[prevMonth] || {};

  const categoryDeltas = {};
  const allCats = new Set([...Object.keys(catLast), ...Object.keys(catPrev)]);
  for (const cat of allCats) {
    categoryDeltas[cat] = (catLast[cat] || 0) - (catPrev[cat] || 0);
  }

  const srcLast = monthlySrc[lastMonth] || {};
  const srcPrev = monthlySrc[prevMonth] || {};
  const sourceTypeDeltas = {};
  const allTypes = new Set([...Object.keys(srcLast), ...Object.keys(srcPrev)]);
  for (const t of allTypes) {
    sourceTypeDeltas[t] = (srcLast[t] || 0) - (srcPrev[t] || 0);
  }

  return {
    period: { from: prevMonth, to: lastMonth },
    category_deltas: categoryDeltas,
    source_type_deltas: sourceTypeDeltas,
    top_growing_categories: Object.entries(categoryDeltas)
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, delta]) => ({ cat, delta })),
  };
}

/**
 * Aggregate analytics data from all sources (Layer 7.2B).
 * Deterministic — no LLM calls.
 *
 * @param {object[]} sources - sources with analytics_taxonomy field
 * @returns {object} aggregates object
 */
export function aggregateAnalytics(sources) {
  const withTaxonomy = sources.filter((s) => s.analytics_taxonomy);

  // ── Global counts ────────────────────────────────────────────────────────────
  const category_counts      = countBy(withTaxonomy, (s) => s.analytics_taxonomy.analytics_category);
  const source_type_counts   = countBy(withTaxonomy, (s) => s.analytics_taxonomy.analytics_source_type);
  const publisher_counts     = countBy(withTaxonomy, (s) => s.analytics_taxonomy.publisher);
  const trust_tier_counts    = countBy(withTaxonomy, (s) => s.analytics_taxonomy.trust_tier);

  // ── Technique/attack distributions ──────────────────────────────────────────
  const attack_vector_frequency  = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_attack_vectors);
  const attack_surface_frequency = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_attack_surface);
  const ai_layer_frequency       = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_ai_layer);
  const impact_type_frequency    = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_impact_type);

  // ── Taxonomy field frequencies (v6 fields) ───────────────────────────────────
  const attack_mapping_frequency = countByArray(
    sources, (s) => (s.understanding?.attack_mappings || []).map((am) => am.tag)
  );
  const governance_tag_frequency = countByArray(
    sources, (s) => (s.understanding?.governance_tags || []).map((gt) => gt.tag)
  );
  const agenticSources = sources.filter((s) => s.main_category === "agentic_ai_threats");
  const agentic_attack_mapping_frequency = countByArray(
    agenticSources, (s) => (s.understanding?.attack_mappings || []).map((am) => am.tag)
  );

  // ── Maturity and operationalization ─────────────────────────────────────────
  const operational_status_distribution = countBy(withTaxonomy, (s) => s.analytics_taxonomy.analytics_operational_status);
  const maturity_distribution           = countBy(withTaxonomy, (s) => s.analytics_taxonomy.analytics_maturity);
  const impact_scope_distribution       = countBy(withTaxonomy, (s) => s.analytics_taxonomy.analytics_impact_scope);

  // ── Geography / sector / tech / entities ────────────────────────────────────
  const sector_distribution    = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_sector);
  const geography_distribution = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_geography);
  const technology_frequency   = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_technology);
  const entity_frequency       = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_entities);

  // ── Signal clusters + themes ─────────────────────────────────────────────────
  const signal_cluster_counts  = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_signal_clusters);
  const recurring_theme_counts = countByArray(withTaxonomy, (s) => s.analytics_taxonomy.analytics_recurring_themes);

  // ── Monthly breakdowns ───────────────────────────────────────────────────────
  const monthly_category_counts     = monthlyCounts(withTaxonomy, (at) => [at.analytics_category]);
  const monthly_source_type_counts  = monthlyCounts(withTaxonomy, (at) => [at.analytics_source_type]);
  const monthly_attack_vector_counts= monthlyCounts(withTaxonomy, (at) => at.analytics_attack_vectors);
  const monthly_maturity_counts     = monthlyCounts(withTaxonomy, (at) => [at.analytics_maturity]);
  const monthly_signal_cluster_counts = monthlyCounts(withTaxonomy, (at) => at.analytics_signal_clusters);

  // ── Category breakdowns ──────────────────────────────────────────────────────
  const category_breakdowns = buildCategoryBreakdown(withTaxonomy);

  // ── Timeline events ──────────────────────────────────────────────────────────
  const timeline_events = buildTimelineEvents(withTaxonomy);

  // ── Date range ───────────────────────────────────────────────────────────────
  const allMonths = Object.keys(monthly_category_counts).sort();
  const date_range = {
    start:  allMonths.length > 0 ? allMonths[0] + "-01" : null,
    end:    allMonths.length > 0 ? allMonths[allMonths.length - 1] + "-01" : null,
    months: allMonths.length,
  };

  // ── Trend deltas ─────────────────────────────────────────────────────────────
  const trend_deltas = buildTrendDeltas(monthly_category_counts, monthly_source_type_counts);

  // ── Rawfact priority distribution ─────────────────────────────────────────────
  const rawfact_priority_counts = countBy(
    withTaxonomy.filter((s) => s.analytics_taxonomy.rawfact_priority),
    (s) => s.analytics_taxonomy.rawfact_priority
  );

  return {
    total_sources:        sources.length,
    taxonomy_done:        withTaxonomy.length,
    date_range,

    category_counts,
    source_type_counts,
    publisher_counts,
    trust_tier_counts,

    attack_vector_frequency,
    attack_surface_frequency,
    ai_layer_frequency,
    impact_type_frequency,
    impact_scope_distribution,

    attack_mapping_frequency,
    governance_tag_frequency,
    agentic_attack_mapping_frequency,

    operational_status_distribution,
    maturity_distribution,
    rawfact_priority_counts,

    sector_distribution,
    geography_distribution,
    technology_frequency,
    entity_frequency,

    signal_cluster_counts,
    recurring_theme_counts,

    monthly_category_counts,
    monthly_source_type_counts,
    monthly_attack_vector_counts,
    monthly_maturity_counts,
    monthly_signal_cluster_counts,

    category_breakdowns,
    timeline_events,
    trend_deltas,

    // Convenience top-N lists for quick access
    top: {
      attack_vectors:   topN(attack_vector_frequency, 10),
      attack_surfaces:  topN(attack_surface_frequency, 10),
      signal_clusters:  topN(signal_cluster_counts, 10),
      recurring_themes: topN(recurring_theme_counts, 8),
      sectors:          topN(sector_distribution, 8),
      technologies:     topN(technology_frequency, 10),
      entities:         topN(entity_frequency, 10),
    },
  };
}
