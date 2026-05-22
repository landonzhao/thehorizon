import crypto from "crypto";
import { uploadArchiveJson } from "../storage/blobArchiveStore.js";

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function getArchiveDateKey(window) {
  const end = window.end_sgt || window.end_local || window.end_utc;
  const date = end ? end.slice(0, 10) : new Date().toISOString().slice(0, 10);
  // Include UTC timestamp so same-day re-runs don't overwrite each other
  const ts = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  return `${date}/${ts}`;
}

export async function archiveSources(sources, window) {
  const dateKey = getArchiveDateKey(window);

  const archiveRecords = sources.map((source) => ({
    archive_id: crypto.randomUUID(),
    source_id: source.id,

    citation: {
      title: source.title,
      publisher: source.publisher,
      author: source.author,
      url: source.url,
      date_published: source.date_published,
      date_accessed: source.date_collected || new Date().toISOString(),
    },

    reporting_window: window,

    tags: {
      source_type: source.source_type,
      credibility_label: source.validity?.credibility_label || "unknown",
      tags: source.tags || [],
    },

    integrity: {
      url_hash: sha256(source.url),
      content_hash: source.content_hash || sha256(source.full_text || ""),
    },

    content: {
      full_text: source.full_text || "",
      raw_html: source.raw_html || "",
    },

    collection_metadata: {
      ...(source.collection_metadata || {}),
      date_collected: source.date_collected,
    },
  }));

  const blob = await uploadArchiveJson(
    `archives/${dateKey}/sources.json`,
    archiveRecords
  );

  return {
    archive_url: blob.url,
    archive_path: blob.pathname,
    archived_count: archiveRecords.length,
  };
}
