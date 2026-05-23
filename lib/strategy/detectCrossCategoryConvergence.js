/**
 * Cross-category convergence detection.
 *
 * Identifies where threat developments from different categories are
 * reinforcing or enabling each other — the most strategically important
 * signals in a horizon scan.
 *
 * Deterministic pattern matching + optional LLM narrative generation.
 */

// Known convergence patterns — deterministic detection
const CONVERGENCE_PATTERNS = [
  {
    pattern_id: "prompt-mcp-orchestration",
    title: "Prompt injection converging with MCP and tool orchestration",
    involved_categories: ["llm_threats", "agentic_ai_threats"],
    required_tags: [["prompt_injection", "jailbreak"], ["mcp_exploitation", "agent_hijacking", "tool_misuse", "excessive_agency"]],
    strategic_risk: "Prompt injection techniques originally developed for stateless LLMs are being adapted to compromise agentic pipelines with persistent state and real-world tool access, dramatically raising the blast radius.",
    defender_gap: "Most prompt injection defences focus on output sanitisation for stateless chat interfaces, not on preventing tool invocation chains triggered by injected instructions.",
  },
  {
    pattern_id: "ai-exploit-agentic",
    title: "AI-assisted exploit discovery merging with agentic workflow automation",
    involved_categories: ["ai_enabled_threats", "agentic_ai_threats"],
    required_tags: [["ai_enabled_attack_automation", "ai_reconnaissance", "ai_generated_malware"], ["agent_hijacking", "excessive_agency", "mcp_exploitation"]],
    strategic_risk: "Autonomous AI agents are being paired with AI-generated exploit capability, creating a potential for self-directed, multi-step cyber operations with minimal human involvement.",
    defender_gap: "Detection and response pipelines assume human-paced attack operations. AI-paced autonomous attacks compress the window between initial access and lateral movement.",
  },
  {
    pattern_id: "deepfake-identity",
    title: "Deepfake generation converging with identity and authentication systems",
    involved_categories: ["ai_enabled_threats"],
    required_tags: [["deepfake", "voice_cloning", "ai_generated_phishing"]],
    extra_tags: ["identity", "authentication", "social_engineering"],
    strategic_risk: "Deepfake capabilities have reached quality levels sufficient to defeat human-administered identity verification processes, threatening KYC, executive impersonation defences, and voice-authenticated systems.",
    defender_gap: "Identity verification processes designed around document and biometric checks have not been updated to account for AI-generated synthetic identity materials.",
  },
  {
    pattern_id: "supply-chain-agents",
    title: "AI supply-chain compromise intersecting with autonomous agent deployment",
    involved_categories: ["traditional_ai_threats", "agentic_ai_threats"],
    required_tags: [["ml_supply_chain", "model_backdoor", "data_poisoning"], ["agent_hijacking", "excessive_agency"]],
    strategic_risk: "A compromised model or training pipeline can introduce latent backdoors that activate when models are deployed as autonomous agents, creating persistent access to agent-controlled resources.",
    defender_gap: "Supply-chain vetting processes focus on model weights and training data but do not account for how backdoored behaviour manifests in agentic deployment contexts.",
  },
  {
    pattern_id: "llm-data-exfil-enterprise",
    title: "LLM data exfiltration risk expanding to enterprise knowledge stores",
    involved_categories: ["llm_threats"],
    required_tags: [["sensitive_data_disclosure", "rag_attack", "training_data_extraction"]],
    extra_tags: ["enterprise", "knowledge", "rag"],
    strategic_risk: "As enterprises deploy LLMs with retrieval-augmented generation over internal document stores, the attack surface for data exfiltration through model inference expands to the entire enterprise knowledge graph.",
    defender_gap: "Data loss prevention tools operate at the network and endpoint layer and do not monitor for information extracted through LLM inference interfaces.",
  },
  {
    pattern_id: "coding-ai-production-infra",
    title: "AI coding assistants introducing production infrastructure risk",
    involved_categories: ["agentic_ai_threats", "ai_enabled_threats"],
    required_tags: [["insecure_output_handling", "prompt_injection"], ["ml_supply_chain"]],
    extra_tags: ["coding", "developer", "ide", "github", "copilot"],
    strategic_risk: "AI coding assistants are autonomously generating infrastructure-as-code, CI/CD pipeline configurations, and dependency declarations — creating a pathway from model compromise to production system modification.",
    defender_gap: "Code review processes assume human-authored code. AI-generated code that introduces subtle vulnerabilities or malicious configurations may bypass review heuristics designed for human error patterns.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasCategoryOverlap(eventCategories, required) {
  return required.every((cat) => eventCategories.includes(cat));
}

function hasTagIntersection(eventTags, tagGroup) {
  return tagGroup.some((t) => eventTags.includes(t));
}

function patternMatchesEvents(pattern, events) {
  const eventTags = [...new Set(events.flatMap((e) => e.tags || []))];
  const eventCategories = [...new Set(events.map((e) => e.threat_category))];

  // Category check
  if (!hasCategoryOverlap(eventCategories, pattern.involved_categories)) return false;

  // Required tag groups: must have at least one match in each group
  for (const tagGroup of pattern.required_tags) {
    if (!hasTagIntersection(eventTags, tagGroup)) return false;
  }

  return true;
}

function findSupportingEvents(pattern, events) {
  const relevant = [];
  for (const event of events) {
    const tags = event.tags || [];
    const category = event.threat_category;
    const matchesCategory = pattern.involved_categories.includes(category);
    const matchesAnyTagGroup = pattern.required_tags.some((group) =>
      group.some((t) => tags.includes(t))
    );
    if (matchesCategory && matchesAnyTagGroup) relevant.push(event);
  }
  return relevant;
}

function findSupportingTrends(pattern, trends) {
  return trends.filter((t) => {
    const categories = t.threat_categories || [];
    return pattern.involved_categories.some((c) => categories.includes(c));
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} events   - all scored + synthesised events
 * @param {object[]} trends   - all scored + synthesised trends
 * @returns {object[]}        - convergence_points
 */
export function detectCrossCategoryConvergence(events, trends) {
  const convergencePoints = [];

  for (const pattern of CONVERGENCE_PATTERNS) {
    if (!patternMatchesEvents(pattern, events)) continue;

    const supportingEvents = findSupportingEvents(pattern, events);
    const supportingTrends = findSupportingTrends(pattern, trends);

    if (supportingEvents.length === 0) continue;

    const allGeo = supportingEvents.flatMap((e) => e.geographic_scope || []);
    const sgRelevant = supportingEvents.some((e) => e.singapore_asean_relevance) ||
      allGeo.some((g) => ["singapore","asean","sea"].includes(g.toLowerCase()));

    const allLayers = [...new Set(supportingEvents.flatMap((e) => e.affected_ai_stack_layers || []))];

    convergencePoints.push({
      pattern_id:         pattern.pattern_id,
      title:              pattern.title,
      involved_categories: pattern.involved_categories,
      involved_stack_layers: allLayers,
      supporting_trend_ids:  supportingTrends.map((t) => t.trend_id),
      supporting_event_ids:  supportingEvents.map((e) => e.event_id),
      supporting_event_count: supportingEvents.length,
      strategic_risk:     pattern.strategic_risk,
      defender_gap:       pattern.defender_gap,
      watch_indicators:   supportingEvents.flatMap((e) => e.watch_indicators || []).slice(0, 4),
      singapore_asean_relevance: sgRelevant,
    });
  }

  // Sort by supporting evidence count
  return convergencePoints.sort((a, b) => b.supporting_event_count - a.supporting_event_count);
}
