import { collectRawSources } from "../lib/sources/collectRawSources.js";
import { saveSnapshotToDatabase } from "../lib/storage/snapshotDatabase.js";
import {
  startIngestionRun,
  finishIngestionRun,
  failIngestionRun,
} from "../lib/storage/ingestionRunStore.js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;

  if (!secret) return true;

  return auth === `Bearer ${secret}` || req.headers["x-vercel-cron"] === "1";
}

export default async function handler(req, res) {
  let runId = null;

  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    runId = await startIngestionRun();

    const result = await collectRawSources();

    const snapshot = {
      generated_at: new Date().toISOString(),
      period: "daily",
      stage: "published_date_based_ingestion",
      reporting_window: result.reporting_window,

      count: result.sources.length,

      removed_by_publish_date_count: result.removed_by_publish_date_count,
      removed_by_publish_date: result.removed_by_publish_date,

      rejected_count: result.rejected_count,
      rejected_sources: result.rejected_sources,

      discarded_count: result.discarded_count,
      discarded_by_validity: result.discarded_by_validity,

      pipeline_counts: result.pipeline_counts,

      sources: result.sources,
      archive: result.archive,
      connector_results: result.connector_results,
    };

    const stored = await saveSnapshotToDatabase(snapshot);

    await finishIngestionRun(runId, snapshot);

    return res.status(200).json({
      run_id: runId,
      ...snapshot,
      stored,
    });
  } catch (error) {
    if (runId) {
      await failIngestionRun(runId, error);
    }

    return res.status(500).json({
      run_id: runId,
      error: error.message,
      stack: error.stack,
    });
  }
}
