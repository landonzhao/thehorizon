/**
 * Rawfact Branch Debug Script
 *
 * Loads recent sources from Supabase, runs the full rawfact branch
 * (taxonomy → evidence extraction → scoring → clustering), and prints
 * a structured summary for inspection.
 *
 * Usage:
 *   node scripts/debugRawfactBranch.js [options]
 *
 * Options:
 *   --limit <n>          Number of sources to sample (default: 20)
 *   --days <n>           Sources from last N days (default: 30)
 *   --category <cat>     Filter by main_category
 *   --type <type>        Filter by source_type
 *   --trust <tier>       Filter by trust_tier
 *   --no-llm             Force deterministic fallback (no API calls)
 *   --save               Save debug JSON files to outputs/debug/
 *   --json               Print full JSON to stdout
 *   --taxonomy-only      Run only 7.1A taxonomy, skip extraction and scoring
 *   --cards-only         Print only sources that received evidence cards
 *
 * Examples:
 *   node scripts/debugRawfactBranch.js
 *   node scripts/debugRawfactBranch.js --limit 50 --save
 *   node scripts/debugRawfactBranch.js --category llm_threats --no-llm
 *   node scripts/debugRawfactBranch.js --type incident --cards-only
 *   node scripts/debugRawfactBranch.js --json | head -200
 */

import "dotenv/config";
import { createClient }   from "@supabase/supabase-js";
import { join, dirname }  from "path";
import { fileURLToPath }  from "url";
import { runRawfactBranch }         from "../lib/pipeline/rawfact/runRawfactBranch.js";
import { applyRawfactTaxonomies }   from "../lib/pipeline/rawfact/rawfactTaxonomy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : def; };
const hasFlag = (name) => args.includes(name);

const LIMIT        = parseInt(getArg("--limit",    "20"), 10);
const DAYS         = parseInt(getArg("--days",     "30"), 10);
const CATEGORY     = getArg("--category", null);
const TYPE         = getArg("--type",     null);
const TRUST        = getArg("--trust",    null);
const NO_LLM       = hasFlag("--no-llm");
const SAVE         = hasFlag("--save");
const JSON_OUT     = hasFlag("--json");
const TAXONOMY_ONLY = hasFlag("--taxonomy-only");
const CARDS_ONLY   = hasFlag("--cards-only");

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
  if (TRUST)    query = query.eq("trust_tier",    TRUST);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function pad(str, width) {
  const s = String(str ?? "").slice(0, width);
  return s.padEnd(width);
}

