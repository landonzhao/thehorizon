/**
 * Generates structured page data for the dashboard.
 *
 * Supports four periods: daily, weekly, monthly, quarterly.
 *
 * The page data object is event-first: sources are evidence for events,
 * events are the primary unit of display. Raw source lists are included
 * only as bibliography/supporting detail.
 */

const CATEGORY_LABELS = {
  llm_threats:            "LLM & Foundation Model Threats",
  agentic_ai_threats:     "Agentic AI & Autonomous System Threats",
  ai_enabled_threats:     "AI-Enabled Attack Techniques",
  traditional_ai_threats: "Traditional ML & Model Attacks",
  ai_for_security:        "AI for Security",
  uncategorised:          "General AI Security Context",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryDistribution(events) {
  const dist = {};
  for (const event of events) {
    const cat = event.threat_category || "uncategorised";
    dist[cat] = (dist[cat] || 0) + 1;
  }
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      count,
      pct: Math.round((count / Math.max(events.length, 1)) * 100),
    }));
}

function maturityDistribution(events, trends) {
  const items = [...events, ...trends];
  const dist = {};
  for (const item of items) {
    const m = item.maturity_level || "unknown";
    dist[m] = (dist[m] || 0) + 1;
  }
  return dist;
}

function topAttackSurfaces(events) {
  const layerCount = {};
  for (const event of events) {
    for (const layer of event.affected_ai_stack_layers || []) {
      layerCount[layer] = (layerCount[layer] || 0) + 1;
    }
  }
  return Object.entries(layerCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([layer, count]) => ({ layer, count }));
}

function operationalVsResearchRatio(events) {
  const operational = events.filter((e) =>
    ["exploited_in_wild","poc_available"].includes(e.exploitation_status)
  ).length;
  const research = events.length - operational;
  const total = events.length || 1;
  return {
    operational,
    research,
    operational_pct: Math.round((operational / total) * 100),
    research_pct:    Math.round((research / total) * 100),
  };
}

function coreVsAdjacentRatio(sources) {
  const core     = sources.filter((s) => s.relevance_tier === "core").length;
  const adjacent = sources.filter((s) => s.relevance_tier === "adjacent").length;
  const context  = sources.filter((s) => s.relevance_tier === "context").length;
  const total    = sources.length || 1;
  return {
    core,
    adjacent,
    context,
    core_pct:     Math.round((core / total) * 100),
    adjacent_pct: Math.round((adjacent / total) * 100),
  };
}

function topEvents(events, n, scoreField = "event_priority_score") {
  return events
    .filter((e) => e[scoreField] != null)
    .sort((a, b) => (b[scoreField] || 0) - (a[scoreField] || 0))
    .slice(0, n)
    .map((e) => ({
      event_id:         e.event_id,
      event_title:      e.event_title,
      event_type:       e.event_type,
      threat_category:  e.threat_category,
      summary:          e.summary,
      evidence_level:   e.evidence_level,
      exploitation_status: e.exploitation_status,
      maturity_level:   e.maturity_level,
      priority_score:   e.event_priority_score,
      report_score:     e.event_report_score,
      cve_ids:          e.cve_ids,
      affected_products: e.affected_products?.slice(0, 5),
      singapore_asean_relevance: e.singapore_asean_relevance,
      first_seen:       e.first_seen,
      last_seen:        e.last_seen,
      source_count:     e.source_count,
      primary_source_id: e.primary_source_id,
    }));
}

function topSources(sources, n) {
  return sources
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, n)
    .map((s) => ({
      id:           s.id,
      title:        s.title,
      url:          s.url,
      publisher:    s.publisher,
      date_published: s.date_published,
      trust_tier:   s.trust_tier,
      source_type:  s.source_type,
      tags:         s.tags?.slice(0, 5),
      priority_score: s.priority_score,
      short_summary: s.short_summary || s.summary,
    }));
}

function activeExploitationItems(events) {
  return events
    .filter((e) => e.exploitation_status === "exploited_in_wild")
    .sort((a, b) => (b.event_priority_score || 0) - (a.event_priority_score || 0))
    .map((e) => ({
      event_id:    e.event_id,
      event_title: e.event_title,
      cve_ids:     e.cve_ids,
      affected_products: e.affected_products?.slice(0, 5),
      priority_score: e.event_priority_score,
      first_seen:  e.first_seen,
    }));
}

function sgItems(events, trends) {
  return {
    events: events.filter((e) => e.singapore_asean_relevance)
      .sort((a, b) => (b.event_priority_score || 0) - (a.event_priority_score || 0))
      .slice(0, 5),
    trends: trends.filter((t) => t.singapore_asean_relevance)
      .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0))
      .slice(0, 3),
  };
}

// ── Period-specific filters ───────────────────────────────────────────────────

