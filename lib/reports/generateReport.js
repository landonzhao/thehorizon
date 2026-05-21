import { supabase } from "../storage/supabaseClient.js";
import { getIsoWeekWindow, isoWeekKey } from "../time/reportingWindow.js";
import { extractSignalsWithEvidence } from "./extractSignals.js";
import { buildTimeline } from "./buildTimeline.js";
import { comparePeriods } from "./comparePeriods.js";
import { findConvergence } from "./findConvergence.js";
import { buildChartData } from "./buildChartData.js";

// ── Period configuration ──────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  llm_threats:             "LLM & Foundation Model Threats",
  agentic_ai_threats:      "Agentic AI & Autonomous System Threats",
  ai_enabled_threats:      "AI-Enabled Attack Techniques",
  traditional_ai_threats:  "Traditional ML & Model Attacks",
  ai_for_security:         "AI Applied to Security Defence",
  uncategorised:           "General AI Security Context",
};

/**
 * Build date range for a given period.
 * Weekly uses Mon-Sun ISO week boundaries (SGT-anchored).
 * Monthly and quarterly use rolling windows from today.
 *
 * @param {string} period  - weekly | monthly | quarterly
 * @param {number} weekOffset - for weekly only; 0=current week, -1=last week, etc.
 * @param {Date}   now
 */
function periodWindow(period, weekOffset = 0, now = new Date()) {
  if (period === "weekly") {
    const w = getIsoWeekWindow(weekOffset, now);
    return {
      start:       w.start_utc,
      end:         w.end_utc,
      week_key:    w.week_key,
      is_complete: w.is_complete,
    };
  }

  const days = period === "monthly" ? 30 : 91;
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - days * 86400000);
  start.setUTCHours(0, 0, 0, 0);

  const y = end.getUTCFullYear();
  const m = end.getUTCMonth() + 1;
  const q = Math.ceil(m / 3);

  return {
    start:       start.toISOString(),
    end:         end.toISOString(),
    week_key:    period === "monthly" ? `${y}-${String(m).padStart(2, "0")}` : `${y}-Q${q}`,
    is_complete: true,
  };
}

function makeReportId(period, weekKey) {
  return `report-${period}-${weekKey}`;
}

// ── Database fetching ─────────────────────────────────────────────────────────

async function fetchSourcesForPeriod(start, end, tiers = ["core", "adjacent"]) {
  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, title, url, publisher, source_type, date_published, main_category, " +
      "relevance_tier, ai_specificity_score, priority_score, report_score, " +
      "priority_label, short_summary, analyst_brief, intelligence, tags, " +
      "trust_tier, claim_extraction_status"
    )
    .gte("date_published", start)
    .lte("date_published", end)
    .in("relevance_tier", tiers)
    .order("report_score", { ascending: false })
    .limit(500);

  if (error) throw error;

  // Deduplicate by URL; keep highest report_score (already sorted desc)
  const seen = new Set();
  const deduped = [];
  for (const s of data || []) {
    const key = s.url || s.title;
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(s);
    }
  }
  return deduped;
}

// ── Statistics ────────────────────────────────────────────────────────────────

function buildStatistics(sources) {
  const byCategory = {};
  const maturity = { emerging: 0, growing: 0, established: 0, declining: 0, unknown: 0 };
  const reportTier = { weekly: 0, monthly: 0, quarterly: 0, archive_only: 0 };
  const priority = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    const m = s.intelligence?.threat_maturity || "unknown";
    maturity[m] = (maturity[m] || 0) + 1;

    const t = s.intelligence?.report_tier || "archive_only";
    reportTier[t] = (reportTier[t] || 0) + 1;

    const p = s.priority_label || "low";
    priority[p] = (priority[p] || 0) + 1;
  }

  return {
    total_sources: sources.length,
    enriched:      sources.filter((s) => s.claim_extraction_status === "success").length,
    by_relevance_tier: {
      core:     sources.filter((s) => s.relevance_tier === "core").length,
      adjacent: sources.filter((s) => s.relevance_tier === "adjacent").length,
      context:  sources.filter((s) => s.relevance_tier === "context").length,
    },
    by_category:    byCategory,
    by_priority:    priority,
    threat_maturity: maturity,
    report_tier:    reportTier,
  };
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildTopDevelopments(sources) {
  return [...sources]
    .sort((a, b) => (b.report_score || 0) - (a.report_score || 0))
    .slice(0, 10)
    .map((s) => ({
      title:          s.title,
      url:            s.url,
      publisher:      s.publisher,
      date_published: s.date_published,
      category:       s.main_category,
      category_label: CATEGORY_LABELS[s.main_category] || s.main_category,
      short_summary:  s.short_summary,
      priority_label: s.priority_label,
      report_score:   s.report_score,
      why_it_matters: s.analyst_brief?.why_it_matters,
      watch_points:   s.analyst_brief?.watch_points || [],
      tags:           s.tags || [],
    }));
}

function buildEmergingThreats(sources) {
  return sources
    .filter((s) => ["emerging", "growing"].includes(s.intelligence?.threat_maturity))
    .sort((a, b) => (b.intelligence?.horizon_relevance || 0) - (a.intelligence?.horizon_relevance || 0))
    .slice(0, 10)
    .map((s) => ({
      title:           s.title,
      url:             s.url,
      publisher:       s.publisher,
      category:        s.main_category,
      category_label:  CATEGORY_LABELS[s.main_category] || s.main_category,
      threat_maturity: s.intelligence?.threat_maturity,
      horizon_relevance: s.intelligence?.horizon_relevance,
      short_summary:   s.short_summary,
      trend_signals:   s.intelligence?.trend_signals || [],
    }));
}

