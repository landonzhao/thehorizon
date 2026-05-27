/**
 * Analysis Layer Debug Script
 *
 * Loads recent sources from Supabase, runs the full rawfact + analytics + analysis
 * pipeline, and prints a structured summary for inspection.
 *
 * Usage:
 *   node scripts/debugAnalysisLayer.js [options]
 *
 * Options:
 *   --limit <n>      Number of sources to sample (default: 100)
 *   --days <n>       Sources from last N days (default: 90)
 *   --category <cat> Filter by main_category
 *   --no-llm         Force deterministic fallback (no API calls)
 *   --llm-qa         Enable optional LLM fact-checking QA pass (default: off)
 *   --save           Save debug JSON files to outputs/debug/
 *   --json           Print full category analyses JSON to stdout
 *   --verbose        Print per-insight evidence chains
 *
 * Examples:
 *   node scripts/debugAnalysisLayer.js
 *   node scripts/debugAnalysisLayer.js --limit 200 --save
 *   node scripts/debugAnalysisLayer.js --category llm_threats --no-llm
 *   node scripts/debugAnalysisLayer.js --json | head -200
 */

import "dotenv/config";
import { createClient }  from "@supabase/supabase-js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { runRawfactBranch }  from "../lib/pipeline/rawfact/runRawfactBranch.js";
import { runAnalyticsBranch } from "../lib/pipeline/analytics/runAnalyticsBranch.js";
import { runAnalysisLayer }  from "../lib/pipeline/analysis/runAnalysisLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; };
const hasFlag = (name) => args.includes(name);

const LIMIT    = parseInt(getArg("--limit",  "100"), 10);
const DAYS     = parseInt(getArg("--days",    "90"), 10);
const CATEGORY = getArg("--category", null);
const NO_LLM   = hasFlag("--no-llm");
const LLM_QA   = hasFlag("--llm-qa");
const SAVE     = hasFlag("--save");
const JSON_OUT = hasFlag("--json");
const VERBOSE  = hasFlag("--verbose");

// ── Supabase ──────────────────────────────────────────────────────────────────

async function loadSources() {
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  let query = sb
    .from("sources")
    .select(
      "id,title,url,publisher,date_published,source_type,main_category,trust_tier," +
      "tags,full_text,clean_text,summary,understanding,ai_specificity_score," +
      "classification_confidence,taxonomy_version,layer3_status,created_at"
    )
    .gte("created_at", since)
    .not("layer3_status", "eq", "reject")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (CATEGORY) query = query.eq("main_category", CATEGORY);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Print helpers ─────────────────────────────────────────────────────────────

function printSummary(categoryAnalyses, summary, qaReport) {
  console.log("\n" + "═".repeat(90));
  console.log("ANALYSIS LAYER DEBUG SUMMARY");
  console.log("═".repeat(90));
  console.log(`Categories analyzed:     ${summary.total_categories}`);
  console.log(`Total insights:          ${summary.total_insights}`);
  console.log(`Total early signals:     ${summary.total_early_signals}`);
  console.log(`LLM used:                ${summary.categories_with_llm} categories`);
  console.log(`High confidence:         ${summary.categories_high_confidence} categories`);
  console.log(`Insights removed by QA:  ${qaReport.total_removed_insights}`);
  console.log(`Categories downgraded:   ${qaReport.categories_downgraded}`);

  for (const analysis of categoryAnalyses) {
    const cat = analysis.category;
    console.log(`\n${"─".repeat(90)}`);
    console.log(`CATEGORY: ${cat.toUpperCase()} (confidence=${analysis.analysis_confidence} llm=${analysis.llm_used ?? false})`);
    console.log(`\nOVERVIEW:`);
    console.log(`  ${analysis.overview}`);

    if (analysis.top_insights?.length > 0) {
      console.log(`\nTOP INSIGHTS (${analysis.top_insights.length}):`);
      for (const [i, ins] of analysis.top_insights.entries()) {
        console.log(`  ${i + 1}. [${ins.confidence}] ${ins.insight}`);
        if (VERBOSE) {
          const cites = (ins.citations || []).map((c) => c.title || c.metric_name).join(", ");
          if (cites) console.log(`     Evidence: ${cites}`);
        }
      }
    }

    if (analysis.early_signals?.length > 0) {
      console.log(`\nEARLY SIGNALS (${analysis.early_signals.length}):`);
      for (const sig of analysis.early_signals) {
        if (!sig.qa_pass && !VERBOSE) continue;
        console.log(`  • ${sig.signal}`);
        console.log(`    → ${sig.implication}`);
      }
    }

    if (analysis.outlook) {
      console.log(`\nOUTLOOK (${analysis.outlook.time_horizon}):`);
      console.log(`  ${analysis.outlook.statement}`);
    }

    if (analysis.citations?.length > 0) {
      console.log(`\nCITATIONS: ${analysis.citations.length} sources linked`);
      if (VERBOSE) {
        for (const c of analysis.citations.slice(0, 5)) {
          if (c.citation_type === "rawfact") {
            console.log(`  [${c.rawfact_priority}] ${c.title} — ${c.publisher} (${c.published_date})`);
          } else {
            console.log(`  [analytics] ${c.metric_name}`);
          }
        }
      }
    }

    if (analysis.qa_report?.removed_insight_count > 0) {
      console.log(`\nQA REMOVED ${analysis.qa_report.removed_insight_count} insights:`);
      for (const r of (analysis.qa_report.removed_insights || [])) {
        console.log(`  - "${r.insight?.slice(0, 80)}" → ${r.issues.join(", ")}`);
      }
    }
  }

  console.log("\n" + "═".repeat(90));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `Analysis Layer Debug  |  limit=${LIMIT}  days=${DAYS}` +
    (CATEGORY ? `  category=${CATEGORY}` : "") +
    (NO_LLM   ? "  [no-llm]"            : "") +
    (LLM_QA   ? "  [llm-qa]"            : "")
  );

  let sources;
  try {
    sources = await loadSources();
  } catch (err) {
    console.error("Failed to load sources from Supabase:", err.message);
    process.exit(1);
  }

  if (sources.length === 0) {
    console.log("No sources found for the given filters.");
    return;
  }
  console.log(`Loaded ${sources.length} sources. Running pipeline...`);

  const saveTo = SAVE ? join(__dirname, "..", "outputs", "debug") : null;

  // Run rawfact branch
  console.log("\n[Layer 7.1] Rawfact branch...");
  const { rawfact_sources: withClusters, counts: rawfactCounts } =
    await runRawfactBranch(sources, { skipLlm: NO_LLM });
  console.log(`  must_read=${rawfactCounts.must_read} high=${rawfactCounts.high} medium=${rawfactCounts.medium} low=${rawfactCounts.low} clusters=${rawfactCounts.clusters}`);

  // Run analytics branch
  console.log("\n[Layer 7.2] Analytics branch...");
  const { analytics_sources: withAnalytics, aggregates } =
    await runAnalyticsBranch(withClusters, { skipLlm: NO_LLM });

  // Run analysis layer
  console.log("\n[Layer 8] Analysis layer...");
  const { category_analyses, analysis_summary, qa_report } =
    await runAnalysisLayer(withAnalytics, aggregates, {
      skipLlm: NO_LLM,
      skipLlmQa: !LLM_QA,
      saveTo,
    });

  if (JSON_OUT) {
    console.log(JSON.stringify({ category_analyses, analysis_summary, qa_report }, null, 2));
    return;
  }

  printSummary(category_analyses, analysis_summary, qa_report);

  if (SAVE) {
    console.log(`\nDebug files saved to outputs/debug/`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
