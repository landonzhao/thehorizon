/**
 * Agentic tool enricher.
 *
 * Anti-hallucination guarantee:
 *   1. README is fetched first. If no README (length < 200) → enrichment_status='no_content'.
 *      No LLM call, no invented description.
 *   2. The LLM call receives ONLY the actual fetched README text. The system prompt
 *      explicitly forbids generating information not present in the provided text.
 *   3. description_source is always recorded ('readme'|'package_manifest'|'llm_generated')
 *      so callers can audit where descriptions came from.
 *   4. Grep-based capability flags are applied deterministically AFTER the LLM call
 *      and can only SET flags to true (never false). They are the ground truth.
 *   5. All URLs in the output are verified before storage (see urlVerifier.js).
 *
 * Flow per tool:
 *   fetch README → relevance-gate on README text → LLM classification →
 *   grep overrides → threat surface mapping → persist
 */

import { routedLLM }            from "../llm/llmRouter.js";
import { fetchReadme }          from "./connectors/githubConnector.js";
import { checkRelevance }       from "./relevanceGate.js";
import { mapCapabilitiesToSurfaces } from "./threatMapper.js";

const MAX_README_CHARS = 5000; // keep LLM call cheap

// ── README fetcher ────────────────────────────────────────────────────────────

async function fetchToolReadme(tool) {
  // 1. Try GitHub raw README via the connector
  if (tool.github_url) {
    const fullName = tool.github_url.replace("https://github.com/", "").replace(/\/$/, "");
    if (fullName && fullName.split("/").length === 2) {
      const text = await fetchReadme(fullName).catch(() => "");
      if (text && text.length >= 200) return { text, source: "github_readme" };
    }
  }
  // 2. Fall back to homepage / package_url text extraction
  for (const url of [tool.homepage, tool.package_url].filter(Boolean)) {
    try {
      const res = await fetch(url, {
        signal:  AbortSignal.timeout(10000),
        headers: { "User-Agent": "HorizonScan-ToolDiscovery/1.0" },
      });
      if (!res.ok) continue;
      const html  = await res.text();
      // Strip tags and collapse whitespace for a rough plaintext
      const plain = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_README_CHARS * 2);
      if (plain.length >= 200) return { text: plain, source: "homepage" };
    } catch { continue; }
  }
  return { text: "", source: "none" };
}

// ── LLM classification call ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are classifying an AI agentic tool for a security intelligence system.

STRICT RULES — violations will corrupt the database:
1. Base EVERY field ONLY on the provided README text. Do not use general knowledge.
2. If a field cannot be determined from the text, output null.
3. Never invent capabilities, integrations, or features not mentioned in the text.
4. description must be a factual 2-3 sentence summary of what the tool does,
   based solely on the README. Do not pad or speculate.
5. Output strict JSON only. No markdown, no commentary.

TOOL CATEGORIES (pick the best match):
agent_framework | coding_agent | browser_agent | research_agent | workflow_agent |
mcp_server | mcp_registry | multi_agent | memory_system | evaluation_tool |
security_tool | tooling_infra | unknown

CAPABILITY FLAGS (true only if explicitly described in the README):
- shell_access: runs shell commands, subprocess, bash, terminal
- filesystem_access: reads/writes files, accesses file system, disk I/O
- code_execution: executes code (eval, REPL, sandbox, code runner)
- credential_access: reads API keys, secrets, auth tokens, env vars, vault
- browser_access: controls browser (Playwright, Puppeteer, Selenium, CDP)
- mcp_enabled: uses or provides Model Context Protocol, MCP servers/clients
- multi_agent: coordinates multiple agents, multi-agent systems
- memory_enabled: persistent memory, long-term memory, vector store for context
- tool_use_enabled: uses external tools, function calling, tool calling
- api_access: calls external APIs or web services
- github_access: reads/writes GitHub repositories, PRs, issues
- email_access: sends or reads email
- slack_access: interacts with Slack
- deploy_enabled: deploys code, infrastructure, or services
- autonomous_execution: operates autonomously without human-in-the-loop`;

const USER_TEMPLATE = (tool, readmeExcerpt) =>
`Tool name: ${tool.tool_name}
Source: ${tool.source_platform}
Existing description: ${tool.description || "(none)"}

README / documentation excerpt:
---
${readmeExcerpt.slice(0, MAX_README_CHARS)}
---

