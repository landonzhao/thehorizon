/**
 * Deterministic capability-flag → attack-surface mapping.
 *
 * Takes a set of boolean capability flags from atool_classifications and
 * produces a list of attack surfaces with risk levels and horizon taxonomy
 * tags. No LLM — fully rule-based so output is auditable and consistent.
 *
 * Used by the enricher after capability extraction and by buildToolSnapshot.js
 * for trend signals.
 */

// ── Mapping table ─────────────────────────────────────────────────────────────
// Each entry: { flag, surface, threat_vector, risk, notes }
export const SURFACE_RULES = [
  {
    flag:          "shell_access",
    surface:       "shell_access",
    threat_vector: "ASI05_unexpected_code_execution",
    risk:          "high",
    notes:         "Agent can execute arbitrary shell commands. Direct path to host compromise, privilege escalation, and lateral movement.",
  },
  {
    flag:          "filesystem_access",
    surface:       "filesystem_access",
    threat_vector: "ASI05_unexpected_code_execution",
    risk:          "high",
    notes:         "Agent can read/write arbitrary files. Enables data exfiltration, config poisoning, and supply-chain attacks on local files.",
  },
  {
    flag:          "code_execution",
    surface:       "code_execution",
    threat_vector: "ASI05_unexpected_code_execution",
    risk:          "high",
    notes:         "Agent executes dynamically generated code (eval, subprocess, REPL). Primary vector for sandbox escape and malware deployment.",
  },
  {
    flag:          "credential_access",
    surface:       "credential_access",
    threat_vector: "ASI03_identity_privilege_abuse",
    risk:          "high",
    notes:         "Agent reads API keys, secrets, or credentials from environment or vault. Enables identity abuse and lateral movement.",
  },
  {
    flag:          "browser_access",
    surface:       "browser_control",
    threat_vector: "ASI02_tool_misuse_exploitation",
    risk:          "high",
    notes:         "Agent controls a real browser session. Enables session hijacking, CSRF, web-based data exfiltration, and phishing amplification.",
  },
  {
    flag:          "mcp_enabled",
    surface:       "mcp_integration",
    threat_vector: "ASI04_agentic_supply_chain_vulnerabilities",
    risk:          "high",
    notes:         "Agent connects to MCP servers. Supply-chain risk: a malicious MCP server can redirect agent actions, exfiltrate data, or poison tool outputs.",
  },
  {
    flag:          "autonomous_execution",
    surface:       "autonomous_action",
    threat_vector: "ASI01_agent_goal_hijack",
    risk:          "high",
    notes:         "Agent operates without human-in-the-loop confirmation. Goal hijacking or prompt injection can cause uncontrolled real-world actions.",
  },
  {
    flag:          "deploy_enabled",
    surface:       "deployment_automation",
    threat_vector: "ASI05_unexpected_code_execution",
    risk:          "high",
    notes:         "Agent can deploy code or infrastructure. A compromised agent can push malicious builds or modify production systems.",
  },
  {
    flag:          "multi_agent",
    surface:       "multi_agent_coordination",
    threat_vector: "ASI01_agent_goal_hijack",
    risk:          "medium",
    notes:         "Agents coordinate with other agents. Prompt injection in one agent propagates trust and actions to the whole network.",
  },
  {
    flag:          "memory_enabled",
    surface:       "memory_persistence",
    threat_vector: "ASI06_memory_context_poisoning",
    risk:          "medium",
    notes:         "Agent maintains persistent memory across sessions. Memory poisoning can alter long-term agent behaviour silently.",
  },
  {
    flag:          "api_access",
    surface:       "external_api_calls",
    threat_vector: "ASI02_tool_misuse_exploitation",
    risk:          "medium",
    notes:         "Agent calls external APIs autonomously. SSRF, data exfiltration via third-party services, and unintended API actions.",
  },
  {
    flag:          "github_access",
    surface:       "code_repository_access",
    threat_vector: "ASI02_tool_misuse_exploitation",
    risk:          "medium",
    notes:         "Agent reads/writes GitHub repos. Can introduce malicious commits, exfiltrate private code, or modify CI/CD pipelines.",
  },
  {
    flag:          "email_access",
    surface:       "communication_access",
    threat_vector: "AE02_ai_enabled_social_engineering",
    risk:          "medium",
    notes:         "Agent sends or reads email. Enables large-scale social engineering, internal comms exfiltration, and phishing amplification.",
  },
  {
    flag:          "slack_access",
    surface:       "communication_access",
    threat_vector: "AE02_ai_enabled_social_engineering",
    risk:          "medium",
    notes:         "Agent interacts with Slack. Internal message exfiltration and social engineering of human employees.",
  },
];

// Pre-index for quick lookup
const RULE_BY_FLAG = new Map(SURFACE_RULES.map(r => [r.flag, r]));

/**
 * Given a set of boolean capability flags, return the corresponding attack
 * surfaces. Used by the enricher and snapshot job.
 *
 * @param {object} flags  — e.g. { shell_access: true, mcp_enabled: true, … }
 * @returns {{ surfaces: object[], risk_profile: string, risk_score: number }}
 */
export function mapCapabilitiesToSurfaces(flags = {}) {
  const surfaces = [];
  for (const [flag, value] of Object.entries(flags)) {
    if (!value) continue;
    const rule = RULE_BY_FLAG.get(flag);
    if (rule) surfaces.push({ ...rule });
  }

  // Compute a simple aggregate risk profile
  const highCount = surfaces.filter(s => s.risk === "high").length;
  const medCount  = surfaces.filter(s => s.risk === "medium").length;

  let risk_profile;
  if (highCount >= 3) risk_profile = "critical";
  else if (highCount >= 2) risk_profile = "high";
  else if (highCount >= 1) risk_profile = "medium";
  else if (medCount >= 2) risk_profile = "medium";
  else risk_profile = "low";

  const risk_score = highCount * 3 + medCount * 1;

  return { surfaces, risk_profile, risk_score };
}

/**
 * All boolean capability flag names (for generating INSERT rows).
 */
export const ALL_CAPABILITY_FLAGS = SURFACE_RULES.map(r => r.flag);
