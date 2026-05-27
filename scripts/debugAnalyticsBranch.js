/**
 * Analytics Branch Debug Script
 *
 * Loads recent sources from Supabase (with rawfact outputs if available),
 * runs the full Analytics Branch (7.2A → 7.2B → 7.2C), and prints
 * a structured summary for inspection.
 *
 * Usage:
 *   node scripts/debugAnalyticsBranch.js [options]
 *
 * Options:
 *   --limit <n>      Number of sources to sample (default: 50)
 *   --days <n>       Sources from last N days (default: 90)
 *   --category <cat> Filter by main_category
 *   --type <type>    Filter by source_type
 *   --no-llm         Force deterministic fallback (no API calls)
 *   --save           Save debug JSON files to outputs/debug/
 *   --json           Print full aggregates JSON to stdout
 *   --verbose        Print per-source taxonomy details
 *
 * Examples:
 *   node scripts/debugAnalyticsBranch.js
 *   node scripts/debugAnalyticsBranch.js --limit 200 --save
 *   node scripts/debugAnalyticsBranch.js --category llm_threats --no-llm
 *   node scripts/debugAnalyticsBranch.js --json | head -100
 */

import "dotenv/config";
import { createClient }    from "@supabase/supabase-js";
import { join, dirname }   from "path";
import { fileURLToPath }   from "url";
import { runAnalyticsBranch } from "../lib/pipeline/analytics/runAnalyticsBranch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; };
const hasFlag = (name) => args.includes(name);

const LIMIT   = parseInt(getArg("--limit", "50"), 10);
const DAYS    = parseInt(getArg("--days",  "90"), 10);
const CATEGORY= getArg("--category", null);
const TYPE    = getArg("--type",     null);
const NO_LLM  = hasFlag("--no-llm");
const SAVE    = hasFlag("--save");
const JSON_OUT= hasFlag("--json");
const VERBOSE = hasFlag("--verbose");

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
  if (TYPE)     query = query.eq("source_type",   TYPE);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Print helpers ─────────────────────────────────────────────────────────────

function bar(label, n, total) {
  const pct   = total > 0 ? Math.round((n / total) * 20) : 0;
  const filled = "█".repeat(pct) + "░".repeat(20 - pct);
  return `  ${String(n).padStart(4)}  ${filled}  ${label}`;
}

function printTopN(obj, label, n = 10) {
  const entries = Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  if (entries.length === 0) { console.log(`  (none)`); return; }
  const maxCount = entries[0][1];
  for (const [k, v] of entries) {
    console.log(bar(k.replace(/_/g, " "), v, maxCount * 1.2));
  }
}

