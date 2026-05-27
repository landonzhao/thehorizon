/**
 * Layer 7.2C — Visualization Data / Specs
 *
 * Fully deterministic — no LLM calls. Converts Layer 7.2B aggregates into
 * chart-ready visualization spec objects consumed by renderVisualization.js.
 *
 * ── GENERATED SPECS ──────────────────────────────────────────────────────────
 * Each spec has: { visualization_id, chart_type, title, data, ... }
 *
 *   attack_vector_frequency       — bar_chart  (top attack vectors by count)
 *   maturity_distribution         — bar_chart  (threat maturity levels)
 *   ai_layer_distribution         — bar_chart  (AI layer targeted)
 *   signal_cluster_radar          — radar_chart (signal clusters across categories)
 *   category_source_counts        — bar_chart  (total sources per category)
 *   monthly_source_timeline       — stacked_bar (monthly volume by category)
 *   category_maturity_matrix      — matrix     (category × maturity heatmap)
 *   category_vector_heatmap       — heatmap    (category × attack vector)
 *   trust_tier_distribution       — bar_chart  (trust tier breakdown)
 *   source_type_distribution      — bar_chart  (source type breakdown)
 *   <category>_attack_vectors     — bar_chart  (per-category vector breakdown, ×4)
 *   <category>_signal_clusters    — bar_chart  (per-category cluster breakdown, ×4)
 *
 * Specs that reference empty data are omitted from the output.
 * All visualization_ids are stable — they are cited by planSlides.js to assign
 * visualizations to specific slides.
 */

const CATEGORY_LABELS = {
  traditional_ai_threats: "Traditional AI Threats",
  llm_threats:            "LLM Threats",
  agentic_ai_threats:     "Agentic AI Threats",
  ai_enabled_threats:     "AI-Enabled Threats",
  unclear_or_adjacent:    "Unclear / Adjacent",
};

const SOURCE_TYPE_LABELS = {
  vulnerability:                    "Vulnerability",
  incident:                         "Incident",
  threat_intelligence:              "Threat Intelligence",
  research_finding:                 "Research Finding",
  exploit_disclosure:               "Exploit Disclosure",
  defensive_capability:             "Defensive Capability",
  benchmark_evaluation:             "Benchmark / Evaluation",
  capability_demonstration:         "Capability Demonstration",
  adversary_adoption_signal:        "Adversary Adoption",
  infrastructure_dependency_signal: "Infrastructure Dependency",
  trust_boundary_shift:             "Trust Boundary Shift",
  societal_harm_signal:             "Societal Harm",
  governance_signal:                "Governance / Policy",
  ecosystem_signal:                 "Ecosystem / Market",
  strategic_signal:                 "Strategic Signal",
  unknown:                          "Unknown",
};

const MATURITY_LABELS = {
  research:    "Research",
  emerging:    "Emerging",
  growing:     "Growing",
  operational: "Operational",
  mainstream:  "Mainstream",
  unknown:     "Unknown",
};

const OPERATIONAL_STATUS_LABELS = {
  theoretical:              "Theoretical",
  research_only:            "Research Only",
  proof_of_concept:         "Proof of Concept",
  limited_operational_use:  "Limited Operational",
  active_operational_use:   "Active Operational",
  mainstream_operational_use:"Mainstream",
  unknown:                  "Unknown",
};

const MATURITY_ORDER = ["research","emerging","growing","operational","mainstream","unknown"];
const OPERATIONAL_ORDER = [
  "theoretical","research_only","proof_of_concept",
  "limited_operational_use","active_operational_use","mainstream_operational_use","unknown",
];
const OFFENSIVE_CATEGORIES = [
  "traditional_ai_threats","llm_threats","agentic_ai_threats","ai_enabled_threats",
];

function labeledCounts(counts, labelMap) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: labelMap[key] || key, count }));
}

function sortedEntries(obj, maxN = 15) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxN);
}

function buildStackedBarData(monthly, keyLabelMap) {
  const months = Object.keys(monthly).sort();
  const allKeys = new Set();
  for (const m of months) {
    for (const k of Object.keys(monthly[m] || {})) allKeys.add(k);
  }

  const series = {};
  for (const key of allKeys) {
    const label = keyLabelMap[key] || key;
    series[key] = { key, label, values: months.map((m) => (monthly[m] || {})[key] || 0) };
  }

  return { months, series };
}

