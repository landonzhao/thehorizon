/**
 * Builds the shared intelligence base from archived sources.
 *
 * Pipeline:
 *   Stored sources
 *   → Event clustering (deterministic)
 *   → Event synthesis (LLM)
 *   → Event scoring (deterministic)
 *   → Trend clustering (deterministic)
 *   → Trend synthesis (LLM)
 *   → Trend scoring (deterministic)
 *   → Strategic shift detection (LLM)
 *   → Cross-category convergence (deterministic)
 *   → Defender implications (deterministic)
 *   → Watch indicators (deterministic)
 *   → Maturity matrix (deterministic)
 *   → Persist to Supabase
 *
 * Usage:
 *   node scripts/buildIntelligenceBase.js [--period monthly] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--limit 500]
 *
 * Options:
 *   --period     monthly | weekly | quarterly (default: monthly)
 *   --start      ISO date for source filter
 *   --end        ISO date for source filter
 *   --limit      Max sources to load (default: 2000)
 *   --skip-llm   Skip all LLM synthesis steps (deterministic fallbacks only)
 *   --dry-run    Build but do not write to Supabase
 */

import "dotenv/config";
import { listSources } from "../lib/storage/snapshotDatabase.js";
import { clusterSourcesIntoEvents } from "../lib/events/clusterSourcesIntoEvents.js";
import { synthesiseEvent } from "../lib/events/synthesiseEvent.js";
import { scoreEvent } from "../lib/events/scoreEvent.js";
import { clusterEventsIntoTrends } from "../lib/trends/clusterEventsIntoTrends.js";
import { synthesiseTrend } from "../lib/trends/synthesiseTrend.js";
import { scoreTrend } from "../lib/trends/scoreTrend.js";
import { detectStrategicShifts } from "../lib/strategy/detectStrategicShifts.js";
import { detectCrossCategoryConvergence } from "../lib/strategy/detectCrossCategoryConvergence.js";
import { generateDefenderImplications } from "../lib/strategy/generateDefenderImplications.js";
import { generateWatchIndicators } from "../lib/strategy/generateWatchIndicators.js";
import { buildMaturityTrajectoryMatrix } from "../lib/strategy/buildMaturityTrajectoryMatrix.js";
import { storeIntelligenceBase } from "../lib/storage/storeIntelligenceBase.js";
import { buildMonthlyHorizonScanData } from "../lib/reports/buildMonthlyHorizonScanData.js";
import { generateMonthlyHorizonScan } from "../lib/reports/generateMonthlyHorizonScan.js";
import { generatePeriodPageData } from "../lib/pages/generatePeriodPageData.js";
import { uploadArchiveJson } from "../lib/storage/blobArchiveStore.js";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : def;
};
const hasFlag = (name) => args.includes(name);

