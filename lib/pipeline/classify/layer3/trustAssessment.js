/**
 * Layer 5.4 — Trust & Credibility Assessment
 *
 * Assigns trust_tier based on publisher metadata and connector provenance.
 * Derives source_credibility_score from trust_tier for use in downstream scoring.
 *
 * Trust tier is the one value set at Layer 5 that flows through every
 * downstream layer unchanged: scoring, feeds, analytics, and analysis all
 * weight sources by their trust tier.
 */

import { TRUST_TIER_CREDIBILITY_SCORE } from "../../../config/scoringWeights.js";

// ── Publisher allow-list ──────────────────────────────────────────────────────
// Used only when trust_tier is missing or "unknown".
// Earlier entries take priority; order within a tier is irrelevant.
const PUBLISHER_TRUST_MAP = [
  // Primary: government agencies and AI safety labs
  { match: "cisa",              tier: "primary" },
  { match: "nist",              tier: "primary" },
  { match: "ncsc",              tier: "primary" },
  { match: "csa",               tier: "primary" },
  { match: "enisa",             tier: "primary" },
  { match: "anthropic",         tier: "primary" },
  { match: "openai",            tier: "primary" },
  { match: "google deepmind",   tier: "primary" },

  // High: established security vendors, AI labs, academic institutions
  { match: "google",            tier: "high" },
  { match: "microsoft",         tier: "high" },
  { match: "meta",              tier: "high" },
  { match: "amazon",            tier: "high" },
  { match: "crowdstrike",       tier: "high" },
  { match: "mandiant",          tier: "high" },
  { match: "palo alto",         tier: "high" },
  { match: "recorded future",   tier: "high" },
  { match: "sentinelone",       tier: "high" },
  { match: "trend micro",       tier: "high" },
  { match: "elastic",           tier: "high" },
  { match: "owasp",             tier: "high" },
  { match: "arxiv",             tier: "high" },
  { match: "university",        tier: "high" },
  { match: "institute",         tier: "high" },
  { match: "sans",              tier: "high" },
];

function assignTrustTier(source) {
  const existing = source.trust_tier;

  if (existing && existing !== "unknown") {
    return { trust_tier: existing, tier_reason: "connector_assigned" };
  }

  const pub = (source.publisher || "").toLowerCase();
  for (const entry of PUBLISHER_TRUST_MAP) {
    if (pub.includes(entry.match)) {
      return { trust_tier: entry.tier, tier_reason: `publisher_match:${entry.match}` };
    }
  }

  return { trust_tier: "medium", tier_reason: "default_unknown" };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Assess trust tier and credibility of a source.
 *
 * @param {object} source
 * @returns {{
 *   trust_tier: string,
 *   source_credibility_score: number,
 *   credibility_reason: string,
 *   trust_tier_reason: string,
 * }}
 */
export function assessTrustAndCredibility(source) {
  const { trust_tier, tier_reason } = assignTrustTier(source);
  const source_credibility_score = TRUST_TIER_CREDIBILITY_SCORE[trust_tier] ?? 1;
  const credibility_reason = `${trust_tier} tier (${tier_reason}); score=${source_credibility_score}`;

  return {
    trust_tier,
    source_credibility_score,
    credibility_reason,
    trust_tier_reason: tier_reason,
  };
}
