/**
 * Layer 6 — Evidence Linking
 *
 * Resolves the source-ID references in each viewpoint's
 * `supporting_feed_evidence` array into actual source objects, so
 * slide-generation layers can render citations without re-querying.
 */

/**
 * Build a compact citation record from a fully enriched source.
 * Only includes fields needed for slide citation and context.
 *
 * @param {object} source
 * @returns {object}
 */
function buildCitation(source) {
  return {
    id:             source.id,
    title:          source.title,
    url:            source.url,
    publisher:      source.publisher,
    date_published: source.date_published,
    source_type:    source.source_type,
    main_category:  source.main_category,
    trust_tier:     source.trust_tier,
    feed_score:     source.feed_score_data?.feed_score  ?? null,
    feed_priority:  source.feed_score_data?.feed_priority ?? null,
    source_summary: source.understanding?.source_summary ?? source.evidence_card?.short_summary ?? null,
    key_facts:      source.evidence_card?.key_facts ?? source.understanding?.main_claims?.slice(0, 3) ?? [],
    framework_refs: [
      ...(source.understanding?.framework_tags ?? []).map((t) => t.framework_ref),
      ...(source.understanding?.attack_mappings ?? []).map((t) => t.framework_ref),
      ...(source.understanding?.governance_tags ?? []).map((t) => t.framework_ref),
    ],
  };
}

/**
 * Link evidence source objects to each viewpoint.
 *
 * Resolves `supporting_feed_evidence` source IDs into compact citation objects
 * and attaches them as `supporting_sources`. Unresolvable IDs are silently
 * dropped (the source may have been filtered in an upstream step).
 *
 * @param {object[]} viewpoints  - Output of synthesizeViewpoints().
 * @param {object[]} feedSources - Enriched sources from the feed branch.
 * @returns {object[]} Viewpoints with `supporting_sources` field added.
 */
export function linkEvidenceToViewpoints(viewpoints, feedSources) {
  const sourceMap = new Map(feedSources.map((s) => [s.id, s]));

  return viewpoints.map((vp) => {
    const supporting_sources = (vp.supporting_feed_evidence || [])
      .map((id) => sourceMap.get(id))
      .filter(Boolean)
      .map(buildCitation);

    return { ...vp, supporting_sources };
  });
}
