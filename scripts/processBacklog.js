/**
 * Automated backlog processor.
 *
 * Runs classify → enrich → score in continuous batches until every source
 * in the database has been classified and enriched. Designed to run
 * unattended overnight or as a scheduled task.
 *
 * Phase 1 (classify) uses rule-based classification only — no LLM calls.
 * This is fast and avoids burning API quota on category/tag assignment.
 * Phase 2 (enrich) calls the LLM for full intelligence extraction with
 * proper rate limiting between calls.
 *
 * Provider rotation: OpenAI → Groq (free) → Gemini Flash → Gemini 2.5
 * Automatically skips providers that return quota errors and moves to the next.
 * Rate limit errors (429) retry with backoff before moving to next provider.
 *
 * Usage:
 *   node scripts/processBacklog.js               # enrich all pending, 1s delay
 *   node scripts/processBacklog.js 20 20000      # 20 sources/batch, 20s delay (Groq free)
 *   node scripts/processBacklog.js 50 500        # batch size 50, 500ms delay (OpenAI paid)
 *   node scripts/processBacklog.js 100 0 classify-only  # only classify, no enrichment
 *
 * Arguments:
 *   batchSize  — sources per enrichment batch (default: 20)
 *   delayMs    — ms between enrichment calls (default: 20000 for Groq free tier safety)
 *               Use 500ms or less with OpenAI paid. Use 7000ms for Gemini free (20 RPD).
 *   mode       — "full" (default), "classify-only", "enrich-only"
 *
 * Rate guide (free tiers):
 *   Groq llama-3.3-70b:  30 RPM, 14,400 TPM — use delayMs=20000 (~3 req/min safe)
 *   Gemini 2.0 Flash:    15 RPM, 1M TPD     — use delayMs=4000
 *   OpenAI gpt-4o-mini:  (paid) no meaningful limit at this volume
 */

import "dotenv/config";
import { supabase } from "../lib/storage/supabaseClient.js";
import { enrichSource } from "../lib/claims/enrichSource.js";
import { classifyStoredSources } from "../lib/classification/classifyStoredSources.js";
import { deriveCategory } from "../lib/classification/deriveCategory.js";
import { ALLOWED_TAGS } from "../lib/classification/allowedTags.js";
import { scoreSource } from "../lib/scoring/scoreSource.js";

const batchSize = parseInt(process.argv[2] || "20");
const delayMs   = parseInt(process.argv[3] || "20000");
const mode      = process.argv[4] || "full";

const CLASSIFY_VERSION   = "classify-v5.0";
const TIER_CORE          = 40;
const TIER_ADJACENT      = 20;
const DELETE_THRESHOLD   = 10;

