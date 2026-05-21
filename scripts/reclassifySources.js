/**
 * Reclassify all stored sources with the current tag taxonomy (classify-v3.0).
 *
 * Runs rule-based classification only (useLLM=false) so it works without
 * API keys and completes in seconds. Does a single pass over all sources.
 *
 * After running this, re-run score-sources and regenerate reports to pick
 * up the updated tags, categories, and relevance tiers.
 *
 * Usage:
 *   node scripts/reclassifySources.js [limit]
 */

import "dotenv/config";
import { classifyStoredSources } from "../lib/classification/classifyStoredSources.js";

const limit = parseInt(process.argv[2] || "5000", 10);

console.log(`Reclassifying up to ${limit} sources (rule-based, classify-v3.0)...`);
console.log("No LLM calls — this should complete in a few seconds.\n");

const result = await classifyStoredSources({
  onlyUnclassified: false,  // process ALL sources, not just tag_version=null
  useLLM: false,            // rule-based only — fast, no quota
  limit,
});

console.log("── Results ─────────────────────────────────────");
console.log(`  Classified:  ${result.count}`);
console.log(`    Rule-based:  ${result.rule_count}`);
console.log(`  Deleted:     ${result.deleted_count}  (ai_specificity_score < 10, non-curated)`);
console.log(`  Errors:      ${result.error_count}`);
console.log(`  Tier breakdown:`);
console.log(`    Core:     ${result.tier_counts.core}`);
console.log(`    Adjacent: ${result.tier_counts.adjacent}`);
console.log(`    Context:  ${result.tier_counts.context}`);

if (result.deleted?.length) {
  console.log(`\nDeleted sources:`);
  result.deleted.forEach(d => console.log(`  - ${d.title?.slice(0, 70)}`));
}

if (result.error_count > 0) {
  console.log(`\nErrors:`);
  result.errors.forEach(e => console.log(`  - ${e.title}: ${e.error}`));
}

console.log(`\nDone. Now run: POST /api/score-sources?limit=5000`);
console.log(`Then regenerate reports to reflect updated taxonomy.`);
