/**
 * Layer 5.2 — AI Relevance Filtering
 *
 * Rule-based relevance assessment. Answers: is this source meaningfully
 * related to AI-cyber threats, or is AI merely mentioned in passing?
 *
 * Produces three scores and a derived tier:
 *   ai_relevance_score   — how AI-specific the content is (0–100)
 *   cyber_relevance_score — how cybersecurity-relevant it is (0–100)
 *   ai_specificity_score — combined measure of AI-cyber centrality (0–100)
 *   relevance_tier       — core | adjacent | peripheral | off_topic
 *
 * NOTE: This is a fast heuristic. LLM-refined ai_specificity_score is
 * produced at Layer 9 (intelligence extraction) and may override this.
 */

// ── Signal dictionaries ───────────────────────────────────────────────────────

const AI_SIGNALS = {
  high: [
    "prompt injection", "jailbreak", "llm", "large language model", "gpt", "gemini",
    "claude", "adversarial", "ai model", "machine learning attack", "data poisoning",
    "model extraction", "deepfake", "ai agent", "mcp", "agentic", "ai-enabled threat",
    "ai-powered attack", "ai safety", "ai security", "model backdoor", "rag poisoning",
    "model context protocol", "synthetic media", "voice cloning", "ai malware",
    "ai phishing", "training data poisoning", "model inversion", "foundation model attack",
    "embedding attack", "agent hijacking", "tool poisoning", "llm vulnerability",
  ],
  medium: [
    "artificial intelligence", "generative ai", "foundation model", "neural network",
    "ai system", "ai tool", "ai generated", "ai chatbot", "language model",
    "machine learning", "ml model", "ai bias", "responsible ai", "ai governance",
    "ai act", "ai regulation", "ai risk", "ai ethics",
  ],
  low: [
    "ai", "automation", "algorithm", "predictive", "intelligent system",
  ],
};

const CYBER_SIGNALS = {
  high: [
    "vulnerability", "cve-", "exploit", "malware", "ransomware", "threat actor",
    "apt", "zero-day", "0-day", "data breach", "attack campaign", "ioc",
    "indicators of compromise", "command and control", "c2", "ttps",
    "remote code execution", "rce", "privilege escalation", "lateral movement",
    "phishing", "social engineering", "supply chain attack", "backdoor",
  ],
  medium: [
    "cybersecurity", "security vulnerability", "security advisory", "patch",
    "mitigation", "threat intelligence", "incident response", "soc", "siem",
    "penetration testing", "red team", "blue team", "security research",
    "disclosure", "security incident", "data exfiltration",
  ],
  low: [
    "security", "risk", "attack", "defense", "hacking", "breach",
  ],
};

// ── Scoring logic ─────────────────────────────────────────────────────────────

function scoreSignals(text, signals) {
  const high   = signals.high.filter((s) => text.includes(s)).length;
  const medium = signals.medium.filter((s) => text.includes(s)).length;
  const low    = signals.low.filter((s) => text.includes(s)).length;

  let score = 0;
  score += Math.min(high,   5) * 14; // up to 70
  score += Math.min(medium, 3) * 8;  // up to 24
  score += Math.min(low,    2) * 3;  // up to 6
  return Math.min(100, score);
}

// ai_specificity: how central AI-cyber is to the source, not just mentioned.
// High AI + high cyber → very specific. High AI + low cyber → still relevant.
function deriveSpecificityScore(aiScore, cyberScore) {
  const cyberBonus = Math.min(15, Math.round(cyberScore * 0.15));
  return Math.min(100, aiScore + cyberBonus);
}

function deriveRelevanceTier(specificityScore) {
  if (specificityScore >= 40) return "core";
  if (specificityScore >= 20) return "adjacent";
  if (specificityScore >= 10) return "peripheral";
  return "off_topic";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Assess AI and cybersecurity relevance of a source.
 *
 * @param {object} source
 * @returns {{
 *   ai_relevance_score: number,
 *   cyber_relevance_score: number,
 *   ai_specificity_score: number,
 *   relevance_tier: "core"|"adjacent"|"peripheral"|"off_topic",
 * }}
 */
export function assessAiRelevance(source) {
  const text = [source.title, source.summary, source.full_text?.slice(0, 2000)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const ai_relevance_score    = scoreSignals(text, AI_SIGNALS);
  const cyber_relevance_score = scoreSignals(text, CYBER_SIGNALS);
  const ai_specificity_score  = deriveSpecificityScore(ai_relevance_score, cyber_relevance_score);
  const relevance_tier        = deriveRelevanceTier(ai_specificity_score);

  return { ai_relevance_score, cyber_relevance_score, ai_specificity_score, relevance_tier };
}
