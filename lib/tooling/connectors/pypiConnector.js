/**
 * PyPI connector — discovers Python agent packages via keyword search + JSON API.
 */

const SEARCH_TERMS = [
  "ai-agent", "llm-agent", "mcp-server", "agent-framework",
  "autonomous-agent", "multi-agent", "coding-agent",
  "langchain", "crewai", "autogen", "pydantic-ai",
];

// Known high-value packages to always include
const SEED_PACKAGES = [
  "langchain", "langchain-core", "langchain-community",
  "langgraph", "crewai", "pyautogen", "autogen",
  "pydantic-ai", "mem0ai", "letta",
  "opendevin", "browser-use",
  "mcp", "fastmcp",
  "agentops", "agentql",
];

async function fetchPackageJson(name) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(8000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function normalise(data) {
  if (!data?.info) return null;
  const info = data.info;
  const ghUrl = (info.project_urls || {})["Source"] ||
                (info.project_urls || {})["Repository"] ||
                (info.project_urls || {})["GitHub"] || null;
  const homepage = info.home_page || (info.project_urls || {})["Homepage"] || null;
  return {
    tool_name:       info.name,
    slug:            `pypi-${info.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    description:     (info.summary || "").slice(0, 500),
    url:             `https://pypi.org/project/${info.name}/`,
    github_url:      ghUrl,
    homepage:        homepage,
    package_url:     `https://pypi.org/project/${info.name}/`,
    source_platform: "pypi",
    publisher:       info.author || info.maintainer || null,
    license:         info.license || null,
    open_source:     true,
    topics:          (info.keywords || "").split(/[,\s]+/).filter(Boolean),
    stars:           0,
    forks:           0,
    raw_metadata:    {
      version: info.version,
      requires_python: info.requires_python,
      classifiers: (info.classifiers || []).slice(0, 10),
    },
  };
}

export async function discoverFromPypi(opts = {}) {
  const { extraPackages = [] } = opts;
  const toFetch = new Set([...SEED_PACKAGES, ...extraPackages]);

  // Search PyPI for additional packages
  for (const term of SEARCH_TERMS.slice(0, 6)) { // limit to avoid hammering
    try {
      const res = await fetch(
        `https://pypi.org/search/?q=${encodeURIComponent(term)}&o=-created&c=&format=json`,
        { signal: AbortSignal.timeout(8000), headers: { "Accept": "application/json" } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const pkg of (data.results || []).slice(0, 20)) {
          toFetch.add(pkg.name);
        }
      }
    } catch { /* search endpoint unreliable — seeds are sufficient */ }
  }

  console.log(`  [pypi] Fetching ${toFetch.size} packages`);
  const results = [];
  for (const name of toFetch) {
    const data = await fetchPackageJson(name);
    if (data) {
      const norm = normalise(data);
      if (norm) results.push({ ...norm, url_verified: true, url_status: 200 });
    }
  }
  console.log(`  [pypi] ${results.length} valid packages`);
  return results;
}
