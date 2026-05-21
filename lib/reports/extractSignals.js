/**
 * Signal extraction and clustering.
 *
 * Strategy:
 *  1. For each trend_signal from LLM enrichment, try keyword matching against
 *     THEME_KEYWORDS (expanded patterns).
 *  2. If no keyword match, fall back to tag-based theme matching using the
 *     source's controlled-vocabulary tags.
 *  3. If both fail, assign to a per-category unmatched bucket (never merged
 *     cross-category — it won't pollute convergence analysis).
 *
 * Output: { by_category: { [cat]: cluster[] }, all_clusters: cluster[] }
 * all_clusters omits per-category unmatched buckets.
 */

// ── Theme keyword patterns ────────────────────────────────────────────────────
// Order matters: first match wins. Broader patterns first to catch LLM-generated
// free-text like "the increasing use of AI in exploiting vulnerabilities".

const THEME_KEYWORDS = [
  // MCP / tool-use
  { theme: "MCP and tool-use security",
    words: ["mcp", "model context protocol", "tool-use", "tool use", "tool call",
            "tool invocation", "function call", "tool chaining", "tool integration"] },

  // Agentic AI
  { theme: "Agentic AI attack chains",
    words: ["agentic", "autonomous agent", "multi-agent", "agent chain",
            "agent workflow", "ai agent", "agent framework", "agent-based",
            "agent execution", "autonomous ai", "autonomous system"] },

  // Coding assistants
  { theme: "AI coding assistant risks",
    words: ["coding assistant", "code assistant", "github copilot", "cursor",
            "code completion", "code generation", "ai-generated code",
            "software development", "ide vulnerability"] },

  // Prompt injection
  { theme: "Prompt injection attacks",
    words: ["prompt injection", "indirect injection", "prompt leak",
            "instruction injection", "prompt override", "prompt hijack",
            "system prompt", "jailbreak via prompt"] },

  // RAG / retrieval
  { theme: "RAG and retrieval poisoning",
    words: ["rag", "retrieval-augmented", "retrieval augmented",
            "knowledge base poison", "retrieval poison", "vector database",
            "embedding poisoning", "knowledge graph attack"] },

  // Jailbreak / safety bypass
  { theme: "Jailbreak and safety bypass",
    words: ["jailbreak", "guardrail bypass", "safety bypass", "alignment bypass",
            "refusal bypass", "uncensored", "model bypass", "safety circumvent",
            "restriction bypass", "content filter bypass"] },

  // LLM privacy / data leakage
  { theme: "LLM data leakage and privacy",
    words: ["data leakage", "training data", "memorisation", "memorization",
            "pii", "privacy leak", "data exfiltration", "inference attack",
            "membership inference", "personal data", "sensitive data exposure"] },

  // Supply chain
  { theme: "AI supply chain compromise",
    words: ["supply chain", "model weight", "hugging face", "model repo",
            "malicious model", "poisoned model", "dependency confusion",
            "package tampering", "model distribution", "model hub"] },

  // Credential / identity
  { theme: "Credential theft and privilege escalation",
    words: ["credential", "privilege escalation", "authentication bypass",
            "identity fraud", "account takeover", "access token",
            "session hijack", "identity theft", "lateral movement", "persistence"] },

  // AI-generated phishing
  { theme: "AI-powered phishing and social engineering",
    words: ["phishing", "spear phishing", "social engineering",
            "business email compromise", "bec", "vishing", "smishing",
            "deception", "impersonation", "pretexting"] },

  // Deepfakes / synthetic media
  { theme: "Deepfakes and synthetic media",
    words: ["deepfake", "synthetic media", "voice clone", "face swap",
            "video manipulation", "audio clone", "synthetic video",
            "synthetic voice", "generative media", "ai-generated image"] },

  // AI-assisted malware
  { theme: "AI-assisted malware development",
    words: ["ai malware", "llm malware", "polymorphic", "ai-generated malware",
            "malware generation", "ransomware", "worm", "autonomous malware",
            "ai shellcode", "malware automation"] },

  // Disinformation
  { theme: "AI-generated disinformation",
    words: ["disinformation", "misinformation", "influence operation",
            "synthetic content", "fake news", "propaganda",
            "narrative manipulation", "astroturfing"] },

  // Autonomous exploitation / vulnerability scanning
  { theme: "Autonomous vulnerability exploitation",
    words: ["vulnerability scan", "autonomous exploit", "ai exploit",
            "automated exploit", "ai-assisted vulnerability", "penetration test",
            "zero-day", "exploit chain", "exploit", "vulnerability discover"] },

  // Adversarial ML
  { theme: "Adversarial examples and evasion attacks",
    words: ["adversarial example", "adversarial input", "evasion attack",
            "perturbation", "adversarial patch", "bypass detector",
            "model robustness", "adversarial ml", "adversarial attack"] },

  // Model extraction / IP theft
  { theme: "Model extraction and IP theft",
    words: ["model extraction", "model stealing", "ip theft", "model inversion",
            "knowledge distillation attack", "model cloning", "model privacy"] },

  // Data poisoning / backdoors
  { theme: "Data poisoning and backdoor attacks",
    words: ["data poison", "backdoor", "trojan model", "training poison",
            "clean-label", "data integrity", "corrupted training", "data manipulation"] },

  // Governance / regulation
  { theme: "AI security governance and regulation",
    words: ["regulation", "governance", "nist ai", "eu ai act", "policy",
            "compliance", "framework", "standard", "responsible ai",
            "ai safety policy", "risk management", "ai act"] },

  // Defensive AI / detection
  { theme: "AI-powered threat detection and defence",
    words: ["threat detection", "anomaly detection", "soc automation",
            "ai detection", "behavioural analytics", "threat hunting",
            "intrusion detection", "security operations", "ai for defence",
            "defensive ai", "security automation"] },

  // CVE / disclosure
  { theme: "Security vulnerability disclosure",
    words: ["cve", "patch", "disclosure", "vulnerability disclosure",
            "security advisory", "security update", "security bulletin",
            "responsible disclosure"] },

  // Embodied AI / robotics
  { theme: "AI robotics and embodied system threats",
    words: ["robot", "embodied", "autonomous vehicle", "drone",
            "physical world", "robotic", "physical system", "cyberphysical",
            "robojailbreak", "embodied ai"] },

  // Critical infrastructure
  { theme: "Critical infrastructure AI risks",
    words: ["critical infrastructure", "ics", "scada", "operational technology",
            "ot security", "industrial control", "power grid", "water system",
            "energy sector", "industrial ai"] },

  // LLM reasoning manipulation
  { theme: "LLM reasoning and logic manipulation",
    words: ["chain of thought", "reasoning", "logic manipulation",
            "hallucination exploit", "fact fabrication", "output manipulation",
            "confabulation", "model hallucination"] },

  // Benchmarking / red teaming
  { theme: "AI red-teaming and safety evaluation",
    words: ["benchmark", "red team", "safety evaluation", "model assessment",
            "testing framework", "ai red teaming", "safety benchmark",
            "adversarial evaluation"] },
];

