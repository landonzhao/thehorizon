import crypto from "crypto";
import { supabase } from "../storage/supabaseClient.js";
import { enrichSource } from "./enrichSource.js";

const CLAIM_EXTRACTION_VERSION = "claims-v1.0-gemini-flash";

function claimId(sourceId, claimText) {
  return `claim-${crypto
    .createHash("sha256")
    .update(`${sourceId}|${claimText}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export async function processSourceClaims({
  start,
  end,
  limit = 15,
  onlyPriority = true,
} = {}) {
  let query = supabase
    .from("sources")
    .select("*")
    .order("priority_score", { ascending: false })
    .limit(limit);

  if (start) query = query.gte("date_published", start);
  if (end) query = query.lt("date_published", end);
  if (onlyPriority) query = query.gte("priority_score", 35);

  const { data: sources, error } = await query;
  if (error) throw error;

  const results = [];

  for (const source of sources || []) {
    try {
      const extraction = await enrichSource(source);

      await supabase
        .from("sources")
        .update({
          short_summary: extraction.short_summary,
          analyst_brief: extraction.analyst_brief,
          claim_extraction_status: "success",
          claim_extraction_version: CLAIM_EXTRACTION_VERSION,
        })
        .eq("id", source.id);

      const claimRows = extraction.claims.map((claim) => ({
        claim_id: claimId(source.id, claim.claim_text),
        source_id: source.id,
        claim_text: claim.claim_text,
        claim_type: claim.claim_type,
        evidence_span: claim.evidence_span,
        confidence: claim.confidence,
        extracted_by: CLAIM_EXTRACTION_VERSION,
      }));

      if (claimRows.length > 0) {
        const { error: claimError } = await supabase
          .from("source_claims")
          .upsert(claimRows, { onConflict: "claim_id" });

        if (claimError) throw claimError;
      }

      results.push({
        source_id: source.id,
        title: source.title,
        status: "success",
        claims: claimRows.length,
        short_summary: extraction.short_summary,
      });
    } catch (error) {
      await supabase
        .from("sources")
        .update({
          claim_extraction_status: "failed",
          claim_extraction_version: CLAIM_EXTRACTION_VERSION,
        })
        .eq("id", source.id);

      results.push({
        source_id: source.id,
        title: source.title,
        status: "failed",
        error: error.message,
      });
    }
  }

  return {
    count: results.length,
    extraction_version: CLAIM_EXTRACTION_VERSION,
    results,
  };
}
