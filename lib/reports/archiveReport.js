/**
 * Report archive: save and retrieve generated reports from Supabase.
 *
 * Table: reports
 *   report_id    TEXT PK   — e.g. "report-weekly-2026-W20"
 *   period       TEXT      — weekly | monthly | quarterly
 *   week_key     TEXT      — "2026-W20" | "2026-05" | "2026-Q2"
 *   date_from    DATE
 *   date_to      DATE
 *   generated_at TIMESTAMPTZ
 *   source_count INTEGER
 *   is_complete  BOOLEAN
 *   report_json  JSONB
 */

import { supabase } from "../storage/supabaseClient.js";

// Gracefully handles "table does not exist" errors (before first-time setup).
function tableNotReady(error) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.message?.includes("does not exist") ||
    error.message?.includes("schema cache") ||
    error.message?.includes("Could not find the table")
  );
}

export async function saveReport(report) {
  const row = {
    report_id:    report.report_id,
    period:       report.period,
    week_key:     report.week_key,
    date_from:    report.date_range.start.slice(0, 10),
    date_to:      report.date_range.end.slice(0, 10),
    generated_at: report.generated_at,
    source_count: report.statistics.total_sources,
    is_complete:  report.is_complete,
    report_json:  report,
  };

  const { error } = await supabase
    .from("reports")
    .upsert(row, { onConflict: "report_id" });

  if (error) {
    if (tableNotReady(error)) throw new Error("reports table not created yet — run scripts/setupReportsTable.js first");
    throw error;
  }
  return report.report_id;
}

export async function loadReport(reportId) {
  const { data, error } = await supabase
    .from("reports")
    .select("report_json")
    .eq("report_id", reportId)
    .single();

  if (error) return null;
  return data?.report_json || null;
}

/**
 * List archived reports, most recent first.
 * @param {string|null} period - weekly | monthly | quarterly | null (all)
 * @param {number} limit
 */
export async function listReports(period = null, limit = 24) {
  let query = supabase
    .from("reports")
    .select("report_id, period, week_key, date_from, date_to, generated_at, source_count, is_complete")
    .order("date_to", { ascending: false })
    .limit(limit);

  if (period) query = query.eq("period", period);

  const { data, error } = await query;
  if (error) {
    if (tableNotReady(error)) return [];
    throw error;
  }
  return data || [];
}

export async function findLatestReport(period) {
  const { data, error } = await supabase
    .from("reports")
    .select("report_id, generated_at, source_count, report_json")
    .eq("period", period)
    .order("date_to", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data || null;
}
