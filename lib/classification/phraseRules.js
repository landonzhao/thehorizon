export const PHRASE_RULES = [
  // Traditional AI threats
  {
    tag: "data_poisoning",
    category: "traditional_ai_threats",
    phrases: ["data poisoning", "training data poisoning", "poisoned dataset"],
  },
  {
    tag: "model_extraction",
    category: "traditional_ai_threats",
    phrases: ["model extraction", "model stealing", "steal the model"],
  },
  {
    tag: "membership_inference",
    category: "traditional_ai_threats",
    phrases: ["membership inference", "model inversion", "attribute inference"],
  },
  {
    tag: "adversarial_examples",
    category: "traditional_ai_threats",
    phrases: ["adversarial example", "adversarial examples", "evasion attack"],
  },
  {
    tag: "ml_supply_chain",
    category: "traditional_ai_threats",
    phrases: ["model supply chain", "dataset supply chain", "malicious model"],
  },

  // LLM threats
  {
    tag: "prompt_injection",
    category: "llm_threats",
    phrases: ["prompt injection", "instruction injection"],
  },
  {
    tag: "indirect_prompt_injection",
    category: "llm_threats",
    phrases: ["indirect prompt injection"],
  },
  {
    tag: "jailbreak",
    category: "llm_threats",
    phrases: ["jailbreak", "jailbreaking"],
  },
  {
    tag: "guardrail_bypass",
    category: "llm_threats",
    phrases: ["guardrail bypass", "bypass guardrails", "safety bypass"],
  },
  {
    tag: "rag_poisoning",
    category: "llm_threats",
    phrases: ["rag poisoning", "retrieval poisoning", "poisoned document"],
  },
  {
    tag: "llm_data_leakage",
    category: "llm_threats",
    phrases: ["system prompt leak", "prompt leak", "llm data leak", "sensitive data exposure"],
  },

  // Agentic AI threats
  {
    tag: "ai_agent",
    category: "agentic_ai_threats",
    phrases: ["ai agent", "autonomous agent", "agentic ai"],
  },
  {
    tag: "mcp_risk",
    category: "agentic_ai_threats",
    phrases: ["mcp", "model context protocol", "mcp server"],
  },
  {
    tag: "agent_tool_abuse",
    category: "agentic_ai_threats",
    phrases: ["tool abuse", "tool invocation", "unauthorized tool", "function abuse"],
  },
  {
    tag: "coding_agent_risk",
    category: "agentic_ai_threats",
    phrases: ["coding agent", "claude code", "cursor", "ai coding assistant"],
  },

  // AI-enabled threats
  {
    tag: "deepfake",
    category: "ai_enabled_threats",
    phrases: ["deepfake", "synthetic media", "face swap"],
  },
  {
    tag: "voice_cloning",
    category: "ai_enabled_threats",
    phrases: ["voice cloning", "voice clone", "voice impersonation"],
  },
  {
    tag: "ai_phishing",
    category: "ai_enabled_threats",
    phrases: ["ai phishing", "phishing", "spear phishing"],
  },
  {
    tag: "ai_malware",
    category: "ai_enabled_threats",
    phrases: ["malware generation", "ai-generated malware", "ransomware"],
  },
  {
    tag: "ai_disinformation",
    category: "ai_enabled_threats",
    phrases: ["disinformation", "misinformation", "influence operation"],
  },

  // AI for Security
  {
    tag: "ai_detection",
    category: "ai_for_security",
    phrases: ["ai detection", "threat detection", "anomaly detection"],
  },
  {
    tag: "soc_automation",
    category: "ai_for_security",
    phrases: ["soc automation", "security operations", "alert triage"],
  },
  {
    tag: "threat_intelligence",
    category: "ai_for_security",
    phrases: ["threat intelligence", "campaign analysis", "threat hunting"],
  },
  {
    tag: "malware_analysis",
    category: "ai_for_security",
    phrases: ["malware analysis", "reverse engineering", "sandbox analysis"],
  },
  {
    tag: "secure_development",
    category: "ai_for_security",
    phrases: ["secure sdlc", "secure coding", "code scanning", "codeql"],
  },
];
