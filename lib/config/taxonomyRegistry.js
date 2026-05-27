/**
 * Controlled taxonomy registry for the pipeline tagging layers.
 *
 * Three distinct taxonomic groups — each maps to a separate output field:
 *
 *   framework_tags    → AI-specific risk patterns
 *     Sources: OWASP_LLM_TOP_10, OWASP_GENAI, MITRE_ATLAS, INTERNAL
 *
 *   attack_mappings   → Cyber operation behaviours (MITRE ATT&CK)
 *     Sources: MITRE_ATTACK (expanded)
 *
 *   governance_tags   → Risk management framework lenses
 *     Sources: NIST_AI_RMF
 *
 * Per entry:
 *   taxonomy_group  — "ai_framework_tag" | "attack_mapping" | "governance_tag"
 *   framework       — framework identifier
 *   framework_ref   — canonical reference ID
 *   tactic          — ATT&CK tactic phase (attack_mappings only)
 *   category_hint   — suggested main_category, or null for cross-cutting
 *   description     — brief description for LLM context
 */

// ── OWASP Top 10 for LLM Applications 2025 ───────────────────────────────────

const OWASP_LLM_TOP_10 = {
  prompt_injection: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM01",
    category_hint: "llm_threats",
    description: "Attacker manipulates LLM behaviour through crafted inputs that override instructions",
  },
  sensitive_information_disclosure: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM02",
    category_hint: "llm_threats",
    description: "LLM reveals confidential data, PII, or system details unintentionally",
  },
  supply_chain: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM03",
    category_hint: "llm_threats",
    description: "Compromised models, datasets, or third-party integrations in the LLM pipeline",
  },
  data_model_poisoning: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM04",
    category_hint: "llm_threats",
    description: "Training data or fine-tuning datasets manipulated to influence LLM behaviour",
  },
  improper_output_handling: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM05",
    category_hint: "llm_threats",
    description: "LLM output used without sanitisation, enabling XSS, SSRF, code injection",
  },
  excessive_agency: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM06",
    category_hint: "agentic_ai_threats",
    description: "LLM granted excessive permissions or autonomy beyond what the task requires",
  },
  system_prompt_leakage: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM07",
    category_hint: "llm_threats",
    description: "System prompt or confidential instructions extracted from the LLM application",
  },
  vector_embedding_weaknesses: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM08",
    category_hint: "llm_threats",
    description: "Vector store or RAG pipeline vulnerabilities enabling data leakage or poisoning",
  },
  misinformation: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM09",
    category_hint: "llm_threats",
    description: "LLM generates false or misleading information presented as authoritative",
  },
  unbounded_consumption: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_LLM_TOP_10", framework_ref: "LLM10",
    category_hint: "llm_threats",
    description: "Denial of service or resource exhaustion through unbounded LLM inference requests",
  },
};

// ── OWASP GenAI / Agentic AI ─────────────────────────────────────────────────

