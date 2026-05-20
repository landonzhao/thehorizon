import { TAG_VERSION } from "./taxonomy.js";

const TAG_RULES = [
  // Traditional AI threats
  {
    tag: "data_poisoning",
    category_hint: "traditional_ai_threats",
    phrases: ["data poisoning", "poisoned dataset", "training data poisoning", "dataset poisoning"],
  },
  {
    tag: "model_poisoning",
    category_hint: "traditional_ai_threats",
    phrases: ["model poisoning", "backdoored model", "model backdoor", "trojaned model"],
  },
  {
    tag: "model_extraction",
    category_hint: "traditional_ai_threats",
    phrases: ["model extraction", "model stealing", "steal the model", "model replication"],
  },
  {
    tag: "model_inversion",
    category_hint: "traditional_ai_threats",
    phrases: ["model inversion", "membership inference", "attribute inference"],
  },
  {
    tag: "adversarial_examples",
    category_hint: "traditional_ai_threats",
    phrases: ["adversarial example", "adversarial examples", "evasion attack", "adversarial perturbation"],
  },
  {
    tag: "ml_supply_chain",
    category_hint: "traditional_ai_threats",
    phrases: ["model supply chain", "dataset supply chain", "malicious model", "pickle file", "hugging face model"],
  },

  // LLM threats
  {
    tag: "prompt_injection",
    category_hint: "llm_threats",
    phrases: ["prompt injection", "indirect prompt injection", "instruction injection", "system prompt injection"],
  },
  {
    tag: "jailbreak",
    category_hint: "llm_threats",
    phrases: ["jailbreak", "jailbreaking", "guardrail bypass", "bypass guardrails", "safety bypass"],
  },
  {
    tag: "rag_poisoning",
    category_hint: "llm_threats",
    phrases: ["rag poisoning", "retrieval poisoning", "embedding poisoning", "poisoned document", "vector database attack"],
  },
  {
    tag: "llm_data_leakage",
    category_hint: "llm_threats",
    phrases: ["system prompt leak", "prompt leak", "llm data leak", "sensitive data exposure", "training data leak"],
  },
  {
    tag: "llm_tool_risk",
    category_hint: "llm_threats",
    phrases: ["plugin vulnerability", "tool use", "function calling", "tool call", "connector abuse"],
  },
  {
    tag: "llm_app_vulnerability",
    category_hint: "llm_threats",
    phrases: ["llm application", "chatbot vulnerability", "ai assistant vulnerability", "llm security"],
  },

  // Agentic AI threats
  {
    tag: "ai_agent",
    category_hint: "agentic_ai_threats",
    phrases: ["ai agent", "agentic ai", "autonomous agent", "multi-agent", "workflow agent"],
  },
  {
    tag: "agent_tool_abuse",
    category_hint: "agentic_ai_threats",
    phrases: ["tool abuse", "unauthorized tool", "tool invocation", "function abuse", "command execution"],
  },
  {
    tag: "mcp_risk",
    category_hint: "agentic_ai_threats",
    phrases: ["mcp", "model context protocol", "mcp server", "mcp tool"],
  },
  {
    tag: "coding_agent_risk",
    category_hint: "agentic_ai_threats",
    phrases: ["coding agent", "cursor", "claude code", "ai coding assistant"],
  },
  {
    tag: "agent_memory_risk",
    category_hint: "agentic_ai_threats",
    phrases: ["agent memory", "persistent memory", "memory poisoning", "context poisoning"],
  },
  {
    tag: "agent_sandbox_escape",
    category_hint: "agentic_ai_threats",
    phrases: ["sandbox escape", "container escape", "environment escape"],
  },

  // AI-enabled threats
  {
    tag: "deepfake",
    category_hint: "ai_enabled_threats",
    phrases: ["deepfake", "synthetic media", "face swap", "voice clone", "voice cloning"],
  },
  {
    tag: "ai_phishing",
    category_hint: "ai_enabled_threats",
    phrases: ["ai phishing", "phishing", "spear phishing", "business email compromise", "bec"],
  },
  {
    tag: "ai_social_engineering",
    category_hint: "ai_enabled_threats",
    phrases: ["social engineering", "impersonation", "scam", "fraud", "romance scam"],
  },
  {
    tag: "ai_malware",
    category_hint: "ai_enabled_threats",
    phrases: ["malware generation", "ai-generated malware", "ransomware", "infostealer", "payload generation"],
  },
  {
    tag: "ai_disinformation",
    category_hint: "ai_enabled_threats",
    phrases: ["disinformation", "misinformation", "influence operation", "propaganda", "fake news"],
  },

  // AI for Security
  {
    tag: "ai_detection",
    category_hint: "ai_for_security",
    phrases: ["ai detection", "anomaly detection", "threat detection", "detect malicious", "classifier"],
  },
  {
    tag: "soc_automation",
    category_hint: "ai_for_security",
    phrases: ["soc automation", "security operations", "alert triage", "security copilot", "incident triage"],
  },
  {
    tag: "threat_intelligence",
    category_hint: "ai_for_security",
    phrases: ["threat intelligence", "threat hunting", "ioc", "ttp", "campaign analysis"],
  },
  {
    tag: "malware_analysis",
    category_hint: "ai_for_security",
    phrases: ["malware analysis", "reverse engineering", "sandbox analysis"],
  },
  {
    tag: "vulnerability_management",
    category_hint: "ai_for_security",
    phrases: ["vulnerability management", "patch management", "cve", "cvss", "epss"],
  },
  {
    tag: "secure_development",
    category_hint: "ai_for_security",
    phrases: ["secure sdlc", "secure coding", "code scanning", "static analysis", "codeql"],
  },
];

function buildSearchText(source) {
  return [
    source.title,
    source.publisher,
    source.source_type,
    source.full_text,
    source.summary,
    ...(source.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeTag(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function publisherTag(source) {
  if (!source.publisher) return null;
  return `publisher:${normalizeTag(source.publisher)}`;
}

export function tagSourceAdvanced(source) {
  const text = buildSearchText(source);
  const tags = new Set();
  const categorySignals = {
    traditional_ai_threats: 0,
    llm_threats: 0,
    agentic_ai_threats: 0,
    ai_enabled_threats: 0,
    ai_for_security: 0,
  };

  const matchedPhrases = [];

  for (const rule of TAG_RULES) {
    const hits = rule.phrases.filter((phrase) =>
      text.includes(phrase.toLowerCase())
    );

    if (hits.length > 0) {
      tags.add(rule.tag);
      categorySignals[rule.category_hint] += hits.length;
      matchedPhrases.push({
        tag: rule.tag,
        category_hint: rule.category_hint,
        phrases: hits,
      });
    }
  }

  if (source.source_type) tags.add(normalizeTag(source.source_type));

  const pubTag = publisherTag(source);
  if (pubTag) tags.add(pubTag);

  return {
    ...source,
    tags: [...tags].sort(),
    tag_version: TAG_VERSION,
    tag_metadata: {
      category_signals: categorySignals,
      matched_phrases: matchedPhrases,
    },
  };
}
