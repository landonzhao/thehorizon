import crypto from "crypto";
import { uploadArchiveJson } from "../../storage/blobArchiveStore.js";

export const ARCHIVE_SCHEMA_VERSION = "archive-v2.0";

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function getDateKey(window) {
  const end = window.end_sgt || window.end_local || window.end_utc;
  return end ? end.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function makeRunId() {
  // ISO 8601 timestamp, safe for filenames (colons replaced with hyphens)
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function makeArchiveRecord(source) {
  return {
    archive_id: crypto.randomUUID(),
    source_id:  source.id,

    // URL triple preserved verbatim from normalisation and URL safety check
    original_url:  source.original_url  || source.url,
    canonical_url: source.canonical_url || source.url,
    final_url:     source.final_url     || source.url,

    citation: {
      title:          source.title,
      publisher:      source.publisher,
      author:         source.author,
      url:            source.canonical_url || source.url,
      date_published: source.date_published,
      date_accessed:  source.date_collected || new Date().toISOString(),
    },

    reporting_window: null,  // filled by archiveSources caller

    provenance: {
      source_type:    source.source_type,
      trust_tier:     source.trust_tier,
      is_curated:     source.is_curated || false,
      date_confidence: source.date_confidence || "exact",
      date_discovered: source.date_discovered,
    },

    validity: {
      credibility_label:         source.validity?.credibility_label || "unknown",
      structural_validity_score: source.validity?.structural_validity_score ?? 0,
      publisher_trust_score:     source.validity?.publisher_trust_score ?? 0,
      url_safety_status:         source.validity?.url_safety_status || "unknown",
    },

    tags: {
      source_type:      source.source_type,
      credibility_label: source.validity?.credibility_label || "unknown",
      initial_tags:     source.tags || [],
    },

    integrity: {
      url_hash:        sha256(source.canonical_url || source.url),
      content_hash:    source.content_hash || sha256(source.full_text || ""),
      clean_text_hash: source.clean_text_hash,
      cleaning_version: source.cleaning_version || null,
    },

    content: {
      // raw_text is the original text before the cleaning pass
      raw_text:   source.raw_text   || source.full_text || "",
      clean_text: source.clean_text || source.full_text || "",
      raw_html:   source.raw_html   || "",
      summary:    source.summary    || "",

      // Structured content extracted pre-cleaning
      extracted_code_blocks: source.extracted_code_blocks || [],
      extracted_iocs:        source.extracted_iocs        || {},
    },

    collection_metadata: {
      ...(source.collection_metadata || {}),
      date_collected: source.date_collected,
    },
  };
}

/**
 * Write two archive blobs for this ingestion run:
 *
 * 1. `archives/YYYY-MM-DD/run-<ISO-timestamp>.json`  — immutable; unique per run.
 *    A new file is written on every call; existing files are never overwritten.
 *
 * 2. `archives/YYYY-MM-DD/latest.json` — always overwritten with the most
 *    recent run's data. Useful for quick ad-hoc access without knowing the run ID.
 */
export async function archiveSources(sources, window) {
  const dateKey = getDateKey(window);
  const runId   = makeRunId();

  const archiveRecords = sources.map((source) => ({
    ...makeArchiveRecord(source),
    reporting_window: window,
  }));

  const payload = {
    archive_schema_version: ARCHIVE_SCHEMA_VERSION,
    snapshot_id:   `snapshot-${dateKey}`,
    run_id:        runId,
    generated_at:  new Date().toISOString(),
    reporting_window: window,
    source_count:  archiveRecords.length,
    sources:       archiveRecords,
  };

  // Immutable run archive — unique filename, never overwritten
  const runBlob = await uploadArchiveJson(
    `archives/${dateKey}/${runId}.json`,
    payload,
    { overwrite: false }
  );

  // Mutable latest pointer — overwritten on every run
  const latestBlob = await uploadArchiveJson(
    `archives/${dateKey}/latest.json`,
    payload,
    { overwrite: true }
  );

  return {
    archive_url:    runBlob.url,
    latest_url:     latestBlob.url,
    archive_path:   runBlob.pathname,
    run_id:         runId,
    archived_count: archiveRecords.length,
  };
}
