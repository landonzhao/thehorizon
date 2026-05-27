/**
 * Layer 7.2A — Analytics Taxonomy
 *
 * Assigns structured, chart-ready metadata to every source.
 * LLM assigns semantic fields: attack vectors, attack surface, AI layer,
 * operational status, maturity, impact scope/type, signal clusters, recurring themes.
 * Deterministic code always sets structural fields: date, category, source_type,
 * publisher, trust_tier, rawfact_priority, rawfact_score.
 *
 * ── LLM CALL ─────────────────────────────────────────────────────────────────
 * Tool:    callLLM()  (lib/llm/callLLM.js) — provider rotation
 * Models:  gpt-4o-mini  (OPENAI_API_KEY primary, OPENAI_API_KEY_2 secondary)
 *          llama-3.3-70b-versatile  (GROQ_API_KEY — JSON mode, no schema)
 *          gemini-2.0-flash / gemini-2.5-flash  (GEMINI_API_KEY / GEMINI_API_KEY_2)
 * Trigger: any of the above env vars present AND skipLlm=false
 * Output:  structured JSON via json_schema response_format (TAXONOMY_SCHEMA)
 * Label:   "Layer7.2A-analytics"
 * Concurrency: 5 parallel calls (default)
 *
 * System prompt: _systemPrompt (constant at module scope, lines 112–178)
 *   Instructs model to assign chart-ready metadata for aggregation — NOT strategic
 *   synthesis. Provides complete controlled vocabularies inline for 7 enum fields
 *   (attack vectors 29 values, attack surface 22 values, AI layer 11 values,
 *   operational status 6, maturity 5, impact scope 7, signal clusters 19,
 *   recurring themes 12). Rules: use only vocab values, no inference beyond source.
 *
 * User prompt: buildUserPrompt(source) — source_type, main_category, trust_tier,
 *   date, title, publisher, summary, primary_subject, main_claims, key_entities,
 *   important_numbers, rawfact_taxonomy summary, evidence card summary,
 *   framework tags.
 *
 * Fallback (no keys or skipLlm=true):
 *   buildDeterministicTaxonomy() — maps source_type → operational_status →
 *   maturity via lookup tables; derives attack_surface from technology tags;
 *   derives signal_clusters from category; uses keyword heuristics for
 *   impact_type and recurring_themes.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * source.analytics_taxonomy = {
 *   source_id, analytics_date, analytics_category, analytics_source_type,
 *   publisher, trust_tier, rawfact_priority, rawfact_score,
 *   analytics_attack_vectors, analytics_attack_surface, analytics_ai_layer,
 *   analytics_operational_status, analytics_maturity, analytics_impact_scope,
 *   analytics_impact_type, analytics_sector, analytics_geography,
 *   analytics_technology, analytics_entities, analytics_signal_clusters,
 *   analytics_recurring_themes, analytics_confidence, analytics_reason,
 *   analytics_version: "analytics-v1.0", llm_used }
 */

import { callLLM } from "../../llm/callLLM.js";

// ── Controlled vocabulary sets (for validation) ───────────────────────────────

const VALID_ATTACK_VECTORS = new Set([
  "prompt_injection","jailbreak","rag_poisoning","memory_poisoning","context_leakage",
  "sensitive_information_disclosure","model_poisoning","data_poisoning","model_extraction",
  "model_inversion","adversarial_evasion","model_backdoor","ai_supply_chain_compromise",
  "tool_hijacking","mcp_abuse","function_hijacking","sandbox_escape","agent_permission_abuse",
  "prompt_to_tool_execution","ai_assisted_phishing","deepfake_impersonation","voice_cloning",
  "ai_assisted_reconnaissance","ai_assisted_malware","ai_assisted_vulnerability_exploitation",
  "synthetic_identity_abuse","ai_enabled_fraud","credential_access","vulnerability_exploitation",
  "unknown",
]);

