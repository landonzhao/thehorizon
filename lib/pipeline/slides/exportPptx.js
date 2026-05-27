/**
 * Layer 7 — PPTX Renderer
 *
 * Fully deterministic — no LLM calls. Generates a styled PowerPoint file
 * from finalized slide content objects using PptxGenJS.
 *
 * ── TEMPLATE ─────────────────────────────────────────────────────────────────
 * Template file: templates/AI x Security (for AISP projection) (1).pptx
 * Template profile: templates/template_profile.json (extracted by profileTemplate.js)
 *   Profile contains: theme colors (accent1–6), font names (major/minor),
 *   layout names, and restriction marking text from slide master.
 *
 * ── SLIDE LAYOUT ──────────────────────────────────────────────────────────────
 * Canvas: 13.33in × 7.5in (widescreen 16:9)
 * All coordinates (x, y, w, h) are in inches.
 *
 * Title slide:       Segoe UI title, subtitle, date
 * Section divider:   full-width accent bar, category label
 * Category content:  title bar, headline, bullets (left), evidence callouts (right)
 * Executive/landscape/cross/outlook/conclusion: title + text content columns
 * Appendix:          title + source URL list (truncated to fit)
 *
 * ── COLORS ───────────────────────────────────────────────────────────────────
 * CSA accent palette from template profile:
 *   accent1=3583C9 (blue), accent2=9C62A7 (purple), accent3=19BC9D (teal),
 *   accent4=FFAA22 (amber), accent5=004987 (navy), accent6=CC0033 (red)
 * Fonts: Calibri Light (major/headings), Calibri (minor/body)
 *
 * ── VISUALIZATIONS ───────────────────────────────────────────────────────────
 * Slides with assigned visualization_ids have charts rendered via
 * renderVisualizationSpec() from renderVisualization.js (native shapes, no images).
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 * Writes to outputPath (e.g. outputs/final/horizon_scan_deck.pptx).
 * Returns { path: outputPath, slide_count: number }.
 */

import PptxGenJS from "pptxgenjs";
import { renderVisualizationSpec } from "./renderVisualization.js";
import { loadTemplateProfile }     from "./profileTemplate.js";
import { resolve, dirname }        from "path";
import { fileURLToPath }           from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const TMPL_PATH  = resolve(__dirname, "../../../templates/AI x Security (for AISP projection) (1).pptx");

// Canvas: 13.33 × 7.5 inches (widescreen 16:9)
const W = 13.33;
const H = 7.5;

// ── Theme builder (from template profile) ─────────────────────────────────────

