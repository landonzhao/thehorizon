#!/usr/bin/env node
/**
 * findSecurityTools.js — Find agentic AI security testing tools from multiple sources.
 *
 * Sources hit in parallel:
 *   1. GitHub Search API  — topic + keyword queries for security tooling repos
 *   2. arXiv API          — cs.CR papers that released code (security AI tools)
 *   3. SerpAPI            — web search for tools not yet on GitHub topic lists
 *   4. PyPI               — seed packages known in the security-AI space
 *   5. Awesome lists      — curated security-AI GitHub lists (parsed for repos)
 *
 * Every candidate goes through:
 *   A. Security scope gate  — must match explicit security-testing keywords
 *   B. URL verification     — at least one URL must return HTTP 200
 *   C. LLM description      — Haiku reads the README and writes a factual description
 *      (if README not fetchable, description comes from GitHub/arXiv metadata only)
 *
 * Output:
 *   outputs/security-tools/YYYY-MM-DD.json   — full structured results
 *   Console report                            — human-readable summary
 *
 * Usage:
 *   node scripts/findSecurityTools.js
 *   node scripts/findSecurityTools.js --no-llm      # skip LLM descriptions
 *   node scripts/findSecurityTools.js --limit 50    # cap total tools
 */

import "dotenv/config";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { routedLLM } from "../lib/llm/llmRouter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const args      = process.argv.slice(2);
const NO_LLM    = args.includes("--no-llm");
const LIMIT     = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "999", 10);
const OUTDIR    = path.join(ROOT, "outputs", "security-tools");

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY     = new Date().toISOString().slice(0, 10);
const GH_DELAY  = 6500; // ms between GitHub Search requests (unauthenticated = 10/min)
const GH_HDR    = {
  Accept:                 "application/vnd.github+json",
  "User-Agent":           "HorizonScan-SecurityToolFinder/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

// Primary security-testing signal words — a candidate MUST match ≥1
const SECURITY_MUST = [
  "penetration test", "pentest", "red team", "vulnerability discover",
  "exploit", "fuzzing", "fuzz", "jailbreak", "prompt injection",
  "safety evaluation", "safety benchmark", "adversarial", "security scanner",
  "guardrail", "attack simulation", "purple team", "bug bounty",
  "security testing", "security audit", "offensive security", "ctf",
  "capture the flag", "security benchmark", "security eval", "llm attack",
  "ai attack", "agent security", "mcp security", "red-team",
  "vulnerability scanner", "security agent", "code security", "static analysis",
];

// Hard exclusions — tools matching these are NOT security testing tools
const GENERIC_EXCLUSIONS = [
  "customer service", "e-commerce", "productivity assistant",
  "scheduling", "crm", "content creation", "writing assistant",
  "image generation", "text to image", "data visualization",
  "recommendation engine",
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function securityGate(text) {
  const t = text.toLowerCase();
  if (GENERIC_EXCLUSIONS.some(ex => t.includes(ex))) return false;
  return SECURITY_MUST.some(kw => t.includes(kw));
}

// ── URL verifier ──────────────────────────────────────────────────────────────

async function verifyUrl(url) {
  if (!url?.startsWith("http")) return false;
  try {
    const r = await fetch(url, {
      method: "HEAD", redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HorizonScan/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

// ── README fetcher ────────────────────────────────────────────────────────────

async function fetchReadme(fullName) {
  try {
    const r = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: { ...GH_HDR, Accept: "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return "";
    return (await r.text()).slice(0, 6000);
  } catch { return ""; }
}

// ── LLM description ──────────────────────────────────────────────────────────

const DESC_SYSTEM = `You are writing factual descriptions of AI security testing tools for a research database.
RULES:
1. Base your description ONLY on the text provided. Do not use general knowledge.
2. Write 2-3 sentences: what the tool does, what attack/defense capability it provides, and who publishes it.
3. If the text is insufficient, return null.
4. Output JSON only: {"description": "...", "category": "...", "key_capabilities": []}
CATEGORIES: pentesting_agent|vuln_discovery|red_teaming|prompt_injection_testing|safety_evaluation|agent_security_testing|mcp_security|code_security_agent|attack_simulation|observability_guardrail`;

async function getLlmDescription(tool, readme) {
  if (NO_LLM || !readme || readme.length < 100) return null;
  try {
    const { result } = await routedLLM(
      DESC_SYSTEM,
      `Tool: ${tool.name}\nPublisher: ${tool.publisher || "unknown"}\nMetadata description: ${tool.raw_description || ""}\n\nREADME excerpt:\n${readme.slice(0, 4000)}`,
      { task: "source_relevance", requires_json: true, logLabel: `sectool-${tool.name?.slice(0,20)}` }
    );
    return result;
  } catch { return null; }
}

// ── Source 1: GitHub ──────────────────────────────────────────────────────────

const GH_TOPICS = [
  "ai-pentesting", "llm-security", "red-teaming", "prompt-injection",
  "jailbreak", "ai-security", "llm-safety", "ai-vulnerability",
  "agent-security", "adversarial-ml", "ai-red-team", "llm-jailbreak",
  "security-llm", "ai-fuzzing", "llm-evaluation",
];

const GH_KEYWORDS = [
  '"autonomous pentesting" language:python stars:>3',
  '"AI red teaming" stars:>3',
  '"LLM vulnerability" language:python stars:>3',
  '"prompt injection" "security" language:python stars:>5',
  '"jailbreak" "framework" stars:>5',
  '"agent security" "testing" stars:>3',
  '"MCP security" stars:>3',
  '"llm fuzzing" OR "ai fuzzing" stars:>3',
  '"safety evaluation" "LLM" language:python stars:>5',
  '"red team" "LLM" OR "language model" stars:>5',
  '"exploit" "LLM" OR "language model" stars:>3',
  '"vulnerability" "ai agent" stars:>3',
  '"pentest" "AI" OR "LLM" language:python stars:>3',
];

async function searchGithub(q, isTopic = false) {
  const url = isTopic
    ? `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`
    : `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
  try {
    const r = await fetch(url, { headers: GH_HDR, signal: AbortSignal.timeout(10000) });
    if (r.status === 403 || r.status === 429) {
      console.warn(`  [github] rate limited — sleeping 70s`);
      await sleep(70000);
      return [];
    }
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).map(repo => ({
      name:            repo.name,
      full_name:       repo.full_name,
      github_url:      repo.html_url,
      homepage:        repo.homepage || null,
      raw_description: repo.description || "",
      publisher:       repo.owner?.login,
      stars:           repo.stargazers_count || 0,
      forks:           repo.forks_count || 0,
      language:        repo.language,
      topics:          repo.topics || [],
      created_at:      repo.created_at,
      updated_at:      repo.updated_at,
      pushed_at:       repo.pushed_at,
      license:         repo.license?.spdx_id || null,
      source:          "github",
    }));
  } catch { return []; }
}

async function discoverGithub() {
  console.log("  [github] Starting (topics + keywords)...");
  const seen = new Set();
  const all  = [];

  for (const topic of GH_TOPICS) {
    const results = await searchGithub(topic, true);
    for (const r of results) {
      if (!seen.has(r.github_url)) {
        const text = `${r.name} ${r.raw_description} ${r.topics.join(" ")}`;
        if (securityGate(text)) { seen.add(r.github_url); all.push(r); }
      }
    }
    process.stdout.write(`    ${topic.padEnd(28)} ${all.length} so far\r`);
    await sleep(GH_DELAY);
  }

  for (const q of GH_KEYWORDS) {
    const results = await searchGithub(q, false);
    for (const r of results) {
      if (!seen.has(r.github_url)) {
        const text = `${r.name} ${r.raw_description} ${r.topics.join(" ")}`;
        if (securityGate(text)) { seen.add(r.github_url); all.push(r); }
      }
    }
    await sleep(GH_DELAY);
  }

  process.stdout.write("\n");
  console.log(`  [github] ${all.length} security-relevant repos`);
  return all;
}

// ── Source 2: arXiv ───────────────────────────────────────────────────────────

const ARXIV_QUERIES = [
  'cat:cs.CR+AND+(ti:"LLM"+OR+ti:"language+model"+OR+ti:"AI+agent")+AND+(ti:"attack"+OR+ti:"vulnerability"+OR+ti:"red+team"+OR+ti:"adversarial")',
  'cat:cs.CR+AND+(ti:"jailbreak"+OR+ti:"prompt+injection")+AND+(ti:"framework"+OR+ti:"tool"+OR+ti:"benchmark")',
  'cat:cs.CR+AND+(ti:"pentesting"+OR+ti:"penetration+testing")+AND+(ti:"AI"+OR+ti:"LLM"+OR+ti:"autonomous")',
  'cat:cs.CR+AND+(ti:"fuzzing"+OR+ti:"vulnerability+discovery")+AND+(ti:"LLM"+OR+ti:"language+model")',
  'cat:cs.CR+AND+(ti:"safety"+OR+ti:"alignment")+AND+(ti:"evaluation"+OR+ti:"benchmark")+AND+(ti:"LLM"+OR+ti:"agent")',
  '(cat:cs.CR+OR+cat:cs.AI)+AND+(ti:"agent+security"+OR+ti:"MCP+security"+OR+ti:"tool+use+security")',
  'cat:cs.CR+AND+(ti:"red+teaming"+OR+ti:"red-teaming")+AND+(ti:"AI"+OR+ti:"LLM"+OR+ti:"language+model")',
];

function extractGithubLinks(text) {
  const urls = [];
  const re = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g;
  for (const m of (text || "").matchAll(re)) {
    const url = m[0].replace(/[.,)>\]"']+$/, "");
    if (!url.includes("/topics/") && url.split("/").length >= 5) urls.push(url);
  }
  return [...new Set(urls)];
}

async function discoverArxiv() {
  console.log("  [arxiv] Searching cs.CR security AI papers with released code...");
  const seen = new Set();
  const all  = [];

  for (const q of ARXIV_QUERIES) {
    try {
      const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=30`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const xml = await r.text();

      const entries = xml.split("<entry>").slice(1);
      for (const entry of entries) {
        const title     = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() || "";
        const abstract  = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, " ").trim() || "";
        const arxivId   = entry.match(/<id>(https?:\/\/arxiv\.org\/abs\/[^<]+)<\/id>/)?.[1] || "";
        const authors   = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1]).slice(0, 3).join(", ");
        const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.slice(0, 10) || "";

        if (!arxivId || seen.has(arxivId)) continue;

        // Only keep papers that mention releasing code
        const fullText = `${title} ${abstract}`;
        const hasCode = /github\.com|we release|open.source|available at|code at|implementation at|open.sourced/i.test(fullText);
        if (!hasCode) continue;
        if (!securityGate(fullText)) continue;

        seen.add(arxivId);
        const githubLinks = extractGithubLinks(abstract);

        all.push({
          name:            title,
          full_name:       null,
          github_url:      githubLinks[0] || null,
          homepage:        null,
          paper_url:       arxivId,
          raw_description: abstract.slice(0, 300),
          publisher:       authors,
          stars:           0,
          source:          "arxiv",
          published_at:    published,
        });
      }
      await sleep(3000);
    } catch { continue; }
  }

  console.log(`  [arxiv] ${all.length} papers with released code`);
  return all;
}

// ── Source 3: SerpAPI web search ──────────────────────────────────────────────

const SERP_QUERIES = [
  "autonomous AI pentesting agent github 2025 2026",
  "LLM red teaming framework open source tool",
  "AI vulnerability discovery agent github",
  "prompt injection testing framework python tool",
  "jailbreak testing benchmark LLM open source",
  "MCP security scanner tool github",
  "agent security testing framework autonomous",
  "AI exploit generation tool research github",
  "LLM fuzzing agent security testing",
  "AI red team automation tool github 2026",
  "LLM safety evaluation benchmark tool",
  "AI purple team agent github open source",
  "AI penetration testing tool autonomous 2025 2026",
  "agentic security testing tool github",
  "LLM attack framework security research",
];

async function discoverSerp() {
  if (!process.env.SERPAPI_API_KEY) {
    console.log("  [serp] No SERPAPI_API_KEY — skipping");
    return [];
  }
  console.log(`  [serp] Running ${SERP_QUERIES.length} queries...`);
  const seen = new Set();
  const all  = [];

  for (const q of SERP_QUERIES) {
    try {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_API_KEY}&num=10&engine=google`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const data = await r.json();

      for (const result of (data.organic_results || [])) {
        const link  = result.link || "";
        const title = result.title || "";
        const snip  = result.snippet || "";

        // Only keep GitHub links and known security sites
        const isGithub = link.includes("github.com/") && link.split("/").length >= 5;
        const isPaper  = link.includes("arxiv.org") || link.includes("paper") || link.includes("acm.org");
        if (!isGithub && !isPaper) continue;
        if (seen.has(link)) continue;

        const text = `${title} ${snip}`;
        if (!securityGate(text)) continue;

        seen.add(link);
        all.push({
          name:            title.replace(/- GitHub$/, "").replace(/\|.*$/, "").trim().slice(0, 100),
          github_url:      isGithub ? link.replace(/\/$/, "") : null,
          paper_url:       isPaper ? link : null,
          raw_description: snip.slice(0, 300),
          publisher:       isGithub ? link.split("/")[3] : null,
          source:          "serp",
          serp_query:      q,
        });
      }
      await sleep(1500);
    } catch { continue; }
  }

  console.log(`  [serp] ${all.length} GitHub/paper candidates`);
  return all;
}

// ── Source 4: PyPI seed packages ──────────────────────────────────────────────

const PYPI_SEEDS = [
  "garak", "pyrit", "llm-guard", "rebuff", "guardrails-ai",
  "inspect-ai", "promptfoo", "llm-security", "adversarial-robustness-toolbox",
  "foolbox", "cleverhans", "art", "textattack", "promptbench",
  "llm-attacks", "agentbench", "jailbreakbench",
];

async function discoverPypi() {
  console.log(`  [pypi] Fetching ${PYPI_SEEDS.length} seed packages...`);
  const all = [];
  for (const name of PYPI_SEEDS) {
    try {
      const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) continue;
      const data = await r.json();
      const info = data.info;
      const ghUrl = Object.values(info.project_urls || {}).find(u => u.includes("github.com"));
      all.push({
        name:            info.name,
        github_url:      ghUrl?.replace(/\.git$/, "") || null,
        package_url:     `https://pypi.org/project/${info.name}/`,
        raw_description: info.summary || "",
        publisher:       info.author || null,
        source:          "pypi",
      });
    } catch { continue; }
  }
  console.log(`  [pypi] ${all.length} packages`);
  return all;
}

