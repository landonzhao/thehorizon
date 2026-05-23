import { scoreStoredSources } from "../lib/scoring/scoreStoredSources.js";
import { savePeriodStats } from "../lib/analytics/periodStats.js";

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await scoreStoredSources({
      start: req.query.start,
      end: req.query.end,
      limit: Number(req.query.limit || 1000),
      testSet: req.query.test_set === "true",
      useV6: req.query.use_v6 === "true",
    });

    let period_stats = null;
    try {
      period_stats = await savePeriodStats();
    } catch (err) {
      console.warn("Period stats computation failed (non-fatal):", err.message);
    }

    return res.status(200).json({
      message: "Sources scored.",
      ...result,
      period_stats,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
