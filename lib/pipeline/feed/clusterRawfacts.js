/**
 * Layer 6.1D — Rawfact Clustering
 *
 * Groups related sources into event/topic clusters using deterministic
 * title-word similarity (Jaccard on significant words). Clustering runs
 * within each threat category so a "GPT-4o jailbreak" paper doesn't get
 * merged with a "GPT-4o safety eval" paper from a different threat category.
 *
 * Output: each source gets a `rawfact_cluster` field:
 *   { cluster_id, cluster_size, representative_title, is_multi_source }
 *
 * Multi-source clusters indicate that several sources cover the same underlying
 * event or campaign — the category analysis layer uses this signal to avoid
 * treating corroborating sources as independent data points.
 */

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","being","have","has","had","do",
  "does","did","will","would","could","should","may","might","can","about",
  "new","using","via","how","what","when","where","why","its","it","this",
  "that","these","those","as","into","their","they","them","we","our","more",
  "use","used","based","paper","research","study","survey","analysis","report",
  "approach","framework","model","system","method","technique","toward",
]);

function titleWords(title) {
  return new Set(
    (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Weighted union-find for cluster membership
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  }
  return { find, union };
}

// Similarity threshold: sources sharing ≥35% of their significant title words
// are treated as covering the same event/topic.
const SIMILARITY_THRESHOLD = 0.35;

/**
 * Cluster sources by title similarity within each threat category.
 *
 * @param {object[]} sources - Sources with feed_score_data.
 * @returns {object[]} Sources with `rawfact_cluster` field added.
 */
export function clusterRawfacts(sources) {
  // Group index positions by category
  const indicesByCategory = {};
  for (let i = 0; i < sources.length; i++) {
    const cat = sources[i].main_category || sources[i].understanding?.main_category || "unclear_or_adjacent";
    if (!indicesByCategory[cat]) indicesByCategory[cat] = [];
    indicesByCategory[cat].push(i);
  }

  // Maps global source index → cluster ID string
  const clusterOf = new Array(sources.length);
  // cluster_id → { category, source_ids, representative_title, max_score }
  const clusterMeta = {};
  let clusterSeq = 0;

  for (const [cat, indices] of Object.entries(indicesByCategory)) {
    const wordSets = indices.map((i) => titleWords(sources[i].title));
    const uf = makeUnionFind(indices.length);

    // O(n²) within each category — acceptable for typical category sizes (≤200)
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        if (jaccardSimilarity(wordSets[a], wordSets[b]) >= SIMILARITY_THRESHOLD) {
          uf.union(a, b);
        }
      }
    }

    // Map union-find root → cluster ID
    const rootToId = {};
    for (let a = 0; a < indices.length; a++) {
      const root = uf.find(a);
      if (rootToId[root] === undefined) {
        const cid = `cl_${String(++clusterSeq).padStart(4, "0")}`;
        rootToId[root] = cid;
        clusterMeta[cid] = { category: cat, source_ids: [], representative_title: "", max_score: 0 };
      }
      const cid = rootToId[root];
      clusterOf[indices[a]] = cid;
      clusterMeta[cid].source_ids.push(sources[indices[a]].id);
    }
  }

  // Compute cluster metadata: pick highest-scored source as representative
  for (const [cid, meta] of Object.entries(clusterMeta)) {
    const members = meta.source_ids
      .map((id) => sources.find((s) => s.id === id))
      .filter(Boolean)
      .sort((a, b) => (b.feed_score_data?.feed_score ?? 0) - (a.feed_score_data?.feed_score ?? 0));
    meta.cluster_size = members.length;
    meta.representative_title = members[0]?.title || "";
    meta.max_score = members[0]?.feed_score_data?.feed_score ?? 0;
    meta.is_multi_source = members.length > 1;
  }

  return sources.map((source, i) => {
    const cid = clusterOf[i];
    const meta = clusterMeta[cid];
    return {
      ...source,
      rawfact_cluster: {
        cluster_id:           cid,
        cluster_size:         meta?.cluster_size ?? 1,
        representative_title: meta?.representative_title ?? source.title ?? "",
        is_multi_source:      meta?.is_multi_source ?? false,
      },
    };
  });
}

/**
 * Aggregate cluster statistics across all sources.
 *
 * @param {object[]} clusteredSources - Sources with rawfact_cluster field.
 * @returns {object}
 */
export function summarizeClusters(clusteredSources) {
  const seen = new Set();
  const clusters = [];
  for (const s of clusteredSources) {
    const c = s.rawfact_cluster;
    if (c && !seen.has(c.cluster_id)) {
      seen.add(c.cluster_id);
      clusters.push(c);
    }
  }
  const multi = clusters.filter((c) => c.is_multi_source);
  return {
    total_clusters:      clusters.length,
    multi_source_clusters: multi.length,
    singleton_clusters:  clusters.length - multi.length,
    largest_cluster:     Math.max(0, ...clusters.map((c) => c.cluster_size)),
  };
}
