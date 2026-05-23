/**
 * Persists the intelligence base (events, trends, shifts, convergence) to Supabase.
 *
 * Uses graceful table-availability fallbacks so the pipeline runs even if
 * the intelligence-v1.sql migration has not yet been applied.
 */

import { supabase } from "./supabaseClient.js";

let eventsTableAvailable          = true;
let trendsTableAvailable          = true;
let strategicShiftsTableAvailable = true;
let convergenceTableAvailable     = true;

async function upsertEvents(events) {
  if (!eventsTableAvailable) return;

  const rows = events.map((e) => ({
    event_id:              e.event_id,
    event_title:           e.event_title,
    event_type:            e.event_type,
    threat_category:       e.threat_category,
    affected_ai_stack_layers: e.affected_ai_stack_layers || [],
    affected_products:     e.affected_products || [],
    affected_sectors:      e.affected_sectors || [],
    cve_ids:               e.cve_ids || [],
    threat_actors:         e.threat_actors || [],
    geographic_scope:      e.geographic_scope || [],
    tags:                  e.tags || [],
    summary:               e.summary || null,
    what_happened:         e.what_happened || null,
    how_it_happened:       e.how_it_happened || null,
    why_it_matters:        e.why_it_matters || null,
    defender_implications: e.defender_implications || null,
    strategic_implications: e.strategic_implications || null,
    watch_indicators:      e.watch_indicators || [],
    evidence_level:        e.evidence_level,
    exploitation_status:   e.exploitation_status,
    maturity_level:        e.maturity_level || null,
    operationalization_level: e.operationalization_level || null,
    confidence_level:      e.confidence_level || null,
    source_limitations:    e.source_limitations || null,
    first_seen:            e.first_seen,
    last_seen:             e.last_seen,
    source_count:          e.source_count || 1,
    primary_source_id:     e.primary_source_id || null,
    supporting_source_ids: e.supporting_source_ids || [],
    event_priority_score:  e.event_priority_score || 0,
    event_report_score:    e.event_report_score || 0,
    singapore_asean_relevance: e.singapore_asean_relevance || false,
    priority_label:        e.priority_label || null,
    updated_at:            new Date().toISOString(),
  }));

  const { error } = await supabase.from("events").upsert(rows, { onConflict: "event_id" });
  if (error) {
    if (error.code === "42P01") { eventsTableAvailable = false; console.warn("  events table not present — run docs/migrations/intelligence-v1.sql"); return; }
    throw error;
  }
}

async function upsertEventSources(events, source_to_event) {
  if (!eventsTableAvailable) return;

  const rows = [];
  for (const event of events) {
    if (event.primary_source_id) {
      rows.push({ event_id: event.event_id, source_id: event.primary_source_id, role: "primary" });
    }
    for (const sid of event.supporting_source_ids || []) {
      rows.push({ event_id: event.event_id, source_id: sid, role: "supporting" });
    }
  }

  if (rows.length === 0) return;
  const { error } = await supabase.from("event_sources").upsert(rows, { onConflict: "event_id,source_id", ignoreDuplicates: true });
  if (error && error.code !== "42P01") throw error;
}

async function updateSourceEventIds(source_to_event) {
  // Write back event_cluster_id to sources table (scaffolding column from ingestion-v2)
  const updates = [];
  for (const [sourceId, eventId] of source_to_event.entries()) {
    updates.push({ id: sourceId, event_cluster_id: eventId });
  }
  // Batch updates
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const upd of batch) {
      const { error } = await supabase.from("sources").update({ event_cluster_id: upd.event_cluster_id }).eq("id", upd.id);
      if (error && error.code !== "42703") console.warn(`  Warning: could not update event_cluster_id for source ${upd.id}: ${error.message}`);
    }
  }
}

