/**
 * Layer 7.1 — Rawfact Branch Orchestrator
 *
 * Runs all rawfact pipeline steps in order. Contains no direct LLM calls —
 * LLM calls are delegated to rawfactTaxonomy.js (Step 1) and extractRawfacts.js (Step 2).
 *
 * ── PIPELINE STEPS ────────────────────────────────────────────────────────────
 * Step 1 (7.1A): applyRawfactTaxonomies  — LLM or deterministic taxonomy tagging
 *   LLM call:  callLLM() via rawfactTaxonomy.js
 *   Keys:      any OPENAI/GROQ/GEMINI key; Groq degrades to JSON mode
 *   Fallback:  rule-based taxonomy from source_type + trust_tier
 *   Label:     "Layer7.1A-taxonomy-<source_id>", concurrency: 5
 *
 * Step 2 (7.1B): extractRawfacts  — LLM evidence cards for high-priority sources only
 *   LLM call:  callLLM() via extractRawfacts.js
 *   Keys:      any OPENAI/GROQ/GEMINI key
 *   Trigger:   operational_relevance very_high/high OR feed_priority must_read/high
 *   Fallback:  null evidence_card (source skipped, not failed)
 *   Label:     "Layer7.1B-evidence-<source_id>", concurrency: 5
 *
 * Step 3 (7.1C): scoreRawfacts  — deterministic scoring, pre-clustering
 *   Formula:   common_base(0–40) + type_specific(0–45) + horizon_bonus(0–15) - penalties
 *   Priority:  must_read ≥ 85 | high 70–84 | medium 50–69 | low 30–49 | archive_only < 30
 *   No LLM.
 *
 * Step 4 (7.1D): clusterRawfacts  — Jaccard title similarity within categories
 *   Algorithm: union-find, SIMILARITY_THRESHOLD = 0.35, within-category only
 *   Representative: highest rawfact_score in each cluster
 *   No LLM.
 *
 * Step 5 (7.1C re-run): scoreRawfacts  — apply -10 duplicate penalty to non-representatives
 *   The two-pass scoring is intentional: the first pass produces initial scores
 *   so clustering can identify the best representative; the second pass applies
 *   the penalty to the remaining members of multi-source clusters.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { rawfact_sources: object[], counts: object, rawfact_version: string }
 * Each source gains: rawfact_taxonomy, evidence_card, rawfact_score_data, rawfact_cluster
 */

import { applyRawfactTaxonomies } from "./rawfactTaxonomy.js";
import { extractRawfacts }        from "./extractRawfacts.js";
import { scoreRawfacts }          from "./scoreRawfacts.js";
import { clusterRawfacts, summarizeClusters } from "./clusterRawfacts.js";

export const RAWFACT_VERSION = "rawfact-v1.0";

/**
 * Run the full rawfact branch.
 *
 * @param {object[]} sources - Sources from Layer 3+ (must have source_type, main_category, trust_tier).
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]   - Skip all LLM calls (deterministic only).
 * @param {number}   [opts.concurrency=5]   - Max parallel LLM calls per layer.
 * @param {string}   [opts.saveTo=null]     - If set, write debug JSON files to this directory.
 * @returns {Promise<{ rawfact_sources: object[], counts: object, rawfact_version: string }>}
 */
export async function runRawfactBranch(sources, opts = {}) {
  const { skipLlm = false, concurrency = 5, saveTo = null } = opts;

  // ── Step 1: Rawfact taxonomy (7.1A) ─────────────────────────────────────────
  process.stdout.write(`[rawfact] Step 1/5 — taxonomy (${sources.length} sources, skipLlm=${skipLlm})\n`);
  const withTaxonomy = await applyRawfactTaxonomies(sources, { skipLlm, concurrency });

  // ── Step 2: Evidence extraction (7.1B) ──────────────────────────────────────
  process.stdout.write(`[rawfact] Step 2/5 — evidence extraction\n`);
  const withEvidence = await extractRawfacts(withTaxonomy, { skipLlm, concurrency });

  // ── Step 3: Initial scoring (7.1C) — before clustering, no duplicate penalty yet ─
  process.stdout.write(`[rawfact] Step 3/5 — initial scoring\n`);
  const withScores = scoreRawfacts(withEvidence);

  // ── Step 4: Clustering (7.1D) ───────────────────────────────────────────────
  process.stdout.write(`[rawfact] Step 4/5 — clustering\n`);
  const withClusters    = clusterRawfacts(withScores);
  const clusterSummary  = summarizeClusters(withClusters);

  // ── Step 5: Duplicate-adjusted scoring ──────────────────────────────────────
  // Re-score after clustering so non-representative duplicates receive the -10 penalty.
  process.stdout.write(`[rawfact] Step 5/5 — duplicate-adjusted scoring\n`);
  const final = scoreRawfacts(withClusters);

  // ── Build counts ─────────────────────────────────────────────────────────────
  const counts = {
    total:               final.length,
    taxonomy_done:       final.filter((s) => s.rawfact_taxonomy?.rawfact_taxonomy_version).length,
    evidence_cards:      final.filter((s) => s.evidence_card !== null && s.evidence_card !== undefined).length,
    must_read:           final.filter((s) => s.rawfact_score_data?.rawfact_priority === "must_read").length,
    high:                final.filter((s) => s.rawfact_score_data?.rawfact_priority === "high").length,
    medium:              final.filter((s) => s.rawfact_score_data?.rawfact_priority === "medium").length,
    low:                 final.filter((s) => s.rawfact_score_data?.rawfact_priority === "low").length,
    archive_only:        final.filter((s) => s.rawfact_score_data?.rawfact_priority === "archive_only").length,
    clusters:            clusterSummary.total_clusters,
    multi_source_clusters: clusterSummary.multi_source_clusters,
  };

  process.stdout.write(
    `[rawfact] Done — must_read=${counts.must_read} high=${counts.high} medium=${counts.medium} ` +
    `low=${counts.low} archive_only=${counts.archive_only} clusters=${counts.clusters}\n`
  );

  // ── Optional debug output ─────────────────────────────────────────────────────
  if (saveTo) {
    const { writeFileSync, mkdirSync } = await import("fs");
    mkdirSync(saveTo, { recursive: true });

    writeFileSync(
      `${saveTo}/rawfact_taxonomy_outputs.json`,
      JSON.stringify(
        final.map((s) => ({ id: s.id, title: s.title, rawfact_taxonomy: s.rawfact_taxonomy })),
        null, 2
      )
    );

    writeFileSync(
      `${saveTo}/rawfact_evidence_cards.json`,
      JSON.stringify(
        final
          .filter((s) => s.evidence_card)
          .map((s) => ({ id: s.id, title: s.title, evidence_card: s.evidence_card })),
        null, 2
      )
    );

    writeFileSync(
      `${saveTo}/rawfact_scored_sources.json`,
      JSON.stringify(
        final.map((s) => ({ id: s.id, title: s.title, rawfact_score_data: s.rawfact_score_data })),
        null, 2
      )
    );

    writeFileSync(
      `${saveTo}/rawfact_clusters.json`,
      JSON.stringify(
        final.map((s) => ({ id: s.id, title: s.title, rawfact_cluster: s.rawfact_cluster })),
        null, 2
      )
    );

    process.stdout.write(`[rawfact] Debug files written to ${saveTo}\n`);
  }

  return {
    rawfact_sources: final,
    counts,
    rawfact_version: RAWFACT_VERSION,
  };
}
