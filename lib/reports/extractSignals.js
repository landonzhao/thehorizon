/**
 * Signal extraction and clustering for report generation.
 *
 * Takes a list of enriched sources and returns per-category signal clusters.
 * Each cluster groups thematically related trend_signals together and
 * attaches the supporting sources and extracted facts as evidence.
 *
 * Output shape per cluster:
 * {
 *   theme: "string",               // cluster label (the strongest signal text)
 *   signal_count: 2,               // how many raw signals mapped to this theme
 *   source_count: 3,               // how many sources support it
 *   horizon_relevance: 4.2,        // average horizon_relevance of supporting sources
 *   threat_maturity: "growing",    // most common maturity across sources
 *   evidence: [
 *     {
 *       source_id, title, url, publisher, date_published,
 *       signal_text,               // the raw trend_signal string from this source
 *       key_facts: {               // extracted from analyst_brief fields
 *         what_happened, impact, why_it_matters
 *       },
 *       horizon_relevance,
 *       threat_maturity,
 *       tags,
 *     }
 *   ]
 * }
 */

// Keywords used to match signals into themes.
// Order matters: first match wins.
const THEME_KEYWORDS = [
  // Agentic / MCP
  { theme: "MCP and tool-use security risks",            words: ["mcp", "model context protocol", "tool-use", "tool use", "tool call", "tool invocation"] },
  { theme: "Agentic AI attack chains",                   words: ["agentic", "autonomous agent", "multi-agent", "agent chain", "agent workflow", "ai agent"] },
  { theme: "Coding assistant and IDE vulnerabilities",   words: ["coding assistant", "code assistant", "github copilot", "cursor", "ide", "code completion", "code generation"] },
  { theme: "Prompt injection at scale",                  words: ["prompt injection", "indirect injection", "prompt leak", "instruction injection"] },
  { theme: "RAG and retrieval poisoning",                words: ["rag", "retrieval-augmented", "retrieval augmented", "knowledge base poison", "retrieval poison"] },

  // LLM
  { theme: "Jailbreak and guardrail bypass",             words: ["jailbreak", "guardrail bypass", "safety bypass", "alignment bypass", "refusal bypass"] },
  { theme: "LLM data leakage and privacy",               words: ["data leakage", "training data", "memorisation", "pii leakage", "privacy leak", "data exfiltration"] },
  { theme: "Foundation model supply chain risks",        words: ["supply chain", "model weight", "hugging face", "model repo", "malicious model", "poisoned model"] },
  { theme: "LLM API abuse",                              words: ["api abuse", "llm api", "rate limit bypass", "token stuffing", "context window abuse"] },

  // AI-enabled attacks
  { theme: "AI-generated phishing and social engineering", words: ["phishing", "spear phishing", "social engineering", "business email compromise", "bec", "vishing"] },
  { theme: "Deepfakes and synthetic media",              words: ["deepfake", "synthetic media", "voice clone", "face swap", "video manipulation", "audio clone"] },
  { theme: "AI-assisted malware development",            words: ["ai malware", "llm malware", "polymorphic", "ai-generated malware", "malware generation"] },
  { theme: "AI-powered disinformation",                  words: ["disinformation", "misinformation", "influence operation", "synthetic content", "fake news"] },
  { theme: "Autonomous vulnerability scanning",          words: ["vulnerability scan", "autonomous exploit", "ai exploit", "automated exploit", "ai-assisted vulnerability"] },

  // Traditional ML / model attacks
  { theme: "Adversarial examples and evasion",           words: ["adversarial example", "adversarial input", "evasion attack", "perturbation", "adversarial patch"] },
  { theme: "Model extraction and IP theft",              words: ["model extraction", "model stealing", "ip theft", "model inversion", "membership inference"] },
  { theme: "Data poisoning and backdoor attacks",        words: ["data poison", "backdoor", "trojan model", "training poison", "clean-label"] },

  // Defensive / regulatory
  { theme: "AI security governance and regulation",      words: ["regulation", "governance", "nist ai", "eu ai act", "policy", "compliance", "framework", "standard"] },
  { theme: "AI-powered threat detection",                words: ["threat detection", "anomaly detection", "soc automation", "ai detection", "behavioural analytics"] },
  { theme: "Vulnerability disclosure and patching",      words: ["cve", "patch", "disclosure", "vulnerability disclosure", "security advisory", "zero-day"] },
];

const CATEGORY_ORDER = [
  "agentic_ai_threats",
  "llm_threats",
  "ai_enabled_threats",
  "traditional_ai_threats",
  "ai_for_security",
  "uncategorised",
];

