/**
 * LLM Discovery Connector
 *
 * Uses Gemini with Google Search grounding to surface real security URLs
 * that our RSS feeds miss — agentic AI attacks, MCP risks, prompt injection
 * in coding assistants, and emerging AI threat patterns.
 *
 * Grounding chunks (candidates[0].groundingMetadata.groundingChunks) contain
 * Google-verified URIs — not hallucinated. We treat each URI as a discovered
 * source and let the standard enrichment pipeline fill in full_text later.
 */

import { normalizeSource } from "../normalizeSource.js";

// Use the same model the enrichment pipeline targets
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const DISCOVERY_PROMPTS = [
  {
    label: "agentic-ai-security",
    text: `You are a cybersecurity researcher. Use Google Search to find the most recent (2025-2026) security research, vulnerability disclosures, and incident reports about AI agent security. Look specifically for:

- AI agent jailbreaks, goal hijacking, and privilege escalation
- Autonomous agent exploitation and multi-step attack chains
- Coding assistant vulnerabilities: GitHub Copilot, Cursor, Claude Code, Amazon Q, Gemini CLI, Windsurf
- Multi-agent system attacks and cross-agent prompt injection
- Specific CVEs, PoC exploits, and researcher disclosures about AI agents
- Security advisories from AI labs, CERT, and government agencies about agentic AI risks

Provide a detailed summary of the security landscape and cite the specific articles, research papers, and advisories you found.`,
  },
  {
    label: "mcp-security",
    text: `You are a cybersecurity researcher. Use Google Search to find recent (2025-2026) security research and vulnerability reports about the Model Context Protocol (MCP). Look specifically for:

- MCP server vulnerabilities and attack surfaces
- Tool poisoning attacks via malicious MCP servers
- Prompt injection through MCP tool responses
- Supply chain risks in MCP server ecosystems
- Security advisories and CVEs related to MCP implementations
- Researcher disclosures about MCP security weaknesses
- Real-world incidents involving MCP exploitation

Provide a detailed summary and cite the specific sources you found.`,
  },
  {
    label: "prompt-injection-coding-assistants",
    text: `You are a cybersecurity researcher. Use Google Search to find recent (2025-2026) research on prompt injection and indirect injection attacks targeting AI coding tools. Look specifically for:

- "Comment and Control" attack technique and similar research
- Indirect prompt injection via code comments, README files, or documentation
- Attack chains that hijack coding agents to exfiltrate secrets or execute malicious actions
- GitHub Copilot, Cursor, VS Code AI extension security vulnerabilities
- Security research on AI-assisted development risks
- Specific CVE disclosures and researcher blogs about these attack patterns

Provide a detailed summary and cite the specific sources you found.`,
  },
  {
    label: "ai-threat-landscape-2026",
    text: `You are a threat intelligence analyst. Use Google Search to find recent (2025-2026) reports on the AI-enabled threat landscape. Look specifically for:

- Nation-state use of AI in offensive cyber operations
- AI-powered phishing, spear-phishing, and BEC campaigns with documented cases
- LLM-powered malware, AI worms, and self-propagating attack tools
- AI model supply chain attacks: poisoned training data, malicious fine-tunes, backdoored models
- Deepfake fraud incidents: executive impersonation, voice cloning attacks
- Emerging AI red-teaming techniques and offensive AI toolkits

Provide a threat intelligence summary and cite the specific reports, papers, and advisories you found.`,
  },
];

function extractDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Map common domains to readable publisher names
    const domainMap = {
      "arxiv.org": "arXiv",
      "github.com": "GitHub",
      "blog.langchain.dev": "LangChain Blog",
      "huggingface.co": "Hugging Face",
      "openai.com": "OpenAI",
      "anthropic.com": "Anthropic",
      "deepmind.google": "Google DeepMind",
      "research.google": "Google Research",
      "microsoft.com": "Microsoft",
      "security.googleblog.com": "Google Security Blog",
      "therecord.media": "The Record",
      "bleepingcomputer.com": "BleepingComputer",
      "securityweek.com": "SecurityWeek",
      "darkreading.com": "Dark Reading",
      "wired.com": "Wired",
      "arstechnica.com": "Ars Technica",
      "techcrunch.com": "TechCrunch",
      "embracethered.com": "Embrace The Red",
      "simonwillison.net": "Simon Willison",
      "trailofbits.com": "Trail of Bits",
      "hiddenlayer.com": "HiddenLayer",
      "lakera.ai": "Lakera AI",
      "protectai.com": "Protect AI",
      "adversa.ai": "Adversa AI",
      "bishopfox.com": "Bishop Fox",
      "nvd.nist.gov": "NVD",
      "cisa.gov": "CISA",
      "ncsc.gov.uk": "NCSC",
    };
    return domainMap[host] || host;
  } catch {
    return "Unknown";
  }
}

// Removed inferDateFromUrl — LLM discovery sources always use collection time
// so they are guaranteed to fall within the current window. URL-derived dates
// may be months old (e.g. /2025/01/) and would cause the source to be silently
// dropped by the publish-date window filter.

async function runPrompt({ label, text }, apiKey, signal) {
  try {
    const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });

    if (!res.ok) {
      console.warn(`  LLM discovery "${label}" API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    if (chunks.length === 0) {
      console.warn(`  LLM discovery "${label}" — no grounding chunks returned`);
      return [];
    }

    const seen = new Set();
    const sources = [];
    const now = new Date().toISOString();

    for (const chunk of chunks) {
      const url = chunk?.web?.uri;
      const title = (chunk?.web?.title || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const publisher = extractDomain(url);
      const datePublished = now;

      sources.push(
        normalizeSource({
          title: title || url,
          url,
          publisher,
          author: "",
          date_published: datePublished,
          source_type: "security_blog",
          full_text: "",
          trust_tier: "medium",
          collection_metadata: {
            connector_name: "LLM Discovery",
            retrieval_method: "llm_discovery",
            trust_tier: "medium",
            discovery_prompt_label: label,
            collected_at: now,
          },
        })
      );
    }

    console.log(`  LLM discovery "${label}" → ${sources.length} URLs from grounding`);
    return sources;
  } catch (err) {
    if (err.name === "AbortError") return [];
    console.warn(`  LLM discovery "${label}" error: ${err.message}`);
    return [];
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchLlmDiscoverySources(options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("LLM discovery skipped: GEMINI_API_KEY not set");
    return [];
  }

  console.log("  Running LLM discovery (Gemini + Google Search grounding)…");

  // Run prompts sequentially with a delay to stay under Gemini's 10 RPM limit.
  // Sequential also allows the connector timeout to abort early cleanly.
  const seenUrls = new Set();
  const allSources = [];

  for (let i = 0; i < DISCOVERY_PROMPTS.length; i++) {
    if (options.signal?.aborted) break;

    const results = await runPrompt(DISCOVERY_PROMPTS[i], apiKey, options.signal);
    for (const source of results) {
      if (!seenUrls.has(source.url)) {
        seenUrls.add(source.url);
        allSources.push(source);
      }
    }

    // 7s between prompts keeps us safely under 10 RPM
    if (i < DISCOVERY_PROMPTS.length - 1 && !options.signal?.aborted) {
      await sleep(7000);
    }
  }

  console.log(`  LLM discovery total: ${allSources.length} unique URLs`);
  return allSources;
}
