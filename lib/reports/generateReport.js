import { supabase } from "../storage/supabaseClient.js";
import { extractSignalsWithEvidence } from "./extractSignals.js";
import { buildTimeline } from "./buildTimeline.js";
import { comparePeriods } from "./comparePeriods.js";
import { findConvergence } from "./findConvergence.js";
import { buildChartData } from "./buildChartData.js";

const PERIOD_DAYS = { weekly: 7, monthly: 30, quarterly: 91 };

const CATEGORY_LABELS = {
  llm_threats: "LLM & Foundation Model Threats",
  agentic_ai_threats: "Agentic AI & Autonomous System Threats",
  ai_enabled_threats: "AI-Enabled Attack Techniques",
  traditional_ai_threats: "Traditional ML & Model Attacks",
  ai_for_security: "AI Applied to Security Defence",
  uncategorised: "General AI Security Context",
};

function periodDates(period, referenceDate = new Date()) {
  const days = PERIOD_DAYS[period];
  if (!days) throw new Error(`Unknown period: ${period}. Use weekly, monthly, or quarterly.`);

  const end = new Date(referenceDate);
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);

  return { start: start.toISOString(), end: end.toISOString() };
}

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

  // Deduplicate by URL (same article can be ingested from multiple connector runs).
  // Keep the copy with the highest report_score (already sorted desc).
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

function groupByCategory(sources) {
  const groups = {};
  for (const source of sources) {
    const cat = source.main_category || "uncategorised";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(source);
  }
  return groups;
}

function extractEntities(sources) {
  const actors = new Map();
  const tools = new Map();
  const products = new Map();
  const cves = new Set();

  for (const source of sources) {
    const intel = source.intelligence || {};
    const ke = intel.key_entities || {};

    for (const a of ke.threat_actors || []) {
      actors.set(a, (actors.get(a) || 0) + 1);
    }
    for (const t of ke.tools_and_techniques || []) {
      tools.set(t, (tools.get(t) || 0) + 1);
    }
    for (const p of ke.affected_products || []) {
      products.set(p, (products.get(p) || 0) + 1);
    }
    for (const c of ke.cves || []) {
      cves.add(c);
    }
  }

  const sortByCount = (map, limit = 10) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

  return {
    threat_actors: sortByCount(actors),
    tools_and_techniques: sortByCount(tools, 15),
    affected_products: sortByCount(products, 15),
    cves: [...cves].slice(0, 30),
  };
}

function extractTrendSignals(sources) {
  const signals = [];
  const seen = new Set();

  // Prioritise emerging/growing threats and high horizon relevance
  const sorted = [...sources].sort((a, b) => {
    const ha = a.intelligence?.horizon_relevance || 0;
    const hb = b.intelligence?.horizon_relevance || 0;
    return hb - ha;
  });

  for (const source of sorted) {
    const intel = source.intelligence || {};
    for (const signal of intel.trend_signals || []) {
      const key = signal.toLowerCase().slice(0, 60);
      if (!seen.has(key)) {
        seen.add(key);
        signals.push({
          signal,
          source_title: source.title,
          source_url: source.url,
          threat_maturity: intel.threat_maturity,
          horizon_relevance: intel.horizon_relevance,
        });
      }
      if (signals.length >= 20) break;
    }
    if (signals.length >= 20) break;
  }

  return signals;
}

function extractEmergingThreats(sources) {
  return sources
    .filter((s) => {
      const maturity = s.intelligence?.threat_maturity;
      return maturity === "emerging" || maturity === "growing";
    })
    .sort((a, b) => (b.intelligence?.horizon_relevance || 0) - (a.intelligence?.horizon_relevance || 0))
    .slice(0, 10)
    .map((s) => ({
      title: s.title,
      url: s.url,
      publisher: s.publisher,
      category: s.main_category,
      threat_maturity: s.intelligence?.threat_maturity,
      horizon_relevance: s.intelligence?.horizon_relevance,
      short_summary: s.short_summary,
      trend_signals: s.intelligence?.trend_signals || [],
    }));
}