const VALID_ATTACK_SURFACES = new Set([
  "model_layer","training_pipeline","inference_pipeline","model_repository","data_pipeline",
  "prompt_layer","rag_pipeline","vector_database","memory_layer","llm_application",
  "plugin_layer","tool_layer","mcp_layer","agent_orchestration_layer","api_layer",
  "code_execution_environment","cloud_ai_service","identity_layer","human_trust_layer",
  "enterprise_workflow","supply_chain","unknown",
]);

const VALID_AI_LAYERS = new Set([
  "traditional_ml_model","foundation_model","llm_application","rag_system","agentic_system",
  "tool_connected_system","synthetic_media_system","offensive_ai_tooling","defensive_ai_tooling",
  "governance_layer","human_ai_interaction","unknown",
]);

const VALID_OPERATIONAL_STATUSES = new Set([
  "theoretical","research_only","proof_of_concept","limited_operational_use",
  "active_operational_use","mainstream_operational_use","unknown",
]);

const VALID_MATURITIES = new Set([
  "research","emerging","growing","operational","mainstream","unknown",
]);

const VALID_IMPACT_SCOPES = new Set([
  "individual","organization","sector","ecosystem","societal","global","unknown",
]);

const VALID_IMPACT_TYPES = new Set([
  "data_exposure","credential_theft","financial_loss","fraud","impersonation",
  "social_engineering","remote_code_execution","sandbox_escape","privilege_escalation",
  "unauthorized_action","model_theft","model_manipulation","poisoning","evasion",
  "supply_chain_compromise","service_disruption","governance_risk","societal_harm",
  "defensive_improvement","unknown",
]);

const VALID_SIGNAL_CLUSTERS = new Set([
  "prompt_injection_and_jailbreaks","llm_data_leakage","rag_and_memory_risk",
  "agentic_tool_abuse","mcp_security","autonomous_execution","model_lifecycle_attacks",
  "ai_supply_chain","adversarial_ml","ai_phishing_and_social_engineering",
  "deepfake_and_identity_abuse","ai_assisted_malware","ai_assisted_exploitation",
  "adversary_ai_adoption","defensive_ai_capabilities","governance_and_compliance",
  "ecosystem_dependency_growth","trust_boundary_shift","capability_demonstration",
  "unknown",
]);

const VALID_RECURRING_THEMES = new Set([
  "attack_surface_expansion","operationalization","trust_boundary_failure",
  "ecosystem_convergence","automation_of_offense","compression_of_defender_timelines",
  "defender_visibility_gap","institutional_adaptation","dependency_growth",
  "identity_and_trust_erosion","research_to_threat_pipeline","governance_pressure","unknown",
]);

// ── LLM output schema ─────────────────────────────────────────────────────────

const TAXONOMY_SCHEMA = {
  type: "object",
  required: [
    "analytics_attack_vectors","analytics_attack_surface","analytics_ai_layer",
    "analytics_operational_status","analytics_maturity","analytics_impact_scope",
    "analytics_impact_type","analytics_sector","analytics_geography","analytics_technology",
    "analytics_entities","analytics_signal_clusters","analytics_recurring_themes",
    "analytics_confidence","analytics_reason",
  ],
  properties: {
    analytics_attack_vectors:  { type: "array", items: { type: "string" } },
    analytics_attack_surface:  { type: "array", items: { type: "string" } },
    analytics_ai_layer:        { type: "array", items: { type: "string" } },
    analytics_operational_status: { type: "string" },
    analytics_maturity:        { type: "string" },
    analytics_impact_scope:    { type: "string" },
    analytics_impact_type:     { type: "array", items: { type: "string" } },
    analytics_sector:          { type: "array", items: { type: "string" } },
    analytics_geography:       { type: "array", items: { type: "string" } },
    analytics_technology:      { type: "array", items: { type: "string" } },
    analytics_entities:        { type: "array", items: { type: "string" } },
    analytics_signal_clusters: { type: "array", items: { type: "string" } },
    analytics_recurring_themes:{ type: "array", items: { type: "string" } },
    analytics_confidence:      { type: "string", enum: ["high","medium","low"] },
    analytics_reason:          { type: "string" },
  },
};

