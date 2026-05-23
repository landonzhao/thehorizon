/**
 * Deterministic trend scoring.
 *
 * Produces trend_score (0-100) that drives both dashboard prominence and
 * monthly report section ordering.
 */

import { TREND_STRENGTHS } from "./synthesiseTrend.js";

const STRENGTH_SCORE = { weak: 10, moderate: 25, strong: 40, dominant: 55 };
const TRAJECTORY_SCORE = { accelerating: 15, emerging: 12, steady: 8, plateauing: 3, decelerating: 0 };
const MATURITY_TREND_SCORE = { research: 8, emerging: 12, growing: 10, operational: 6, mainstream: 3 };

export function scoreTrend(trend) {
  const strengthScore  = STRENGTH_SCORE[trend.trend_strength] || 10;
  const trajectScore   = TRAJECTORY_SCORE[trend.trajectory]   || 8;
  const maturityScore  = MATURITY_TREND_SCORE[trend.maturity_level] || 8;
  const sgScore        = trend.singapore_asean_relevance ? 8 : 0;
  const eventCount     = trend.supporting_event_ids?.length || 1;
  const countScore     = Math.min(eventCount * 3, 15);
  const maxPriority    = trend.max_event_priority || 0;
  const priorityScore  = Math.round((maxPriority / 100) * 10);
  const noveltyScore   = (trend.dominant_tags || []).some((t) =>
    ["mcp_exploitation","agent_hijacking","novel_technique","excessive_agency"].includes(t)
  ) ? 5 : 0;

  const raw = strengthScore + trajectScore + maturityScore + sgScore + countScore + priorityScore + noveltyScore;
  const trend_score = Math.max(0, Math.min(100, raw));

  return {
    ...trend,
    trend_score,
    _score_breakdown: {
      strength: strengthScore, trajectory: trajectScore, maturity: maturityScore,
      singapore: sgScore, event_count: countScore, priority: priorityScore, novelty: noveltyScore,
    },
  };
}
