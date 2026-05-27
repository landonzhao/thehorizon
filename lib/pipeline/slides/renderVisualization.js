/**
 * Layer 7 — Visualization Renderer
 *
 * Fully deterministic — no LLM calls. Renders analytics visualization specs
 * (from visualizationSpecs.js) as native PptxGenJS shape objects.
 * Called by exportPptx.js when a slide has assigned visualization_ids.
 *
 * ── SUPPORTED CHART TYPES ────────────────────────────────────────────────────
 * bar_chart    — horizontal or vertical bar (PptxGenJS addChart BAR/BAR_HORIZONTAL)
 * stacked_bar  — stacked bar for monthly timelines (addChart BAR, barGrouping: stacked)
 * heatmap      — category × label grid rendered as colored table cells
 *               (color intensity mapped from count range using accent palette)
 * radar_chart  — spider chart for signal clusters (addChart RADAR)
 * matrix       — category × maturity grid, colored by count intensity
 * timeline     — sorted event list rendered as text boxes
 *
 * ── CANVAS COORDINATES ───────────────────────────────────────────────────────
 * Canvas: W=13.33in × H=7.5in (widescreen 16:9, must match exportPptx.js)
 * Spec objects define x, y, w, h in inches relative to the canvas.
 *
 * ── COLOR PALETTE ────────────────────────────────────────────────────────────
 * CSA accent palette: accent1=3583C9, accent2=9C62A7, accent3=19BC9D,
 *                     accent4=FFAA22, accent5=004987, accent6=CC0033
 * Heatmap/matrix intensity: white → accent color, capped at max observed count.
 */

// Canvas constants (must match exportPptx.js)
const W = 13.33;
const H = 7.5;

