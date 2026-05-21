export const MAIN_CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
];

export const ALLOWED_TAGS = [
  // Traditional AI / ML threats
  "data_poisoning",
  "model_extraction",
  "model_backdoor",
  "membership_inference",
  "adversarial_examples",
  "ml_supply_chain",
  "fine_tuning_attack",

  // LLM threats
  "prompt_injection",
  "jailbreak",
  "guardrail_bypass",
  "rag_poisoning",
  "llm_data_leakage",
  "llm_insecure_output",
  "llm_tool_abuse",
  "llm_app_vulnerability",
  "ai_dos",

  // Agentic AI threats
  "autonomous_agent",
  "mcp_risk",
  "llm_excessive_agency",
  "agent_tool_abuse",
  "agent_memory_poisoning",
  "coding_agent_risk",
  "browser_agent_risk",

  // AI-enabled threats
  "deepfake",
  "voice_cloning",
  "synthetic_media",
  "ai_phishing",
  "ai_social_engineering",
  "ai_malware",
  "ai_disinformation",

  // AI for security (defensive)
  "ai_detection",
  "soc_automation",
  "threat_hunting",
  "threat_intelligence",
  "malware_analysis",
  "secure_development",
  "defensive_ai",

  // Operational context
  "vulnerability",
  "cve",
  "actively_exploited",
  "proof_of_concept",
  "rce",
  "supply_chain",
  "credential_theft",
  "critical_infrastructure",
  "financial_sector",
  "government_sector",
  "healthcare_sector",
  "singapore_relevance",
  "asean_relevance",
  "research",
  "policy",
];

export function isAllowedTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

export function isAllowedCategory(category) {
  return MAIN_CATEGORIES.includes(category);
}
