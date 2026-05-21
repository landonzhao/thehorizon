export const TAG_VERSION = "ai-threat-tags-v3.0";

// Single source of truth for all tags.
// Used by: ruleBasedClassifier (phrases + category), classifyStoredSources (ai_weight),
// allowedTags (tag names), enrichSource LLM prompt (tag names via ALLOWED_TAGS).
export const TAG_DEFINITIONS = [

  // ── Traditional AI / ML threats ──────────────────────────────────────────

  {
    tag: "data_poisoning",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: [
      "data poisoning", "training data poisoning", "poisoned dataset",
      "poisoned training data", "backdoor via data injection",
    ],
  },
  {
    tag: "model_extraction",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: [
      "model extraction", "model stealing", "model theft",
      "stealing the model", "api extraction attack",
    ],
  },
  {
    tag: "model_backdoor",
    category: "traditional_ai_threats",
    ai_weight: 30,
    phrases: [
      "model backdoor", "backdoored model", "trojaned model",
      "trojan attack", "model poisoning", "neural backdoor",
      "malicious model weights", "poisoned model",
    ],
  },
  {
    tag: "membership_inference",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: [
      "membership inference", "model inversion", "attribute inference",
      "privacy attack on model", "training data reconstruction",
    ],
  },
  {
    tag: "adversarial_examples",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: [
      "adversarial example", "adversarial input", "evasion attack",
      "perturbation attack", "adversarial patch", "adversarial robustness",
      "adversarial ml", "adversarial machine learning",
    ],
  },
  {
    tag: "ml_supply_chain",
    category: "traditional_ai_threats",
    ai_weight: 25,
    phrases: [
      "model supply chain", "dataset supply chain", "hugging face",
      "huggingface model", "compromised dataset", "malicious model file",
      "pickle exploit", "unsafe model deserialization",
    ],
  },

  // ── LLM threats ───────────────────────────────────────────────────────────

  {
    tag: "prompt_injection",
    category: "llm_threats",
    ai_weight: 35,
    phrases: [
      "prompt injection", "indirect prompt injection",
      "instruction injection", "prompt hijacking", "prompt override",
    ],
  },
  {
    tag: "jailbreak",
    category: "llm_threats",
    ai_weight: 30,
    phrases: [
      "jailbreak", "jailbreaking", "dan attack", "many-shot jailbreak",
      "many shot jailbreak", "gcg attack", "universal adversarial suffix",
    ],
  },
  {
    tag: "guardrail_bypass",
    category: "llm_threats",
    ai_weight: 30,
    phrases: [
      "guardrail bypass", "bypass guardrail", "safety bypass",
      "content filter bypass", "safety filter evasion", "alignment bypass",
      "moderation bypass",
    ],
  },
  {
    tag: "rag_poisoning",
    category: "llm_threats",
    ai_weight: 30,
    phrases: [
      "rag poisoning", "retrieval poisoning", "embedding poisoning",
      "poisoned document", "vector database poisoning",
      "knowledge base poisoning",
    ],
  },
  {
    tag: "llm_data_leakage",
    category: "llm_threats",
    ai_weight: 30,
    phrases: [
      "system prompt leak", "system prompt extraction", "prompt leak",
      "training data extraction", "llm memorization",
      "training data memorization", "llm data exfiltration",
    ],
  },
  {
    tag: "llm_tool_abuse",
    category: "llm_threats",
    ai_weight: 25,
    phrases: [
      "function calling abuse", "tool call abuse", "plugin vulnerability",
      "llm plugin exploit", "llm function abuse", "tool injection",
      "function injection",
    ],
  },
  {
    tag: "llm_app_vulnerability",
    category: "llm_threats",
    ai_weight: 20,
    phrases: [
      "llm application vulnerability", "chatbot vulnerability",
      "ai application security flaw", "llm api vulnerability",
    ],
  },

  // ── Agentic AI threats ────────────────────────────────────────────────────

  {
    tag: "autonomous_agent",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: [
      "ai agent", "autonomous agent", "agentic ai", "multi-agent",
      "multi agent system", "llm agent", "ai orchestration",
    ],
  },
  {
    tag: "mcp_risk",
    category: "agentic_ai_threats",
    ai_weight: 35,
    phrases: [
      "model context protocol", "mcp server", "mcp tool",
      "mcp vulnerability", "mcp exploit", "mcp attack", "mcp risk",
    ],
  },
  {
    tag: "agent_tool_abuse",
    category: "agentic_ai_threats",
    ai_weight: 35,
    phrases: [
      "agent tool abuse", "unauthorized tool invocation", "tool misuse by agent",
      "agent exfiltration", "agent privilege escalation",
      "agent lateral movement", "tool call injection",
    ],
  },
  {
    tag: "agent_memory_poisoning",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: [
      "agent memory poisoning", "context window poisoning",
      "agent context manipulation", "long-term memory attack agent",
    ],
  },
  {
    tag: "coding_agent_risk",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: [
      "coding agent risk", "claude code vulnerability", "github copilot vulnerability",
      "ai coding assistant risk", "cursor vulnerability", "devin vulnerability",
      "ai code generation risk",
    ],
  },
  {
    tag: "browser_agent_risk",
    category: "agentic_ai_threats",
    ai_weight: 30,
    phrases: [
      "browser agent", "web agent attack", "computer use agent",
      "browser automation attack", "ai browser control vulnerability",
      "computer-use vulnerability",
    ],
  },

  // ── AI-enabled threats ────────────────────────────────────────────────────

  {
    tag: "deepfake",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: [
      "deepfake", "face swap", "face synthesis attack",
      "ai-generated video fraud", "synthetic face", "liveness detection bypass",
    ],
  },
  {
    tag: "voice_cloning",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: [
      "voice cloning", "voice clone", "voice impersonation",
      "audio deepfake", "voice spoofing", "fake audio",
      "synthetic voice attack", "speech synthesis fraud",
    ],
  },
  {
    tag: "synthetic_media",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: [
      "synthetic media", "ai-generated image fraud", "generative ai fraud",
      "text-to-image fraud", "ai-generated content used for fraud",
    ],
  },
  {
    tag: "ai_phishing",
    category: "ai_enabled_threats",
    ai_weight: 35,
    phrases: [
      "ai phishing", "ai-generated phishing", "llm phishing",
      "ai-powered phishing", "ai spear phishing", "llm-generated phishing email",
      "ai business email compromise", "ai bec",
    ],
  },
  {
    tag: "ai_social_engineering",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: [
      "ai social engineering", "ai impersonation", "ai-generated scam",
      "synthetic identity fraud", "ai romance scam", "ai vishing",
      "ai fraud", "generative ai scam",
    ],
  },
  {
    tag: "ai_malware",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: [
      "ai-generated malware", "llm malware", "ai-written malware",
      "ai-assisted malware development", "wormgpt", "darkgpt", "fraudgpt",
      "generative malware", "ai ransomware generation",
    ],
  },
  {
    tag: "ai_disinformation",
    category: "ai_enabled_threats",
    ai_weight: 30,
    phrases: [
      "ai disinformation", "ai-generated disinformation", "ai propaganda",
      "synthetic propaganda", "ai influence operation",
      "ai influence campaign", "llm disinformation", "generative disinformation",
    ],
  },

  // ── AI for security (defensive) ───────────────────────────────────────────

  {
    tag: "ai_detection",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: [
      "ai-based detection", "ml-based detection", "machine learning detection",
      "ai anomaly detection", "ai threat detection", "ai-powered ids",
      "ai-powered edr", "ai intrusion detection",
    ],
  },
  {
    tag: "soc_automation",
    category: "ai_for_security",
    ai_weight: 25,
    phrases: [
      "soc automation", "ai alert triage", "security copilot",
      "ai analyst assistant", "llm for security operations",
      "automated incident triage", "ai siem", "ai soar",
    ],
  },
  {
    tag: "threat_hunting",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: [
      "ai threat hunting", "llm threat hunting",
      "ai-assisted threat hunting", "ml-based threat hunting",
    ],
  },
  {
    tag: "threat_intelligence",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: [
      "ai threat intelligence", "llm threat intelligence",
      "ai-powered cti", "automated threat intelligence",
      "ai ioc extraction", "llm ioc analysis",
    ],
  },
  {
    tag: "malware_analysis",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: [
      "ai malware analysis", "llm malware analysis", "ai reverse engineering",
      "ml-based malware classification", "ai binary analysis",
    ],
  },
  {
    tag: "secure_development",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: [
      "ai code scanning", "ai sast", "ai dast",
      "ai-assisted secure coding", "llm vulnerability discovery",
      "ai bug finding", "ai security testing",
    ],
  },
  {
    tag: "defensive_ai",
    category: "ai_for_security",
    ai_weight: 20,
    phrases: [
      "ai safety research", "ai alignment", "rlhf safety",
      "constitutional ai", "llm guardrails", "red teaming llm",
      "ai red team", "model safety evaluation",
    ],
  },

  // ── Operational context tags (ai_weight=0, category=null) ─────────────────

  {
    tag: "vulnerability",
    category: null,
    ai_weight: 0,
    phrases: ["vulnerability", "security flaw", "security bug", "security weakness"],
  },
  {
    tag: "cve",
    category: null,
    ai_weight: 0,
    phrases: ["cve-", "common vulnerabilities and exposures"],
  },
  {
    tag: "actively_exploited",
    category: null,
    ai_weight: 0,
    phrases: ["actively exploited", "exploited in the wild", "zero-day exploit"],
  },
  {
    tag: "proof_of_concept",
    category: null,
    ai_weight: 0,
    phrases: ["proof of concept", "proof-of-concept", "exploit code released", "public exploit available"],
  },
  {
    tag: "rce",
    category: null,
    ai_weight: 0,
    phrases: ["remote code execution", "rce", "execute arbitrary code", "arbitrary code execution"],
  },
  {
    tag: "supply_chain",
    category: null,
    ai_weight: 0,
    phrases: [
      "supply chain attack", "supply chain compromise", "malicious npm package",
      "malicious pypi package", "compromised maintainer", "dependency confusion",
    ],
  },
  {
    tag: "credential_theft",
    category: null,
    ai_weight: 0,
    phrases: [
      "credential theft", "stolen credentials", "credential stuffing",
      "api key theft", "token theft", "account takeover",
    ],
  },
  {
    tag: "critical_infrastructure",
    category: null,
    ai_weight: 0,
    phrases: [
      "critical infrastructure", "ics security", "scada", "industrial control system",
      "operational technology", "ot security", "critical information infrastructure",
    ],
  },
  {
    tag: "financial_sector",
    category: null,
    ai_weight: 0,
    phrases: [
      "financial sector", "banking sector", "fintech", "payment system",
      "digital bank", "financial institution",
    ],
  },
  {
    tag: "government_sector",
    category: null,
    ai_weight: 0,
    phrases: [
      "government agency", "government sector", "public sector",
      "federal agency", "ministry", "defence sector", "national security",
    ],
  },
  {
    tag: "singapore_relevance",
    category: null,
    ai_weight: 0,
    phrases: ["singapore", "csa singapore", "imda", "govtech singapore", "mas singapore"],
  },
  {
    tag: "asean_relevance",
    category: null,
    ai_weight: 0,
    phrases: [
      "asean", "southeast asia", "south-east asia",
      "malaysia", "indonesia", "thailand", "vietnam", "philippines",
    ],
  },
  {
    tag: "research",
    category: null,
    ai_weight: 0,
    phrases: ["arxiv", "research paper", "academic paper", "conference paper", "ieee", "acm dl"],
  },
  {
    tag: "policy",
    category: null,
    ai_weight: 0,
    phrases: [
      "eu ai act", "ai regulation", "ai governance", "ai policy",
      "nist ai rmf", "iso 42001", "ai executive order", "ai safety framework",
    ],
  },
];

// Context tags that carry no AI-specificity signal
export const CONTEXT_TAGS = [
  "vulnerability", "cve", "actively_exploited", "proof_of_concept",
  "rce", "supply_chain", "credential_theft", "critical_infrastructure",
  "financial_sector", "government_sector", "singapore_relevance",
  "asean_relevance", "research", "policy",
];
