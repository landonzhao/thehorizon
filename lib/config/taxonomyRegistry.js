/**
 * Controlled taxonomy registry for Layer 5 tagging.
 *
 * Defines every valid framework tag that the LLM may assign.
 * Post-processing validates LLM output against this registry and drops
 * any tag not found here.
 *
 * Frameworks used:
 *   OWASP_LLM_TOP_10  — OWASP Top 10 for LLM Applications 2025
 *   OWASP_GENAI       — OWASP GenAI / Agentic AI extensions
 *   MITRE_ATLAS       — MITRE ATLAS (adversarial ML techniques)
 *   MITRE_ATTACK      — MITRE ATT&CK Enterprise (AI-augmented techniques)
 *   NIST_AI_RMF       — NIST AI Risk Management Framework (governance)
 *   INTERNAL          — Project-specific tags with no external framework match
 *
 * Per entry:
 *   framework       — one of the six framework identifiers above
 *   framework_ref   — canonical reference ID (e.g. LLM01, AML.T0054, T1566)
 *   category_hint   — suggested main_category, or null for cross-cutting tags
 *   description     — brief description for LLM context
 */

// ── OWASP Top 10 for LLM Applications 2025 ───────────────────────────────────

const OWASP_LLM_TOP_10 = {
  prompt_injection: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM01",
    category_hint: "llm_threats",
    description: "Attacker manipulates LLM behaviour through crafted inputs that override instructions",
  },
  sensitive_information_disclosure: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM02",
    category_hint: "llm_threats",
    description: "LLM reveals confidential data, PII, or system details unintentionally",
  },
  supply_chain: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM03",
    category_hint: "llm_threats",
    description: "Compromised models, datasets, or third-party integrations in the LLM pipeline",
  },
  data_model_poisoning: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM04",
    category_hint: "llm_threats",
    description: "Training data or fine-tuning datasets manipulated to influence LLM behaviour",
  },
  improper_output_handling: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM05",
    category_hint: "llm_threats",
    description: "LLM output used without sanitisation, enabling XSS, SSRF, code injection",
  },
  excessive_agency: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM06",
    category_hint: "agentic_ai_threats",
    description: "LLM granted excessive permissions or autonomy beyond what the task requires",
  },
  system_prompt_leakage: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM07",
    category_hint: "llm_threats",
    description: "System prompt or confidential instructions extracted from the LLM application",
  },
  vector_embedding_weaknesses: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM08",
    category_hint: "llm_threats",
    description: "Vector store or RAG pipeline vulnerabilities enabling data leakage or poisoning",
  },
  misinformation: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM09",
    category_hint: "llm_threats",
    description: "LLM generates false or misleading information presented as authoritative",
  },
  unbounded_consumption: {
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM10",
    category_hint: "llm_threats",
    description: "Denial of service or resource exhaustion through unbounded LLM inference requests",
  },
};

// ── OWASP GenAI / Agentic AI ─────────────────────────────────────────────────