function pad(n, w = 4) { return String(n).padStart(w, " "); }
function bar(done, total, width = 30) {
  const filled = Math.round((done / total) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

// ── Classify pass ─────────────────────────────────────────────────────────────

async function runClassifyBatch() {
  // Rule-based only — Phase 2 handles LLM enrichment with proper rate limiting.
  const result = await classifyStoredSources({ limit: 500, useLLM: false });
  return {
    classified: result.classified ?? result.count ?? 0,
    deleted: result.deleted?.length ?? result.deleted_count ?? 0,
  };
}

async function runClassifyUntilStable() {
  let pass = 0;
  let totalClassified = 0;

  // Repeat until a full pass finds nothing new to classify
  while (true) {
    pass++;
    const { classified, deleted } = await runClassifyBatch();
    totalClassified += classified;
    console.log(`  Classify pass ${pass}: classified=${classified} deleted=${deleted}`);
    if (classified === 0) break;
    if (pass >= 5) break; // safety cap
  }

  return totalClassified;
}

// ── Enrich pass ───────────────────────────────────────────────────────────────

async function fetchPendingSources(limit) {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .is("claim_extraction_status", null)
    .not("relevance_tier", "eq", "off_topic")
    .order("priority_score", { ascending: false, nullsFirst: false })
    .order("date_published", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function countPending() {
  const { count } = await supabase
    .from("sources")
    .select("*", { count: "exact", head: true })
    .is("claim_extraction_status", null);
  return count ?? 0;
}

async function enrichBatch(sources) {
  let enriched = 0;
  let deleted  = 0;
  let errors   = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    process.stdout.write(`  [${pad(i + 1)}/${pad(sources.length)}] ${source.title?.slice(0, 55)}…`);

    try {
      const extraction = await enrichSource(source);
      const cl = extraction.classification;
      const ai_specificity_score = cl.ai_specificity_score ?? 0;

      // Delete genuinely off-topic, but never curated sources
      const isCurated = source.trust_tier === "curated" || (source.tags || []).includes("curated");
      if (!isCurated && ai_specificity_score < DELETE_THRESHOLD) {
        await supabase.from("sources").delete().eq("id", source.id);
        console.log(` deleted (score=${ai_specificity_score})`);
        deleted++;
        if (delayMs > 0 && i < sources.length - 1) await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      const relevance_tier =
        isCurated
          ? (source.relevance_tier || "core")
          : ai_specificity_score >= TIER_CORE
            ? "core"
            : ai_specificity_score >= TIER_ADJACENT
              ? "adjacent"
              : "context";

      const tags = ((cl.tags?.length ? cl.tags : source.tags) || []).filter((t) => ALLOWED_TAGS.includes(t));
      const { main_category, category_confidence, category_reason } = deriveCategory(tags);

      const update = {
        tags,
        main_category,
        category_confidence,
        category_reason,
        ai_specificity_score,
        ai_specificity_reason: cl.ai_specificity_reason,
        relevance_tier,
        tag_version: CLASSIFY_VERSION,
        claim_extraction_status: "success",
        claim_extraction_version: CLASSIFY_VERSION,
      };

      if (extraction.short_summary) update.short_summary = extraction.short_summary;
      if (extraction.analyst_brief) update.analyst_brief = extraction.analyst_brief;
      if (extraction.intelligence)  update.intelligence  = extraction.intelligence;
      if (extraction.claims?.length) update.claims = extraction.claims;

      await supabase.from("sources").update(update).eq("id", source.id);

      const maturity = extraction.intelligence?.threat_maturity || "?";
      const report   = extraction.intelligence?.report_tier || "?";
      console.log(` ok  tier=${relevance_tier} maturity=${maturity} report=${report}`);
      enriched++;

    } catch (err) {
      console.log(` ERR ${err.message.slice(0, 70)}`);
      errors++;
    }

    if (delayMs > 0 && i < sources.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { enriched, deleted, errors };
}

// ── Score pass ────────────────────────────────────────────────────────────────

async function runScoreBatch() {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .in("relevance_tier", ["core", "adjacent", "context"])
    .order("date_published", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const updates = (data || []).map((source) => {
    const scored = scoreSource(source);
    return supabase.from("sources").update({
      priority_score: scored.priority_score,
      priority_label: scored.priority_label,
      priority_reason: scored.priority_reason,
      report_score: scored.report_score,
      score_version: scored.score_version,
      ...Object.fromEntries(
        ["ai_security_relevance", "severity_score", "operational_impact_score",
          "novelty_score", "source_credibility_score", "singapore_relevance_score",
          "time_sensitivity_score", "report_quality_score", "horizon_signal_score"]
          .filter((k) => scored[k] !== undefined)
          .map((k) => [k, scored[k]])
      ),
    }).eq("id", source.id);
  });

  await Promise.all(updates);
  return updates.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString().slice(0, 16).replace("T", " ");

console.log(`\n${"═".repeat(65)}`);
console.log(` Horizon Backlog Processor  ${NOW}`);
console.log(` Mode: ${mode}  |  Batch: ${batchSize}  |  Delay: ${delayMs}ms`);
console.log(` Providers: ${["OPENAI_API_KEY","OPENAI_API_KEY_2","GROQ_API_KEY","GEMINI_API_KEY","GEMINI_API_KEY_2"].filter(k => process.env[k]).map(k => k.replace("_API_KEY","")).join(" → ") || "none"}`);
console.log(`${"═".repeat(65)}\n`);

// ── Phase 1: Classify ─────────────────────────────────────────────────────────
if (mode !== "enrich-only") {
  console.log("Phase 1: Classify all unclassified sources");
  const classified = await runClassifyUntilStable();
  console.log(`  Total classified: ${classified}\n`);
}

// ── Phase 2: Enrich ───────────────────────────────────────────────────────────
if (mode !== "classify-only") {
  const totalPending = await countPending();

  if (totalPending === 0) {
    console.log("Phase 2: Enrich — nothing pending, all sources enriched.\n");
  } else {
    const etaMin = Math.ceil((totalPending * (delayMs + 8000)) / 60000);
    console.log(`Phase 2: Enrich ${totalPending} pending sources`);
    console.log(`  Estimated time: ~${etaMin} min (actual LLM latency may vary)\n`);

    let totalEnriched = 0;
    let totalDeleted  = 0;
    let totalErrors   = 0;
    let round = 0;

    while (true) {
      const pending = await countPending();
      if (pending === 0) break;

      round++;
      const sources = await fetchPendingSources(batchSize);
      if (sources.length === 0) break;

      const done = totalPending - pending;
      console.log(`\nRound ${round} ${bar(done, totalPending)} ${done}/${totalPending} done`);

      const { enriched, deleted, errors } = await enrichBatch(sources);
      totalEnriched += enriched;
      totalDeleted  += deleted;
      totalErrors   += errors;

      // If all errors and no enrichment, providers are all quota-limited — stop
      if (errors === sources.length && enriched === 0) {
        console.log("\n  All providers exhausted or quota-limited. Stopping enrichment.");
        console.log("  All providers quota-exhausted. Add more keys or wait for quotas to reset, then re-run.");
        break;
      }
    }

    console.log(`\n  Enrichment summary: enriched=${totalEnriched} deleted=${totalDeleted} errors=${totalErrors}`);
  }
}

// ── Phase 3: Score ────────────────────────────────────────────────────────────
console.log("\nPhase 3: Score all sources");
const scored = await runScoreBatch();
console.log(`  Scored: ${scored} sources\n`);

// ── Final summary ─────────────────────────────────────────────────────────────
const { count: enrichedTotal } = await supabase
  .from("sources")
  .select("*", { count: "exact", head: true })
  .eq("claim_extraction_status", "success");

const { count: pendingFinal } = await supabase
  .from("sources")
  .select("*", { count: "exact", head: true })
  .is("claim_extraction_status", null);

console.log(`${"─".repeat(65)}`);
console.log(` Backlog processor complete.`);
console.log(`   Total enriched : ${enrichedTotal}`);
console.log(`   Still pending  : ${pendingFinal}`);
if (pendingFinal > 0) {
  const hasGroq = !!process.env.GROQ_API_KEY;
  const tip = hasGroq
    ? `node scripts/processBacklog.js ${batchSize} 20000   # Groq free (20s delay)`
    : `Add GROQ_API_KEY to .env (free at console.groq.com), then:\n   node scripts/processBacklog.js ${batchSize} 20000`;
  console.log(`\n   To finish: ${tip}`);
}
console.log(`${"═".repeat(65)}\n`);
