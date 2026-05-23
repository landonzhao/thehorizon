import { supabase } from "../storage/supabaseClient.js";
import { scoreSource } from "./scoreSource.js";
import { scoreSourceV6 } from "./scoreSourceV6.js";
import { extractSourceIntelligence } from "./extractSourceIntelligence.js";

// Tracks whether the v6-only columns exist in the DB.
// On first column-missing error, set to false and omit those columns
// from subsequent writes — no restart required.
let v6ColumnsAvailable = true;

async function gracefulUpdate(id, payload) {
  if (!v6ColumnsAvailable) {
    const { llm_extracted_intelligence, publisher_type, event_type, ...rest } = payload;
    const { error } = await supabase.from("sources").update(rest).eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("sources").update(payload).eq("id", id);
  if (error) {
    // Detect "column does not exist" — Postgres error code 42703
    if (error.code === "42703" || (error.message || "").includes("column") && (error.message || "").includes("does not exist")) {
      console.warn("  v6 columns not present in DB — falling back to v5 column set");
      v6ColumnsAvailable = false;
      return gracefulUpdate(id, payload);
    }
    throw error;
  }
}

export async function scoreStoredSources({
  start,
  end,
  limit = 1000,
  testSet = false,
  useV6 = false,
} = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", { ascending: false })
    .limit(limit);

  if (testSet) query = query.eq("in_test_set", true);
  if (start)   query = query.gte("date_published", start);
  if (end)     query = query.lt("date_published", end);

  const { data: sources, error } = await query;
  if (error) throw error;

  let count = 0;
  let score_version = "none";
  const errors = [];

  for (const source of sources || []) {
    try {
      let scored;

      if (useV6) {
        // Phase 1: extract scoring intelligence (idempotent if already done)
        let intel = source.llm_extracted_intelligence;
        if (!intel || !intel.event_type) {
          intel = await extractSourceIntelligence(source);
          source.llm_extracted_intelligence = intel;
        }

        // Phase 2: deterministic v6 scoring
        scored = scoreSourceV6(source);
      } else {
        scored = scoreSource(source);
      }

      score_version = scored.score_version;

      const baseUpdate = {
        ai_security_relevance:      scored.ai_security_relevance,
        severity_score:             scored.severity_score,
        operational_impact_score:   scored.operational_impact_score,
        novelty_score:              scored.novelty_score,
        source_credibility_score:   scored.source_credibility_score,
        singapore_relevance_score:  scored.singapore_relevance_score,
        time_sensitivity_score:     scored.time_sensitivity_score,
        report_quality_score:       scored.report_quality_score,
        horizon_signal_score:       scored.horizon_signal_score,
        priority_score:             scored.priority_score,
        priority_label:             scored.priority_label,
        priority_reason:            scored.priority_reason,
        report_score:               scored.report_score,
        score_version:              scored.score_version,
      };

      const payload = useV6
        ? {
            ...baseUpdate,
            llm_extracted_intelligence: source.llm_extracted_intelligence || null,
            publisher_type:             scored.publisher_type || null,
            event_type:                 scored.event_type || null,
          }
        : baseUpdate;

      await gracefulUpdate(source.id, payload);
      count++;

    } catch (err) {
      console.error(`Scoring failed for source ${source.id}: ${err.message}`);
      errors.push({ id: source.id, error: err.message });
    }
  }

  return { count, error_count: errors.length, score_version, errors };
}
