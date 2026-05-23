import { supabase } from "./supabaseClient.js";
import { uploadArchiveJson } from "./blobArchiveStore.js";

// Set to false after the first Postgres "column does not exist" error (code 42703).
// Falls back to the v1 column set (without ingestion-v2 fields) so the daily cron
// keeps running even if the DB migration hasn't been applied yet.
let ingestionV2ColumnsAvailable = true;

const INGESTION_V2_COLUMNS = new Set([
  "date_published_actual", "date_discovered", "date_confidence",
  "structural_validity_score", "publisher_trust_score",
  "url_safety_status", "final_url", "url_reachable",
  "eligible_for_daily_report", "eligible_for_weekly_report",
  "eligible_for_monthly_report", "eligible_for_archive",
  "eligible_for_trend_analysis", "eligible_for_reference_context", "needs_review",
  "event_cluster_id", "cluster_key", "is_primary_source",
  "is_follow_on_source", "adds_new_information", "related_sources",
]);

function toV1Row(row) {
  const v1 = { ...row };
  for (const col of INGESTION_V2_COLUMNS) delete v1[col];
  return v1;
}

async function upsertSourceRows(rows) {
  if (!ingestionV2ColumnsAvailable) {
    const { error } = await supabase.from("sources").upsert(rows.map(toV1Row), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("sources").upsert(rows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });

  if (error?.code === "42703") {
    ingestionV2ColumnsAvailable = false;
    console.warn(
      "Ingestion v2 DB columns not present — falling back to v1 schema. " +
      "Run the migration SQL in docs/migrations/ingestion-v2.sql to enable new fields."
    );
    const { error: retryError } = await supabase.from("sources").upsert(rows.map(toV1Row), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    if (retryError) throw retryError;
    return;
  }

  if (error) throw error;
}

function getSnapshotDateKey(reportingWindow = {}) {
  const end =
    reportingWindow.end_sgt ||
    reportingWindow.end_local ||
    reportingWindow.end_utc;

  if (!end) {
    return new Date().toISOString().slice(0, 10);
  }

  return end.slice(0, 10);
}

function getStartLocal(reportingWindow = {}) {
  return (
    reportingWindow.start_sgt ||
    reportingWindow.start_local ||
    reportingWindow.start_utc ||
    null
  );
}

function getEndLocal(reportingWindow = {}) {
  return (
    reportingWindow.end_sgt ||
    reportingWindow.end_local ||
    reportingWindow.end_utc ||
    null
  );
}

export async function saveSnapshotToDatabase(snapshot) {
  const snapshotId = `snapshot-${getSnapshotDateKey(
    snapshot.reporting_window
  )}`;

  const blob = await uploadArchiveJson(
    `snapshots/${snapshotId}.json`,
    snapshot
  );

  const snapshotRow = {
    snapshot_id: snapshotId,
    period: snapshot.period,
    generated_at: snapshot.generated_at,

    start_utc: snapshot.reporting_window.start_utc,
    end_utc: snapshot.reporting_window.end_utc,

    start_local: getStartLocal(snapshot.reporting_window),
    end_local: getEndLocal(snapshot.reporting_window),

    count: snapshot.count,
    discarded_count: snapshot.discarded_count || 0,
    rejected_count: snapshot.rejected_count || 0,

    blob_path: blob.url,
  };

  const { error: snapshotError } = await supabase
    .from("snapshots")
    .upsert(snapshotRow, {
      onConflict: "snapshot_id",
    });

  if (snapshotError) {
    throw snapshotError;
  }

  // Ingestion owns: identity, content, and provenance fields only.
  // Classification-owned fields (main_category, tag_version, ai_specificity_score, etc.)
  // are intentionally absent — they must never be overwritten by re-ingestion.
  // ignoreDuplicates: true ensures existing sources are left fully intact so that
  // a backfill over already-classified sources does not wipe their classification.
  const sourceRows = snapshot.sources.map((source) => ({
    id: source.id,
    snapshot_id: snapshotId,

    title: source.title,
    // Use final_url if URL safety check followed an HTTP redirect to HTTPS
    url: source.validity?.final_url || source.url,
    publisher: source.publisher,
    author: source.author || "",

    date_published: source.date_published,
    date_published_actual: source.date_published_actual !== undefined
      ? source.date_published_actual
      : source.date_published,
    date_discovered: source.date_discovered || null,
    date_confidence: source.date_confidence || "exact",
    source_type: source.source_type,

    trust_tier:
      source.trust_tier ||
      source.collection_metadata?.trust_tier ||
      "unknown",

    credibility_label:
      source.validity?.credibility_label || "unknown",
    validity_score:
      source.validity?.source_validity_score || source.validity?.structural_validity_score || 0,
    structural_validity_score:
      source.validity?.structural_validity_score || 0,
    publisher_trust_score:
      source.validity?.publisher_trust_score || 0,

    url_safety_status: source.validity?.url_safety_status || "safe",
    final_url: source.validity?.final_url || source.url,
    url_reachable: source.validity?.url_reachable ?? null,

    tags: source.tags || [],
    full_text: source.full_text || "",
    summary: source.summary || "",

    content_hash: source.content_hash || null,
    clean_text_hash: source.clean_text_hash || null,

    // Eligibility flags
    eligible_for_daily_report:   source.eligible_for_daily_report   ?? true,
    eligible_for_weekly_report:  source.eligible_for_weekly_report  ?? true,
    eligible_for_monthly_report: source.eligible_for_monthly_report ?? true,
    eligible_for_archive:        source.eligible_for_archive        ?? true,
    eligible_for_trend_analysis: source.eligible_for_trend_analysis ?? true,
    eligible_for_reference_context: source.eligible_for_reference_context ?? false,
    needs_review:                source.needs_review               ?? false,

    // Event clustering (populated by a future clustering step; null until then)
    event_cluster_id:    source.event_cluster_id    || null,
    cluster_key:         source.cluster_key         || null,
    is_primary_source:   source.is_primary_source   ?? null,
    is_follow_on_source: source.is_follow_on_source ?? null,
    adds_new_information: source.adds_new_information ?? null,
    related_sources:     source.related_sources     || null,

    blob_path: blob.url,
  }));

  if (sourceRows.length > 0) {
    await upsertSourceRows(sourceRows);
  }

  return {
    snapshot_id: snapshotId,
    blob_url: blob.url,
  };
}

export async function listSnapshots({ start, end } = {}) {
  let query = supabase
    .from("snapshots")
    .select("*")
    .order("end_utc", { ascending: false });

  if (start) {
    query = query.gte(
      "end_utc",
      `${start}T00:00:00.000Z`
    );
  }

  if (end) {
    query = query.lte(
      "start_utc",
      `${end}T23:59:59.999Z`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getSnapshotById(snapshotId) {
  const { data: snapshot, error: snapshotError } =
    await supabase
      .from("snapshots")
      .select("*")
      .eq("snapshot_id", snapshotId)
      .single();

  if (snapshotError) {
    return null;
  }

  const sources = await listSourcesBySnapshot(snapshotId);

  return {
    ...snapshot,
    sources,
  };
}

export async function listSourcesBySnapshot(snapshotId) {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("snapshot_id", snapshotId)
    .order("date_published", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function listSources({
  start,
  end,
  publisher,
  source_type,
  tag,
  limit = 1000,
} = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("date_published", {
      ascending: false,
    })
    .limit(limit);

  if (process.env.TEST_SET_MODE === "true") {
    query = query.eq("in_test_set", true);
  }

  if (start) {
    query = query.gte("date_published", start);
  }

  if (end) {
    query = query.lt("date_published", end);
  }

  if (publisher) {
    query = query.ilike(
      "publisher",
      `%${publisher}%`
    );
  }

  if (source_type) {
    query = query.eq(
      "source_type",
      source_type
    );
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
