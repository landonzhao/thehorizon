import crypto from "crypto";
import { uploadArchiveJson } from "../storage/blobArchiveStore.js";

function sha256(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function archiveSources(sources, window) {
  const dateKey = window.end_local.slice(0, 10);

  const archiveRecords = sources.map((source) => ({
    archive_id: crypto.randomUUID(),

    source_id: source.id,

    citation: {
      title: source.title,
      publisher: source.publisher,
      author: source.author,
      url: source.url,
      date_published: source.date_published,
      date_accessed: new Date().toISOString(),
    },

    tags: {
      source_type: source.source_type,
      credibility_label: source.validity?.credibility_label || "unknown",
      tags: source.tags || [],
    },

    integrity: {
      url_hash: sha256(source.url),
      content_hash: sha256(source.full_text || ""),
    },

    content: {
      full_text: source.full_text || "",
      raw_html: source.raw_html || "",
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
