# Layer 5b — Analytics Branch

**Orchestrator:** `lib/pipeline/analytics/runAnalyticsBranch.js`
**LLM calls:** Step 1 (analytics taxonomy). Step 2 and 3 are fully deterministic. One optional LLM call (viz recommendations) is disabled by default.

---

## Purpose

Tag every source with chart-friendly metadata, aggregate into structured counts and distributions, and generate visualization specifications for the slides layer. Runs on ALL sources (not just high-priority rawfact sources).

---

## Pipeline Steps

```
sources[]
    │
    ▼
Step 1 (7.2A): applyAnalyticsTaxonomies  — LLM or deterministic
    │
    ▼
Step 2 (7.2B): aggregateAnalytics        — deterministic counts/distributions
    │
    ▼
Step 3 (7.2C): generateVisualizationSpecs — deterministic chart specs
    │
    ▼
[optional] runVisualizationRecommendations — LLM (disabled by default)
```

---

## Step 1 — Analytics Taxonomy (7.2A)

**File:** `lib/pipeline/analytics/analyticsTaxonomy.js`
**LLM call:** Yes — one call per source (with deterministic fallback).

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | Any OPENAI/GROQ/GEMINI key |
| Output format | Structured JSON via schema |
| Label | `"Layer7.2A-analytics-<source_id>"` |
| Concurrency | 5 parallel calls |
| Trigger | Any API key AND `skipLlm=false` |

### System Prompt

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

### User Prompt

Built by `buildUserPrompt(source)`:

```
SOURCE TYPE: <source_type>
MAIN CATEGORY: <main_category>
TRUST TIER: <trust_tier>
DATE: <date_published>

TITLE: <title>
PUBLISHER: <publisher>

SUMMARY: <source.understanding.source_summary>
PRIMARY SUBJECT: <source.understanding.primary_subject>
MAIN CLAIMS:
1. <claim>
...
KEY ENTITIES: <comma-separated>
IMPORTANT NUMBERS: <pipe-separated>
RAWFACT TAXONOMY: operational_relevance=<value>  novelty=<value>  impact_severity=<value>  sector=<values>  technology=<values>
EVIDENCE CARD: <evidence_card.short_summary>
FRAMEWORK TAGS: <tag (framework), ...>

Assign all analytics taxonomy fields using only the controlled vocabularies in the system prompt.
```

### Output Fields (`analytics_taxonomy`)

```json
{
  "analytics_attack_vectors": ["string"],
  "analytics_attack_surface": ["string"],
  "analytics_ai_layer": ["string"],
  "analytics_operational_status": "string",
  "analytics_maturity": "string",
  "analytics_impact_scope": "string",
  "analytics_impact_type": ["string"],
  "analytics_signal_clusters": ["string"],
  "analytics_recurring_themes": ["string"],
  "analytics_taxonomy_version": "string"
}
```

### Deterministic Fallback

When `skipLlm=true` or no keys: rule-based mapping from `source_type`, `trust_tier`, `main_category`, and existing `rawfact_taxonomy` fields.

---

## Step 2 — Analytics Aggregation (7.2B)

**File:** `lib/pipeline/analytics/analyticsAggregation.js`
**No LLM calls.** Fully deterministic.

Aggregates all per-source `analytics_taxonomy` fields into structured counts.

### Output (`aggregates`)

```js
{
  category_counts:          { category_key: count },
  source_type_counts:       { source_type: count },
  trust_tier_counts:        { trust_tier: count },
  attack_vector_frequency:  { vector_name: count },   // sorted desc
  signal_cluster_counts:    { cluster_name: count },  // sorted desc
  maturity_distribution:    { maturity_level: count },
  ai_layer_distribution:    { ai_layer: count },
  monthly_timeline:         { "YYYY-MM": { total, by_category: {} } },
  category_breakdown:       { category: { vectors, clusters, maturity, types } },
  total_sources:            number,
  total_with_taxonomy:      number,
  date_range:               { start, end },
}
```

---

## Step 3 — Visualization Specs (7.2C)

**File:** `lib/pipeline/analytics/visualizationSpecs.js`
**No LLM calls.** Fully deterministic.

Converts `aggregates` into chart-ready spec objects. All visualization_ids are stable and used by `planSlides.js` to assign charts to specific slides.

### Generated Specs

| visualization_id | chart_type | Description |
|-----------------|-----------|-------------|
| `attack_vector_frequency` | bar_chart | Top attack vectors by count |
| `maturity_distribution` | bar_chart | Threat maturity levels |
| `ai_layer_distribution` | bar_chart | AI layer targeted |
| `signal_cluster_radar` | radar_chart | Signal clusters across categories |
| `category_source_counts` | bar_chart | Total sources per category |
| `monthly_source_timeline` | stacked_bar | Monthly volume by category |
| `category_maturity_matrix` | matrix | Category × maturity heatmap |
| `category_vector_heatmap` | heatmap | Category × attack vector |
| `trust_tier_distribution` | bar_chart | Trust tier breakdown |
| `source_type_distribution` | bar_chart | Source type breakdown |
| `<category>_attack_vectors` (×4) | bar_chart | Per-category vector breakdown |
| `<category>_signal_clusters` (×4) | bar_chart | Per-category cluster breakdown |

Specs with empty data are omitted.

---

## Optional: Visualization Recommendations (7.2C-opt)

**Disabled by default** (`skipVizRecommendation=true`). Opt in by passing `skipVizRecommendation: false`.

| Property | Value |
|----------|-------|
| Function | `callLLM()` — provider rotation |
| Keys | Any OPENAI/GROQ/GEMINI key |
| Output format | Structured JSON (`VIZ_RECOMMENDATION_SCHEMA`) |
| Label | `"Layer7.2C-viz-recommendation"` |

### System Prompt (inline)

```
You are recommending visualizations for a strategic AI-cyber horizon scan slide deck.
Only reference visualization IDs that actually exist. Do not invent data.
Return strict JSON only.
```

### User Prompt (inline)

```
AVAILABLE VISUALIZATION IDs: <comma-separated visualization_ids>

CATEGORY COUNTS: <JSON>
TOP ATTACK VECTORS: <top 5 vector names>
TOP SIGNAL CLUSTERS: <top 5 cluster names>
TOTAL SOURCES: <count>
DATE RANGE: <start> to <end>

Recommend which visualizations are most useful for:
- executive overview slides
- each threat category section
- early signals section
- 6-month outlook section
- appendix/reference

Return JSON:
{ "recommendations": [{ "visualization_id": "", "recommended_slide_use": "", "why_useful": "", "priority": "high|medium|low" }] }
```

### Output

```json
{
  "recommendations": [
    {
      "visualization_id": "string",
      "recommended_slide_use": "string",
      "why_useful": "string",
      "priority": "high | medium | low"
    }
  ]
}
```

Failure silently returns empty recommendations array.

---

## Branch Output

```js
{
  analytics_sources: object[],        // all sources with analytics_taxonomy set
  aggregates: object,                 // aggregated counts/distributions
  visualization_specs: object[],      // chart-ready specs
  viz_recommendations: object[],      // optional (empty if disabled)
  counts: { categories, visualizations, total_sources, taxonomy_done },
  analytics_version: "analytics-v1.0",
}
```
