import { normalizeSource } from "../normalizeSource.js";
import { isSafeUrl } from "../../validation/urlSafety.js";

export async function fetchHackerNewsSources(options = {}) {
  const query = encodeURIComponent("AI security OR LLM security OR AI agent security");
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&hitsPerPage=10`;

  const res = await fetch(url, {
    signal: options.signal,
    headers: {
      "User-Agent": "the-horizon-ingester/0.1",
    },
  });

  if (!res.ok) throw new Error(`Hacker News fetch failed: ${res.status}`);

  const data = await res.json();

  return (data.hits || [])
    .filter((hit) => hit.url && isSafeUrl(hit.url))
    .map((hit) =>
      normalizeSource({
        title: hit.title,
        url: hit.url,
        publisher: "Hacker News",
        author: hit.author,
        date_published: hit.created_at,
        source_type: "social_signal",
        full_text: hit.story_text || "",
        trust_tier: "low",
        collection_metadata: {
          connector_name: "Hacker News Algolia",
          retrieval_method: "public_api",
          trust_tier: "low",
          collected_at: new Date().toISOString(),
        },
      })
    );
}
