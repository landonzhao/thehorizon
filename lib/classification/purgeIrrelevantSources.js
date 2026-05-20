import { supabase } from "../storage/supabaseClient.js";
import { TAG_DEFINITIONS } from "./tagDefinitions.js";

// Must match DELETE_THRESHOLD in classifyStoredSources.js.
// Only hard-deletes truly off-topic sources; adjacent/context sources are kept
// for archive and trend analysis.
const AI_SPECIFICITY_THRESHOLD = 10;

// Batch size for DB operations to avoid query size limits
const BATCH_SIZE = 100;

function computeRuleAiSpecificity(text) {
  let score = 0;
  for (const def of TAG_DEFINITIONS) {
    if (!def.ai_weight || def.ai_weight === 0) continue;
    const hits = def.phrases.filter((p) => text.includes(p.toLowerCase()));
    if (hits.length > 0) score += def.ai_weight;
  }
  return Math.min(100, score);
}

async function deleteSourceBatch(ids) {
  const { error } = await supabase
    .from("sources")
    .delete()
    .in("id", ids);
  if (error) throw error;
}

/**
 * Purge all sources in the database that are not relevant to the AI threat
 * landscape. This handles:
 *   1. Sources already classified with ai_specificity_score < threshold → delete.
 *   2. Sources not yet classified → run rule-based check; if score = 0 (no AI
 *      phrases at all), delete. Sources with any rule-based AI signal are left
 *      for the classify pipeline to evaluate properly with Gemini.
 *
 * Returns counts of deleted and retained sources.
 */
export async function purgeIrrelevantSources({ limit = 5000 } = {}) {
  let totalDeleted = 0;
  let totalRetained = 0;
  const deletedSample = [];

  // ── Pass 1: classified sources below threshold ───────────────────────────
  {
    let query = supabase
      .from("sources")
      .select("id, title, ai_specificity_score")
      .not("ai_specificity_score", "is", null)
      .lt("ai_specificity_score", AI_SPECIFICITY_THRESHOLD)
      .neq("trust_tier", "curated")   // never purge manually curated sources
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const ids = (data || []).map((s) => s.id);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      await deleteSourceBatch(ids.slice(i, i + BATCH_SIZE));
    }

    totalDeleted += ids.length;
    deletedSample.push(
      ...(data || []).slice(0, 20).map((s) => ({
        id: s.id,
        title: s.title,
        ai_specificity_score: s.ai_specificity_score,
        reason: `Classified: score ${s.ai_specificity_score}/100 below threshold ${AI_SPECIFICITY_THRESHOLD}`,
      }))
    );
  }

  // ── Pass 2: unclassified sources with zero rule-based AI signal ──────────
  {
    let query = supabase
      .from("sources")
      .select("id, title, summary, full_text, trust_tier")
      .is("ai_specificity_score", null)
      .neq("trust_tier", "curated")   // never purge manually curated sources
      .limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    const toDelete = [];

    for (const source of data || []) {
      const text = [source.title, source.summary, source.full_text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const score = computeRuleAiSpecificity(text);

      if (score === 0) {
        toDelete.push(source);
      } else {
        totalRetained += 1;
      }
    }

    const idsToDelete = toDelete.map((s) => s.id);
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      await deleteSourceBatch(idsToDelete.slice(i, i + BATCH_SIZE));
    }

    totalDeleted += toDelete.length;
    deletedSample.push(
      ...toDelete.slice(0, 20).map((s) => ({
        id: s.id,
        title: s.title,
        ai_specificity_score: 0,
        reason: "Unclassified: zero rule-based AI signal",
      }))
    );
  }

  return {
    deleted_count: totalDeleted,
    retained_unclassified_count: totalRetained,
    ai_specificity_threshold: AI_SPECIFICITY_THRESHOLD,
    deleted_sample: deletedSample.slice(0, 40),
  };
}
