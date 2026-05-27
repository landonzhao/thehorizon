/**
 * Layer 7 — Deck Planner
 *
 * Fully deterministic — no LLM calls. Builds a dynamic slide plan from
 * Layer 8 (analysis layer) outputs. The plan is the sole input to
 * generateSlideContent.js which then makes LLM calls per slide.
 *
 * ── DECK STRUCTURE ───────────────────────────────────────────────────────────
 * For N active categories (1–4):
 *   Slide 1:       Title (slide_type: "title")
 *   Slide 2:       Executive Overview (slide_type: "executive_overview")
 *   Slide 3:       Threat Landscape Overview (slide_type: "threat_landscape")
 *   Slides 4–3+2N: Section divider (slide_type: "section_divider") +
 *                  Category content (slide_type: "category_content") per category
 *   Slide 3+2N+1:  Cross-Category Convergence (slide_type: "cross_category")
 *   Slide 3+2N+2:  Six-Month Outlook (slide_type: "outlook")
 *   Slide 3+2N+3:  Key Takeaways (slide_type: "conclusion")
 *   Slide 3+2N+4:  Appendix / Sources (slide_type: "appendix")
 *
 *   Total: 9 slides for 1 active category, up to 3+2N+5 for N categories.
 *
 * ── SLIDE FIELDS ─────────────────────────────────────────────────────────────
 * Each planned slide has:
 *   slide_number, slide_type, title, rawfact_evidence[], analytics_evidence[],
 *   visualization_ids[], speaker_note_intent, category (for category_content slides)
 *
 * rawfact_evidence: top items from the category dossier (must_read/high priority)
 * analytics_evidence: category-specific analytics items from the dossier
 * visualization_ids: refs to visualization specs from visualizationSpecs.js
 * speaker_note_intent: plain-English description of what the presenter should convey
 *
 * ── INPUTS ───────────────────────────────────────────────────────────────────
 * category_analyses[]  — from Layer 8D (qaAllCategoryAnalyses)
 * dossiers[]           — from Layer 8A (buildAllDossiers)
 * feed_sources[]       — all enriched sources (for appendix citations)
 * aggregates           — from Layer 7.2B (for landscape slide)
 * visualization_specs[] — from Layer 7.2C (for chart assignments)
 */

export const CATEGORY_LABELS = {
  traditional_ai_threats: "Traditional AI Threats",
  llm_threats:            "LLM Threats",
  agentic_ai_threats:     "Agentic AI Threats",
  ai_enabled_threats:     "AI-Enabled Threats",
};

const CATEGORY_SECTION_VIZ = {
  traditional_ai_threats: ["attack_vector_frequency", "maturity_distribution"],
  llm_threats:            ["attack_vector_frequency", "maturity_distribution"],
  agentic_ai_threats:     ["attack_vector_frequency", "ai_layer_frequency"],
  ai_enabled_threats:     ["attack_vector_frequency", "maturity_distribution"],
};

