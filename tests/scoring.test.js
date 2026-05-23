import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { scoreSourceV6 } from "../lib/scoring/scoreSourceV6.js";
import { applyDelta, getProfile } from "../lib/scoring/scoringProfiles.js";
import { EVENT_TYPE_CAPS, EVIDENCE_LEVEL_SCORES } from "../lib/scoring/relevanceRules.js";

const require = createRequire(import.meta.url);
const calibration = require("../data/scoringCalibrationExamples.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function score(example) {
  return scoreSourceV6(example);
}

function labelFor(priorityScore) {
  if (priorityScore >= 85) return "critical";
  if (priorityScore >= 65) return "high";
  if (priorityScore >= 45) return "medium";
  if (priorityScore >= 25) return "low";
  return "background";
}

// ── 1. Component max values ───────────────────────────────────────────────────

{
  // A maximally-boosted source should never exceed component caps
  const maxSource = {
    title: "test",
    full_text: "CVE-2026-0001 CVE-2026-0002 actively exploited in the wild zero-day exploit indicators of compromise yara rule sigma rule ioc remote code execution singapore asean govtech csa singapore",
    tags: ["actively_exploited", "proof_of_concept", "mcp_exploitation", "agent_hijacking", "excessive_agency", "prompt_injection", "sensitive_data_disclosure", "critical_infrastructure"],
    main_category: "agentic_ai_threats",
    ai_specificity_score: 100,
    source_type: "government_advisory",
    trust_tier: "primary",
    date_published: new Date().toISOString(),
    intelligence: {
      key_entities: { threat_actors: ["APT1", "APT2"], affected_products: ["ProductA", "ProductB", "ProductC"], cves: ["CVE-2026-0001"] },
      trend_signals: ["signal1", "signal2", "signal3"],
      threat_maturity: "emerging",
      horizon_relevance: 5,
      report_tier: "weekly",
    },
    analyst_brief: {
      watch_points: ["wp1", "wp2", "wp3"],
      what_happened: "A very long detailed description of what happened in the incident at the systems",
      who_was_affected: "Many organisations in Singapore and ASEAN regions were affected",
      how_it_happened: "The attacker exploited a zero-day vulnerability in the MCP server",
      impact: "Complete compromise of 500 organisations across ASEAN",
      why_it_matters: "Full compromise of critical infrastructure operators across ASEAN",
    },
    claims: [1,2,3,4,5,6].map(i => ({ claim_text: `claim ${i}`, claim_type: "vulnerability", evidence_span: "x", confidence: 90 })),
    llm_extracted_intelligence: {
      publisher_type: "government_agency",
      event_type: "active_exploitation",
      evidence_level: "confirmed_exploitation",
      exploitation_status: "exploited_in_wild",
      affected_ai_layer: ["mcp_server"],
      attack_novelty: "novel_technique",
      geographic_scope: ["singapore", "asean"],
    },
  };

  const result = score(maxSource);
  assert.ok(result.ai_security_relevance <= 20, `ai_security_relevance > 20: ${result.ai_security_relevance}`);
  assert.ok(result.severity_score <= 20, `severity_score > 20: ${result.severity_score}`);
  assert.ok(result.operational_impact_score <= 20, `operational_impact_score > 20: ${result.operational_impact_score}`);
  assert.ok(result.novelty_score <= 15, `novelty_score > 15: ${result.novelty_score}`);
  assert.ok(result.source_credibility_score <= 10, `source_credibility_score > 10: ${result.source_credibility_score}`);
  assert.ok(result.singapore_relevance_score <= 10, `singapore_relevance_score > 10: ${result.singapore_relevance_score}`);
  assert.ok(result.time_sensitivity_score <= 5, `time_sensitivity_score > 5: ${result.time_sensitivity_score}`);
  assert.ok(result.priority_score <= 100, `priority_score > 100: ${result.priority_score}`);
  assert.ok(result.report_score <= 100, `report_score > 100: ${result.report_score}`);

  console.log("✓ Component max values respected");
}

// ── 2. Event type caps enforced ───────────────────────────────────────────────

