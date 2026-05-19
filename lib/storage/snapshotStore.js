import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const SNAPSHOT_FILE = path.join(DATA_DIR, "daily-raw-sources.json");

export async function saveSnapshot(snapshot) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

export async function getSnapshot() {
  try {
    const data = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      generated_at: null,
      period: "daily",
      stage: "empty",
      count: 0,
      sources: [],
    };
  }
}
