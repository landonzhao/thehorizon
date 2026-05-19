import fs from "fs/promises";
import path from "path";

const DB_DIR = path.join(process.cwd(), ".data", "snapshots");
const INDEX_FILE = path.join(DB_DIR, "index.json");

async function ensureDb() {
  await fs.mkdir(DB_DIR, { recursive: true });

  try {
    await fs.access(INDEX_FILE);
  } catch {
    await fs.writeFile(INDEX_FILE, JSON.stringify([], null, 2));
  }
}

export async function saveSnapshotToDatabase(snapshot) {
  await ensureDb();

  const snapshotId = `snapshot-${snapshot.reporting_window.end_local.slice(0, 10)}`;
  const fileName = `${snapshotId}.json`;
  const filePath = path.join(DB_DIR, fileName);

  const storedSnapshot = {
    ...snapshot,
    snapshot_id: snapshotId,
    saved_at: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(storedSnapshot, null, 2));

  const indexRaw = await fs.readFile(INDEX_FILE, "utf-8");
  const index = JSON.parse(indexRaw);

  const withoutOld = index.filter((item) => item.snapshot_id !== snapshotId);

  withoutOld.push({
    snapshot_id: snapshotId,
    file_name: fileName,
    period: snapshot.period,
    generated_at: snapshot.generated_at,
    start_utc: snapshot.reporting_window.start_utc,
    end_utc: snapshot.reporting_window.end_utc,
    start_local: snapshot.reporting_window.start_local,
    end_local: snapshot.reporting_window.end_local,
    count: snapshot.count,
    discarded_count: snapshot.discarded_count || 0,
  });

  withoutOld.sort((a, b) => new Date(b.end_utc) - new Date(a.end_utc));

  await fs.writeFile(INDEX_FILE, JSON.stringify(withoutOld, null, 2));

  return storedSnapshot;
}

export async function listSnapshots({ start, end } = {}) {
  await ensureDb();

  const indexRaw = await fs.readFile(INDEX_FILE, "utf-8");
  let index = JSON.parse(indexRaw);

  if (start) {
    index = index.filter((item) => new Date(item.end_utc) >= new Date(start));
  }

  if (end) {
    index = index.filter((item) => new Date(item.start_utc) <= new Date(end));
  }

  return index;
}

export async function getSnapshotById(snapshotId) {
  await ensureDb();

  const index = await listSnapshots({});
  const item = index.find((entry) => entry.snapshot_id === snapshotId);

  if (!item) return null;

  const filePath = path.join(DB_DIR, item.file_name);
  const raw = await fs.readFile(filePath, "utf-8");

  return JSON.parse(raw);
}
