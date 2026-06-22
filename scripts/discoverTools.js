#!/usr/bin/env node
/**
 * discoverTools.js — Run all discovery connectors and persist new tools.
 *
 * Runs connectors in tier order (Tier 1 structured registries → Tier 2
 * if enabled). Each tool passes through:
 *   1. Relevance gate (deterministic, no LLM) — skip irrelevant tools
 *   2. Dedup against existing DB records (by github_url and slug)
 *   3. URL verification (homepage only; registry URLs are trusted)
 *   4. Persist to atool_tools + initial atool_metrics snapshot
 *
 * Enrichment (README fetch + LLM) is a separate step — see enrichTools.js.
 *
 * Usage:
 *   node scripts/discoverTools.js --dry-run
 *   node scripts/discoverTools.js --connectors github,mcp
 *   node scripts/discoverTools.js --stars-min 10
 */

import "dotenv/config";
import { createClient }   from "@supabase/supabase-js";
import { createHash }     from "crypto";
import { filterByRelevance } from "../lib/tooling/relevanceGate.js";
import { verifyUrl }      from "../lib/tooling/urlVerifier.js";

const args    = process.argv.slice(2);
const getArg  = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const hasFlag = (f) => args.includes(f);
const DRY       = hasFlag("--dry-run");
const STARS_MIN = parseInt(getArg("--stars-min", "3"), 10);
const CONN_ARG  = getArg("--connectors", "all");
const ENABLED   = new Set(CONN_ARG === "all"
  ? ["github", "mcp", "pypi", "npm", "huggingface", "docker", "vscode"]
  : CONN_ARG.split(",").map(s => s.trim()));

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function makeSlug(tool) {
  return (tool.slug || tool.tool_name || "")
    .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function makeId(url) {
  return createHash("sha256").update(url).digest("hex").slice(0, 36);
}

console.log("════════════════════════════════════════════════════════════");
console.log("  Agentic Tool Discovery" + (DRY ? "  [DRY RUN]" : ""));
console.log(`  Connectors: ${[...ENABLED].join(", ")}   Stars min: ${STARS_MIN}`);
console.log("════════════════════════════════════════════════════════════\n");

// ── Load all existing slugs and github_urls for dedup ─────────────────────────
console.log("Loading existing tools for dedup...");
const { data: existing } = await sb.from("atool_tools").select("slug,github_url,id");
const existingSlugs  = new Set((existing || []).map(t => t.slug));
const existingGhUrls = new Set((existing || []).map(t => t.github_url).filter(Boolean));
console.log(`  ${existing?.length || 0} tools already in DB\n`);

// ── Run connectors ────────────────────────────────────────────────────────────
const allRaw = [];

if (ENABLED.has("github")) {
  const { discoverFromGithub } = await import("../lib/tooling/connectors/githubConnector.js");
  allRaw.push(...await discoverFromGithub({ starsMin: STARS_MIN, verifyUrls: false }));
}
if (ENABLED.has("mcp")) {
  const { discoverFromMcpRegistries } = await import("../lib/tooling/connectors/mcpRegistryConnector.js");
  allRaw.push(...await discoverFromMcpRegistries({ verifyUrls: true }));
}
if (ENABLED.has("pypi")) {
  const { discoverFromPypi } = await import("../lib/tooling/connectors/pypiConnector.js");
  allRaw.push(...await discoverFromPypi());
}
if (ENABLED.has("npm")) {
  const { discoverFromNpm } = await import("../lib/tooling/connectors/npmConnector.js");
  allRaw.push(...await discoverFromNpm());
}
if (ENABLED.has("huggingface")) {
  const { discoverFromHuggingFace } = await import("../lib/tooling/connectors/huggingfaceConnector.js");
  allRaw.push(...await discoverFromHuggingFace());
}
if (ENABLED.has("docker")) {
  const { discoverFromDocker } = await import("../lib/tooling/connectors/dockerConnector.js");
  allRaw.push(...await discoverFromDocker());
}
if (ENABLED.has("vscode")) {
  const { discoverFromVscode } = await import("../lib/tooling/connectors/vscodeConnector.js");
  allRaw.push(...await discoverFromVscode());
}

console.log(`\nTotal raw candidates: ${allRaw.length}`);

// ── Relevance gate ────────────────────────────────────────────────────────────
const { passed: relevant, rejected: irrelevant } = filterByRelevance(allRaw);
console.log(`Relevance gate: ${relevant.length} pass / ${irrelevant.length} fail`);

// ── Dedup against DB ──────────────────────────────────────────────────────────
const fresh = [];
const deduped = new Set();
for (const t of relevant) {
  const slug = makeSlug(t);
  const ghUrl = t.github_url;
  if (deduped.has(slug)) continue;
  if (existingSlugs.has(slug)) continue;
  if (ghUrl && existingGhUrls.has(ghUrl)) continue;
  deduped.add(slug);
  fresh.push({ ...t, slug });
}
console.log(`After dedup: ${fresh.length} new tools\n`);

// ── Verify homepage URLs (for tools that have one) ────────────────────────────
const toVerify = fresh.filter(t => t.homepage && !t.url_verified);
if (toVerify.length > 0) {
  console.log(`Verifying ${toVerify.length} homepage URLs...`);
  for (const t of toVerify) {
    const { ok, status, finalUrl } = await verifyUrl(t.homepage).catch(() => ({ ok: false, status: null, finalUrl: t.homepage }));
    t.url_verified = ok;
    t.url_status   = status;
    if (!ok) t.homepage = null;
    else if (finalUrl !== t.homepage) t.homepage = finalUrl;
  }
}

// ── Persist ───────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
let saved = 0, errors = 0;

for (const t of fresh) {
  const row = {
    tool_name:       (t.tool_name || "").slice(0, 200),
    slug:            t.slug,
    description:     (t.description || "").slice(0, 500),
    homepage:        t.homepage || null,
    github_url:      t.github_url || null,
    package_url:     t.package_url || null,
    documentation_url: t.documentation_url || null,
    source_platform: t.source_platform,
    publisher:       (t.publisher || "").slice(0, 200) || null,
    license:         t.license || null,
    open_source:     t.open_source !== false,
    url_verified:    t.url_verified || false,
    url_status:      t.url_status || null,
    enrichment_status: "pending",
    first_seen_at:   new Date().toISOString(),
  };

  const metricsRow = {
    snapshot_date:    TODAY,
    stars:            t.stars || 0,
    forks:            t.forks || 0,
    downloads_total:  null,
    downloads_recent: null,
    open_issues:      t.open_issues || null,
    raw_metadata:     t.raw_metadata || null,
  };

  if (!DRY) {
    const { data, error } = await sb.from("atool_tools").insert(row).select("id").single();
    if (error) {
      if (!error.message.includes("duplicate")) {
        console.error(`  ! save failed: ${t.tool_name} → ${error.message.slice(0, 60)}`);
        errors++;
      }
      continue;
    }
    await sb.from("atool_metrics").insert({ tool_id: data.id, ...metricsRow }).catch(() => {});
    saved++;
  } else {
    saved++;
  }

  const prio = t._gate?.priority === "security_adjacent" ? "⚡" : " ";
  process.stdout.write(`  ${prio} ${(t.tool_name || "").slice(0, 40).padEnd(40)} [${t.source_platform}] ⭐${t.stars || 0}\n`);
}

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  Raw candidates:  ${allRaw.length}`);
console.log(`  Passed gate:     ${relevant.length}`);
console.log(`  New (after dedup): ${fresh.length}`);
console.log(`  ${DRY ? "Would save" : "Saved"}:          ${saved}  errors: ${errors}`);
if (DRY) console.log("  [DRY RUN — nothing written]");
console.log(`\n  Next: node scripts/enrichTools.js`);
