import { collectRawSources } from "../lib/sources/collectRawSources.js";
import { saveSnapshot } from "../lib/storage/snapshotStore.js";
import { saveSnapshotToDatabase } from "../lib/storage/snapshotDatabase.js";

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

function makeSgtWindow(dateString) {
  const endSgt = new Date(`${dateString}T06:00:00+08:00`);
  const startSgt = new Date(endSgt.getTime() - 24 * 60 * 60 * 1000);

  return {
    timezone: "Asia/Singapore",
    start_local: startSgt.toISOString(),
    end_local: endSgt.toISOString(),
    start_utc: startSgt.toISOString(),
    end_utc: endSgt.toISOString(),
  };
}

function dateRange(start, end, maxDays = 7) {
  const dates = [];
  const current = new Date(start);
  const final = new Date(end);

  while (current <= final && dates.length < maxDays) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const start = req.query.start || "2026-01-01";
    const end = req.query.end || "2026-05-19";
    const maxDays = Number(req.query.maxDays || 7);

    const dates = dateRange(start, end, maxDays);
    const results = [];

    for (const date of dates) {
      const window = makeSgtWindow(date);

      const result = await collectRawSources(window, {
        includeFeeds: false,
      });

      const snapshot = {
        generated_at: new Date().toISOString(),
        period: "daily",
        stage: "historical_backfill_by_date_published",
        reporting_window: result.reporting_window,
        count: result.sources.length,
        removed_by_publish_date_count: result.removed_by_publish_date_count,
        rejected_count: result.rejected_count,
        discarded_count: result.discarded_count,
        pipeline_counts: result.pipeline_counts,
        sources: result.sources,
        archive: result.archive,
        connector_results: result.connector_results,
      };

      await saveSnapshot(snapshot);
      const stored = await saveSnapshotToDatabase(snapshot);

      results.push({
        date,
        count: snapshot.count,
        stored,
      });
    }

    return res.status(200).json({
      message: "Backfill chunk complete",
      start,
      end,
      processed_days: dates.length,
      results,
      next_start:
        dates.length > 0
          ? new Date(new Date(dates[dates.length - 1]).getTime() + 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10)
          : null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
