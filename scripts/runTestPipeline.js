/**
 * Test pipeline orchestrator.
 *
 * Runs the full pipeline on a small test set and prints a structured
 * evaluation report showing scores, tags, issue flags, and quality signals.
 *
 * Usage:
 *   node scripts/runTestPipeline.js                   # score + evaluate existing test set
 *   node scripts/runTestPipeline.js --new-set          # select new sources, then run
 *   node scripts/runTestPipeline.js --enrich           # force re-enrich test set, then score + evaluate
 *   node scripts/runTestPipeline.js --v6               # use v6 scoring (requires LLM key)
 *   node scripts/runTestPipeline.js --new-set --enrich --v6  # full fresh pipeline
 *
 * Flags:
 *   --new-set       Clear existing test set marks and select fresh sources
 *   --enrich        Re-enrich test set sources (clears claim_extraction_status first)
 *   --v6            Run v6 LLM intelligence extraction + type-aware scoring
 *   --delay=N       ms between enrichment calls (default 1000 for OpenAI, 7000 for Gemini)
 */

import "dotenv/config";
import { supabase } from "../lib/storage/supabaseClient.js";
import { enrichSource } from "../lib/claims/enrichSource.js";
import { deriveCategory } from "../lib/classification/deriveCategory.js";
import { ALLOWED_TAGS } from "../lib/classification/allowedTags.js";
import { scoreSource } from "../lib/scoring/scoreSource.js";
import { scoreSourceV6 } from "../lib/scoring/scoreSourceV6.js";
import { extractSourceIntelligence } from "../lib/scoring/extractSourceIntelligence.js";

const args = process.argv.slice(2);
const FLAG_NEW_SET = args.includes("--new-set");
const FLAG_ENRICH  = args.includes("--enrich");
const FLAG_V6      = args.includes("--v6");
const delayArg     = args.find((a) => a.startsWith("--delay="));
const DELAY_MS     = delayArg ? parseInt(delayArg.split("=")[1]) :
  (process.env.OPENAI_API_KEY ? 500 : 7000);

const CLASSIFICATION_VERSION = "classify-v5.0";
const TIER_CORE = 40;
const TIER_ADJACENT = 20;
const DELETE_THRESHOLD = 10;
const PER_CATEGORY = 3;
const CATEGORIES = ["traditional_ai_threats", "llm_threats", "agentic_ai_threats", "ai_enabled_threats"];
const TIER_ORDER = ["primary", "curated", "high", "medium", "low", "unknown"];

// Filler phrase detector for why_it_matters quality check.
// Note: "The [specific entity]..." is acceptable per the prompt — only ban vague "The" openers.
const FILLER_PATTERNS = [
  /^this /i, /^it /i, /^these /i,
  /^the (growing|increasing|rise of|importance of|need for|use of|adoption of|emergence of)/i,
  /underscores the importance/i, /highlights the need/i, /highlights the importance/i,
  /demonstrates how/i, /demonstrates the potential/i, /it is worth noting/i,
  /it is important to/i, /more robust security/i, /enhanced security/i,
  /robust security posture/i, /security measures/i, /potentially reducing/i,
  /potentially leading/i, /potentially impacting/i, /could lead to more/i,
  /can be used to/i, /automate and scale/i, /time and resources required/i,
  /\bpotentially\b/i,
];

const BANNED_MODEL_EXTRACTION_WORDS = ["probe", "steering", "activation", "representation", "latent", "gradient", "jailbreak", "white-box"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, w) => String(s ?? "").padEnd(w).slice(0, w);
const padL = (s, w) => String(s ?? "").padStart(w).slice(0, w);

function priorityIcon(label) {
  return { critical: "★★", high: "★ ", medium: "◆ ", low: "▷ ", background: "· " }[label] ?? "  ";
}

function checkWhyItMatters(text) {
  if (!text || text.length < 10) return "MISSING";
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(text)) return `FILLER: "${text.slice(0, 80)}"`;
  }
  return null;
}

function checkFalseModelExtraction(source) {
  if (!(source.tags || []).includes("model_extraction")) return null;
  const text = [source.title, source.full_text || ""].join(" ").toLowerCase();
  const hit = BANNED_MODEL_EXTRACTION_WORDS.find((w) => text.includes(w));
  if (hit) return `model_extraction tag + "${hit}" in text — likely false positive`;
  return null;
}

function checkFalseDisinfo(source) {
  if (!(source.tags || []).includes("ai_disinformation")) return null;
  const text = [source.title, source.full_text || ""].join(" ").toLowerCase();
  if (!/influence operation|synthetic narrative|fake news|coordinated inauthentic|propaganda/i.test(text)) {
    return "ai_disinformation tag on non-influence-operation source — likely false positive";
  }
  return null;
}