// ── Source 5: Awesome lists ────────────────────────────────────────────────────
// Curated "awesome" lists for AI security — parse for GitHub repo links

const AWESOME_LISTS = [
  "https://raw.githubusercontent.com/corca-ai/awesome-llm-security/main/README.md",
  "https://raw.githubusercontent.com/protectai/ai-exploits/main/README.md",
  "https://raw.githubusercontent.com/2024-LLM-jailbreak-updated/Awesome-LLM-Jailbreak/main/README.md",
  "https://raw.githubusercontent.com/Hannibal046/Awesome-LLM/main/README.md",
  "https://raw.githubusercontent.com/fr0gger/Awesome-GPT-Agents/main/README.md",
  "https://raw.githubusercontent.com/ottosulin/awesome-ai-safety/main/README.md",
  "https://raw.githubusercontent.com/UnchartedBull/awesome-llm-red-teaming/main/README.md",
];

async function discoverAwesomeLists() {
  console.log(`  [awesome] Parsing ${AWESOME_LISTS.length} curated lists...`);
  const seen = new Set();
  const all  = [];

  for (const listUrl of AWESOME_LISTS) {
    try {
      const r = await fetch(listUrl, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const text  = await r.text();
      // Extract markdown links: [Name](https://github.com/owner/repo)
      const re    = /\[([^\]]+)\]\((https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)[^)]*\)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const [, name, url] = m;
        const cleanUrl = url.replace(/\.git$/, "").replace(/\/$/, "");
        if (seen.has(cleanUrl) || cleanUrl.includes("/topics/")) continue;
        if (cleanUrl.split("/").length < 5) continue;
        seen.add(cleanUrl);

        // Get surrounding context (100 chars) to check security relevance
        const ctx = text.slice(Math.max(0, m.index - 50), m.index + 200);
        if (!securityGate(`${name} ${ctx}`)) continue;

        all.push({
          name:            name.trim().slice(0, 100),
          github_url:      cleanUrl,
          raw_description: ctx.replace(/\[.*?\]\(.*?\)/g, "").replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 200),
          publisher:       cleanUrl.split("/")[3],
          source:          "awesome_list",
          source_list:     listUrl.split("/")[4],
        });
      }
    } catch { continue; }
  }
  console.log(`  [awesome] ${all.length} repos from curated lists`);
  return all;
}

