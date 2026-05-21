export const SCORE_VERSION = "priority-v4.0";

// Tags that indicate concrete, operationally significant threat content
export const HIGH_SEVERITY_TAGS = [
  "actively_exploited",
  "rce",
  "proof_of_concept",
  "agent_tool_abuse",
  "mcp_risk",
  "prompt_injection",
  "llm_data_leakage",
  "model_extraction",
  "data_poisoning",
];

export const ELEVATED_SEVERITY_TAGS = [
  "jailbreak",
  "guardrail_bypass",
  "rag_poisoning",
  "ml_supply_chain",
  "model_backdoor",
  "deepfake",
  "ai_phishing",
  "ai_malware",
  "voice_cloning",
  "ai_social_engineering",
  "credential_theft",
  "supply_chain",
];

// Phrases that indicate low-value or non-intelligence content
export const LOW_VALUE_SIGNALS = [
  "product launch",
  "marketing",
  "sponsored content",
  "webinar",
  "thought leadership",
  "press release",
  "case study",
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

export const SINGAPORE_TERMS = [
  "singapore",
  "csa singapore",
  "imda",
  "govtech",
  "asean",
  "southeast asia",
  "south-east asia",
  "critical information infrastructure",
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
  llm_threats: 16,
  agentic_ai_threats: 18,
  ai_enabled_threats: 18,
  ai_for_security: 14,
  uncategorised: 2,
};
