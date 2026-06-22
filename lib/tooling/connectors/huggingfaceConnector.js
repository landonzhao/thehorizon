/**
 * Hugging Face connector — discovers agent-related models and Spaces.
 */

function normalise(item, type) {
  const id = item.id || item.modelId || "";
  const [org] = id.split("/");
  return {
    tool_name:       id,
    slug:            `hf-${id.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`,
    description:     (item.cardData?.summary || item.description || "").slice(0, 500),
    url:             `https://huggingface.co/${id}`,
    github_url:      null,
    homepage:        `https://huggingface.co/${id}`,
    package_url:     `https://huggingface.co/${id}`,
    source_platform: `huggingface_${type}`,
    publisher:       org || null,
    license:         item.cardData?.license || item.library_name || null,
    open_source:     true,
    topics:          item.tags || [],
    stars:           item.likes || 0,
    forks:           0,
    raw_metadata:    {
      downloads: item.downloads,
      pipeline_tag: item.pipeline_tag,
      library_name: item.library_name,
      created_at: item.createdAt,
    },
  };
}

async function fetchModels() {
  const params = new URLSearchParams({
    filter: "agent",
    sort: "downloads",
    direction: "-1",
    limit: "100",
    full: "true",
  });
  try {
    const res = await fetch(`https://huggingface.co/api/models?${params}`, {
      signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(m => normalise(m, "model")) : [];
  } catch { return []; }
}

async function fetchSpaces() {
  const params = new URLSearchParams({
    filter: "agent",
    sort: "likes",
    direction: "-1",
    limit: "50",
  });
  try {
    const res = await fetch(`https://huggingface.co/api/spaces?${params}`, {
      signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(m => normalise(m, "space")) : [];
  } catch { return []; }
}

export async function discoverFromHuggingFace() {
  const [models, spaces] = await Promise.all([fetchModels(), fetchSpaces()]);
  const all = [...models, ...spaces];
  console.log(`  [huggingface] ${models.length} models + ${spaces.length} spaces = ${all.length}`);
  return all.map(t => ({ ...t, url_verified: true, url_status: 200 }));
}