function truncate(str, max) {
  const s = String(str ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function priorityBadge(priority) {
  const map = { must_read: "★★★", high: "★★ ", medium: "★  ", low: "○  ", archive_only: "·  " };
  return map[priority] || "?  ";
}

function printSourceResult(source) {
  const rt  = source.rawfact_taxonomy || {};
  const rsd = source.rawfact_score_data || {};
  const ec  = source.evidence_card;
  const cl  = source.rawfact_cluster;

  console.log("\n" + "─".repeat(90));
  console.log(
    `${priorityBadge(rsd.rawfact_priority)} [${rsd.rawfact_score ?? "?"}/100] ` +
    `${truncate(source.title, 70)}`
  );
  console.log(
    `  type=${pad(source.source_type, 28)} cat=${pad(source.main_category, 22)} ` +
    `trust=${source.trust_tier || "?"}`
  );

  // Rawfact taxonomy summary
  if (rt.rawfact_taxonomy_version) {
    const llmBadge = rt.llm_used ? "[LLM]" : "[det]";
    console.log(
      `  ${llmBadge} taxonomy: op_rel=${rt.operational_relevance}  novelty=${rt.novelty}` +
      `  severity=${rt.impact_severity}  scope=${rt.impact_scope}`
    );
    if (rt.sector?.length)     console.log(`    sector    : ${rt.sector.join(", ")}`);
    if (rt.technology?.length) console.log(`    technology: ${rt.technology.join(", ")}`);
    if (rt.geography?.length)  console.log(`    geography : ${rt.geography.join(", ")}`);
  }

  // Source-type context (key fields only)
  const ctx = rt.source_type_context || {};
  const ctxKeys = Object.entries(ctx)
    .filter(([, v]) => v && v !== "unknown" && v !== "" && !(Array.isArray(v) && v.length === 0))
    .slice(0, 5);
  if (ctxKeys.length > 0) {
    console.log(`    ctx: ${ctxKeys.map(([k, v]) => `${k}=${Array.isArray(v) ? v.slice(0,3).join(",") : v}`).join("  ")}`);
  }

  // Score breakdown
  if (rsd.score_breakdown) {
    const b = rsd.score_breakdown;
    console.log(
      `  score: base=${b.common_base}  type=${b.type_specific}  horizon=${b.horizon_bonus}  pen=${b.penalties}` +
      ` → ${rsd.rawfact_score}  (${rsd.rawfact_priority})`
    );
  }

  // Evidence card
  if (ec) {
    console.log(`  evidence_card: "${truncate(ec.evidence_card_title, 70)}"`);
    console.log(`    ${truncate(ec.short_summary, 100)}`);
    if (ec.key_facts?.length) {
      console.log(`    facts(${ec.key_facts.length}): ${ec.key_facts.slice(0,2).map(f => truncate(f,50)).join(" | ")}`);
    }
    if (ec.numbers_statistics?.length) {
      console.log(`    numbers: ${ec.numbers_statistics.join(" | ")}`);
    }
    if (ec.attack_flow?.length) {
      console.log(`    attack(${ec.attack_flow.length}): ${ec.attack_flow.slice(0,2).map(s => truncate(s,40)).join(" → ")}`);
    }
    console.log(`    best_for: ${(ec.best_used_for || []).join(", ")}`);
  } else {
    console.log("  evidence_card: (not extracted)");
  }

  // Cluster
  if (cl) {
    console.log(
      `  cluster: ${cl.cluster_id}  size=${cl.cluster_size}` +
      `  representative=${cl.is_representative ? "YES" : "no"}` +
      `  multi=${cl.is_multi_source ? "YES" : "no"}`
    );
  }
}

// ── Summary statistics ────────────────────────────────────────────────────────

function printSummary(final, counts) {
  console.log("\n" + "═".repeat(90));
  console.log("RAWFACT BRANCH DEBUG SUMMARY");
  console.log("═".repeat(90));
  console.log(`Sources:          ${counts.total}`);
  console.log(`Taxonomy done:    ${counts.taxonomy_done}`);
  console.log(`Evidence cards:   ${counts.evidence_cards}`);
  console.log();
  console.log(`Priority distribution:`);
  console.log(`  must_read  ★★★  ${counts.must_read}`);
  console.log(`  high       ★★   ${counts.high}`);
  console.log(`  medium     ★    ${counts.medium}`);
  console.log(`  low        ○    ${counts.low}`);
  console.log(`  archive_only ·  ${counts.archive_only}`);
  console.log();
  console.log(`Clusters:         ${counts.clusters} total, ${counts.multi_source_clusters} multi-source`);

  // Source type distribution
  const typeDist = {};
  for (const s of final) {
    const t = s.source_type || "unknown";
    typeDist[t] = (typeDist[t] || 0) + 1;
  }
  console.log("\nSource type distribution:");
  for (const [t, n] of Object.entries(typeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }

  // Operational relevance distribution
  const opDist = {};
  for (const s of final) {
    const op = s.rawfact_taxonomy?.operational_relevance || "unknown";
    opDist[op] = (opDist[op] || 0) + 1;
  }
  console.log("\nOperational relevance:");
  for (const [op, n] of Object.entries(opDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${op}`);
  }

  // Score distribution
  const scores = final.map(s => s.rawfact_score_data?.rawfact_score ?? 0);
  if (scores.length > 0) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    console.log(`\nScores: min=${min}  avg=${avg}  max=${max}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `Rawfact Branch Debug  |  limit=${LIMIT}  days=${DAYS}` +
    (CATEGORY     ? `  category=${CATEGORY}` : "") +
    (TYPE         ? `  type=${TYPE}`         : "") +
    (TRUST        ? `  trust=${TRUST}`       : "") +
    (NO_LLM       ? "  [no-llm]"            : "") +
    (TAXONOMY_ONLY? "  [taxonomy-only]"      : "")
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

  console.log(`Loaded ${sources.length} sources. Running rawfact branch...`);

  let final, counts;

  if (TAXONOMY_ONLY) {
    const withTaxonomy = await applyRawfactTaxonomies(sources, { skipLlm: NO_LLM });
    final  = withTaxonomy;
    counts = {
      total: final.length,
      taxonomy_done: final.filter(s => s.rawfact_taxonomy?.rawfact_taxonomy_version).length,
      evidence_cards: 0,
      must_read: 0, high: 0, medium: 0, low: 0, archive_only: 0,
      clusters: 0, multi_source_clusters: 0,
    };
  } else {
    const saveTo = SAVE
      ? join(__dirname, "..", "outputs", "debug")
      : null;

    ({ rawfact_sources: final, counts } = await runRawfactBranch(sources, {
      skipLlm: NO_LLM,
      saveTo,
    }));
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(
      final.map((s) => ({
        id: s.id, title: s.title,
        source_type: s.source_type, main_category: s.main_category,
        rawfact_taxonomy: s.rawfact_taxonomy,
        evidence_card: s.evidence_card,
        rawfact_score_data: s.rawfact_score_data,
        rawfact_cluster: s.rawfact_cluster,
      })),
      null, 2
    ));
    return;
  }

  const displaySources = CARDS_ONLY
    ? final.filter(s => s.evidence_card !== null && s.evidence_card !== undefined)
    : final;

  for (const s of displaySources) {
    printSourceResult(s);
  }

  printSummary(final, counts);

  if (SAVE && !TAXONOMY_ONLY) {
    console.log(`\nDebug files saved to outputs/debug/`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