// ── Tag-based fallback themes ─────────────────────────────────────────────────
// Used when LLM signals don't match any keyword.
// Source tags are controlled vocabulary, so more reliable than free-text matching.

const TAG_THEME_MAP = [
  { tags: ["mcp_risk"],              theme: "MCP and tool-use security" },
  { tags: ["autonomous_agent"],      theme: "Agentic AI attack chains" },
  { tags: ["prompt_injection"],      theme: "Prompt injection attacks" },
  { tags: ["rag_poisoning"],         theme: "RAG and retrieval poisoning" },
  { tags: ["jailbreak"],             theme: "Jailbreak and safety bypass" },
  { tags: ["data_poisoning"],        theme: "Data poisoning and backdoor attacks" },
  { tags: ["backdoor"],              theme: "Data poisoning and backdoor attacks" },
  { tags: ["adversarial"],           theme: "Adversarial examples and evasion attacks" },
  { tags: ["deepfake", "voice_clone"], theme: "Deepfakes and synthetic media" },
  { tags: ["phishing"],              theme: "AI-powered phishing and social engineering" },
  { tags: ["model_extraction"],      theme: "Model extraction and IP theft" },
  { tags: ["supply_chain"],          theme: "AI supply chain compromise" },
  { tags: ["malware"],               theme: "AI-assisted malware development" },
  { tags: ["rce"],                   theme: "Autonomous vulnerability exploitation" },
  { tags: ["vulnerability"],         theme: "Autonomous vulnerability exploitation" },
  { tags: ["disinformation"],        theme: "AI-generated disinformation" },
  { tags: ["governance", "policy"],  theme: "AI security governance and regulation" },
  { tags: ["defensive_ai"],          theme: "AI-powered threat detection and defence" },
  { tags: ["critical_infrastructure"], theme: "Critical infrastructure AI risks" },
  { tags: ["research"],              theme: "AI red-teaming and safety evaluation" },
];

const CATEGORY_LABELS_SHORT = {
  agentic_ai_threats:     "Agentic AI",
  llm_threats:            "LLM threats",
  ai_enabled_threats:     "AI-enabled attacks",
  traditional_ai_threats: "Traditional ML attacks",
  ai_for_security:        "AI defence",
  uncategorised:          "general signals",
};

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
  return null;
}

function tagBasedTheme(source) {
  const tags = new Set(source.tags || []);
  for (const entry of TAG_THEME_MAP) {
    if (entry.tags.some((t) => tags.has(t))) return entry.theme;
  }
  return null;
}

