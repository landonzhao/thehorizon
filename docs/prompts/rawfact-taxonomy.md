# Layer 7.1A — Rawfact Evidence Taxonomy Prompt

## Purpose

Decide what kind of factual evidence this source can provide. This is **evidence preparation**,
not analysis. The output describes the source's evidence characteristics so that later
extraction, scoring, and analysis steps have the right context.

One LLM call per source. Deterministic fallback when LLM is unavailable.

Implementation: `lib/pipeline/rawfact/rawfactTaxonomy.js`

---

## System Prompt

```
You are preparing a source for factual evidence extraction in an AI-cyber horizon scan.

This is NOT strategic analysis. This is evidence preparation.

The source already has Layer 5 intelligence: source_type, main_category, framework_tags,
source_summary, primary_subject, main_claims, key_entities, important_numbers.

Your task: assign rawfact taxonomy fields that describe what kind of factual evidence
this source contains.

Be source-type-aware:
- vulnerability: focus on exploitability, affected ecosystem, blast radius, patch status, exploitation status
- exploit_disclosure: focus on exploit chain, reproducibility, access required, public tooling, operational realism
- incident: focus on confirmed impact, victim/sector, scale, attacker method, repeatability, institutional response
- threat_intelligence: focus on observed TTPs, actor/campaign details, sectors, operational confidence
- research_finding: focus on demonstrated method, reproducibility, systems tested, research-to-threat potential
- defensive_capability: focus on gap addressed, capability proposed, deployment readiness, limitations
- governance/policy: focus on issuing authority, governance issue, affected sectors, compliance implications
- ecosystem_market_signal: focus on adoption/infrastructure shifts and downstream security impact
- societal_harm_signal: focus on harm type, affected population, trust system, institutional response
- benchmark_evaluation: focus on capability measured, key result, trajectory signal
- strategic_foresight_signal: focus on strategic theme, systemic risk, convergence signal

Enums:
impact_scope: individual | organization | sector | ecosystem | societal | global | unknown
impact_severity: critical | high | medium | low | informational | unknown
operational_relevance: very_high | high | medium | low | none
novelty: new_attack_surface | new_tactic | known_tactic_new_scale | known_tactic | incremental | unknown

Rules:
- Do not invent facts not in the source.
- Do not write strategic insights.
- Use "unknown" when the source does not provide enough detail.
- Return strict JSON only — no markdown, no preamble.
```

---

## User Prompt Template

```
SOURCE TYPE: {{source_type}}
MAIN CATEGORY: {{main_category}}
FRAMEWORK TAGS: {{framework_tag_names joined by ", "}}

SUMMARY: {{source_summary}}
PRIMARY SUBJECT: {{primary_subject}}
MAIN CLAIMS:
1. {{claim_1}}
2. {{claim_2}}
...
KEY ENTITIES: {{key_entities joined by ", "}}
IMPORTANT NUMBERS: {{important_numbers joined by " | "}}

SOURCE TEXT (excerpt):
{{clean_text or full_text, first 1500 chars}}
```

---

## Output Schema

```json
{
  "rawfact_tags": ["string"],
  "sector": ["string"],
  "geography": ["string"],
  "technology": ["string"],
  "affected_systems": ["string"],
  "impact_type": ["string"],
  "impact_scope": "individual | organization | sector | ecosystem | societal | global | unknown",
  "impact_severity": "critical | high | medium | low | informational | unknown",
  "operational_relevance": "very_high | high | medium | low | none",
  "novelty": "new_attack_surface | new_tactic | known_tactic_new_scale | known_tactic | incremental | unknown",
  "source_type_context": {},
  "rawfact_taxonomy_reason": "string"
}
```

## Source-type context shapes

The `source_type_context` object is discriminated by `source_type`. Each shape:

**vulnerability:**
```json
{
  "exploitability": "very_high | high | medium | low | unknown",
  "affected_product_or_system": "string",
  "affected_ecosystem": "string",
  "blast_radius": "local | product | sector | ecosystem | global | unknown",
  "exploit_status": "exploited_in_the_wild | proof_of_concept | disclosed | unknown",
  "patch_status": "patched | workaround_available | unpatched | unknown",
  "execution_or_data_access_risk": "remote_code_execution | data_exfiltration | privilege_escalation | sandbox_escape | denial_of_service | unknown",
  "defender_actionability": "immediate | monitor | low | unknown"
}
```

