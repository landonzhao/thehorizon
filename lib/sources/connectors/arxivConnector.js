import { normalizeSource } from "../normalizeSource.js";

function getTagValue(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

// Format a Date as YYYYMMDD for arXiv submittedDate range queries
function arxivDate(iso) {
  return iso.slice(0, 10).replace(/-/g, "");
}

// AI threat query definitions.
// Each covers a distinct threat category to minimise overlap.
// When a window is provided, a submittedDate range is appended so the
// backfill can fetch papers from a specific historical period.
function buildQueries(window) {
  const dateClause = window?.start_utc && window?.end_utc
    ? ` AND submittedDate:[${arxivDate(window.start_utc)}0000 TO ${arxivDate(window.end_utc)}2359]`
    : "";

  return [
    {
      label: "LLM jailbreaks & prompt injection",
      query: `cat:cs.CR AND (ti:"jailbreak" OR ti:"prompt injection" OR ti:"red teaming" OR ti:"adversarial prompt")${dateClause}`,
      max: 8,
    },
    {
      label: "LLM & foundation model security",
      query: `cat:cs.CR AND (ti:"large language model" OR ti:"LLM" OR ti:"foundation model" OR ti:"GPT")${dateClause}`,
      max: 8,
    },
    {
      label: "AI-enabled attacks, deepfakes, disinformation",
      query: `cat:cs.CR AND (ti:"deepfake" OR ti:"synthetic media" OR ti:"disinformation" OR ti:"voice cloning" OR ti:"AI-generated")${dateClause}`,
      max: 6,
    },
    {
      label: "ML model attacks — poisoning, extraction, evasion",
      query: `cat:cs.CR AND (ti:"data poisoning" OR ti:"model extraction" OR ti:"backdoor attack" OR ti:"membership inference" OR ti:"evasion")${dateClause}`,
      max: 6,
    },
    {
      label: "Agentic AI & autonomous system security",
      query: `cat:cs.CR AND (ti:"agentic" OR ti:"AI agent" OR ti:"autonomous agent" OR ti:"multi-agent" OR ti:"tool use")${dateClause}`,
      max: 5,
    },
    {
      label: "AI safety & alignment with security implications",
      query: `cat:cs.AI AND (ti:"AI safety" OR ti:"alignment" OR ti:"robustness" OR ti:"risk") AND (ti:"attack" OR ti:"adversarial" OR ti:"exploit" OR ti:"threat")${dateClause}`,
      max: 5,
    },
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchArxivQuery({ query, max, label }, options = {}, attempt = 1) {
  const encoded = encodeURIComponent(query);
  const url = `https://export.arxiv.org/api/query?search_query=${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;

  try {
    const res = await fetch(url, {
      signal: options.signal,
      headers: { "User-Agent": "the-horizon-ingester/0.1" },
    });

    if (res.status === 429) {
      if (attempt < 3) {
        const wait = attempt * 20000; // 20s, then 40s
        console.warn(`arXiv rate-limited for "${label}" — retrying in ${wait / 1000}s`);
        await sleep(wait);
        return fetchArxivQuery({ query, max, label }, options, attempt + 1);
      }
      console.warn(`arXiv rate-limited for "${label}" — giving up after ${attempt} attempts`);
      return [];
    }
    if (!res.ok) {
      console.warn(`arXiv "${label}" failed: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const entries = xml.split("<entry>").slice(1);

    return entries.map((entry) =>
      normalizeSource({
        title: getTagValue(entry, "title"),
        url: getTagValue(entry, "id").replace("http://", "https://"),
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
          arxiv_query_label: label,
          collected_at: new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn(`arXiv "${label}" error: ${err.message}`);
    return [];
  }
}

export async function fetchArxivSources(options = {}) {
  const queries = buildQueries(options.window);
  const seenUrls = new Set();
  const allSources = [];

  for (const queryDef of queries) {
    const results = await fetchArxivQuery(queryDef, options);
    for (const source of results) {
      if (source.url && !seenUrls.has(source.url)) {
        seenUrls.add(source.url);
        allSources.push(source);
      }
    }
    // arXiv asks for 3 seconds between requests in their usage guidelines
    await sleep(3000);
  }

  return allSources;
}
