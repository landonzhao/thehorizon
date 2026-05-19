import { normalizeSource } from "../normalizeSource.js";

const SEARCH_TERMS = [
  "llm security",
  "prompt injection",
  "ai agent security",
  "ai red team",
  "rag security",
];

export async function fetchGithubTrendingSources(options = {}) {
  const all = [];

  for (const term of SEARCH_TERMS) {
    const date = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const query = encodeURIComponent(`${term} created:>${date}`);
    const url = `https://api.github.com/search/repositories?q=${query}&sort=updated&order=desc&per_page=5`;

    const res = await fetch(url, {
      signal: options.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "the-horizon-ingester/0.1",
      },
    });

    if (!res.ok) continue;

    const data = await res.json();

    for (const repo of data.items || []) {
      all.push(
        normalizeSource({
          title: repo.full_name,
          url: repo.html_url,
          publisher: "GitHub",
          author: repo.owner?.login || "",
          date_published: repo.created_at,
          source_type: "open_source_project",
          full_text: repo.description || "",
          trust_tier: "medium",
          collection_metadata: {
            connector_name: "GitHub Repository Search",
            retrieval_method: "official_api",
            trust_tier: "medium",
            collected_at: new Date().toISOString(),
          },
        })
      );
    }
  }

  return all;
}
