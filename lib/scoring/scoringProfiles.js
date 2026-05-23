// Additive deltas applied to individual component scores before clamping.
// Each key maps to a component name in scoreSourceV6 scores object.
// Components and their max values:
//   severity_score            max 20
//   operational_impact_score  max 20
//   report_quality_score      max 25
//   horizon_signal_score      max 20
//   source_credibility_score  max 10
// Deltas are clamped to the component max after application.

const PROFILES = {
  active_exploitation: {
    severity_score: +8,
    operational_impact_score: +5,
  },
  vulnerability_disclosure: {
    severity_score: +3,
    operational_impact_score: +2,
    novelty_score: +4,
  },
  research_finding: {
    report_quality_score: +5,
    horizon_signal_score: +3,
    novelty_score: +5,
  },
  threat_actor_report: {
    severity_score: +5,
    report_quality_score: +3,
    novelty_score: +2,
  },
  policy_advisory: {
    operational_impact_score: +3,
    source_credibility_score: +2,
    report_quality_score: +2,
  },
  incident_report: {
    severity_score: +4,
    operational_impact_score: +3,
    report_quality_score: +2,
  },
  analysis_essay: {
    report_quality_score: +2,
    horizon_signal_score: +1,
  },
  product_announcement: {},
  low_value_noise:       {},
  unrelated:             {},
};

// Component max values — used when applying deltas
const COMPONENT_MAX = {
  severity_score:            20,
  operational_impact_score:  20,
  report_quality_score:      25,
  horizon_signal_score:      20,
  source_credibility_score:  10,
  novelty_score:             15,
};

export function getProfile(eventType) {
  return PROFILES[eventType] || {};
}

export function applyDelta(scores, profile) {
  const result = { ...scores };
  for (const [component, delta] of Object.entries(profile)) {
    const max = COMPONENT_MAX[component];
    if (max === undefined) continue;
    result[component] = Math.min((result[component] || 0) + delta, max);
  }
  return result;
}