**exploit_disclosure:**
```json
{
  "exploit_chain": ["string"],
  "required_access": "none | user | privileged | unknown",
  "reproducibility": "high | medium | low | unknown",
  "technical_complexity": "low | medium | high | unknown",
  "public_tooling_available": "boolean",
  "operational_realism": "high | medium | low | unknown",
  "automation_potential": "high | medium | low | unknown"
}
```

**incident:**
```json
{
  "confirmed_impact": "confirmed | claimed | unclear",
  "victim_or_target_type": "string",
  "affected_sector": ["string"],
  "incident_scale": "individual | organization | sector | ecosystem | societal | unknown",
  "attacker_method": "string",
  "repeatability": "high | medium | low | unknown",
  "institutional_response": "yes | no | unknown",
  "known_losses_or_numbers": ["string"]
}
```

**threat_intelligence:**
```json
{
  "observed_ttps": ["string"],
  "threat_actor": "string",
  "campaign_scope": "single_target | multi_target | sector_wide | global | unknown",
  "targeted_sectors": ["string"],
  "ai_role_in_operation": "target | tool | operating_environment | unknown",
  "attribution_confidence": "high | medium | low | unknown",
  "operational_confidence": "high | medium | low | unknown"
}
```

**research_finding:**
```json
{
  "research_claim": "string",
  "method_demonstrated": "string",
  "reproducibility": "high | medium | low | unknown",
  "systems_tested": ["string"],
  "research_to_threat_potential": "high | medium | low | unknown",
  "operationalization_barriers": ["string"],
  "defensive_implications": "string"
}
```

**defensive_capability:**
```json
{
  "defensive_gap_addressed": "string",
  "capability_proposed": "string",
  "deployment_readiness": "production | pilot | research | concept | unknown",
  "coverage_scope": "narrow | moderate | broad | unknown",
  "evaluation_quality": "strong | moderate | weak | unknown",
  "limitations": ["string"]
}
```

**governance_organizational_response / policy_regulatory_signal:**
```json
{
  "issuing_authority": "string",
  "affected_sectors": ["string"],
  "governance_issue": "string",
  "compliance_or_policy_implication": "string",
  "systemic_risk_recognized": "boolean",
  "recommended_actions": ["string"]
}
```

**ecosystem_market_signal:**
```json
{
  "ecosystem_change": "string",
  "adoption_signal": "strong | moderate | weak | unknown",
  "infrastructure_or_platform": "string",
  "downstream_security_impact": "high | medium | low | unknown",
  "dependency_growth": "high | medium | low | unknown",
  "attack_surface_growth": "high | medium | low | unknown"
}
```

**societal_harm_signal:**
```json
{
  "harm_type": "string",
  "affected_population": "string",
  "harm_scale": "individual | community | institutional | national | global | unknown",
  "trust_system_affected": "string",
  "institutional_response": "yes | no | unknown",
  "repeatability": "high | medium | low | unknown"
}
```

**benchmark_evaluation:**
```json
{
  "capability_measured": "string",
  "evaluation_setup": "string",
  "key_result": "string",
  "model_or_system_tested": "string",
  "trajectory_signal": "high | medium | low | unknown",
  "limitations": ["string"]
}
```

**strategic_foresight_signal:**
```json
{
  "strategic_theme": "string",
  "systemic_risk": "string",
  "convergence_signal": "string",
  "horizon_relevance": "very_high | high | medium | low | none",
  "supporting_examples": ["string"],
  "confidence": "high | medium | low"
}
```

---

## Design Notes

**Source-type-aware.** The LLM is instructed to focus on different fields depending on
source_type. A vulnerability source should have a rich `source_type_context.exploitability`
field; a policy source should have a rich `issuing_authority` field. The post-processing
validation fills in default "unknown" values for missing fields based on the source_type.

**Deterministic fallback.** When LLM is unavailable, keyword matching on title+text infers
sector, geography, and technology. `source_type_context` is populated with all-unknown
defaults. `operational_relevance` is inferred from source_type.

**Not strategic.** This layer describes evidence characteristics, not strategic meaning.
"What is the blast radius?" (taxonomy) vs "What does this mean for defenders?" (later layer).

**Token budget:** ~1,200 tokens input + ~400 tokens output ≈ $0.00024/source at gpt-4o-mini pricing.
