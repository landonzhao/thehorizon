/**
 * Cleaning, archiving, and trust logic tests — no network calls, no DB.
 * Run with: node tests/cleaning.test.js
 */

import assert from "node:assert/strict";
import { extractStructuredContent } from "../lib/cleaning/extractStructuredContent.js";
import { cleanPlaintext } from "../lib/cleaning/cleanPlaintext.js";
import { cleanSources, CLEANING_VERSION } from "../lib/cleaning/cleanSources.js";
import { scoreSource } from "../lib/scoring/scoreSource.js";
import { CREDIBILITY_BY_TIER } from "../lib/scoring/relevanceRules.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── extractStructuredContent ──────────────────────────────────────────────────

console.log("\nextractStructuredContent");

test("code blocks with CVE IOCs are extracted and content preserved inline", () => {
  const raw = [
    "Here is a PoC for CVE-2024-99999.",
    "",
    "```python",
    "# Exploit for CVE-2024-99999",
    "import requests",
    'payload = "\' OR 1=1--"',
    'requests.get("http://192.168.1.1/vuln", params={"q": payload})',
    "```",
    "",
    "The IP 192.168.1.1 was observed in the attack.",
  ].join("\n");

  const { code_blocks, iocs, processedText } = extractStructuredContent(raw);

  assert.equal(code_blocks.length, 1);
  assert.equal(code_blocks[0].language, "python");
  assert.ok(code_blocks[0].content.includes("CVE-2024-99999"), "CVE in code block content");

  assert.ok(iocs.cves.includes("CVE-2024-99999"), "CVE in iocs.cves");
  assert.ok(iocs.ips.includes("192.168.1.1"), "IP in iocs.ips");

  assert.ok(processedText.includes("CVE-2024-99999"), "CVE inline in processedText");
  assert.ok(processedText.includes("192.168.1.1"), "IP inline in processedText");
  assert.ok(!processedText.includes("```"), "backtick markers stripped");
});

test("multiple fenced code blocks each captured separately", () => {
  const raw = [
    "```bash",
    "curl -X POST http://target.example/api",
    "```",
    "",
    "Some prose.",
    "",
    "```json",
    '{"exploit": true}',
    "```",
  ].join("\n");

  const { code_blocks } = extractStructuredContent(raw);
  assert.equal(code_blocks.length, 2);
  assert.equal(code_blocks[0].language, "bash");
  assert.equal(code_blocks[1].language, "json");
});

test("SHA-256 hashes near label words are extracted", () => {
  const longHash = "a".repeat(64);
  const raw = `SHA-256: ${longHash} was the file hash.`;
  const { iocs } = extractStructuredContent(raw);
  assert.equal(iocs.hashes.sha256.length, 1);
  assert.equal(iocs.hashes.sha256[0], longHash);
});

test("empty input returns safe empty structure", () => {
  const { code_blocks, iocs, processedText } = extractStructuredContent("");
  assert.equal(code_blocks.length, 0);
  assert.equal(iocs.cves.length, 0);
  assert.equal(processedText, "");
});

// ── cleanPlaintext ────────────────────────────────────────────────────────────

console.log("\ncleanPlaintext");

test("LaTeX-heavy arXiv abstract keeps useful prose words", () => {
  const abstract = [
    "We propose a defense against adversarial examples. Given $n=1000$ training",
    "samples, our method achieves $\\geq 95\\%$ accuracy. We use $\\frac{1}{2}$",
    "of the dataset for validation and $\\mathbf{W} \\in \\mathbb{R}^{d \\times k}$",
    "as the weight matrix. Our approach outperforms baseline by 12 percentage points.",
  ].join("\n");

  const cleaned = cleanPlaintext(abstract);

  assert.ok(cleaned.includes("adversarial examples"), "prose preserved");
  assert.ok(cleaned.includes("accuracy"), "accuracy preserved");
  assert.ok(cleaned.includes("defense"), "defense preserved");
  assert.ok(cleaned.includes("12 percentage points"), "numbers preserved");
  assert.ok(!cleaned.includes("\\mathbf"), "complex LaTeX stripped");
  assert.ok(!cleaned.includes("\\mathbb"), "\\mathbb stripped");
  assert.ok(!cleaned.includes("\\frac"), "\\frac stripped");
});

test("display math blocks are fully stripped", () => {
  const text = [
    "Introduction.",
    "",
    "$$\\sum_{i=1}^{n} x_i^2 + \\int_0^\\infty e^{-x} dx = \\Gamma(1)$$",
    "",
    "Conclusion.",
  ].join("\n");

  const cleaned = cleanPlaintext(text);
  assert.ok(!cleaned.includes("\\sum"), "display math stripped");
  assert.ok(!cleaned.includes("\\int"), "display math stripped");
  assert.ok(cleaned.includes("Introduction"), "prose before kept");
  assert.ok(cleaned.includes("Conclusion"), "prose after kept");
});

test("HTML tags, script blocks, and entities stripped from feed content", () => {
  const html = [
    "<p>Alert: &amp; <strong>CVE-2025-1234</strong> is &lt;critical&gt;.</p>",
    "<script>evil()</script>",
  ].join("\n");

  const cleaned = cleanPlaintext(html);
  assert.ok(!cleaned.includes("<p>"), "HTML tags stripped");
  assert.ok(!cleaned.includes("<script>"), "script block stripped");
  assert.ok(!cleaned.includes("evil()"), "script content stripped");
  assert.ok(cleaned.includes("CVE-2025-1234"), "CVE ID preserved");
  assert.ok(cleaned.includes("&"), "& entity decoded");
  assert.ok(cleaned.includes("critical"), "text content preserved");
});