function normalise(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function matchTheme(signalText) {
  const norm = normalise(signalText);
  for (const { theme, words } of THEME_KEYWORDS) {
    if (words.some((w) => norm.includes(w))) return theme;
  }
  return null; // no match → will fall into "Other signals"
}

function dominantValue(arr) {
  if (!arr.length) return null;
  const freq = new Map();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Build signal clusters for a single category's sources.
 * Returns clusters sorted by (source_count desc, horizon_relevance desc).
 */
function clusterCategorySources(sources) {
  // theme key → { evidence items, raw signal texts, relevance values, maturities }
  const themeMap = new Map();

  for (const source of sources) {
    const intel = source.intelligence || {};
    const signals = intel.trend_signals || [];
    const maturity = intel.threat_maturity || "unknown";
    const relevance = intel.horizon_relevance || 0;

    const keyFacts = {
      what_happened: source.analyst_brief?.what_happened || "",
      impact:        source.analyst_brief?.impact        || "",
      why_it_matters: source.analyst_brief?.why_it_matters || "",
    };

    // Track which themes this source already contributed to (one entry per theme)
    const sourceMappedThemes = new Set();

    for (const signal of signals) {
      const theme = matchTheme(signal) || "__other__";

      if (!themeMap.has(theme)) {
        themeMap.set(theme, { signals: [], evidence: [], relevances: [], maturities: [] });
      }

      const entry = themeMap.get(theme);
      entry.signals.push(signal);
      entry.relevances.push(relevance);
      entry.maturities.push(maturity);

      // Add source evidence only once per theme per source
      if (!sourceMappedThemes.has(theme)) {
        sourceMappedThemes.add(theme);
        entry.evidence.push({
          source_id:        source.id,
          title:            source.title,
          url:              source.url,
          publisher:        source.publisher,
          date_published:   source.date_published,
          signal_text:      signal,
          key_facts:        keyFacts,
          horizon_relevance: relevance,
          threat_maturity:  maturity,
          tags:             source.tags || [],
        });
      }
    }
  }

  const clusters = [];

  for (const [themeKey, data] of themeMap.entries()) {
    // Pick the longest signal as the theme label (most descriptive)
    const bestSignal = data.signals.reduce((a, b) => (b.length > a.length ? b : a), data.signals[0]);
    const avgRelevance = data.relevances.reduce((s, v) => s + v, 0) / data.relevances.length;

    clusters.push({
      theme:             themeKey === "__other__" ? "Other emerging signals" : themeKey,
      signal_count:      data.signals.length,
      source_count:      data.evidence.length,
      horizon_relevance: Math.round(avgRelevance * 10) / 10,
      threat_maturity:   dominantValue(data.maturities.filter((m) => m !== "unknown")) || "unknown",
      representative_signal: bestSignal,
      evidence:          data.evidence
        .sort((a, b) => (b.horizon_relevance || 0) - (a.horizon_relevance || 0))
        .slice(0, 6), // cap evidence per cluster to keep payload manageable
    });
  }

  return clusters.sort((a, b) => {
    if (b.source_count !== a.source_count) return b.source_count - a.source_count;
    return b.horizon_relevance - a.horizon_relevance;
  });
}

/**
 * Main export.
 * Returns:
 * {
 *   by_category: { [category]: cluster[] },
 *   all_clusters: cluster[]  (cross-category, deduplicated by theme)
 * }
 */
export function extractSignalsWithEvidence(sources) {
  // Group sources by category
  const byCat = {};
  for (const source of sources) {
    const cat = source.main_category || "uncategorised";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(source);
  }

  const byCategory = {};
  for (const cat of CATEGORY_ORDER) {
    if (byCat[cat]?.length) {
      byCategory[cat] = clusterCategorySources(byCat[cat]);
    }
  }
  // Any categories not in the fixed order
  for (const [cat, catSources] of Object.entries(byCat)) {
    if (!byCategory[cat]) {
      byCategory[cat] = clusterCategorySources(catSources);
    }
  }

  // Cross-category view: merge clusters with the same theme, combine evidence
  const themeAccum = new Map();
  for (const [cat, clusters] of Object.entries(byCategory)) {
    for (const cluster of clusters) {
      if (!themeAccum.has(cluster.theme)) {
        themeAccum.set(cluster.theme, {
          ...cluster,
          categories: [cat],
          evidence: [...cluster.evidence],
          _relevances: [cluster.horizon_relevance],
          _maturities: [cluster.threat_maturity],
        });
      } else {
        const existing = themeAccum.get(cluster.theme);
        existing.categories.push(cat);
        existing.signal_count  += cluster.signal_count;
        existing.source_count  += cluster.source_count;
        existing._relevances.push(cluster.horizon_relevance);
        existing._maturities.push(cluster.threat_maturity);
        // Merge evidence, deduplicate by source_id
        const seenIds = new Set(existing.evidence.map((e) => e.source_id));
        for (const ev of cluster.evidence) {
          if (!seenIds.has(ev.source_id)) {
            seenIds.add(ev.source_id);
            existing.evidence.push(ev);
          }
        }
      }
    }
  }

  const allClusters = [...themeAccum.values()].map((c) => {
    const avgRel = c._relevances.reduce((s, v) => s + v, 0) / c._relevances.length;
    return {
      theme:                 c.theme,
      signal_count:          c.signal_count,
      source_count:          c.source_count,
      categories:            [...new Set(c.categories)],
      horizon_relevance:     Math.round(avgRel * 10) / 10,
      threat_maturity:       dominantValue(c._maturities.filter((m) => m !== "unknown")) || "unknown",
      representative_signal: c.representative_signal,
      evidence:              c.evidence
        .sort((a, b) => (b.horizon_relevance || 0) - (a.horizon_relevance || 0))
        .slice(0, 8),
    };
  });

  allClusters.sort((a, b) => {
    if (b.source_count !== a.source_count) return b.source_count - a.source_count;
    return b.horizon_relevance - a.horizon_relevance;
  });

  return { by_category: byCategory, all_clusters: allClusters };
}
