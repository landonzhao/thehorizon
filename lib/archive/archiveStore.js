import fs from "fs/promises";
import path from "path";
import { formatArchiveRecord } from "./formatArchiveRecord.js";

const ARCHIVE_DIR = path.join(process.cwd(), ".data", "archive");

function getDateKey(window) {
  return window.end_local.slice(0, 10);
}

export async function archiveSources(sources, window) {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  const dateKey = getDateKey(window);
  const archiveRecords = sources.map((source) =>
    formatArchiveRecord(source, window)
  );

  const compactFile = path.join(ARCHIVE_DIR, `${dateKey}-sources.compact.json`);

  await fs.writeFile(compactFile, JSON.stringify(archiveRecords, null, 2));

  return {
    archive_file: compactFile,
    archived_count: archiveRecords.length,
    content_hashes: archiveRecords.map((record) => ({
      source_id: record.source_id,
      content_hash: record.integrity.content_hash,
      url_hash: record.integrity.url_hash,
    })),
  };
}