function extractSectorAlerts(sources) {
  const sectorMap = new Map();

  for (const source of sources) {
    const sectors = source.intelligence?.sector_impact || [];
    for (const sector of sectors) {
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { sector, count: 0, top_sources: [] });
      }
      const entry = sectorMap.get(sector);
      entry.count += 1;
      if (entry.top_sources.length < 3) {
        entry.top_sources.push({ title: source.title, url: source.url });
      }
    }
  }

  return [...sectorMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildCategorySection(category, sources) {
  const topSources = sources
    .sort((a, b) => (b.report_score || 0) - (a.report_score || 0))
    .slice(0, 8)
    .map((s) => ({
      title: s.title,
      url: s.url,
      publisher: s.publisher,
      date_published: s.date_published,
      short_summary: s.short_summary,
      priority_label: s.priority_label,
      relevance_tier: s.relevance_tier,
      report_score: s.report_score,
      tags: s.tags || [],
      watch_points: s.analyst_brief?.watch_points || [],
    }));

  return {
    category,
    label: CATEGORY_LABELS[category] || category,
    count: sources.length,
    top_sources: topSources,
  };
}

export async function generateReport({
  period = "weekly",
  referenceDate = new Date(),
  includeTiers = ["core", "adjacent"],
} = {}) {
  const { start, end } = periodDates(period, referenceDate);
  const sources = await fetchSourcesForPeriod(start, end, includeTiers);

  if (sources.length === 0) {
    return {
      period,
      date_range: { start, end },
      source_count: 0,
      message: "No sources found for this period. Run /api/classify-sources and /api/score-sources first.",
    };
  }

  const byCategory = groupByCategory(sources);
  const entities = extractEntities(sources);
  const trendSignals = extractTrendSignals(sources);
  const emergingThreats = extractEmergingThreats(sources);
  const sectorAlerts = extractSectorAlerts(sources);
  const signalClusters = extractSignalsWithEvidence(sources);
  const timeline = buildTimeline(sources);
  const convergences = findConvergence(signalClusters);
  const chartData = buildChartData(sources);
  const periodComparison = await comparePeriods(start, end);

  // Top developments: highest report_score sources across all categories
  const topDevelopments = [...sources]
    .sort((a, b) => (b.report_score || 0) - (a.report_score || 0))
    .slice(0, 10)
    .map((s) => ({
      title: s.title,
      url: s.url,
      publisher: s.publisher,
      date_published: s.date_published,
      category: s.main_category,
      short_summary: s.short_summary,
      priority_label: s.priority_label,
      report_score: s.report_score,
      why_it_matters: s.analyst_brief?.why_it_matters,
      watch_points: s.analyst_brief?.watch_points || [],
    }));

  // Category breakdown
  const categoryBreakdown = Object.entries(byCategory).map(([cat, catSources]) =>
    buildCategorySection(cat, catSources)
  );

  // Maturity distribution
  const maturityCounts = { emerging: 0, growing: 0, established: 0, declining: 0, unknown: 0 };
  for (const s of sources) {
    const m = s.intelligence?.threat_maturity || "unknown";
    maturityCounts[m] = (maturityCounts[m] || 0) + 1;
  }

  // Report tier distribution
  const tierCounts = { weekly: 0, monthly: 0, quarterly: 0, archive_only: 0 };
  for (const s of sources) {
    const t = s.intelligence?.report_tier || "archive_only";
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }

  const statistics = {
    total_sources: sources.length,
    by_relevance_tier: {
      core: sources.filter((s) => s.relevance_tier === "core").length,
      adjacent: sources.filter((s) => s.relevance_tier === "adjacent").length,
      context: sources.filter((s) => s.relevance_tier === "context").length,
    },
    by_category: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    ),
    by_priority: {
      critical: sources.filter((s) => s.priority_label === "critical").length,
      high: sources.filter((s) => s.priority_label === "high").length,
      medium: sources.filter((s) => s.priority_label === "medium").length,
      low: sources.filter((s) => s.priority_label === "low").length,
    },
    threat_maturity: maturityCounts,
    report_tier: tierCounts,
    gemini_enriched: sources.filter((s) => s.claim_extraction_status === "success").length,
  };

  return {
    period,
    date_range: { start, end },
    generated_at: new Date().toISOString(),
    statistics,
    top_developments: topDevelopments,
    emerging_threats: emergingThreats,
    trend_signals: trendSignals,
    sector_alerts: sectorAlerts,
    key_entities: entities,
    category_breakdown: categoryBreakdown,
    signal_clusters: signalClusters,
    timeline,
    period_comparison: periodComparison,
    convergences,
    chart_data: chartData,
  };
}
