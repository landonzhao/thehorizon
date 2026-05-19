import crypto from "crypto";

function cleanText(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function sha256(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeSource(raw, metadata = {}) {
  const fullText = cleanText(raw.full_text || raw.summary || "");

  const normalized = {
    id:
      raw.id ||
      crypto.randomUUID(),

    title: cleanText(raw.title),

    url: raw.url,

    publisher:
      raw.publisher ||
      metadata.publisher ||
      "Unknown",

    author:
      raw.author ||
      "",

    date_published:
      safeDate(raw.date_published),

    date_collected:
      new Date().toISOString(),

    source_type:
      raw.source_type ||
      metadata.source_type ||
      "unknown",

    raw_html:
      raw.raw_html || "",

    full_text:
      fullText,

    attachments:
      raw.attachments || [],

    tags:
      raw.tags || [],

    trust_tier:
      metadata.trust_tier || "unknown",

    content_hash:
      sha256(
        `${raw.title}|${raw.url}|${fullText}`
      ),
  };

  normalized.has_valid_publish_date =
    !!normalized.date_published;

  return normalized;
}
