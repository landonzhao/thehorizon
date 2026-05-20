import { scoreStoredSources } from "../lib/scoring/scoreStoredSources.js";

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
    });

    return res.status(200).json({
      message: "Sources scored.",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