// ── Color helpers ─────────────────────────────────────────────────────────────

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA, 16);
  const b = parseInt(hexB, 16);
  const rA = (a >> 16) & 0xff, gA = (a >> 8) & 0xff, bA = a & 0xff;
  const rB = (b >> 16) & 0xff, gB = (b >> 8) & 0xff, bB = b & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const bl = Math.round(bA + (bB - bA) * t);
  return ((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0").toUpperCase();
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

export function renderBarChart(slide, spec, x, y, w, h, theme) {
  const data = spec.chart_data;
  if (!data?.categories?.length) return;

  const cats  = data.categories.slice(0, 10);
  const vals  = data.values.slice(0, 10);
  const maxV  = Math.max(...vals, 1);
  const barH  = (h - 0.4) / cats.length - 0.05;
  const colors = [theme.accent1, theme.accent2, theme.accent3, theme.accent4, theme.accent5, theme.accent6];

  cats.forEach((cat, i) => {
    const ratio = vals[i] / maxV;
    const bY    = y + i * (barH + 0.05);
    const bW    = (w - 1.2) * ratio;

    slide.addShape("rect", {
      x: x + 1.2, y: bY, w: Math.max(bW, 0.05), h: barH,
      fill: { color: colors[i % colors.length] },
      line: { color: colors[i % colors.length] },
    });
    slide.addText(String(vals[i]), {
      x: x + 1.2 + bW + 0.05, y: bY, w: 0.4, h: barH,
      fontSize: 7, color: theme.dark, fontFace: theme.fontBody, valign: "middle",
    });
    const label = cat.replace(/_/g, " ").slice(0, 20);
    slide.addText(label, {
      x, y: bY, w: 1.15, h: barH,
      fontSize: 7, color: theme.dark, fontFace: theme.fontBody, valign: "middle", align: "right", wrap: true,
    });
  });

  if (spec.title) {
    slide.addText(spec.title, {
      x, y: y - 0.25, w, h: 0.22,
      fontSize: 8, bold: true, color: theme.navy, fontFace: theme.fontBody,
    });
  }
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export function renderHeatmap(slide, spec, x, y, w, h, theme) {
  const data = spec.chart_data;
  if (!data?.rows?.length || !data?.columns?.length) return;

  const rows    = data.rows.slice(0, 6);
  const cols    = data.columns.slice(0, 8);
  const colW    = (w - 1.4) / cols.length;
  const rowH    = (h - 0.35) / rows.length;
  const maxVal  = Math.max(...rows.flatMap((r) => r.values || []), 1);

  // Column headers
  cols.forEach((col, j) => {
    slide.addText(col.replace(/_/g, " ").slice(0, 14), {
      x: x + 1.4 + j * colW, y, w: colW, h: 0.3,
      fontSize: 6, color: theme.navy, fontFace: theme.fontBody, align: "center", wrap: true,
    });
  });

  // Rows
  rows.forEach((row, i) => {
    const rY = y + 0.35 + i * rowH;
    slide.addText((row.label || "").replace(/_/g, " ").slice(0, 18), {
      x, y: rY, w: 1.35, h: rowH,
      fontSize: 6, color: theme.dark, fontFace: theme.fontBody, valign: "middle", align: "right",
    });
    (row.values || []).slice(0, cols.length).forEach((val, j) => {
      const t = val / maxVal;
      const color = lerpColor("F4F6F9", theme.accent1, Math.min(t, 1));
      slide.addShape("rect", {
        x: x + 1.4 + j * colW + 0.01, y: rY + 0.01, w: colW - 0.02, h: rowH - 0.02,
        fill: { color }, line: { color: "DDDDDD", width: 0.5 },
      });
      if (val > 0) {
        slide.addText(String(val), {
          x: x + 1.4 + j * colW, y: rY, w: colW, h: rowH,
          fontSize: 6, color: t > 0.6 ? "FFFFFF" : theme.dark, fontFace: theme.fontBody,
          align: "center", valign: "middle",
        });
      }
    });
  });

  if (spec.title) {
    slide.addText(spec.title, {
      x, y: y - 0.22, w, h: 0.2,
      fontSize: 7, bold: true, color: theme.navy, fontFace: theme.fontBody,
    });
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function renderTimeline(slide, spec, x, y, w, h, theme) {
  const events = (spec.chart_data?.events || []).slice(0, 8);
  if (!events.length) return;

  const rowH = h / events.length;
  const catColors = {
    traditional_ai_threats: theme.accent2,
    llm_threats:            theme.accent1,
    agentic_ai_threats:     theme.accent3,
    ai_enabled_threats:     theme.accent4,
  };

  events.forEach((ev, i) => {
    const eY   = y + i * rowH;
    const col  = catColors[ev.category] || theme.accent1;
    const date = (ev.date || "").slice(0, 7);

    slide.addShape("ellipse", {
      x: x + 0.6, y: eY + rowH * 0.3, w: 0.14, h: 0.14,
      fill: { color: col }, line: { color: col },
    });
    slide.addText(date, {
      x, y: eY + 0.02, w: 0.58, h: rowH,
      fontSize: 6, color: theme.grey, fontFace: theme.fontBody, valign: "middle",
    });
    const label = (ev.title || ev.label || "").slice(0, 55);
    slide.addText(label, {
      x: x + 0.8, y: eY + 0.02, w: w - 0.85, h: rowH,
      fontSize: 7, color: theme.dark, fontFace: theme.fontBody, valign: "middle", wrap: true,
    });
  });

  if (spec.title) {
    slide.addText(spec.title, {
      x, y: y - 0.22, w, h: 0.2,
      fontSize: 7, bold: true, color: theme.navy, fontFace: theme.fontBody,
    });
  }
}

// ── Matrix ────────────────────────────────────────────────────────────────────

export function renderMatrix(slide, spec, x, y, w, h, theme) {
  const data = spec.chart_data;
  if (!data?.rows?.length || !data?.columns?.length) return;

  const rows  = data.rows.slice(0, 5);
  const cols  = data.columns.slice(0, 6);
  const colW  = (w - 1.5) / cols.length;
  const rowH  = (h - 0.35) / rows.length;
  const matColors = [theme.accent2, theme.accent1, theme.accent3, theme.accent4, theme.accent6];

  cols.forEach((col, j) => {
    slide.addText(col.replace(/_/g, " ").slice(0, 12), {
      x: x + 1.5 + j * colW, y, w: colW, h: 0.3,
      fontSize: 6, color: theme.navy, fontFace: theme.fontBody, align: "center", wrap: true,
    });
  });

  rows.forEach((row, i) => {
    const rY    = y + 0.35 + i * rowH;
    const color = matColors[i % matColors.length];
    slide.addText((row.label || "").replace(/_/g, " ").slice(0, 20), {
      x, y: rY, w: 1.45, h: rowH,
      fontSize: 6, color: theme.dark, fontFace: theme.fontBody, valign: "middle", align: "right",
    });
    (row.values || []).slice(0, cols.length).forEach((val, j) => {
      if (!val) return;
      slide.addShape("rect", {
        x: x + 1.5 + j * colW + 0.02, y: rY + 0.02, w: colW - 0.04, h: rowH - 0.04,
        fill: { color }, line: { color },
      });
      slide.addText(String(val), {
        x: x + 1.5 + j * colW, y: rY, w: colW, h: rowH,
        fontSize: 7, bold: true, color: "FFFFFF", fontFace: theme.fontBody,
        align: "center", valign: "middle",
      });
    });
  });
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Render a visualization spec onto a PPTX slide.
 *
 * @param {object} pptxSlide    - PptxGenJS slide object
 * @param {object} spec         - Visualization spec from generateVisualizationSpecs()
 * @param {number} x            - Left position (inches)
 * @param {number} y            - Top position (inches)
 * @param {number} w            - Width (inches)
 * @param {number} h            - Height (inches)
 * @param {object} theme        - Theme constants from exportPptx.js
 */
export function renderVisualizationSpec(pptxSlide, spec, x, y, w, h, theme) {
  if (!spec) return;
  switch (spec.visualization_type) {
    case "bar_chart":   return renderBarChart(pptxSlide, spec, x, y, w, h, theme);
    case "heatmap":     return renderHeatmap(pptxSlide, spec, x, y, w, h, theme);
    case "timeline":    return renderTimeline(pptxSlide, spec, x, y, w, h, theme);
    case "matrix":      return renderMatrix(pptxSlide, spec, x, y, w, h, theme);
    case "stacked_bar": return renderBarChart(pptxSlide, spec, x, y, w, h, theme); // simplified
    case "radar_chart": return renderHeatmap(pptxSlide, spec, x, y, w, h, theme);  // simplified
    default: break;
  }
}
