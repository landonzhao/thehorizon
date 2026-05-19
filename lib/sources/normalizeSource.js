import crypto from "crypto";

function forceHttps(url = "") {
  if (url.startsWith("http://arxiv.org")) {
    return url.replace("http://", "https://");
  }

  return url;
}

export function normalizeSource(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || "",
    url: forceHttps(item.url || ""),
    publisher: item.publisher || "",
    author: item.author || "",
    date_published: item.date_published || "",
    date_collected: new Date().toISOString(),
    source_type: item.source_type || "news",
    raw_html: item.raw_html || "",
    full_text: item.full_text || "",
    attachments: item.attachments || [],
    trust_tier: item.trust_tier || "unknown",
    collection_metadata: item.collection_metadata || {},
  };
}