function filterByPeriod(events, period) {
  const now = Date.now();
  const MS = {
    daily:     1  * 24 * 3600 * 1000,
    weekly:    7  * 24 * 3600 * 1000,
    monthly:   30 * 24 * 3600 * 1000,
    quarterly: 91 * 24 * 3600 * 1000,
  };
  const window = MS[period] || MS.monthly;
  return events.filter((e) => {
    const last = new Date(e.last_seen || e.first_seen).getTime();
    return !isNaN(last) && now - last <= window;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.period        - daily | weekly | monthly | quarterly
 * @param {object[]} opts.events      - all scored + synthesised events
 * @param {object[]} opts.trends      - all scored + synthesised trends
 * @param {object[]} opts.sources     - all relevant sources (for bibliography)
 * @param {object[]} opts.watchIndicators
 * @param {object[]} opts.convergencePoints
 * @param {string}   opts.generated_at
 */
export function generatePeriodPageData({
  period,
  events,
  trends,
  sources,
  watchIndicators = [],
  convergencePoints = [],
  generated_at = new Date().toISOString(),
}) {
  const periodEvents  = filterByPeriod(events, period);
  const periodSources = sources.filter((s) => {
    if (period === "daily")     return s.eligible_for_daily_report !== false;
    if (period === "weekly")    return s.eligible_for_weekly_report !== false;
    if (period === "monthly")   return s.eligible_for_monthly_report !== false;
    if (period === "quarterly") return s.eligible_for_monthly_report !== false;
    return true;
  });

  const isDaily = period === "daily";

  // Daily: prioritise urgency. Weekly+: prioritise patterns and distribution.
  const eventScoreField = isDaily ? "event_priority_score" : "event_report_score";
  const topN = isDaily ? 5 : period === "quarterly" ? 20 : 10;

  const sgData = sgItems(periodEvents, trends);

  return {
    period,
    generated_at,
    reporting_window: {
      period,
      as_of: generated_at,
    },

    // ── Counts ──────────────────────────────────────────────────────────────
    total_sources_analyzed: periodSources.length,
    total_events:           periodEvents.length,
    total_trends:           trends.length,

    // ── Distributions ───────────────────────────────────────────────────────
    category_distribution:      categoryDistribution(periodEvents),
    maturity_distribution:      maturityDistribution(periodEvents, trends),
    core_vs_adjacent:           coreVsAdjacentRatio(periodSources),
    operational_vs_research:    operationalVsResearchRatio(periodEvents),
    top_attack_surfaces:        topAttackSurfaces(periodEvents),

    // ── Top items ───────────────────────────────────────────────────────────
    top_events:   topEvents(periodEvents, topN, eventScoreField),
    top_sources:  topSources(periodSources, isDaily ? 10 : 20),
    top_trends:   trends
      .sort((a, b) => (b.trend_score || 0) - (a.trend_score || 0))
      .slice(0, isDaily ? 3 : 8)
      .map((t) => ({
        trend_id:          t.trend_id,
        trend_title:       t.trend_title,
        summary:           t.summary,
        threat_categories: t.threat_categories,
        maturity_level:    t.maturity_level,
        trajectory:        t.trajectory,
        trend_score:       t.trend_score,
        event_count:       t.supporting_event_ids?.length || 0,
        watch_window:      t.watch_window,
      })),

    // ── Urgency items (daily focus) ──────────────────────────────────────────
    active_exploitation_items: activeExploitationItems(periodEvents),
    new_cves:                  periodEvents.filter((e) => (e.cve_ids || []).length > 0)
      .sort((a, b) => (b.event_priority_score || 0) - (a.event_priority_score || 0))
      .flatMap((e) => e.cve_ids)
      .slice(0, 15),

    // ── Watch and convergence ────────────────────────────────────────────────
    watch_indicators:      watchIndicators.slice(0, isDaily ? 5 : 10),
    convergence_points:    convergencePoints.slice(0, isDaily ? 2 : 6),

    // ── Singapore/ASEAN ──────────────────────────────────────────────────────
    singapore_asean: {
      relevant_events:  sgData.events.map((e) => ({ event_id: e.event_id, event_title: e.event_title, priority_score: e.event_priority_score })),
      relevant_trends:  sgData.trends.map((t) => ({ trend_id: t.trend_id, trend_title: t.trend_title })),
    },

    // ── Bibliography ─────────────────────────────────────────────────────────
    source_appendix: periodSources
      .sort((a, b) => (b.report_score || 0) - (a.report_score || 0))
      .slice(0, 50)
      .map((s) => ({
        id:           s.id,
        title:        s.title,
        publisher:    s.publisher,
        date_published: s.date_published?.slice(0, 10),
        url:          s.url,
        trust_tier:   s.trust_tier,
        tags:         s.tags?.slice(0, 3),
      })),
  };
}
