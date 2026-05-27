/**
 * Controlled vocabulary: source types.
 *
 * Each source receives exactly one source_type in Layer 5.
 * Source type is orthogonal to main_category — it describes WHAT KIND of
 * intelligence object the source is, not what threat category it belongs to.
 */

export const SOURCE_TYPES = {
  // Operational (high urgency)
  VULNERABILITY:                   "vulnerability",
  EXPLOIT_DISCLOSURE:              "exploit_disclosure",
  INCIDENT:                        "incident",
  THREAT_INTELLIGENCE:             "threat_intelligence",

  // Technical evidence
  RESEARCH_FINDING:                "research_finding",
  DEFENSIVE_CAPABILITY:            "defensive_capability",
  BENCHMARK_EVALUATION:            "benchmark_evaluation",
  CAPABILITY_DEMONSTRATION:        "capability_demonstration",

  // Adoption / infrastructure signals
  ADVERSARY_ADOPTION_SIGNAL:       "adversary_adoption_signal",
  INFRASTRUCTURE_DEPENDENCY_SIGNAL:"infrastructure_dependency_signal",
  TRUST_BOUNDARY_SHIFT:            "trust_boundary_shift",

  // Contextual / structural signals
  SOCIETAL_HARM:                   "societal_harm_signal",
  GOVERNANCE_SIGNAL:               "governance_signal",
  ECOSYSTEM_SIGNAL:                "ecosystem_signal",
  STRATEGIC_SIGNAL:                "strategic_signal",

  // Transitional fallback — Layer 5 LLM call will refine this
  UNKNOWN: "unknown",
};

export const SOURCE_TYPE_LABELS = {
  vulnerability:                      "Vulnerability Disclosure",
  exploit_disclosure:                 "Exploit Disclosure",
  incident:                           "Security Incident",
  threat_intelligence:                "Threat Intelligence",
  research_finding:                   "Research Finding",
  defensive_capability:               "Defensive Capability",
  benchmark_evaluation:               "Benchmark / Evaluation",
  capability_demonstration:           "Capability Demonstration",
  adversary_adoption_signal:          "Adversary Adoption Signal",
  infrastructure_dependency_signal:   "Infrastructure Dependency Signal",
  trust_boundary_shift:               "Trust Boundary Shift",
  societal_harm_signal:               "Societal Harm Signal",
  governance_signal:                  "Governance / Policy Signal",
  ecosystem_signal:                   "Ecosystem / Market Signal",
  strategic_signal:                   "Strategic Signal",
  unknown:                            "Unknown",
};

// Source types with high operational urgency — drive must_read and feed_score boosts
export const OPERATIONAL_TYPES = new Set([
  "vulnerability",
  "exploit_disclosure",
  "incident",
  "threat_intelligence",
]);

// Source types relevant for the horizon watch (forward-looking)
export const HORIZON_TYPES = new Set([
  "research_finding",
  "benchmark_evaluation",
  "capability_demonstration",
  "adversary_adoption_signal",
  "infrastructure_dependency_signal",
  "strategic_signal",
]);

export const ALL_SOURCE_TYPES = [
  "vulnerability",
  "exploit_disclosure",
  "incident",
  "threat_intelligence",
  "research_finding",
  "defensive_capability",
  "benchmark_evaluation",
  "capability_demonstration",
  "adversary_adoption_signal",
  "infrastructure_dependency_signal",
  "trust_boundary_shift",
  "societal_harm_signal",
  "governance_signal",
  "ecosystem_signal",
  "strategic_signal",
  "unknown",
];

// Migration map: old DB values → canonical new values
export const OLD_SOURCE_TYPE_MAP = {
  policy_regulatory_signal:           "governance_signal",
  governance_organizational_response: "governance_signal",
  ecosystem_market_signal:            "ecosystem_signal",
  strategic_foresight_signal:         "strategic_signal",
  adjacent_contextual:                "unknown",
  academic_research:                  "research_finding",
  tooling_platform_development:       "ecosystem_signal",
};
