/**
 * Layer 7 — Template Profiler
 *
 * Fully deterministic — no LLM calls. Reads the PPTX template ZIP to extract
 * style metadata for use by exportPptx.js.
 *
 * ── EXTRACTION PROCESS ───────────────────────────────────────────────────────
 * 1. Unzips the PPTX file (ZIP format) using the 'adm-zip' package.
 * 2. Parses ppt/theme/theme1.xml for: accent1–6 hex colors, font names
 *    (major/Latin for headings, minor/Latin for body).
 * 3. Parses ppt/slideMasters/slideMaster1.xml for restriction marking text
 *    (footer/watermark visible in slides).
 * 4. Lists layout names from ppt/slideLayouts/*.xml.
 *
 * ── CACHING ──────────────────────────────────────────────────────────────────
 * Profile cached at templates/template_profile.json after first extraction.
 * loadTemplateProfile(pptxPath) returns cached profile if JSON exists.
 * extractTemplateProfile(pptxPath) always re-reads and overwrites the cache.
 *
 * ── PROFILE SCHEMA ───────────────────────────────────────────────────────────
 * { extracted_at, pptx_path, theme: { colors: { accent1..6 }, fonts: { major, minor } },
 *   slide_master: { restriction_marking }, layouts: string[] }
 *
 * Consumed by exportPptx.js — pass profile.theme.colors.accent1 etc. to PptxGenJS.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createRequire }   from "module";
import { dirname, resolve } from "path";
import { fileURLToPath }   from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, "../../..");
const CACHE_PATH = resolve(ROOT, "templates/template_profile.json");

// ── XML helpers ───────────────────────────────────────────────────────────────

function extractAttr(xml, attr) {
  const re = new RegExp(`${attr}="([^"]+)"`, "g");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function extractText(xml, tag) {
  const re = new RegExp(`<a:${tag}[^>]*>([^<]*)<\/a:${tag}>`, "g");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) if (m[1].trim()) results.push(m[1].trim());
  return results;
}

// ── PPTX ZIP reader (no external dep — uses Node buffer + ZIP parsing) ─────────

function readZipEntry(buf, entryName) {
  // Scan the ZIP central directory to find the entry offset
  // Simple scan: find PK\x03\x04 local file headers and match names
  const target = Buffer.from(entryName, "utf8");
  let pos = 0;
  while (pos < buf.length - 4) {
    if (buf[pos] === 0x50 && buf[pos+1] === 0x4b && buf[pos+2] === 0x03 && buf[pos+3] === 0x04) {
      const fnLen      = buf.readUInt16LE(pos + 26);
      const extraLen   = buf.readUInt16LE(pos + 28);
      const fn         = buf.slice(pos + 30, pos + 30 + fnLen);
      const dataOffset = pos + 30 + fnLen + extraLen;
      const compSize   = buf.readUInt32LE(pos + 18);
      const method     = buf.readUInt16LE(pos + 8);

      if (fn.equals(target)) {
        const compressed = buf.slice(dataOffset, dataOffset + compSize);
        if (method === 0) return compressed.toString("utf8");
        if (method === 8) {
          // Inflate using Node's built-in zlib
          const { inflateRawSync } = createRequire(import.meta.url)("zlib");
          return inflateRawSync(compressed).toString("utf8");
        }
        return null;
      }
      pos = dataOffset + compSize;
    } else {
      pos++;
    }
  }
  return null;
}

// ── Color extraction ──────────────────────────────────────────────────────────

function extractColors(themeXml) {
  const colorMap = {};
  const SLOTS = ["dk1","lt1","dk2","lt2","accent1","accent2","accent3","accent4","accent5","accent6","hlink","folHlink"];

  for (const slot of SLOTS) {
    const re = new RegExp(`<a:${slot}><a:srgbClr val="([A-Fa-f0-9]{6})"`, "i");
    const m = themeXml.match(re);
    if (m) colorMap[slot] = m[1].toUpperCase();
  }
  return colorMap;
}

function extractFonts(themeXml) {
  const major = themeXml.match(/<a:majorFont><a:latin typeface="([^"]+)"/)?.[1] || "Calibri Light";
  const minor = themeXml.match(/<a:minorFont><a:latin typeface="([^"]+)"/)?.[1] || "Calibri";
  return { major, minor };
}

function extractLayoutNames(buf) {
  const names = [];
  for (let i = 1; i <= 20; i++) {
    const xml = readZipEntry(buf, `ppt/slideLayouts/slideLayout${i}.xml`);
    if (!xml) break;
    const m = xml.match(/name="([^"]+)"/);
    if (m) names.push({ index: i, name: m[1] });
  }
  return names;
}

function extractFooterMarkings(masterXml) {
  if (!masterXml) return { marking: "RESTRICTED", position: "footer" };
  const texts = extractText(masterXml, "t");
  const marking = texts.find((t) =>
    /RESTRICTED|OFFICIAL|SENSITIVE|CONFIDENTIAL|TLP/i.test(t)
  ) || "RESTRICTED";
  return { marking, position: "footer" };
}

function extractTitleFont(coverLayoutXml) {
  if (!coverLayoutXml) return null;
  const m = coverLayoutXml.match(/<a:latin typeface="([^"]+)"/);
  return m ? m[1] : null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Extract and cache a style profile from the PPTX template.
 *
 * @param {string} pptxPath - Absolute path to the .pptx file.
 * @returns {object} Template profile.
 */
