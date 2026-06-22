/**
 * VS Code Marketplace connector — discovers AI agent extensions.
 *
 * Uses the public Gallery API (POST request). Extensions with agent/MCP
 * integration are particularly relevant as they expand the coding-agent
 * attack surface directly on developer workstations.
 */

const GALLERY_API = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const HEADERS = {
  "Content-Type":  "application/json",
  "Accept":        "application/json;api-version=7.2-preview.1",
  "User-Agent":    "HorizonScan-ToolDiscovery/1.0",
};

const QUERIES = [
  "ai agent",
  "mcp",
  "coding agent",
  "llm",
  "copilot",
];

function normalise(ext) {
  const pub  = ext.publisher?.publisherName || "";
  const name = ext.extensionName || "";
  const id   = `${pub}.${name}`;
  const stats = Object.fromEntries((ext.statistics || []).map(s => [s.statisticName, s.value]));
  return {
    tool_name:       ext.displayName || name,
    slug:            `vscode-${id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    description:     (ext.shortDescription || "").slice(0, 500),
    url:             `https://marketplace.visualstudio.com/items?itemName=${id}`,
    github_url:      null,
    homepage:        `https://marketplace.visualstudio.com/items?itemName=${id}`,
    package_url:     `https://marketplace.visualstudio.com/items?itemName=${id}`,
    source_platform: "vscode",
    publisher:       pub,
    license:         null,
    open_source:     false,
    topics:          ext.tags || [],
    stars:           Math.round(stats.weightedRating || 0),
    forks:           0,
    raw_metadata:    {
      installs:     stats.install,
      avg_rating:   stats.averagerating,
      last_updated: ext.lastUpdated,
      version:      ext.versions?.[0]?.version,
    },
  };
}

async function searchExtensions(query) {
  const body = {
    filters: [{
      criteria: [
        { filterType: 8, value: "Microsoft.VisualStudio.Code" },
        { filterType: 10, value: query },
      ],
      pageSize: 50,
      pageNumber: 1,
      sortBy: 4, // InstallCount
      sortOrder: 0,
    }],
    flags: 914,
  };
  try {
    const res = await fetch(GALLERY_API, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results?.[0]?.extensions || []).map(normalise);
  } catch { return []; }
}

export async function discoverFromVscode() {
  const seen = new Set();
  const all  = [];
  for (const q of QUERIES) {
    const results = await searchExtensions(q);
    for (const r of results) {
      if (!seen.has(r.url)) { seen.add(r.url); all.push(r); }
    }
  }
  console.log(`  [vscode] ${all.length} extensions`);
  return all.map(t => ({ ...t, url_verified: true, url_status: 200 }));
}