const OWASP_GENAI = {
  rag_poisoning: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-RAG",
    category_hint: "llm_threats",
    description: "RAG knowledge base poisoned to inject malicious content into LLM responses",
  },
  memory_poisoning: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-MEM",
    category_hint: "llm_threats",
    description: "Persistent agent memory or conversation history manipulated to alter future behaviour",
  },
  context_leakage: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-CTX",
    category_hint: "llm_threats",
    description: "Sensitive context window contents (history, injected data) leaked to attacker",
  },
  tool_hijacking: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-TOOL",
    category_hint: "agentic_ai_threats",
    description: "Agent's tool calls intercepted or redirected to attacker-controlled endpoints",
  },
  function_hijacking: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-FUNC",
    category_hint: "agentic_ai_threats",
    description: "Agent's function-calling mechanism manipulated to execute unintended operations",
  },
  mcp_abuse: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-MCP",
    category_hint: "agentic_ai_threats",
    description: "Model Context Protocol server or tool definitions exploited to abuse agent capabilities",
  },
  orchestration_compromise: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-ORCH",
    category_hint: "agentic_ai_threats",
    description: "Multi-agent orchestration layer compromised, enabling lateral movement or cascading failures",
  },
  autonomous_execution_risk: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-AER",
    category_hint: "agentic_ai_threats",
    description: "Agent executes real-world actions without adequate human oversight or confirmation",
  },
  sandbox_escape: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-SBX",
    category_hint: "agentic_ai_threats",
    description: "Agent or code execution capability breaks out of its intended execution sandbox",
  },
  agent_permission_abuse: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-PERM",
    category_hint: "agentic_ai_threats",
    description: "Agent uses granted permissions beyond the intended scope of its task",
  },
  prompt_to_tool_execution: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-PTE",
    category_hint: "agentic_ai_threats",
    description: "Injected prompt causes agent to invoke tools with attacker-controlled parameters",
  },
  agentic_workflow_compromise: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-AWC",
    category_hint: "agentic_ai_threats",
    description: "Automated agentic workflow (CI/CD, data pipelines) compromised via AI components",
  },
  coding_agent_risk: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-CAR",
    category_hint: "agentic_ai_threats",
    description: "Coding agent or AI pair programmer exploited to introduce vulnerabilities or exfiltrate code",
  },
  tool_supply_chain_risk: {
    taxonomy_group: "ai_framework_tag",
    framework: "OWASP_GENAI", framework_ref: "GENAI-TSC",
    category_hint: "agentic_ai_threats",
    description: "Third-party MCP servers, plugins, or tool integrations contain malicious code or backdoors",
  },
};

// ── MITRE ATLAS ───────────────────────────────────────────────────────────────

const MITRE_ATLAS = {
  model_poisoning: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0054",
    category_hint: "traditional_ai_threats",
    description: "Training data or fine-tuning pipeline manipulated to embed malicious behaviour in the model",
  },
  data_poisoning: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0020",
    category_hint: "traditional_ai_threats",
    description: "Training dataset corrupted to degrade model performance or introduce backdoors",
  },
  model_extraction: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0048",
    category_hint: "traditional_ai_threats",
    description: "Model functionality, weights, or decision boundaries stolen via systematic API queries",
  },
  model_inversion: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0053",
    category_hint: "traditional_ai_threats",
    description: "Training data membership or private attributes inferred from model outputs",
  },
  adversarial_evasion: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0057",
    category_hint: "traditional_ai_threats",
    description: "Adversarial perturbations cause model to misclassify inputs at inference time",
  },
  backdoor_model: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0058",
    category_hint: "traditional_ai_threats",
    description: "Hidden trigger embedded in a model causes targeted misclassification when activated",
  },
  ai_supply_chain_compromise: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0000",
    category_hint: "traditional_ai_threats",
    description: "Compromise of ML supply chain: model repositories, pre-trained models, datasets, frameworks",
  },
  training_pipeline_compromise: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0019",
    category_hint: "traditional_ai_threats",
    description: "Training pipeline or data preprocessing infrastructure attacked to corrupt model output",
  },
  inference_api_abuse: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0040",
    category_hint: "traditional_ai_threats",
    description: "ML inference API systematically abused for model extraction, evasion, or DoS",
  },
  model_repository_risk: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0000",
    category_hint: "traditional_ai_threats",
    description: "Public or private model repositories (Hugging Face, etc.) used as vector for supply chain attack",
  },
  adversarial_data: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0043",
    category_hint: "traditional_ai_threats",
    description: "Adversarially crafted input data designed to exploit specific ML model weaknesses",
  },
  llm_prompt_injection_atlas: {
    taxonomy_group: "ai_framework_tag",
    framework: "MITRE_ATLAS", framework_ref: "AML.T0051",
    category_hint: "llm_threats",
    description: "LLM prompt injection technique catalogued in MITRE ATLAS",
  },
};

// ── MITRE ATT&CK Enterprise ───────────────────────────────────────────────────
// taxonomy_group: "attack_mapping" — goes in attack_mappings[], NOT framework_tags[]
// Each entry includes a tactic field for the ATT&CK tactic phase.

