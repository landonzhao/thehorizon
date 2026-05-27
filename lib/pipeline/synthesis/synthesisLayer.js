/**
 * Layer 6 — Synthesis Orchestrator
 *
 * Top-level orchestrator for all synthesis sublayers. Contains no direct LLM calls —
 * all LLM calls are delegated to branch orchestrators.
 *
 * ── PIPELINE STEPS ────────────────────────────────────────────────────────────
 * Layer 6.1 — Rawfact branch (lib/pipeline/rawfact/runRawfactBranch.js)
 *   7.1A: Rawfact taxonomy   — LLM or deterministic (callLLM via rawfactTaxonomy.js)
 *   7.1B: Evidence cards     — LLM for high-priority sources (callLLM via extractRawfacts.js)
 *   7.1C: Rawfact scoring    — deterministic, source-type-specific, 2 passes
 *   7.1D: Rawfact clustering — deterministic Jaccard, within-category
 *
 * Layer 6.2 — Analytics branch (lib/pipeline/analytics/runAnalyticsBranch.js)
 *   7.2A: Analytics taxonomy    — LLM or deterministic (callLLM via analyticsTaxonomy.js)
 *   7.2B: Analytics aggregation — deterministic counts/distributions
 *   7.2C: Visualization specs   — deterministic chart specs
 *   (optional: viz recommendations — callLLM, skipVizRecommendation=true by default)
 *
 * Layer 6.3 — Analysis layer (lib/pipeline/analysis/runAnalysisLayer.js)
 *   8A: Dossier builder       — deterministic evidence selection
 *   8B: Category analysis     — LLM per category (OPENAI/GEMINI only, not Groq)
 *   8C: Evidence linking      — deterministic evidence_id resolution
 *   8D: Analysis QA           — deterministic + optional LLM fact-check
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { feed_sources, analytics: { aggregates, visualization_specs },
 *   category_analyses[], dossiers[], viewpoints: [],
 *   counts: { total_sources, high_priority, evidence_cards, clusters, insights,
 *             early_signals, viewpoints, rawfact, analysis_summary, qa_report },
 *   synthesis_version }
 *
 * viewpoints[] is always empty — kept for backward compatibility with slides/QA layers.
 * dossiers[] is threaded through to slidesLayer.js for rawfact evidence access.
 */

import { runRawfactBranch }   from "../rawfact/runRawfactBranch.js";
import { runAnalyticsBranch } from "../analytics/runAnalyticsBranch.js";
import { runAnalysisLayer }   from "../analysis/runAnalysisLayer.js";

export const SYNTHESIS_VERSION = "synthesis-v7.1";

/**
 * Run the full Layer 6 synthesis pipeline.
 *
 * @param {object[]} sources - Layer-5-enriched sources (`understand_version` set).
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]  - Skip all LLM calls (evidence + synthesis).
 * @returns {Promise<SynthesisResult>}
 */
export async function runSynthesisLayer(sources, opts = {}) {
  const { skipLlm = false } = opts;

  if (sources.length === 0) {
    return {
      feed_sources:       [],
      analytics:          { aggregates: {}, visualization_specs: [] },
      category_analyses:  [],
      viewpoints:         [],
      counts:             { total_sources: 0, high_priority: 0, evidence_cards: 0, clusters: 0, viewpoints: 0 },
      synthesis_version:  SYNTHESIS_VERSION,
    };
  }

  // ── Layer 6.1 — Rawfact branch ────────────────────────────────────────────
  process.stdout.write("  [Layer 6.1] Rawfact branch (taxonomy → evidence → scoring → clustering)...\n");
  const { rawfact_sources: withClusters, counts: rawfactCounts } =
    await runRawfactBranch(sources, { skipLlm });
  process.stdout.write(
    `    must_read=${rawfactCounts.must_read} high=${rawfactCounts.high} ` +
    `medium=${rawfactCounts.medium} low=${rawfactCounts.low} ` +
    `clusters=${rawfactCounts.clusters}\n`
  );

  // ── Layer 6.2 / 7.2 — Analytics branch ───────────────────────────────────────
  process.stdout.write("  [Layer 7.2] Analytics branch (taxonomy → aggregation → visualization)...\n");
  const {
    analytics_sources: withAnalytics,
    aggregates,
    visualization_specs,
    counts: analyticsCounts,
  } = await runAnalyticsBranch(withClusters, { skipLlm });
  process.stdout.write(
    `    categories=${JSON.stringify(analyticsCounts.categories)}  ` +
    `visualizations=${analyticsCounts.visualizations}\n`
  );

  // ── Layer 6.3 / 8 — Analysis layer ──────────────────────────────────────
  process.stdout.write("  [Layer 8] Category analysis (dossier → LLM → evidence linking → QA)...\n");
  const { category_analyses, dossiers, analysis_summary, qa_report } =
    await runAnalysisLayer(withAnalytics, aggregates, { skipLlm });
  process.stdout.write(
    `    ${analysis_summary.total_categories} categories, ` +
    `${analysis_summary.total_insights} insights, ` +
    `${analysis_summary.total_early_signals} early signals\n`
  );

  // ── Counts ────────────────────────────────────────────────────────────────
  const highPriority  = rawfactCounts.must_read + rawfactCounts.high;
  const evidenceCards = rawfactCounts.evidence_cards;

  return {
    feed_sources: withAnalytics,

    analytics: {
      aggregates,
      visualization_specs,
    },

    category_analyses,
    dossiers,

    // viewpoints kept as empty array for backward-compatibility with slides/QA layers
    viewpoints: [],

    counts: {
      total_sources:    sources.length,
      high_priority:    highPriority,
      evidence_cards:   evidenceCards,
      clusters:         rawfactCounts.multi_source_clusters,
      insights:         analysis_summary.total_insights,
      early_signals:    analysis_summary.total_early_signals,
      viewpoints:       0,
      rawfact:          rawfactCounts,
      analysis_summary,
      qa_report,
    },

    synthesis_version: SYNTHESIS_VERSION,
  };
}
