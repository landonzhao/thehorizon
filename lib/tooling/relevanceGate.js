/**
 * Relevance gate for the agentic tooling pipeline.
 *
 * Deterministic, zero-LLM-cost filter. A tool must pass this gate before
 * any README fetch or LLM call occurs. Two failure modes are handled:
 *   - IRRELEVANT: no agentic AI signal → discard immediately
 *   - SECURITY_ADJACENT: agentic signal present AND security signal → highest priority
 *
 * The gate operates on combined text: tool_name + description + topics.
 * Word-boundary matching avoids false positives ("retailer" ≠ "AI", etc).
 */

// ── Agentic AI signal terms ───────────────────────────────────────────────────
// A tool must match at least one TIER_1 term OR two TIER_2 terms.
const TIER_1 = [
  // Core agentic concepts
  "ai agent", "ai-agent", "llm agent", "llm-agent", "agentic",
  "autonomous agent", "coding agent", "browser agent", "research agent",
  "multi-agent", "multiagent",
  // MCP ecosystem
  "mcp server", "mcp-server", "model context protocol", "mcp tool",
  "mcp client", "fastmcp", "@modelcontextprotocol",
  // Agent frameworks / orchestration
  "langchain", "langgraph", "crewai", "autogen", "openagent",
  "agent framework", "agent orchestrat", "tool use", "tool-use",
  // Coding agents
  "opendevin", "openhands", "claude code", "cursor agent", "devin",
  // Browser agents
  "browser use", "browser-use", "stagehand", "playwright agent",
  "web agent", "computer use",
  // Memory / RAG as agent infra
  "agent memory", "long-term memory", "mem0", "letta", "memgpt",
];

const TIER_2 = [
  "autonomous", "autonomous execution", "agent", "chatbot",
  "llm", "gpt", "gemini", "claude", "language model",
  "workflow automation", "orchestration", "pipeline",
  "tool calling", "function calling", "plugin", "integration",
  "assistant", "copilot", "chatgpt",
];

// Security-relevance booster — if any of these appear alongside an agentic
// signal, the tool is flagged as security_adjacent (highest priority for enrichment).
const SECURITY_SIGNALS = [
  "security", "vulnerability", "exploit", "attack", "threat", "red team",
  "penetration", "pentest", "audit", "malware", "phishing", "injection",
  "sandbox", "guardrail", "alignment", "safety", "jailbreak", "bypass",
  "privilege", "escalation", "credential", "access control",
];

// Hard exclusions: definitely not relevant even if keywords match
const EXCLUSIONS = [
  // Generic AI that is emphatically NOT agentic tooling
  "image generation", "text to image", "stable diffusion", "diffusion model",
  "image classifier", "object detection", "speech recognition",
  "recommendation system", "data science notebook",
  // Package managers / infra that happen to mention "agent" in other contexts
  "monitoring agent", "log agent", "metrics agent", "APM agent",
  "cloud agent", "deployment agent", "build agent",
];

function toText(tool) {
  return [
    tool.tool_name || "",
    tool.description || "",
    (tool.topics || []).join(" "),
    tool.readme_excerpt || "",
  ].join(" ").toLowerCase();
}

function wordBoundaryMatch(text, terms) {
  return terms.filter(t => {
    const escaped = t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    return new RegExp(`(?:^|[\\s/._-])${escaped}(?:[\\s/._-]|$)`).test(text);
  });
}

/**
 * @param {object} tool  — { tool_name, description, topics[], readme_excerpt? }
 * @returns {{ pass: boolean, reason: string, priority: string, matched_signals: string[] }}
 */
export function checkRelevance(tool) {
  const text = toText(tool);

  // Hard exclusions first
  for (const ex of EXCLUSIONS) {
    if (text.includes(ex)) {
      return { pass: false, reason: `excluded_term: ${ex}`, priority: "none", matched_signals: [] };
    }
  }

  const tier1Matches = wordBoundaryMatch(text, TIER_1);
  const tier2Matches = wordBoundaryMatch(text, TIER_2);
  const secMatches   = wordBoundaryMatch(text, SECURITY_SIGNALS);

  const agenticSignal = tier1Matches.length >= 1 || tier2Matches.length >= 2;

  if (!agenticSignal) {
    return {
      pass: false,
      reason: `no_agentic_signal (tier1=${tier1Matches.length} tier2=${tier2Matches.length})`,
      priority: "none",
      matched_signals: [],
    };
  }

  const priority   = secMatches.length > 0 ? "security_adjacent" : "standard";
  const allMatches = [...new Set([...tier1Matches, ...tier2Matches, ...secMatches])];

  return {
    pass: true,
    reason: `agentic_signal (t1=${tier1Matches.length} t2=${tier2Matches.length} sec=${secMatches.length})`,
    priority,
    matched_signals: allMatches.slice(0, 8),
  };
}

/**
 * Filter a list of tools, returning only those that pass the gate.
 * Also annotates each tool with gate metadata.
 *
 * @param {object[]} tools
 * @returns {{ passed: object[], rejected: object[] }}
 */
export function filterByRelevance(tools) {
  const passed = [], rejected = [];
  for (const t of tools) {
    const result = checkRelevance(t);
    if (result.pass) {
      passed.push({ ...t, _gate: result });
    } else {
      rejected.push({ ...t, _gate: result });
    }
  }
  return { passed, rejected };
}
