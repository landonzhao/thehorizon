import { supabase } from "../lib/storage/supabaseClient.js";

export default async function handler(req, res) {
  try {
    const limit = Number(req.query.limit || 30);

    const { data, error } = await supabase
      .from("ingestion_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return res.status(200).json({
      count: data.length,
      runs: data,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
