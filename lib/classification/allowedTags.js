// ── Categories ────────────────────────────────────────────────────────────────
// Four mutually exclusive threat domains. Derived from MITRE ATLAS, OWASP LLM
// Top 10 (2025), and MITRE ATT&CK. See docs/logic-taxonomy.md for definitions.

export const MAIN_CATEGORIES = [
  "traditional_ai_threats",  // attacks ON ML models and training pipelines
  "llm_threats",             // attacks ON / VIA large language models
  "agentic_ai_threats",      // attacks ON / VIA autonomous AI agents
  "ai_enabled_threats",      // AI used AS A WEAPON by threat actors
];

// ── Tags ──────────────────────────────────────────────────────────────────────
// Threat tags: derived from OWASP LLM Top 10 (2025) and MITRE ATLAS.
// Context tags: operational signals that may appear alongside any category.

export const ALLOWED_TAGS = [

  // ── Traditional AI / ML threats (MITRE ATLAS) ─────────────────────────────
  "adversarial_examples",    // ATLAS AML.T0015: crafted inputs causing model misclassification
  "data_poisoning",          // ATLAS AML.T0020: contaminating training datasets
  "model_backdoor",          // ATLAS AML.T0018: hidden triggers embedded in trained weights
  "model_extraction",        // ATLAS AML.T0037: stealing model behaviour via API queries
  "model_inversion",         // ATLAS AML.T0024: inferring training data via model outputs
  "ml_supply_chain",         // ATLAS AML.T0010: malicious pretrained models, Hugging Face attacks

  // ── LLM threats (OWASP LLM Top 10, 2025) ─────────────────────────────────
  "prompt_injection",        // LLM01: direct and indirect instruction injection attacks
  "insecure_output_handling",// LLM02: downstream code/command injection via unsanitised LLM output
  "training_data_poisoning", // LLM03: corrupting LLM training or fine-tuning data
  "model_dos",               // LLM04: resource exhaustion via crafted inputs (sponge attacks)
  "llm_supply_chain",        // LLM05: vulnerable plugins, training data, pretrained components
  "sensitive_data_disclosure",// LLM06: system prompt extraction, PII leakage, memorisation
  "insecure_plugin_design",  // LLM07: inadequate access controls on LLM plugins and tools
  "excessive_agency",        // LLM08: LLM granted excessive permissions or autonomy
  "overreliance",            // LLM09: unsafe reliance on LLM output; guardrail bypass
  "model_theft",             // LLM10: model stealing, fine-tuned model exfiltration
  "jailbreak",               // Circumventing LLM safety training (DAN, roleplay, many-shot)
  "rag_attack",              // RAG / vector database poisoning; context manipulation

  // ── Agentic AI threats (MITRE ATLAS + OWASP Agentic AI, 2025) ────────────
  "agent_hijacking",         // Manipulation of an agent's goals, tasks, or execution context
  "mcp_exploitation",        // Model Context Protocol server compromise; tool poisoning
  "tool_abuse",              // Unauthorised or manipulated tool/function calls by LLM agent
  "agent_memory_attack",     // Persistent memory or context poisoning across agent sessions
  "coding_agent_risk",       // Security flaws in AI coding assistants (Copilot, Cursor, etc.)
  "multi_agent_attack",      // Attacks spanning or exploiting multi-agent pipelines
  "browser_agent_risk",      // Exploitation of computer-use and web-browsing agent capabilities

  // ── AI-enabled threats (MITRE ATT&CK + CTI) ──────────────────────────────
  "ai_generated_phishing",   // LLM-crafted spear-phishing at scale (ATT&CK T1566)
  "deepfake",                // Synthetic video/image for fraud, impersonation, social engineering
  "voice_cloning",           // AI voice synthesis for fraud, BEC, and vishing
  "synthetic_identity",      // AI-generated personas, documents, or identities for fraud
  "ai_generated_malware",    // LLM-written, obfuscated, or polymorphic malware
  "ai_disinformation",       // AI-powered influence operations and synthetic narratives
  "ai_reconnaissance",       // AI-assisted OSINT, target profiling, and vulnerability discovery

  // ── Operational context tags ──────────────────────────────────────────────
  "cve",                     // References a specific CVE identifier
  "actively_exploited",      // In-the-wild exploitation confirmed by a trusted source
  "proof_of_concept",        // Publicly available PoC exploit or research demonstration
  "vulnerability",           // Vulnerability disclosure (with or without CVE)
  "supply_chain",            // Software or hardware supply chain attack vector
  "critical_infrastructure", // Attack targets critical infrastructure sectors
  "nation_state",            // Attributed to or characteristic of a nation-state threat actor
  "research",                // Academic or peer-reviewed research paper
];

export function isAllowedTag(tag) {
  return ALLOWED_TAGS.includes(tag);
}

export function isAllowedCategory(category) {
  return MAIN_CATEGORIES.includes(category);
}
