import { ALLOWED_TAGS } from "../classification/allowedTags.js";
import { cleanPlaintext } from "../cleaning/cleanPlaintext.js";

const ALLOWED_CLAIM_TYPES = [
  "incident",
  "vulnerability",
  "technical",
  "severity",
  "impact",
  "attribution",
  "mitigation",
  "research",
  "policy",
  "prediction",
  "opinion",
  "other",
];

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, number));
}

function cleanText(value = "") {
  let text = String(value || "").trim();

  try {
    const parsed = JSON.parse(text);

    text =
      parsed.short_summary ||
      parsed.summary ||
      parsed.summary_ai ||
      parsed.text ||
      text;
  } catch {
    // not json
  }

  return String(text)
    .replace(/^["'{\s]+|["'}\s]+$/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Strip symbols, LaTeX, markdown, and HTML entities from LLM-generated text.
// This runs AFTER the LLM call, so it targets output artefacts not source text.
function cleanLlmOutput(value = "") {
  const raw = cleanText(value);
  if (!raw) return "";
  // Use cleanPlaintext to strip entities, LaTeX, markdown, unicode symbols
  const clean = cleanPlaintext(raw);
  // Collapse any multi-line output into single paragraph (summaries are inline)
  return clean.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanSummary(value = "") {
  const text = cleanLlmOutput(value);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, 3).join(" ").trim();
}

function cleanBrief(value = "") {
  return cleanLlmOutput(value).slice(0, 1200);
}

// Validates the taxonomy portion of the LLM response.
// Category assignment is intentionally excluded — it is derived deterministically
// from tags via deriveCategory() in the classification layer.
export function validateClassification(raw = {}) {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => ALLOWED_TAGS.includes(t)).slice(0, 15)
    : [];

  const ai_specificity_score =
    typeof raw.ai_specificity_score === "number"
      ? Math.max(0, Math.min(100, Math.round(raw.ai_specificity_score)))
      : 0;

  return {
    tags,
    ai_specificity_score,
    ai_specificity_reason: String(raw.ai_specificity_reason || "").slice(0, 500),
  };
}

const ALLOWED_THREAT_MATURITY = ["emerging", "growing", "established", "declining"];
const ALLOWED_REPORT_TIERS = ["weekly", "monthly", "quarterly", "archive_only"];

function cleanStringArray(arr, maxItems = 20, maxLen = 200) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

export function validateIntelligence(raw = {}) {
  const trend_signals = cleanStringArray(raw.trend_signals, 6, 300);

  const ke = raw.key_entities || {};
  const key_entities = {
    threat_actors: cleanStringArray(ke.threat_actors, 10),
    tools_and_techniques: cleanStringArray(ke.tools_and_techniques, 15),
    affected_products: cleanStringArray(ke.affected_products, 15),
    affected_organizations: cleanStringArray(ke.affected_organizations, 10),
    cves: cleanStringArray(ke.cves, 20, 30),
  };

  const threat_maturity = ALLOWED_THREAT_MATURITY.includes(raw.threat_maturity)
    ? raw.threat_maturity
    : null;

  const sector_impact = cleanStringArray(raw.sector_impact, 10);

  const horizon_relevance =
    typeof raw.horizon_relevance === "number"
      ? Math.max(1, Math.min(5, Math.round(raw.horizon_relevance)))
      : null;

  const report_tier = ALLOWED_REPORT_TIERS.includes(raw.report_tier)
    ? raw.report_tier
    : null;

  return {
    trend_signals,
    key_entities,
    threat_maturity,
    sector_impact,
    horizon_relevance,
    report_tier,
  };
}

export function validateClaimExtraction(raw = {}) {
  const short_summary = cleanSummary(
    raw.short_summary || raw.summary || raw.summary_ai
  );

  const analyst_brief = {
    what_happened: cleanBrief(raw.analyst_brief?.what_happened),
    who_was_affected: cleanBrief(raw.analyst_brief?.who_was_affected),
    actor_or_attribution: cleanBrief(raw.analyst_brief?.actor_or_attribution),
    how_it_happened: cleanBrief(raw.analyst_brief?.how_it_happened),
    exploited_or_abused: cleanBrief(raw.analyst_brief?.exploited_or_abused),
    impact: cleanBrief(raw.analyst_brief?.impact),
    why_it_matters: cleanBrief(raw.analyst_brief?.why_it_matters),
    watch_points: Array.isArray(raw.analyst_brief?.watch_points)
      ? raw.analyst_brief.watch_points
          .map((item) => cleanBrief(item))
          .filter(Boolean)
          .slice(0, 8)
      : [],
  };

  const claims = Array.isArray(raw.claims)
    ? raw.claims
        .map((claim) => ({
          claim_text: cleanText(claim.claim_text),
          claim_type: ALLOWED_CLAIM_TYPES.includes(claim.claim_type)
            ? claim.claim_type
            : "other",
          evidence_span: cleanText(claim.evidence_span),
          confidence: clampConfidence(claim.confidence),
        }))
        .filter((claim) => claim.claim_text.length > 0)
        .slice(0, 12)
    : [];

  return {
    short_summary,
    analyst_brief,
    claims,
  };
}
