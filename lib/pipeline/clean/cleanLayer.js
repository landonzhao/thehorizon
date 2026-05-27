/**
 * Layer 4 — Cleaning + Deduplication
 *
 * Orchestrates the three-step cleaning pipeline:
 *   1. Text cleaning   — normalise whitespace, strip HTML/LaTeX/boilerplate,
 *                        extract code blocks and IOCs (idempotent, version-stamped)
 *   2. Exact dedup     — collapse sources that share canonical URL, normalised
 *                        title, or content hash; keep the highest-quality copy
 *   3. Near-title dedup — collapse sources whose titles have Jaccard similarity
 *                        above `nearDupThreshold`; keep the highest-quality copy
 *
 * Input: sources loaded from the Layer 3 archive (may already be cleaned if
 *   they arrived via the daily cron — cleanSources() is idempotent and will
 *   skip sources already stamped with the current CLEANING_VERSION).
 *
 * Output: `{ clean_sources, counts, removed_exact, removed_near }` — the
 *   pipeline.md `clean_sources` array plus an audit trail of what was removed.
 */

import { cleanSources, CLEANING_VERSION } from "./cleanSources.js";
import { dedupeSources } from "../../utils/dedupe.js";
import { detectNearDuplicates } from "./detectNearDuplicates.js";

export { CLEANING_VERSION };

/**
 * Run the full Layer 4 cleaning and deduplication pass.
 *
 * @param {object[]} sources
 *   Sources from the Layer 3 archive. Each must have at least `title`, `url`,
 *   and `full_text` (or `raw_text`). Sources with `cleaning_version` already
 *   set to CLEANING_VERSION are skipped in the text-cleaning step.
 *
 * @param {object}  [options]
 * @param {number}  [options.nearDupThreshold=0.85]
 *   Jaccard similarity threshold for near-title deduplication.
 *   0.85 catches near-identical headlines; lower values collapse more aggressively.
 *   Set to 1.0 to disable near-dup detection entirely.
 * @param {boolean} [options.skipNearDup=false]
 *   Convenience flag to skip near-duplicate detection (same as threshold = 1.0).
 *
 * @returns {CleaningResult}
 */
export function runCleaningLayer(sources, options = {}) {
  const nearDupThreshold = options.skipNearDup ? 1.0 : (options.nearDupThreshold ?? 0.85);

  if (sources.length === 0) {
    return {
      clean_sources: [],
      counts: { input: 0, after_clean: 0, after_exact_dedup: 0, after_near_dedup: 0 },
      removed_exact: [],
      removed_near: [],
      cleaning_version: CLEANING_VERSION,
    };
  }

  // ── Step 1: Text cleaning ──────────────────────────────────────────────────
  const cleaned = cleanSources(sources);

  // ── Step 2: Exact deduplication ────────────────────────────────────────────
  // dedupeSources sorts by quality and collapses on canonical URL, normalised
  // title, and content hash. Returns a smaller array of distinct sources.
  const exactDeduped = dedupeSources(cleaned);
  const removedByExactDedup = cleaned.length - exactDeduped.length;

  // Build a removed-exact audit list by diffing IDs
  const keptIds = new Set(exactDeduped.map((s) => s.id));
  const removed_exact = cleaned
    .filter((s) => !keptIds.has(s.id))
    .map((s) => ({
      removed_id:    s.id,
      removed_title: s.title,
      reason:        "exact_duplicate",
    }));

  // ── Step 3: Near-title deduplication ──────────────────────────────────────
  const { kept, removed: removed_near } = detectNearDuplicates(exactDeduped, {
    threshold: nearDupThreshold,
  });

  return {
    // Pipeline.md Layer 4 output key
    clean_sources: kept,

    counts: {
      input:            sources.length,
      after_clean:      cleaned.length,        // same as input (cleaning is non-destructive)
      after_exact_dedup: exactDeduped.length,
      after_near_dedup:  kept.length,
    },

    removed_exact,
    removed_near,
    cleaning_version: CLEANING_VERSION,
  };
}