const OWASP_GENAI = {
  rag_poisoning: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-RAG",
    category_hint: "llm_threats",
    description: "RAG knowledge base poisoned to inject malicious content into LLM responses",
  },
  memory_poisoning: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-MEM",
    category_hint: "llm_threats",
    description: "Persistent agent memory or conversation history manipulated to alter future behaviour",
  },
  context_leakage: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-CTX",
    category_hint: "llm_threats",
    description: "Sensitive context window contents (history, injected data) leaked to attacker",
  },
  tool_hijacking: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-TOOL",
    category_hint: "agentic_ai_threats",
    description: "Agent's tool calls intercepted or redirected to attacker-controlled endpoints",
  },
  function_hijacking: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-FUNC",
    category_hint: "agentic_ai_threats",
    description: "Agent's function-calling mechanism manipulated to execute unintended operations",
  },
  mcp_abuse: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-MCP",
    category_hint: "agentic_ai_threats",
    description: "Model Context Protocol server or tool definitions exploited to abuse agent capabilities",
  },
  orchestration_compromise: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-ORCH",
    category_hint: "agentic_ai_threats",
    description: "Multi-agent orchestration layer compromised, enabling lateral movement or cascading failures",
  },
  autonomous_execution_risk: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-AER",
    category_hint: "agentic_ai_threats",
    description: "Agent executes real-world actions without adequate human oversight or confirmation",
  },
  sandbox_escape: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-SBX",
    category_hint: "agentic_ai_threats",
    description: "Agent or code execution capability breaks out of its intended execution sandbox",
  },
  agent_permission_abuse: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-PERM",
    category_hint: "agentic_ai_threats",
    description: "Agent uses granted permissions beyond the intended scope of its task",
  },
  prompt_to_tool_execution: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-PTE",
    category_hint: "agentic_ai_threats",
    description: "Injected prompt causes agent to invoke tools with attacker-controlled parameters",
  },
  agentic_workflow_compromise: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-AWC",
    category_hint: "agentic_ai_threats",
    description: "Automated agentic workflow (CI/CD, data pipelines) compromised via AI components",
  },
  coding_agent_risk: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-CAR",
    category_hint: "agentic_ai_threats",
    description: "Coding agent or AI pair programmer exploited to introduce vulnerabilities or exfiltrate code",
  },
  tool_supply_chain_risk: {
    framework: "OWASP_GENAI", framework_ref: "GENAI-TSC",
    category_hint: "agentic_ai_threats",
    description: "Third-party MCP servers, plugins, or tool integrations contain malicious code or backdoors",
  },
};

// ── MITRE ATLAS ───────────────────────────────────────────────────────────────

const MITRE_ATLAS = {
  model_poisoning: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0054",
    category_hint: "traditional_ai_threats",
    description: "Training data or fine-tuning pipeline manipulated to embed malicious behaviour in the model",
  },
  data_poisoning: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0020",
    category_hint: "traditional_ai_threats",
    description: "Training dataset corrupted to degrade model performance or introduce backdoors",
  },
  model_extraction: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0048",
    category_hint: "traditional_ai_threats",
    description: "Model functionality, weights, or decision boundaries stolen via systematic API queries",
  },
  model_inversion: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0053",
    category_hint: "traditional_ai_threats",
    description: "Training data membership or private attributes inferred from model outputs",
  },
  adversarial_evasion: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0057",
    category_hint: "traditional_ai_threats",
    description: "Adversarial perturbations cause model to misclassify inputs at inference time",
  },
  backdoor_model: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0058",
    category_hint: "traditional_ai_threats",
    description: "Hidden trigger embedded in a model causes targeted misclassification when activated",
  },
  ai_supply_chain_compromise: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0000",
    category_hint: "traditional_ai_threats",
    description: "Compromise of ML supply chain: model repositories, pre-trained models, datasets, frameworks",
  },
  training_pipeline_compromise: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0019",
    category_hint: "traditional_ai_threats",
    description: "Training pipeline or data preprocessing infrastructure attacked to corrupt model output",
  },
  inference_api_abuse: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0040",
    category_hint: "traditional_ai_threats",
    description: "ML inference API systematically abused for model extraction, evasion, or DoS",
  },
  model_repository_risk: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0000",
    category_hint: "traditional_ai_threats",
    description: "Public or private model repositories (Hugging Face, etc.) used as vector for supply chain attack",
  },
  adversarial_data: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0043",
    category_hint: "traditional_ai_threats",
    description: "Adversarially crafted input data designed to exploit specific ML model weaknesses",
  },
  llm_prompt_injection_atlas: {
    framework: "MITRE_ATLAS", framework_ref: "AML.T0051",
    category_hint: "llm_threats",
    description: "LLM prompt injection technique catalogued in MITRE ATLAS",
  },
};

// ── MITRE ATT&CK Enterprise ───────────────────────────────────────────────────

