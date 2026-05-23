/**
 * Deterministic event scoring.
 *
 * Produces two independent scores:
 * - event_priority_score: "what analysts should care about NOW" (operational urgency)
 * - event_report_score:   "what belongs in the monthly horizon scan" (strategic value)
 *
 * All logic is deterministic — no LLM calls.
 */

import { EVIDENCE_LEVEL_SCORES } from "../scoring/relevanceRules.js";
import { MATURITY_LEVELS } from "./synthesiseEvent.js";

const EXPLOITATION_URGENCY = {
  exploited_in_wild: 25,
  poc_available:     15,
  not_exploited:      5,
  unknown:            2,
};

const EVENT_TYPE_PRIORITY_BONUS = {
  active_exploitation:      20,
  vulnerability_disclosure: 12,
  threat_actor_report:      15,
  incident_report:          10,
  research_finding:          5,
  policy_advisory:           6,
  analysis_essay:            2,
  product_announcement:      0,
  low_value_noise:          -10,
  unrelated:               -20,
};

const EVENT_TYPE_REPORT_BONUS = {
  active_exploitation:      15,
  vulnerability_disclosure: 10,
  research_finding:         18,
  threat_actor_report:      14,
  policy_advisory:          10,
  incident_report:           8,
  analysis_essay:            5,
  product_announcement:     -5,
  low_value_noise:          -10,
  unrelated:               -20,
};

const MATURITY_REPORT_SCORE = {
  research:      10,
  emerging:      15,
  growing:       12,
  operational:    8,
  mainstream:     3,
};

// ── Component scorers ─────────────────────────────────────────────────────────

function scoreEvidence(cluster) {
  return EVIDENCE_LEVEL_SCORES[cluster.evidence_level] || 0;
}

function scoreExploitation(cluster) {
  return EXPLOITATION_URGENCY[cluster.exploitation_status] || 2;
}

function scoreSourceCount(cluster) {
  // More corroborating sources = more significant event
  const n = cluster.source_count || 1;
  if (n >= 5) return 10;
  if (n >= 3) return 7;
  if (n >= 2) return 4;
  return 0;
}

function scoreRecency(cluster) {
  const last = new Date(cluster.last_seen || cluster.first_seen);
  if (isNaN(last.getTime())) return 0;
  const ageHours = (Date.now() - last.getTime()) / 3_600_000;
  if (ageHours <= 24)  return 10;
  if (ageHours <= 72)  return 7;
  if (ageHours <= 168) return 4;
  if (ageHours <= 720) return 2;
  return 0;
}

function scoreScope(cluster) {
  let s = 0;
  // CVEs: each adds precision signal
  s += Math.min((cluster.cve_ids || []).length * 3, 9);
  // Affected products breadth
  s += Math.min((cluster.affected_products || []).length, 5);
  // Affected sectors
  s += Math.min((cluster.affected_sectors || []).length * 2, 6);
  // Multi-layer AI stack impact
  s += Math.min((cluster.affected_ai_stack_layers || []).length * 2, 6);
  return Math.min(s, 20);
}

function scoreSingaporeAsean(cluster) {
  if (cluster.singapore_asean_relevance) return 8;
  const geo = (cluster.geographic_scope || []).map((g) => g.toLowerCase());
  if (geo.includes("global")) return 3;
  return 0;
}

function scoreMaturityForReport(cluster) {
  return MATURITY_REPORT_SCORE[cluster.maturity_level] || 5;
}

function scoreNovelty(cluster) {
  const sources = cluster.sources || [];
  const novelty = sources.reduce((best, s) => {
    const n = s.llm_extracted_intelligence?.attack_novelty;
    const order = ["novel_technique","new_variant","known_technique_new_target","established"];
    const idx = order.indexOf(n);
    return idx !== -1 && idx < order.indexOf(best) ? n : best;
  }, "established");

  const NOVELTY_SCORE = {
    novel_technique:         15,
    new_variant:              8,
    known_technique_new_target: 4,
    established:              0,
  };
  return NOVELTY_SCORE[novelty] || 0;
}

function priorityLabel(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "background";
}

// ── Main export ───────────────────────────────────────────────────────────────

export function scoreEvent(cluster) {
  const evidenceScore      = scoreEvidence(cluster);
  const exploitScore       = scoreExploitation(cluster);
  const sourceCountScore   = scoreSourceCount(cluster);
  const recencyScore       = scoreRecency(cluster);
  const scopeScore         = scoreScope(cluster);
  const sgScore            = scoreSingaporeAsean(cluster);
  const maturityReportScore = scoreMaturityForReport(cluster);
  const noveltyScore       = scoreNovelty(cluster);

  const priorityTypeBonus  = EVENT_TYPE_PRIORITY_BONUS[cluster.event_type] || 0;
  const reportTypeBonus    = EVENT_TYPE_REPORT_BONUS[cluster.event_type] || 0;

  const rawPriority =
    evidenceScore +
    exploitScore +
    sourceCountScore +
    recencyScore +
    scopeScore +
    sgScore +
    priorityTypeBonus;

  const rawReport =
    evidenceScore +
    maturityReportScore +
    noveltyScore +
    sourceCountScore +
    sgScore +
    reportTypeBonus;

  const event_priority_score = Math.max(0, Math.min(100, rawPriority));
  const event_report_score   = Math.max(0, Math.min(100, rawReport));

  return {
    ...cluster,
    event_priority_score,
    event_report_score,
    priority_score:   event_priority_score,  // backward-compat alias
    report_score:     event_report_score,
    event_score:      event_priority_score,
    priority_label:   priorityLabel(event_priority_score),

    // Score breakdown (for debugging/transparency)
    _score_components: {
      evidence:      evidenceScore,
      exploitation:  exploitScore,
      source_count:  sourceCountScore,
      recency:       recencyScore,
      scope:         scopeScore,
      singapore:     sgScore,
      maturity:      maturityReportScore,
      novelty:       noveltyScore,
      type_priority: priorityTypeBonus,
      type_report:   reportTypeBonus,
    },
  };
}
