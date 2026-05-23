/**
 * Builds the maturity and trajectory matrix for the monthly horizon scan.
 *
 * The matrix plots each trend on two axes:
 * - maturity_level (research → mainstream)
 * - trajectory (decelerating → accelerating)
 *
 * Fully deterministic — no LLM required.
 */

import { MATURITY_LEVELS } from "../events/synthesiseEvent.js";
import { TRAJECTORIES } from "../trends/synthesiseTrend.js";

// Map maturity to watch urgency
const MATURITY_URGENCY = {
  research:     "monitor",
  emerging:     "watch",
  growing:      "prepare",
  operational:  "act",
  mainstream:   "sustain",
};

// Map trajectory to forward signal
const TRAJECTORY_FORWARD_SIGNAL = {
  accelerating: "likely to escalate within 1-3 months",
  emerging:     "early signal — watch for corroborating developments",
  steady:       "sustained pressure — may normalise into baseline risk",
  plateauing:   "peak may be near — watch for successor techniques",
  decelerating: "may be displaced by newer techniques",
};

export function buildMaturityTrajectoryMatrix(trends, shifts) {
  const items = [];

  // Add trend entries
  for (const trend of trends) {
    if (!trend.maturity_level || !trend.trajectory) continue;
    items.push({
      item_id:                 trend.trend_id,
      item_type:               "trend",
      signal:                  trend.trend_title || trend.trend_id,
      current_maturity:        trend.maturity_level,
      trajectory:              trend.trajectory,
      operationalization_level: null,  // trends aggregate multiple events
      expected_watch_window:   trend.watch_window || "3-6 months",
      confidence_level:        trend.confidence_level || "medium",
      strategic_significance:  trend.strategic_significance || "",
      urgency:                 MATURITY_URGENCY[trend.maturity_level] || "monitor",
      forward_signal:          TRAJECTORY_FORWARD_SIGNAL[trend.trajectory] || "watch",
      trend_score:             trend.trend_score || 0,
      singapore_asean_relevance: trend.singapore_asean_relevance || false,
      supporting_event_count:  trend.supporting_event_ids?.length || 0,
    });
  }

  // Add shift entries (strategic shifts often span multiple maturity levels)
  for (const shift of shifts) {
    if (!shift.maturity_level) continue;
    items.push({
      item_id:                 `shift-${shift.shift_title?.slice(0, 20).replace(/\s/g, "-") || "unknown"}`,
      item_type:               "strategic_shift",
      signal:                  shift.shift_title || "",
      current_maturity:        shift.maturity_level,
      trajectory:              "emerging",  // shifts are by definition directional
      operationalization_level: null,
      expected_watch_window:   shift.expected_watch_window || "3-6 months",
      confidence_level:        shift.confidence_level || "medium",
      strategic_significance:  shift.why_this_matters || "",
      urgency:                 MATURITY_URGENCY[shift.maturity_level] || "watch",
      forward_signal:          TRAJECTORY_FORWARD_SIGNAL["emerging"],
      trend_score:             0,
      singapore_asean_relevance: shift.singapore_asean_relevance || false,
      supporting_event_count:  0,
    });
  }

  // Sort: operational/growing first, then by trend_score desc
  const maturityOrder = Object.fromEntries(MATURITY_LEVELS.map((m, i) => [m, i]));
  const trajectoryOrder = Object.fromEntries(TRAJECTORIES.map((t, i) => [t, i]));

  items.sort((a, b) => {
    // Operational/growing before research
    const matDiff = (maturityOrder[b.current_maturity] || 0) - (maturityOrder[a.current_maturity] || 0);
    if (matDiff !== 0) return matDiff;
    // Accelerating before decelerating
    const trajDiff = (trajectoryOrder[a.trajectory] || 0) - (trajectoryOrder[b.trajectory] || 0);
    if (trajDiff !== 0) return trajDiff;
    return b.trend_score - a.trend_score;
  });

  return items;
}
