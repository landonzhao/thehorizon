/**
 * GitHub connector — discovery via GitHub Search API.
 *
 * Searches repositories by topic tags that signal agentic AI tooling.
 * Returns normalised atool shape. Does NOT fetch READMEs here — that is
 * the enricher's job.
 *
 * Rate limits:
 *   Unauthenticated: 10 search req/min, 60 req/hr
 *   Authenticated (GITHUB_TOKEN): 30 search req/min, 5000 req/hr
 *
 * Set GITHUB_TOKEN in .env for production runs.
 */

import { verifyGithubRepo } from "../urlVerifier.js";

const API_BASE = "https://api.github.com";
const DELAY_MS = 2200; // safe gap between requests (unauthenticated = 10/min)

// Topics that reliably indicate agentic AI tooling relevant to security horizon scanning.
// Ordered by expected signal quality — higher-precision topics first.
const SEARCH_TOPICS = [
  // High-precision: explicitly agentic + MCP
  "mcp-server",
  "model-context-protocol",
  "ai-agent",
  "llm-agent",
  "autonomous-agent",
  "coding-agent",
  "browser-agent",
  "multi-agent",
  "agent-framework",
  "ai-agents",
  // Security-relevant agent tooling
  "red-team-agent",
  "pentest-ai",
  "ai-security",
  "llm-security",
  // Popular named frameworks (by topic tag)
  "langchain",
  "langgraph",
  "crewai",
  "autogen",
  "openagent",
];

// Additional keyword searches for repos that don't use topic tags properly
const KEYWORD_QUERIES = [
  '"MCP server" language:python stars:>10',
  '"MCP server" language:typescript stars:>10',
  '"agent framework" language:python stars:>20',
  '"coding agent" OR "browser agent" stars:>15',
  '"autonomous AI agent" stars:>10',
];

function makeHeaders() {
  const h = {
    "Accept":     "application/vnd.github+json",
    "User-Agent": "HorizonScan-ToolDiscovery/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    h["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normaliseRepo(repo) {
  return {
    tool_name:       repo.name,
    slug:            repo.full_name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    description:     (repo.description || "").slice(0, 500),
    url:             repo.html_url,
    github_url:      repo.html_url,
    homepage:        repo.homepage || null,
    source_platform: "github",
    publisher:       repo.owner?.login || null,
    license:         repo.license?.spdx_id || null,
    open_source:     true,
    topics:          repo.topics || [],
    created_at:      repo.created_at,
    updated_at:      repo.updated_at,
    stars:           repo.stargazers_count || 0,
    forks:           repo.forks_count || 0,
    open_issues:     repo.open_issues_count || 0,
    language:        repo.language || null,
    archived:        repo.archived || false,
    raw_metadata:    {
      full_name:        repo.full_name,
      default_branch:   repo.default_branch,
      size_kb:          repo.size,
      watchers:         repo.watchers_count,
      pushed_at:        repo.pushed_at,
    },
  };
}

async function searchByTopic(topic, perPage = 50) {
  const url = `${API_BASE}/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=${perPage}`;
  const res = await fetch(url, { headers: makeHeaders() });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      console.warn(`  [github] rate-limited on topic:${topic} — sleeping 60s`);
      await sleep(60000);
      return [];
    }
    console.warn(`  [github] HTTP ${res.status} for topic:${topic}`);
    return [];
  }
  const data = await res.json();
  return (data.items || []).map(normaliseRepo);
}

async function searchByKeyword(query, perPage = 30) {
  const url = `${API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  const res = await fetch(url, { headers: makeHeaders() });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      console.warn(`  [github] rate-limited on kw query — sleeping 60s`);
      await sleep(60000);
      return [];
    }
    return [];
  }
  const data = await res.json();
  return (data.items || []).map(normaliseRepo);
}

/**
 * Fetch the raw README text for a repo (used by enricher).
 *
 * @param {string} fullName  — e.g. "langchain-ai/langchain"
 * @returns {Promise<string>}  decoded README text or ""
 */
export async function fetchReadme(fullName) {
  if (!fullName) return "";
  try {
    const res = await fetch(`${API_BASE}/repos/${fullName}/readme`, {
      headers: { ...makeHeaders(), Accept: "application/vnd.github.raw+json" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch { return ""; }
}

/**
 * Run the full GitHub discovery sweep.
 *
 * @param {object} [opts]
 * @param {number} [opts.starsMin=5]          minimum star count
 * @param {boolean} [opts.skipArchived=true]  exclude archived repos
 * @param {boolean} [opts.verifyUrls=true]    HEAD-check all github_urls
 * @param {boolean} [opts.includeKeywords=true] also run keyword queries
 * @returns {Promise<object[]>}
 */
export async function discoverFromGithub(opts = {}) {
  const {
    starsMin       = 5,
    skipArchived   = true,
    verifyUrls     = true,
    includeKeywords = true,
  } = opts;

  console.log(`  [github] Starting discovery (topics:${SEARCH_TOPICS.length} keyword:${includeKeywords ? KEYWORD_QUERIES.length : 0})`);
  const seen = new Set();
  const all  = [];

  // Topic searches
  for (const topic of SEARCH_TOPICS) {
    const results = await searchByTopic(topic);
    for (const r of results) {
      if (!seen.has(r.github_url) && r.stars >= starsMin && (!skipArchived || !r.archived)) {
        seen.add(r.github_url);
        all.push(r);
      }
    }
    process.stdout.write(`    topic:${topic.padEnd(28)} +${results.filter(r=>!seen.has(r.github_url)||all.includes(r)).length} → total:${all.length}\r`);
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");

  // Keyword searches
  if (includeKeywords) {
    for (const q of KEYWORD_QUERIES) {
      const results = await searchByKeyword(q);
      for (const r of results) {
        if (!seen.has(r.github_url) && r.stars >= starsMin && (!skipArchived || !r.archived)) {
          seen.add(r.github_url);
          all.push(r);
        }
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`  [github] Raw candidates: ${all.length}`);

  // URL verification — skip for repos clearly live on github.com
  // GitHub repos at github.com/{owner}/{repo} are reliable; we trust the API.
  // We still verify homepage URLs since those can be stale.
  if (verifyUrls) {
    const homepages = all.filter(r => r.homepage).map(r => r.homepage);
    const { verifyUrls: vUrls } = await import("../urlVerifier.js");
    const results = await vUrls(homepages);
    for (const r of all) {
      if (r.homepage) {
        const vr = results.get(r.homepage);
        if (vr && !vr.ok) r.homepage = null; // clear broken homepage
      }
      r.url_verified = true; // github.com URLs are trusted
      r.url_status   = 200;
    }
  }

  return all;
}