const MITRE_ATTACK = {
  command_execution: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1059",
    tactic: "Execution",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted command execution or scripting to carry out attacker objectives",
  },
  phishing: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "Phishing campaign where AI is a significant component of the attack technique",
  },
  ai_assisted_phishing: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "AI-generated or AI-personalised phishing messages used to increase attack success rates",
  },
  social_engineering: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "Social engineering attack where AI materially assists in crafting or delivering the lure",
  },
  ai_social_engineering: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1566",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "AI used to craft convincing social engineering scenarios, scripts, or personas",
  },
  deepfake_impersonation: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    tactic: "Defense Evasion",
    category_hint: "ai_enabled_threats",
    description: "Deepfake video, audio, or image used to impersonate a trusted individual",
  },
  voice_cloning: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    tactic: "Defense Evasion",
    category_hint: "ai_enabled_threats",
    description: "AI voice cloning used to impersonate executives, staff, or public figures in fraud or social engineering",
  },
  synthetic_identity_abuse: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1036.003",
    tactic: "Defense Evasion",
    category_hint: "ai_enabled_threats",
    description: "AI-generated synthetic identities used for fraud, account creation, or social engineering",
  },
  reconnaissance: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1595",
    tactic: "Reconnaissance",
    category_hint: "ai_enabled_threats",
    description: "Reconnaissance activity where AI tools materially accelerate or improve attacker intelligence gathering",
  },
  ai_assisted_reconnaissance: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1595",
    tactic: "Reconnaissance",
    category_hint: "ai_enabled_threats",
    description: "AI tools used to automate or enhance target reconnaissance and OSINT collection",
  },
  malware_development: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1587.001",
    tactic: "Resource Development",
    category_hint: "ai_enabled_threats",
    description: "Adversary uses AI/LLM to develop custom malware or modify existing samples",
  },
  ai_assisted_malware: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1587.001",
    tactic: "Resource Development",
    category_hint: "ai_enabled_threats",
    description: "AI used to develop, obfuscate, or mutate malware to evade detection",
  },
  exploit_public_facing_application: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1190",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "AI used to identify and exploit vulnerabilities in public-facing applications at scale",
  },
  ai_assisted_vulnerability_exploitation: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1190",
    tactic: "Initial Access",
    category_hint: "ai_enabled_threats",
    description: "AI used to automate vulnerability discovery, patch diffing, or exploit development",
  },
  credential_access: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1110",
    tactic: "Credential Access",
    category_hint: "ai_enabled_threats",
    description: "AI used to accelerate credential stuffing, brute force, or password spray attacks",
  },
  collection: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0009",
    tactic: "Collection",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted collection of sensitive data from victim systems or networks",
  },
  exfiltration: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0010",
    tactic: "Exfiltration",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted or AI-targeted data exfiltration from compromised systems",
  },
  discovery: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0007",
    tactic: "Discovery",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted discovery of systems, accounts, and resources within a compromised environment",
  },
  lateral_movement: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0008",
    tactic: "Lateral Movement",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted lateral movement through networks or multi-agent orchestration layers",
  },
  privilege_escalation: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0004",
    tactic: "Privilege Escalation",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted privilege escalation within systems or AI agent permission boundaries",
  },
  persistence: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "TA0003",
    tactic: "Persistence",
    category_hint: "ai_enabled_threats",
    description: "AI-assisted persistence mechanisms: backdoors in models, agents, or AI pipelines",
  },
  remote_service_abuse: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1021",
    tactic: "Lateral Movement",
    category_hint: "ai_enabled_threats",
    description: "Abuse of remote services (APIs, MCP endpoints, agent interfaces) using AI-generated payloads",
  },
  ai_enabled_fraud: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1657",
    tactic: "Impact",
    category_hint: "ai_enabled_threats",
    description: "AI-generated content used to conduct financial fraud, wire fraud, or business email compromise",
  },
  ai_generated_disinformation: {
    taxonomy_group: "attack_mapping",
    framework: "MITRE_ATTACK", framework_ref: "T1036",
    tactic: "Defense Evasion",
    category_hint: "ai_enabled_threats",
    description: "AI-generated synthetic media or text used in influence operations or disinformation campaigns",
  },
};

