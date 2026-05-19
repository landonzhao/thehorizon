import { listSources } from "../lib/storage/snapshotDatabase.js";

export default async function handler(req, res) {
  try {
    const { start, end, publisher, source_type, tag } = req.query;

    const sources = await listSources({
      start,
      end,
      publisher,
      source_type,
      tag,
      limit: 1000,
    });

    return res.status(200).json({
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
