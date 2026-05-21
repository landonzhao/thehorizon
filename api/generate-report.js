import { generateReport } from "../lib/reports/generateReport.js";
import { saveReport, loadReport, listReports } from "../lib/reports/archiveReport.js";

function isAdmin(req) {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.authorization;
  if (!secret) return true;
  return auth === `Bearer ${secret}` || req.headers["x-vercel-cron"] === "1";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const { period = "weekly", week, list, refresh, tiers, offset } = req.query;

    // ── List archived reports ─────────────────────────────────────────────
    if (list === "1") {
      const reports = await listReports(["weekly", "monthly", "quarterly"].includes(period) ? period : null, 24);
      return res.status(200).json({ reports });
    }

    // ── Fetch a specific archived report by report_id or week_key ─────────
    if (week) {
      // week can be "2026-W20" or a full report_id
      const reportId = week.startsWith("report-") ? week : `report-${period}-${week}`;
      const cached = await loadReport(reportId);
      if (!cached) return res.status(404).json({ error: `Report not found: ${reportId}` });
      return res.status(200).json(cached);
    }

    // ── Validate period ───────────────────────────────────────────────────
    if (!["weekly", "monthly", "quarterly"].includes(period)) {
      return res.status(400).json({ error: "period must be weekly, monthly, or quarterly" });
    }

    const weekOffset = parseInt(offset || "0", 10) || 0;
    const includeTiers = tiers ? tiers.split(",") : ["core", "adjacent"];

    // ── Force-refresh requires admin ──────────────────────────────────────
    if (refresh === "1" && !isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // ── Generate fresh report ─────────────────────────────────────────────
    const report = await generateReport({ period, weekOffset, includeTiers });

    // Archive every generated report (upsert — safe to re-run)
    try {
      await saveReport(report);
    } catch (archiveErr) {
      // Non-fatal: surface the warning but still return the report
      console.warn("Report archive failed:", archiveErr.message);
    }

    return res.status(200).json(report);

  } catch (error) {
    console.error("generate-report error:", error);
    return res.status(500).json({ error: error.message });
  }
}
