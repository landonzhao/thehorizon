/**
 * Builds the structured monthly horizon scan data object.
 *
 * This is the intermediate representation that generateMonthlyHorizonScan.js
 * renders into a report. Keeping these separate allows re-rendering with
 * different templates without re-running the full pipeline.
 *
 * The report must NOT be generated directly from raw sources.
 * It must be generated from: events, trends, strategic_shifts,
 * convergence_points, defender_implications, watch_indicators.
 */

import { MATURITY_LEVELS } from "../events/synthesiseEvent.js";

const CATEGORY_LABELS = {
  llm_threats:            "LLM & Foundation Model Threats",
  agentic_ai_threats:     "Agentic AI & Autonomous System Threats",
  ai_enabled_threats:     "AI-Enabled Attack Techniques",
  traditional_ai_threats: "Traditional ML & Model Attacks",
  ai_for_security:        "AI for Security",
  uncategorised:          "General AI Security Context",
};

// Category ordering for the report
const CATEGORY_ORDER = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
  "uncategorised",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function domMonth(sources) {
  const dates = sources.map((s) => s.date_published).filter(Boolean);
  if (dates.length === 0) return "this month";
  const sorted = dates.slice().sort();
  const earliest = sorted[0]?.slice(0, 7);
  const latest   = sorted[sorted.length - 1]?.slice(0, 7);
  if (earliest === latest) {
    const [y, m] = earliest.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-SG", { month: "long", year: "numeric" });
  }
  return `${earliest} to ${latest}`;
}

function sourceTierBreakdown(sources) {
  const tiers = {};
  for (const s of sources) {
    const t = s.trust_tier || "unknown";
    tiers[t] = (tiers[t] || 0) + 1;
  }
  return Object.entries(tiers)
    .sort((a, b) => b[1] - a[1])
    .map(([tier, count]) => ({ tier, count, pct: Math.round((count / Math.max(sources.length, 1)) * 100) }));
}

