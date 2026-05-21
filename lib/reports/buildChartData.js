/**
 * Chart data builder for report visualisations.
 *
 * Produces pre-shaped arrays for three chart types:
 *
 * 1. radar_chart — category intensity pentagon/hexagon
 *    Recharts RadarChart format: [{ category, label, source_count, avg_relevance, emerging_count }]
 *
 * 2. maturity_bar — stacked bar of threat maturity by category
 *    [{ category, label, emerging, growing, established, declining, unknown }]
 *
 * 3. weekly_activity — line/bar chart of source count over time
 *    [{ week, label, count, emerging_count, critical_count }]
 *
 * 4. sector_radar — sector impact frequency
 *    [{ sector, count }]
 *
 * 5. category_pie — simple pie/donut data
 *    [{ category, label, value, fill }]
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

// Tailwind-friendly palette — consistent across charts
const CATEGORY_COLOURS = {
  agentic_ai_threats:     "#f97316", // orange-500
  llm_threats:            "#ef4444", // red-500
  ai_enabled_threats:     "#a855f7", // purple-500
  traditional_ai_threats: "#3b82f6", // blue-500
  ai_for_security:        "#22c55e", // green-500
  uncategorised:          "#6b7280", // gray-500
};

const MATURITY_COLOURS = {
  emerging:    "#f97316",
  growing:     "#eab308",
  established: "#3b82f6",
  declining:   "#6b7280",
  unknown:     "#e5e7eb",
};

// ── Radar chart ───────────────────────────────────────────────────────────────

function buildRadarChart(sources) {
  const catData = {};
  for (const cat of CATEGORY_ORDER) {
    catData[cat] = { source_count: 0, relevance_sum: 0, emerging_count: 0 };
  }

  for (const s of sources) {
    const cat = s.main_category;
    if (!catData[cat]) continue;
    catData[cat].source_count++;
    catData[cat].relevance_sum += s.intelligence?.horizon_relevance || 0;
    if (s.intelligence?.threat_maturity === "emerging") catData[cat].emerging_count++;
  }

  return CATEGORY_ORDER.map((cat) => {
    const d = catData[cat];
    return {
      category:      cat,
      label:         CATEGORY_LABELS[cat],
      source_count:  d.source_count,
      avg_relevance: d.source_count > 0
        ? Math.round((d.relevance_sum / d.source_count) * 10) / 10
        : 0,
      emerging_count: d.emerging_count,
      fill:          CATEGORY_COLOURS[cat],
    };
  });
}

// ── Maturity stacked bar ──────────────────────────────────────────────────────

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
    .filter((cat) => {
      const d = catData[cat];
      return Object.values(d).some((v) => v > 0);
    })
    .map((cat) => ({
      category:   cat,
      label:      CATEGORY_LABELS[cat] || cat,
      fill:       CATEGORY_COLOURS[cat] || "#6b7280",
      ...catData[cat],
    }));
}

// ── Weekly activity ──────────────────────────────────────────────────────────

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekLabel(isoWeekStr) {
  if (!isoWeekStr || isoWeekStr === "unknown") return isoWeekStr;
  const [year, weekPart] = isoWeekStr.split("-W");
  const week = parseInt(weekPart, 10);
  // Get Monday of this ISO week
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
      weekMap.set(week, { count: 0, emerging_count: 0, critical_count: 0, high_count: 0 });
    }
    const d = weekMap.get(week);
    d.count++;
    if (s.intelligence?.threat_maturity === "emerging") d.emerging_count++;
    if (s.priority_label === "critical") d.critical_count++;
    if (s.priority_label === "high")     d.high_count++;
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      label: weekLabel(week),
      ...d,
    }));
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

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Build all chart data from a list of sources.
 * Sources should already be filtered for the report period.
 */
export function buildChartData(sources) {
  return {
    radar_chart:     buildRadarChart(sources),
    maturity_bar:    buildMaturityBar(sources),
    weekly_activity: buildWeeklyActivity(sources),
    sector_radar:    buildSectorRadar(sources),
    category_pie:    buildCategoryPie(sources),
    colours: {
      categories: CATEGORY_COLOURS,
      maturity:   MATURITY_COLOURS,
    },
  };
}
