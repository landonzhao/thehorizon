import crypto from "crypto";
import { cleanPlaintext } from "../cleaning/cleanPlaintext.js";

function normalizeUrl(url = "") {
  if (url.startsWith("http://arxiv.org")) {
    return url.replace("http://", "https://");
  }

  return url;
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

export function normalizeSource(item) {
  const url = normalizeUrl(item.url || "");
  const fullText = cleanPlaintext(item.full_text || item.content || item.summary || "");
  const title = cleanPlaintext(item.title || "");

  return {
    id: item.id || (url ? sha256(url).slice(0, 36) : crypto.randomUUID()),
    title,
    url,
    publisher: cleanPlaintext(item.publisher || "Unknown"),
    author: cleanPlaintext(item.author || ""),

    date_published: safeDate(item.date_published),
    date_collected: new Date().toISOString(),

    source_type: item.source_type || "unknown",
    raw_html: item.raw_html || "",

    full_text: fullText,
    summary: cleanPlaintext(item.summary || ""),

    attachments: item.attachments || [],
    trust_tier: item.trust_tier || item.collection_metadata?.trust_tier || "unknown",

    collection_metadata: {
      ...(item.collection_metadata || {}),
      date_collected: new Date().toISOString(),
      has_valid_publish_date: Boolean(safeDate(item.date_published)),
    },

    content_hash: item.content_hash || sha256(`${title}|${url}|${fullText}`),
    clean_text_hash: sha256(fullText),
  };
}