function buildCategorySection(category, events, trends, convergencePoints) {
  const catEvents = events.filter((e) => e.threat_category === category);
  const catTrends = trends.filter((t) => (t.threat_categories || []).includes(category));
  const catConvergence = convergencePoints.filter((c) => (c.involved_categories || []).includes(category));

  if (catEvents.length === 0 && catTrends.length === 0) return null;

  const topEvents = catEvents
    .sort((a, b) => (b.event_report_score || 0) - (a.event_report_score || 0))
    .slice(0, 5);

  const activeExploitation = catEvents.filter((e) => e.exploitation_status === "exploited_in_wild");
  const pocAvailable       = catEvents.filter((e) => e.exploitation_status === "poc_available");
  const researchSignals    = catEvents.filter((e) => e.maturity_level === "research" || e.maturity_level === "emerging");
  const allLayers          = [...new Set(catEvents.flatMap((e) => e.affected_ai_stack_layers || []))];

  const maturityCounts = {};
  for (const e of catEvents) {
    const m = e.maturity_level || "unknown";
    maturityCounts[m] = (maturityCounts[m] || 0) + 1;
  }

  return {
    category,
    label:           CATEGORY_LABELS[category] || category,
    event_count:     catEvents.length,
    trend_count:     catTrends.length,
    top_events:      topEvents.map((e) => ({
      event_id:              e.event_id,
      event_title:           e.event_title,
      summary:               e.summary,
      what_happened:         e.what_happened,
      how_it_happened:       e.how_it_happened,
      why_it_matters:        e.why_it_matters,
      defender_implications: e.defender_implications,
      watch_indicators:      e.watch_indicators || [],
      evidence_level:        e.evidence_level,
      exploitation_status:   e.exploitation_status,
      maturity_level:        e.maturity_level,
      cve_ids:               e.cve_ids || [],
      affected_products:     e.affected_products?.slice(0, 5) || [],
      source_count:          e.source_count,
    })),
    active_exploitation_count: activeExploitation.length,
    poc_available_count:       pocAvailable.length,
    research_signal_count:     researchSignals.length,
    affected_stack_layers:     allLayers,
    maturity_distribution:     maturityCounts,
    key_trends:                catTrends.slice(0, 3).map((t) => ({
      trend_title:           t.trend_title,
      summary:               t.summary,
      trajectory:            t.trajectory,
      maturity_level:        t.maturity_level,
      defender_implications: t.defender_implications,
      watch_window:          t.watch_window,
      key_indicators_next_month: t.key_indicators_next_month || [],
    })),
    convergence_signals:       catConvergence.map((c) => ({
      title:          c.title,
      strategic_risk: c.strategic_risk,
      defender_gap:   c.defender_gap,
    })),
    defensive_maturity_assessment: catTrends[0]?.strategic_significance || null,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object[]} opts.events
 * @param {object[]} opts.trends
 * @param {object[]} opts.strategicShifts
 * @param {object[]} opts.convergencePoints
 * @param {object[]} opts.defenderImplications
 * @param {object[]} opts.watchIndicators
 * @param {object[]} opts.maturityMatrix
 * @param {object[]} opts.sources                - full source list for bibliography
 * @param {string}   opts.period                 - reporting period description
 * @param {string}   opts.generated_at
 */
export function buildMonthlyHorizonScanData({
  events,
  trends,
  strategicShifts,
  convergencePoints,
  defenderImplications,
  watchIndicators,
  maturityMatrix,
  sources,
  period,
  generated_at = new Date().toISOString(),
}) {
  const reportPeriod = period || domMonth(sources);
  const topEvents = events.sort((a, b) => (b.event_report_score || 0) - (a.event_report_score || 0));
  const sgEvents  = events.filter((e) => e.singapore_asean_relevance);
  const exploitedEvents = events.filter((e) => e.exploitation_status === "exploited_in_wild");

  // Category distribution
  const catDist = {};
  for (const e of events) {
    const c = e.threat_category || "uncategorised";
    catDist[c] = (catDist[c] || 0) + 1;
  }

  // Dominant category
  const dominantCategory = Object.entries(catDist).sort((a, b) => b[1] - a[1])[0]?.[0] || "uncategorised";

  // Top emerging attack surface (most common layer across events)
  const layerFreq = {};
  for (const e of events) for (const l of e.affected_ai_stack_layers || []) layerFreq[l] = (layerFreq[l] || 0) + 1;
  const topEmergingSurface = Object.entries(layerFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Operational vs research ratio
  const operational = events.filter((e) => ["exploited_in_wild","poc_available"].includes(e.exploitation_status)).length;

  // Build category sections
  const categorySections = {};
  for (const cat of CATEGORY_ORDER) {
    const section = buildCategorySection(cat, events, trends, convergencePoints);
    if (section) categorySections[cat] = section;
  }

  // Source appendix — structured by category
  const sourcesByCategory = {};
  for (const source of sources) {
    const cat = source.main_category || "uncategorised";
    if (!sourcesByCategory[cat]) sourcesByCategory[cat] = [];
    sourcesByCategory[cat].push({
      id:           source.id,
      title:        source.title,
      publisher:    source.publisher,
      date_published: source.date_published?.slice(0, 10),
      url:          source.url,
      trust_tier:   source.trust_tier,
      tags:         source.tags?.slice(0, 3),
      short_summary: source.short_summary || source.summary?.slice(0, 200),
      report_score:  source.report_score,
    });
  }

  const sourceAppendix = CATEGORY_ORDER
    .filter((c) => sourcesByCategory[c]?.length > 0)
    .map((cat) => ({
      category: cat,
      label:    CATEGORY_LABELS[cat] || cat,
      sources:  sourcesByCategory[cat]
        .sort((a, b) => (b.report_score || 0) - (a.report_score || 0))
        .slice(0, 30),
    }));

  return {
    report_metadata: {
      title:            `AI Threat Horizon Scan — ${reportPeriod}`,
      reporting_period: reportPeriod,
      generated_at,
      version:          "1.0",
      classification:   "TLP:WHITE",
      one_line_thesis:  strategicShifts[0]?.shift_title || "AI threat landscape continues to evolve.",
    },

    month_at_a_glance: {
      total_sources_analyzed:   sources.length,
      total_events:             events.length,
      total_trends:             trends.length,
      dominant_threat_category: dominantCategory,
      dominant_category_label:  CATEGORY_LABELS[dominantCategory] || dominantCategory,
      top_emerging_attack_surface: topEmergingSurface,
      operational_vs_research_pct: {
        operational: Math.round((operational / Math.max(events.length, 1)) * 100),
        research:    100 - Math.round((operational / Math.max(events.length, 1)) * 100),
      },
      top_5_shifts:             strategicShifts.slice(0, 5).map((s) => s.shift_title),
      active_exploitation_count: exploitedEvents.length,
      singapore_asean_event_count: sgEvents.length,
      category_distribution:    Object.entries(catDist)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => ({ category: cat, label: CATEGORY_LABELS[cat] || cat, count })),
    },

    executive_summary: strategicShifts.slice(0, 6).map((shift) => ({
      shift_title:           shift.shift_title,
      previous_assumption:   shift.previous_assumption,
      emerging_reality:      shift.emerging_reality,
      implications:          shift.implications_for_defenders,
      confidence_level:      shift.confidence_level,
      maturity_level:        shift.maturity_level,
      why_this_matters:      shift.why_this_matters,
      singapore_asean_relevance: shift.singapore_asean_relevance,
    })),

    methodology: {
      scope:                "AI threat landscape: LLM vulnerabilities, agentic AI risks, AI-enabled attacks, traditional ML attacks",
      collection_sources:   ["arXiv", "NVD", "RSS feeds", "LLM discovery", "curated imports"],
      source_tiers:         sourceTierBreakdown(sources),
      total_sources:        sources.length,
      total_events:         events.length,
      total_trends:         trends.length,
      inclusion_criteria:   "Sources with AI specificity score >=10 and structural validity >=25",
      maturity_taxonomy:    MATURITY_LEVELS,
      threat_categories:    Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ category: k, label: v })),
    },

    landscape_overview: {
      total_sources:             sources.length,
      total_events:              events.length,
      total_trends:              trends.length,
      category_distribution:     catDist,
      operational_vs_research:   { operational, research: events.length - operational },
      top_emerging_attack_surfaces: Object.entries(layerFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([layer, count]) => ({ layer, count })),
      most_significant_events:   topEvents.slice(0, 8).map((e) => ({
        event_id: e.event_id, event_title: e.event_title, threat_category: e.threat_category,
        evidence_level: e.evidence_level, report_score: e.event_report_score,
      })),
    },

    strategic_shifts:     strategicShifts,
    category_sections:    categorySections,
    cross_category_convergence: convergencePoints,
    operational_implications:   defenderImplications,
    maturity_trajectory_matrix: maturityMatrix,

    horizon_watch: {
      weak_signals: events.filter((e) => e.maturity_level === "research")
        .sort((a, b) => (b.event_report_score || 0) - (a.event_report_score || 0))
        .slice(0, 5)
        .map((e) => ({
          event_id:    e.event_id,
          event_title: e.event_title,
          summary:     e.summary,
          why_watch:   e.why_it_matters,
          confidence:  e.confidence_level,
        })),
      research_to_threat_pipelines: trends
        .filter((t) => t.maturity_level === "research" || t.maturity_level === "emerging")
        .slice(0, 5),
      next_month_indicators: watchIndicators.slice(0, 10).map((w) => w.indicator),
    },

    next_month_indicators: watchIndicators.slice(0, 15).map((w) => ({
      indicator:   w.indicator,
      source_type: w.source_type,
      source_title: w.source_title,
      maturity_level: w.maturity_level,
      singapore_asean_relevance: w.singapore_asean_relevance,
    })),

    intelligence_summary_appendix: {
      source_count:             sources.length,
      event_count:              events.length,
      trend_count:              trends.length,
      highest_scoring_events:   topEvents.slice(0, 5).map((e) => ({ id: e.event_id, title: e.event_title, score: e.event_report_score })),
      most_cited_attack_vectors: Object.entries(
        events.flatMap((e) => e.tags || []).reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count })),
      category_counts:          catDist,
      confidence_notes:         "Confidence levels reflect quality and corroboration of source evidence, not probability of future events.",
      methodological_limitations: "Collection is limited to English-language open sources. Private threat intelligence and classified advisories are not included.",
    },

    source_appendix: sourceAppendix,
  };
}