// ── Dedup + enrich ────────────────────────────────────────────────────────────

function normaliseSlug(t) {
  return (t.github_url || t.package_url || t.paper_url || t.name || "")
    .toLowerCase().replace(/https?:\/\/(www\.)?github\.com\//,"").replace(/[^a-z0-9]/g,"-");
}

async function enrichWithReadmeAndLlm(tool) {
  // Fetch README from GitHub if we have the repo
  let readme = "";
  if (tool.github_url && tool.github_url.includes("github.com/")) {
    const fullName = tool.github_url.replace("https://github.com/", "").replace(/\/$/, "");
    if (fullName.split("/").length === 2) {
      readme = await fetchReadme(fullName);
    }
  }

  // Security gate on README content (final check)
  const allText = `${tool.name} ${tool.raw_description} ${readme.slice(0, 1000)}`;
  if (!securityGate(allText)) {
    return { ...tool, _rejected: true, _reject_reason: "failed_security_gate_on_readme" };
  }

  // Get description from LLM (or fall back to metadata)
  let description = tool.raw_description || "";
  let category    = "unknown";
  let key_caps    = [];

  if (!NO_LLM && readme.length >= 150) {
    const llm = await getLlmDescription(tool, readme);
    if (llm?.description) {
      description = llm.description;
      category    = llm.category || "unknown";
      key_caps    = llm.key_capabilities || [];
    }
  }

  // Verify URL
  const urlToCheck = tool.github_url || tool.homepage || tool.package_url || tool.paper_url;
  const urlOk = urlToCheck ? await verifyUrl(urlToCheck) : false;

  return {
    name:            tool.name,
    slug:            normaliseSlug(tool),
    description:     description.slice(0, 500),
    description_source: (NO_LLM || readme.length < 150) ? "metadata" : "readme+llm",
    github_url:      tool.github_url || null,
    homepage:        tool.homepage || null,
    paper_url:       tool.paper_url || null,
    package_url:     tool.package_url || null,
    source_platform: tool.source,
    publisher:       tool.publisher || null,
    license:         tool.license || null,
    category,
    key_capabilities: key_caps,
    stars:           tool.stars || 0,
    forks:           tool.forks || 0,
    language:        tool.language || null,
    topics:          tool.topics || [],
    url_verified:    urlOk,
    primary_url:     urlOk ? urlToCheck : null,
    readme_length:   readme.length,
    discovered_at:   TODAY,
    source:          tool.source,
    source_list:     tool.source_list || null,
    serp_query:      tool.serp_query || null,
    published_at:    tool.published_at || null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("════════════════════════════════════════════════════════════");
console.log("  Agentic AI Security Tool Finder");
console.log(`  Date: ${TODAY}  LLM: ${NO_LLM ? "OFF" : "ON (Haiku descriptions)"}  Limit: ${LIMIT}`);
console.log("════════════════════════════════════════════════════════════\n");

// Phase 1: Discover from all sources concurrently
console.log("Phase 1 — Discovery");
const [github, arxiv, serp, pypi, awesome] = await Promise.allSettled([
  discoverGithub(),
  discoverArxiv(),
  discoverSerp(),
  discoverPypi(),
  discoverAwesomeLists(),
]).then(r => r.map(x => x.status === "fulfilled" ? x.value : (console.warn("source failed:", x.reason?.message), [])));

const rawAll = [...github, ...arxiv, ...serp, ...pypi, ...awesome];
console.log(`\nTotal raw: ${rawAll.length} | GitHub:${github.length} arXiv:${arxiv.length} SerpAPI:${serp.length} PyPI:${pypi.length} Awesome:${awesome.length}`);

// Phase 2: Dedup by URL/slug, then enrich + verify
console.log("\nPhase 2 — Dedup, enrich, verify URLs");
const seen  = new Set();
const dedup = [];
for (const t of rawAll) {
  const key = t.github_url || t.package_url || t.paper_url || t.name;
  if (key && !seen.has(key)) { seen.add(key); dedup.push(t); }
}
console.log(`After dedup: ${dedup.length} unique candidates`);

const toProcess = dedup.slice(0, LIMIT);
const results   = [];
const rejected  = [];

// Process with limited concurrency (avoid hammering GitHub API)
const CONC = NO_LLM ? 5 : 3;
for (let i = 0; i < toProcess.length; i += CONC) {
  const batch   = toProcess.slice(i, i + CONC);
  const settled = await Promise.allSettled(batch.map(t => enrichWithReadmeAndLlm(t)));
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const t = r.value;
    if (t._rejected) { rejected.push(t); continue; }
    if (!t.url_verified) { rejected.push({ ...t, _reject_reason: "url_not_verified" }); continue; }
    results.push(t);
  }
  process.stdout.write(`  Processed ${Math.min(i + CONC, toProcess.length)}/${toProcess.length} → ${results.length} valid\r`);
}
process.stdout.write("\n");

// Phase 3: Sort and report
results.sort((a, b) => (b.stars || 0) - (a.stars || 0));

console.log("\n════════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${results.length} confirmed agentic AI security tools`);
console.log("════════════════════════════════════════════════════════════\n");

// Group by category
const byCategory = {};
for (const t of results) {
  const cat = t.category || "unknown";
  byCategory[cat] = (byCategory[cat] || []);
  byCategory[cat].push(t);
}

for (const [cat, tools] of Object.entries(byCategory).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`\n── ${cat.toUpperCase().replace(/_/g," ")} (${tools.length}) ──────────────────────────`);
  for (const t of tools.slice(0, 15)) {
    const stars = t.stars > 0 ? ` ⭐${t.stars}` : "";
    const src   = t.source !== "github" ? ` [${t.source}]` : "";
    console.log(`  ${(t.name || "").slice(0,45).padEnd(45)}${stars}${src}`);
    if (t.description && t.description !== t.raw_description) {
      console.log(`    → ${t.description.slice(0, 120)}`);
    }
    if (t.github_url) console.log(`    ${t.github_url}`);
    if (t.paper_url && !t.github_url) console.log(`    ${t.paper_url}`);
  }
}

console.log(`\n  Rejected (${rejected.length}): ${rejected.slice(0,5).map(r=>r._reject_reason).join(", ")}...`);

// Save output
const output = {
  generated_at:   new Date().toISOString(),
  llm_used:       !NO_LLM,
  total_found:    results.length,
  total_rejected: rejected.length,
  by_category:    Object.fromEntries(Object.entries(byCategory).map(([k,v]) => [k, v.length])),
  sources:        { github: github.length, arxiv: arxiv.length, serp: serp.length, pypi: pypi.length, awesome: awesome.length },
  tools:          results,
  rejected_sample: rejected.slice(0, 20).map(r => ({ name: r.name, reason: r._reject_reason })),
};

fs.mkdirSync(OUTDIR, { recursive: true });
const outPath = path.join(OUTDIR, `${TODAY}.json`);
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\n✓ Results saved to ${outPath}`);
console.log(`  Run: node scripts/findSecurityTools.js --no-llm   for faster re-runs`);
