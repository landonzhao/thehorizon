/**
 * Layer 2 — Cleaning + Normalization
 * Normalizes raw source objects into the standard pipeline shape.
 */

import crypto from "crypto";
import { cleanPlaintext } from "./cleanPlaintext.js";

function sha256Prefix(value, len = 36) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, len);
}

function canonicalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // strip common tracking params
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","ref","source"].forEach(
      (p) => u.searchParams.delete(p)
    );
    return u.origin + u.pathname + (u.search ? u.search : "");
  } catch {
    return rawUrl;
  }
}

function inferPublisher(source) {
  if (source.publisher) return source.publisher.trim();
  try {
    return new URL(source.url).hostname.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Normalize a single raw source into the standard pipeline shape.
 */
export function normalizeSource(raw) {
  const url = canonicalizeUrl(raw.url || "");
  const id  = sha256Prefix(`${raw.title || ""}|${url}`);
  const text = cleanPlaintext(raw.text || raw.full_text || raw.summary || "");

  return {
    id,
    url,
    original_url:   raw.url || url,
    title:          (raw.title || "").trim(),
    publisher:      inferPublisher(raw),
    author:         raw.author || null,
    date_published: parseDate(raw.published_at || raw.date_published),
    date_discovered: new Date().toISOString(),
    full_text:      text,
    summary:        raw.summary || null,
    source_type:    raw.source_type || "unknown",
    trust_tier:     raw.trust_tier  || "unknown",
    tags:           raw.tags        || [],
    content_hash:   sha256Prefix(`${raw.title || ""}|${url}|${text}`, 64),
  };
}

/**
 * Normalize an array of raw sources, deduplicating by id.
 */
export function normalizeSources(rawSources) {
  const seen = new Set();
  const normalized = [];

  for (const raw of rawSources) {
    const source = normalizeSource(raw);
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    normalized.push(source);
  }

  return normalized;
}