const ANALYSIS_CATEGORY_ORDER = [
  "traditional_ai_threats",
  "llm_threats",
  "agentic_ai_threats",
  "ai_enabled_threats",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterVizIds(ids, specs) {
  const avail = new Set((specs || []).map((v) => v.visualization_id));
  return ids.filter((id) => avail.has(id));
}

function findDossier(dossiers, category) {
  return (dossiers || []).find((d) => d.category === category) || null;
}

function findAnalysis(analyses, category) {
  return (analyses || []).find((a) => a.category === category) || null;
}

// ── Slide makers ──────────────────────────────────────────────────────────────

function titleSlide(num) {
  return {
    slide_number:        num,
    slide_type:          "title",
    title:               "AI Cyber Threat Horizon Scan",
    category:            null,
    rawfact_evidence:    [],
    analytics_evidence:  [],
    category_analysis:   null,
    visualization_ids:   [],
    core_message:        "A strategic horizon scan of emerging AI cyber threats.",
    speaker_note_intent: "Introduce the briefing: strategic AI-cyber threat horizon scan for this reporting period.",
  };
}

function execOverviewSlide(num, analyses, aggregates, specs) {
  const topInsightPerCat = analyses.map((a) => ({
    category:  a.category,
    insight:   (a.top_insights || [])[0]?.insight || a.overview?.slice(0, 100),
    confidence: (a.top_insights || [])[0]?.confidence || a.analysis_confidence,
  })).filter((x) => x.insight);

  return {
    slide_number:             num,
    slide_type:               "exec_overview",
    title:                    "Executive Overview",
    category:                 null,
    rawfact_evidence:         [],
    analytics_evidence:       [],
    category_analysis:        null,
    cross_category_insights:  topInsightPerCat,
    aggregates_summary: {
      total_sources:   aggregates.total_sources  || 0,
      category_counts: aggregates.category_counts || {},
      date_range:      aggregates.date_range     || {},
      top_attack_vectors: (aggregates.top || {}).attack_vectors?.slice(0, 5) || [],
    },
    top_citations: analyses.flatMap((a) => (a.citations || []).slice(0, 1)),
    visualization_ids:   filterVizIds(["monthly_category_timeline", "source_type_distribution"], specs),
    core_message:        "Key findings, source volume, and the top threat signals this reporting period.",
    speaker_note_intent: "Communicate headline findings to decision-makers who may not read the full deck. Reference total source volume, category split, and most significant finding.",
  };
}

function landscapeSlide(num, aggregates, specs) {
  return {
    slide_number:       num,
    slide_type:         "landscape",
    title:              "Threat Landscape Overview",
    category:           null,
    rawfact_evidence:   [],
    analytics_evidence: [],
    category_analysis:  null,
    aggregates_summary: {
      category_counts:       aggregates.category_counts || {},
      maturity_distribution: aggregates.maturity_distribution || {},
      total_sources:         aggregates.total_sources || 0,
      source_type_counts:    aggregates.source_type_counts || {},
    },
    visualization_ids:   filterVizIds(["category_distribution", "maturity_distribution", "ai_layer_frequency"], specs),
    core_message:        "The AI-cyber threat landscape distributed across four offensive categories.",
    speaker_note_intent: "Show the overall shape of the intelligence corpus: category distribution, maturity of threats, and which AI system layers are most exposed.",
  };
}

function sectionDivider(num, category, analysis) {
  return {
    slide_number:        num,
    slide_type:          "section_divider",
    title:               CATEGORY_LABELS[category] || category,
    category,
    rawfact_evidence:    [],
    analytics_evidence:  [],
    category_analysis:   analysis,
    visualization_ids:   [],
    core_message:        analysis?.overview?.slice(0, 130) || `Analysis of ${CATEGORY_LABELS[category] || category}.`,
    speaker_note_intent: `Transition into the ${CATEGORY_LABELS[category] || category} section.`,
  };
}

function categoryContentSlide(num, category, analysis, dossier, specs) {
  return {
    slide_number:        num,
    slide_type:          "category_content",
    title:               CATEGORY_LABELS[category] || category,
    category,
    rawfact_evidence:    (dossier?.rawfact_evidence  || []).slice(0, 5),
    analytics_evidence:  dossier?.analytics_evidence || [],
    category_analysis:   analysis,
    visualization_ids:   filterVizIds(CATEGORY_SECTION_VIZ[category] || [], specs),
    core_message:        (analysis?.top_insights || [])[0]?.insight || analysis?.overview?.slice(0, 120) || "",
    speaker_note_intent: `Explain the dominant pattern in ${CATEGORY_LABELS[category] || category}. Reference specific evidence. State strategic implication for defenders.`,
  };
}

function crossCategorySlide(num, analyses, aggregates, specs) {
  const earlySignals = analyses
    .flatMap((a) => (a.early_signals || []).filter((s) => s.qa_pass !== false).slice(0, 2)
      .map((s) => ({ ...s, category: a.category })))
    .slice(0, 6);

  return {
    slide_number:            num,
    slide_type:              "cross_category",
    title:                   "Cross-Category Convergence",
    category:                "cross_category",
    rawfact_evidence:        [],
    analytics_evidence:      [],
    category_analysis:       null,
    cross_category_insights: earlySignals,
    aggregates_summary: {
      signal_cluster_counts:    aggregates.signal_cluster_counts    || {},
      attack_surface_frequency: aggregates.attack_surface_frequency || {},
      recurring_theme_counts:   aggregates.recurring_theme_counts   || {},
    },
    visualization_ids:   filterVizIds(
      ["attack_surface_heatmap", "signal_cluster_radar", "signal_cluster_heatmap", "recurring_theme_heatmap"],
      specs
    ),
    core_message:        "AI threats are converging — offensive AI, LLM attacks, and agentic risks reinforce each other.",
    speaker_note_intent: "Connect the dots across categories. Show shared attack surfaces, compounding risks, and convergent techniques.",
  };
}

function outlookSlide(num, analyses, specs) {
  const outlooks = analyses
    .filter((a) => a.outlook?.statement)
    .map((a) => ({
      category:     a.category,
      label:        CATEGORY_LABELS[a.category] || a.category,
      statement:    a.outlook.statement,
      time_horizon: a.outlook.time_horizon,
      citations:    a.outlook.citations || [],
    }));

  const earlySignals = analyses
    .flatMap((a) => (a.early_signals || []).filter((s) => s.qa_pass !== false).slice(0, 1)
      .map((s) => ({ ...s, category: a.category, label: CATEGORY_LABELS[a.category] })));

  return {
    slide_number:       num,
    slide_type:         "outlook",
    title:              "Six-Month Outlook",
    category:           null,
    rawfact_evidence:   [],
    analytics_evidence: [],
    category_analysis:  null,
    outlook_statements: outlooks,
    early_signals:      earlySignals,
    visualization_ids:  filterVizIds(["recurring_theme_heatmap", "operational_status_by_category"], specs),
    core_message:       "Key threats expected to escalate or operationalize in the next 3–6 months.",
    speaker_note_intent: "Give decision-makers actionable foresight: which specific techniques, actors, or vectors are on a trajectory to escalate. All statements must be backed by current evidence trajectory.",
  };
}

function conclusionSlide(num, analyses) {
  const highConfInsights = analyses
    .flatMap((a) => (a.top_insights || []).filter((i) => i.confidence === "high"))
    .slice(0, 5);

  return {
    slide_number:             num,
    slide_type:               "conclusion",
    title:                    "Key Takeaways",
    category:                 null,
    rawfact_evidence:         [],
    analytics_evidence:       [],
    category_analysis:        null,
    cross_category_insights:  highConfInsights,
    top_citations:            analyses.flatMap((a) => (a.citations || []).filter((c) => c.citation_type === "rawfact").slice(0, 1)),
    visualization_ids:        [],
    core_message:             "Top priorities for AI-aware defenders in the current threat environment.",
    speaker_note_intent:      "Leave the audience with 3–5 concrete defender priorities. Synthesize across categories — do not repeat individual insights verbatim.",
  };
}

function appendixSlide(num) {
  return {
    slide_number:        num,
    slide_type:          "appendix",
    title:               "Sources & Methodology",
    category:            null,
    rawfact_evidence:    [],
    analytics_evidence:  [],
    category_analysis:   null,
    visualization_ids:   [],
    core_message:        "Source citations and intelligence pipeline methodology.",
    speaker_note_intent: "Provide transparency on methodology, source selection criteria, and trust tiers.",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a dynamic slide deck plan from Layer 8 analysis outputs.
 *
 * @param {object[]} categoryAnalyses   - Output of runAnalysisLayer().category_analyses
 * @param {object[]} dossiers           - Output of buildAllDossiers() (evidence source)
 * @param {object[]} feedSources        - All enriched sources (for appendix)
 * @param {object}   aggregates         - Output of aggregateAnalytics()
 * @param {object[]} visualizationSpecs - Output of generateVisualizationSpecs()
 * @returns {object[]} Ordered slide plan.
 */
export function planSlides(categoryAnalyses, dossiers, feedSources, aggregates, visualizationSpecs) {
  const plan = [];
  let num = 1;

  plan.push(titleSlide(num++));
  plan.push(execOverviewSlide(num++, categoryAnalyses, aggregates, visualizationSpecs));
  plan.push(landscapeSlide(num++, aggregates, visualizationSpecs));

  const activeCats = ANALYSIS_CATEGORY_ORDER.filter((cat) =>
    categoryAnalyses.some((a) => a.category === cat)
  );

  for (const cat of activeCats) {
    const analysis = findAnalysis(categoryAnalyses, cat);
    const dossier  = findDossier(dossiers, cat);
    plan.push(sectionDivider(num++, cat, analysis));
    plan.push(categoryContentSlide(num++, cat, analysis, dossier, visualizationSpecs));
  }

  plan.push(crossCategorySlide(num++, categoryAnalyses, aggregates, visualizationSpecs));
  plan.push(outlookSlide(num++, categoryAnalyses, visualizationSpecs));
  plan.push(conclusionSlide(num++, categoryAnalyses));
  plan.push(appendixSlide(num++));

  return plan;
}
