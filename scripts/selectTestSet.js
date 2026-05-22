/**
 * Test-set selection script.
 *
 * Picks a small, diverse set of sources from the archive and marks them
 * in_test_set = true. All other pipeline operations can then be scoped
 * to just this set using --test-set / ?test_set=true flags.
 *
 * Selection strategy:
 *   - 3 sources per threat category (5 categories → up to 15)
 *   - Within each category: prefer a mix of trust tiers and source types
 *   - Prefer sources that have NOT yet been LLM-enriched (better test coverage)
 *   - Falls back to enriched sources if a category has fewer than 3 unenriched
 *
 * Usage:
 *   node scripts/selectTestSet.js           # select and mark
 *   node scripts/selectTestSet.js --clear   # remove all in_test_set marks
 *   node scripts/selectTestSet.js --list    # show current test set
 */

import "dotenv/config";
import { supabase } from "../lib/storage/supabaseClient.js";

const PER_CATEGORY = 3;

const CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
];

const TIER_ORDER = ["primary", "curated", "high", "medium", "low", "unknown"];

// ─────────────────────────────────────────────────────────────────────────────

async function clearTestSet() {
  const { error, count } = await supabase
    .from("sources")
    .update({ in_test_set: false })
    .eq("in_test_set", true);
  if (error) throw error;
  console.log(`Cleared in_test_set on ${count ?? "?"} sources.`);
}

async function listTestSet() {
  const { data, error } = await supabase
    .from("sources")
    .select("id, title, main_category, trust_tier, source_type, claim_extraction_status, relevance_tier")
    .eq("in_test_set", true)
    .order("main_category");
  if (error) throw error;
  if (!data?.length) { console.log("No sources in test set."); return; }
  console.log(`\nTest set — ${data.length} sources\n${"─".repeat(80)}`);
  for (const s of data) {
    const enriched = s.claim_extraction_status === "success" ? "✓ llm" : "  raw";
    console.log(
      `[${enriched}] ${s.main_category?.padEnd(24)} ${s.trust_tier?.padEnd(8)} ${s.source_type?.padEnd(10)} ${s.title?.slice(0, 50)}`
    );
  }
}

function rankByDiversity(sources) {
  // Sort so we get varied trust_tier and source_type picks first.
  // Prefer unenriched sources (claim_extraction_status IS NULL) for test coverage.
  const tierScore = (s) => TIER_ORDER.indexOf(s.trust_tier ?? "unknown");
  return [...sources].sort((a, b) => {
    const aRaw = !a.claim_extraction_status ? 0 : 1;
    const bRaw = !b.claim_extraction_status ? 0 : 1;
    if (aRaw !== bRaw) return aRaw - bRaw;
    return tierScore(a) - tierScore(b);
  });
}

async function selectTestSet() {
  // First clear any previous marks so the set stays small and intentional.
  const { error: clearError } = await supabase
    .from("sources")
    .update({ in_test_set: false })
    .eq("in_test_set", true);
  if (clearError) throw clearError;

  const selected = [];

  for (const category of CATEGORIES) {
    // Fetch a wider pool per category and then pick the most diverse subset.
    const { data, error } = await supabase
      .from("sources")
      .select("id, title, main_category, trust_tier, source_type, claim_extraction_status, relevance_tier, ai_specificity_score")
      .eq("main_category", category)
      .order("date_published", { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!data?.length) {
      console.warn(`  [warn] No sources found for category: ${category}`);
      continue;
    }

    const ranked = rankByDiversity(data);
    // Pick PER_CATEGORY sources, ensuring we don't pick two with the same
    // source_type consecutively if we can avoid it.
    const picks = [];
    const usedTypes = new Set();

    for (const s of ranked) {
      if (picks.length >= PER_CATEGORY) break;
      if (!usedTypes.has(s.source_type) || picks.length === PER_CATEGORY - 1) {
        picks.push(s);
        usedTypes.add(s.source_type);
      }
    }
    // If we still need more, grab remaining regardless of type.
    for (const s of ranked) {
      if (picks.length >= PER_CATEGORY) break;
      if (!picks.find((p) => p.id === s.id)) picks.push(s);
    }

    selected.push(...picks);
  }

  if (!selected.length) {
    console.error("No sources selected — check that sources exist with main_category set.");
    process.exit(1);
  }

  const ids = selected.map((s) => s.id);
  const { error: markError } = await supabase
    .from("sources")
    .update({ in_test_set: true })
    .in("id", ids);
  if (markError) throw markError;

  console.log(`\nTest set selected — ${selected.length} sources\n${"─".repeat(80)}`);
  for (const s of selected) {
    const enriched = s.claim_extraction_status === "success" ? "✓ llm" : "  raw";
    console.log(
      `[${enriched}] ${s.main_category?.padEnd(24)} ${s.trust_tier?.padEnd(8)} ${s.source_type?.padEnd(10)} ${s.title?.slice(0, 50)}`
    );
  }

  console.log(`\n${"─".repeat(80)}`);
  console.log(` Total: ${selected.length} sources marked in_test_set = true`);
  console.log(` LLM-enriched: ${selected.filter((s) => s.claim_extraction_status === "success").length}`);
  console.log(` Unenriched  : ${selected.filter((s) => !s.claim_extraction_status).length}`);
  console.log(`\nNext steps:`);
  console.log(`  node scripts/enrichSources.js 999 500 --test-set   # enrich only test set`);
  console.log(`  POST /api/classify-sources?test_set=true`);
  console.log(`  POST /api/score-sources?test_set=true`);
}

// ─────────────────────────────────────────────────────────────────────────────

const arg = process.argv[2];

if (arg === "--clear") {
  await clearTestSet();
} else if (arg === "--list") {
  await listTestSet();
} else {
  await selectTestSet();
}