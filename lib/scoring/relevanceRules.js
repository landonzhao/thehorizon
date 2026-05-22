export const SCORE_VERSION = "priority-v5.0";

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

export const CREDIBILITY_BY_TIER = {
  primary: 10,
  curated: 9,
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
