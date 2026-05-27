/**
 * Layer 3 — Load Archived Sources
 *
 * Read side of the archive. Queries the Supabase `sources` table and returns
 * sources for use by downstream pipeline layers (4–9).
 *
 * The horizon scan pipeline calls `loadSourcesForHorizonScan()` to retrieve
 * all AI-cyber-relevant sources from the past 12 months.
 */

import { supabase } from "../../storage/supabaseClient.js";

const HORIZON_SCAN_DAYS = 365;

/**
 * Load sources eligible for the horizon scan pipeline.
 * Returns up to `limit` sources published within the past 12 months, ordered
 * by date_published descending.
 *
 * @param {object} options
 * @param {number}   [options.limit=5000]
 * @param {string}   [options.start_utc]    ISO string — override lookback start
 * @param {string}   [options.end_utc]      ISO string — override lookback end
 * @param {string}   [options.source_type]  Filter to a single source type
 * @param {string}   [options.trust_tier]   Filter to a trust tier
 * @param {string[]} [options.categories]   Filter to main_category values
 */
export async function loadSourcesForHorizonScan(options = {}) {
  const now   = new Date();
  const start = options.start_utc ||
    new Date(now.getTime() - HORIZON_SCAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const end   = options.end_utc || now.toISOString();
  const limit = options.limit ?? 5000;

  let query = supabase
    .from("sources")
    .select("*")
    .eq("eligible_for_horizon_scan", true)
    .gte("date_published", start)
    .lt("date_published", end)
    .order("date_published", { ascending: false })
    .limit(limit);

  if (options.source_type) {
    query = query.eq("source_type", options.source_type);
  }
  if (options.trust_tier) {
    query = query.eq("trust_tier", options.trust_tier);
  }
  if (options.categories?.length) {
    query = query.in("main_category", options.categories);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch the set of source IDs and content hashes already in the archive.
 * Used by Layer 2 duplicate detection.
 *
 * @param {object} options
 * @param {string} [options.since]  ISO string — only load IDs ingested after this date
 * @returns {Promise<{ knownIds: Set<string>, knownContentHashes: Set<string> }>}
 */
export async function loadKnownSourceIdentifiers(options = {}) {
  let query = supabase
    .from("sources")
    .select("id, content_hash");

  if (options.since) {
    query = query.gte("date_published", options.since);
  }

  const { data, error } = await query;
  if (error) throw error;

  const knownIds = new Set();
  const knownContentHashes = new Set();

  for (const row of data || []) {
    if (row.id)           knownIds.add(row.id);
    if (row.content_hash) knownContentHashes.add(row.content_hash);
  }

  return { knownIds, knownContentHashes };
}

/**
 * Load a single source by ID.
 */
export async function loadSourceById(sourceId) {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (error) return null;
  return data;
}
