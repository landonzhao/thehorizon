/**
 * Renders the monthly horizon scan report as structured Markdown.
 *
 * Input: the data object produced by buildMonthlyHorizonScanData.js
 * Output: a Markdown string suitable for PDF export, Notion, or HTML rendering.
 *
 * The report is generated entirely from the pre-built data object — no direct
 * source access, no LLM calls at render time.
 */

const MATURITY_EMOJI = {
  research:     "[R]",
  emerging:     "[E]",
  growing:      "[G]",
  operational:  "[O]",
  mainstream:   "[M]",
};

const EXPLOITATION_LABEL = {
  exploited_in_wild: "EXPLOITED IN THE WILD",
  poc_available:     "PoC Available",
  not_exploited:     "Not Exploited",
  unknown:           "Status Unknown",
};

const TRAJECTORY_LABEL = {
  accelerating:  "Accelerating",
  emerging:      "Emerging",
  steady:        "Steady",
  plateauing:    "Plateauing",
  decelerating:  "Decelerating",
};

function hr(char = "-", len = 60) {
  return char.repeat(len);
}

function confBadge(level) {
  if (level === "high")   return "[HIGH CONFIDENCE]";
  if (level === "medium") return "[MEDIUM CONFIDENCE]";
  return "[LOW CONFIDENCE]";
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderCoverPage(data) {
  const meta = data.report_metadata;
  const glance = data.month_at_a_glance;
  const lines = [
    `# ${meta.title}`,
    "",
    `**Reporting period:** ${meta.reporting_period}`,
    `**Generated:** ${meta.generated_at?.slice(0, 10)}`,
    `**Classification:** ${meta.classification}`,
    `**Version:** ${meta.version}`,
    "",
    hr("="),
    "",
    `**Month thesis:** ${meta.one_line_thesis}`,
    "",
    "## Month at a Glance",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sources analysed | ${glance.total_sources_analyzed} |`,
    `| Events identified | ${glance.total_events} |`,
    `| Trends tracked | ${glance.total_trends} |`,
    `| Active exploitation events | ${glance.active_exploitation_count} |`,
    `| Dominant threat category | ${glance.dominant_category_label} |`,
    `| Top emerging attack surface | ${glance.top_emerging_attack_surface || "n/a"} |`,
    `| Operational signal % | ${glance.operational_vs_research_pct?.operational}% |`,
    `| Singapore/ASEAN events | ${glance.singapore_asean_event_count} |`,
    "",
    "### Top Shifts This Month",
    "",
    ...(glance.top_5_shifts || []).map((s, i) => `${i + 1}. ${s}`),
    "",
  ];
  return lines.join("\n");
}

function renderExecutiveSummary(data) {
  const shifts = data.executive_summary || [];
  const lines = [
    "## Executive Summary",
    "",
    "The following strategic shifts define the AI threat landscape this reporting period. Each represents a directional change, not a single incident.",
    "",
  ];
  for (const shift of shifts) {
    lines.push(`### ${shift.shift_title}`, "");
    if (shift.previous_assumption) lines.push(`**Previous assumption:** ${shift.previous_assumption}`, "");
    if (shift.emerging_reality)    lines.push(`**Emerging reality:** ${shift.emerging_reality}`, "");
    if (shift.why_this_matters)    lines.push(shift.why_this_matters, "");
    if (shift.implications)        lines.push(`**Defender implication:** ${shift.implications}`, "");
    lines.push(
      `*Confidence: ${shift.confidence_level} | Maturity: ${shift.maturity_level}${shift.singapore_asean_relevance ? " | Singapore/ASEAN relevant" : ""}*`,
      "", hr(), ""
    );
  }
  return lines.join("\n");
}

function renderMethodology(data) {
  const m = data.methodology;
  if (!m) return "";
  const lines = [
    "## Methodology",
    "",
    `**Scope:** ${m.scope}`,
    "",
    `**Collection sources:** ${(m.collection_sources || []).join(", ")}`,
    "",
    `**Total sources analysed:** ${m.total_sources}`,
    `**Events identified:** ${m.total_events}`,
    `**Trends tracked:** ${m.total_trends}`,
    "",
    "**Inclusion criteria:** " + m.inclusion_criteria,
    "",
    "### Source tier breakdown",
    "",
    "| Tier | Count | % |",
    "|------|-------|---|",
    ...(m.source_tiers || []).map((t) => `| ${t.tier} | ${t.count} | ${t.pct}% |`),
    "",
    "### Maturity classification",
    "",
    "| Level | Description |",
    "|-------|-------------|",
    "| Research | Theoretical / academic only |",
    "| Emerging | Few demonstrations, no confirmed operational use |",
    "| Growing | Increasing PoC or limited operational use |",
    "| Operational | Confirmed real-world operational use |",
    "| Mainstream | Widely used by multiple actors or commodity tooling |",
    "",
    "### Threat categories",
    "",
    ...(m.threat_categories || []).map((c) => `- **${c.label}** (${c.category})`),
    "",
  ];
  return lines.join("\n");
}

function renderLandscapeOverview(data) {
  const lo = data.landscape_overview;
  const glance = data.month_at_a_glance;
  if (!lo) return "";
  const lines = [
    "## Threat Landscape Overview",
    "",
    `**${lo.total_sources} sources** analysed, **${lo.total_events} events** identified, **${lo.total_trends} trends** tracked.`,
    "",
    "### Category distribution",
    "",
    "| Category | Events |",
    "|----------|--------|",
    ...(glance.category_distribution || []).map((c) => `| ${c.label} | ${c.count} |`),
    "",
    "### Emerging attack surfaces",
    "",
    ...(lo.top_emerging_attack_surfaces || []).slice(0, 5).map((s) => `- **${s.layer}**: ${s.count} events`),
    "",
    "### Most significant developments",
    "",
    ...(lo.most_significant_events || []).map((e, i) => `${i + 1}. **${e.event_title}** (${e.threat_category}, report score: ${e.report_score})`),
    "",
  ];
  return lines.join("\n");
}

function renderStrategicShifts(data) {
  const shifts = data.strategic_shifts || [];
  if (shifts.length === 0) return "";
  const lines = [
    "## Strategic Shifts This Month",
    "",
    "The strategic shifts below represent the core analytical product of this horizon scan. Each identifies a change in threat landscape assumptions that should influence defender posture.",
    "",
  ];
  for (const shift of shifts) {
    lines.push(
      `### ${shift.shift_title}`,
      "",
      `**Previous assumption:** ${shift.previous_assumption}`,
      "",
      `**Emerging reality:** ${shift.emerging_reality}`,
      "",
      shift.why_this_matters || "",
      "",
      `**Implications for defenders:** ${shift.implications_for_defenders}`,
      "",
      `**Expected watch window:** ${shift.expected_watch_window}`,
      `*${confBadge(shift.confidence_level)} | Maturity: ${shift.maturity_level}${shift.singapore_asean_relevance ? " | Singapore/ASEAN" : ""}*`,
      "",
      hr(), ""
    );
  }
  return lines.join("\n");
}

function renderCategorySection(section) {
  if (!section) return "";
  const lines = [
    `## ${section.label}`,
    "",
    `**Events this period:** ${section.event_count} | **Active exploitation:** ${section.active_exploitation_count} | **PoC available:** ${section.poc_available_count} | **Research signals:** ${section.research_signal_count}`,
    "",
  ];

  if (section.affected_stack_layers?.length > 0) {
    lines.push(`**Affected AI stack layers:** ${section.affected_stack_layers.join(", ")}`, "");
  }

  for (const event of section.top_events || []) {
    const exploitLabel = EXPLOITATION_LABEL[event.exploitation_status] || event.exploitation_status;
    const matLabel = MATURITY_EMOJI[event.maturity_level] || "";
    lines.push(
      `### ${matLabel} ${event.event_title}`,
      "",
      event.exploitation_status === "exploited_in_wild" ? `> **${exploitLabel}**` : `*${exploitLabel}*`,
      "",
    );
    if (event.cve_ids?.length) lines.push(`**CVEs:** ${event.cve_ids.join(", ")}`, "");
    if (event.affected_products?.length) lines.push(`**Affected products:** ${event.affected_products.join(", ")}`, "");
    if (event.what_happened)  lines.push(`**What happened:** ${event.what_happened}`, "");
    if (event.how_it_happened) lines.push(`**How it happened:** ${event.how_it_happened}`, "");
    if (event.why_it_matters) lines.push(`**Why it matters:** ${event.why_it_matters}`, "");
    if (event.defender_implications) lines.push(`**Defender implications:** ${event.defender_implications}`, "");
    if (event.watch_indicators?.length) {
      lines.push("**Watch indicators:**", "");
      for (const w of event.watch_indicators) lines.push(`- ${w}`);
      lines.push("");
    }
    lines.push(`*Evidence: ${event.evidence_level} | Maturity: ${event.maturity_level} | ${event.source_count} source(s)*`, "", hr("-", 40), "");
  }

  if (section.key_trends?.length > 0) {
    lines.push("### Key trends in this category", "");
    for (const trend of section.key_trends) {
      lines.push(
        `**${trend.trend_title}** — ${TRAJECTORY_LABEL[trend.trajectory] || trend.trajectory}`,
        "",
        trend.summary || "",
        "",
        trend.defender_implications ? `*Defender implication: ${trend.defender_implications}*` : "",
        `*Watch window: ${trend.watch_window}*`,
        ""
      );
    }
  }

  if (section.convergence_signals?.length > 0) {
    lines.push("### Convergence signals", "");
    for (const c of section.convergence_signals) {
      lines.push(`- **${c.title}**: ${c.strategic_risk}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderConvergence(data) {
  const cps = data.cross_category_convergence || [];
  if (cps.length === 0) return "";
  const lines = [
    "## Cross-Category Convergence",
    "",
    "Convergence points identify where threat developments from different categories reinforce or enable each other — the most strategically important compound risks.",
    "",
  ];
  for (const cp of cps) {
    lines.push(
      `### ${cp.title}`,
      "",
      `**Involved categories:** ${(cp.involved_categories || []).join(", ")}`,
      "",
      `**Strategic risk:** ${cp.strategic_risk}`,
      "",
      `**Defender gap:** ${cp.defender_gap}`,
      "",
      cp.watch_indicators?.length > 0 ? `**Watch for:** ${cp.watch_indicators.slice(0, 3).join("; ")}` : "",
      "",
      hr("-", 40), ""
    );
  }
  return lines.join("\n");
}

function renderOperationalImplications(data) {
  const cats = data.operational_implications || [];
  if (cats.length === 0) return "";
  const lines = [
    "## Operational Implications for Cyber Defenders",
    "",
    "The following implications are aggregated from events, trends, and strategic shifts this period.",
    "",
  ];
  const catLabels = {
    monitoring:      "Monitoring and Visibility",
    architecture:    "Architecture and Segmentation",
    detection:       "Detection Engineering",
    identity_access: "Identity and Access Management",
    patching:        "Patching and Remediation",
    governance:      "Governance and Policy",
    ai_deployment:   "AI Deployment Practices",
  };
  for (const cat of cats) {
    lines.push(`### ${catLabels[cat.category] || cat.category}`, "");
    for (const imp of cat.implications) {
      lines.push(`- ${imp.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderMaturityMatrix(data) {
  const items = data.maturity_trajectory_matrix || [];
  if (items.length === 0) return "";
  const lines = [
    "## Maturity and Trajectory Matrix",
    "",
    "| Signal | Maturity | Trajectory | Watch Window | Confidence | Urgency |",
    "|--------|----------|------------|-------------|------------|---------|",
    ...items.map((item) =>
      `| ${item.signal?.slice(0, 60)} | ${item.current_maturity} | ${item.trajectory} | ${item.expected_watch_window} | ${item.confidence_level} | ${item.urgency} |`
    ),
    "",
  ];
  return lines.join("\n");
}

function renderHorizonWatch(data) {
  const hw = data.horizon_watch || {};
  const lines = [
    "## Horizon Watch",
    "",
    "### Weak signals worth monitoring",
    "",
    ...(hw.weak_signals || []).map((s) => [
      `**${s.event_title}**`,
      s.summary || "",
      s.why_watch ? `*Why watch: ${s.why_watch}*` : "",
      `*Confidence: ${s.confidence}*`,
      "",
    ].filter(Boolean).join("\n")),
    "",
    "### Research-to-threat pipelines",
    "",
    ...(hw.research_to_threat_pipelines || []).map((t) => `- **${t.trend_title}** — ${t.summary?.slice(0, 200) || ""}`),
    "",
    "### Key indicators to monitor next month",
    "",
    ...(hw.next_month_indicators || []).map((ind, i) => `${i + 1}. ${ind}`),
    "",
  ];
  return lines.join("\n");
}

function renderSourceAppendix(data) {
  const cats = data.source_appendix || [];
  const lines = [
    "## Source Appendix",
    "",
    "All sources analysed in this reporting period, organised by threat category.",
    "",
  ];
  for (const cat of cats) {
    lines.push(`### ${cat.label}`, "");
    for (const s of cat.sources || []) {
      lines.push(
        `**${s.title}** — ${s.publisher || "Unknown"} (${s.date_published || "n/d"})`,
        s.url ? `URL: ${s.url}` : "",
        s.short_summary ? `*${s.short_summary?.slice(0, 200)}*` : "",
        `Trust tier: ${s.trust_tier} | Tags: ${(s.tags || []).join(", ") || "none"}`,
        ""
      );
    }
  }
  return lines.join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateMonthlyHorizonScan(data) {
  const sections = [
    renderCoverPage(data),
    hr("="),
    renderExecutiveSummary(data),
    hr("="),
    renderMethodology(data),
    hr("="),
    renderLandscapeOverview(data),
    hr("="),
    renderStrategicShifts(data),
    hr("="),
  ];

  // Category sections A-D
  const catOrder = ["traditional_ai_threats", "llm_threats", "agentic_ai_threats", "ai_enabled_threats", "ai_for_security"];
  const catLabels = ["A", "B", "C", "D", "E"];
  const catSections = data.category_sections || {};
  for (let i = 0; i < catOrder.length; i++) {
    const sec = catSections[catOrder[i]];
    if (sec) {
      sections.push(renderCategorySection(sec), hr("="));
    }
  }

  sections.push(
    renderConvergence(data),
    hr("="),
    renderOperationalImplications(data),
    hr("="),
    renderMaturityMatrix(data),
    hr("="),
    renderHorizonWatch(data),
    hr("="),
    renderSourceAppendix(data),
  );

  return sections.filter(Boolean).join("\n\n");
}
