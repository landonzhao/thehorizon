import { normalizeSource } from "../normalizeSource.js";

const AI_KEYWORDS = [
  "artificial intelligence",
  "machine learning",
  "large language model",
  "llm",
  "neural network",
  "deep learning",
  "generative ai",
  "chatbot",
  "ai-assisted",
  "ai-powered",
  "ai-generated",
];

function hasAiRelevance(text = "") {
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export async function fetchNvdSources(options = {}) {
  const start =
    options.window?.start_utc ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const end =
    options.window?.end_utc ||
    new Date().toISOString();

  const pubStartDate = encodeURIComponent(start);
  const pubEndDate = encodeURIComponent(end);

  // Use "artificial intelligence" as the keyword — NVD does substring matching
  // so plain "AI" hits unrelated CVEs (RAID, TRAIL, etc.). The post-fetch
  // hasAiRelevance() filter provides a second gate.
  const url =
    `https://services.nvd.nist.gov/rest/json/cves/2.0` +
    `?keywordSearch=${encodeURIComponent("artificial intelligence")}` +
    `&pubStartDate=${pubStartDate}` +
    `&pubEndDate=${pubEndDate}`;

  const res = await fetch(url, {
    signal: options.signal,
    headers: {
      "User-Agent": "the-horizon-ingester/0.1",
    },
  });

  if (!res.ok) {
    throw new Error(`NVD fetch failed: ${res.status}`);
  }

  const data = await res.json();

  return (data.vulnerabilities || [])
    .filter((entry) => {
      const description = entry.cve?.descriptions?.[0]?.value || "";
      return hasAiRelevance(description);
    })
    .map((entry) => {
      const cve = entry.cve;
      const cveId = cve.id;
      const description = cve.descriptions?.[0]?.value || "";

      return normalizeSource({
        title: `${cveId}: ${description.slice(0, 140) || "NVD CVE"}`,
        url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
        publisher: "NVD",
        author: "NIST",
        date_published: cve.published,
        source_type: "vulnerability_database",
        full_text: description,
        trust_tier: "primary",
        collection_metadata: {
          connector_name: "NVD",
          retrieval_method: "official_api",
          trust_tier: "primary",
          date_accessed: new Date().toISOString(),
        },
      });
    });
}