// ── System prompt (cached at module scope) ────────────────────────────────────

const _systemPrompt = `You are preparing a source for analytics in an AI-cyber horizon scan.

This is NOT strategic synthesis. This is NOT slide writing.
This is chart-ready metadata extraction for later aggregation.

## CONTROLLED VOCABULARIES — use ONLY these values:

analytics_attack_vectors (pick all that apply):
prompt_injection | jailbreak | rag_poisoning | memory_poisoning | context_leakage |
sensitive_information_disclosure | model_poisoning | data_poisoning | model_extraction |
model_inversion | adversarial_evasion | model_backdoor | ai_supply_chain_compromise |
tool_hijacking | mcp_abuse | function_hijacking | sandbox_escape | agent_permission_abuse |
prompt_to_tool_execution | ai_assisted_phishing | deepfake_impersonation | voice_cloning |
ai_assisted_reconnaissance | ai_assisted_malware | ai_assisted_vulnerability_exploitation |
synthetic_identity_abuse | ai_enabled_fraud | credential_access | vulnerability_exploitation |
unknown

analytics_attack_surface (pick all that apply):
model_layer | training_pipeline | inference_pipeline | model_repository | data_pipeline |
prompt_layer | rag_pipeline | vector_database | memory_layer | llm_application |
plugin_layer | tool_layer | mcp_layer | agent_orchestration_layer | api_layer |
code_execution_environment | cloud_ai_service | identity_layer | human_trust_layer |
enterprise_workflow | supply_chain | unknown

analytics_ai_layer (pick all that apply):
traditional_ml_model | foundation_model | llm_application | rag_system | agentic_system |
tool_connected_system | synthetic_media_system | offensive_ai_tooling | defensive_ai_tooling |
governance_layer | human_ai_interaction | unknown

analytics_operational_status (pick one):
theoretical | research_only | proof_of_concept | limited_operational_use |
active_operational_use | mainstream_operational_use | unknown

analytics_maturity (pick one):
research | emerging | growing | operational | mainstream | unknown

analytics_impact_scope (pick one):
individual | organization | sector | ecosystem | societal | global | unknown

analytics_impact_type (pick all that apply):
data_exposure | credential_theft | financial_loss | fraud | impersonation |
social_engineering | remote_code_execution | sandbox_escape | privilege_escalation |
unauthorized_action | model_theft | model_manipulation | poisoning | evasion |
supply_chain_compromise | service_disruption | governance_risk | societal_harm |
defensive_improvement | unknown

analytics_signal_clusters (pick all that apply):
prompt_injection_and_jailbreaks | llm_data_leakage | rag_and_memory_risk |
agentic_tool_abuse | mcp_security | autonomous_execution | model_lifecycle_attacks |
ai_supply_chain | adversarial_ml | ai_phishing_and_social_engineering |
deepfake_and_identity_abuse | ai_assisted_malware | ai_assisted_exploitation |
adversary_ai_adoption | defensive_ai_capabilities | governance_and_compliance |
ecosystem_dependency_growth | trust_boundary_shift | capability_demonstration | unknown

analytics_recurring_themes (pick all that apply):
attack_surface_expansion | operationalization | trust_boundary_failure |
ecosystem_convergence | automation_of_offense | compression_of_defender_timelines |
defender_visibility_gap | institutional_adaptation | dependency_growth |
identity_and_trust_erosion | research_to_threat_pipeline | governance_pressure | unknown

## RULES
- Use only values from the controlled vocabularies above.
- Do not invent facts not in the source.
- Do not produce strategic insights or analysis.
- Prefer "unknown" over unsupported labels.
- Be source-type-aware (see source_type and rawfact_taxonomy provided).
- Return strict JSON only — no markdown, no preamble.`;

