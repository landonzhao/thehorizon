#!/usr/bin/env node
/**
 * enrichTools.js — Enrich pending tools with README content + LLM classification.
 *
 * Processes tools where enrichment_status = 'pending' (or 'failed' with --retry).
 * For each tool:
 *   1. Fetch README from GitHub (or homepage fallback)
 *   2. Re-run relevance gate on README content
 *   3. Classify with Haiku: category, capabilities, boolean flags
 *   4. Apply grep overrides (deterministic, can only set true)
 *   5. Map capabilities → attack surfaces
 *   6. Persist classification + attack surfaces + update description
 *
 * Quality guarantees:
 *   - enrichment_status='no_content' if README < 200 chars → no LLM, no guess
 *   - description_source field shows where the description came from
 *   - All descriptions come from actual fetched content
 *
 * Usage:
 *   node scripts/enrichTools.js --dry-run
 *   node scripts/enrichTools.js --limit 50 --concurrency 2
 *   node scripts/enrichTools.js --retry   # also re-process failed tools
 *   node scripts/enrichTools.js --id {tool_id}   # single tool
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { enrichAndPersistTools } from "../lib/tooling/enricher.js";

const args    = process.argv.slice(2);
const getArg  = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const hasFlag = (f) => args.includes(f);
const DRY     = hasFlag("--dry-run");
const LIMIT   = parseInt(getArg("--limit", "9999"), 10);
const CONC    = parseInt(getArg("--concurrency", "2"), 10);
const RETRY   = hasFlag("--retry");
const TOOL_ID = getArg("--id", null);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log("════════════════════════════════════════════════════════════");
console.log("  Enrich Agentic Tools" + (DRY ? "  [DRY RUN]" : ""));
console.log(`  Limit: ${LIMIT}  Concurrency: ${CONC}  Retry failed: ${RETRY}`);
console.log("════════════════════════════════════════════════════════════\n");

// ── Load tools to enrich ──────────────────────────────────────────────────────
let q = sb.from("atool_tools").select("*");
if (TOOL_ID) {
  q = q.eq("id", TOOL_ID);
} else {
  const statuses = ["pending"];
  if (RETRY) statuses.push("failed", "no_content");
  q = q.in("enrichment_status", statuses).order("stars", { ascending: false });
}
const { data: tools, error } = await q.limit(LIMIT);
if (error) { console.error("DB load:", error.message); process.exit(1); }
if (!tools?.length) { console.log("No tools pending enrichment."); process.exit(0); }

console.log(`Enriching ${tools.length} tools...\n`);
const tally = await enrichAndPersistTools(tools, sb, { concurrency: CONC, dryRun: DRY });

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  Processed: ${tools.length}`);
console.log(`  Enriched (done):    ${tally.enriched}`);
console.log(`  No content:         ${tally.no_content}`);
console.log(`  Skipped (irrelevant): ${tally.skipped}`);
console.log(`  Failed:             ${tally.failed}`);
if (DRY) console.log("  [DRY RUN — nothing written]");
console.log(`\n  Next: node scripts/buildToolSnapshot.js`);
