import { processSourceClaims } from "../lib/claims/processSourceClaims.js";

function isAuthorized(req) {
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await processSourceClaims({
      start: req.query.start,
      end: req.query.end,
      limit: Number(req.query.limit || 15),
      onlyPriority: req.query.onlyPriority !== "false",
    });

    return res.status(200).json({
      message: "Claim extraction complete.",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
