import { validateClaimExtraction, validateClassification, validateIntelligence } from "./validateClaims.js";
import { ALLOWED_TAGS, MAIN_CATEGORIES } from "../classification/allowedTags.js";

// OpenAI used as primary (high rate limits, paid account already configured).
// Gemini is a fallback when only GEMINI_API_KEY is present.
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash";
const ALL_CATEGORIES = [...MAIN_CATEGORIES, "uncategorised"];

function trimText(text = "", maxChars = 12000) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function buildPrompt(source) {
  return `
You are a senior AI security intelligence analyst. Your output feeds directly into publishable horizon scanning reports and automated trend analysis. Quality, factual accuracy, and structured intelligence extraction are paramount.

Audience: cybersecurity professionals, policy analysts, and decision-makers at government and enterprise level.

GENERAL REQUIREMENTS
- Preserve all numbers, dates, CVEs, versions, affected organisations, products, threat actors, sectors, geography, and impact metrics.
- Explain the technical mechanics of any attack, exploit, or vulnerability.
- Be concise but maximally information-dense. Every sentence must earn its place.
- Do not invent, embellish, or speculate beyond the source text.
- Distinguish confirmed facts from claims, attributions, and speculation.
- No marketing language, hype, or filler phrases.

SHORT SUMMARY (3 sentences max)
- Lead with the most operationally important fact (who, what, where, when, impact).
- Include specific technical details: CVE numbers, affected product versions, attack method, scale of breach.
- End with the key implication for defenders or the threat landscape.

ANALYST BRIEF
- what_happened: Precise technical description of the incident, vulnerability, or development.
- who_was_affected: Specific organisations, sectors, user populations, or systems impacted.
- actor_or_attribution: Threat actor name, group, nation-state, or "unknown" with any attribution evidence.
- how_it_happened: Step-by-step technical explanation of the attack chain or vulnerability mechanism.
- exploited_or_abused: Specific weaknesses, misconfigurations, or AI capabilities abused.
- impact: Quantified impact where possible (records exposed, systems affected, financial loss, etc.).
- why_it_matters: Strategic significance for the AI threat landscape or security posture.
- watch_points: 2–5 specific, actionable indicators or developments defenders should monitor.

INTELLIGENCE METADATA (for trend analysis and report generation)
- trend_signals: 2–4 forward-looking observations this source reveals about where AI threats are heading. Focus on what is NEW or CHANGING, not what is established.
- key_entities:
    • threat_actors: named groups, individuals, nation-states (empty array if none)
    • tools_and_techniques: specific tools, frameworks, attack techniques, or methods named
    • affected_products: specific AI products, platforms, or systems targeted or involved
    • affected_organizations: named organisations (anonymise if the source does)
    • cves: CVE identifiers mentioned (e.g. ["CVE-2024-1234"])
- threat_maturity: one of:
    • "emerging" — newly observed or theorised, limited real-world incidents
    • "growing" — increasing in frequency or sophistication, becoming operationalised
    • "established" — well-documented, widely understood, part of standard threat models
    • "declining" — being mitigated by defences, losing threat actor interest
- sector_impact: array of sectors most affected (e.g. ["financial", "government", "healthcare", "critical_infrastructure", "technology", "defence", "education", "energy"])
- horizon_relevance: integer 1–5
    • 5 = critical emerging development that will shape the threat landscape
    • 4 = significant new capability, technique, or incident with broad implications
    • 3 = important development worth tracking for trend analysis
    • 2 = useful background or context, limited forward-looking signal
    • 1 = established/known issue with minimal new intelligence value
- report_tier: recommended reporting cadence:
    • "weekly" — time-sensitive, actionable, warrants immediate analyst attention
    • "monthly" — important trend or development for monthly threat review
    • "quarterly" — strategic, policy, or horizon-scanning significance
    • "archive_only" — background context, not report-worthy on its own

CLAIMS
- Claims must be specific, falsifiable, and sourced from the text.
- Preserve numbers, names, and technical specifics.
- Include the verbatim or near-verbatim evidence span.

CLASSIFICATION
- Select tags ONLY from this exact allowed list:
  ${JSON.stringify(ALLOWED_TAGS)}
- Assign exactly one main_category from: ${JSON.stringify(ALL_CATEGORIES)}
- ai_specificity_score: integer 0–100:
    • 0–10:  purely generic cybersecurity — no AI involvement (generic CVEs, non-AI malware, ICS advisories)
    • 11–19: AI mentioned incidentally; core topic is traditional cyber
    • 20–39: AI is a contributing factor but not the primary subject
    • 40–70: AI is a primary factor (AI tool used in attack, AI system targeted, AI safety research)
    • 71–100: AI or ML is the core subject (LLM threats, agentic risks, deepfakes, ML model attacks)
  Generic CISA/ICS advisories and vendor CVEs with no AI model content must score ≤ 10.
- ai_specificity_reason: one concise sentence justifying the score.
- category_confidence: 0–100 confidence in main_category.
- category_reason: one concise sentence explaining the category choice.

SOURCE METADATA
${JSON.stringify(
  {
    title: source.title,
    publisher: source.publisher,
    source_type: source.source_type,
    date_published: source.date_published,
    main_category: source.main_category,
    tags: source.tags || [],
  },
  null,
  2
)}

SOURCE TEXT
${trimText(
  source.full_text ||
    source.summary ||
    source.short_summary ||
    ""
)}

Return strict JSON only — no markdown fences, no extra keys, no trailing commas:

{
  "short_summary": "Three information-dense factual sentences.",

  "analyst_brief": {
    "what_happened": "...",
    "who_was_affected": "...",
    "actor_or_attribution": "...",
    "how_it_happened": "...",
    "exploited_or_abused": "...",
    "impact": "...",
    "why_it_matters": "...",
    "watch_points": ["...", "..."]
  },

  "claims": [
    {
      "claim_text": "...",
      "claim_type": "incident | vulnerability | technical | severity | impact | attribution | mitigation | research | policy | prediction | opinion | other",
      "evidence_span": "...",
      "confidence": 85
    }
  ],

  "intelligence": {
    "trend_signals": ["...", "..."],
    "key_entities": {
      "threat_actors": [],
      "tools_and_techniques": [],
      "affected_products": [],
      "affected_organizations": [],
      "cves": []
    },
    "threat_maturity": "emerging",
    "sector_impact": [],
    "horizon_relevance": 3,
    "report_tier": "monthly"
  },

  "classification": {
    "tags": ["tag_from_allowed_list"],
    "main_category": "llm_threats",
    "category_confidence": 85,
    "category_reason": "...",
    "ai_specificity_score": 75,
    "ai_specificity_reason": "..."
  }
}
`;
}

const EMPTY_CLASSIFICATION = () => validateClassification({});
const EMPTY_INTELLIGENCE = () => validateIntelligence({});

async function callOpenAI(source) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: buildPrompt(source) }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI extraction failed: ${response.status} ${err?.error?.message || ""}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function callGemini(source) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(source) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini extraction failed: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

export async function extractClaimsWithGemini(source) {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  if (!hasOpenAI && !hasGemini) {
    return {
      ...validateClaimExtraction({
        short_summary:
          source.summary ||
          source.full_text?.slice(0, 500) ||
          "No summary available.",
        analyst_brief: {},
        claims: [],
      }),
      classification: EMPTY_CLASSIFICATION(),
      intelligence: EMPTY_INTELLIGENCE(),
    };
  }

  let text;
  if (hasOpenAI) {
    text = await callOpenAI(source);
  } else {
    text = await callGemini(source);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      short_summary:
        source.summary ||
        source.full_text?.slice(0, 500) ||
        "No summary available.",
      analyst_brief: {},
      claims: [],
      classification: {},
    };
  }

  return {
    ...validateClaimExtraction(parsed),
    classification: validateClassification(parsed.classification || {}),
    intelligence: validateIntelligence(parsed.intelligence || {}),
  };
}