export function extractTemplateProfile(pptxPath) {
  if (!existsSync(pptxPath)) {
    process.stdout.write(`  [Template Profiler] Warning: template not found at ${pptxPath} — using defaults\n`);
    return defaultProfile();
  }

  const buf       = readFileSync(pptxPath);
  const themeXml  = readZipEntry(buf, "ppt/theme/theme1.xml") || "";
  const masterXml = readZipEntry(buf, "ppt/slideMasters/slideMaster1.xml") || "";
  const coverXml  = readZipEntry(buf, "ppt/slideLayouts/slideLayout1.xml") || "";

  const colors  = extractColors(themeXml);
  const fonts   = extractFonts(themeXml);
  const layouts = extractLayoutNames(buf);
  const footer  = extractFooterMarkings(masterXml);
  const titleFont = extractTitleFont(coverXml) || fonts.major;

  const themeName = themeXml.match(/name="([^"]+)"/)?.[1] || "Unknown";

  const profile = {
    theme_name:          themeName,
    colors,
    fonts:               { ...fonts, title_slide: titleFont },
    layouts,
    footer_marking:      footer.marking,
    citation_placement:  "footer_left",
    restriction_marking: footer.marking,
    restriction_placement: "footer_right",
    extracted_at:        new Date().toISOString(),
    source_file:         pptxPath,
  };

  try {
    writeFileSync(CACHE_PATH, JSON.stringify(profile, null, 2));
  } catch {
    // cache write failure is non-fatal
  }

  return profile;
}

/**
 * Load the cached template profile, or extract it fresh if not cached.
 *
 * @param {string} pptxPath - Absolute path to the .pptx file.
 * @returns {object} Template profile.
 */
export function loadTemplateProfile(pptxPath) {
  if (existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    } catch {
      // fall through to re-extract
    }
  }
  return extractTemplateProfile(pptxPath);
}

function defaultProfile() {
  return {
    theme_name: "CSA Colour Palette",
    colors: {
      accent1: "3583C9",
      accent2: "9C62A7",
      accent3: "19BC9D",
      accent4: "FFAA22",
      accent5: "004987",
      accent6: "CC0033",
    },
    fonts:  { major: "Calibri Light", minor: "Calibri", title_slide: "Segoe UI" },
    layouts: [],
    footer_marking:        "RESTRICTED",
    citation_placement:    "footer_left",
    restriction_marking:   "RESTRICTED",
    restriction_placement: "footer_right",
    extracted_at: new Date().toISOString(),
  };
}