async function upsertTrends(trends) {
  if (!trendsTableAvailable) return;

  const rows = trends.map((t) => ({
    trend_id:              t.trend_id,
    trend_title:           t.trend_title || null,
    threat_categories:     t.threat_categories || [],
    affected_ai_stack_layers: t.affected_ai_stack_layers || [],
    supporting_event_ids:  t.supporting_event_ids || [],
    supporting_source_count: t.supporting_source_count || 0,
    dominant_tags:         t.dominant_tags || [],
    cve_ids:               t.cve_ids || [],
    geographic_scope:      t.geographic_scope || [],
    singapore_asean_relevance: t.singapore_asean_relevance || false,
    affected_sectors:      t.affected_sectors || [],
    summary:               t.summary || null,
    evidence_summary:      t.evidence_summary || null,
    trend_strength:        t.trend_strength || null,
    maturity_level:        t.maturity_level || null,
    trajectory:            t.trajectory || null,
    confidence_level:      t.confidence_level || null,
    strategic_significance: t.strategic_significance || null,
    operational_relevance: t.operational_relevance || null,
    watch_window:          t.watch_window || null,
    defender_implications: t.defender_implications || null,
    key_indicators_next_month: t.key_indicators_next_month || [],
    first_seen:            t.first_seen,
    latest_seen:           t.latest_seen,
    trend_score:           t.trend_score || 0,
    max_event_priority:    t.max_event_priority || 0,
    updated_at:            new Date().toISOString(),
  }));

  const { error } = await supabase.from("trends").upsert(rows, { onConflict: "trend_id" });
  if (error) {
    if (error.code === "42P01") { trendsTableAvailable = false; console.warn("  trends table not present — run docs/migrations/intelligence-v1.sql"); return; }
    throw error;
  }
}

async function upsertStrategicShifts(shifts) {
  if (!strategicShiftsTableAvailable) return;

  const rows = shifts.map((s, i) => ({
    shift_id:              `shift-${new Date().toISOString().slice(0, 10)}-${i}`,
    shift_title:           s.shift_title,
    previous_assumption:   s.previous_assumption,
    emerging_reality:      s.emerging_reality,
    supporting_trend_titles: s.supporting_trend_titles || [],
    implications_for_defenders: s.implications_for_defenders,
    confidence_level:      s.confidence_level,
    maturity_level:        s.maturity_level,
    expected_watch_window: s.expected_watch_window,
    singapore_asean_relevance: s.singapore_asean_relevance || false,
    why_this_matters:      s.why_this_matters,
    generated_at:          new Date().toISOString(),
  }));

  const { error } = await supabase.from("strategic_shifts").upsert(rows, { onConflict: "shift_id" });
  if (error) {
    if (error.code === "42P01") { strategicShiftsTableAvailable = false; console.warn("  strategic_shifts table not present — run docs/migrations/intelligence-v1.sql"); return; }
    throw error;
  }
}

async function upsertConvergencePoints(points) {
  if (!convergenceTableAvailable) return;

  const rows = points.map((p) => ({
    pattern_id:            p.pattern_id,
    title:                 p.title,
    involved_categories:   p.involved_categories || [],
    involved_stack_layers: p.involved_stack_layers || [],
    supporting_trend_ids:  p.supporting_trend_ids || [],
    supporting_event_ids:  p.supporting_event_ids || [],
    supporting_event_count: p.supporting_event_count || 0,
    strategic_risk:        p.strategic_risk,
    defender_gap:          p.defender_gap,
    watch_indicators:      p.watch_indicators || [],
    singapore_asean_relevance: p.singapore_asean_relevance || false,
    detected_at:           new Date().toISOString(),
  }));

  const { error } = await supabase.from("convergence_points").upsert(rows, { onConflict: "pattern_id" });
  if (error) {
    if (error.code === "42P01") { convergenceTableAvailable = false; console.warn("  convergence_points table not present — run docs/migrations/intelligence-v1.sql"); return; }
    throw error;
  }
}

export async function storeIntelligenceBase({
  events,
  trends,
  strategicShifts,
  convergencePoints,
  source_to_event,
  event_to_trend,
}) {
  await upsertEvents(events);
  await upsertEventSources(events, source_to_event);
  await updateSourceEventIds(source_to_event);
  await upsertTrends(trends);
  await upsertStrategicShifts(strategicShifts);
  await upsertConvergencePoints(convergencePoints);
}
