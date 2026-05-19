import { listSources } from "../lib/storage/snapshotDatabase.js";
import { getSingaporePeriodWindow } from "../lib/time/reportingWindow.js";

export default async function handler(req, res) {
  try {
    const period = req.query.period || "daily";
    const window = getSingaporePeriodWindow(period);

    const sources = await listSources({
      start: window.start_utc,
      end: window.end_utc,
      publisher: req.query.publisher,
      source_type: req.query.source_type,
      tag: req.query.tag,
      limit: 3000,
    });

    return res.status(200).json({
      period,
      reporting_window: window,
      start: window.start_utc,
      end: window.end_utc,
      count: sources.length,
      sources,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
