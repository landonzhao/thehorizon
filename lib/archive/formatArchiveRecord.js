import crypto from "crypto";

function sha256(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function formatArchiveRecord(source, window) {
  const content = source.full_text || "";
  const raw = source.raw_html || "";

  return {
    archive_id: crypto.randomUUID(),
    source_id: source.id,

    reporting_window: window,

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
      publisher: source.publisher,
      credibility_label: source.validity?.credibility_label || "unknown",
      usable: source.validity?.usable ?? false,
      pre_classification_tags: source.tags || [],
    },

    integrity: {
      url_hash: sha256(source.url),
      content_hash: sha256(content),
      raw_hash: sha256(raw),
    },

    content: {
      full_text: content,
      raw_html: raw,
      text_length: content.length,
      attachments: source.attachments || [],
    },
  };
}
