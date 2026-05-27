/**
 * Scoring weight constants.
 *
 * All numerical scoring thresholds and weights are centralised here.
 * Adjust these to tune pipeline behaviour without touching business logic.
 */

// ── Trust tier base weights ───────────────────────────────────────────────────

export const TRUST_TIER_WEIGHT = {
  primary:  1.0,
  curated:  0.9,
  high:     0.75,
  medium:   0.5,
  low:      0.25,
  unknown:  0.1,
};

export const TRUST_TIER_CREDIBILITY_SCORE = {
  primary:  10,
  curated:   9,
  high:      7,
  medium:    5,
  low:       2,
  unknown:   1,
};

// ── Feed scoring weights (Stage 8.1) ─────────────────────────────────────────

export const FEED_SCORING = {
  BASE_FROM_PRIORITY_PCT:   0.70, // priority_score mapped to 0-70 range
  MUST_READ_PRIMARY_BOOST:  25,
  MUST_READ_BOOST:          15,
  EXPLOITED_IN_WILD_BOOST:  20,
  POC_AVAILABLE_BOOST:      10,
  NOVEL_TECHNIQUE_BOOST:    12,
  CRITICAL_SEVERITY_BOOST:  15,
  HIGH_SEVERITY_BOOST:       8,
  SINGAPORE_ASEAN_BOOST:     5,
  ECOSYSTEM_MARKET_PENALTY: -10,
  NO_TECHNICAL_DETAIL_PENALTY: -8,
  LOW_TRUST_PENALTY:        -12,
};

// ── Analytics weighting (Stage 8.2) ──────────────────────────────────────────

export const ANALYTICS_WEIGHTING = {
  EXPLOITATION_MULTIPLIER: {
    exploited_in_wild: 2.0,
    poc_available:     1.5,
    not_exploited:     1.0,
    unknown:           0.8,
  },
  MATURITY_MULTIPLIER: {
    mainstream:  1.2,
    operational: 1.15,
    growing:     1.0,
    emerging:    0.85,
    research:    0.7,
  },
  PRIMARY_DENSITY_BOOST: 1.2,
};

// ── Analysis scoring (Stage 8.3) ──────────────────────────────────────────────

export const ANALYSIS_SCORING = {
  SIGNAL_WEIGHTS: {
    strategic_shift:                30,
    operationalization:             25,
    research_to_threat_pipeline:    22,
    defender_assumption_challenged: 25,
    trust_boundary_failure:         20,
    ecosystem_convergence:          20,
    attack_surface_expansion:       18,
    weak_signal:                    15,
  },
  EVIDENCE_SCORE: {
    confirmed_exploitation: 12,
    poc_available:          10,
    vendor_confirmed:        8,
    attributed_incident:     6,
    theoretical:             4,
    unverified_claim:        2,
  },
  TRUST_BONUS: {
    primary:  10,
    curated:   8,
    high:      6,
    medium:    3,
    low:       0,
    unknown:   0,
  },
};

// ── Relevance thresholds ──────────────────────────────────────────────────────

export const RELEVANCE_TIERS = {
  CORE:     { min: 40, label: "core" },
  ADJACENT: { min: 20, label: "adjacent" },
  CONTEXT:  { min: 10, label: "context" },
  OFF_TOPIC: { max: 9, label: "off_topic" }, // deleted from pipeline
};

export const AI_SPECIFICITY_DELETE_THRESHOLD = 10;
