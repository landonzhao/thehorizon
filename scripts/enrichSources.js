/**
 * LLM intelligence enrichment script.
 *
 * Runs enrichSource on sources that haven't been enriched yet,
 * with rate-limit-safe delays between calls.
 *
 * Usage:
 *   node scripts/enrichSources.js [limit] [delay_ms]
 *   node scripts/enrichSources.js 100 7000   # 100 sources, 7s between calls (Gemini free tier)
 *   node scripts/enrichSources.js 100 500    # 100 sources, 0.5s between calls (OpenAI paid)
 *   node scripts/enrichSources.js             # all unenriched, 7s delay (default)
 *
 * OpenAI (primary): no meaningful rate limit at this volume, use delay_ms=500 or less.
 * Gemini free tier: ~10 RPM → 7000ms delay keeps safely under.
 */

import "dotenv/config";
import { supabase } from "../lib/storage/supabaseClient.js";
import { enrichSource } from "../lib/claims/enrichSource.js";
import { classifySourceWithRules } from "../lib/classification/ruleBasedClassifier.js";
import { ALLOWED_TAGS } from "../lib/classification/allowedTags.js";

const CLASSIFICATION_VERSION = "classify-v2.0";
const TIER_CORE = 40;
const TIER_ADJACENT = 20;
const DELETE_THRESHOLD = 10;

const limitArg = parseInt(process.argv[2] || "9999");
const delayMs  = parseInt(process.argv[3] || "7000");

function pad(n, w = 4) { return String(n).padStart(w, " "); }

// ─────────────────────────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
  console.error("Neither OPENAI_API_KEY nor GEMINI_API_KEY is set — aborting.");
  process.exit(1);
}

const provider = process.env.OPENAI_API_KEY ? "OpenAI" : "Gemini";

// Fetch sources without Gemini enrichment
const { data: sources, error } = await supabase
  .from("sources")
  .select("*")
  .is("claim_extraction_status", null)
  .order("date_published", { ascending: false })
  .limit(limitArg);

if (error) { console.error("DB fetch error:", error.message); process.exit(1); }

const total = sources?.length || 0;
const etaMinutes = Math.ceil((total * delayMs) / 60000);

console.log(`\n${"═".repeat(60)}`);
console.log(` LLM Enrichment Run (${provider})`);
console.log(` Sources to enrich : ${total}`);
console.log(` Delay between calls: ${delayMs}ms`);
console.log(` Estimated time    : ~${etaMinutes} min`);
console.log(`${"═".repeat(60)}\n`);

let enriched = 0;
let fallback = 0;
let errors   = 0;

for (let i = 0; i < total; i++) {
  const source = sources[i];
  const progress = `[${pad(i + 1)}/${pad(total)}]`;

  process.stdout.write(`${progress} ${source.title?.slice(0, 60)}… `);

  try {
    const extraction = await enrichSource(source);
    const cl = extraction.classification;

    const ai_specificity_score = cl.ai_specificity_score ?? 0;

    // Hard-delete truly off-topic (respects curated bypass)
    if (source.trust_tier !== "curated" && ai_specificity_score < DELETE_THRESHOLD) {
      await supabase.from("sources").delete().eq("id", source.id);
      console.log(`DELETED (score=${ai_specificity_score})`);
      errors++;
      continue;
    }

    const relevance_tier =
      source.trust_tier === "curated"
        ? (source.relevance_tier || "core")
        : ai_specificity_score >= TIER_CORE
          ? "core"
          : ai_specificity_score >= TIER_ADJACENT
            ? "adjacent"
            : "context";

    const update = {
      tags: cl.tags,
      main_category: cl.main_category || source.main_category || "uncategorised",
      category_confidence: cl.category_confidence,
      category_reason: cl.category_reason,
      ai_specificity_score,
      ai_specificity_reason: cl.ai_specificity_reason,
      relevance_tier,
      tag_version: CLASSIFICATION_VERSION,
      claim_extraction_status: "success",
      claim_extraction_version: CLASSIFICATION_VERSION,
    };

    if (extraction.short_summary) update.short_summary = extraction.short_summary;
    if (extraction.analyst_brief) update.analyst_brief = extraction.analyst_brief;
    if (extraction.intelligence)  update.intelligence  = extraction.intelligence;

    const { error: updateErr } = await supabase
      .from("sources")
      .update(update)
      .eq("id", source.id);

    if (updateErr) throw updateErr;

    const maturity = extraction.intelligence?.threat_maturity || "?";
    const tier_label = extraction.intelligence?.report_tier || "?";
    console.log(`ok  tier=${relevance_tier} maturity=${maturity} report=${tier_label}`);
    enriched++;

  } catch (err) {
    console.log(`ERR ${err.message.slice(0, 80)}`);
    errors++;
  }

  // Rate-limit pause (skip after last item)
  if (i < total - 1 && delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(` Enrichment complete.`);
console.log(`   Enriched  : ${enriched} / ${total}`);
console.log(`   Errors    : ${errors}`);
console.log(`\n Next: POST /api/score-sources?limit=1000`);
console.log(`${"═".repeat(60)}\n`);
