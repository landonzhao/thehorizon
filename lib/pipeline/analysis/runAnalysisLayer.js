/**
 * Layer 8 — Category Analysis Layer Orchestrator
 *
 * Orchestrates all four analysis sublayers. Contains no direct LLM calls —
 * LLM calls are delegated to analyzeCategory.js (8B) and qaCategoryAnalysis.js (8D).
 *
 * ── PIPELINE STEPS ────────────────────────────────────────────────────────────
 * Step 8A: buildAllDossiers — deterministic, no LLM
 *   Selects max 12 rawfact + 4 analytics evidence items per active category.
 *
 * Step 8B: analyzeAllCategories — LLM, one call per active category
 *   Tool:    callLLM() via analyzeCategory.js
 *   Keys:    OPENAI_API_KEY, OPENAI_API_KEY_2, GEMINI_API_KEY, GEMINI_API_KEY_2
 *            (GROQ not used — citation-traced structured output requires schema support)
 *   Trigger: source_count >= 2 AND at least one OPENAI or GEMINI key present
 *   Output:  CATEGORY_ANALYSIS_SCHEMA: category, overview, top_insights(3–5),
 *            early_signals(0–3), outlook, analysis_confidence, key_source_ids
 *   Label:   "Layer8B-<category>"
 *   Fallback: deterministicAnalysis() — one insight per top rawfact item
 *
 * Step 8C: linkAnalysisEvidence — deterministic, no LLM
 *   Resolves "raw_<id>" and "agg_<cat>_<metric>" evidence IDs to full objects.
 *   Builds flat citations[] list per analysis.
 *
 * Step 8D: qaAllCategoryAnalyses — deterministic pass always, optional LLM pass
 *   Deterministic: removes insights with no evidence, too-short text, or missing
 *                  resolved_evidence. Downgrades confidence on low retention rate.
 *   LLM QA (opt-in, skipLlmQa=true by default): fact-checks each insight against
 *            its cited evidence summaries.
 *   Keys:    any OPENAI/GEMINI key (when skipLlmQa=false)
 *   Label:   "Layer8D-qa-<category>"
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { category_analyses[], dossiers[], analysis_summary, qa_report, analysis_version }
 * dossiers[] is returned so the slides layer can access rawfact evidence directly.
 */

import { writeFile, mkdir } from "fs/promises";
import { join }             from "path";

import { buildAllDossiers }        from "./buildCategoryDossier.js";
import { analyzeAllCategories }    from "./analyzeAllCategories.js";
import { linkAnalysisEvidence }    from "./linkAnalysisEvidence.js";
import { qaAllCategoryAnalyses }   from "./qaCategoryAnalysis.js";

export const ANALYSIS_VERSION = "analysis-v1.0";

// ── Summary builder ────────────────────────────────────────────────────────────

function buildAnalysisSummary(categoryAnalyses) {
  const summary = {
    total_categories:       categoryAnalyses.length,
    total_insights:         0,
    total_early_signals:    0,
    categories_with_llm:    0,
    categories_high_confidence: 0,
    per_category: {},
  };

  for (const analysis of categoryAnalyses) {
    summary.total_insights     += (analysis.top_insights || []).length;
    summary.total_early_signals += (analysis.early_signals || []).length;
    if (analysis.llm_used)                        summary.categories_with_llm++;
    if (analysis.analysis_confidence === "high")  summary.categories_high_confidence++;

    summary.per_category[analysis.category] = {
      insights:       (analysis.top_insights || []).length,
      early_signals:  (analysis.early_signals || []).length,
      confidence:     analysis.analysis_confidence,
      llm_used:       analysis.llm_used ?? false,
      citations:      (analysis.citations || []).length,
    };
  }

  return summary;
}

function buildQaRollup(categoryAnalyses) {
  const rollup = {
    total_removed_insights: 0,
    total_retained_insights: 0,
    categories_downgraded: 0,
    per_category: {},
  };

  for (const analysis of categoryAnalyses) {
    const qa = analysis.qa_report;
    if (!qa) continue;

    rollup.total_removed_insights  += qa.removed_insight_count || 0;
    rollup.total_retained_insights += qa.retained_insight_count || 0;
    if (qa.adjusted_confidence !== qa.original_confidence) rollup.categories_downgraded++;

    rollup.per_category[analysis.category] = {
      retained:    qa.retained_insight_count,
      removed:     qa.removed_insight_count,
      llm_qa_run:  qa.llm_qa_run,
    };
  }

  return rollup;
}

// ── Debug file saver ──────────────────────────────────────────────────────────

