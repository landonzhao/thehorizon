export const MAIN_CATEGORY_ORDER = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
  "ai_for_security",
];

export const ARCHIVE_CATEGORY_ORDER = [...MAIN_CATEGORY_ORDER, "uncategorised"];

export const CATEGORY_LABELS = {
  traditional_ai_threats: "Traditional AI Threats",
  llm_threats: "LLM Threats",
  agentic_ai_threats: "Agentic AI Threats",
  ai_enabled_threats: "AI-Enabled Threats",
  ai_for_security: "AI for Security",
  uncategorised: "Needs Review",
};

export const CATEGORY_DESCRIPTIONS = {
  traditional_ai_threats:
    "Threats to AI/ML models, data, training pipelines, and model supply chains.",
  llm_threats:
    "Prompt injection, jailbreaks, RAG risks, data leakage, and LLM application security.",
  agentic_ai_threats:
    "Risks from AI agents, tool use, MCP, coding agents, and autonomous workflows.",
  ai_enabled_threats:
    "AI-assisted scams, phishing, malware, deepfakes, disinformation, and fraud.",
  ai_for_security:
    "Defensive AI for detection, SOC operations, threat intelligence, and secure development.",
  uncategorised:
    "Sources that need review or do not yet fit cleanly into one category.",
};

export const REPORT_PERIOD_DAYS = { weekly: 7, monthly: 30, quarterly: 91 };
