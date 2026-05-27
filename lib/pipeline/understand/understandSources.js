/**
 * Layer 5 — Batch source taxonomy + LLM understanding.
 *
 * Processes sources through understandSource() with bounded concurrency.
 * Already-processed sources (stamped with TAXONOMY_VERSION) are returned
 * unchanged without calling the LLM.
 */

import { understandSource, TAXONOMY_VERSION } from "./understandSource.js";

export { TAXONOMY_VERSION };

// Back-compat alias
export const UNDERSTAND_VERSION = TAXONOMY_VERSION;

const DEFAULT_CONCURRENCY = 5;

/**
 * @param {object[]} sources - Cleaned sources from Layer 4.
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]
 * @param {number}   [opts.concurrency=5]
 * @param {Function} [opts.onProgress] - Called with (done, total).
 * @returns {Promise<{ sources: object[], counts: object }>}
 */
export async function understandSources(sources, opts = {}) {
  const {
    skipLlm     = false,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress  = null,
  } = opts;

  const results = new Array(sources.length);

  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((source) => understandSource(source, { skipLlm }))
    );
    for (let j = 0; j < batch.length; j++) {
      results[i + j] = batchResults[j];
    }
    if (onProgress) {
      onProgress(Math.min(i + concurrency, sources.length), sources.length);
    }
  }

  const alreadyDone   = sources.filter((s) => s.taxonomy_version === TAXONOMY_VERSION).length;
  const newResults    = results.filter((_, i) => sources[i].taxonomy_version !== TAXONOMY_VERSION);
  const llmProcessed  = newResults.filter((r) => r.understanding?.llm_used === true).length;
  const fallback      = newResults.filter((r) => r.understanding?.llm_used === false).length;

  return {
    sources: results,
    counts: {
      total:         sources.length,
      already_done:  alreadyDone,
      llm_processed: llmProcessed,
      fallback,
    },
  };
}