const MITRE_ATTACK = {
  ai_assisted_phishing: {
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    category_hint: "ai_enabled_threats",
    description: "AI-generated or AI-personalised phishing messages used to increase attack success rates",
  },
  ai_social_engineering: {
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    category_hint: "ai_enabled_threats",
    description: "AI used to craft convincing social engineering scenarios, scripts, or personas",
  },
  deepfake_impersonation: {
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    category_hint: "ai_enabled_threats",
    description: "Deepfake video, audio, or image used to impersonate a trusted individual",
  },
  voice_cloning: {
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    category_hint: "ai_enabled_threats",
    description: "AI voice cloning used to impersonate executives, staff, or public figures in fraud or social engineering",
  },
  synthetic_identity_abuse: {
    framework: "MITRE_ATTACK", framework_ref: "T1036.003",
    category_hint: "ai_enabled_threats",
    description: "AI-generated synthetic identities used for fraud, account creation, or social engineering",
  },
  ai_assisted_reconnaissance: {
    framework: "MITRE_ATTACK", framework_ref: "T1595",
    category_hint: "ai_enabled_threats",
    description: "AI tools used to automate or enhance target reconnaissance and OSINT collection",
  },
  ai_assisted_malware: {
    framework: "MITRE_ATTACK", framework_ref: "T1587.001",
    category_hint: "ai_enabled_threats",
    description: "AI used to develop, obfuscate, or mutate malware to evade detection",
  },
  ai_assisted_vulnerability_exploitation: {
    framework: "MITRE_ATTACK", framework_ref: "T1190",
    category_hint: "ai_enabled_threats",
    description: "AI used to automate vulnerability discovery, patch diffing, or exploit development",
  },
  ai_enabled_fraud: {
    framework: "MITRE_ATTACK", framework_ref: "T1657",
    category_hint: "ai_enabled_threats",
    description: "AI-generated content used to conduct financial fraud, wire fraud, or business email compromise",
  },
  ai_generated_disinformation: {
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    category_hint: "ai_enabled_threats",
    description: "AI-generated synthetic media or text used in influence operations or disinformation campaigns",
  },
  credential_access: {
    framework: "MITRE_ATTACK", framework_ref: "T1110",
    category_hint: "ai_enabled_threats",
    description: "AI used to accelerate credential stuffing, brute force, or password spray attacks",
  },
  phishing: {
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    category_hint: "ai_enabled_threats",
    description: "Phishing campaign where AI is a significant component of the attack technique",
  },
  reconnaissance: {
    framework: "MITRE_ATTACK", framework_ref: "T1595",
    category_hint: "ai_enabled_threats",
    description: "Reconnaissance activity where AI tools materially accelerate or improve attacker intelligence gathering",
  },
  malware_development: {
    framework: "MITRE_ATTACK", framework_ref: "T1587.001",
    category_hint: "ai_enabled_threats",
    description: "Adversary uses AI/LLM to develop custom malware or modify existing samples",
  },
  exploit_public_facing_application: {
    framework: "MITRE_ATTACK", framework_ref: "T1190",
    category_hint: "ai_enabled_threats",
    description: "AI used to identify and exploit vulnerabilities in public-facing applications at scale",
  },
};

// ── NIST AI RMF ───────────────────────────────────────────────────────────────
// Cross-cutting governance framework — no specific category_hint

const NIST_AI_RMF = {
  nist_govern: {
    framework: "NIST_AI_RMF", framework_ref: "GOVERN",
    category_hint: null,
    description: "Source addresses AI governance, accountability, policies, or organisational risk management",
  },
  nist_map: {
    framework: "NIST_AI_RMF", framework_ref: "MAP",
    category_hint: null,
    description: "Source addresses AI risk identification, context setting, or threat landscape mapping",
  },
  nist_measure: {
    framework: "NIST_AI_RMF", framework_ref: "MEASURE",
    category_hint: null,
    description: "Source addresses AI risk analysis, measurement, evaluation, or assessment",
  },
  nist_manage: {
    framework: "NIST_AI_RMF", framework_ref: "MANAGE",
    category_hint: null,
    description: "Source addresses AI risk response, treatment, monitoring, or incident response",
  },
};

