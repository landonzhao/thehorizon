import { supabase } from "../storage/supabaseClient.js";
import { classifySource } from "./classifySource.js";

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

  const classified = (sources || []).map(classifySource);

  for (const source of classified) {
    const { error: updateError } = await supabase
      .from("sources")
      .update({
        tags: source.tags,
        main_category: source.main_category,
        category_confidence: source.category_confidence,
        category_reason: source.category_reason,
        tag_version: source.tag_version,
      })
      .eq("id", source.id);

    if (updateError) throw updateError;
  }

  return {
    count: classified.length,
    sources: classified,
  };
}
