import { listSnapshots, getSnapshotById } from "../lib/storage/snapshotDatabase.js";

export default async function handler(req, res) {
  try {
    const { start, end, id } = req.query;

    if (id) {
      const snapshot = await getSnapshotById(id);

      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot not found" });
      }

      return res.status(200).json(snapshot);
    }

    const snapshots = await listSnapshots({ start, end });

    return res.status(200).json({
      count: snapshots.length,
      snapshots,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