// ── Deterministic fallback helpers ────────────────────────────────────────────

const TECH_TO_SURFACE = {
  llm:               ["prompt_layer", "llm_application"],
  ai_agent:          ["agent_orchestration_layer", "tool_layer"],
  rag:               ["rag_pipeline", "vector_database"],
  synthetic_media:   ["human_trust_layer"],
  malware:           ["supply_chain"],
  model_supply_chain:["model_repository", "supply_chain"],
  ml_model:          ["model_layer", "inference_pipeline"],
  api:               ["api_layer"],
  vulnerability_management: ["api_layer"],
};

const CATEGORY_TO_AI_LAYER = {
  llm_threats:           ["foundation_model", "llm_application"],
  agentic_ai_threats:    ["agentic_system", "tool_connected_system"],
  traditional_ai_threats:["traditional_ml_model", "foundation_model"],
  ai_enabled_threats:    ["offensive_ai_tooling", "synthetic_media_system"],
};

const CATEGORY_TO_SIGNAL_CLUSTERS = {
  llm_threats:           ["prompt_injection_and_jailbreaks", "llm_data_leakage"],
  agentic_ai_threats:    ["agentic_tool_abuse", "mcp_security"],
  traditional_ai_threats:["adversarial_ml", "model_lifecycle_attacks"],
  ai_enabled_threats:    ["ai_phishing_and_social_engineering", "deepfake_and_identity_abuse"],
};

const TYPE_TO_OPERATIONAL_STATUS = {
  incident:                        "active_operational_use",
  threat_intelligence:             "active_operational_use",
  exploit_disclosure:              "proof_of_concept",
  vulnerability:                   "limited_operational_use",
  capability_demonstration:        "proof_of_concept",
  adversary_adoption_signal:       "limited_operational_use",
  research_finding:                "research_only",
  benchmark_evaluation:            "research_only",
  infrastructure_dependency_signal:"limited_operational_use",
  trust_boundary_shift:            "limited_operational_use",
  defensive_capability:            "mainstream_operational_use",
  governance_signal:               "mainstream_operational_use",
  ecosystem_signal:                "mainstream_operational_use",
  societal_harm_signal:            "active_operational_use",
  strategic_signal:                "theoretical",
};

const OPERATIONAL_TO_MATURITY = {
  theoretical:              "research",
  research_only:            "research",
  proof_of_concept:         "emerging",
  limited_operational_use:  "growing",
  active_operational_use:   "operational",
  mainstream_operational_use:"mainstream",
};

