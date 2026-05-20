import { supabase } from "../storage/supabaseClient.js";
import { classifySourceWithRules } from "./ruleBasedClassifier.js";
import { extractClaimsWithGemini } from "../claims/extractClaimsWithGemini.js";
import { TAG_DEFINITIONS } from "./tagDefinitions.js";
import { ALLOWED_TAGS } from "./allowedTags.js";

const CLASSIFICATION_VERSION = "classify-v2.0";

// Only hard-delete sources with absolutely no AI/security signal.
// Everything else is tiered and kept in the archive for trend analysis.
const DELETE_THRESHOLD = 10;

// Gemini free tier: ~10 RPM. 7s between calls keeps us safely under.
const GEMINI_INTER_CALL_MS = 7000;

// Relevance tier thresholds (align with Gemini scoring scale)
// core     >= 40: AI threat is the primary subject
// adjacent 20–39: AI is a meaningful factor
// context  10–19: AI mentioned incidentally, useful as background
// off_topic < 10: no real AI relevance → deleted
const TIER_CORE = 40;
const TIER_ADJACENT = 20;

function shouldUseGemini(source) {
  if (!process.env.GEMINI_API_KEY) return false;
  const unprocessed = !source.claim_extraction_status;
  const highPriority = (source.priority_score || 0) >= 55;
  return unprocessed || highPriority;
}

// Rule-based AI specificity: sum ai_weight from TAG_DEFINITIONS phrases that hit the text.
function computeRuleAiSpecificity(text) {
  let score = 0;
  for (const def of TAG_DEFINITIONS) {
    if (!def.ai_weight || def.ai_weight === 0) continue;
    const hits = def.phrases.filter((p) => text.includes(p.toLowerCase()));
    if (hits.length > 0) score += def.ai_weight;
  }
  return Math.min(100, score);
}

export async function classifyStoredSources({ start, end, limit = 1000 } = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);

  const { data: sources, error } = await query;
  if (error) throw error;

  const results = [];
  const deleted = [];

  for (const source of sources || []) {
    let gemini_used = false;
    let tags, main_category, category_confidence, category_reason;
    let ai_specificity_score, ai_specificity_reason;
    let short_summary = null;
    let analyst_brief = null;
    let intelligence = null;

    if (shouldUseGemini(source)) {
      try {
        const extraction = await extractClaimsWithGemini(source);
        const cl = extraction.classification;

        tags = cl.tags;
        main_category = cl.main_category;
        category_confidence = cl.category_confidence;
        category_reason = cl.category_reason;
        ai_specificity_score = cl.ai_specificity_score;
        ai_specificity_reason = cl.ai_specificity_reason;
        short_summary = extraction.short_summary;
        analyst_brief = extraction.analyst_brief;
        intelligence = extraction.intelligence;
        gemini_used = true;
        await new Promise((r) => setTimeout(r, GEMINI_INTER_CALL_MS));
      } catch (err) {
        console.warn(`Gemini classification failed for ${source.id}: ${err.message}`);
      }
    }

    if (!gemini_used) {
      const classified = classifySourceWithRules(source);
      tags = classified.tags.filter((t) => ALLOWED_TAGS.includes(t));
      main_category = classified.rule_category;
      category_confidence = classified.rule_category_confidence || 20;
      category_reason = classified.rule_category_reason;

      const searchText = [source.title, source.summary, source.full_text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      ai_specificity_score = computeRuleAiSpecificity(searchText);
      ai_specificity_reason =
        ai_specificity_score > 0
          ? `Rule-based: AI-related phrases matched (score ${ai_specificity_score}/100).`
          : "Rule-based: no AI-related phrases matched.";
    }

    // Never delete manually curated sources — they are pre-validated as relevant.
    if (source.trust_tier === "curated") {
      const relevance_tier = source.relevance_tier || "core";
      const update = {
        tags: tags || source.tags,
        main_category: main_category || source.main_category,
        category_confidence,
        category_reason,
        ai_specificity_score: ai_specificity_score ?? source.ai_specificity_score,
        ai_specificity_reason,
        relevance_tier,
        tag_version: CLASSIFICATION_VERSION,
      };
      if (short_summary) update.short_summary = short_summary;
      if (analyst_brief) update.analyst_brief = analyst_brief;
      if (intelligence) update.intelligence = intelligence;
      if (gemini_used) {
        update.claim_extraction_status = "success";
        update.claim_extraction_version = CLASSIFICATION_VERSION;
      }
      const { error: updateError } = await supabase.from("sources").update(update).eq("id", source.id);
      if (updateError) throw updateError;
      results.push({ id: source.id, title: source.title, gemini_used, main_category: update.main_category, ai_specificity_score: update.ai_specificity_score, relevance_tier, tags: update.tags });
      continue;
    }

    // Hard-delete only truly off-topic sources (no AI or security signal at all).
    // Everything else is tiered and retained for archive and trend analysis.
    if (ai_specificity_score < DELETE_THRESHOLD) {
      const { error: deleteError } = await supabase
        .from("sources")
        .delete()
        .eq("id", source.id);

      if (deleteError) throw deleteError;

      deleted.push({
        id: source.id,
        title: source.title,
        ai_specificity_score,
        reason: `AI specificity score ${ai_specificity_score}/100 — off-topic; no AI or security signal.`,
      });
      continue;
    }

    const relevance_tier =
      ai_specificity_score >= TIER_CORE
        ? "core"
        : ai_specificity_score >= TIER_ADJACENT
          ? "adjacent"
          : "context";

    if (!main_category) {
      main_category = "uncategorised";
    }

    const update = {
      tags,
      main_category,
      category_confidence,
      category_reason,
      ai_specificity_score,
      ai_specificity_reason,
      relevance_tier,
      tag_version: CLASSIFICATION_VERSION,
    };

    if (short_summary) update.short_summary = short_summary;
    if (analyst_brief) update.analyst_brief = analyst_brief;
    if (intelligence) update.intelligence = intelligence;

    if (gemini_used) {
      update.claim_extraction_status = "success";
      update.claim_extraction_version = CLASSIFICATION_VERSION;
    }

    const { error: updateError } = await supabase
      .from("sources")
      .update(update)
      .eq("id", source.id);

    if (updateError) throw updateError;

    results.push({
      id: source.id,
      title: source.title,
      gemini_used,
      main_category,
      ai_specificity_score,
      relevance_tier,
      tags,
    });
  }

  return {
    count: results.length,
    deleted_count: deleted.length,
    classification_version: CLASSIFICATION_VERSION,
    gemini_count: results.filter((r) => r.gemini_used).length,
    rule_count: results.filter((r) => !r.gemini_used).length,
    tier_counts: {
      core: results.filter((r) => r.relevance_tier === "core").length,
      adjacent: results.filter((r) => r.relevance_tier === "adjacent").length,
      context: results.filter((r) => r.relevance_tier === "context").length,
    },
    sources: results,
    deleted,
  };
}
