# Layer 7.2A — Analytics Taxonomy Prompt

## Purpose

Assign structured, chart-ready metadata to every source for later aggregation
and visualization. This is NOT strategic synthesis — it is pattern-extraction metadata.

Analytics answers: "What patterns are visible across the source set?"

Only run LLM for semantic fields that deterministic code cannot reliably assign:
`analytics_attack_vectors`, `analytics_attack_surface`, `analytics_ai_layer`,
`analytics_operational_status`, `analytics_maturity`, `analytics_impact_type`,
`analytics_signal_clusters`, `analytics_recurring_themes`.

Structural fields (`analytics_date`, `analytics_category`, `analytics_source_type`,
`publisher`, `trust_tier`) are always set deterministically after the LLM call.

Implementation: `lib/pipeline/analytics/analyticsTaxonomy.js`

---

## System Prompt

```
You are preparing a source for analytics in an AI-cyber horizon scan.

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
- Return strict JSON only — no markdown, no preamble.
```

---

## User Prompt Template

```
SOURCE TYPE: {{source_type}}
MAIN CATEGORY: {{main_category}}
TRUST TIER: {{trust_tier}}
DATE: {{date_published}}

TITLE: {{title}}
PUBLISHER: {{publisher}}

SUMMARY: {{understanding.source_summary or source.summary}}
PRIMARY SUBJECT: {{understanding.primary_subject}}
MAIN CLAIMS:
{{main_claims as numbered list, first 3}}
KEY ENTITIES: {{key_entities joined by ", "}}
IMPORTANT NUMBERS: {{important_numbers joined by " | "}}
RAWFACT TAXONOMY: operational_relevance={{rawfact_taxonomy.operational_relevance}} novelty={{rawfact_taxonomy.novelty}} impact_severity={{rawfact_taxonomy.impact_severity}} sector={{rawfact_taxonomy.sector}} technology={{rawfact_taxonomy.technology}}
EVIDENCE CARD: {{evidence_card.short_summary}}
FRAMEWORK TAGS: {{framework_tags as "tag (framework)" list, first 5}}

Assign all analytics taxonomy fields using only the controlled vocabularies in the system prompt.
```

---

## Output Schema

```json
{
  "analytics_attack_vectors": ["string"],
  "analytics_attack_surface": ["string"],
  "analytics_ai_layer": ["string"],
  "analytics_operational_status": "string",
  "analytics_maturity": "string",
  "analytics_impact_scope": "string",
  "analytics_impact_type": ["string"],
  "analytics_sector": ["string"],
  "analytics_geography": ["string"],
  "analytics_technology": ["string"],
  "analytics_entities": ["string"],
  "analytics_signal_clusters": ["string"],
  "analytics_recurring_themes": ["string"],
  "analytics_confidence": "high | medium | low",
  "analytics_reason": "string"
}
```

After LLM returns, deterministic post-processing adds:
- `source_id` — from source.id
- `analytics_date` — parsed from date_published
- `analytics_category` — from main_category
- `analytics_source_type` — from source_type
- `publisher`, `trust_tier` — from source
- `rawfact_priority`, `rawfact_score` — from rawfact_score_data
- `analytics_version` — "analytics-v1.0"

---

## Deterministic Fallback

When LLM is unavailable, the deterministic fallback:
- Maps `rawfact_taxonomy.technology` → attack_surface via TECH_TO_SURFACE lookup
- Maps `source_type` → operational_status via TYPE_TO_OPERATIONAL_STATUS
- Maps `main_category` → ai_layer via CATEGORY_TO_AI_LAYER
- Maps `main_category` → signal_clusters via CATEGORY_TO_SIGNAL_CLUSTERS
- Infers impact_type from title/text keywords
- Infers recurring_themes from source_type + rawfact_taxonomy fields
- Uses `understanding.key_entities` for analytics_entities

**Token budget:** ~1,500 tokens input + ~300 tokens output ≈ $0.00018/source at gpt-4o-mini pricing.
