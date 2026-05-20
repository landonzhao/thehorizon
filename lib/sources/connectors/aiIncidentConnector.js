import { normalizeSource } from "../normalizeSource.js";

// AI Incident Database public RSS feed — tracks real-world AI harms and failures.
// The GraphQL API requires auth; RSS is fully open.
const AIID_RSS_URL = "https://incidentdatabase.ai/rss.xml";

function getTag(chunk, tag) {
  return (
    chunk.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1] ||
    chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ||
    ""
  ).trim();
}

function cleanXml(text = "") {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchAiIncidentSources(options = {}) {
  try {
    const res = await fetch(AIID_RSS_URL, {
      signal: options.signal,
      headers: {
        "User-Agent": "the-horizon-ingester/0.1",
        Accept: "application/rss+xml, text/xml",
      },
    });

    if (!res.ok) {
      throw new Error(`AIID RSS failed: ${res.status}`);
    }

    const xml = await res.text();

    // AIID RSS is large — take up to 60 most recent items for live runs,
    // or more when doing a historical backfill (window provided).
    const maxItems = options.window ? 120 : 60;
    const items = xml.split("<item>").slice(1, maxItems + 1);

    const windowStart = options.window?.start_utc ? new Date(options.window.start_utc) : null;
    const windowEnd   = options.window?.end_utc   ? new Date(options.window.end_utc)   : null;

    const sources = [];

    for (const item of items) {
      const title       = cleanXml(getTag(item, "title"));
      const link        = getTag(item, "link");
      const description = cleanXml(getTag(item, "description"));
      const pubDate     = getTag(item, "pubDate");

      if (!title || !link) continue;

      const datePublished = pubDate ? new Date(pubDate).toISOString() : null;

      // Date window filter for historical backfill
      if (datePublished && windowStart && new Date(datePublished) < windowStart) continue;
      if (datePublished && windowEnd   && new Date(datePublished) > windowEnd)   continue;

      sources.push(
        normalizeSource({
          title,
          url: link,
          publisher: "AI Incident Database",
          author: "AIID",
          date_published: datePublished,
          source_type: "threat_intel",
          full_text: description,
          trust_tier: "high",
          collection_metadata: {
            connector_name: "AI Incident Database",
            retrieval_method: "official_rss",
            trust_tier: "high",
            collected_at: new Date().toISOString(),
          },
        })
      );
    }

    return sources;
  } catch (err) {
    console.warn(`AIID connector error: ${err.message}`);
    return [];
  }
}
