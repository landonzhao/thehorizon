/**
 * Intelligence architecture tests — no LLM calls, no network, no DB.
 * Run with: node tests/events.test.js
 *
 * Covers the full pipeline contract:
 *   Sources → Events → Trends → Strategy → Pages / Report
 */

import assert from "node:assert/strict";
import { clusterSourcesIntoEvents } from "../lib/events/clusterSourcesIntoEvents.js";
import { scoreEvent } from "../lib/events/scoreEvent.js";
import { clusterEventsIntoTrends } from "../lib/trends/clusterEventsIntoTrends.js";
import { detectCrossCategoryConvergence } from "../lib/strategy/detectCrossCategoryConvergence.js";
import { generatePeriodPageData } from "../lib/pages/generatePeriodPageData.js";
import { buildMonthlyHorizonScanData } from "../lib/reports/buildMonthlyHorizonScanData.js";
import { buildMaturityTrajectoryMatrix } from "../lib/strategy/buildMaturityTrajectoryMatrix.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();
const DAY_AGO = new Date(Date.now() - 86_400_000).toISOString();

function makeSource(overrides = {}) {
  return {
    id:            overrides.id || `src-${Math.random().toString(36).slice(2)}`,
    title:         overrides.title || "Test source",
    url:           overrides.url || `https://example.com/${Math.random()}`,
    canonical_url: overrides.canonical_url || overrides.url || `https://example.com/${Math.random()}`,
    date_published: overrides.date_published || NOW,
    main_category:  overrides.main_category || "llm_threats",
    tags:           overrides.tags || ["prompt_injection"],
    trust_tier:     overrides.trust_tier || "high",
    priority_score: overrides.priority_score ?? 50,
    report_score:   overrides.report_score ?? 50,
    ai_specificity_score: overrides.ai_specificity_score ?? 30,
    llm_extracted_intelligence: overrides.llm_extracted_intelligence || {
      cve_ids:              [],
      affected_products:    [],
      affected_sectors:     [],
      affected_ai_layer:    [],
      threat_actors:        [],
      geographic_scope:     [],
      evidence_level:       "unverified_claim",
      exploitation_status:  "unknown",
      attack_novelty:       "established",
      event_type:           "analysis_essay",
    },
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  return {
    event_id:             overrides.event_id || `evt-${Math.random().toString(36).slice(2)}`,
    event_title:          overrides.event_title || "Test event",
    event_type:           overrides.event_type || "analysis_essay",
    threat_category:      overrides.threat_category || "llm_threats",
    tags:                 overrides.tags || ["prompt_injection"],
    affected_ai_stack_layers: overrides.affected_ai_stack_layers || ["inference_api"],
    affected_products:    overrides.affected_products || [],
    affected_sectors:     overrides.affected_sectors || [],
    cve_ids:              overrides.cve_ids || [],
    geographic_scope:     overrides.geographic_scope || [],
    evidence_level:       overrides.evidence_level || "unverified_claim",
    exploitation_status:  overrides.exploitation_status || "unknown",
    maturity_level:       overrides.maturity_level || "emerging",
    confidence_level:     overrides.confidence_level || "medium",
    singapore_asean_relevance: overrides.singapore_asean_relevance ?? false,
    source_count:         overrides.source_count ?? 1,
    primary_source_id:    overrides.primary_source_id || null,
    supporting_source_ids: overrides.supporting_source_ids || [],
    watch_indicators:     overrides.watch_indicators || [],
    first_seen:           overrides.first_seen || DAY_AGO,
    last_seen:            overrides.last_seen || NOW,
    event_priority_score: overrides.event_priority_score ?? 30,
    event_report_score:   overrides.event_report_score ?? 30,
    priority_score:       overrides.priority_score ?? 30,
    report_score:         overrides.report_score ?? 30,
    summary:              overrides.summary || "Test summary",
    what_happened:        overrides.what_happened || null,
    how_it_happened:      overrides.how_it_happened || null,
    why_it_matters:       overrides.why_it_matters || null,
    defender_implications: overrides.defender_implications || null,
    sources:              overrides.sources || [],
    ...overrides,
  };
}

function makeTrend(overrides = {}) {
  return {
    trend_id:              overrides.trend_id || `trend-${Math.random().toString(36).slice(2)}`,
    trend_title:           overrides.trend_title || "Test trend",
    threat_categories:     overrides.threat_categories || ["llm_threats"],
    affected_ai_stack_layers: overrides.affected_ai_stack_layers || ["inference_api"],
    supporting_event_ids:  overrides.supporting_event_ids || [],
    dominant_tags:         overrides.dominant_tags || ["prompt_injection"],
    summary:               overrides.summary || "Test trend summary",
    trajectory:            overrides.trajectory || "emerging",
    maturity_level:        overrides.maturity_level || "emerging",
    confidence_level:      overrides.confidence_level || "medium",
    trend_score:           overrides.trend_score ?? 40,
    max_event_priority:    overrides.max_event_priority ?? 30,
    defender_implications: overrides.defender_implications || null,
    watch_window:          overrides.watch_window || "1-3 months",
    key_indicators_next_month: overrides.key_indicators_next_month || [],
    singapore_asean_relevance: overrides.singapore_asean_relevance ?? false,
    events:                overrides.events || [],
    ...overrides,
  };
}

// ── 1. Multiple sources cluster into one event ────────────────────────────────

console.log("\nEvent clustering");

test("two sources sharing a CVE produce exactly one event cluster", () => {
  const cve = "CVE-2024-99999";
  const s1 = makeSource({
    id: "src-1", title: "CISA advisory on CVE-2024-99999",
    llm_extracted_intelligence: { cve_ids: [cve], affected_products: [], affected_sectors: [], affected_ai_layer: [], threat_actors: [], geographic_scope: [], evidence_level: "vendor_confirmed", exploitation_status: "exploited_in_wild", attack_novelty: "established", event_type: "vulnerability_disclosure" },
  });
  const s2 = makeSource({
    id: "src-2", title: "NVD entry for CVE-2024-99999",
    llm_extracted_intelligence: { cve_ids: [cve], affected_products: [], affected_sectors: [], affected_ai_layer: [], threat_actors: [], geographic_scope: [], evidence_level: "vendor_confirmed", exploitation_status: "poc_available", attack_novelty: "established", event_type: "vulnerability_disclosure" },
  });

  const { clusters, source_to_event } = clusterSourcesIntoEvents([s1, s2]);

  assert.equal(clusters.length, 1, "Two CVE-matched sources should produce one cluster");
  assert.equal(clusters[0].source_count, 2, "Cluster should have source_count = 2");
  assert.equal(source_to_event.get("src-1"), source_to_event.get("src-2"), "Both sources should map to the same event_id");
});

test("three unrelated sources produce three separate event clusters", () => {
  const sources = [
    makeSource({ id: "s1", title: "Prompt injection in ChatGPT", date_published: NOW }),
    makeSource({ id: "s2", title: "Deepfake voice cloning attack", tags: ["deepfake"], date_published: NOW }),
    makeSource({ id: "s3", title: "ML model extraction technique", tags: ["model_extraction"], date_published: NOW }),
  ];

  const { clusters } = clusterSourcesIntoEvents(sources);
  assert.equal(clusters.length, 3, "Unrelated sources should not cluster together");
});

test("CVE cluster absorbs best exploitation status across sources", () => {
  const cve = "CVE-2024-11111";
  const s1 = makeSource({
    id: "src-a",
    llm_extracted_intelligence: { cve_ids: [cve], affected_products: [], affected_sectors: [], affected_ai_layer: [], threat_actors: [], geographic_scope: [], evidence_level: "theoretical", exploitation_status: "not_exploited", attack_novelty: "established", event_type: "analysis_essay" },
  });
  const s2 = makeSource({
    id: "src-b",
    llm_extracted_intelligence: { cve_ids: [cve], affected_products: [], affected_sectors: [], affected_ai_layer: [], threat_actors: [], geographic_scope: [], evidence_level: "confirmed_exploitation", exploitation_status: "exploited_in_wild", attack_novelty: "established", event_type: "vulnerability_disclosure" },
  });

  const { clusters } = clusterSourcesIntoEvents([s1, s2]);
  assert.equal(clusters[0].exploitation_status, "exploited_in_wild", "Cluster should use best exploitation status");
});

// ── 2. One trend can group multiple events ────────────────────────────────────

console.log("\nTrend clustering");

test("multiple events with shared tags and same category form one trend", () => {
  const base = { threat_category: "llm_threats", tags: ["prompt_injection", "jailbreak"], affected_ai_stack_layers: ["inference_api"], first_seen: DAY_AGO, last_seen: NOW };
  const events = [
    scoreEvent(makeEvent({ ...base, event_id: "evt-a", event_report_score: 40 })),
    scoreEvent(makeEvent({ ...base, event_id: "evt-b", event_report_score: 35 })),
    scoreEvent(makeEvent({ ...base, event_id: "evt-c", event_report_score: 30 })),
  ];

  const { trends } = clusterEventsIntoTrends(events);
  // At least one trend should contain all three events
  const multiEventTrend = trends.find((t) => t.supporting_event_ids.length === 3);
  assert.ok(multiEventTrend, "Three related events should form a single trend with all three in supporting_event_ids");
});

test("trend cluster includes all supporting event IDs in supporting_event_ids", () => {
  const base = { threat_category: "agentic_ai_threats", tags: ["agent_hijacking", "mcp_exploitation"], first_seen: DAY_AGO, last_seen: NOW };
  const events = [
    scoreEvent(makeEvent({ ...base, event_id: "evt-x" })),
    scoreEvent(makeEvent({ ...base, event_id: "evt-y" })),
  ];

  const { trends, event_to_trend } = clusterEventsIntoTrends(events);
  const trendId = event_to_trend.get("evt-x");
  const trend = trends.find((t) => t.trend_id === trendId);

  assert.ok(trend, "Event should be assigned to a trend");
  assert.ok(trend.supporting_event_ids.includes("evt-x"), "Trend should list evt-x in supporting_event_ids");
  assert.ok(trend.supporting_event_ids.includes("evt-y"), "Trend should list evt-y in supporting_event_ids");
});

// ── 3. Trend synthesis receives supporting events, not raw sources ─────────────

console.log("\nTrend synthesis inputs");

test("trend cluster object passed to synthesis contains events array, not raw sources", () => {
  const base = { threat_category: "llm_threats", tags: ["prompt_injection"], first_seen: DAY_AGO, last_seen: NOW };
  const events = [
    scoreEvent(makeEvent({ ...base, event_id: "evt-1", event_title: "Event one" })),
    scoreEvent(makeEvent({ ...base, event_id: "evt-2", event_title: "Event two" })),
  ];

  const { trends } = clusterEventsIntoTrends(events);
  assert.ok(trends.length > 0, "Should produce at least one trend");

  const trend = trends[0];
  assert.ok(Array.isArray(trend.events), "Trend cluster should have an events array for synthesis");
  // Events in the cluster should have event_id and event_title — not raw source fields
  for (const evt of trend.events) {
    assert.ok(evt.event_id, "Each entry in trend.events should be an event (has event_id)");
    assert.equal(typeof evt.event_title, "string", "Each entry in trend.events should have event_title");
    // Confirm these are events, not raw sources: events don't have trust_tier or publisher at top level
    assert.equal(evt.trust_tier, undefined, "trend.events entries should be events, not raw source objects (sources have trust_tier)");
    assert.equal(evt.publisher, undefined, "trend.events entries should be events, not raw source objects (sources have publisher)");
  }
});

test("trend object exposes threat_categories derived from supporting events", () => {
  const events = [
    scoreEvent(makeEvent({ event_id: "e1", threat_category: "llm_threats", tags: ["prompt_injection"], first_seen: DAY_AGO, last_seen: NOW })),
    scoreEvent(makeEvent({ event_id: "e2", threat_category: "llm_threats", tags: ["jailbreak"], first_seen: DAY_AGO, last_seen: NOW })),
  ];

  const { trends } = clusterEventsIntoTrends(events);
  const trend = trends[0];

  assert.ok(trend.threat_categories.includes("llm_threats"), "Trend threat_categories should reflect supporting events' categories");
  assert.ok(trend.supporting_source_count >= 0, "Trend should carry supporting_source_count aggregated from events");
});

// ── 4. Strategic shift structure ──────────────────────────────────────────────

console.log("\nStrategic shift data contract");

test("strategic shift object has required fields: previous_assumption and emerging_reality", () => {
  // Test the data contract that buildMonthlyHorizonScanData expects
  const shift = {
    shift_title:           "Prompt injection now targets agentic pipelines",
    previous_assumption:   "Prompt injection is a stateless chat-interface problem",
    emerging_reality:      "Agentic systems amplify prompt injection blast radius",
    implications_for_defenders: "Implement tool invocation allow-lists",
    confidence_level:      "high",
    maturity_level:        "growing",
    expected_watch_window: "1-3 months",
    singapore_asean_relevance: false,
    why_this_matters:      "Agentic systems now have real-world tool access",
  };

  assert.ok(shift.previous_assumption, "Shift must have previous_assumption");
  assert.ok(shift.emerging_reality, "Shift must have emerging_reality");
  assert.ok(shift.shift_title, "Shift must have shift_title");
  assert.ok(shift.implications_for_defenders, "Shift must have defender implications");
});

test("buildMonthlyHorizonScanData populates executive_summary from strategic shifts, not sources", () => {
  const shift = {
    shift_title:          "LLM supply chain risk increasing",
    previous_assumption:  "Models are vetted before deployment",
    emerging_reality:     "Hugging Face-hosted models carry embedded payloads",
    implications_for_defenders: "Verify model provenance before deployment",
    confidence_level:     "medium",
    maturity_level:       "emerging",
    expected_watch_window: "3-6 months",
    singapore_asean_relevance: false,
    why_this_matters:     "Downstream users inherit compromised model behaviour",
  };

  const data = buildMonthlyHorizonScanData({
    events: [makeEvent()],
    trends: [makeTrend()],
    strategicShifts: [shift],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [makeSource()],
    period: "monthly",
  });

  // Executive summary should be driven by strategic shifts
  assert.ok(Array.isArray(data.executive_summary), "executive_summary should be an array");
  assert.equal(data.executive_summary.length, 1, "One shift should produce one executive summary entry");
  assert.equal(data.executive_summary[0].shift_title, shift.shift_title, "Executive summary entry should come from shift, not source");
  assert.equal(data.executive_summary[0].previous_assumption, shift.previous_assumption);
  assert.equal(data.executive_summary[0].emerging_reality, shift.emerging_reality);
});

// ── 5. Dashboard page data uses event priority score ──────────────────────────

console.log("\nDashboard page data");

test("daily page sorts top_events by event_priority_score, not report score", () => {
  const highPriority = makeEvent({
    event_id: "high-priority",
    event_priority_score: 90,
    event_report_score: 20,   // low report score
    last_seen: NOW,
  });
  const highReport = makeEvent({
    event_id: "high-report",
    event_priority_score: 20,
    event_report_score: 90,   // high report score
    last_seen: NOW,
  });

  const data = generatePeriodPageData({
    period: "daily",
    events: [highReport, highPriority],
    trends: [],
    sources: [],
    generated_at: NOW,
  });

  assert.ok(data.top_events.length > 0, "Daily page should have top events");
  assert.equal(data.top_events[0].event_id, "high-priority", "Daily page must rank by event_priority_score (operational urgency)");
});

test("monthly page sorts top_events by event_report_score, not priority score", () => {
  const highPriority = makeEvent({
    event_id: "high-priority",
    event_priority_score: 90,
    event_report_score: 20,
    last_seen: NOW,
  });
  const highReport = makeEvent({
    event_id: "high-report",
    event_priority_score: 20,
    event_report_score: 90,
    last_seen: NOW,
  });

  const data = generatePeriodPageData({
    period: "monthly",
    events: [highPriority, highReport],
    trends: [],
    sources: [],
    generated_at: NOW,
  });

  assert.equal(data.top_events[0].event_id, "high-report", "Monthly page must rank by event_report_score (strategic value)");
});

// ── 6. Monthly report uses strategic shifts and trends ────────────────────────

console.log("\nMonthly horizon scan report");

test("monthly report one_line_thesis comes from first strategic shift, not sources", () => {
  const shift = {
    shift_title: "Autonomous agents now execute multi-step attacks",
    previous_assumption: "AI tools are passively used by humans",
    emerging_reality: "Agents autonomously chain tools to achieve attack objectives",
    implications_for_defenders: "Deploy agentic boundary controls",
    confidence_level: "high",
    maturity_level: "growing",
  };

  const data = buildMonthlyHorizonScanData({
    events: [],
    trends: [],
    strategicShifts: [shift],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [],
    period: "monthly",
  });

  assert.equal(data.report_metadata.one_line_thesis, shift.shift_title, "Report thesis should be the first shift title");
});

test("monthly report category_sections derive from events and trends, not raw source lists", () => {
  const event = makeEvent({ threat_category: "llm_threats", maturity_level: "emerging", event_report_score: 50 });
  const trend = makeTrend({ threat_categories: ["llm_threats"], trend_score: 60 });

  const data = buildMonthlyHorizonScanData({
    events: [event],
    trends: [trend],
    strategicShifts: [],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [],
    period: "monthly",
  });

  const section = data.category_sections?.llm_threats;
  assert.ok(section, "llm_threats category section should exist");
  assert.equal(section.event_count, 1, "Section event count comes from events, not sources");
  assert.ok(section.top_events[0].event_id, "Section lists events with event_id");
});

// ── 7. Monthly report executive summary is not a raw source dump ──────────────

test("monthly report executive summary does not contain raw source titles", () => {
  const sourceTitle = "Some random blog post title that should not appear";
  const source = makeSource({ title: sourceTitle });

  const shift = {
    shift_title: "AI-generated malware reaching production quality",
    previous_assumption: "AI-generated code is too buggy to be weaponised",
    emerging_reality: "Several real-world samples confirmed in VirusTotal",
    implications_for_defenders: "Update detection heuristics for AI code patterns",
    confidence_level: "medium",
    maturity_level: "operational",
  };

  const data = buildMonthlyHorizonScanData({
    events: [],
    trends: [],
    strategicShifts: [shift],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [source],
    period: "monthly",
  });

  const execTitles = data.executive_summary.map((s) => s.shift_title);
  assert.ok(!execTitles.includes(sourceTitle), "Executive summary must NOT contain raw source titles");
  assert.equal(execTitles[0], shift.shift_title, "Executive summary items are shift titles, not source titles");
});

// ── 8. Weak research signal appears in horizon watch ─────────────────────────

console.log("\nHorizon watch");

test("research-maturity events with low priority still appear in horizon_watch weak_signals", () => {
  const weakResearch = makeEvent({
    event_id: "weak-research",
    maturity_level: "research",
    event_priority_score: 5,  // low priority
    event_report_score: 20,
    last_seen: NOW,
    why_it_matters: "Theoretical technique could emerge within 12 months",
    confidence_level: "low",
  });
  const urgentEvent = makeEvent({
    event_id: "urgent-op",
    maturity_level: "operational",
    event_priority_score: 85,
    event_report_score: 60,
    exploitation_status: "exploited_in_wild",
    last_seen: NOW,
  });

  const data = buildMonthlyHorizonScanData({
    events: [weakResearch, urgentEvent],
    trends: [],
    strategicShifts: [],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [],
    period: "monthly",
  });

  const weakSignalIds = data.horizon_watch.weak_signals.map((s) => s.event_id);
  assert.ok(weakSignalIds.includes("weak-research"), "Research-maturity event should appear in horizon_watch weak_signals regardless of low priority");
  assert.ok(!weakSignalIds.includes("urgent-op"), "Operational exploitation event should not be in weak signals");
});

test("horizon_watch research_to_threat_pipelines includes research or emerging trends", () => {
  const researchTrend = makeTrend({ maturity_level: "research", trend_score: 20, threat_categories: ["llm_threats"] });
  const operationalTrend = makeTrend({ maturity_level: "operational", trend_score: 80, threat_categories: ["ai_enabled_threats"] });

  const data = buildMonthlyHorizonScanData({
    events: [],
    trends: [researchTrend, operationalTrend],
    strategicShifts: [],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: [],
    sources: [],
    period: "monthly",
  });

  const pipelineIds = data.horizon_watch.research_to_threat_pipelines.map((t) => t.trend_id);
  assert.ok(pipelineIds.includes(researchTrend.trend_id), "Research-stage trend should appear in research_to_threat_pipelines");
  assert.ok(!pipelineIds.includes(operationalTrend.trend_id), "Operational trend should not appear in research pipelines");
});

// ── 9. Active exploitation appears high on daily page ─────────────────────────

console.log("\nActive exploitation on daily page");

test("daily page active_exploitation_items lists only exploited_in_wild events", () => {
  const exploited = makeEvent({
    event_id: "exploited",
    exploitation_status: "exploited_in_wild",
    event_priority_score: 80,
    last_seen: NOW,
  });
  const pocOnly = makeEvent({
    event_id: "poc-only",
    exploitation_status: "poc_available",
    event_priority_score: 50,
    last_seen: NOW,
  });
  const clean = makeEvent({
    event_id: "not-exploited",
    exploitation_status: "not_exploited",
    event_priority_score: 20,
    last_seen: NOW,
  });

  const data = generatePeriodPageData({
    period: "daily",
    events: [pocOnly, clean, exploited],
    trends: [],
    sources: [],
    generated_at: NOW,
  });

  const exploitIds = data.active_exploitation_items.map((e) => e.event_id);
  assert.ok(exploitIds.includes("exploited"), "active_exploitation_items must include exploited_in_wild events");
  assert.ok(!exploitIds.includes("poc-only"), "active_exploitation_items must exclude poc_available events");
  assert.ok(!exploitIds.includes("not-exploited"), "active_exploitation_items must exclude not_exploited events");
});

test("exploited_in_wild event ranks above lower-urgency events in daily top_events", () => {
  const exploited = makeEvent({
    event_id: "critical-exploit",
    exploitation_status: "exploited_in_wild",
    event_priority_score: 75,
    event_report_score: 30,
    last_seen: NOW,
  });
  const notExploited = makeEvent({
    event_id: "low-urgency",
    exploitation_status: "not_exploited",
    event_priority_score: 40,
    event_report_score: 70,
    last_seen: NOW,
  });

  const data = generatePeriodPageData({
    period: "daily",
    events: [notExploited, exploited],
    trends: [],
    sources: [],
    generated_at: NOW,
  });

  assert.equal(data.top_events[0].event_id, "critical-exploit", "Active exploitation event should rank above low-urgency event on daily page");
});

// ── 10. Monthly report includes maturity and trajectory matrix ─────────────────

console.log("\nMaturity trajectory matrix");

test("buildMaturityTrajectoryMatrix returns items with required matrix fields", () => {
  const trend = makeTrend({
    trend_title: "Prompt injection escalation in agentic systems",
    maturity_level: "growing",
    trajectory: "accelerating",
    confidence_level: "high",
    watch_window: "1-3 months",
    trend_score: 70,
  });

  const matrix = buildMaturityTrajectoryMatrix([trend], []);
  assert.ok(Array.isArray(matrix), "Matrix should be an array");
  assert.ok(matrix.length > 0, "Matrix should have at least one item from the trend");

  const item = matrix[0];
  assert.ok(item.signal, "Matrix item must have signal (trend title)");
  assert.ok(item.current_maturity, "Matrix item must have current_maturity");
  assert.ok(item.trajectory, "Matrix item must have trajectory");
  assert.ok(item.confidence_level, "Matrix item must have confidence_level");
  assert.ok(item.urgency, "Matrix item must have urgency label");
});

test("monthly report data object includes maturity_trajectory_matrix section", () => {
  const trend = makeTrend({ maturity_level: "operational", trajectory: "accelerating", trend_score: 80 });
  const matrix = buildMaturityTrajectoryMatrix([trend], []);

  const data = buildMonthlyHorizonScanData({
    events: [],
    trends: [trend],
    strategicShifts: [],
    convergencePoints: [],
    defenderImplications: [],
    watchIndicators: [],
    maturityMatrix: matrix,
    sources: [],
    period: "monthly",
  });

  assert.ok(Array.isArray(data.maturity_trajectory_matrix), "Report data must include maturity_trajectory_matrix array");
  assert.equal(data.maturity_trajectory_matrix.length, matrix.length, "Matrix items should pass through unchanged");
});

// ── 11. Convergence layer detects multi-category overlaps ─────────────────────

console.log("\nCross-category convergence");

test("convergence detector fires for prompt-mcp-orchestration when both tag groups present", () => {
  const llmEvent = makeEvent({
    event_id: "llm-pi",
    threat_category: "llm_threats",
    tags: ["prompt_injection"],
    last_seen: NOW,
    first_seen: DAY_AGO,
  });
  const agentEvent = makeEvent({
    event_id: "agent-mcp",
    threat_category: "agentic_ai_threats",
    tags: ["mcp_exploitation"],
    last_seen: NOW,
    first_seen: DAY_AGO,
  });

  const convergence = detectCrossCategoryConvergence([llmEvent, agentEvent], []);

  const pattern = convergence.find((c) => c.pattern_id === "prompt-mcp-orchestration");
  assert.ok(pattern, "prompt-mcp-orchestration should be detected when both LLM and agentic tags are present");
  assert.ok(pattern.involved_categories.includes("llm_threats"), "Convergence point should cite llm_threats");
  assert.ok(pattern.involved_categories.includes("agentic_ai_threats"), "Convergence point should cite agentic_ai_threats");
});

test("convergence detector does not fire when only one category is present", () => {
  const llmOnly = makeEvent({
    event_id: "llm-only",
    threat_category: "llm_threats",
    tags: ["prompt_injection"],
    last_seen: NOW,
    first_seen: DAY_AGO,
  });

  const convergence = detectCrossCategoryConvergence([llmOnly], []);

  const pattern = convergence.find((c) => c.pattern_id === "prompt-mcp-orchestration");
  assert.equal(pattern, undefined, "prompt-mcp-orchestration must NOT fire with only llm_threats events — requires both categories");
});

test("convergence point lists supporting event IDs from both categories", () => {
  const llmEvent  = makeEvent({ event_id: "e-llm",   threat_category: "llm_threats",         tags: ["jailbreak"] });
  const agentEvent = makeEvent({ event_id: "e-agent", threat_category: "agentic_ai_threats",  tags: ["agent_hijacking"] });

  const convergence = detectCrossCategoryConvergence([llmEvent, agentEvent], []);
  const pattern = convergence.find((c) => c.pattern_id === "prompt-mcp-orchestration");

  assert.ok(pattern, "Pattern should be detected");
  assert.ok(pattern.supporting_event_ids.includes("e-llm"),   "Should cite the LLM event");
  assert.ok(pattern.supporting_event_ids.includes("e-agent"), "Should cite the agentic event");
  assert.equal(pattern.supporting_event_count, 2, "supporting_event_count should reflect both events");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
