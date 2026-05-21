// Lightweight pre-classification pass applied before storage.
// Uses conservative phrases to avoid false positives — full classification
// (LLM or rule-based) runs later and replaces these tags.
const QUICK_RULES = [
  // LLM threats
  { tag: "prompt_injection", phrases: ["prompt injection", "indirect prompt injection"] },
  { tag: "jailbreak", phrases: ["jailbreak", "jailbreaking"] },
  { tag: "guardrail_bypass", phrases: ["guardrail bypass", "safety bypass", "safety filter evasion"] },
  { tag: "rag_poisoning", phrases: ["rag poisoning", "retrieval poisoning", "embedding poisoning"] },
  { tag: "llm_data_leakage", phrases: ["system prompt leak", "training data extraction"] },

  // Agentic AI threats
  { tag: "autonomous_agent", phrases: ["ai agent", "autonomous agent", "agentic ai"] },
  { tag: "mcp_risk", phrases: ["model context protocol", "mcp server", "mcp vulnerability"] },
  { tag: "agent_tool_abuse", phrases: ["agent tool abuse", "tool call injection"] },

  // Traditional AI threats
  { tag: "data_poisoning", phrases: ["data poisoning", "training data poisoning"] },
  { tag: "model_backdoor", phrases: ["model backdoor", "trojaned model", "model poisoning"] },
  { tag: "adversarial_examples", phrases: ["adversarial example", "evasion attack"] },
  { tag: "ml_supply_chain", phrases: ["hugging face", "huggingface model", "malicious model"] },

  // AI-enabled threats
  { tag: "deepfake", phrases: ["deepfake", "face swap"] },
  { tag: "voice_cloning", phrases: ["voice cloning", "audio deepfake"] },
  { tag: "ai_phishing", phrases: ["ai phishing", "ai-generated phishing", "llm phishing"] },
  { tag: "ai_malware", phrases: ["ai-generated malware", "wormgpt", "darkgpt", "fraudgpt"] },
  { tag: "ai_disinformation", phrases: ["ai disinformation", "ai influence operation"] },

  // Operational context
  { tag: "actively_exploited", phrases: ["actively exploited", "exploited in the wild"] },
  { tag: "proof_of_concept", phrases: ["proof of concept", "proof-of-concept"] },
  { tag: "rce", phrases: ["remote code execution"] },
  { tag: "vulnerability", phrases: ["vulnerability", "security flaw"] },
  { tag: "cve", phrases: ["cve-"] },
  { tag: "research", phrases: ["arxiv", "research paper", "academic paper"] },
  { tag: "singapore_relevance", phrases: ["singapore"] },
];

export function inferSourceTags(source) {
  const text = `${source.title || ""} ${source.summary || ""} ${source.full_text || ""}`.toLowerCase();
  const tags = new Set();

  for (const rule of QUICK_RULES) {
    if (rule.phrases.some((p) => text.includes(p))) {
      tags.add(rule.tag);
    }
  }

  return [...tags];
}

export function attachInitialTags(sources) {
  return sources.map((source) => ({
    ...source,
    tags: inferSourceTags(source),
  }));
}
