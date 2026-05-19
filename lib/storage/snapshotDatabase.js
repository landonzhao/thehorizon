import { supabase } from "./supabaseClient.js";
import { uploadArchiveJson } from "./blobArchiveStore.js";

export async function saveSnapshotToDatabase(snapshot) {
  const snapshotId = `snapshot-${snapshot.reporting_window.end_local.slice(0, 10)}`;

  const blob = await uploadArchiveJson(`snapshots/${snapshotId}.json`, snapshot);

  await supabase.from("snapshots").upsert(
    {
      snapshot_id: snapshotId,
      period: snapshot.period,
      generated_at: snapshot.generated_at,
      start_utc: snapshot.reporting_window.start_utc,
      end_utc: snapshot.reporting_window.end_utc,
      start_local: snapshot.reporting_window.start_local,
      end_local: snapshot.reporting_window.end_local,
      count: snapshot.count,
      discarded_count: snapshot.discarded_count || 0,
      rejected_count: snapshot.rejected_count || 0,
      blob_path: blob.url,
    },
    { onConflict: "snapshot_id" }
  );

  const sourceRows = snapshot.sources.map((source) => ({
    id: source.id,
    snapshot_id: snapshotId,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    author: source.author || "",
    date_published: source.date_published || null,
    source_type: source.source_type,
    trust_tier: source.trust_tier || source.collection_metadata?.trust_tier || "unknown",
    credibility_label: source.validity?.credibility_label || "unknown",
    validity_score: source.validity?.source_validity_score || 0,
    tags: source.tags || [],
    content_hash: source.content_hash || null,
    blob_path: blob.url,
  }));

  if (sourceRows.length > 0) {
    await supabase.from("sources").upsert(sourceRows, { onConflict: "id" });
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

  if (start) query = query.gte("end_utc", `${start}T00:00:00.000Z`);
  if (end) query = query.lte("start_utc", `${end}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}

export async function getSnapshotById(snapshotId) {
  const { data: snapshot, error: snapshotError } = await supabase
    .from("snapshots")
    .select("*")
    .eq("snapshot_id", snapshotId)
    .single();

  if (snapshotError) return null;

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
    .order("date_published", { ascending: false });

  if (error) throw error;

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
    .order("date_published", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);
  if (publisher) query = query.ilike("publisher", `%${publisher}%`);
  if (source_type) query = query.eq("source_type", source_type);
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}