// ── NIST AI RMF ───────────────────────────────────────────────────────────────
// taxonomy_group: "governance_tag" — goes in governance_tags[], NOT framework_tags[]

const NIST_AI_RMF = {
  nist_govern: {
    taxonomy_group: "governance_tag",
    framework: "NIST_AI_RMF", framework_ref: "GOVERN",
    category_hint: null,
    description: "Source addresses AI governance, accountability, policies, or organisational risk management",
  },
  nist_map: {
    taxonomy_group: "governance_tag",
    framework: "NIST_AI_RMF", framework_ref: "MAP",
    category_hint: null,
    description: "Source addresses AI risk identification, context setting, or threat landscape mapping",
  },
  nist_measure: {
    taxonomy_group: "governance_tag",
    framework: "NIST_AI_RMF", framework_ref: "MEASURE",
    category_hint: null,
    description: "Source addresses AI risk analysis, measurement, evaluation, or assessment",
  },
  nist_manage: {
    taxonomy_group: "governance_tag",
    framework: "NIST_AI_RMF", framework_ref: "MANAGE",
    category_hint: null,
    description: "Source addresses AI risk response, treatment, monitoring, or incident response",
  },
};

// ── INTERNAL ──────────────────────────────────────────────────────────────────

const INTERNAL = {
  jailbreak: {
    taxonomy_group: "ai_framework_tag",
    framework: "INTERNAL", framework_ref: "INT-JB",
    category_hint: "llm_threats",
    description: "Technique to bypass LLM safety guardrails and generate disallowed content",
  },
  guardrail_bypass: {
    taxonomy_group: "ai_framework_tag",
    framework: "INTERNAL", framework_ref: "INT-GB",
    category_hint: "llm_threats",
    description: "Technique specifically targeting LLM content filters or safety classifiers",
  },
  multimodal_injection: {
    taxonomy_group: "ai_framework_tag",
    framework: "INTERNAL", framework_ref: "INT-MMI",
    category_hint: "llm_threats",
    description: "Malicious instructions hidden in images, audio, or other non-text modalities",
  },
  model_supply_chain: {
    taxonomy_group: "ai_framework_tag",
    framework: "INTERNAL", framework_ref: "INT-MSC",
    category_hint: "traditional_ai_threats",
    description: "Risk from compromised model weights, unsafe pickle files, or tampered repositories",
  },
};

// ── Separated registries by taxonomy_group ────────────────────────────────────

export const AI_FRAMEWORK_REGISTRY = {
  ...OWASP_LLM_TOP_10,
  ...OWASP_GENAI,
  ...MITRE_ATLAS,
  ...INTERNAL,
};

export const ATTACK_MAPPING_REGISTRY = {
  ...MITRE_ATTACK,
};

export const GOVERNANCE_REGISTRY = {
  ...NIST_AI_RMF,
};

// ── Flat registry (backward compatibility) ────────────────────────────────────

export const TAXONOMY_REGISTRY = {
  ...AI_FRAMEWORK_REGISTRY,
  ...ATTACK_MAPPING_REGISTRY,
  ...GOVERNANCE_REGISTRY,
};

// ── Valid tag sets per group ───────────────────────────────────────────────────

export const VALID_AI_FRAMEWORK_TAGS  = new Set(Object.keys(AI_FRAMEWORK_REGISTRY));
export const VALID_ATTACK_MAPPING_TAGS = new Set(Object.keys(ATTACK_MAPPING_REGISTRY));
export const VALID_GOVERNANCE_TAGS    = new Set(Object.keys(GOVERNANCE_REGISTRY));

// All valid tag names across all groups (backward compat)
export const VALID_TAGS = new Set(Object.keys(TAXONOMY_REGISTRY));

