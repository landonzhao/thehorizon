export const MAIN_CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
];

export const ALLOWED_TAGS = [
  // Traditional AI threats
  "data_poisoning",
  "model_poisoning",
  "model_backdoor",
  "model_extraction",
  "model_inversion",
  "membership_inference",
  "adversarial_examples",
  "evasion_attack",
  "ml_supply_chain",
  "malicious_model",
  "dataset_risk",

  // LLM threats
  "prompt_injection",
  "indirect_prompt_injection",
  "jailbreak",
  "guardrail_bypass",
  "rag_poisoning",
  "embedding_poisoning",
  "system_prompt_leak",
  "llm_data_leakage",
  "llm_plugin_risk",
  "llm_tool_abuse",
  "llm_app_vulnerability",

  // Agentic AI threats
  "ai_agent",
  "agentic_ai",
  "autonomous_agent",
  "multi_agent",
  "mcp_risk",
  "agent_tool_abuse",
  "agent_memory_risk",
  "agent_sandbox_escape",
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
  "ai_fraud",
  "impersonation",
  "scam",

  // AI for Security
  "ai_detection",
  "soc_automation",
  "threat_hunting",
  "threat_intelligence",
  "malware_analysis",
  "vulnerability_management",
  "secure_development",
  "incident_response",
  "security_copilot",
  "defensive_ai",

  // Context tags
  "vulnerability",
  "cve",
  "exploit",
  "zero_day",
  "patch_available",
  "research",
  "policy",
  "governance",
  "standards",
  "singapore_relevance",
  "asean_relevance",
  "critical_infrastructure",
  "financial_sector",
  "government_sector",
];

export function isAllowedTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

export function isAllowedCategory(category) {
  return MAIN_CATEGORIES.includes(category);
}
