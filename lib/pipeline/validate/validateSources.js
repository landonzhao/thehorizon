/**
 * Layer 2 — Batch Source Validation
 *
 * Runs validateSource() over a set of raw sources with bounded concurrency
 * to avoid exhausting the network with simultaneous HEAD requests.
 *
 * Returns sources split into three buckets:
 *   valid      — passed all hard gates; ready for Layer 3 (Archive)
 *   invalid    — failed a hard gate; dropped from this run
 *   duplicates — already archived; skipped to avoid redundant processing
 *
 * Attach the validation result onto each valid source so downstream layers
 * can read publisher, published_date, relevance tier, and flags directly.
 */

import { validateSource } from "./validateSource.js";

const CONCURRENCY = 20;

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * @param {object[]} sources   Normalised sources from Layer 1
 * @param {object}   context
 * @param {Set<string>} [context.knownIds]           Source IDs already archived
 * @param {Set<string>} [context.knownContentHashes] Content hashes already archived
 * @returns {Promise<ValidationBatch>}
 */
export async function validateSources(sources, context = {}) {
  const validations = await runWithConcurrency(
    sources.map((source) => () => validateSource(source, context)),
    CONCURRENCY
  );

  const valid      = [];
  const invalid    = [];
  const duplicates = [];

  for (let i = 0; i < sources.length; i++) {
    const v = validations[i];

    if (v.is_duplicate) {
      duplicates.push({ source: sources[i], validation: v });
    } else if (v.is_valid) {
      // Attach the validation result so downstream layers can access it
      valid.push({ ...sources[i], validation: v });
    } else {
      invalid.push({ source: sources[i], validation: v });
    }
  }

  return {
    valid,
    invalid,
    duplicates,
    counts: {
      total:      sources.length,
      valid:      valid.length,
      invalid:    invalid.length,
      duplicates: duplicates.length,
    },
    validations,
  };
}
