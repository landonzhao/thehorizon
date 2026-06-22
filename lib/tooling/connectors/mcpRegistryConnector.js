/**
 * MCP Registry connector — discovers MCP servers from public registries.
 *
 * Sources (in priority order):
 *   1. mcp.so       — public JSON API (largest registry)
 *   2. Smithery.ai  — API at smithery.ai/api/v1/servers
 *   3. Glama.ai     — structured listing
 *   4. awesome-mcp-servers GitHub repo (raw README parse)
 *
 * All MCP servers are security-critical discovery targets: they expand the
 * agentic attack surface directly (tool poisoning, supply-chain risk).
 */

import { verifyUrl } from "../urlVerifier.js";

const DELAY_MS = 1000;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalise(raw, platform) {
  const name = raw.name || raw.qualifiedName || raw.title || "";
  return {
    tool_name:       name,
    slug:            name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"),
    description:     (raw.description || "").slice(0, 500),
    url:             raw.url || raw.homepage || raw.githubUrl || null,
    github_url:      raw.githubUrl || raw.github || raw.repository || null,
    homepage:        raw.homepage || raw.url || null,
    source_platform: `mcp_registry_${platform}`,
    publisher:       raw.author || raw.publisher || raw.owner || null,
    license:         raw.license || null,
    open_source:     true,
    topics:          ["mcp-server", "model-context-protocol", ...(raw.tags || [])],
    stars:           raw.stars || raw.githubStars || 0,
    forks:           0,
    created_at:      raw.createdAt || raw.created_at || null,
    updated_at:      raw.updatedAt || raw.updated_at || null,
    raw_metadata:    raw,
  };
}

async function fetchMcpSo() {
  // mcp.so public API (check current endpoint)
  const endpoints = [
    "https://mcp.so/api/servers",
    "https://mcp.so/api/v1/servers",
    "https://api.mcp.so/servers",
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: { "Accept": "application/json", "User-Agent": "HorizonScan/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) continue;
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.servers || data.data || data.items || []);
      if (items.length > 0) {
        console.log(`  [mcp.so] ${items.length} servers via ${ep}`);
        return items.map(r => normalise(r, "mcpso"));
      }
    } catch { continue; }
  }
  console.warn("  [mcp.so] No working API endpoint found — skipping");
  return [];
}

async function fetchSmithery() {
  const endpoints = [
    "https://smithery.ai/api/v1/servers?pageSize=200",
    "https://smithery.ai/api/servers",
    "https://api.smithery.ai/v1/servers",
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: { "Accept": "application/json", "User-Agent": "HorizonScan/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) continue;
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.servers || data.data || []);
      if (items.length > 0) {
        console.log(`  [smithery] ${items.length} servers via ${ep}`);
        return items.map(r => normalise(r, "smithery"));
      }
    } catch { continue; }
  }
  console.warn("  [smithery] No working API endpoint found — skipping");
  return [];
}

async function fetchAwesomeMcp() {
  // Parse the canonical awesome-mcp-servers README for GitHub URLs
  const rawUrl = "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md";
  try {
    const res = await fetch(rawUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const text = await res.text();
    // Extract GitHub repo links from markdown
    const linkRe = /\[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)/g;
    const seen = new Set();
    const results = [];
    let m;
    while ((m = linkRe.exec(text)) !== null) {
      const [, name, url] = m;
      const cleanUrl = url.replace(/\.git$/, "").replace(/\/$/, "");
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      // Only include if URL looks like a real repo (not github.com/topics/...)
      if (!/github\.com\/topics\//.test(cleanUrl) && cleanUrl.split("/").length >= 5) {
        const fullName = cleanUrl.replace("https://github.com/", "");
        results.push({
          tool_name:       name.replace(/^#+\s*/, "").slice(0, 80),
          slug:            fullName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          description:     "", // enricher will fill from README
          url:             cleanUrl,
          github_url:      cleanUrl,
          homepage:        null,
          source_platform: "mcp_registry_awesome",
          publisher:       fullName.split("/")[0],
          license:         null,
          open_source:     true,
          topics:          ["mcp-server"],
          stars:           0,
          forks:           0,
          raw_metadata:    { source: "awesome-mcp-servers" },
        });
      }
    }
    console.log(`  [awesome-mcp] ${results.length} repos parsed from README`);
    return results;
  } catch (e) {
    console.warn("  [awesome-mcp] fetch failed:", e.message);
    return [];
  }
}

/**
 * Discover MCP servers from all available registries.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.verifyUrls=true]
 * @returns {Promise<object[]>}
 */
export async function discoverFromMcpRegistries(opts = {}) {
  const { verifyUrls = true } = opts;
  console.log("  [mcp-registries] Querying all sources...");

  const [mcpSo, smithery, awesome] = await Promise.allSettled([
    fetchMcpSo(),
    fetchSmithery(),
    fetchAwesomeMcp(),
  ]).then(r => r.map(x => x.status === "fulfilled" ? x.value : []));

  // Dedup by github_url then by slug
  const seen = new Set();
  const all  = [];
  for (const batch of [mcpSo, smithery, awesome]) {
    for (const t of batch) {
      const key = t.github_url || t.url || t.slug;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(t);
      }
    }
  }

  console.log(`  [mcp-registries] ${all.length} unique MCP servers`);

  // Verify GitHub URLs (the primary ones — critical for quality)
  if (verifyUrls) {
    let verified = 0;
    for (const t of all) {
      if (t.github_url) {
        const { ok, status } = await verifyUrl(t.github_url).catch(() => ({ ok: false, status: null }));
        t.url_verified = ok;
        t.url_status   = status;
        if (!ok) t.github_url = null; // clear broken URL
        verified++;
        if (verified % 20 === 0) process.stdout.write(`    verified ${verified}/${all.length}\r`);
      }
    }
    process.stdout.write("\n");
    const live = all.filter(t => t.url_verified !== false);
    console.log(`  [mcp-registries] ${live.length} with verified URLs`);
  }

  return all;
}