async function saveDebugFiles(saveTo, dossiers, rawAnalyses, linkedAnalyses, qaAnalyses) {
  try {
    await mkdir(saveTo, { recursive: true });

    await writeFile(
      join(saveTo, "analysis_dossiers.json"),
      JSON.stringify(dossiers, null, 2)
    );
    await writeFile(
      join(saveTo, "analysis_raw_llm_output.json"),
      JSON.stringify(rawAnalyses, null, 2)
    );
    await writeFile(
      join(saveTo, "analysis_linked.json"),
      JSON.stringify(linkedAnalyses, null, 2)
    );
    await writeFile(
      join(saveTo, "analysis_qa_output.json"),
      JSON.stringify(qaAnalyses, null, 2)
    );
  } catch (err) {
    process.stdout.write(`  [Layer 8] Warning: could not save debug files: ${err.message}\n`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full Layer 8 analysis pipeline.
 *
 * @param {object[]} sources    - Sources enriched through rawfact + analytics branches.
 * @param {object}   aggregates - Output of aggregateAnalytics() from Layer 7.2B.
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]    - Skip all LLM calls.
 * @param {boolean}  [opts.skipLlmQa=true]   - Skip optional LLM fact-checking QA.
 * @param {string}   [opts.saveTo=null]      - Directory to save debug JSON files.
 * @returns {Promise<AnalysisLayerResult>}
 */
export async function runAnalysisLayer(sources, aggregates, opts = {}) {
  const { skipLlm = false, skipLlmQa = true, saveTo = null } = opts;

  if (sources.length === 0) {
    return {
      category_analyses: [],
      analysis_summary:  { total_categories: 0, total_insights: 0, total_early_signals: 0 },
      qa_report:         { total_removed_insights: 0, total_retained_insights: 0 },
      analysis_version:  ANALYSIS_VERSION,
    };
  }

  // ── Layer 8A — Build dossiers ───────────────────────────────────────────────
  process.stdout.write("  [Layer 8A] Building category evidence dossiers...\n");
  const dossiers = buildAllDossiers(sources, aggregates);
  process.stdout.write(
    `    ${dossiers.length} active categories: ${dossiers.map((d) => `${d.category}(${d.source_count})`).join(", ")}\n`
  );
  dossiers.forEach((d) =>
    process.stdout.write(
      `    ${d.category}: ${d.rawfact_evidence.length} rawfact items, ${d.analytics_evidence.length} analytics items\n`
    )
  );

  // ── Layer 8B — Category analysis (LLM) ─────────────────────────────────────
  process.stdout.write(`  [Layer 8B] Category analysis (skipLlm=${skipLlm})...\n`);
  const rawAnalyses = await analyzeAllCategories(dossiers, { skipLlm });
  const llmUsed = rawAnalyses.filter((a) => a.llm_used).length;
  process.stdout.write(`    ${rawAnalyses.length} analyses complete (${llmUsed} used LLM)\n`);

  // ── Layer 8C — Evidence linking ─────────────────────────────────────────────
  process.stdout.write("  [Layer 8C] Linking evidence IDs to full citation objects...\n");
  const linkedAnalyses = linkAnalysisEvidence(rawAnalyses, dossiers);
  const totalCitations = linkedAnalyses.reduce((n, a) => n + (a.citations || []).length, 0);
  process.stdout.write(`    ${totalCitations} total citations resolved\n`);

  // ── Layer 8D — QA ───────────────────────────────────────────────────────────
  process.stdout.write(`  [Layer 8D] QA pass (skipLlmQa=${skipLlmQa})...\n`);
  const qaAnalyses = await qaAllCategoryAnalyses(linkedAnalyses, { skipLlmQa });
  const removedTotal = qaAnalyses.reduce((n, a) => n + (a.qa_report?.removed_insight_count || 0), 0);
  const retainedTotal = qaAnalyses.reduce((n, a) => n + (a.qa_report?.retained_insight_count || 0), 0);
  process.stdout.write(`    QA complete: ${retainedTotal} retained, ${removedTotal} removed\n`);

  // ── Build outputs ────────────────────────────────────────────────────────────
  const analysis_summary = buildAnalysisSummary(qaAnalyses);
  const qa_report        = buildQaRollup(qaAnalyses);

  // ── Save debug files ─────────────────────────────────────────────────────────
  if (saveTo) {
    await saveDebugFiles(saveTo, dossiers, rawAnalyses, linkedAnalyses, qaAnalyses);
    process.stdout.write(`    Debug files saved to ${saveTo}\n`);
  }

  return {
    category_analyses: qaAnalyses,
    dossiers,
    analysis_summary,
    qa_report,
    analysis_version: ANALYSIS_VERSION,
  };
}
