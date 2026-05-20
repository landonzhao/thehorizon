import crypto from "crypto";
import { supabase } from "./supabaseClient.js";

export async function startIngestionRun() {
  const run = {
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    status: "running",
  };

  const { error } = await supabase.from("ingestion_runs").insert(run);
  if (error) throw error;

  return run.id;
}

export async function finishIngestionRun(runId, snapshot) {
  const { error } = await supabase
    .from("ingestion_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "success",
      reporting_window: snapshot.reporting_window,
      source_count: snapshot.count || 0,
      rejected_count: snapshot.rejected_count || 0,
      discarded_count: snapshot.discarded_count || 0,
      connector_results: snapshot.connector_results || [],
      pipeline_counts: snapshot.pipeline_counts || {},
    })
    .eq("id", runId);

  if (error) throw error;
}

export async function failIngestionRun(runId, errorObject) {
  const { error } = await supabase
    .from("ingestion_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "failed",
      error_message: errorObject?.message || String(errorObject),
    })
    .eq("id", runId);

  if (error) throw error;
}