const PERIOD  = getArg("--period", "monthly");
const START   = getArg("--start", null);
const END     = getArg("--end", null);
const LIMIT   = parseInt(getArg("--limit", "2000"), 10);
const SKIP_LLM = hasFlag("--skip-llm");
const DRY_RUN  = hasFlag("--dry-run");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Building intelligence base — period=${PERIOD} limit=${LIMIT}${SKIP_LLM ? " [skip-llm]" : ""}${DRY_RUN ? " [dry-run]" : ""}`);

  // ── 1. Load sources ─────────────────────────────────────────────────────────
  log("Loading sources from Supabase...");
  const sources = await listSources({ start: START, end: END, limit: LIMIT });
  const eligibleSources = sources.filter((s) => (s.ai_specificity_score || 0) >= 10 && (s.priority_score || 0) > 0);
  log(`  Loaded ${sources.length} sources, ${eligibleSources.length} eligible for clustering`);

  // ── 2. Event clustering ─────────────────────────────────────────────────────
  log("Clustering sources into events...");
  const { clusters: rawClusters, source_to_event } = clusterSourcesIntoEvents(eligibleSources);
  log(`  Created ${rawClusters.length} event clusters`);

  // ── 3. Event synthesis ──────────────────────────────────────────────────────
  log("Synthesising events...");
  const synthesisedClusters = [];
  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i];
    process.stdout.write(`  [${i + 1}/${rawClusters.length}] ${cluster.event_id}`);
    try {
      const synthesised = SKIP_LLM
        ? { ...cluster, event_title: cluster.sources[0]?.title || cluster.event_id, summary: cluster.sources[0]?.short_summary || "", confidence_level: "low" }
        : await synthesiseEvent(cluster);
      synthesisedClusters.push(synthesised);
      process.stdout.write(" ✓\n");
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      synthesisedClusters.push({ ...cluster, event_title: cluster.sources[0]?.title || cluster.event_id, confidence_level: "low" });
    }
    if (!SKIP_LLM && i < rawClusters.length - 1) await sleep(500);
  }

  // ── 4. Event scoring ────────────────────────────────────────────────────────
  log("Scoring events...");
  const scoredEvents = synthesisedClusters.map(scoreEvent);
  log(`  Events scored. Top event: ${scoredEvents.sort((a, b) => b.event_priority_score - a.event_priority_score)[0]?.event_title}`);

  // ── 5. Trend clustering ─────────────────────────────────────────────────────
  log("Clustering events into trends...");
  const { trends: rawTrends, event_to_trend } = clusterEventsIntoTrends(scoredEvents);
  log(`  Created ${rawTrends.length} trend clusters`);

  // ── 6. Trend synthesis ──────────────────────────────────────────────────────
  log("Synthesising trends...");
  const synthesisedTrends = [];
  for (let i = 0; i < rawTrends.length; i++) {
    const trend = rawTrends[i];
    process.stdout.write(`  [${i + 1}/${rawTrends.length}] ${trend.trend_id}`);
    try {
      const synthesised = SKIP_LLM
        ? { ...trend, trend_title: `Trend in ${(trend.threat_categories || []).join("/")}`, confidence_level: "low" }
        : await synthesiseTrend(trend);
      synthesisedTrends.push(synthesised);
      process.stdout.write(" ✓\n");
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      synthesisedTrends.push({ ...trend, trend_title: `Trend: ${trend.trend_id}`, confidence_level: "low" });
    }
    if (!SKIP_LLM && i < rawTrends.length - 1) await sleep(500);
  }

  // ── 7. Trend scoring ────────────────────────────────────────────────────────
  log("Scoring trends...");
  const scoredTrends = synthesisedTrends.map(scoreTrend);

  // ── 8. Strategic shift detection ────────────────────────────────────────────
  log("Detecting strategic shifts...");
  const strategicShifts = SKIP_LLM ? [] : await detectStrategicShifts(scoredTrends, PERIOD);
  log(`  Detected ${strategicShifts.length} strategic shifts`);

  // ── 9. Convergence detection ────────────────────────────────────────────────
  log("Detecting cross-category convergence...");
  const convergencePoints = detectCrossCategoryConvergence(scoredEvents, scoredTrends);
  log(`  Detected ${convergencePoints.length} convergence patterns`);

  // ── 10. Defender implications ────────────────────────────────────────────────
  log("Aggregating defender implications...");
  const defenderImplications = generateDefenderImplications(scoredEvents, scoredTrends, strategicShifts);

  // ── 11. Watch indicators ─────────────────────────────────────────────────────
  log("Aggregating watch indicators...");
  const watchIndicators = generateWatchIndicators(scoredEvents, scoredTrends, convergencePoints);

  // ── 12. Maturity matrix ──────────────────────────────────────────────────────
  log("Building maturity trajectory matrix...");
  const maturityMatrix = buildMaturityTrajectoryMatrix(scoredTrends, strategicShifts);

  // ── 13. Build page data ─────────────────────────────────────────────────────
  log("Building period page data...");
  const pageDatasets = {};
  for (const period of ["daily", "weekly", "monthly", "quarterly"]) {
    pageDatasets[period] = generatePeriodPageData({
      period,
      events:           scoredEvents,
      trends:           scoredTrends,
      sources:          eligibleSources,
      watchIndicators,
      convergencePoints,
      generated_at:     new Date().toISOString(),
    });
  }

  // ── 14. Build monthly horizon scan ───────────────────────────────────────────
  log("Building monthly horizon scan data...");
  const horizonScanData = buildMonthlyHorizonScanData({
    events:              scoredEvents,
    trends:              scoredTrends,
    strategicShifts,
    convergencePoints,
    defenderImplications,
    watchIndicators,
    maturityMatrix,
    sources:             eligibleSources,
    period:              PERIOD,
    generated_at:        new Date().toISOString(),
  });

  log("Rendering monthly horizon scan report...");
  const reportMarkdown = generateMonthlyHorizonScan(horizonScanData);

  // ── 15. Persist ──────────────────────────────────────────────────────────────
  const dateKey = new Date().toISOString().slice(0, 10);

  if (!DRY_RUN) {
    log("Storing intelligence base to Supabase...");
    await storeIntelligenceBase({
      events:           scoredEvents,
      trends:           scoredTrends,
      strategicShifts,
      convergencePoints,
      source_to_event,
      event_to_trend,
    });

    log("Uploading page data and report to Vercel Blob...");
    for (const [period, pageData] of Object.entries(pageDatasets)) {
      await uploadArchiveJson(`intelligence/${dateKey}/pages/${period}.json`, pageData, { overwrite: true });
    }
    await uploadArchiveJson(`intelligence/${dateKey}/horizon-scan-data.json`, horizonScanData, { overwrite: true });
    await uploadArchiveJson(`intelligence/${dateKey}/horizon-scan-report.md`, reportMarkdown, { overwrite: true });
    log("  Upload complete");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n✓ Intelligence base built successfully");
  console.log(`  Sources:          ${eligibleSources.length}`);
  console.log(`  Events:           ${scoredEvents.length}`);
  console.log(`  Trends:           ${scoredTrends.length}`);
  console.log(`  Strategic shifts: ${strategicShifts.length}`);
  console.log(`  Convergence pts:  ${convergencePoints.length}`);
  console.log(`  Report length:    ${reportMarkdown.length.toLocaleString()} chars`);
  if (DRY_RUN) console.log("  [dry-run] No data written to Supabase or Blob");

  return {
    events: scoredEvents,
    trends: scoredTrends,
    strategicShifts,
    convergencePoints,
    pageDatasets,
    horizonScanData,
    reportMarkdown,
  };
}

main().catch((err) => {
  console.error("Intelligence base build failed:", err);
  process.exit(1);
});