function buildTheme(profile) {
  const c = profile.colors || {};
  return {
    navy:      c.accent5 || "004987",
    navyDk:    "002060",
    blue:      c.accent1 || "3583C9",
    purple:    c.accent2 || "9C62A7",
    teal:      c.accent3 || "19BC9D",
    amber:     c.accent4 || "FFAA22",
    red:       c.accent6 || "CC0033",
    white:     "FFFFFF",
    offWhite:  "F4F6F9",
    dark:      "1A1A2E",
    grey:      "6B7280",
    lightGrey: "E5E7EB",
    // accent shortcuts
    accent1: c.accent1 || "3583C9",
    accent2: c.accent2 || "9C62A7",
    accent3: c.accent3 || "19BC9D",
    accent4: c.accent4 || "FFAA22",
    accent5: c.accent5 || "004987",
    accent6: c.accent6 || "CC0033",
    fontTitle:  profile.fonts?.major || "Calibri Light",
    fontBody:   profile.fonts?.minor || "Calibri",
    fontCover:  profile.fonts?.title_slide || "Segoe UI",
    restriction: profile.restriction_marking || "RESTRICTED",
  };
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function headerBar(slide, title, T, opts = {}) {
  const bg = opts.bg || T.navy;
  const h  = opts.h  || 1.15;
  slide.addShape("rect", { x: 0, y: 0, w: W, h, fill: { color: bg }, line: { color: bg } });
  slide.addText(title, {
    x: 0.4, y: 0.05, w: W - 0.8, h: h - 0.1,
    fontSize: opts.fontSize || 22, bold: true, color: T.white,
    fontFace: T.fontTitle, valign: "middle", wrap: true,
  });
}

function accentLine(slide, T, x = 0.4, y = 1.2, len = W - 0.8) {
  slide.addShape("line", { x, y, w: len, h: 0, line: { color: T.blue, width: 2 } });
}

function footerStrip(slide, T, leftText = "", rightText = "") {
  slide.addShape("rect", {
    x: 0, y: H - 0.32, w: W, h: 0.32,
    fill: { color: T.navyDk }, line: { color: T.navyDk },
  });
  if (leftText) {
    slide.addText(leftText, {
      x: 0.3, y: H - 0.32, w: 8, h: 0.32,
      fontSize: 6.5, color: "AABBCC", fontFace: T.fontBody, valign: "middle",
    });
  }
  slide.addText(T.restriction, {
    x: W - 2.8, y: H - 0.32, w: 2.5, h: 0.32,
    fontSize: 6.5, bold: true, color: T.amber, fontFace: T.fontBody, valign: "middle", align: "right",
  });
  if (rightText) {
    slide.addText(rightText, {
      x: W - 0.6, y: H - 0.32, w: 0.5, h: 0.32,
      fontSize: 6.5, color: "AABBCC", fontFace: T.fontBody, valign: "middle", align: "right",
    });
  }
}

function categoryColor(cat, T) {
  return { traditional_ai_threats: T.purple, llm_threats: T.blue, agentic_ai_threats: T.teal, ai_enabled_threats: T.amber, cross_category: T.red }[cat] || T.blue;
}

// ── Slide builders ─────────────────────────────────────────────────────────────

function buildTitleSlide(pptx, slide, T, date) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.navyDk }, line: { color: T.navyDk } });
  s.addShape("rect", { x: 0, y: H * 0.58, w: W, h: 0.06, fill: { color: T.blue }, line: { color: T.blue } });

  const dotColors = [T.blue, T.purple, T.teal, T.amber];
  dotColors.forEach((c, i) => {
    s.addShape("ellipse", { x: 0.45 + i * 0.3, y: H * 0.58 + 0.12, w: 0.13, h: 0.13, fill: { color: c }, line: { color: c } });
  });

  s.addText(slide.headline || slide.title || "AI Cyber Threat Horizon Scan", {
    x: 0.8, y: 1.4, w: W - 1.6, h: 2.8,
    fontSize: 36, bold: true, color: T.white, fontFace: T.fontCover, valign: "middle", align: "left", wrap: true,
  });
  s.addText("Strategic AI Cyber Threat Horizon Scan", {
    x: 0.8, y: H * 0.6 + 0.2, w: W - 1.6, h: 0.45,
    fontSize: 13, color: "AABBCC", fontFace: T.fontBody, align: "left",
  });
  s.addText(date, {
    x: 0.8, y: H * 0.6 + 0.65, w: 5, h: 0.35,
    fontSize: 11, color: "8899AA", fontFace: T.fontBody, align: "left",
  });
  s.addText(T.restriction, {
    x: W - 2.5, y: H - 0.65, w: 2.1, h: 0.3,
    fontSize: 8, color: T.amber, bold: true, fontFace: T.fontBody, align: "right",
  });

  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildSectionDivider(pptx, slide, T) {
  const s   = pptx.addSlide();
  const acc = categoryColor(slide.category, T);

  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.navy }, line: { color: T.navy } });
  s.addShape("rect", { x: 0, y: 0, w: 0.22, h: H, fill: { color: acc }, line: { color: acc } });

  s.addText(slide.title || "", {
    x: 0.65, y: 1.8, w: W - 1.3, h: 2.2,
    fontSize: 38, bold: true, color: T.white, fontFace: T.fontTitle, valign: "middle", wrap: true,
  });
  if (slide.core_message) {
    s.addText(slide.core_message, {
      x: 0.65, y: 4.2, w: W - 1.3, h: 1.2,
      fontSize: 15, color: "AABBCC", fontFace: T.fontBody, wrap: true,
    });
  }
  footerStrip(s, T, "", String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildContentSlide(pptx, slide, T, vizSpecs) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.white }, line: { color: T.white } });
  headerBar(s, slide.title || "", T, { bg: T.navy, h: 1.12, fontSize: 20 });
  accentLine(s, T, 0.4, 1.17);

  if (slide.headline) {
    s.addText(slide.headline, {
      x: 0.4, y: 1.25, w: W - 0.8, h: 0.68,
      fontSize: 14, bold: true, color: T.navyDk, fontFace: T.fontTitle, wrap: true,
    });
  }

  const hasEvidence = Array.isArray(slide.evidence_callouts) && slide.evidence_callouts.length > 0;
  const hasViz      = Array.isArray(slide.visualization_ids)  && slide.visualization_ids.length > 0 && vizSpecs;

  // Right panel width depends on what's present
  const rightPanelW = (hasEvidence || hasViz) ? W * 0.42 : 0;
  const bulletW     = rightPanelW > 0 ? W - rightPanelW - 0.7 : W - 0.8;
  const bulletY     = 2.0;
  const bulletH     = H - bulletY - 0.45;

  if (slide.bullets?.length) {
    const items = slide.bullets.slice(0, 5).map((b) => ({
      text: b,
      options: { fontSize: 12, color: T.dark, bullet: { color: T.blue }, breakLine: false },
    }));
    s.addText(items, {
      x: 0.4, y: bulletY, w: bulletW, h: bulletH,
      fontFace: T.fontBody, valign: "top", wrap: true, paraSpaceAfter: 6,
    });
  }

  // Right panel: evidence callouts
  if (hasEvidence) {
    const evX = W - rightPanelW - 0.1;
    const evW = rightPanelW;
    let   evY = 2.0;

    s.addShape("rect", { x: evX, y: evY, w: evW, h: 0.38, fill: { color: T.navyDk }, line: { color: T.navyDk } });
    s.addText("KEY EVIDENCE", {
      x: evX + 0.08, y: evY + 0.04, w: evW - 0.16, h: 0.28,
      fontSize: 7.5, bold: true, color: T.white, fontFace: T.fontBody,
    });
    evY += 0.4;

    for (const ev of slide.evidence_callouts.slice(0, 3)) {
      const cardH = 1.3;
      if (evY + cardH > H - 0.5) break;
      s.addShape("rect", {
        x: evX, y: evY, w: evW, h: cardH,
        fill: { color: T.offWhite }, line: { color: T.lightGrey, width: 1 },
      });
      s.addShape("rect", { x: evX, y: evY, w: 0.06, h: cardH, fill: { color: T.blue }, line: { color: T.blue } });
      s.addText((ev.publisher || "").toUpperCase(), {
        x: evX + 0.1, y: evY + 0.07, w: evW - 0.18, h: 0.22,
        fontSize: 6.5, bold: true, color: T.blue, fontFace: T.fontBody,
      });
      s.addText((ev.key_fact || ev.title || "").slice(0, 130), {
        x: evX + 0.1, y: evY + 0.28, w: evW - 0.18, h: 0.88,
        fontSize: 8.5, color: T.dark, fontFace: T.fontBody, wrap: true, valign: "top",
      });
      evY += cardH + 0.08;
    }
  }

  // Right panel: first visualization spec (below evidence or standalone)
  if (hasViz) {
    const firstVizId = slide.visualization_ids[0];
    const spec       = vizSpecs.find((v) => v.visualization_id === firstVizId);
    if (spec && !hasEvidence) {
      const vzX = W - rightPanelW - 0.1;
      renderVisualizationSpec(s, spec, vzX, 2.0, rightPanelW, H - 2.5, T);
    }
  }

  // Footer citations
  const citeText = (slide.citations || []).slice(0, 2).join("  |  ").slice(0, 115);
  footerStrip(s, T, citeText, String(slide.slide_number));

  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildExecOverviewSlide(pptx, slide, T, aggregates) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.white }, line: { color: T.white } });
  headerBar(s, slide.title || "Executive Overview", T, { bg: T.navyDk, h: 1.12, fontSize: 22 });
  accentLine(s, T, 0.4, 1.17);

  if (slide.headline) {
    s.addText(slide.headline, {
      x: 0.4, y: 1.25, w: W - 0.8, h: 0.62,
      fontSize: 13, bold: true, color: T.navyDk, fontFace: T.fontTitle, wrap: true,
    });
  }

  // Category stat cards
  const cats = [
    { key: "traditional_ai_threats", label: "Traditional AI",  color: T.purple },
    { key: "llm_threats",            label: "LLM Threats",      color: T.blue   },
    { key: "agentic_ai_threats",     label: "Agentic AI",       color: T.teal   },
    { key: "ai_enabled_threats",     label: "AI-Enabled",       color: T.amber  },
  ];

  const cardW = (W - 1.0) / cats.length - 0.12;
  cats.forEach((cat, i) => {
    const x     = 0.4 + i * (cardW + 0.12);
    const count = aggregates?.category_counts?.[cat.key] ?? 0;
    s.addShape("rect", { x, y: 2.05, w: cardW, h: 1.5, fill: { color: cat.color }, line: { color: cat.color } });
    s.addText(String(count), {
      x, y: 2.1, w: cardW, h: 0.85,
      fontSize: 40, bold: true, color: T.white, fontFace: T.fontTitle, align: "center", valign: "middle",
    });
    s.addText("sources", {
      x, y: 2.85, w: cardW, h: 0.22, fontSize: 8, color: T.white, fontFace: T.fontBody, align: "center",
    });
    s.addText(cat.label, {
      x, y: 3.1, w: cardW, h: 0.42, fontSize: 10, bold: true, color: T.white, fontFace: T.fontBody,
      align: "center", wrap: true,
    });
  });

  // Key bullets
  if (slide.bullets?.length) {
    const items = slide.bullets.slice(0, 4).map((b) => ({
      text: b,
      options: { fontSize: 11, color: T.dark, bullet: { color: T.navy }, breakLine: false },
    }));
    s.addText(items, {
      x: 0.4, y: 3.72, w: W - 0.8, h: H - 3.72 - 0.42,
      fontFace: T.fontBody, valign: "top", wrap: true, paraSpaceAfter: 5,
    });
  }

  footerStrip(s, T, "", String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildLandscapeSlide(pptx, slide, T, vizSpecs, aggregates) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.white }, line: { color: T.white } });
  headerBar(s, slide.title || "Threat Landscape Overview", T, { bg: T.navy, h: 1.12, fontSize: 20 });
  accentLine(s, T, 0.4, 1.17);

  if (slide.headline) {
    s.addText(slide.headline, {
      x: 0.4, y: 1.25, w: W - 0.8, h: 0.62,
      fontSize: 13, bold: true, color: T.navyDk, fontFace: T.fontTitle, wrap: true,
    });
  }

  // Try to render category_distribution chart from vizSpecs
  const catViz = vizSpecs?.find((v) => v.visualization_id === "category_distribution");
  if (catViz?.chart_data?.categories?.length) {
    renderVisualizationSpec(s, catViz, 0.4, 2.05, W - 0.8, H - 2.5, T);
  } else if (slide.bullets?.length) {
    const items = slide.bullets.slice(0, 4).map((b) => ({
      text: b, options: { fontSize: 12, color: T.dark, bullet: { color: T.blue }, breakLine: false },
    }));
    s.addText(items, {
      x: 0.4, y: 2.05, w: W - 0.8, h: H - 2.5,
      fontFace: T.fontBody, valign: "top", wrap: true,
    });
  }

  footerStrip(s, T, "", String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildOutlookSlide(pptx, slide, T) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.white }, line: { color: T.white } });
  headerBar(s, slide.title || "Six-Month Outlook", T, { bg: T.navyDk, h: 1.12, fontSize: 20 });
  accentLine(s, T, 0.4, 1.17);

  if (slide.headline) {
    s.addText(slide.headline, {
      x: 0.4, y: 1.25, w: W - 0.8, h: 0.62,
      fontSize: 13, bold: true, color: T.navyDk, fontFace: T.fontTitle, wrap: true,
    });
  }

  const cols = [
    { label: "NOW",         color: T.red   },
    { label: "3–6 MONTHS",  color: T.amber },
    { label: "6–12 MONTHS", color: T.blue  },
  ];
  const bullets = slide.bullets || [];
  bullets.forEach((b, i) => { if (cols[i % 3]) cols[i % 3].items = [...(cols[i % 3].items || []), b]; });

  const colW = (W - 1.0) / 3 - 0.1;
  cols.forEach((col, i) => {
    const x = 0.4 + i * (colW + 0.1);
    const y = 2.05;
    s.addShape("rect", { x, y, w: colW, h: 0.42, fill: { color: col.color }, line: { color: col.color } });
    s.addText(col.label, {
      x, y: y + 0.04, w: colW, h: 0.34,
      fontSize: 10, bold: true, color: T.white, fontFace: T.fontBody, align: "center",
    });
    if ((col.items || []).length) {
      const objs = col.items.map((it) => ({
        text: it, options: { fontSize: 10.5, color: T.dark, bullet: { color: col.color }, breakLine: false },
      }));
      s.addText(objs, {
        x: x + 0.07, y: y + 0.48, w: colW - 0.14, h: H - y - 0.95,
        fontFace: T.fontBody, valign: "top", wrap: true, paraSpaceAfter: 6,
      });
    } else {
      s.addText("Monitor for developments", {
        x: x + 0.1, y: y + 0.58, w: colW - 0.2, h: 0.9,
        fontSize: 9, color: T.grey, fontFace: T.fontBody, italics: true,
      });
    }
  });

  footerStrip(s, T, (slide.citations || []).slice(0,1).join("").slice(0,80), String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildConclusionSlide(pptx, slide, T) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.navyDk }, line: { color: T.navyDk } });

  s.addText(slide.title || "Key Takeaways", {
    x: 0.6, y: 0.45, w: W - 1.2, h: 0.88,
    fontSize: 28, bold: true, color: T.white, fontFace: T.fontTitle,
  });
  s.addShape("rect", { x: 0.6, y: 1.28, w: W - 1.2, h: 0.05, fill: { color: T.blue }, line: { color: T.blue } });

  const accentColors = [T.blue, T.teal, T.purple, T.amber, T.red];
  (slide.bullets || []).slice(0, 5).forEach((b, i) => {
    const y = 1.5 + i * 0.92;
    s.addShape("ellipse", {
      x: 0.55, y: y + 0.15, w: 0.24, h: 0.24,
      fill: { color: accentColors[i % accentColors.length] },
      line: { color: accentColors[i % accentColors.length] },
    });
    s.addText(b, {
      x: 0.92, y, w: W - 1.5, h: 0.8,
      fontSize: 12, color: T.white, fontFace: T.fontBody, valign: "middle", wrap: true,
    });
  });

  footerStrip(s, T, "", String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

function buildAppendixSlide(pptx, slide, T) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: T.white }, line: { color: T.white } });
  headerBar(s, slide.title || "Sources & Methodology", T, { bg: T.navy, h: 0.95, fontSize: 18 });

  const cites = (slide.citations || []).slice(0, 24);
  const colW  = (W - 0.8) / 2;
  cites.forEach((cit, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x   = 0.4 + col * (colW + 0.05);
    const y   = 1.05 + row * 0.48;
    if (y > H - 0.42) return;
    s.addText(`${i + 1}. ${cit.slice(0, 80)}`, {
      x, y, w: colW, h: 0.44,
      fontSize: 7.5, color: T.dark, fontFace: T.fontBody, wrap: true, valign: "top",
    });
  });

  footerStrip(s, T, T.restriction, String(slide.slide_number));
  if (slide.speaker_notes) s.addNotes(slide.speaker_notes);
}

