export const SCORE_VERSION = "priority-v5.0";
export const SCORE_VERSION_V6 = "priority-v6.0-type-aware-horizon";

// Tags that indicate concrete, operationally significant threat content.
// Aligned with ALLOWED_TAGS v5.0 (OWASP LLM Top 10 2025 / MITRE ATLAS).
export const HIGH_SEVERITY_TAGS = [
  "actively_exploited",
  "proof_of_concept",
  "agent_hijacking",
  "mcp_exploitation",
  "excessive_agency",
  "prompt_injection",
  "sensitive_data_disclosure",
  "model_extraction",
  "data_poisoning",
];

export const ELEVATED_SEVERITY_TAGS = [
  "jailbreak",
  "overreliance",
  "rag_attack",
  "ml_supply_chain",
  "model_backdoor",
  "insecure_output_handling",
  "model_dos",
  "deepfake",
  "ai_generated_phishing",
  "ai_generated_malware",
  "voice_cloning",
  "ai_reconnaissance",
  "agent_memory_attack",
  "multi_agent_attack",
  "nation_state",
  "supply_chain",
];

// Phrases indicating low-value or non-intelligence content
export const LOW_VALUE_SIGNALS = [
  "product launch",
  "marketing",
  "sponsored content",
  "webinar",
  "thought leadership",
  "press release",
];

// Phrases indicating IOC/detection artifacts that analysts can act on
export const IOC_SIGNALS = [
  "indicators of compromise",
  "ioc",
  "yara rule",
  "sigma rule",
  "snort rule",
  "detection rule",
  "hunting query",
];

// curated = purge-protected, NOT automatically high-credibility.
// Curated sources score the same as medium so they don't auto-rank above
// organically discovered high/primary sources.
export const CREDIBILITY_BY_TIER = {
  primary: 10,
  curated: 6,
  high: 8,
  medium: 6,
  low: 3,
  unknown: 2,
};

export const CATEGORY_BASE_RELEVANCE = {
  traditional_ai_threats: 14,
  llm_threats:            16,
  agentic_ai_threats:     18,
  ai_enabled_threats:     18,
  uncategorised:          2,
};

// ── V6 constants ─────────────────────────────────────────────────────────────

export const PUBLISHER_TYPES = [
  "government_agency",
  "academic",
  "major_vendor",
  "security_vendor",
  "threat_intel_firm",
  "news_media",
  "independent_researcher",
  "community_aggregator",
  "unknown",
];

export const EVENT_TYPES = [
  "active_exploitation",
  "vulnerability_disclosure",
  "research_finding",
  "threat_actor_report",
  "policy_advisory",
  "incident_report",
  "analysis_essay",
  "product_announcement",
  "low_value_noise",
  "unrelated",
];

// Max priority_score and report_score allowed per event type.
// Caps are applied after component summation — not to individual components.
export const EVENT_TYPE_CAPS = {
  active_exploitation:      { priority_cap: 100, report_cap: 90  },
  vulnerability_disclosure: { priority_cap: 90,  report_cap: 80  },
  research_finding:         { priority_cap: 75,  report_cap: 100 },
  threat_actor_report:      { priority_cap: 85,  report_cap: 90  },
  policy_advisory:          { priority_cap: 80,  report_cap: 85  },
  incident_report:          { priority_cap: 90,  report_cap: 85  },
  analysis_essay:           { priority_cap: 65,  report_cap: 75  },
  product_announcement:     { priority_cap: 50,  report_cap: 40  },
  low_value_noise:          { priority_cap: 25,  report_cap: 25  },
  unrelated:                { priority_cap: 20,  report_cap: 20  },
};

// Singapore/ASEAN term list expanded for v6
export const SINGAPORE_TERMS_V6 = [
  "singapore",
  "csa singapore",
  "cybersecurity agency of singapore",
  "imda",
  "govtech",
  "asean",
  "southeast asia",
  "south-east asia",
  "critical information infrastructure",
  "pdpa",
  "mas",
  "dsta",
  "htx",
  "a*star",
  "ntu",
  "nus",
  "smu",
];

// Points per evidence level for the v6 exploitability component
export const EVIDENCE_LEVEL_SCORES = {
  confirmed_exploitation: 20,
  attributed_incident:    15,
  poc_available:          12,
  vendor_confirmed:       10,
  theoretical:             5,
  unverified_claim:        3,
};

// Credibility score by publisher type (v6 supplement — used alongside trust_tier)
export const PUBLISHER_CREDIBILITY_V6 = {
  government_agency:      10,
  threat_intel_firm:       9,
  academic:                9,
  security_vendor:         8,
  major_vendor:            8,
  independent_researcher:  7,
  news_media:              5,
  community_aggregator:    4,
  unknown:                 2,
};
