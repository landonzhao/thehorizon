/**
 * npm connector — discovers JavaScript/TypeScript agent packages.
 */

const SEARCH_QUERIES = [
  "ai agent", "llm agent", "mcp server",
  "agent framework", "autonomous agent",
  "langchain", "langgraph",
];

const SEED_PACKAGES = [
  "@langchain/core", "@langchain/community", "@langchain/langgraph",
  "@anthropic-ai/sdk", "openai",
  "@modelcontextprotocol/sdk",
  "ai", "vercel-ai",
  "llamaindex",
  "autogpt",
  "agentql",
];

function normalise(pkg) {
  const name = pkg.package?.name || pkg.name;
  if (!name) return null;
  const desc = pkg.package?.description || pkg.description || "";
  const links = pkg.package?.links || pkg.links || {};
  return {
    tool_name:       name,
    slug:            `npm-${name.replace(/^@/, "").replace(/\//g, "-").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`,
    description:     desc.slice(0, 500),
    url:             links.npm || `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
    github_url:      links.repository || null,
    homepage:        links.homepage || null,
    package_url:     `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
    source_platform: "npm",
    publisher:       pkg.package?.publisher?.username || pkg.publisher?.username || null,
    license:         null,
    open_source:     true,
    topics:          pkg.package?.keywords || pkg.keywords || [],
    stars:           0,
    forks:           0,
    raw_metadata:    {
      version: pkg.package?.version,
      date:    pkg.package?.date,
    },
  };
}

async function searchNpm(q) {
  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=50`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.objects || []).map(o => normalise(o)).filter(Boolean);
  } catch { return []; }
}

async function fetchNpmMeta(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const latest = data.versions?.[data["dist-tags"]?.latest] || {};
    return normalise({
      name: data.name,
      description: data.description || latest.description,
      links: {
        npm: `https://www.npmjs.com/package/${data.name}`,
        repository: typeof data.repository === "object" ? data.repository.url?.replace(/^git\+/, "").replace(/\.git$/, "") : null,
        homepage: latest.homepage,
      },
      keywords: latest.keywords || [],
      publisher: { username: data.maintainers?.[0]?.name },
      package: { version: data["dist-tags"]?.latest },
    });
  } catch { return null; }
}

export async function discoverFromNpm(opts = {}) {
  const seen = new Set();
  const all  = [];

  // Search queries
  for (const q of SEARCH_QUERIES) {
    const results = await searchNpm(q);
    for (const r of results) {
      if (!seen.has(r.url)) { seen.add(r.url); all.push(r); }
    }
  }

  // Seed packages
  for (const name of SEED_PACKAGES) {
    if (!seen.has(`https://www.npmjs.com/package/${encodeURIComponent(name)}`)) {
      const r = await fetchNpmMeta(name);
      if (r && !seen.has(r.url)) { seen.add(r.url); all.push({ ...r, url_verified: true, url_status: 200 }); }
    }
  }

  console.log(`  [npm] ${all.length} packages`);
  return all;
}
