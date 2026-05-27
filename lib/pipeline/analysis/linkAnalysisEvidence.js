/**
 * Layer 8C — Evidence Linking + Backtracking
 *
 * Fully deterministic — no LLM calls. Resolves evidence_id references in LLM
 * analysis outputs back to full evidence objects from the category dossiers.
 *
 * ── EVIDENCE ID FORMAT ────────────────────────────────────────────────────────
 * "raw_<source_id>"          → rawfact evidence item from buildCategoryDossier
 *   Resolves to: { type: "rawfact", evidence_id, title, url, publisher,
 *                  published_date, key_facts[], short_summary, ... }
 *
 * "agg_<category>_<metric>"  → analytics evidence item from buildCategoryDossier
 *   Resolves to: { type: "analytics", analytics_id, metric_name, value,
 *                  aggregation_method, ... }
 *
 * ── PROCESS ──────────────────────────────────────────────────────────────────
 * 1. Build a flat evidence index from all dossiers (O(1) lookup by evidence_id).
 * 2. For each analysis, resolve supporting_evidence_ids in:
 *    - top_insights[].supporting_evidence_ids
 *    - early_signals[].supporting_evidence_ids
 *    - outlook.supporting_evidence_ids
 * 3. Each insight/signal/outlook gains a resolved_evidence[] field with full objects.
 * 4. Build a flat citations[] list per analysis for slide use:
 *    "Publisher — Title (Date)" strings, deduplicated, from all rawfact evidence.
 *
 * Unresolvable IDs are silently dropped (LLM may hallucinate IDs;
 * qaCategoryAnalysis.js flags insights with no resolved evidence).
 */

// ── Index builders ────────────────────────────────────────────────────────────

function buildEvidenceIndex(dossiers) {
  const index = new Map();
  for (const dossier of dossiers) {
    for (const item of dossier.rawfact_evidence) {
      index.set(item.evidence_id, { type: "rawfact", item });
    }
    for (const item of dossier.analytics_evidence) {
      index.set(item.analytics_id, { type: "analytics", item });
    }
  }
  return index;
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

function resolveIds(evidenceIds, index) {
  const resolved = [];
  for (const id of (evidenceIds || [])) {
    const entry = index.get(id);
    if (entry) resolved.push(entry);
  }
  return resolved;
}

function buildCitation(evidenceEntry) {
  if (evidenceEntry.type === "rawfact") {
    const item = evidenceEntry.item;
    return {
      citation_type:  "rawfact",
      evidence_id:    item.evidence_id,
      source_id:      item.source_id,
      title:          item.title,
      url:            item.url,
      publisher:      item.publisher,
      published_date: item.published_date,
      source_type:    item.source_type,
      rawfact_score:  item.rawfact_score,
      rawfact_priority: item.rawfact_priority,
    };
  }
  if (evidenceEntry.type === "analytics") {
    const item = evidenceEntry.item;
    return {
      citation_type:       "analytics",
      analytics_id:        item.analytics_id,
      metric_name:         item.metric_name,
      aggregation_method:  item.aggregation_method,
      source_count:        (item.source_ids || []).length,
    };
  }
  return null;
}

// ── Analysis linker ────────────────────────────────────────────────────────────

function linkAnalysis(analysis, index) {
  const linked = { ...analysis, linked_evidence: {} };
  const allCitations = new Map();

  // Link top_insights
  linked.top_insights = (analysis.top_insights || []).map((ins) => {
    const resolved = resolveIds(ins.supporting_evidence_ids, index);
    const citations = resolved.map(buildCitation).filter(Boolean);
    citations.forEach((c) => allCitations.set(c.evidence_id || c.analytics_id, c));
    return { ...ins, resolved_evidence: resolved.map((e) => e.item), citations };
  });

  // Link early_signals
  linked.early_signals = (analysis.early_signals || []).map((sig) => {
    const resolved = resolveIds(sig.supporting_evidence_ids, index);
    const citations = resolved.map(buildCitation).filter(Boolean);
    citations.forEach((c) => allCitations.set(c.evidence_id || c.analytics_id, c));
    return { ...sig, resolved_evidence: resolved.map((e) => e.item), citations };
  });

  // Link outlook
  if (analysis.outlook) {
    const resolved = resolveIds(analysis.outlook.supporting_evidence_ids, index);
    const citations = resolved.map(buildCitation).filter(Boolean);
    citations.forEach((c) => allCitations.set(c.evidence_id || c.analytics_id, c));
    linked.outlook = { ...analysis.outlook, resolved_evidence: resolved.map((e) => e.item), citations };
  }

  // Flat citations list (deduplicated) for easy slide rendering
  linked.citations = [...allCitations.values()];

  return linked;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve all evidence_id references in category analyses to full evidence objects.
 *
 * @param {object[]} categoryAnalyses - Output of analyzeAllCategories().
 * @param {object[]} dossiers         - Output of buildAllDossiers() (evidence source of truth).
 * @returns {object[]} Category analyses with resolved_evidence and citations arrays.
 */
export function linkAnalysisEvidence(categoryAnalyses, dossiers) {
  const index = buildEvidenceIndex(dossiers);

  return categoryAnalyses.map((analysis) => linkAnalysis(analysis, index));
}
