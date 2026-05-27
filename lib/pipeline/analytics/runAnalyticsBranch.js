/**
 * Layer 7.2 — Analytics Branch Orchestrator
 *
 * Runs the full analytics branch. Contains one optional LLM call
 * (visualization recommendations, disabled by default).
 *
 * ── PIPELINE STEPS ────────────────────────────────────────────────────────────
 * Step 1 (7.2A): applyAnalyticsTaxonomies  — LLM semantic tagging per source
 *   LLM call:  callLLM() via analyticsTaxonomy.js
 *   Keys:      any OPENAI/GROQ/GEMINI key; Groq degrades to JSON mode
 *   Output:    7 controlled-vocab enum fields per source
 *   Fallback:  rule-based mapping from source_type + trust_tier
 *   Label:     "Layer7.2A-analytics-<source_id>", concurrency: 5
 *
 * Step 2 (7.2B): aggregateAnalytics  — fully deterministic, no LLM
 *   Produces:  category counts, source type counts, attack vector frequencies,
 *              maturity distributions, monthly timelines, trust tier distributions
 *
 * Step 3 (7.2C): generateVisualizationSpecs  — fully deterministic, no LLM
 *   Produces:  12+ chart-ready visualization specs (bar, stacked bar, heatmap,
 *              radar, matrix, timeline)
 *
 * ── OPTIONAL LLM CALL (disabled by default) ──────────────────────────────────
 * runVisualizationRecommendations() — recommends which charts to use per slide section
 *   Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 *   Keys:    any OPENAI/GROQ/GEMINI key
 *   Trigger: skipVizRecommendation=false (default: true — opt-in only)
 *   Output:  structured JSON (VIZ_RECOMMENDATION_SCHEMA):
 *            recommendations[{visualization_id, recommended_slide_use, why_useful, priority}]
 *   System prompt: "You are recommending visualizations for a strategic AI-cyber horizon scan
 *                   slide deck. Only reference visualization IDs that actually exist." (inline)
 *   User prompt: available viz IDs, category counts, top attack vectors, signal clusters,
 *                total sources, date range — asks for per-section recommendations
 *   Label:   "Layer7.2C-viz-recommendation"
 *   Fallback: empty recommendations array (LLM failure silently ignored)
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * { analytics_sources, aggregates, visualization_specs, viz_recommendations,
 *   counts, analytics_version }
 * Analytics runs on ALL sources (not just high-priority rawfact sources).
 */

import { writeFile, mkdir } from "fs/promises";
import { join }             from "path";

import { applyAnalyticsTaxonomies } from "./analyticsTaxonomy.js";
import { aggregateAnalytics }       from "./analyticsAggregation.js";
import { generateVisualizationSpecs } from "./visualizationSpecs.js";
import { callLLM }                  from "../../llm/callLLM.js";

export const ANALYTICS_VERSION = "analytics-v1.0";

// ── Optional: Visualization recommendation prompt ─────────────────────────────

const VIZ_RECOMMENDATION_SCHEMA = {
  type: "object",
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        required: ["visualization_id", "recommended_slide_use", "why_useful", "priority"],
        properties: {
          visualization_id:      { type: "string" },
          recommended_slide_use: { type: "string" },
          why_useful:            { type: "string" },
          priority:              { type: "string", enum: ["high","medium","low"] },
        },
      },
    },
  },
};

async function runVisualizationRecommendations(aggregates, specs) {
  const vizIds = specs.map((s) => s.visualization_id).join(", ");
  const topVectors  = Object.entries(aggregates.attack_vector_frequency)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k).join(", ");
  const topClusters = Object.entries(aggregates.signal_cluster_counts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k).join(", ");

  const systemPrompt = `You are recommending visualizations for a strategic AI-cyber horizon scan slide deck.
Only reference visualization IDs that actually exist. Do not invent data.
Return strict JSON only.`;

  const userPrompt = [
    `AVAILABLE VISUALIZATION IDs: ${vizIds}`,
    ``,
    `CATEGORY COUNTS: ${JSON.stringify(aggregates.category_counts)}`,
    `TOP ATTACK VECTORS: ${topVectors}`,
    `TOP SIGNAL CLUSTERS: ${topClusters}`,
    `TOTAL SOURCES: ${aggregates.total_sources}`,
    `DATE RANGE: ${aggregates.date_range?.start} to ${aggregates.date_range?.end}`,
    ``,
    `Recommend which visualizations are most useful for:`,
    `- executive overview slides`,
    `- each threat category section`,
    `- early signals section`,
    `- 6-month outlook section`,
    `- appendix/reference`,
    ``,
    `Return JSON:`,
    `{ "recommendations": [{ "visualization_id": "", "recommended_slide_use": "", "why_useful": "", "priority": "high|medium|low" }] }`,
  ].join("\n");

  const raw = await callLLM(systemPrompt, userPrompt, {
    schema:   VIZ_RECOMMENDATION_SCHEMA,
    logLabel: "Layer7.2C-viz-recommendation",
  });
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
}