// ── Main renderer ──────────────────────────────────────────────────────────────

/**
 * Generate a PPTX file from finalized slide content objects.
 *
 * @param {object[]} slides            - Finalized slide content with speaker_notes
 * @param {object[]} feedSources       - For appendix citation list
 * @param {object}   aggregates        - For overview stat cards
 * @param {object[]} visualizationSpecs - Analytics viz specs for chart rendering
 * @param {string}   outputPath        - Absolute path for the .pptx output
 */
export async function exportPptx(slides, feedSources = [], aggregates = {}, visualizationSpecs = [], outputPath) {
  const profile = loadTemplateProfile(TMPL_PATH);
  const T       = buildTheme(profile);
  const pptx    = new PptxGenJS();

  pptx.layout  = "LAYOUT_WIDE";
  pptx.author  = "The Horizon — AI Threat Intelligence Platform";
  pptx.company = "The Horizon";
  pptx.subject = "AI Cyber Threat Horizon Scan";
  pptx.title   = "AI Cyber Threat Horizon Scan";

  const date = new Date().toLocaleDateString("en-SG", { year: "numeric", month: "long", day: "numeric" });

  for (const slide of slides) {
    switch (slide.slide_type) {
      case "title":
        buildTitleSlide(pptx, slide, T, date);
        break;
      case "section_divider":
        buildSectionDivider(pptx, slide, T);
        break;
      case "exec_overview":
        buildExecOverviewSlide(pptx, slide, T, aggregates);
        break;
      case "landscape":
        buildLandscapeSlide(pptx, slide, T, visualizationSpecs, aggregates);
        break;
      case "outlook":
        buildOutlookSlide(pptx, slide, T);
        break;
      case "conclusion":
        buildConclusionSlide(pptx, slide, T);
        break;
      case "appendix":
        buildAppendixSlide(pptx, slide, T);
        break;
      default:
        // category_content, cross_category
        buildContentSlide(pptx, slide, T, visualizationSpecs);
    }
  }

  await pptx.writeFile({ fileName: outputPath });
}
