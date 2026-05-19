import { normalizeSource } from "../normalizeSource.js";

function getTagValue(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

export async function fetchArxivSources(options = {}) {
  const query = encodeURIComponent('cat:cs.CR AND "large language model"');
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=5`;

  const res = await fetch(url, {
    signal: options.signal,
    headers: {
      "User-Agent": "the-horizon-ingester/0.1",
    },
  });

  if (res.status === 429) return [];
  if (!res.ok) throw new Error(`arXiv fetch failed: ${res.status}`);

  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1);

  return entries.map((entry) => {
    const rawLink = getTagValue(entry, "id");
    const link = rawLink.replace("http://", "https://");

    return normalizeSource({
      title: getTagValue(entry, "title"),
      url: link,
      publisher: "arXiv",
      author: "",
      date_published: getTagValue(entry, "published"),
      source_type: "research_paper",
      full_text: getTagValue(entry, "summary"),
      raw_html: entry,
      trust_tier: "medium",
      collection_metadata: {
        connector_name: "arXiv",
        retrieval_method: "official_api",
        trust_tier: "medium",
        collected_at: new Date().toISOString(),
      },
    });
  });
}