function printSummary(analytics_sources, aggregates, viz_specs) {
  const ag = aggregates;
  console.log("\n" + "═".repeat(90));
  console.log("ANALYTICS BRANCH DEBUG SUMMARY");
  console.log("═".repeat(90));
  console.log(`Sources analyzed:    ${ag.total_sources}`);
  console.log(`Taxonomy done:       ${ag.taxonomy_done}`);
  console.log(`Date range:          ${ag.date_range?.start || "?"} → ${ag.date_range?.end || "?"} (${ag.date_range?.months || 0} months)`);
  console.log(`Visualizations:      ${viz_specs.length}`);

  console.log("\n── Category Distribution ─────────────────────────────────────────────────────");
  const catTotal = Object.values(ag.category_counts).reduce((a, b) => a + b, 0);
  printTopN(ag.category_counts, "category", 10);

  console.log("\n── Source Type Distribution ──────────────────────────────────────────────────");
  printTopN(ag.source_type_counts, "source_type", 12);

  console.log("\n── Top Attack Vectors ────────────────────────────────────────────────────────");
  printTopN(ag.attack_vector_frequency, "attack_vector", 10);

  console.log("\n── Top Signal Clusters ───────────────────────────────────────────────────────");
  printTopN(ag.signal_cluster_counts, "signal_cluster", 10);

  console.log("\n── Maturity Distribution ─────────────────────────────────────────────────────");
  printTopN(ag.maturity_distribution, "maturity", 6);

  console.log("\n── Operational Status ────────────────────────────────────────────────────────");
  printTopN(ag.operational_status_distribution, "operational_status", 7);

  console.log("\n── Top Recurring Themes ──────────────────────────────────────────────────────");
  printTopN(ag.recurring_theme_counts, "theme", 8);

  console.log("\n── Top Attack Surfaces ───────────────────────────────────────────────────────");
  printTopN(ag.attack_surface_frequency, "attack_surface", 10);

  if (ag.trend_deltas) {
    const td = ag.trend_deltas;
    console.log(`\n── Trend Deltas (${td.period?.from} → ${td.period?.to}) ───────────────────────`);
    for (const { cat, delta } of (td.top_growing_categories || [])) {
      console.log(`  +${delta}  ${cat}`);
    }
  }

  console.log("\n── Category Breakdowns ───────────────────────────────────────────────────────");
  for (const [cat, bd] of Object.entries(ag.category_breakdowns || {})) {
    if (bd.count === 0) continue;
    console.log(`\n  ${cat.toUpperCase()} (${bd.count} sources)`);
    const topVectors = (bd.top_attack_vectors || []).slice(0, 3).map((x) => x.key.replace(/_/g, " ")).join(", ");
    const topClusters = (bd.top_signal_clusters || []).slice(0, 3).map((x) => x.key.replace(/_/g, " ")).join(", ");
    console.log(`    attack vectors: ${topVectors || "(none)"}`);
    console.log(`    signal clusters: ${topClusters || "(none)"}`);
    const mDist = Object.entries(bd.maturity_distribution || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ");
    console.log(`    maturity: ${mDist || "(unknown)"}`);
  }

  console.log("\n── Visualization IDs ─────────────────────────────────────────────────────────");
  for (const spec of viz_specs) {
    console.log(`  ${spec.visualization_id.padEnd(35)} ${spec.visualization_type.padEnd(15)} → ${spec.slide_use}`);
  }

  console.log("\n" + "═".repeat(90));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `Analytics Branch Debug  |  limit=${LIMIT}  days=${DAYS}` +
    (CATEGORY ? `  category=${CATEGORY}` : "") +
    (TYPE     ? `  type=${TYPE}`         : "") +
    (NO_LLM   ? "  [no-llm]"            : "")
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

  console.log(`Loaded ${sources.length} sources. Running analytics branch...`);

  const saveTo = SAVE ? join(__dirname, "..", "outputs", "debug") : null;

  const { analytics_sources, aggregates, visualization_specs, counts } =
    await runAnalyticsBranch(sources, { skipLlm: NO_LLM, saveTo });

  if (JSON_OUT) {
    console.log(JSON.stringify({ aggregates, visualization_specs }, null, 2));
    return;
  }

  if (VERBOSE) {
    console.log("\n── Per-Source Analytics Taxonomy (first 10) ──────────────────────────────────");
    for (const s of analytics_sources.slice(0, 10)) {
      const at = s.analytics_taxonomy;
      if (!at) continue;
      console.log(`\n  [${at.analytics_category}] ${(s.title || "").slice(0, 70)}`);
      console.log(`    type=${at.analytics_source_type}  maturity=${at.analytics_maturity}  op=${at.analytics_operational_status}`);
      if (at.analytics_attack_vectors?.length)
        console.log(`    vectors: ${at.analytics_attack_vectors.join(", ")}`);
      if (at.analytics_signal_clusters?.length)
        console.log(`    clusters: ${at.analytics_signal_clusters.join(", ")}`);
    }
  }

  printSummary(analytics_sources, aggregates, visualization_specs);

  if (SAVE) {
    console.log(`\nDebug files saved to outputs/debug/`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
