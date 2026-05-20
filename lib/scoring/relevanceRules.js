export const SCORE_VERSION = "priority-v1.0";

export const HIGH_IMPACT_TAGS = [
  "zero_day",
  "exploit",
  "vulnerability",
  "deepfake",
  "ai_phishing",
  "ai_malware",
  "prompt_injection",
  "agent_tool_abuse",
  "mcp_risk",
  "llm_data_leakage",
  "model_extraction",
  "data_poisoning",
  "critical_infrastructure",
  "financial_sector",
  "government_sector",
  "singapore_relevance",
];

export const MEDIUM_IMPACT_TAGS = [
  "jailbreak",
  "guardrail_bypass",
  "rag_poisoning",
  "ml_supply_chain",
  "threat_intelligence",
  "soc_automation",
  "secure_development",
  "ai_detection",
  "research",
];

export const LOW_VALUE_SIGNALS = [
  "product launch",
  "marketing",
  "sponsored",
  "webinar",
  "conference",
  "opinion",
  "thought leadership",
];

export const ACTIONABLE_TERMS = [
  "patch",
  "mitigation",
  "advisory",
  "exploit",
  "actively exploited",
  "in the wild",
  "proof of concept",
  "poc",
  "campaign",
  "incident",
  "breach",
  "vulnerability",
  "cve",
  "detection",
  "rules",
  "indicators",
  "ioc",
  "yara",
  "sigma",
];

export const SINGAPORE_TERMS = [
  "singapore",
  "csa",
  "imda",
  "mas",
  "govtech",
  "asean",
  "southeast asia",
  "south-east asia",
  "financial sector",
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
};
