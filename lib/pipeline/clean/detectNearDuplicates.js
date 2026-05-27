/**
 * Near-duplicate detection using title token similarity.
 *
 * Identifies pairs of sources whose titles are highly similar but not
 * identical — e.g. the same story published by two outlets with slightly
 * different headlines, or the same advisory mirrored across feeds.
 *
 * Algorithm:
 *   1. Tokenise each title (lowercase alpha-only tokens, stopwords removed).
 *   2. Build an inverted index: token → [source indices].
 *   3. For each source, collect candidate pairs sharing ≥ MIN_SHARED_TOKENS.
 *   4. Compute Jaccard similarity for each candidate pair.
 *   5. Pairs above `threshold` are near-duplicates; keep the higher-quality one.
 *
 * Quality tiebreak: same scoring formula as dedupe.js (trust tier + text
 * richness + date reliability + CVE presence).
 *
 * Complexity: O(n · k) where k is the average candidate set per source.
 * For 5 000 sources at threshold 0.85, k is typically < 20.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "of", "to", "is", "are",
  "was", "were", "by", "with", "as", "from", "that", "this", "it", "its",
  "be", "or", "and", "not", "but", "no", "new", "has", "have", "had",
  "how", "why", "what", "when", "who", "via", "per", "vs", "about",
  "over", "after", "before", "can", "will", "may", "using",
]);

const MIN_SHARED_TOKENS = 3;
const DEFAULT_THRESHOLD = 0.85;

const TIER_QUALITY = { primary: 50, curated: 45, high: 40, medium: 25, low: 10, unknown: 5 };

function qualityScore(source) {
  let score = TIER_QUALITY[source.trust_tier] ?? 5;
  const len = source.full_text?.length ?? 0;
  if (len > 1000)      score += 20;
  else if (len > 500)  score += 12;
  else if (len > 200)  score += 6;
  if (source.date_published) score += 8;
  const conf = source.date_confidence || source.collection_metadata?.date_confidence;
  if (conf === "exact")     score += 5;
  else if (conf === "estimated") score += 2;
  if (/CVE-\d{4}-\d+/i.test(`${source.title ?? ""} ${source.full_text ?? ""}`)) score += 8;
  return score;
}

function tokenise(title = "") {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let shared = 0;
  for (const t of setA) { if (setB.has(t)) shared++; }
  return shared / (setA.size + setB.size - shared);
}

/**
 * Detect near-duplicate sources and keep the highest-quality representative.
 *
 * @param {object[]} sources
 * @param {object}   [options]
 * @param {number}   [options.threshold=0.85]  Jaccard threshold (0–1)
 * @returns {{ kept: object[], removed: NearDupRecord[] }}
 */
export function detectNearDuplicates(sources, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  // Build per-source token sets and inverted index
  const tokenSets = sources.map((s) => new Set(tokenise(s.title)));
  const invertedIndex = new Map();   // token → Set of source indices

  for (let i = 0; i < sources.length; i++) {
    for (const token of tokenSets[i]) {
      if (!invertedIndex.has(token)) invertedIndex.set(token, new Set());
      invertedIndex.get(token).add(i);
    }
  }

  // For each pair that shares ≥ MIN_SHARED_TOKENS, compute full Jaccard
  const removedIndices = new Set();   // indices of losers
  const removed = [];

  for (let i = 0; i < sources.length; i++) {
    if (removedIndices.has(i)) continue;

    // Collect candidate indices via inverted index
    const candidateCounts = new Map();
    for (const token of tokenSets[i]) {
      for (const j of (invertedIndex.get(token) ?? [])) {
        if (j <= i) continue;                       // only check forward pairs
        if (removedIndices.has(j)) continue;
        candidateCounts.set(j, (candidateCounts.get(j) ?? 0) + 1);
      }
    }

    for (const [j, sharedCount] of candidateCounts) {
      if (sharedCount < MIN_SHARED_TOKENS) continue;

      const sim = jaccard(tokenSets[i], tokenSets[j]);
      if (sim < threshold) continue;

      // Near-duplicate found — keep the higher-quality source
      const scoreI = qualityScore(sources[i]);
      const scoreJ = qualityScore(sources[j]);
      const loserIdx = scoreI >= scoreJ ? j : i;
      const keeperIdx = loserIdx === j ? i : j;

      if (!removedIndices.has(loserIdx)) {
        removedIndices.add(loserIdx);
        removed.push({
          removed_id:  sources[loserIdx].id,
          removed_title: sources[loserIdx].title,
          kept_id:     sources[keeperIdx].id,
          kept_title:  sources[keeperIdx].title,
          similarity:  Math.round(sim * 100) / 100,
          reason:      "near_duplicate_title",
        });
      }
    }
  }

  const kept = sources.filter((_, i) => !removedIndices.has(i));
  return { kept, removed };
}