// ── cleanSources (idempotency and non-destructive pass) ───────────────────────

console.log("\ncleanSources");

test("sources already stamped with current CLEANING_VERSION are returned unchanged", () => {
  const source = {
    id: "abc",
    title: "Test",
    full_text: "some text",
    raw_text: "some text",
    cleaning_version: CLEANING_VERSION,
    extracted_code_blocks: [{ language: "python", content: "x = 1" }],
  };

  const [result] = cleanSources([source]);
  assert.equal(result, source, "same object reference returned (idempotent)");
  assert.equal(result.extracted_code_blocks.length, 1, "code blocks not wiped");
});

test("sources without cleaning_version are cleaned and stamped", () => {
  const source = {
    id: "xyz",
    title: "  Spaced Title  ",
    full_text: "Hello <b>world</b>",
    raw_text: "Hello <b>world</b>",
    raw_html: "",
  };

  const [result] = cleanSources([source]);
  assert.equal(result.cleaning_version, CLEANING_VERSION);
  assert.ok(!result.clean_text.includes("<b>"), "HTML stripped in clean_text");
  assert.equal(result.raw_text, "Hello <b>world</b>", "raw_text unchanged");
  assert.deepEqual(result.extracted_code_blocks, []);
});

test("code block content is preserved inline after cleaning", () => {
  const raw = [
    "Analysis of CVE-2025-1111.",
    "```python",
    "exploit(target='192.0.2.1')",
    "```",
    "End of report.",
  ].join("\n");

  const source = { id: "c1", title: "Test", raw_text: raw, full_text: raw };
  const [result] = cleanSources([source]);

  assert.ok(result.clean_text.includes("CVE-2025-1111"), "CVE preserved in clean_text");
  assert.ok(result.clean_text.includes("192.0.2.1"), "IP preserved inline");
  assert.ok(!result.clean_text.includes("```"), "backtick markers removed");
  assert.equal(result.extracted_code_blocks.length, 1, "code block extracted");
  assert.ok(result.extracted_iocs.cves.includes("CVE-2025-1111"), "CVE in extracted iocs");
});

// ── Curated scoring — not auto-ranked high ────────────────────────────────────

console.log("\ncurated source scoring");

test("curated tier credibility score equals medium (not boosted)", () => {
  assert.equal(
    CREDIBILITY_BY_TIER.curated,
    CREDIBILITY_BY_TIER.medium,
    "curated should score equal to medium"
  );
  assert.ok(
    CREDIBILITY_BY_TIER.curated < CREDIBILITY_BY_TIER.high,
    "curated should score below high"
  );
  assert.ok(
    CREDIBILITY_BY_TIER.curated < CREDIBILITY_BY_TIER.primary,
    "curated should score below primary"
  );
});

test("curated weak source scores lower than primary source with strong signals", () => {
  const curatedSource = {
    id: "c1",
    title: "Curated background reading",
    url: "https://curated.example.com/article",
    publisher: "Curated Publisher",
    trust_tier: "curated",
    tags: ["ai_policy"],
    main_category: "ai_for_security",
    ai_specificity_score: 20,
    relevance_tier: "adjacent",
    date_published: new Date().toISOString(),
    full_text: "Background reading on AI governance frameworks.",
    validity: { structural_validity_score: 55, publisher_trust_score: 6 },
  };

  const primarySource = {
    id: "p1",
    title: "CISA Advisory: Critical Prompt Injection Vulnerability",
    url: "https://www.cisa.gov/advisory",
    publisher: "CISA",
    trust_tier: "primary",
    tags: ["prompt_injection", "actively_exploited"],
    main_category: "llm_threats",
    ai_specificity_score: 90,
    relevance_tier: "core",
    date_published: new Date().toISOString(),
    full_text: "x".repeat(300),
    validity: { structural_validity_score: 75, publisher_trust_score: 10 },
  };

  const curatedScored = scoreSource(curatedSource);
  const primaryScored = scoreSource(primarySource);

  assert.ok(
    primaryScored.priority_score > curatedScored.priority_score,
    `Primary (${primaryScored.priority_score}) should outscore curated (${curatedScored.priority_score})`
  );
});

test("trust tier does not affect source_credibility_score for non-primary tiers", () => {
  // curated and medium should produce the same source_credibility_score
  const base = {
    id: "s1",
    title: "Test Source",
    url: "https://example.com/article",
    publisher: "Example",
    tags: [],
    main_category: "llm_threats",
    ai_specificity_score: 50,
    relevance_tier: "core",
    date_published: new Date().toISOString(),
    full_text: "Some text about prompt injection vulnerabilities.",
    validity: { structural_validity_score: 55, publisher_trust_score: 6 },
  };

  const curatedScored = scoreSource({ ...base, trust_tier: "curated" });
  const mediumScored  = scoreSource({ ...base, trust_tier: "medium"  });

  assert.equal(
    curatedScored.source_credibility_score,
    mediumScored.source_credibility_score,
    "curated and medium produce identical source_credibility_score"
  );
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
