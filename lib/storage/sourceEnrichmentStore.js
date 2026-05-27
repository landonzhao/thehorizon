/**
 * Source enrichment persistence — write Layer 5 + Layer 6 results back to
 * the Supabase `sources` table.
 *
 * Layer 5 (taxonomy) sets: source_type, intelligence (taxonomy payload), taxonomy_version.
 * Layer 6 (classification) sets: main_category, classification_confidence, classify_version.
 *
 * Uses UPDATE so intelligence data is refreshed on re-enrichment. Only writes
 * sources that have been processed by at least Layer 5 and have a valid `id`.
 *
 * Graceful degradation: if the understand_version column is missing (migration
 * not yet run), logs a warning and returns without throwing.
 */

import { supabase } from "./supabaseClient.js";
import { TAXONOMY_VERSION } from "../pipeline/understand/understandSources.js";

let enrichColumnsAvailable = true;

const BATCH_SIZE = 50;

function buildEnrichmentRow(source) {
  return {
    // Layer 5 fields
    understand_version:     source.taxonomy_version || source.understand_version || null,
    source_type:            source.source_type            || null,
    intelligence:           source.understanding          || null,
    claim_extraction_status: source.taxonomy_version ? "success" : null,

    // Layer 6 fields (set when classifyCategory has run)
    main_category:          source.main_category          || null,
  };
}

/**
 * Persist Layer 5 + 6 enrichment results for a batch of sources.
 *
 * Only writes sources that have a `taxonomy_version` stamp (Layer 5 ran) and a
 * non-empty `id`. Sources pre-stamped on input are still written — Layer 6 may
 * have updated `main_category` even if Layer 5 was a no-op this run.
 *
 * @param {object[]} sources - Output of understandSources() passed through classifySources().
 * @returns {Promise<{ updated: number, skipped: number }>}
 */
export async function persistUnderstandResults(sources) {
  if (!enrichColumnsAvailable) {
    return { updated: 0, skipped: sources.length };
  }

  const enriched = sources.filter(
    (s) => s.id && (s.taxonomy_version === TAXONOMY_VERSION || s.understand_version === TAXONOMY_VERSION)
  );

  if (enriched.length === 0) {
    return { updated: 0, skipped: sources.length };
  }

  let updated = 0;

  for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
    const batch = enriched.slice(i, i + BATCH_SIZE);

    for (const source of batch) {
      const { error } = await supabase
        .from("sources")
        .update(buildEnrichmentRow(source))
        .eq("id", source.id);

      if (error) {
        if (error.code === "42703") {
          enrichColumnsAvailable = false;
          console.warn(
            "understand_version column missing — run docs/migrations/taxonomy-layer5.sql"
          );
          return { updated, skipped: sources.length - updated };
        }
        throw error;
      }

      updated++;
    }
  }

  return { updated, skipped: sources.length - enriched.length };
}
