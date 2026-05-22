export const TAG_VERSION = "ai-threat-tags-v5.0";

// Metadata registry for all allowed tags.
// Used by: purgeIrrelevantSources (AI keyword check), allowedTags (tag names),
// enrichSource LLM prompt (tag names via ALLOWED_TAGS).
// Classification is LLM-only — no phrase matching in this file.
export const TAG_DEFINITIONS = [

  // ── Traditional AI / ML threats (MITRE ATLAS) ─────────────────────────────
  { tag: "adversarial_examples",     category: "traditional_ai_threats", framework: "ATLAS AML.T0015" },
  { tag: "data_poisoning",           category: "traditional_ai_threats", framework: "ATLAS AML.T0020" },
  { tag: "model_backdoor",           category: "traditional_ai_threats", framework: "ATLAS AML.T0018" },
  { tag: "model_extraction",         category: "traditional_ai_threats", framework: "ATLAS AML.T0037" },
  { tag: "model_inversion",          category: "traditional_ai_threats", framework: "ATLAS AML.T0024" },
  { tag: "ml_supply_chain",          category: "traditional_ai_threats", framework: "ATLAS AML.T0010" },

  // ── LLM threats (OWASP LLM Top 10, 2025) ─────────────────────────────────
  { tag: "prompt_injection",         category: "llm_threats",            framework: "OWASP LLM01" },
  { tag: "insecure_output_handling", category: "llm_threats",            framework: "OWASP LLM02" },
  { tag: "training_data_poisoning",  category: "llm_threats",            framework: "OWASP LLM03" },
  { tag: "model_dos",                category: "llm_threats",            framework: "OWASP LLM04" },
  { tag: "llm_supply_chain",         category: "llm_threats",            framework: "OWASP LLM05" },
  { tag: "sensitive_data_disclosure",category: "llm_threats",            framework: "OWASP LLM06" },
  { tag: "insecure_plugin_design",   category: "llm_threats",            framework: "OWASP LLM07" },
  { tag: "excessive_agency",         category: "llm_threats",            framework: "OWASP LLM08" },
  { tag: "overreliance",             category: "llm_threats",            framework: "OWASP LLM09" },
  { tag: "model_theft",              category: "llm_threats",            framework: "OWASP LLM10" },
  { tag: "jailbreak",                category: "llm_threats",            framework: "OWASP LLM01/LLM09" },
  { tag: "rag_attack",               category: "llm_threats",            framework: "OWASP LLM03/LLM06" },

  // ── Agentic AI threats (MITRE ATLAS + OWASP Agentic AI, 2025) ────────────
  { tag: "agent_hijacking",          category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },
  { tag: "mcp_exploitation",         category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },
  { tag: "tool_abuse",               category: "agentic_ai_threats",     framework: "OWASP LLM08" },
  { tag: "agent_memory_attack",      category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },
  { tag: "coding_agent_risk",        category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },
  { tag: "multi_agent_attack",       category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },
  { tag: "browser_agent_risk",       category: "agentic_ai_threats",     framework: "OWASP Agentic AI" },

  // ── AI-enabled threats (MITRE ATT&CK + CTI) ──────────────────────────────
  { tag: "ai_generated_phishing",    category: "ai_enabled_threats",     framework: "ATT&CK T1566" },
  { tag: "deepfake",                 category: "ai_enabled_threats",     framework: "ATT&CK T1598" },
  { tag: "voice_cloning",            category: "ai_enabled_threats",     framework: "ATT&CK T1566" },
  { tag: "synthetic_identity",       category: "ai_enabled_threats",     framework: "ATT&CK T1585" },
  { tag: "ai_generated_malware",     category: "ai_enabled_threats",     framework: "ATT&CK T1588" },
  { tag: "ai_disinformation",        category: "ai_enabled_threats",     framework: "ATT&CK T1583" },
  { tag: "ai_reconnaissance",        category: "ai_enabled_threats",     framework: "ATT&CK T1595" },

  // ── Operational context (cross-cutting — no category) ─────────────────────
  { tag: "cve",                      category: null,                      framework: "NVD" },
  { tag: "actively_exploited",       category: null,                      framework: "CISA KEV" },
  { tag: "proof_of_concept",         category: null,                      framework: null },
  { tag: "vulnerability",            category: null,                      framework: null },
  { tag: "supply_chain",             category: null,                      framework: "ATT&CK T1195" },
  { tag: "critical_infrastructure",  category: null,                      framework: "CISA" },
  { tag: "nation_state",             category: null,                      framework: "ATT&CK" },
  { tag: "research",                 category: null,                      framework: null },
];

export const CONTEXT_TAGS = TAG_DEFINITIONS
  .filter((d) => d.category === null)
  .map((d) => d.tag);

export function getTagCategory(tag) {
  return TAG_DEFINITIONS.find((d) => d.tag === tag)?.category ?? null;
}