// ── Debug file saver ──────────────────────────────────────────────────────────

async function saveDebugFiles(saveTo, analytics_sources, aggregates, visualization_specs, viz_recommendations) {
  try {
    await mkdir(saveTo, { recursive: true });

    await writeFile(
      join(saveTo, "analytics_taxonomy_outputs.json"),
      JSON.stringify(
        analytics_sources.map((s) => ({
          id:                s.id,
          title:             s.title,
          source_type:       s.source_type,
          main_category:     s.main_category,
          analytics_taxonomy:s.analytics_taxonomy,
        })),
        null, 2
      )
    );

    await writeFile(
      join(saveTo, "analytics_aggregates.json"),
      JSON.stringify(aggregates, null, 2)
    );

    await writeFile(
      join(saveTo, "analytics_visualization_specs.json"),
      JSON.stringify(visualization_specs, null, 2)
    );

    if (viz_recommendations.length > 0) {
      await writeFile(
        join(saveTo, "analytics_visualization_recommendations.json"),
        JSON.stringify(viz_recommendations, null, 2)
      );
    }
  } catch (err) {
    process.stdout.write(`  [Layer 7.2] Warning: could not save debug files: ${err.message}\n`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full Layer 7.2 Analytics Branch.
 *
 * @param {object[]} sources - Layer-5/6/7.1-enriched sources
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]          - Skip all LLM calls (taxonomy + viz recommendation).
 * @param {boolean}  [opts.skipVizRecommendation=true] - Skip optional viz recommendation LLM call.
 * @param {number}   [opts.concurrency=5]           - LLM concurrency for taxonomy.
 * @param {string}   [opts.saveTo=null]             - Directory to save debug JSON files.
 * @returns {Promise<AnalyticsBranchResult>}
 */
export async function runAnalyticsBranch(sources, opts = {}) {
  const {
    skipLlm = false,
    skipVizRecommendation = true,
    concurrency = 5,
    saveTo = null,
  } = opts;

  if (sources.length === 0) {
    return {
      analytics_sources:       [],
      aggregates:              { total_sources: 0 },
      visualization_specs:     [],
      visualization_recommendations: [],
      counts:                  { total: 0, taxonomy_done: 0, categories: {}, source_types: {}, visualizations: 0 },
      analytics_version:       ANALYTICS_VERSION,
    };
  }

  // ── Layer 7.2A — Analytics taxonomy ─────────────────────────────────────────
  process.stdout.write("  [Layer 7.2A] Analytics taxonomy...\n");
  const analytics_sources = await applyAnalyticsTaxonomies(sources, { skipLlm, concurrency });
  const taxonomyDone = analytics_sources.filter((s) => s.analytics_taxonomy).length;
  process.stdout.write(`    ${taxonomyDone}/${sources.length} sources tagged\n`);

  // ── Layer 7.2B — Aggregation ─────────────────────────────────────────────────
  process.stdout.write("  [Layer 7.2B] Analytics aggregation...\n");
  const aggregates = aggregateAnalytics(analytics_sources);
  process.stdout.write(
    `    categories: ${JSON.stringify(aggregates.category_counts)}  ` +
    `months: ${aggregates.date_range?.months || 0}\n`
  );

  // ── Layer 7.2C — Visualization specs ─────────────────────────────────────────
  process.stdout.write("  [Layer 7.2C] Generating visualization specs...\n");
  const visualization_specs = generateVisualizationSpecs(aggregates, analytics_sources);
  process.stdout.write(`    Generated ${visualization_specs.length} visualization specs\n`);

  // ── Optional: Visualization recommendations ───────────────────────────────────
  let visualization_recommendations = [];
  if (!skipLlm && !skipVizRecommendation) {
    try {
      process.stdout.write("  [Layer 7.2C] Visualization recommendations (LLM)...\n");
      visualization_recommendations = await runVisualizationRecommendations(aggregates, visualization_specs);
    } catch (err) {
      process.stdout.write(`    Visualization recommendation LLM failed: ${err.message} — skipping\n`);
    }
  }

  // ── Save debug outputs ────────────────────────────────────────────────────────
  if (saveTo) {
    await saveDebugFiles(saveTo, analytics_sources, aggregates, visualization_specs, visualization_recommendations);
    process.stdout.write(`    Debug files saved to ${saveTo}\n`);
  }

  // ── Counts ────────────────────────────────────────────────────────────────────
  const counts = {
    total:           sources.length,
    taxonomy_done:   taxonomyDone,
    categories:      aggregates.category_counts,
    source_types:    aggregates.source_type_counts,
    visualizations:  visualization_specs.length,
    timeline_events: (aggregates.timeline_events || []).length,
    months:          aggregates.date_range?.months || 0,
  };

  return {
    analytics_sources,
    aggregates,
    visualization_specs,
    visualization_recommendations,
    counts,
    analytics_version: ANALYTICS_VERSION,
  };
}