// ── INTERNAL ──────────────────────────────────────────────────────────────────
// Project-specific tags with no clean external framework mapping.
// Should be used sparingly — only when a genuinely useful tag has no external equivalent.

const INTERNAL = {
  jailbreak: {
    framework: "INTERNAL", framework_ref: "INT-JB",
    category_hint: "llm_threats",
    description: "Technique to bypass LLM safety guardrails and generate disallowed content",
  },
  guardrail_bypass: {
    framework: "INTERNAL", framework_ref: "INT-GB",
    category_hint: "llm_threats",
    description: "Technique specifically targeting LLM content filters or safety classifiers",
  },
  multimodal_injection: {
    framework: "INTERNAL", framework_ref: "INT-MMI",
    category_hint: "llm_threats",
    description: "Malicious instructions hidden in images, audio, or other non-text modalities",
  },
  model_supply_chain: {
    framework: "INTERNAL", framework_ref: "INT-MSC",
    category_hint: "traditional_ai_threats",
    description: "Risk from compromised model weights, unsafe pickle files, or tampered repositories",
  },
};

// ── Flat registry ─────────────────────────────────────────────────────────────

export const TAXONOMY_REGISTRY = {
  ...OWASP_LLM_TOP_10,
  ...OWASP_GENAI,
  ...MITRE_ATLAS,
  ...MITRE_ATTACK,
  ...NIST_AI_RMF,
  ...INTERNAL,
};

// All valid tag names — used for validation/drop of LLM tags not in registry
export const VALID_TAGS = new Set(Object.keys(TAXONOMY_REGISTRY));

// All valid framework identifiers
export const VALID_FRAMEWORKS = new Set([
  "OWASP_LLM_TOP_10", "OWASP_GENAI", "MITRE_ATLAS",
  "MITRE_ATTACK", "NIST_AI_RMF", "INTERNAL",
]);

/**
 * Validate and normalise a single framework_tag object from LLM output.
 * Returns null if the tag is not in the registry or the framework doesn't match.
 *
 * @param {{ tag: string, framework: string, framework_ref: string, evidence: string, confidence: string, category_candidate: string }} rawTag
 * @returns {object|null}
 */
export function validateTag(rawTag) {
  if (!rawTag?.tag) return null;
  const entry = TAXONOMY_REGISTRY[rawTag.tag];
  if (!entry) return null;

  return {
    tag:              rawTag.tag,
    category_candidate: entry.category_hint || rawTag.category_candidate || null,
    framework:        entry.framework,
    framework_ref:    entry.framework_ref,
    evidence:         (rawTag.evidence || "").trim().slice(0, 300),
    confidence:       ["high", "medium", "low"].includes(rawTag.confidence)
      ? rawTag.confidence : "medium",
  };
}

/**
 * Validate an array of framework_tags from LLM output.
 * Drops invalid tags, normalises valid ones, caps at MAX_TAGS.
 *
 * @param {object[]} rawTags
 * @param {number}   [maxTags=6]
 * @returns {object[]}
 */
export function validateTags(rawTags, maxTags = 6) {
  if (!Array.isArray(rawTags)) return [];
  return rawTags
    .map(validateTag)
    .filter(Boolean)
    .slice(0, maxTags);
}

/**
 * Build the taxonomy context string injected into the Layer 5 LLM prompt.
 * Lists all valid tags grouped by framework (summary, not every field).
 *
 * @returns {string}
 */
export function buildTaxonomyContextForPrompt() {
  const byFramework = {};
  for (const [tag, entry] of Object.entries(TAXONOMY_REGISTRY)) {
    if (!byFramework[entry.framework]) byFramework[entry.framework] = [];
    byFramework[entry.framework].push(`${tag} (${entry.framework_ref})`);
  }

  const sections = Object.entries(byFramework).map(([fw, tags]) =>
    `${fw}:\n${tags.map((t) => `  - ${t}`).join("\n")}`
  );

  return sections.join("\n\n");
}
