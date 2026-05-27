import { normalizeSource } from "../normalizeSource.js";

// 17 keyword searches — NVD does substring matching, so keep terms specific enough
// to avoid false positives (e.g. "model" alone would match RAID controllers, car models, etc.)
const NVD_KEYWORDS = [
  "artificial intelligence",
  "machine learning",
  "large language model",
  "neural network",
  "deep learning",
  "generative AI",
  "LLM",
  "AI model",
  "AI assistant",
  "foundation model",
  "AI agent",
  "prompt injection",
  "adversarial machine learning",
  "jailbreak",
  "model poisoning",
  "chatbot",
  "Copilot",
];

// Post-fetch relevance filter — broader than the keyword list to catch descriptions
// that reference AI concepts without using the exact search term.
const AI_RELEVANCE_TERMS = [
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
  "ai model",
  "foundation model",
  "language model",
  "transformer model",
  "ai agent",
  "prompt injection",
  "jailbreak",
  "model poisoning",
  "adversarial example",
  "copilot",
  "code generation model",
  "embedding model",
  "vector database",
];

function hasAiRelevance(text = "") {
  const lower = text.toLowerCase();
  return AI_RELEVANCE_TERMS.some((term) => lower.includes(term));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchNvdKeyword(keyword, start, end, signal) {
  const url =
    `https://services.nvd.nist.gov/rest/json/cves/2.0` +
    `?keywordSearch=${encodeURIComponent(keyword)}` +
    `&pubStartDate=${encodeURIComponent(start)}` +
    `&pubEndDate=${encodeURIComponent(end)}`;

  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": "the-horizon-ingester/0.1" },
  });

  if (res.status === 404) return [];
  if (res.status === 429) {
    throw Object.assign(new Error(`NVD rate-limited for "${keyword}"`), { isRateLimit: true });
  }
  if (!res.ok) {
    throw new Error(`NVD fetch for "${keyword}" failed: ${res.status}`);
  }

  const data = await res.json();
  return data.vulnerabilities || [];
}

export async function fetchNvdSources(options = {}) {
  const start =
    options.window?.start_utc ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const end =
    options.window?.end_utc ||
    new Date().toISOString();

  const byCveId = new Map();

  // Run in batches of 4 to respect NVD's rate limit (5 req / 30s without API key).
  // A 6s inter-batch pause keeps us safely within the limit.
  const BATCH_SIZE = 4;
  const INTER_BATCH_DELAY_MS = 6500;

  for (let i = 0; i < NVD_KEYWORDS.length; i += BATCH_SIZE) {
    if (options.signal?.aborted) break;

    const batch = NVD_KEYWORDS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((kw) => fetchNvdKeyword(kw, start, end, options.signal))
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.warn(`NVD keyword error: ${result.reason?.message}`);
        continue;
      }
      for (const entry of result.value) {
        const cveId = entry.cve?.id;
        if (!cveId || byCveId.has(cveId)) continue;
        const description = entry.cve?.descriptions?.[0]?.value || "";
        if (hasAiRelevance(description)) {
          byCveId.set(cveId, entry);
        }
      }
    }

    // Pause between batches (skip after the last batch)
    if (i + BATCH_SIZE < NVD_KEYWORDS.length && !options.signal?.aborted) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  return [...byCveId.values()].map((entry) => {
    const cve = entry.cve;
    const cveId = cve.id;
    const description = cve.descriptions?.[0]?.value || "";

    return normalizeSource({
      title: `${cveId}: ${description.slice(0, 140) || "NVD CVE"}`,
      url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
      publisher: "NVD",
      author: "NIST",
      date_published: cve.published,
      date_confidence: "exact",
      source_type: "vulnerability",
      full_text: description,
      trust_tier: "primary",
      collection_metadata: {
        connector_name: "NVD",
        retrieval_method: "official_api",
        trust_tier: "primary",
        date_confidence: "exact",
        date_accessed: new Date().toISOString(),
      },
    });
  });
}
