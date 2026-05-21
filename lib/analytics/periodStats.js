import { supabase } from "../storage/supabaseClient.js";
import { getSingaporePeriodWindow } from "../time/reportingWindow.js";

const PERIODS = ["daily", "weekly", "monthly", "quarterly"];

async function fetchSourcesForWindow(start_utc, end_utc) {
  const { data, error } = await supabase
    .from("sources")
    .select(
      "main_category, tags, relevance_tier, source_type, " +
      "priority_score, report_score, ai_specificity_score, " +
      "intelligence, priority_label"
    )
    .gte("date_published", start_utc)
    .lt("date_published", end_utc)
    .not("relevance_tier", "is", null);

  if (error) throw error;
  return data || [];
}

function avg(values) {
  const valid = values.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

function makeRow(period_type, period_start, period_end, dimension_type, dimension_value, subset) {
  return {
    id: `${period_type}:${period_end}:${dimension_type}:${dimension_value}`,
    period_type,
    period_start,
    period_end,
    dimension_type,
    dimension_value,
    count: subset.length,
    avg_priority_score: avg(subset.map((s) => s.priority_score)),
    avg_report_score: avg(subset.map((s) => s.report_score)),
    avg_ai_specificity: avg(subset.map((s) => s.ai_specificity_score)),
    avg_horizon_relevance: avg(subset.map((s) => s.intelligence?.horizon_relevance)),
    computed_at: new Date().toISOString(),
  };
}

// Groups sources by one or more keys. keyFn may return a string or string[].
function groupBy(sources, keyFn) {
  const map = {};
  for (const s of sources) {
    const keys = [].concat(keyFn(s)).filter(Boolean);
    for (const k of keys) {
      (map[k] = map[k] || []).push(s);
    }
  }
  return map;
}

function computeRows(sources, period_type, period_start, period_end) {
  const row = (dim_type, dim_value, subset) =>
    makeRow(period_type, period_start, period_end, dim_type, dim_value, subset);

  const rows = [row("total", "all", sources)];

  const dimensions = [
    ["category",       (s) => s.main_category || "uncategorised"],
    ["relevance_tier", (s) => s.relevance_tier || "context"],
    ["source_type",    (s) => s.source_type || "unknown"],
    ["priority_label", (s) => s.priority_label || "background"],
    ["tag",            (s) => s.tags || []],
    ["threat_maturity",(s) => s.intelligence?.threat_maturity],
    ["sector",         (s) => s.intelligence?.sector_impact || []],
    ["report_tier",    (s) => s.intelligence?.report_tier],
  ];

  for (const [dim_type, keyFn] of dimensions) {
    for (const [k, subset] of Object.entries(groupBy(sources, keyFn))) {
      rows.push(row(dim_type, k, subset));
    }
  }

  return rows;
}

async function upsertRows(rows) {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("period_stats")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw error;
  }
}

export async function savePeriodStats(referenceDate = new Date()) {
  const summary = {};

  for (const period of PERIODS) {
    const window = getSingaporePeriodWindow(period, referenceDate);
    const period_end = window.end_sgt.slice(0, 10);
    const period_start = window.start_sgt.slice(0, 10);

    const sources = await fetchSourcesForWindow(window.start_utc, window.end_utc);
    const rows = computeRows(sources, period, period_start, period_end);

    await upsertRows(rows);
    summary[period] = { source_count: sources.length, rows_upserted: rows.length };
  }

  return summary;
}