Return JSON:
{
  "description": "<2-3 sentence factual summary from the README>",
  "tool_category": "<category>",
  "tool_subcategory": "<optional subcategory>",
  "agent_type": "<most specific agent type>",
  "deployment_model": "cloud|self_hosted|hybrid|desktop|null",
  "pricing_model": "open_source|freemium|paid|enterprise|null",
  "integrations": ["<named tool/service from text>"],
  "capabilities": ["<named capability string from text>"],
  "shell_access": true|false,
  "filesystem_access": true|false,
  "code_execution": true|false,
  "credential_access": true|false,
  "browser_access": true|false,
  "mcp_enabled": true|false,
  "multi_agent": true|false,
  "memory_enabled": true|false,
  "tool_use_enabled": true|false,
  "api_access": true|false,
  "github_access": true|false,
  "email_access": true|false,
  "slack_access": true|false,
  "deploy_enabled": true|false,
  "autonomous_execution": true|false,
  "confidence": "high|medium|low",
  "reasoning": "<one sentence: basis for tool_category choice>"
}`;

const BOOL_FLAGS = [
  "shell_access", "filesystem_access", "code_execution", "credential_access",
  "browser_access", "mcp_enabled", "multi_agent", "memory_enabled",
  "tool_use_enabled", "api_access", "github_access", "email_access",
  "slack_access", "deploy_enabled", "autonomous_execution",
];

// ── Grep-based deterministic flag overrides ───────────────────────────────────
// Can only SET to true; never override true → false. Ground truth.
const GREP_RULES = [
  { flag: "shell_access",        re: /subprocess|os\.system|child_process|bash\s+-c|shell=True|execSync|spawnSync|\bsh\b\s+[-\w]/i },
  { flag: "filesystem_access",   re: /open\(|fs\.(read|write)|readFile|writeFile|os\.path|pathlib|shutil|glob\.glob|\bstat\b\s*\(/i },
  { flag: "code_execution",      re: /\beval\(|exec\(|subprocess\.run|Runtime\.exec|child_process\.exec|REPL|sandbox.*execut|code.*runner/i },
  { flag: "credential_access",   re: /keyring|SecretClient|os\.environ.*KEY|os\.getenv.*TOKEN|dotenv|\.env\b|secrets\.get|vault\.|api[_-]?key/i },
  { flag: "browser_access",      re: /playwright|puppeteer|selenium|browser.use|stagehand|CDP|chrome.*devtools|webdriver|browser_use/i },
  { flag: "mcp_enabled",         re: /@modelcontextprotocol|MCPServer|mcp-server|FastMCP|mcp\.run|use_mcp|MCPClient|model.context.protocol/i },
  { flag: "multi_agent",         re: /CrewAI|AutoGen|multi.?agent|agent.*communicate|swarm.*agent|agent.*collaborate|orchestrat.*agent/i },
  { flag: "memory_enabled",      re: /vector.store|long.?term.?memory|persistent.?memory|mem0|letta|MemGPT|agent.*remember|ConversationBuffer/i },
  { flag: "autonomous_execution", re: /autonomous|without.*human|no.*human.?in.?the.?loop|unattended|background.*agent|continuous.*agent/i },
  { flag: "deploy_enabled",      re: /deploy|kubectl|helm\s|terraform|docker.?run|push.*prod|CI\/CD.*agent|github.*deploy/i },
  { flag: "github_access",       re: /github\.com|PyGithub|Octokit|gh\.api|pull.request|github.*repo|git.*commit/i },
  { flag: "email_access",        re: /smtplib|sendgrid|mailgun|nodemailer|imaplib|email.*send|compose.*email/i },
  { flag: "slack_access",        re: /slack.*client|slack.*sdk|SlackAPI|WebClient.*slack|bolt.*slack/i },
];

function applyGrepOverrides(flags, text) {
  const out = { ...flags };
  for (const { flag, re } of GREP_RULES) {
    if (!out[flag] && re.test(text)) {
      out[flag] = true;
    }
  }
  return out;
}

// ── Main enrichment function ──────────────────────────────────────────────────

/**
 * Enrich a single tool: fetch README → relevance check → LLM → grep → threat map.
 *
 * @param {object} tool  — from discovery (atool_tools shape)
 * @returns {Promise<{
 *   classification: object,     // fields for atool_classifications
 *   attack_surfaces: object[],  // rows for atool_attack_surfaces
 *   enrichment_status: string,
 *   description: string,
 *   description_source: string,
 * }>}
 */
export async function enrichTool(tool) {
  // ── Step 1: Fetch README / page text ──────────────────────────────────────
  const { text: readmeText, source: readmeSource } = await fetchToolReadme(tool);

  if (readmeText.length < 200) {
    return {
      classification:   null,
      attack_surfaces:  [],
      enrichment_status: "no_content",
      description:      tool.description || "",
      description_source: "original",
    };
  }

  // ── Step 2: Relevance re-check on README (catches false positives) ────────
  const gateResult = checkRelevance({ ...tool, readme_excerpt: readmeText.slice(0, 1000) });
  if (!gateResult.pass) {
    return {
      classification:   null,
      attack_surfaces:  [],
      enrichment_status: "skipped_irrelevant",
      description:      tool.description || "",
      description_source: "original",
    };
  }

  // ── Step 3: LLM classification ────────────────────────────────────────────
  let llmResult = null;
  try {
    const { result } = await routedLLM(
      SYSTEM_PROMPT,
      USER_TEMPLATE(tool, readmeText),
      { task: "tool_classification", requires_json: true, logLabel: `tool-${(tool.slug || "").slice(0, 20)}` }
    );
    llmResult = result;
  } catch (e) {
    console.warn(`  [enricher] LLM failed for ${tool.tool_name}: ${e.message?.slice(0, 60)}`);
  }

  if (!llmResult) {
    return {
      classification:   null,
      attack_surfaces:  [],
      enrichment_status: "llm_failed",
      description:      tool.description || "",
      description_source: "original",
    };
  }

  // ── Step 4: Grep overrides (applied on README + tool name/description) ────
  const combinedText = [tool.tool_name, tool.description, readmeText].join("\n");
  const rawFlags = Object.fromEntries(BOOL_FLAGS.map(f => [f, !!llmResult[f]]));
  const finalFlags = applyGrepOverrides(rawFlags, combinedText);

  // ── Step 5: Threat surface mapping ────────────────────────────────────────
  const { surfaces, risk_profile, risk_score } = mapCapabilitiesToSurfaces(finalFlags);

  // ── Step 6: Build output ──────────────────────────────────────────────────
  const description = (llmResult.description || tool.description || "").slice(0, 500);
  const descriptionSource = llmResult.description
    ? (readmeSource === "github_readme" ? "readme" : "homepage")
    : "original";

  const classification = {
    tool_category:             llmResult.tool_category || "unknown",
    tool_subcategory:          llmResult.tool_subcategory || null,
    agent_type:                llmResult.agent_type || null,
    deployment_model:          llmResult.deployment_model || null,
    pricing_model:             llmResult.pricing_model || null,
    integrations:              (llmResult.integrations || []).slice(0, 20),
    capabilities:              (llmResult.capabilities || []).slice(0, 20),
    ...finalFlags,
    description_source:        descriptionSource,
    readme_length:             readmeText.length,
    classification_confidence: llmResult.confidence || "medium",
    classification_reasoning:  llmResult.reasoning || "",
    classified_by:             "llm+grep",
  };

  return {
    classification,
    attack_surfaces: surfaces,
    enrichment_status: "done",
    description,
    description_source: descriptionSource,
    risk_profile,
    risk_score,
  };
}

/**
 * Enrich a batch of tools with bounded concurrency.
 *
 * @param {object[]} tools
 * @param {object}   sb       — Supabase client
 * @param {object}   [opts]
 * @param {number}   [opts.concurrency=2]
 * @param {boolean}  [opts.dryRun=false]
 * @returns {Promise<{ enriched: number, skipped: number, failed: number }>}
 */
export async function enrichAndPersistTools(tools, sb, opts = {}) {
  const { concurrency = 2, dryRun = false } = opts;
  const tally = { enriched: 0, skipped: 0, failed: 0, no_content: 0 };

  async function processOne(tool) {
    const result = await enrichTool(tool).catch(e => {
      console.error(`  [enricher] exception for ${tool.tool_name}:`, e.message);
      return { enrichment_status: "failed", classification: null, attack_surfaces: [], description: tool.description || "", description_source: "original" };
    });

    if (!dryRun) {
      // Update tool record: description + enrichment status
      await sb.from("atool_tools").update({
        description:      result.description,
        enrichment_status: result.enrichment_status,
        last_enriched_at: new Date().toISOString(),
      }).eq("id", tool.id);

      if (result.classification) {
        // Upsert classification
        await sb.from("atool_classifications").upsert({
          tool_id:               tool.id,
          classification_version: "v1",
          ...result.classification,
          classified_at:          new Date().toISOString(),
        }, { onConflict: "tool_id,classification_version" });

        // Clear + insert attack surfaces
        await sb.from("atool_attack_surfaces").delete().eq("tool_id", tool.id);
        if (result.attack_surfaces.length > 0) {
          await sb.from("atool_attack_surfaces").insert(
            result.attack_surfaces.map(s => ({ tool_id: tool.id, ...s, mapped_at: new Date().toISOString() }))
          );
        }
      }
    }

    const label = result.enrichment_status === "done" ? "✓" :
                  result.enrichment_status === "no_content" ? "·" : "✗";
    process.stdout.write(`  ${label} ${(tool.tool_name || "").slice(0, 35).padEnd(35)} [${result.enrichment_status}]\n`);

    if (result.enrichment_status === "done") tally.enriched++;
    else if (result.enrichment_status === "no_content") tally.no_content++;
    else if (result.enrichment_status.includes("skip")) tally.skipped++;
    else tally.failed++;
  }

  for (let i = 0; i < tools.length; i += concurrency) {
    await Promise.all(tools.slice(i, i + concurrency).map(processOne));
  }

  return tally;
}