/**
 * Generate visualization specs from aggregates.
 *
 * @param {object}   aggregates - output of aggregateAnalytics()
 * @param {object[]} sources    - full source list (for matrix building)
 * @returns {object[]} array of visualization spec objects
 */
export function generateVisualizationSpecs(aggregates, sources = []) {
  const specs = [];
  const ag = aggregates;

  // ── 1. Category Distribution — bar chart ─────────────────────────────────────
  specs.push({
    visualization_id:   "category_distribution",
    visualization_type: "bar_chart",
    title:              "Threat Category Distribution",
    chart_data: {
      items: labeledCounts(ag.category_counts, CATEGORY_LABELS),
    },
    slide_use:          "threat_landscape_overview",
    data_source:        "category_counts",
    interpretation_hint:"Relative volume of sources across the four main AI threat categories.",
  });

  // ── 2. Source Type Distribution — bar chart ──────────────────────────────────
  specs.push({
    visualization_id:   "source_type_distribution",
    visualization_type: "bar_chart",
    title:              "Source Type Distribution",
    chart_data: {
      items: labeledCounts(ag.source_type_counts, SOURCE_TYPE_LABELS),
    },
    slide_use:          "executive_overview",
    data_source:        "source_type_counts",
    interpretation_hint:"Intelligence source types collected — indicates evidence quality and coverage.",
  });

  // ── 3. Attack Vector Frequency — bar chart ───────────────────────────────────
  const topVectors = sortedEntries(ag.attack_vector_frequency, 15);
  specs.push({
    visualization_id:   "attack_vector_frequency",
    visualization_type: "bar_chart",
    title:              "Top Attack Vectors",
    chart_data: {
      items: topVectors.map(([key, count]) => ({
        key,
        label: key.replace(/_/g, " "),
        count,
      })),
    },
    slide_use:          "category_insight",
    data_source:        "attack_vector_frequency",
    interpretation_hint:"Most frequently observed attack techniques across all sources.",
  });

  // ── 4. Attack Surface Frequency — heatmap ───────────────────────────────────
  const topSurfaces = sortedEntries(ag.attack_surface_frequency, 15);
  specs.push({
    visualization_id:   "attack_surface_heatmap",
    visualization_type: "heatmap",
    title:              "Attack Surface Coverage",
    chart_data: {
      items: topSurfaces.map(([surface, count]) => ({
        key:   surface,
        label: surface.replace(/_/g, " "),
        count,
        intensity: count,
      })),
    },
    slide_use:          "cross_category_convergence",
    data_source:        "attack_surface_frequency",
    interpretation_hint:"AI/cyber attack surfaces most frequently exposed across threat intelligence sources.",
  });

  // ── 5. Maturity Distribution — stacked bar by category ───────────────────────
  const maturityByCat = {};
  for (const cat of OFFENSIVE_CATEGORIES) {
    maturityByCat[cat] = ag.category_breakdowns[cat]?.maturity_distribution || {};
  }
  specs.push({
    visualization_id:   "maturity_distribution",
    visualization_type: "stacked_bar",
    title:              "Threat Maturity by Category",
    chart_data: {
      categories: OFFENSIVE_CATEGORIES.map((c) => CATEGORY_LABELS[c] || c),
      stacks: MATURITY_ORDER.map((m) => ({
        key:    m,
        label:  MATURITY_LABELS[m],
        values: OFFENSIVE_CATEGORIES.map((c) => maturityByCat[c]?.[m] || 0),
      })),
    },
    slide_use:          "threat_landscape_overview",
    data_source:        "category_breakdowns.maturity_distribution",
    interpretation_hint:"Research-to-operational maturity split per category — indicates operationalization pace.",
  });

  // ── 6. Operational Status by Category — stacked bar ─────────────────────────
  const opStatusByCat = {};
  for (const cat of OFFENSIVE_CATEGORIES) {
    const catSources = sources.filter(
      (s) => s.analytics_taxonomy?.analytics_category === cat
    );
    opStatusByCat[cat] = {};
    for (const s of catSources) {
      const st = s.analytics_taxonomy?.analytics_operational_status || "unknown";
      opStatusByCat[cat][st] = (opStatusByCat[cat][st] || 0) + 1;
    }
  }
  specs.push({
    visualization_id:   "operational_status_by_category",
    visualization_type: "stacked_bar",
    title:              "Operational Status by Category",
    chart_data: {
      categories: OFFENSIVE_CATEGORIES.map((c) => CATEGORY_LABELS[c] || c),
      stacks: OPERATIONAL_ORDER.map((o) => ({
        key:    o,
        label:  OPERATIONAL_STATUS_LABELS[o],
        values: OFFENSIVE_CATEGORIES.map((c) => opStatusByCat[c]?.[o] || 0),
      })),
    },
    slide_use:          "threat_landscape_overview",
    data_source:        "analytics_operational_status (per category)",
    interpretation_hint:"Theoretical/research/PoC/operational split per category — shows real-world threat activation.",
  });

  // ── 7. Monthly Category Timeline — stacked bar ───────────────────────────────
  const monthlyCatData = buildStackedBarData(ag.monthly_category_counts, CATEGORY_LABELS);
  specs.push({
    visualization_id:   "monthly_category_timeline",
    visualization_type: "stacked_bar",
    title:              "Monthly Source Activity by Category",
    chart_data:         monthlyCatData,
    slide_use:          "executive_overview",
    data_source:        "monthly_category_counts",
    interpretation_hint:"12-month activity timeline by threat category — shows trend direction and peaks.",
  });

  // ── 8. Signal Cluster Heatmap — categories × clusters ───────────────────────
  const topClusters = Object.keys(ag.signal_cluster_counts)
    .sort((a, b) => ag.signal_cluster_counts[b] - ag.signal_cluster_counts[a])
    .slice(0, 12);

  const clusterByCat = {};
  for (const cat of OFFENSIVE_CATEGORIES) {
    const catSrc = sources.filter((s) => s.analytics_taxonomy?.analytics_category === cat);
    clusterByCat[cat] = {};
    for (const s of catSrc) {
      for (const cl of (s.analytics_taxonomy?.analytics_signal_clusters || [])) {
        clusterByCat[cat][cl] = (clusterByCat[cat][cl] || 0) + 1;
      }
    }
  }

  specs.push({
    visualization_id:   "signal_cluster_heatmap",
    visualization_type: "heatmap",
    title:              "Signal Clusters × Threat Categories",
    chart_data: {
      columns:     OFFENSIVE_CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] || c })),
      rows:        topClusters.map((cl) => ({
        key:     cl,
        label:   cl.replace(/_/g, " "),
        values:  OFFENSIVE_CATEGORIES.map((c) => clusterByCat[c]?.[cl] || 0),
      })),
    },
    slide_use:          "cross_category_convergence",
    data_source:        "signal_cluster_counts (by category)",
    interpretation_hint:"Cross-category signal cluster intensity — reveals which threat signals dominate which categories.",
  });

  // ── 9. Recurring Theme Heatmap — categories × themes ────────────────────────
  const topThemes = Object.keys(ag.recurring_theme_counts)
    .sort((a, b) => ag.recurring_theme_counts[b] - ag.recurring_theme_counts[a])
    .slice(0, 10);

  const themeByCat = {};
  for (const cat of OFFENSIVE_CATEGORIES) {
    const catSrc = sources.filter((s) => s.analytics_taxonomy?.analytics_category === cat);
    themeByCat[cat] = {};
    for (const s of catSrc) {
      for (const th of (s.analytics_taxonomy?.analytics_recurring_themes || [])) {
        themeByCat[cat][th] = (themeByCat[cat][th] || 0) + 1;
      }
    }
  }

  specs.push({
    visualization_id:   "recurring_theme_heatmap",
    visualization_type: "heatmap",
    title:              "Recurring Themes × Threat Categories",
    chart_data: {
      columns:  OFFENSIVE_CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] || c })),
      rows:     topThemes.map((th) => ({
        key:    th,
        label:  th.replace(/_/g, " "),
        values: OFFENSIVE_CATEGORIES.map((c) => themeByCat[c]?.[th] || 0),
      })),
    },
    slide_use:          "outlook_support",
    data_source:        "recurring_theme_counts (by category)",
    interpretation_hint:"Strategic recurring themes per category — supports early signals and 6-month outlook framing.",
  });

  // ── 10. Timeline Events — top 20 high-priority events ───────────────────────
  const priorityOrder = { must_read: 0, high: 1, medium: 2, low: 3, archive_only: 4 };
  const topEvents = [...(ag.timeline_events || [])]
    .sort((a, b) => {
      const pDiff = (priorityOrder[a.rawfact_priority] ?? 5) - (priorityOrder[b.rawfact_priority] ?? 5);
      if (pDiff !== 0) return pDiff;
      return b.date?.localeCompare(a.date || "") || 0;
    })
    .slice(0, 20);

  specs.push({
    visualization_id:   "timeline_events",
    visualization_type: "timeline",
    title:              "Key Events Timeline",
    chart_data: {
      events: topEvents.map((e) => ({
        date:              e.date,
        source_id:         e.source_id,
        title:             e.title,
        publisher:         e.publisher,
        category_label:    CATEGORY_LABELS[e.category] || e.category,
        source_type_label: SOURCE_TYPE_LABELS[e.source_type] || e.source_type,
        rawfact_priority:  e.rawfact_priority,
        top_attack_vector: e.top_attack_vector,
        source_summary:    e.source_summary?.slice(0, 150),
        url:               e.url,
      })),
      date_range: ag.date_range,
    },
    slide_use:          "executive_overview",
    data_source:        "timeline_events",
    interpretation_hint:"Chronological key intelligence events ranked by priority — top 20 shown.",
  });

  // ── 11. Category Maturity Matrix — category × maturity ───────────────────────
  specs.push({
    visualization_id:   "category_maturity_matrix",
    visualization_type: "matrix",
    title:              "Category × Maturity Matrix",
    chart_data: {
      columns: MATURITY_ORDER.map((m) => ({ key: m, label: MATURITY_LABELS[m] })),
      rows:    OFFENSIVE_CATEGORIES.map((cat) => ({
        key:    cat,
        label:  CATEGORY_LABELS[cat] || cat,
        values: MATURITY_ORDER.map(
          (m) => ag.category_breakdowns[cat]?.maturity_distribution?.[m] || 0
        ),
      })),
    },
    slide_use:          "threat_landscape_overview",
    data_source:        "category_breakdowns.maturity_distribution",
    interpretation_hint:"Cross-tab of threat category vs maturity — shows which threats are moving from research to operational.",
  });

  // ── 12. Source Type by Category — stacked bar ────────────────────────────────
  const topTypes = Object.keys(ag.source_type_counts)
    .sort((a, b) => ag.source_type_counts[b] - ag.source_type_counts[a])
    .slice(0, 8);

  const typeByCat = {};
  for (const cat of OFFENSIVE_CATEGORIES) {
    typeByCat[cat] = ag.category_breakdowns[cat]?.source_type_counts || {};
  }

  specs.push({
    visualization_id:   "source_type_by_category",
    visualization_type: "stacked_bar",
    title:              "Evidence Composition by Category",
    chart_data: {
      categories: OFFENSIVE_CATEGORIES.map((c) => CATEGORY_LABELS[c] || c),
      stacks:     topTypes.map((t) => ({
        key:    t,
        label:  SOURCE_TYPE_LABELS[t] || t,
        values: OFFENSIVE_CATEGORIES.map((c) => typeByCat[c]?.[t] || 0),
      })),
    },
    slide_use:          "category_insight",
    data_source:        "category_breakdowns.source_type_counts",
    interpretation_hint:"Evidence type composition per threat category — shows where evidence quality concentrates.",
  });

  // ── 13. Signal Cluster Radar — all categories combined ──────────────────────
  const clusterKeys   = Object.keys(ag.signal_cluster_counts)
    .sort((a, b) => ag.signal_cluster_counts[b] - ag.signal_cluster_counts[a])
    .slice(0, 10);
  const clusterValues = clusterKeys.map((k) => ag.signal_cluster_counts[k] || 0);

  specs.push({
    visualization_id:   "signal_cluster_radar",
    visualization_type: "radar_chart",
    title:              "Signal Cluster Intensity",
    chart_data: {
      axes:   clusterKeys.map((k) => ({ key: k, label: k.replace(/_/g, " ") })),
      values: clusterValues,
    },
    slide_use:          "cross_category_convergence",
    data_source:        "signal_cluster_counts",
    interpretation_hint:"Radar view of dominant threat signal clusters across all sources in this period.",
  });

  // ── 14. AI Layer Frequency — bar chart ──────────────────────────────────────
  specs.push({
    visualization_id:   "ai_layer_frequency",
    visualization_type: "bar_chart",
    title:              "AI Layer Attack Distribution",
    chart_data: {
      items: sortedEntries(ag.ai_layer_frequency, 12).map(([key, count]) => ({
        key,
        label: key.replace(/_/g, " "),
        count,
      })),
    },
    slide_use:          "threat_landscape_overview",
    data_source:        "ai_layer_frequency",
    interpretation_hint:"Which AI system layers are most frequently targeted or exploited.",
  });

  return specs;
}
