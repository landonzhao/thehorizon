import { normalizeSource } from "../normalizeSource.js";

function getTag(item, tag) {
  return (
    item.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1] ||
    item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ||
    ""
  ).trim();
}

function cleanXmlText(text = "") {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRegistryFeedSources(source, options = {}) {
  const res = await fetch(source.url, {
    signal: options.signal,
    headers: {
      "User-Agent": "the-horizon-ingester/0.1",
      Accept: "application/rss+xml, application/atom+xml, text/xml",
    },
  });

  if (!res.ok) {
    throw new Error(`${source.name} failed: ${res.status}`);
  }

  const xml = await res.text();

  const chunks =
    source.type === "atom"
      ? xml.split("<entry>").slice(1, 21)
      : xml.split("<item>").slice(1, 21);

  return chunks
    .map((chunk) => {
      const link =
        source.type === "atom"
          ? chunk.match(/<link[^>]+href=["']([^"']+)["']/)?.[1] || ""
          : getTag(chunk, "link");

      return normalizeSource({
        title: cleanXmlText(getTag(chunk, "title")),
        url: link,
        publisher: source.publisher,
        author: source.publisher,
        date_published:
          getTag(chunk, "published") ||
          getTag(chunk, "updated") ||
          getTag(chunk, "pubDate"),
        source_type: source.source_type,
        full_text: cleanXmlText(
          getTag(chunk, "summary") ||
            getTag(chunk, "description") ||
            getTag(chunk, "content")
        ),
        raw_html: chunk,
        trust_tier: source.trust_tier,
        collection_metadata: {
          connector_name: source.name,
          retrieval_method: source.retrieval_method,
          trust_tier: source.trust_tier,
          collected_at: new Date().toISOString(),
        },
      });
    })
    .filter((item) => item.title && item.url);
}
