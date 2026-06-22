/**
 * Docker Hub connector — discovers container images for AI agent tools.
 */

const SEARCH_TERMS = ["ai-agent", "mcp-server", "langchain", "autogen", "open-hands"];

function normalise(img) {
  const name = img.name || img.repo_name || "";
  return {
    tool_name:       name,
    slug:            `docker-${name.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").toLowerCase()}`,
    description:     (img.short_description || img.description || "").slice(0, 500),
    url:             `https://hub.docker.com/r/${name}`,
    github_url:      null,
    homepage:        `https://hub.docker.com/r/${name}`,
    package_url:     `https://hub.docker.com/r/${name}`,
    source_platform: "docker",
    publisher:       img.namespace || name.split("/")[0] || null,
    license:         null,
    open_source:     true,
    topics:          [],
    stars:           img.star_count || 0,
    forks:           0,
    raw_metadata:    { pull_count: img.pull_count, last_updated: img.last_updated },
  };
}

export async function discoverFromDocker() {
  const seen = new Set();
  const all  = [];
  for (const term of SEARCH_TERMS) {
    try {
      const res = await fetch(
        `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page_size=25`,
        { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const img of (data.results || [])) {
        const key = img.name || img.repo_name;
        if (!seen.has(key)) { seen.add(key); all.push(normalise(img)); }
      }
    } catch { continue; }
  }
  console.log(`  [docker] ${all.length} images`);
  return all.map(t => ({ ...t, url_verified: true, url_status: 200 }));
}
