#!/usr/bin/env node
/**
 * buildToolSnapshot.js — Weekly aggregate snapshot for trend tracking.
 *
 * Reads atool_classifications to count capability flags, category distribution,
 * and finds fastest-growing tools (by star delta vs previous week's metrics).
 * Writes one row to atool_snapshots per run. Fully deterministic — no LLM.
 *
 * Also emits signals when surge thresholds are crossed (capability growth,
 * new high-risk tools) — these feed into the horizon-scan synthesis context.
 *
 * Usage:
 *   node scripts/buildToolSnapshot.js
 *   node scripts/buildToolSnapshot.js --dry-run
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const args  = process.argv.slice(2);
const DRY   = args.includes("--dry-run");
const sb    = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TODAY = new Date();
const WEEK  = new Date(TODAY);
WEEK.setDate(WEEK.getDate() - WEEK.getDay() + 1); // Monday
const WEEK_STR = WEEK.toISOString().slice(0, 10);

console.log(`Building tool snapshot for week of ${WEEK_STR}${DRY ? " [DRY RUN]" : ""}...`);

// ── Load all enriched tools + classifications ─────────────────────────────────
const { data: tools } = await sb.from("atool_tools").select("id,source_platform,first_seen_at");
const { data: classes } = await sb.from("atool_classifications").select("*");
const { data: metrics }  = await sb.from("atool_metrics")
  .select("tool_id,stars,snapshot_date")
  .order("snapshot_date", { ascending: false });

const total = tools?.length || 0;
const enriched = classes?.length || 0;

// Tools added this week
const weekStart = WEEK.toISOString();
const newThisWeek = (tools || []).filter(t => t.first_seen_at >= weekStart).length;

// Capability flag counts (from classifications)
const capCounts = {
  mcp_enabled_count: 0, shell_access_count: 0, browser_access_count: 0,
  filesystem_access_count: 0, code_execution_count: 0, credential_access_count: 0,
  autonomous_exec_count: 0, multi_agent_count: 0, deploy_enabled_count: 0,
};
const byCategory = {};
const byPlatform = {};

for (const c of (classes || [])) {
  if (c.mcp_enabled)                 capCounts.mcp_enabled_count++;
  if (c.shell_access)                capCounts.shell_access_count++;
  if (c.browser_access)              capCounts.browser_access_count++;
  if (c.filesystem_access)           capCounts.filesystem_access_count++;
  if (c.code_execution)              capCounts.code_execution_count++;
  if (c.credential_access)           capCounts.credential_access_count++;
  if (c.autonomous_execution)        capCounts.autonomous_exec_count++;
  if (c.multi_agent)                 capCounts.multi_agent_count++;
  if (c.deploy_enabled)              capCounts.deploy_enabled_count++;
  if (c.tool_category) byCategory[c.tool_category] = (byCategory[c.tool_category] || 0) + 1;
}
for (const t of (tools || [])) {
  byPlatform[t.source_platform] = (byPlatform[t.source_platform] || 0) + 1;
}

// Fastest growing: compute star delta per tool (latest vs 7 days ago)
const latestMetrics = new Map();
const prevMetrics   = new Map();
const cutoff = new Date(TODAY.getTime() - 7 * 86400000).toISOString().slice(0, 10);
for (const m of (metrics || [])) {
  if (!latestMetrics.has(m.tool_id)) latestMetrics.set(m.tool_id, m);
  if (m.snapshot_date <= cutoff && !prevMetrics.has(m.tool_id)) prevMetrics.set(m.tool_id, m);
}
const growthList = [];
for (const [toolId, latest] of latestMetrics) {
  const prev = prevMetrics.get(toolId);
  if (prev && latest.stars != null && prev.stars != null) {
    growthList.push({ tool_id: toolId, stars: latest.stars, delta: latest.stars - prev.stars });
  }
}
growthList.sort((a, b) => b.delta - a.delta);
const fastestGrowing = growthList.slice(0, 10).map(g => ({
  tool_id: g.tool_id,
  stars: g.stars,
  delta_7d: g.delta,
}));

// New high-risk tools this week (≥3 high-risk capability flags)
const HIGH_RISK_FLAGS = ["shell_access", "code_execution", "credential_access", "browser_access", "autonomous_execution", "deploy_enabled"];
const newHighRisk = (classes || [])
  .filter(c => HIGH_RISK_FLAGS.filter(f => c[f]).length >= 3)
  .map(c => ({ tool_id: c.tool_id, flags: HIGH_RISK_FLAGS.filter(f => c[f]) }))
  .slice(0, 20);

// ── Previous snapshot for surge detection ─────────────────────────────────────
const { data: prevSnap } = await sb.from("atool_snapshots")
  .select("*")
  .order("snapshot_week", { ascending: false })
  .limit(1);
const prev = prevSnap?.[0];

const signals = [];
if (prev) {
  const surgeCheck = (label, field, cur) => {
    const p = prev[field] || 0;
    if (p >= 5 && cur >= p * 1.5) {
      signals.push({ type: "capability_surge", metric: field, before: p, after: cur, growth_pct: Math.round((cur - p) / p * 100) });
      console.log(`  ⚡ SURGE: ${label} grew ${p}→${cur} (+${Math.round((cur-p)/p*100)}% week-over-week)`);
    }
  };
  surgeCheck("MCP-enabled",          "mcp_enabled_count",       capCounts.mcp_enabled_count);
  surgeCheck("Shell-access",         "shell_access_count",      capCounts.shell_access_count);
  surgeCheck("Browser-access",       "browser_access_count",    capCounts.browser_access_count);
  surgeCheck("Autonomous-execution", "autonomous_exec_count",   capCounts.autonomous_exec_count);
  surgeCheck("Credential-access",    "credential_access_count", capCounts.credential_access_count);
}

const row = {
  snapshot_week:      WEEK_STR,
  total_tools:        total,
  new_tools_this_week: newThisWeek,
  enriched_tools:     enriched,
  ...capCounts,
  by_category:        byCategory,
  by_platform:        byPlatform,
  fastest_growing:    fastestGrowing,
  new_high_risk_tools: newHighRisk,
};

console.log(`\nSnapshot: ${total} tools (${newThisWeek} new) | ${enriched} enriched`);
console.log(`Capabilities: MCP=${capCounts.mcp_enabled_count} shell=${capCounts.shell_access_count} browser=${capCounts.browser_access_count} cred=${capCounts.credential_access_count} auto=${capCounts.autonomous_exec_count}`);
console.log("Top categories:", Object.entries(byCategory).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}:${v}`).join(" "));

if (!DRY) {
  const { error } = await sb.from("atool_snapshots")
    .upsert(row, { onConflict: "snapshot_week" });
  if (error) console.error("snapshot save failed:", error.message);
  else console.log(`\n✓ Snapshot saved for ${WEEK_STR}`);
  if (signals.length > 0) console.log(`  ${signals.length} surge signal(s) emitted`);
} else {
  console.log("\n[DRY RUN — snapshot not saved]");
}