{
  // research_finding has priority_cap: 75
  const researchSource = {
    title: "Novel technique paper",
    full_text: "CVE-2026-1234 actively exploited singapore asean govtech ioc yara rule",
    tags: ["prompt_injection", "actively_exploited", "proof_of_concept"],
    main_category: "llm_threats",
    ai_specificity_score: 95,
    source_type: "research_paper",
    trust_tier: "high",
    date_published: new Date().toISOString(),
    intelligence: {
      key_entities: { threat_actors: ["Actor1"], affected_products: ["GPT-4"], cves: ["CVE-2026-1234"] },
      trend_signals: ["signal1", "signal2"],
      threat_maturity: "emerging",
      horizon_relevance: 5,
      report_tier: "weekly",
    },
    analyst_brief: {
      watch_points: ["wp1", "wp2", "wp3"],
      what_happened: "A detailed description of a research finding with significant technical detail",
      who_was_affected: "All users of GPT-4 globally",
      how_it_happened: "Novel technique bypasses safety training",
      impact: "100% jailbreak success rate demonstrated",
      why_it_matters: "Completely invalidates current safety training assumptions",
    },
    claims: Array(6).fill({ claim_text: "claim", claim_type: "technical", evidence_span: "x", confidence: 90 }),
    llm_extracted_intelligence: {
      publisher_type: "academic",
      event_type: "research_finding",
      evidence_level: "poc_available",
      exploitation_status: "poc_available",
      affected_ai_layer: ["llm_inference"],
      attack_novelty: "novel_technique",
      geographic_scope: ["global"],
    },
  };

  const result = score(researchSource);
  const cap = EVENT_TYPE_CAPS.research_finding.priority_cap;
  assert.ok(result.priority_score <= cap, `research_finding priority ${result.priority_score} > cap ${cap}`);
  assert.ok(result.report_score <= EVENT_TYPE_CAPS.research_finding.report_cap, `research_finding report_score ${result.report_score} > cap ${EVENT_TYPE_CAPS.research_finding.report_cap}`);

  console.log(`✓ research_finding priority cap (${cap}) enforced: priority=${result.priority_score}`);
}

{
  // product_announcement has priority_cap: 50
  const productSource = {
    title: "Product announcement",
    full_text: "product launch webinar marketing sponsored content",
    tags: [],
    main_category: "uncategorised",
    ai_specificity_score: 15,
    source_type: "security_blog",
    trust_tier: "low",
    date_published: new Date().toISOString(),
    intelligence: { key_entities: { threat_actors: [], affected_products: [], cves: [] }, trend_signals: [], threat_maturity: "established", horizon_relevance: 1, report_tier: "archive_only" },
    analyst_brief: { watch_points: [] },
    claims: [],
    llm_extracted_intelligence: {
      publisher_type: "security_vendor",
      event_type: "product_announcement",
      evidence_level: "unverified_claim",
      exploitation_status: "unknown",
      affected_ai_layer: [],
      attack_novelty: "established",
      geographic_scope: ["global"],
    },
  };

  const result = score(productSource);
  const cap = EVENT_TYPE_CAPS.product_announcement.priority_cap;
  assert.ok(result.priority_score <= cap, `product_announcement priority ${result.priority_score} > cap ${cap}`);
  console.log(`✓ product_announcement priority cap (${cap}) enforced: priority=${result.priority_score}`);
}

// ── 3. Evidence level scoring ─────────────────────────────────────────────────

{
  // confirmed_exploitation should score higher than theoretical
  const base = {
    title: "test",
    full_text: "artificial intelligence attack",
    tags: ["prompt_injection"],
    main_category: "llm_threats",
    ai_specificity_score: 70,
    source_type: "security_blog",
    trust_tier: "high",
    date_published: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    intelligence: { key_entities: { threat_actors: [], affected_products: ["GPT-4"], cves: [] }, trend_signals: [], threat_maturity: "emerging", horizon_relevance: 3, report_tier: "monthly" },
    analyst_brief: { watch_points: ["wp1"] },
    claims: [],
  };

  const withConfirmed = score({
    ...base,
    llm_extracted_intelligence: { publisher_type: "security_vendor", event_type: "vulnerability_disclosure", evidence_level: "confirmed_exploitation", exploitation_status: "exploited_in_wild", affected_ai_layer: [], attack_novelty: "established", geographic_scope: ["global"] },
  });
  const withTheoretical = score({
    ...base,
    llm_extracted_intelligence: { publisher_type: "security_vendor", event_type: "vulnerability_disclosure", evidence_level: "theoretical", exploitation_status: "not_exploited", affected_ai_layer: [], attack_novelty: "established", geographic_scope: ["global"] },
  });

  assert.ok(withConfirmed.severity_score > withTheoretical.severity_score,
    `confirmed_exploitation severity (${withConfirmed.severity_score}) should be > theoretical (${withTheoretical.severity_score})`);
  assert.ok(withConfirmed.priority_score > withTheoretical.priority_score,
    `confirmed_exploitation priority (${withConfirmed.priority_score}) should be > theoretical (${withTheoretical.priority_score})`);

  console.log(`✓ evidence_level ordering: confirmed=${withConfirmed.priority_score} > theoretical=${withTheoretical.priority_score}`);
}