function buildDeterministicTaxonomy(source) {
  const st  = source.source_type || "unknown";
  const cat = source.main_category || "unclear_or_adjacent";
  const rt  = source.rawfact_taxonomy || {};
  const u   = source.understanding || {};
  const text = `${source.title || ""} ${source.full_text || ""}`.toLowerCase();

  // Attack vectors from framework tags (MITRE ATLAS/ATT&CK tag names)
  const attackVectors = [];
  for (const ft of (u.framework_tags || [])) {
    const tag = (ft.tag || "").toLowerCase().replace(/-/g, "_");
    if (VALID_ATTACK_VECTORS.has(tag)) attackVectors.push(tag);
  }
  // Rawfact tag names may also match
  for (const tag of (rt.rawfact_tags || [])) {
    const normalized = tag.toLowerCase().replace(/-/g, "_");
    if (VALID_ATTACK_VECTORS.has(normalized)) attackVectors.push(normalized);
  }
  const uniqueVectors = [...new Set(attackVectors)].slice(0, 6);

  // Attack surface from rawfact_taxonomy.technology
  const attackSurface = [];
  for (const tech of (rt.technology || [])) {
    const mapped = TECH_TO_SURFACE[tech] || [];
    attackSurface.push(...mapped);
  }
  const uniqueSurfaces = [...new Set(attackSurface)].slice(0, 6);

  // AI layer from category
  const aiLayer = (CATEGORY_TO_AI_LAYER[cat] || ["unknown"]).slice(0, 3);

  // Operational status — refine with rawfact_taxonomy if available
  let operationalStatus = TYPE_TO_OPERATIONAL_STATUS[st] || "unknown";
  const ctx = rt.source_type_context || {};
  if (st === "exploit_disclosure" && ctx.reproducibility === "high") operationalStatus = "proof_of_concept";
  if (st === "vulnerability" && ctx.exploit_status === "exploited_in_the_wild") operationalStatus = "active_operational_use";
  if (st === "research_finding") {
    if (text.includes("poc") || text.includes("proof of concept") || text.includes("proof-of-concept")) {
      operationalStatus = "proof_of_concept";
    }
  }
  if (st === "adversary_adoption_signal") {
    const ev = (ctx.observed_evidence || "").toLowerCase();
    if (ev === "confirmed") operationalStatus = "active_operational_use";
    else if (ev === "claimed") operationalStatus = "limited_operational_use";
  }

  const maturity = OPERATIONAL_TO_MATURITY[operationalStatus] || "unknown";

  // Impact scope from rawfact_taxonomy
  const impactScope = rt.impact_scope && VALID_IMPACT_SCOPES.has(rt.impact_scope)
    ? rt.impact_scope : "unknown";

  // Impact types (simple heuristic)
  const impactTypes = [];
  if (text.includes("data breach") || text.includes("exfiltrat")) impactTypes.push("data_exposure");
  if (text.includes("financ") || text.includes("$") || text.includes("loss")) impactTypes.push("financial_loss");
  if (text.includes("rce") || text.includes("remote code execution")) impactTypes.push("remote_code_execution");
  if (text.includes("deepfake") || text.includes("impersonat")) impactTypes.push("impersonation");
  if (text.includes("poison")) impactTypes.push("poisoning");
  if (text.includes("supply chain")) impactTypes.push("supply_chain_compromise");
  if (!impactTypes.length) impactTypes.push("unknown");

  // Signal clusters from category
  const signalClusters = CATEGORY_TO_SIGNAL_CLUSTERS[cat] || ["unknown"];

  // Sector/geography/technology from rawfact_taxonomy
  const sector     = (rt.sector || []).slice(0, 5);
  const geography  = (rt.geography || []).slice(0, 5);
  const technology = (rt.technology || []).slice(0, 8);

  // Entities from understanding
  const entities = (u.key_entities || []).slice(0, 10);

  // Recurring themes (heuristic)
  const themes = [];
  if (uniqueSurfaces.length > 0 || technology.length > 0) themes.push("attack_surface_expansion");
  if (operationalStatus === "active_operational_use" || operationalStatus === "limited_operational_use")
    themes.push("operationalization");
  if (st === "adversary_adoption_signal") themes.push("adversary_ai_adoption");
  if (st === "trust_boundary_shift") themes.push("trust_boundary_failure");
  if (st === "infrastructure_dependency_signal") themes.push("dependency_growth");
  if (st === "governance_signal") themes.push("governance_pressure");
  if (st === "research_finding" && operationalStatus !== "research_only")
    themes.push("research_to_threat_pipeline");
  if (!themes.length) themes.push("unknown");

  const confidence =
    (source.trust_tier === "primary" || source.trust_tier === "curated" || source.trust_tier === "high")
      ? "high"
      : (source.trust_tier === "medium") ? "medium" : "low";

  return {
    analytics_attack_vectors:  uniqueVectors.length > 0 ? uniqueVectors : ["unknown"],
    analytics_attack_surface:  uniqueSurfaces.length > 0 ? uniqueSurfaces : ["unknown"],
    analytics_ai_layer:        aiLayer,
    analytics_operational_status: operationalStatus,
    analytics_maturity:        maturity,
    analytics_impact_scope:    impactScope,
    analytics_impact_type:     impactTypes.slice(0, 5),
    analytics_sector:          sector,
    analytics_geography:       geography,
    analytics_technology:      technology,
    analytics_entities:        entities,
    analytics_signal_clusters: signalClusters,
    analytics_recurring_themes:themes.slice(0, 5),
    analytics_confidence:      confidence,
    analytics_reason:          `Deterministic fallback: source_type=${st}`,
  };
}

// ── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(source) {
  const u   = source.understanding || {};
  const rt  = source.rawfact_taxonomy || {};
  const ec  = source.evidence_card || {};
  const st  = source.source_type || "unknown";
  const cat = source.main_category || "unknown";

  const frameworkTagList = (u.framework_tags || [])
    .slice(0, 5)
    .map((ft) => `${ft.tag} (${ft.framework || ""})`)
    .join(", ");

  const mainClaims = (u.main_claims || [])
    .slice(0, 3)
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const ecSummary = ec.short_summary
    ? `EVIDENCE CARD: ${ec.short_summary}`
    : "";

  const rtSummary = rt.rawfact_taxonomy_version
    ? `RAWFACT TAXONOMY: operational_relevance=${rt.operational_relevance}  novelty=${rt.novelty}  impact_severity=${rt.impact_severity}  sector=${(rt.sector || []).join(",")}  technology=${(rt.technology || []).join(",")}`
    : "";

  return [
    `SOURCE TYPE: ${st}`,
    `MAIN CATEGORY: ${cat}`,
    `TRUST TIER: ${source.trust_tier || "unknown"}`,
    `DATE: ${source.date_published || "unknown"}`,
    ``,
    `TITLE: ${source.title || ""}`,
    `PUBLISHER: ${source.publisher || ""}`,
    ``,
    `SUMMARY: ${u.source_summary || source.summary || "(none)"}`,
    `PRIMARY SUBJECT: ${u.primary_subject || "(none)"}`,
    `MAIN CLAIMS:\n${mainClaims || "(none)"}`,
    `KEY ENTITIES: ${(u.key_entities || []).join(", ") || "(none)"}`,
    `IMPORTANT NUMBERS: ${(u.important_numbers || []).join(" | ") || "(none)"}`,
    rtSummary,
    ecSummary,
    `FRAMEWORK TAGS: ${frameworkTagList || "(none)"}`,
    ``,
    `Assign all analytics taxonomy fields using only the controlled vocabularies in the system prompt.`,
  ].filter(Boolean).join("\n");
}

// ── Output validation ─────────────────────────────────────────────────────────

function filterToVocab(arr, vocab, max = 8) {
  return [...new Set((Array.isArray(arr) ? arr : [])
    .map((v) => String(v).toLowerCase().replace(/-/g, "_"))
    .filter((v) => vocab.has(v))
  )].slice(0, max);
}

function pickOne(val, vocab, fallback = "unknown") {
  const v = String(val || "").toLowerCase().replace(/-/g, "_");
  return vocab.has(v) ? v : fallback;
}