function buildKeyEntities(sources) {
  const actors   = new Map();
  const tools    = new Map();
  const products = new Map();
  const cves     = new Set();
  const CVE_RE   = /^CVE-\d{4}-\d{4,}$/i;

  for (const s of sources) {
    const ke = s.intelligence?.key_entities || {};
    for (const a of ke.threat_actors        || []) actors.set(a, (actors.get(a) || 0) + 1);
    for (const t of ke.tools_and_techniques || []) tools.set(t, (tools.get(t) || 0) + 1);
    for (const p of ke.affected_products    || []) products.set(p, (products.get(p) || 0) + 1);
    for (const c of ke.cves                 || []) { if (CVE_RE.test(c)) cves.add(c.toUpperCase()); }
  }

  const sortByCount = (map, n = 15) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

  return {
    threat_actors:        sortByCount(actors, 10),
    tools_and_techniques: sortByCount(tools, 15),
    affected_products:    sortByCount(products, 15),
    cves:                 [...cves].slice(0, 30),
  };
}

function buildSectorAlerts(sources) {
  const sectorMap = new Map();
  for (const s of sources) {
    for (const sector of s.intelligence?.sector_impact || []) {
      if (!sectorMap.has(sector)) sectorMap.set(sector, { sector, count: 0, top_sources: [] });
      const entry = sectorMap.get(sector);
      entry.count++;
      if (entry.top_sources.length < 3) entry.top_sources.push({ title: s.title, url: s.url });
    }
  }
  return [...sectorMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function buildCategoryBreakdown(sources) {
  const groups = {};
  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }

  return Object.entries(groups).map(([cat, catSources]) => {
    const sorted = [...catSources].sort((a, b) => (b.report_score || 0) - (a.report_score || 0));
    return {
      category: cat,
      label:    CATEGORY_LABELS[cat] || cat,
      count:    catSources.length,
      top_sources: sorted.slice(0, 8).map((s) => ({
        title:          s.title,
        url:            s.url,
        publisher:      s.publisher,
        date_published: s.date_published,
        short_summary:  s.short_summary,
        priority_label: s.priority_label,
        relevance_tier: s.relevance_tier,
        report_score:   s.report_score,
        tags:           s.tags || [],
        watch_points:   s.analyst_brief?.watch_points || [],
      })),
    };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a structured intelligence report for the given period.
 *
 * @param {object} options
 * @param {string} options.period       - weekly | monthly | quarterly
 * @param {number} options.weekOffset   - 0 = current week, -1 = last week (weekly only)
 * @param {Date}   options.referenceDate
 * @param {string[]} options.includeTiers
 */
export async function generateReport({
  period = "weekly",
  weekOffset = 0,
  referenceDate = new Date(),
  includeTiers = ["core", "adjacent"],
} = {}) {
  const win = periodWindow(period, weekOffset, referenceDate);
  const { start, end, week_key, is_complete } = win;

  const report_id = makeReportId(period, week_key);

  const sources = await fetchSourcesForPeriod(start, end, includeTiers);

  if (sources.length === 0) {
    return {
      report_id,
      period,
      week_key,
      is_complete,
      date_range:  { start, end },
      generated_at: new Date().toISOString(),
      statistics:  { total_sources: 0, enriched: 0 },
      message: "No sources found for this period.",
    };
  }

  // ── Compute all sections in parallel where possible ───────────────────────

  const [periodComparison] = await Promise.all([
    comparePeriods(start, end),
  ]);

  const signalClusters  = extractSignalsWithEvidence(sources);
  const convergences    = findConvergence(signalClusters);
  const timeline        = buildTimeline(sources, { maxEvents: 60 });
  const chartData       = buildChartData(sources);

  // ── Assemble structured sections ──────────────────────────────────────────

  const statistics       = buildStatistics(sources);
  const topDevelopments  = buildTopDevelopments(sources);
  const emergingThreats  = buildEmergingThreats(sources);
  const keyEntities      = buildKeyEntities(sources);
  const sectorAlerts     = buildSectorAlerts(sources);
  const categoryBreakdown = buildCategoryBreakdown(sources);

  return {
    // Identity
    report_id,
    period,
    week_key,
    is_complete,
    date_range:   { start, end },
    generated_at: new Date().toISOString(),

    // Summary
    statistics,

    // Section 1: Executive overview
    executive: {
      strategic_shifts: periodComparison.strategic_shifts,
      top_developments: topDevelopments,
      emerging_threats: emergingThreats,
    },

    // Section 2: Threat landscape (signals + convergence)
    threat_landscape: {
      signal_clusters: signalClusters,
      convergences,
      // Flat list of top signals across all categories (legacy compat)
      trend_signals: signalClusters.all_clusters.flatMap((c) =>
        c.evidence.slice(0, 1).map((e) => ({
          signal:          e.signal_text,
          source_title:    e.title,
          source_url:      e.url,
          threat_maturity: e.threat_maturity,
          horizon_relevance: e.horizon_relevance,
        }))
      ).slice(0, 20),
    },

    // Section 3: Category deep-dives
    category_breakdown: categoryBreakdown,

    // Section 4: Timeline
    timeline,

    // Section 5: Intelligence entities
    key_entities:  keyEntities,
    sector_alerts: sectorAlerts,

    // Section 6: Chart data (pre-shaped for frontend rendering)
    chart_data: chartData,

    // Period comparison raw data (for strategic shifts source)
    period_comparison: periodComparison,
  };
}
