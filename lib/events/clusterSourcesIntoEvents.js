/**
 * Deterministic event clustering.
 *
 * Groups sources that describe the same real-world event into clusters.
 * Clustering uses CVE IDs first (highest precision), then affected-product +
 * date-proximity pairs, then title-similarity as a final catch.
 *
 * No LLM required — this is a pure deterministic pass. Synthesis (LLM) runs
 * later in synthesiseEvent.js once clusters are stable.
 */

import crypto from "crypto";

// Maximum days between sources to be considered the same event window.
const EVENT_DATE_WINDOW_DAYS = 14;

// Minimum Jaccard similarity of normalised title tokens to merge on title alone.
const TITLE_JACCARD_THRESHOLD = 0.35;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function extractCves(source) {
  const fromIntel = source.llm_extracted_intelligence?.cve_ids || [];
  const fromText = (
    (source.full_text || "") + " " + (source.title || "")
  ).match(/\bCVE-\d{4}-\d{4,7}\b/gi) || [];
  return [...new Set([...fromIntel, ...fromText].map((c) => c.toUpperCase()))];
}

function extractProducts(source) {
  return source.llm_extracted_intelligence?.affected_products || [];
}

function tokenise(title = "") {
  return new Set(
    title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function dateOf(source) {
  const d = new Date(source.date_published || source.date_discovered || Date.now());
  return isNaN(d.getTime()) ? new Date() : d;
}

function daysBetween(a, b) {
  return Math.abs(dateOf(a).getTime() - dateOf(b).getTime()) / 86_400_000;
}

// Normalised product name for fuzzy matching
function normaliseProduct(name = "") {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function productOverlap(a, b) {
  const pa = new Set(extractProducts(a).map(normaliseProduct));
  const pb = new Set(extractProducts(b).map(normaliseProduct));
  if (pa.size === 0 || pb.size === 0) return false;
  return [...pa].some((p) => pb.has(p));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "via",
  "new", "using", "how", "are", "can", "may", "use", "its",
  "into", "about", "have", "has", "been", "will", "more",
]);

// ── Cluster identity ──────────────────────────────────────────────────────────

/**
 * Generate a deterministic event_id for a cluster.
 * If the cluster has CVE IDs, the ID is derived from them (stable across runs).
 * Otherwise it falls back to a UUID-style hash of the primary source URL.
 */
function makeEventId(cluster) {
  if (cluster.cve_ids.length > 0) {
    const key = cluster.cve_ids.slice().sort().join("|");
    return `evt-cve-${sha256(key).slice(0, 24)}`;
  }
  const primaryUrl = cluster.sources[0]?.canonical_url || cluster.sources[0]?.url || "";
  return `evt-${sha256(primaryUrl + cluster.first_seen).slice(0, 24)}`;
}

// ── Main clustering ───────────────────────────────────────────────────────────

/**
 * @param {object[]} sources  - enriched source objects (must have llm_extracted_intelligence)
 * @returns {{ clusters: EventCluster[], source_to_event: Map<string, string> }}
 */
export function clusterSourcesIntoEvents(sources) {
  const clusters = [];

  // Index: CVE → cluster index
  const cveIndex = new Map();
  // Index: normalised product → cluster indices (for date-windowed product merge)
  const productIndex = new Map();

  for (const source of sources) {
    const cves    = extractCves(source);
    const tokens  = tokenise(source.title);
    const srcDate = dateOf(source);

    // ── 1. CVE match (highest precision) ──────────────────────────────────────
    const cveMatches = new Set();
    for (const cve of cves) {
      if (cveIndex.has(cve)) cveMatches.add(cveIndex.get(cve));
    }

    if (cveMatches.size > 0) {
      // Merge all matched clusters into the first one (CVE overlap = same event)
      const [first, ...rest] = [...cveMatches];
      for (const other of rest) {
        // Merge other into first
        const toMerge = clusters[other];
        if (!toMerge) continue;
        clusters[first].sources.push(...toMerge.sources);
        clusters[first].cve_ids = [...new Set([...clusters[first].cve_ids, ...toMerge.cve_ids])];
        for (const c of toMerge.cve_ids) cveIndex.set(c, first);
        clusters[other] = null; // tombstone
      }
      clusters[first].sources.push(source);
      for (const cve of cves) cveIndex.set(cve, first);
      continue;
    }

    // ── 2. Product + date proximity match ─────────────────────────────────────
    const products = extractProducts(source).map(normaliseProduct);
    let mergedByProduct = false;

    for (const prod of products) {
      if (!productIndex.has(prod)) continue;
      for (const idx of productIndex.get(prod)) {
        const cluster = clusters[idx];
        if (!cluster) continue;
        const rep = cluster.sources[0];
        if (daysBetween(source, rep) <= EVENT_DATE_WINDOW_DAYS && productOverlap(source, rep)) {
          cluster.sources.push(source);
          // absorb any new CVEs
          for (const cve of cves) {
            if (!cluster.cve_ids.includes(cve)) {
              cluster.cve_ids.push(cve);
              cveIndex.set(cve, idx);
            }
          }
          mergedByProduct = true;
          break;
        }
      }
      if (mergedByProduct) break;
    }
    if (mergedByProduct) continue;

    // ── 3. Title similarity + date proximity ───────────────────────────────────
    let mergedByTitle = false;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (!cluster) continue;
      const rep = cluster.sources[0];
      if (daysBetween(source, rep) > EVENT_DATE_WINDOW_DAYS) continue;
      const repTokens = tokenise(rep.title);
      if (jaccard(tokens, repTokens) >= TITLE_JACCARD_THRESHOLD) {
        cluster.sources.push(source);
        for (const cve of cves) {
          if (!cluster.cve_ids.includes(cve)) {
            cluster.cve_ids.push(cve);
            cveIndex.set(cve, i);
          }
        }
        mergedByTitle = true;
        break;
      }
    }
    if (mergedByTitle) continue;

    // ── 4. No match — new cluster ──────────────────────────────────────────────
    const newIdx = clusters.length;
    clusters.push({
      _idx: newIdx,
      sources: [source],
      cve_ids: cves,
    });
    for (const cve of cves) cveIndex.set(cve, newIdx);
    for (const prod of products) {
      if (!productIndex.has(prod)) productIndex.set(prod, []);
      productIndex.get(prod).push(newIdx);
    }
  }

  // ── Finalise clusters ─────────────────────────────────────────────────────
  const validClusters = clusters.filter(Boolean);
  const source_to_event = new Map();

  const result = validClusters.map((cluster) => {
    const sorted = cluster.sources.slice().sort((a, b) => {
      // Primary source = highest priority_score, else first seen
      return (b.priority_score || 0) - (a.priority_score || 0);
    });

    const dates = sorted.map((s) => dateOf(s).getTime());
    const first_seen = new Date(Math.min(...dates)).toISOString();
    const last_seen  = new Date(Math.max(...dates)).toISOString();

    // Collect intelligence from all sources
    const allLayers = sorted.flatMap((s) => s.llm_extracted_intelligence?.affected_ai_layer || []);
    const allProducts = sorted.flatMap((s) => extractProducts(s));
    const allSectors = sorted.flatMap((s) => s.llm_extracted_intelligence?.affected_sectors || []);
    const allActors = sorted.flatMap((s) => s.llm_extracted_intelligence?.threat_actors || []);
    const allGeo = sorted.flatMap((s) => s.llm_extracted_intelligence?.geographic_scope || []);
    const allTags = sorted.flatMap((s) => s.tags || []);

    // Best evidence / exploitation across sources
    const evidenceLevels = ["confirmed_exploitation","attributed_incident","poc_available","vendor_confirmed","theoretical","unverified_claim"];
    const bestEvidence = sorted.reduce((best, s) => {
      const lvl = s.llm_extracted_intelligence?.evidence_level || "unverified_claim";
      return evidenceLevels.indexOf(lvl) < evidenceLevels.indexOf(best) ? lvl : best;
    }, "unverified_claim");

    const exploitationStatuses = ["exploited_in_wild","poc_available","not_exploited","unknown"];
    const bestExploitation = sorted.reduce((best, s) => {
      const st = s.llm_extracted_intelligence?.exploitation_status || "unknown";
      return exploitationStatuses.indexOf(st) < exploitationStatuses.indexOf(best) ? st : best;
    }, "unknown");

    const primary = sorted[0];
    const eventId = makeEventId({ ...cluster, first_seen });

    const eventCluster = {
      event_id:           eventId,
      event_type:         primary?.llm_extracted_intelligence?.event_type || "analysis_essay",
      threat_category:    primary?.main_category || "uncategorised",
      affected_ai_stack_layers: [...new Set(allLayers)],
      affected_products:  [...new Set(allProducts)].slice(0, 20),
      affected_sectors:   [...new Set(allSectors)].slice(0, 10),
      cve_ids:            [...new Set(cluster.cve_ids)],
      threat_actors:      [...new Set(allActors)].slice(0, 10),
      evidence_level:     bestEvidence,
      exploitation_status: bestExploitation,
      first_seen,
      last_seen,
      source_count:         sorted.length,
      primary_source_id:    primary?.id || null,
      supporting_source_ids: sorted.slice(1).map((s) => s.id),
      tags:               [...new Set(allTags)],
      geographic_scope:   [...new Set(allGeo)],
      singapore_asean_relevance: allGeo.some((g) => ["singapore","asean","sea"].includes(g.toLowerCase())),

      // Placeholders filled by synthesiseEvent + scoreEvent
      event_title:           null,
      summary:               null,
      what_happened:         null,
      how_it_happened:       null,
      why_it_matters:        null,
      strategic_implications: null,
      defender_implications: null,
      watch_indicators:      [],
      maturity_level:        null,
      operationalization_level: null,
      confidence_level:      null,
      event_score:           null,
      priority_score:        null,
      report_score:          null,

      sources: sorted,  // full source objects (not persisted — used by synthesis)
    };

    for (const s of sorted) source_to_event.set(s.id, eventId);
    return eventCluster;
  });

  return { clusters: result, source_to_event };
}
