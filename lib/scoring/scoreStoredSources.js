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

  const results = [];

  for (const source of sources || []) {
    const scored = scoreSource(source);

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
        priority_score: scored.priority_score,
        priority_label: scored.priority_label,
        priority_reason: scored.priority_reason,
        score_version: scored.score_version,
      })
      .eq("id", source.id);

    if (updateError) throw updateError;

    results.push(scored);
  }

  return {
    count: results.length,
    score_version: results[0]?.score_version || "none",
    sources: results,
  };
}
