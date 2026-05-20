import { generateReport } from "../lib/reports/generateReport.js";

function isAuthorized(req) {
  // GET requests are public (read-only report view for the frontend).
  // POST/mutations still require CRON_SECRET.
  if (req.method === "GET") return true;
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

    const period = req.query.period || "weekly";
    if (!["weekly", "monthly", "quarterly"].includes(period)) {
      return res.status(400).json({ error: "period must be weekly, monthly, or quarterly" });
    }

    const tiers = req.query.tiers
      ? req.query.tiers.split(",")
      : ["core", "adjacent"];

    const report = await generateReport({ period, includeTiers: tiers });

    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