// All valid framework identifiers
export const VALID_FRAMEWORKS = new Set([
  "OWASP_LLM_TOP_10", "OWASP_GENAI", "MITRE_ATLAS",
  "MITRE_ATTACK", "NIST_AI_RMF", "INTERNAL",
]);

// ── Per-group validation functions ────────────────────────────────────────────

/**
 * Validate a single framework_tag item from LLM output.
 * Only accepts tags from AI_FRAMEWORK_REGISTRY (OWASP, MITRE ATLAS, INTERNAL).
 * Rejects MITRE ATT&CK and NIST tags — those go in attack_mappings / governance_tags.
 */
export function validateTag(rawTag) {
  if (!rawTag?.tag) return null;
  const entry = AI_FRAMEWORK_REGISTRY[rawTag.tag];
  if (!entry) return null;

  return {
    tag:               rawTag.tag,
    category_candidate: entry.category_hint || rawTag.category_candidate || null,
    framework:         entry.framework,
    framework_ref:     entry.framework_ref,
    evidence:          (rawTag.evidence || "").trim().slice(0, 300),
    confidence:        ["high", "medium", "low"].includes(rawTag.confidence)
      ? rawTag.confidence : "medium",
  };
}

/**
 * Validate an array of framework_tags. Drops invalid/wrong-group tags.
 */
export function validateTags(rawTags, maxTags = 6) {
  if (!Array.isArray(rawTags)) return [];
  return rawTags.map(validateTag).filter(Boolean).slice(0, maxTags);
}

// Alias for symmetry
export const validateFrameworkTags = validateTags;

/**
 * Validate a single attack_mapping item from LLM output.
 * Only accepts tags from ATTACK_MAPPING_REGISTRY (MITRE ATT&CK).
 */
function validateAttackMapping(rawItem) {
  if (!rawItem?.tag) return null;
  const entry = ATTACK_MAPPING_REGISTRY[rawItem.tag];
  if (!entry) return null;

  return {
    tag:           rawItem.tag,
    framework:     "MITRE_ATTACK",
    framework_ref: entry.framework_ref,
    tactic:        entry.tactic || rawItem.tactic || "",
    evidence:      (rawItem.evidence || "").trim().slice(0, 300),
    confidence:    ["high", "medium", "low"].includes(rawItem.confidence)
      ? rawItem.confidence : "medium",
  };
}

/**
 * Validate an array of attack_mappings. Drops invalid/wrong-group tags.
 */
export function validateAttackMappings(rawItems, maxItems = 8) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map(validateAttackMapping).filter(Boolean).slice(0, maxItems);
}

/**
 * Validate a single governance_tag item from LLM output.
 * Only accepts tags from GOVERNANCE_REGISTRY (NIST AI RMF).
 */
function validateGovernanceTag(rawItem) {
  if (!rawItem?.tag) return null;
  const entry = GOVERNANCE_REGISTRY[rawItem.tag];
  if (!entry) return null;

  return {
    tag:           rawItem.tag,
    framework:     "NIST_AI_RMF",
    framework_ref: entry.framework_ref,
    evidence:      (rawItem.evidence || "").trim().slice(0, 300),
    confidence:    ["high", "medium", "low"].includes(rawItem.confidence)
      ? rawItem.confidence : "medium",
  };
}

/**
 * Validate an array of governance_tags. Drops invalid/wrong-group tags.
 */
export function validateGovernanceTags(rawItems, maxItems = 4) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map(validateGovernanceTag).filter(Boolean).slice(0, maxItems);
}

// ── Migration helper ──────────────────────────────────────────────────────────

/**
 * Migrate a source with the old flat framework_tags to the new 3-field taxonomy.
 *
 * Old: understanding.framework_tags may contain MITRE_ATTACK or NIST_AI_RMF tags.
 * New: those must be separated into attack_mappings / governance_tags.
 *
 * Only modifies understanding if taxonomy_version < "taxonomy-v6.0".
 */