function checkUncategorisedWithTags(source) {
  if (source.main_category !== "uncategorised") return null;
  const threatTags = (source.tags || []).filter((t) => !["cve", "vulnerability", "research", "actively_exploited", "proof_of_concept", "supply_chain", "critical_infrastructure", "nation_state"].includes(t));
  if (threatTags.length > 0) return `uncategorised but has threat tags: ${threatTags.join(", ")}`;
  return null;
}

// ── Stage: select test set ────────────────────────────────────────────────────

async function selectTestSet() {
  console.log("\n── Selecting new test set ──────────────────────────────────────");

  await supabase.from("sources").update({ in_test_set: false }).eq("in_test_set", true);

  const selected = [];
  for (const category of CATEGORIES) {
    const { data, error } = await supabase
      .from("sources")
      .select("id, title, main_category, trust_tier, source_type, claim_extraction_status, relevance_tier, ai_specificity_score")
      .eq("main_category", category)
      .not("relevance_tier", "is", null)
      .order("date_published", { ascending: false })
      .limit(60);

    if (error) throw error;
    if (!data?.length) { console.warn(`  [warn] No sources for: ${category}`); continue; }

    // Prefer unenriched sources, then by trust tier diversity
    const ranked = [...data].sort((a, b) => {
      const aRaw = !a.claim_extraction_status ? 0 : 1;
      const bRaw = !b.claim_extraction_status ? 0 : 1;
      if (aRaw !== bRaw) return aRaw - bRaw;
      return TIER_ORDER.indexOf(a.trust_tier ?? "unknown") - TIER_ORDER.indexOf(b.trust_tier ?? "unknown");
    });

    const picks = [];
    const usedTypes = new Set();
    for (const s of ranked) {
      if (picks.length >= PER_CATEGORY) break;
      if (!usedTypes.has(s.source_type) || picks.length === PER_CATEGORY - 1) {
        picks.push(s); usedTypes.add(s.source_type);
      }
    }
    for (const s of ranked) {
      if (picks.length >= PER_CATEGORY) break;
      if (!picks.find((p) => p.id === s.id)) picks.push(s);
    }
    selected.push(...picks);
  }

  if (!selected.length) {
    console.error("No sources selected — check that classified sources exist.");
    process.exit(1);
  }

  const ids = selected.map((s) => s.id);
  const { error } = await supabase.from("sources").update({ in_test_set: true }).in("id", ids);
  if (error) throw error;

  for (const s of selected) {
    const enriched = s.claim_extraction_status === "success" ? "✓ llm" : "  raw";
    console.log(`  [${enriched}] ${pad(s.main_category, 24)} ${pad(s.trust_tier, 8)} ${pad(s.source_type, 14)} ${s.title?.slice(0, 44)}`);
  }
  console.log(`  → ${selected.length} sources marked in_test_set = true`);
}

// ── Stage: enrich ─────────────────────────────────────────────────────────────

