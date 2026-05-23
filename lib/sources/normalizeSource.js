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
  const now = new Date().toISOString();
  const datePublished = safeDate(item.date_published);

  // date_confidence: explicitly passed or inferred from whether a publish date exists
  const dateConfidence = item.date_confidence ??
    (item.collection_metadata?.date_confidence) ??
    (datePublished ? "exact" : "none");

  // date_published_actual: the real article date (may differ from date_published for LLM Discovery)
  // If explicitly provided as null, keep null. If not provided, default to date_published.
  const datePublishedActual = item.date_published_actual !== undefined
    ? (item.date_published_actual ? safeDate(item.date_published_actual) : null)
    : datePublished;

  const dateDiscovered = item.date_discovered || item.collection_metadata?.date_discovered || now;

  return {
    id: item.id || (url ? sha256(url).slice(0, 36) : crypto.randomUUID()),
    title,
    url,
    publisher: cleanPlaintext(item.publisher || "Unknown"),
    author: cleanPlaintext(item.author || ""),

    date_published: datePublished,
    date_published_actual: datePublishedActual,
    date_discovered: dateDiscovered,
    date_confidence: dateConfidence,
    date_collected: now,

    source_type: item.source_type || "unknown",
    raw_html: item.raw_html || "",

    full_text: fullText,
    summary: cleanPlaintext(item.summary || ""),

    attachments: item.attachments || [],
    trust_tier: item.trust_tier || item.collection_metadata?.trust_tier || "unknown",

    collection_metadata: {
      ...(item.collection_metadata || {}),
      date_collected: now,
      date_discovered: dateDiscovered,
      date_confidence: dateConfidence,
      has_valid_publish_date: Boolean(datePublished),
    },

    content_hash: item.content_hash || sha256(`${title}|${url}|${fullText}`),
    clean_text_hash: sha256(fullText),
  };
}
