/**
 * Template Style Extraction
 * Reads style templates if present, otherwise returns default style profile.
 */

import fs from "fs";
import path from "path";

const DEFAULT_STYLE = {
  tone: "professional",
  slide_density: "low",
  title_style: "sentence_case",
  section_transition_style: "explicit",
  bullet_style: "short_action_phrases",
  speaker_note_style: "narrative",
  visual_style_hints: ["clean", "minimal", "data_driven"],
  template_files_found: [],
  source: "default",
};

const TONE_KEYWORDS = [
  "formal", "professional", "technical", "concise", "executive",
  "conversational", "narrative", "analytical",
];

const DENSITY_KEYWORDS = {
  low: ["minimal", "clean", "sparse", "simple"],
  medium: ["balanced", "moderate", "standard"],
  high: ["dense", "detailed", "comprehensive", "full"],
};

function extractTone(text) {
  const lower = text.toLowerCase();
  for (const kw of TONE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return DEFAULT_STYLE.tone;
}

function extractDensity(text) {
  const lower = text.toLowerCase();
  for (const [level, keywords] of Object.entries(DENSITY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return level;
  }
  return DEFAULT_STYLE.slide_density;
}

function extractBulletStyle(text) {
  const lower = text.toLowerCase();
  if (lower.includes("action phrase") || lower.includes("action verb")) return "short_action_phrases";
  if (lower.includes("sentence") || lower.includes("full sentence")) return "full_sentences";
  if (lower.includes("fragment") || lower.includes("headline")) return "headline_fragments";
  return DEFAULT_STYLE.bullet_style;
}

function extractVisualHints(text) {
  const lower = text.toLowerCase();
  const hints = [];
  if (lower.includes("clean") || lower.includes("minimal")) hints.push("clean", "minimal");
  if (lower.includes("data") || lower.includes("chart") || lower.includes("visual")) hints.push("data_driven");
  if (lower.includes("color") || lower.includes("branded")) hints.push("branded");
  if (lower.includes("dark")) hints.push("dark_theme");
  if (lower.includes("light")) hints.push("light_theme");
  return hints.length > 0 ? [...new Set(hints)] : DEFAULT_STYLE.visual_style_hints;
}

/**
 * Extract style profile from template files.
 *
 * @param {string} templatesDir - path to the templates directory
 * @returns {object} style profile object
 */
export function extractTemplateStyle(templatesDir) {
  const templateFiles = {
    pptx: path.join(templatesDir, "sample_deck.pptx"),
    script: path.join(templatesDir, "sample_script.md"),
    guide: path.join(templatesDir, "style_guide.md"),
  };

  const found = [];
  for (const [key, filepath] of Object.entries(templateFiles)) {
    if (fs.existsSync(filepath)) found.push(key);
  }

  if (found.length === 0) {
    return { ...DEFAULT_STYLE };
  }

  const profile = { ...DEFAULT_STYLE, template_files_found: found, source: "template" };

  // Parse style guide if present
  if (found.includes("guide")) {
    try {
      const content = fs.readFileSync(templateFiles.guide, "utf-8");
      profile.tone = extractTone(content);
      profile.slide_density = extractDensity(content);
      profile.bullet_style = extractBulletStyle(content);
      profile.visual_style_hints = extractVisualHints(content);
    } catch (err) {
      console.warn(`  [Template] Could not read style_guide.md: ${err.message}`);
    }
  }

  return profile;
}
