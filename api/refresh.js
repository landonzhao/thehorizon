import { collectRawSources } from "../lib/sources/collectRawSources.js";
import { saveSnapshot } from "../lib/storage/snapshotStore.js";
import { saveSnapshotToDatabase } from "../lib/storage/snapshotDatabase.js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;

  if (!secret) return true;

  return auth === `Bearer ${secret}` || req.headers["x-vercel-cron"] === "1";
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await collectRawSources();

    const snapshot = {
      generated_at: new Date().toISOString(),
      period: "daily",
      stage: "article_report_advisory_ingestion",
      reporting_window: result.reporting_window,

      count: result.sources.length,
      discarded_count: result.discarded_count,
      rejected_count: result.rejected_count,

      pipeline_counts: result.pipeline_counts,
      rejected_sources: result.rejected_sources,

      sources: result.sources,
      archive: result.archive,
      connector_results: result.connector_results,
    };

    await saveSnapshot(snapshot);
    const stored = await saveSnapshotToDatabase(snapshot);

    return res.status(200).json(stored);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
