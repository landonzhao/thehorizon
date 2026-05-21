/**
 * Chart data builder for report visualisations.
 *
 * Produces pre-shaped data for:
 * 1. radar_chart       — category intensity bars
 * 2. maturity_bar      — maturity breakdown per category
 * 3. weekly_activity   — source count over time
 * 4. sector_radar      — sector impact frequency
 * 5. category_pie      — donut/pie distribution
 * 6. tag_frequency     — top tags ranked by count (for heatmap)
 * 7. enrichment_stats  — enrichment rate by category
 */

const CATEGORY_ORDER = [
  "agentic_ai_threats",
  "llm_threats",
  "ai_enabled_threats",
  "traditional_ai_threats",
  "ai_for_security",
];

const CATEGORY_LABELS = {
  agentic_ai_threats:     "Agentic AI",
  llm_threats:            "LLM Threats",
  ai_enabled_threats:     "AI-Enabled",
  traditional_ai_threats: "Traditional ML",
  ai_for_security:        "AI Defence",
  uncategorised:          "Other",
};

const CATEGORY_COLOURS = {
  agentic_ai_threats:     "#f97316",
  llm_threats:            "#ef4444",
  ai_enabled_threats:     "#a855f7",
  traditional_ai_threats: "#3b82f6",
  ai_for_security:        "#22c55e",
  uncategorised:          "#6b7280",
};

const MATURITY_COLOURS = {
  emerging:    "#f97316",
  growing:     "#eab308",
  established: "#3b82f6",
  declining:   "#6b7280",
  unknown:     "#1e293b",
};

// ── Radar chart ───────────────────────────────────────────────────────────────

function buildRadarChart(sources) {
  const catData = {};
  for (const cat of CATEGORY_ORDER) {
    catData[cat] = { source_count: 0, relevance_sum: 0, relevance_count: 0, emerging_count: 0 };
  }

  for (const s of sources) {
    const cat = s.main_category;
    if (!catData[cat]) continue;
    catData[cat].source_count++;
    const rel = s.intelligence?.horizon_relevance;
    if (rel) {
      catData[cat].relevance_sum   += rel;
      catData[cat].relevance_count += 1;
    }
    if (s.intelligence?.threat_maturity === "emerging") catData[cat].emerging_count++;
  }

  return CATEGORY_ORDER.map((cat) => {
    const d = catData[cat];
    return {
      category:       cat,
      label:          CATEGORY_LABELS[cat],
      source_count:   d.source_count,
      // avg_relevance only from enriched sources (excludes zeros from unenriched)
      avg_relevance:  d.relevance_count > 0
        ? Math.round((d.relevance_sum / d.relevance_count) * 10) / 10
        : 0,
      emerging_count: d.emerging_count,
      fill:           CATEGORY_COLOURS[cat],
    };
  });
}

// ── Maturity bar (stacked per category) ──────────────────────────────────────

function buildMaturityBar(sources) {
  const catData = {};
  for (const cat of [...CATEGORY_ORDER, "uncategorised"]) {
    catData[cat] = { emerging: 0, growing: 0, established: 0, declining: 0, unknown: 0 };
  }

  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    if (!catData[cat]) catData[cat] = { emerging: 0, growing: 0, established: 0, declining: 0, unknown: 0 };
    const m = s.intelligence?.threat_maturity || "unknown";
    catData[cat][m] = (catData[cat][m] || 0) + 1;
  }

  return [...CATEGORY_ORDER, "uncategorised"]
    .filter((cat) => Object.values(catData[cat] || {}).some((v) => v > 0))
    .map((cat) => ({
      category: cat,
      label:    CATEGORY_LABELS[cat] || cat,
      fill:     CATEGORY_COLOURS[cat] || "#6b7280",
      ...catData[cat],
    }));
}

// ── Weekly activity ──────────────────────────────────────────────────────────

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  // Thursday of the current week determines ISO year and week number
  const thu = new Date(d);
  thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const year = thu.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round((thu - jan4) / 604800000);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekLabel(isoWeekStr) {
  if (!isoWeekStr) return isoWeekStr;
  const [year, weekPart] = isoWeekStr.split("-W");
  const week = parseInt(weekPart, 10);
  const jan4 = new Date(parseInt(year, 10), 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7);
  return monday.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

function buildWeeklyActivity(sources) {
  const weekMap = new Map();

  for (const s of sources) {
    if (!s.date_published) continue;
    const week = isoWeek(s.date_published);
    if (!week) continue;
    if (!weekMap.has(week)) {
      weekMap.set(week, { count: 0, emerging_count: 0, critical_count: 0, high_count: 0, by_category: {} });
    }
    const d = weekMap.get(week);
    d.count++;
    if (s.intelligence?.threat_maturity === "emerging") d.emerging_count++;
    if (s.priority_label === "critical") d.critical_count++;
    if (s.priority_label === "high")     d.high_count++;
    const cat = s.main_category || "uncategorised";
    d.by_category[cat] = (d.by_category[cat] || 0) + 1;
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({ week, label: weekLabel(week), ...d }));
}

// ── Sector radar ──────────────────────────────────────────────────────────────

function buildSectorRadar(sources) {
  const sectorMap = new Map();
  for (const s of sources) {
    for (const sector of s.intelligence?.sector_impact || []) {
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + 1);
    }
  }
  return [...sectorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([sector, count]) => ({ sector, count }));
}

// ── Category pie ──────────────────────────────────────────────────────────────

function buildCategoryPie(sources) {
  const counts = {};
  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      category: cat,
      label:    CATEGORY_LABELS[cat] || cat,
      value:    count,
      fill:     CATEGORY_COLOURS[cat] || "#6b7280",
    }));
}

// ── Tag frequency (for heatmap visualisation) ─────────────────────────────────

function buildTagFrequency(sources) {
  const freq = new Map();
  for (const s of sources) {
    for (const tag of s.tags || []) {
      freq.set(tag, (freq.get(tag) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([tag, count]) => ({ tag, count }));
}

// ── Enrichment stats ──────────────────────────────────────────────────────────

function buildEnrichmentStats(sources) {
  const total    = sources.length;
  const enriched = sources.filter((s) => s.claim_extraction_status === "success").length;
  const rate     = total > 0 ? Math.round((enriched / total) * 100) : 0;

  const byCat = {};
  for (const s of sources) {
    const cat = s.main_category || "uncategorised";
    if (!byCat[cat]) byCat[cat] = { total: 0, enriched: 0 };
    byCat[cat].total++;
    if (s.claim_extraction_status === "success") byCat[cat].enriched++;
  }

  return { total, enriched, rate, by_category: byCat };
}

// ── Main export ──────────────────────────────────────────────────────────────

export function buildChartData(sources) {
  return {
    radar_chart:      buildRadarChart(sources),
    maturity_bar:     buildMaturityBar(sources),
    weekly_activity:  buildWeeklyActivity(sources),
    sector_radar:     buildSectorRadar(sources),
    category_pie:     buildCategoryPie(sources),
    tag_frequency:    buildTagFrequency(sources),
    enrichment_stats: buildEnrichmentStats(sources),
    colours: {
      categories: CATEGORY_COLOURS,
      maturity:   MATURITY_COLOURS,
    },
  };
}
