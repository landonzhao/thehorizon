import { supabase } from "../storage/supabaseClient.js";
import { scoreSource } from "./scoreSource.js";

export async function scoreStoredSources({ start, end, limit = 1000 } = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);

  const { data: sources, error } = await query;
  if (error) throw error;

  let count = 0;
  let score_version = "none";
  const errors = [];

  for (const source of sources || []) {
    try {
      const scored = scoreSource(source);
      score_version = scored.score_version;

      const { error: updateError } = await supabase
        .from("sources")
        .update({
          ai_security_relevance: scored.ai_security_relevance,
          severity_score: scored.severity_score,
          operational_impact_score: scored.operational_impact_score,
          novelty_score: scored.novelty_score,
          source_credibility_score: scored.source_credibility_score,
          singapore_relevance_score: scored.singapore_relevance_score,
          time_sensitivity_score: scored.time_sensitivity_score,
          report_quality_score: scored.report_quality_score,
          horizon_signal_score: scored.horizon_signal_score,
          priority_score: scored.priority_score,
          priority_label: scored.priority_label,
          priority_reason: scored.priority_reason,
          report_score: scored.report_score,
          score_version: scored.score_version,
        })
        .eq("id", source.id);

      if (updateError) throw updateError;
      count++;

    } catch (err) {
      console.error(`Scoring failed for source ${source.id}: ${err.message}`);
      errors.push({ id: source.id, error: err.message });
    }
  }

  return { count, error_count: errors.length, score_version, errors };
}