function dominantValue(arr) {
  if (!arr.length) return null;
  const freq = new Map();
  for (const v of arr) freq.set(v, (freq.get(v) || 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function addToTheme(themeMap, themeKey, signalText, relevance, maturity, source, keyFacts, sourceMappedThemes) {
  if (!themeMap.has(themeKey)) {
    themeMap.set(themeKey, { signals: [], evidence: [], relevances: [], maturities: [] });
  }
  const entry = themeMap.get(themeKey);
  entry.signals.push(signalText);
  entry.relevances.push(relevance);
  entry.maturities.push(maturity);

  if (!sourceMappedThemes.has(themeKey)) {
    sourceMappedThemes.add(themeKey);
    entry.evidence.push({
      source_id:         source.id,
      title:             source.title,
      url:               source.url,
      publisher:         source.publisher,
      date_published:    source.date_published,
      signal_text:       signalText,
      key_facts:         keyFacts,
      horizon_relevance: relevance,
      threat_maturity:   maturity,
      tags:              source.tags || [],
    });
  }
}

/**
 * Build signal clusters for a single category's sources.
 */
function clusterCategorySources(sources, categoryKey) {
  const themeMap = new Map();
  const UNMATCHED_KEY = `__unmatched_${categoryKey}`;

  for (const source of sources) {
    const intel       = source.intelligence || {};
    const signals     = intel.trend_signals || [];
    const maturity    = intel.threat_maturity || "unknown";
    const relevance   = intel.horizon_relevance || 0;
    const keyFacts    = {
      what_happened:  source.analyst_brief?.what_happened  || "",
      impact:         source.analyst_brief?.impact         || "",
      why_it_matters: source.analyst_brief?.why_it_matters || "",
    };

    const sourceMappedThemes = new Set();

    // Step 1: keyword matching on each signal
    for (const signal of signals) {
      const theme = matchTheme(signal);
      if (theme) {
        addToTheme(themeMap, theme, signal, relevance, maturity, source, keyFacts, sourceMappedThemes);
      }
    }

    // Step 2: if no signal matched a keyword, try tag-based fallback
    if (sourceMappedThemes.size === 0) {
      const tagTheme = tagBasedTheme(source);
      if (tagTheme) {
        const signalText = signals[0] || source.title;
        addToTheme(themeMap, tagTheme, signalText, relevance, maturity, source, keyFacts, sourceMappedThemes);
      } else if (signals.length > 0) {
        // Truly unmatched enriched source — put in per-category bucket
        addToTheme(themeMap, UNMATCHED_KEY, signals[0], relevance, maturity, source, keyFacts, sourceMappedThemes);
      }
      // Unenriched sources (no signals, no tags match): skip — not useful in clusters
    }
  }

  const clusters = [];

  for (const [themeKey, data] of themeMap.entries()) {
    const bestSignal  = data.signals[0] || "";
    const avgRelevance = data.relevances.reduce((s, v) => s + v, 0) / data.relevances.length;
    const catLabel     = CATEGORY_LABELS_SHORT[categoryKey] || categoryKey;

    clusters.push({
      theme:             themeKey === UNMATCHED_KEY
        ? `Other ${catLabel} signals`
        : themeKey,
      _key:              themeKey,  // keep internal key for filtering in all_clusters
      signal_count:      data.signals.length,
      source_count:      data.evidence.length,
      horizon_relevance: Math.round(avgRelevance * 10) / 10,
      threat_maturity:   dominantValue(data.maturities.filter((m) => m !== "unknown")) || "unknown",
      representative_signal: bestSignal,
      evidence: data.evidence
        .sort((a, b) => (b.horizon_relevance || 0) - (a.horizon_relevance || 0))
        .slice(0, 6),
    });
  }

  return clusters.sort((a, b) => {
    if (b.source_count !== a.source_count) return b.source_count - a.source_count;
    return (b.horizon_relevance || 0) - (a.horizon_relevance || 0);
  });
}

/**
 * Main export.
 */
export function extractSignalsWithEvidence(sources) {
  const byCat = {};
  for (const source of sources) {
    const cat = source.main_category || "uncategorised";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(source);
  }

  const byCategory = {};
  for (const cat of CATEGORY_ORDER) {
    if (byCat[cat]?.length) {
      byCategory[cat] = clusterCategorySources(byCat[cat], cat);
    }
  }
  for (const [cat, catSources] of Object.entries(byCat)) {
    if (!byCategory[cat]) {
      byCategory[cat] = clusterCategorySources(catSources, cat);
    }
  }

  // Cross-category view: merge same-theme clusters, exclude per-category unmatched
  const themeAccum = new Map();

  for (const [cat, clusters] of Object.entries(byCategory)) {
    for (const cluster of clusters) {
      // Skip per-category unmatched buckets from cross-category view
      if (cluster._key?.startsWith("__unmatched_")) continue;

      if (!themeAccum.has(cluster.theme)) {
        themeAccum.set(cluster.theme, {
          ...cluster,
          categories:  [cat],
          evidence:    [...cluster.evidence],
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
    return (b.horizon_relevance || 0) - (a.horizon_relevance || 0);
  });

  // Strip internal _key from by_category clusters before returning
  for (const clusters of Object.values(byCategory)) {
    for (const c of clusters) delete c._key;
  }

  return { by_category: byCategory, all_clusters: allClusters };
}
