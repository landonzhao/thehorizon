import { listSnapshots, getSnapshotById } from "../lib/storage/snapshotDatabase.js";

function withinSourceTimeframe(source, start, end) {
  if (!source.date_published) return true;

  const date = new Date(source.date_published);
  if (Number.isNaN(date.getTime())) return true;

  if (start && date < new Date(start)) return false;
  if (end && date > new Date(end)) return false;

  return true;
}

export default async function handler(req, res) {
  try {
    const { start, end, publisher, source_type, tag } = req.query;

    const snapshots = await listSnapshots({ start, end });
    const fullSnapshots = await Promise.all(
      snapshots.map((item) => getSnapshotById(item.snapshot_id))
    );

    let sources = fullSnapshots.flatMap((snapshot) =>
      (snapshot?.sources || []).map((source) => ({
        ...source,
        snapshot_id: snapshot.snapshot_id,
        snapshot_generated_at: snapshot.generated_at,
      }))
    );

    sources = sources.filter((source) => withinSourceTimeframe(source, start, end));

    if (publisher) {
      sources = sources.filter((source) =>
        source.publisher?.toLowerCase().includes(String(publisher).toLowerCase())
      );
    }

    if (source_type) {
      sources = sources.filter((source) => source.source_type === source_type);
    }

    if (tag) {
      sources = sources.filter((source) => source.tags?.includes(tag));
    }

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