// ── 4. Scoring without intel (v5 fallback) ───────────────────────────────────

{
  const noIntelSource = {
    title: "jailbreak test",
    full_text: "CVE-2026-5678 actively exploited proof of concept jailbreak",
    tags: ["jailbreak", "actively_exploited"],
    main_category: "llm_threats",
    ai_specificity_score: 80,
    source_type: "security_blog",
    trust_tier: "high",
    date_published: new Date().toISOString(),
    intelligence: { key_entities: { threat_actors: [], affected_products: [], cves: ["CVE-2026-5678"] }, trend_signals: [], threat_maturity: "growing", horizon_relevance: 3, report_tier: "monthly" },
    analyst_brief: { watch_points: ["wp1"] },
    claims: [],
    // No llm_extracted_intelligence
  };

  const result = score(noIntelSource);
  assert.ok(typeof result.priority_score === "number", "priority_score should be a number when intel absent");
  assert.ok(result.priority_score > 0, "priority_score should be > 0 for relevant source");
  assert.equal(result.score_version, "priority-v6.0-type-aware-horizon", "score_version should be v6");

  console.log(`✓ v5 fallback (no intel): priority=${result.priority_score}, label=${result.priority_label}`);
}

// ── 5. Score version string ───────────────────────────────────────────────────

{
  const result = score({ title: "x", full_text: "artificial intelligence", tags: [], main_category: "uncategorised", source_type: "security_blog", trust_tier: "unknown", llm_extracted_intelligence: null });
  assert.equal(result.score_version, "priority-v6.0-type-aware-horizon");
  console.log("✓ score_version = priority-v6.0-type-aware-horizon");
}

// ── 6. applyDelta clamping ────────────────────────────────────────────────────

{
  const alreadyMaxed = { severity_score: 19, operational_impact_score: 20, report_quality_score: 24, horizon_signal_score: 20, source_credibility_score: 10 };
  const profile = getProfile("active_exploitation");
  const result = applyDelta(alreadyMaxed, profile);

  assert.equal(result.severity_score, 20, "severity_score should clamp at 20");
  assert.equal(result.operational_impact_score, 20, "operational_impact_score should clamp at 20");

  console.log("✓ applyDelta clamps to component max");
}

// ── 7. Calibration examples ───────────────────────────────────────────────────

{
  let passed = 0;
  const failures = [];

  for (const example of calibration) {
    const result = score(example);
    const band = labelFor(result.priority_score);

    if (example._expected_priority_min !== undefined && result.priority_score < example._expected_priority_min) {
      failures.push(`${example._id}: priority=${result.priority_score} < min=${example._expected_priority_min} (band=${band})`);
    }
    if (example._expected_priority_max !== undefined && result.priority_score > example._expected_priority_max) {
      failures.push(`${example._id}: priority=${result.priority_score} > max=${example._expected_priority_max} (band=${band})`);
    }
    if (example._expected_report_min !== undefined && result.report_score < example._expected_report_min) {
      failures.push(`${example._id}: report=${result.report_score} < min=${example._expected_report_min}`);
    }

    if (!failures.find(f => f.startsWith(example._id))) {
      console.log(`  ✓ ${example._id} (${example._band}): priority=${result.priority_score}, report=${result.report_score}, label=${band}`);
      passed++;
    }
  }

  if (failures.length > 0) {
    console.error("\nCalibration failures:");
    failures.forEach(f => console.error(`  ✗ ${f}`));
    process.exitCode = 1;
  } else {
    console.log(`✓ All ${passed} calibration examples within expected ranges`);
  }
}

// ── 8. Singapore relevance v6 ─────────────────────────────────────────────────

{
  const sgSource = {
    title: "test",
    full_text: "singapore csa singapore govtech pdpa artificial intelligence threat",
    tags: [],
    main_category: "llm_threats",
    ai_specificity_score: 60,
    source_type: "security_blog",
    trust_tier: "medium",
    date_published: new Date().toISOString(),
    intelligence: { key_entities: { threat_actors: [], affected_products: [], cves: [] }, trend_signals: [], threat_maturity: "established", horizon_relevance: 2, report_tier: "monthly" },
    analyst_brief: { watch_points: [] },
    claims: [],
    llm_extracted_intelligence: null,
  };

  const result = score(sgSource);
  assert.ok(result.singapore_relevance_score > 0, "Singapore terms should contribute to relevance score");
  assert.ok(result.singapore_relevance_score <= 10, "Singapore relevance capped at 10");
  console.log(`✓ Singapore relevance scoring: score=${result.singapore_relevance_score}`);
}

console.log("\n✓ All scoring tests passed.");