export function normalizeLegacyTaxonomy(source) {
  const u = source.understanding;
  if (!u) return source;

  const version = source.taxonomy_version || u.taxonomy_version || "";
  // Already on v6+ — nothing to migrate
  if (version >= "taxonomy-v6.0") return source;

  const oldTags = Array.isArray(u.framework_tags) ? u.framework_tags : [];

  const framework_tags  = [];
  const attack_mappings = u.attack_mappings || [];
  const governance_tags = u.governance_tags || [];

  for (const tag of oldTags) {
    if (!tag?.tag) continue;
    if (VALID_AI_FRAMEWORK_TAGS.has(tag.tag)) {
      framework_tags.push(tag);
    } else if (VALID_ATTACK_MAPPING_TAGS.has(tag.tag) && !attack_mappings.some((a) => a.tag === tag.tag)) {
      const entry = ATTACK_MAPPING_REGISTRY[tag.tag];
      attack_mappings.push({
        tag:           tag.tag,
        framework:     "MITRE_ATTACK",
        framework_ref: entry.framework_ref,
        tactic:        entry.tactic || "",
        evidence:      tag.evidence || "",
        confidence:    tag.confidence || "medium",
      });
    } else if (VALID_GOVERNANCE_TAGS.has(tag.tag) && !governance_tags.some((g) => g.tag === tag.tag)) {
      const entry = GOVERNANCE_REGISTRY[tag.tag];
      governance_tags.push({
        tag:           tag.tag,
        framework:     "NIST_AI_RMF",
        framework_ref: entry.framework_ref,
        evidence:      tag.evidence || "",
        confidence:    tag.confidence || "medium",
      });
    }
    // Tags not in any registry are dropped
  }

  return {
    ...source,
    understanding: {
      ...u,
      framework_tags,
      attack_mappings,
      governance_tags,
    },
  };
}

// ── Prompt context builders ───────────────────────────────────────────────────

/**
 * Build taxonomy context injected into the Layer 5 LLM prompt.
 * Returns a structured string with all three groups separated.
 */
export function buildTaxonomyContextForPrompt() {
  // AI Framework Tags (framework_tags field)
  const aiFrameworkLines = [];
  const aiByFramework = {};
  for (const [tag, entry] of Object.entries(AI_FRAMEWORK_REGISTRY)) {
    if (!aiByFramework[entry.framework]) aiByFramework[entry.framework] = [];
    aiByFramework[entry.framework].push(`${tag} (${entry.framework_ref})`);
  }
  for (const [fw, tags] of Object.entries(aiByFramework)) {
    aiFrameworkLines.push(`${fw}:\n${tags.map((t) => `  - ${t}`).join("\n")}`);
  }

  // Attack Mappings (attack_mappings field)
  const attackLines = [];
  const attackByTactic = {};
  for (const [tag, entry] of Object.entries(ATTACK_MAPPING_REGISTRY)) {
    const tactic = entry.tactic || "Other";
    if (!attackByTactic[tactic]) attackByTactic[tactic] = [];
    attackByTactic[tactic].push(`${tag} (${entry.framework_ref})`);
  }
  for (const [tactic, tags] of Object.entries(attackByTactic)) {
    attackLines.push(`[${tactic}]: ${tags.join(", ")}`);
  }

  // Governance Tags (governance_tags field)
  const govLines = Object.entries(GOVERNANCE_REGISTRY)
    .map(([tag, entry]) => `${tag} (${entry.framework_ref})`);

  return [
    "═══ FRAMEWORK TAGS (use in framework_tags field) ═══",
    "Only AI-specific risk patterns — OWASP LLM, OWASP GenAI, MITRE ATLAS, INTERNAL:",
    aiFrameworkLines.join("\n\n"),
    "",
    "═══ ATTACK MAPPINGS (use in attack_mappings field) ═══",
    "MITRE ATT&CK cyber operation behaviours — NOT for framework_tags:",
    attackLines.join("\n"),
    "",
    "═══ GOVERNANCE TAGS (use in governance_tags field) ═══",
    "NIST AI RMF lenses — NOT for framework_tags:",
    govLines.map((t) => `  - ${t}`).join("\n"),
  ].join("\n");
}
