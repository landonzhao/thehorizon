import { purgeIrrelevantSources } from "../lib/classification/purgeIrrelevantSources.js";

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

    const limit = Number(req.query.limit || 5000);

    const result = await purgeIrrelevantSources({ limit });

    return res.status(200).json({
      message: "Purged sources not relevant to AI threat landscape.",
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