function validateOutput(raw) {
  const out = typeof raw === "object" && raw !== null ? raw : {};

  return {
    analytics_attack_vectors:  filterToVocab(out.analytics_attack_vectors, VALID_ATTACK_VECTORS, 8),
    analytics_attack_surface:  filterToVocab(out.analytics_attack_surface, VALID_ATTACK_SURFACES, 8),
    analytics_ai_layer:        filterToVocab(out.analytics_ai_layer, VALID_AI_LAYERS, 4),
    analytics_operational_status: pickOne(out.analytics_operational_status, VALID_OPERATIONAL_STATUSES),
    analytics_maturity:        pickOne(out.analytics_maturity, VALID_MATURITIES),
    analytics_impact_scope:    pickOne(out.analytics_impact_scope, VALID_IMPACT_SCOPES),
    analytics_impact_type:     filterToVocab(out.analytics_impact_type, VALID_IMPACT_TYPES, 5),
    analytics_sector:          (Array.isArray(out.analytics_sector) ? out.analytics_sector : []).slice(0, 5),
    analytics_geography:       (Array.isArray(out.analytics_geography) ? out.analytics_geography : []).slice(0, 5),
    analytics_technology:      (Array.isArray(out.analytics_technology) ? out.analytics_technology : []).slice(0, 8),
    analytics_entities:        (Array.isArray(out.analytics_entities) ? out.analytics_entities : []).slice(0, 10),
    analytics_signal_clusters: filterToVocab(out.analytics_signal_clusters, VALID_SIGNAL_CLUSTERS, 5),
    analytics_recurring_themes:filterToVocab(out.analytics_recurring_themes, VALID_RECURRING_THEMES, 5),
    analytics_confidence:      ["high","medium","low"].includes(out.analytics_confidence) ? out.analytics_confidence : "medium",
    analytics_reason:          typeof out.analytics_reason === "string" ? out.analytics_reason.slice(0, 200) : "",
  };
}

// ── Always-deterministic structural field overlay ─────────────────────────────

function applyStructuralFields(source, semanticFields) {
  const date = source.date_published
    ? (() => { try { return new Date(source.date_published).toISOString().slice(0, 10); } catch { return null; } })()
    : null;

  return {
    source_id:               source.id,
    analytics_date:          date,
    analytics_category:      source.main_category || "unclear_or_adjacent",
    analytics_source_type:   source.source_type || "unknown",
    publisher:               source.publisher || "",
    trust_tier:              source.trust_tier || "unknown",
    rawfact_priority:        source.rawfact_score_data?.rawfact_priority || null,
    rawfact_score:           source.rawfact_score_data?.rawfact_score ?? null,
    ...semanticFields,
    analytics_version:       "analytics-v1.0",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 5;

/**
 * Apply analytics taxonomy to a batch of sources (Layer 7.2A).
 *
 * @param {object[]} sources
 * @param {object}   [opts]
 * @param {boolean}  [opts.skipLlm=false]    - Force deterministic fallback.
 * @param {number}   [opts.concurrency=5]    - Max parallel LLM calls.
 * @returns {Promise<object[]>} Sources with `analytics_taxonomy` field added.
 */
export async function applyAnalyticsTaxonomies(sources, opts = {}) {
  const { skipLlm = false, concurrency = DEFAULT_CONCURRENCY } = opts;

  const hasLlm = !skipLlm && !!(
    process.env.OPENAI_API_KEY  || process.env.OPENAI_API_KEY_2  ||
    process.env.GROQ_API_KEY    ||
    process.env.GEMINI_API_KEY  || process.env.GEMINI_API_KEY_2
  );

  async function processOne(source) {
    let semanticFields;
    let llm_used = false;

    if (!hasLlm) {
      semanticFields = buildDeterministicTaxonomy(source);
    } else {
      try {
        const raw = await callLLM(_systemPrompt, buildUserPrompt(source), {
          schema:   TAXONOMY_SCHEMA,
          logLabel: "Layer7.2A-analytics",
        });
        semanticFields = validateOutput(typeof raw === "string" ? JSON.parse(raw) : raw);
        llm_used = true;
      } catch (err) {
        process.stdout.write(
          `  [Layer 7.2A] Taxonomy LLM failed for "${(source.title || "").slice(0, 60)}": ${err.message} — using deterministic fallback\n`
        );
        semanticFields = buildDeterministicTaxonomy(source);
      }
    }

    const analytics_taxonomy = applyStructuralFields(source, { ...semanticFields, llm_used });
    return { ...source, analytics_taxonomy };
  }

  const results = new Array(sources.length);
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processOne));
    for (let j = 0; j < batch.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}