async function enrichTestSet(sources) {
  console.log("\n── Enriching test set ──────────────────────────────────────────");

  // Clear extraction status so all test set sources get re-enriched
  const ids = sources.map((s) => s.id);
  await supabase.from("sources").update({ claim_extraction_status: null, tag_version: null }).in("id", ids);

  const hasKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_2
    || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || process.env.GROQ_API_KEY;
  if (!hasKey) {
    console.warn("  No LLM API keys — skipping enrichment. Sources will score without LLM data.");
    return;
  }

  let enriched = 0;
  let errors = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    process.stdout.write(`  [${i + 1}/${sources.length}] ${source.title?.slice(0, 55)}… `);

    try {
      const extraction = await enrichSource(source);
      const cl = extraction.classification;
      const aiScore = cl.ai_specificity_score ?? 0;
      const isCurated = source.trust_tier === "curated" || (source.tags || []).includes("curated");

      if (!isCurated && aiScore < DELETE_THRESHOLD) {
        await supabase.from("sources").delete().eq("id", source.id);
        console.log(`DELETED (ai_score=${aiScore})`);
        errors++;
        continue;
      }

      const relevance_tier = isCurated ? (source.relevance_tier || "core")
        : aiScore >= TIER_CORE ? "core" : aiScore >= TIER_ADJACENT ? "adjacent" : "context";

      const tags = (cl.tags || []).filter((t) => ALLOWED_TAGS.includes(t));
      const { main_category, category_confidence } = deriveCategory(tags);

      const update = {
        tags, main_category, category_confidence,
        ai_specificity_score: aiScore,
        ai_specificity_reason: cl.ai_specificity_reason,
        relevance_tier,
        tag_version: CLASSIFICATION_VERSION,
        claim_extraction_status: "success",
        claim_extraction_version: CLASSIFICATION_VERSION,
      };
      if (extraction.short_summary) update.short_summary = extraction.short_summary;
      if (extraction.analyst_brief) update.analyst_brief = extraction.analyst_brief;
      if (extraction.intelligence)  update.intelligence  = extraction.intelligence;
      if (extraction.claims)        update.claims        = extraction.claims;

      // Also update source object in memory for scoring pass
      Object.assign(source, update);

      const { error: upErr } = await supabase.from("sources").update(update).eq("id", source.id);
      if (upErr) throw upErr;

      console.log(`ok  cat=${main_category?.split("_")[0]} score=${aiScore} tier=${relevance_tier}`);
      enriched++;
    } catch (err) {
      console.log(`ERR ${err.message.slice(0, 80)}`);
      errors++;
    }

    if (i < sources.length - 1 && DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(`  Enriched: ${enriched}/${sources.length}  Errors: ${errors}`);
}

// ── Stage: score ──────────────────────────────────────────────────────────────

async function scoreTestSet(sources) {
  console.log(`\n── Scoring test set ${FLAG_V6 ? "[v6]" : "[v5]"} ─────────────────────────────────────`);

  let scored = 0;
  let errors = 0;
  const results = [];

  for (const source of sources) {
    try {
      let scoredSource;

      if (FLAG_V6) {
        let intel = source.llm_extracted_intelligence;
        if (!intel?.event_type) {
          process.stdout.write(`  extracting intel for ${source.title?.slice(0, 40)}… `);
          intel = await extractSourceIntelligence(source);
          source.llm_extracted_intelligence = intel;

          // Persist to DB (gracefully — columns may not exist)
          try {
            await supabase.from("sources").update({ llm_extracted_intelligence: intel }).eq("id", source.id);
          } catch {}
          console.log(`ok (${intel?.event_type})`);
        }
        scoredSource = scoreSourceV6(source);
      } else {
        scoredSource = scoreSource(source);
      }

      const update = {
        ai_security_relevance:     scoredSource.ai_security_relevance,
        severity_score:            scoredSource.severity_score,
        operational_impact_score:  scoredSource.operational_impact_score,
        novelty_score:             scoredSource.novelty_score,
        source_credibility_score:  scoredSource.source_credibility_score,
        singapore_relevance_score: scoredSource.singapore_relevance_score,
        time_sensitivity_score:    scoredSource.time_sensitivity_score,
        report_quality_score:      scoredSource.report_quality_score,
        horizon_signal_score:      scoredSource.horizon_signal_score,
        priority_score:            scoredSource.priority_score,
        priority_label:            scoredSource.priority_label,
        priority_reason:           scoredSource.priority_reason,
        report_score:              scoredSource.report_score,
        score_version:             scoredSource.score_version,
      };
      if (FLAG_V6) {
        try {
          await supabase.from("sources").update({
            ...update,
            publisher_type: scoredSource.publisher_type || null,
            event_type: scoredSource.event_type || null,
          }).eq("id", source.id);
        } catch {
          await supabase.from("sources").update(update).eq("id", source.id);
        }
      } else {
        await supabase.from("sources").update(update).eq("id", source.id);
      }

      results.push({ ...source, ...update, llm_extracted_intelligence: source.llm_extracted_intelligence });
      scored++;
    } catch (err) {
      console.error(`  ERR ${source.id}: ${err.message}`);
      errors++;
      results.push(source);
    }
  }

  console.log(`  Scored: ${scored}/${sources.length}  Errors: ${errors}`);
  return results;
}

// ── Stage: evaluate ───────────────────────────────────────────────────────────

function evaluate(sources) {
  const divider = "─".repeat(80);
  const header  = "═".repeat(80);

  console.log(`\n${header}`);
  console.log(` Test Set Evaluation Report — ${new Date().toISOString().slice(0, 10)}${FLAG_V6 ? " [v6]" : " [v5]"}`);
  console.log(header);

  const scoreLabels = { critical: 0, high: 0, medium: 0, low: 0, background: 0 };
  const allIssues = [];

  // Sort by priority_score descending
  const sorted = [...sources].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const label = s.priority_label || "background";
    scoreLabels[label] = (scoreLabels[label] || 0) + 1;

    const intel = s.llm_extracted_intelligence;
    const icon  = priorityIcon(label);
    const p     = padL(s.priority_score ?? "?", 3);
    const r     = padL(s.report_score ?? "?", 3);

    console.log(`\n[${i + 1}/${sorted.length}] ${icon} ${label.toUpperCase().padEnd(10)} p=${p}  r=${r}  rep=${pad(s.report_quality_score, 3)}`);
    console.log(`  ${s.title?.slice(0, 75)}`);
    console.log(`  cat=${pad(s.main_category, 22)} ai=${padL(s.ai_specificity_score, 3)}  trust=${pad(s.trust_tier, 8)}  type=${s.source_type}`);

    const tags = (s.tags || []).filter((t) => !["research", "vulnerability"].includes(t));
    if (tags.length) console.log(`  tags: ${tags.join(", ")}`);

    if (FLAG_V6 && intel) {
      console.log(`  v6:  event=${pad(intel.event_type, 22)} evidence=${pad(intel.evidence_level, 24)} novelty=${intel.attack_novelty}`);
      console.log(`       publisher=${pad(intel.publisher_type, 20)} layers=${(intel.affected_ai_layer || []).join(", ") || "none"}`);
    }

    // Score breakdown
    console.log(`  scores: ai=${s.ai_security_relevance} sev=${s.severity_score} op=${s.operational_impact_score} nov=${s.novelty_score} cred=${s.source_credibility_score} sg=${s.singapore_relevance_score} time=${s.time_sensitivity_score}`);

    // Quality checks
    const issues = [];
    const wim = s.analyst_brief?.why_it_matters || "";
    const wimCheck = checkWhyItMatters(wim);
    if (wimCheck) issues.push(wimCheck);

    const meCheck = checkFalseModelExtraction(s);
    if (meCheck) issues.push(meCheck);

    const disinfoCheck = checkFalseDisinfo(s);
    if (disinfoCheck) issues.push(disinfoCheck);

    const catCheck = checkUncategorisedWithTags(s);
    if (catCheck) issues.push(catCheck);

    // Missing fields
    const brief = s.analyst_brief || {};
    const missingFields = ["what_happened", "how_it_happened", "why_it_matters"]
      .filter((k) => (brief[k] || "").length < 30);
    if (missingFields.length) issues.push(`short/missing brief fields: ${missingFields.join(", ")}`);

    if (issues.length) {
      for (const issue of issues) {
        console.log(`  ⚠  ${issue}`);
        allIssues.push({ id: s.id, title: s.title?.slice(0, 40), issue });
      }
    } else {
      const wimPreview = wim.slice(0, 100);
      if (wim) console.log(`  ✓  why_it_matters: "${wimPreview}${wim.length > 100 ? "…" : ""}"`);
    }
  }

  // Summary
  console.log(`\n${header}`);
  console.log(` SUMMARY`);
  console.log(divider);

  const labelLine = Object.entries(scoreLabels)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join("  ");
  console.log(` Score distribution: ${labelLine}`);

  const avgPriority = Math.round(sorted.reduce((s, x) => s + (x.priority_score || 0), 0) / sorted.length);
  const avgReport   = Math.round(sorted.reduce((s, x) => s + (x.report_score || 0), 0) / sorted.length);
  console.log(` Avg priority: ${avgPriority}  Avg report: ${avgReport}`);

  if (allIssues.length) {
    console.log(`\n Issues (${allIssues.length}):`);
    for (const { title, issue } of allIssues) {
      console.log(`   ⚠  [${title}] ${issue}`);
    }
  } else {
    console.log("\n No issues detected ✓");
  }

  console.log(header);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(80)}`);
console.log(` Test Pipeline${FLAG_NEW_SET ? " --new-set" : ""}${FLAG_ENRICH ? " --enrich" : ""}${FLAG_V6 ? " --v6" : ""}  delay=${DELAY_MS}ms`);
console.log(`${"═".repeat(80)}`);

if (FLAG_NEW_SET) await selectTestSet();

// Fetch the test set (full rows for scoring + evaluation)
const { data: testSources, error: fetchErr } = await supabase
  .from("sources")
  .select("*")
  .eq("in_test_set", true)
  .order("main_category");

if (fetchErr) throw fetchErr;
if (!testSources?.length) {
  console.error("No sources in test set. Run with --new-set to select sources.");
  process.exit(1);
}

console.log(`\n Test set: ${testSources.length} sources`);

if (FLAG_ENRICH) await enrichTestSet(testSources);

const scored = await scoreTestSet(testSources);
evaluate(scored);
