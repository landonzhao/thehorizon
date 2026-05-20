export const TAG_VERSION = "ai-threat-tags-v2.0";

export const MAIN_CATEGORIES = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
  "uncategorised",
];

export const TAG_DEFINITIONS = [
  // LLM threats
  {
    tag: "prompt_injection",
    category: "llm_threats",
    ai_weight: 35,
    phrases: ["prompt injection", "indirect prompt injection", "instruction injection"],
  },
  {
    tag: "jailbreak",
    category: "llm_threats",
    ai_weight: 30,
    phrases: ["jailbreak", "jailbreaking", "guardrail bypass", "bypass guardrails"],
  },
  {
    tag: "rag_poisoning",
    category: "llm_threats",
    ai_weight: 30,
    phrases: ["rag poisoning", "retrieval poisoning", "embedding poisoning", "poisoned document"],
  },
  {
    tag: "llm_data_exfiltration",
    category: "llm_threats",
    ai_weight: 30,
    phrases: ["system prompt leak", "prompt leak", "llm data leak", "sensitive data exposure"],
  },
  {
    tag: "llm_tool_abuse",
    category: "llm_threats",
    ai_weight: 25,
    phrases: ["function calling", "tool call", "plugin vulnerability", "llm plugin"],
  },

  // Agentic AI threats
  {
    tag: "agent_tool_abuse",
    category: "agentic_ai_threats",
    ai_weight: 35,
    phrases: ["agent tool abuse", "tool abuse", "unauthorized tool", "tool invocation"],
  },
  {
    tag: "mcp_risk",
    category: "agentic_ai_threats",
    ai_weight: 35,
    phrases: ["model context protocol", "mcp server", "mcp tool", "mcp"],
  },
  {
    tag: "coding_agent_risk",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: ["coding agent", "claude code", "cursor", "ai coding assistant"],
  },
  {
    tag: "autonomous_agent",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: ["autonomous agent", "agentic ai", "ai agent", "multi-agent"],
  },
  {
    tag: "agent_memory_poisoning",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: ["agent memory", "memory poisoning", "context poisoning"],
  },

  // Traditional AI / ML threats
  {
    tag: "data_poisoning",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: ["data poisoning", "training data poisoning", "poisoned dataset"],
  },
  {
    tag: "model_poisoning",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: ["model poisoning", "model backdoor", "backdoored model", "trojaned model"],
  },
  {
    tag: "model_extraction",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: ["model extraction", "model stealing", "steal the model"],
  },
  {
    tag: "membership_inference",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: ["membership inference", "model inversion", "attribute inference"],
  },
  {
    tag: "adversarial_examples",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: ["adversarial example", "adversarial examples", "evasion attack"],
  },
  {
    tag: "ml_supply_chain",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: ["model supply chain", "dataset supply chain", "malicious model", "hugging face model"],
  },

  // AI-enabled threats
  {
    tag: "deepfake",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: ["deepfake", "synthetic media", "face swap"],
  },
  {
    tag: "voice_cloning",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: ["voice cloning", "voice clone", "voice impersonation"],
  },
  {
    tag: "ai_phishing",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: ["ai phishing", "ai-generated phishing", "llm-generated phishing"],
  },
  {
    tag: "ai_social_engineering",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: ["ai-generated scam", "ai scam", "synthetic identity", "ai impersonation"],
  },
  {
    tag: "ai_malware",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: ["ai-generated malware", "malware generation", "llm malware"],
  },
  {
    tag: "ai_disinformation",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: ["ai-generated disinformation", "synthetic propaganda", "influence operation using ai"],
  },

  // AI for Security
  {
    tag: "ai_detection",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: ["ai detection", "machine learning detection", "ai-based detection"],
  },
  {
    tag: "soc_automation",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: ["soc automation", "security copilot", "alert triage", "ai triage"],
  },
  {
    tag: "ai_threat_hunting",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: ["ai threat hunting", "llm threat hunting", "ai-assisted threat hunting"],
  },
  {
    tag: "ai_malware_analysis",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: ["ai malware analysis", "llm malware analysis", "ai reverse engineering"],
  },
  {
    tag: "secure_ai_development",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: ["secure sdlc agents", "ai secure coding", "ai code scanning", "codeql"],
  },

  // Operational context tags
  {
    tag: "actively_exploited",
    category: null,
    ai_weight: 0,
    phrases: ["actively exploited", "exploited in the wild", "in the wild"],
  },
  {
    tag: "proof_of_concept",
    category: null,
    ai_weight: 0,
    phrases: ["proof of concept", "poc", "public exploit"],
  },
  {
    tag: "credential_theft",
    category: null,
    ai_weight: 0,
    phrases: ["credential theft", "stolen credentials", "passwords", "api keys", "tokens"],
  },
  {
    tag: "supply_chain",
    category: null,
    ai_weight: 0,
    phrases: ["supply chain", "npm package", "pypi package", "compromised maintainer"],
  },
  {
    tag: "rce",
    category: null,
    ai_weight: 0,
    phrases: ["remote code execution", "rce", "execute arbitrary code"],
  },
  {
    tag: "critical_infrastructure",
    category: null,
    ai_weight: 0,
    phrases: ["critical infrastructure", "ics", "scada", "industrial control"],
  },
  {
    tag: "financial_sector",
    category: null,
    ai_weight: 0,
    phrases: ["bank", "financial sector", "fintech", "payment"],
  },
  {
    tag: "singapore_relevance",
    category: null,
    ai_weight: 0,
    phrases: ["singapore", "csa singapore", "imda", "mas", "govtech"],
  },
];

export const GENERIC_CYBER_TAGS = [
  "actively_exploited",
  "proof_of_concept",
  "credential_theft",
  "supply_chain",
  "rce",
  "critical_infrastructure",
  "financial_sector",
  "singapore_relevance",
];
