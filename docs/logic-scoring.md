# Relevance and Importance Scoring Logic

## What it does

Scoring assigns each source two composite scores: **`priority_score`** (operational ranking for the dashboard) and **`report_score`** (strategic value for intelligence reports). A third derived value, **`priority_label`**, buckets the priority score into a human-readable tier.

Scoring runs after classification. It uses tags, main_category, source_type, trust_tier, and LLM-extracted intelligence fields. **No LLM is called during scoring** — it is purely deterministic.

---

## Two scores, two purposes

**`priority_score`** answers: *what should analysts read today?* It rewards breaking threats with confirmed exploitation, actionable detection artifacts, and content relevant to the Singapore/ASEAN jurisdiction. It penalises generic CVE noise and marketing content.

**`report_score`** answers: *what belongs in this week's or month's strategic report?* It rewards forward-looking signals, emerging threat maturity, structured intelligence density, and source credibility. It does not weight Singapore relevance or time sensitivity.

The two scores share `ai_security_relevance`, `source_credibility_score`, and `novelty_score` but diverge on operational vs. strategic dimensions.

---

## Priority score components (7, max 100)

### 1. AI security relevance — max 20

Scales `ai_specificity_score` (0–100) to 0–17, then adds a category bonus:

| Category | Bonus |
|---|---|
| `agentic_ai_threats`, `ai_enabled_threats` | +3 |
| `llm_threats` | +2 |
| `traditional_ai_threats` | +1 |
| `uncategorised` | capped at 4 total |

Fallback when classification hasn't run: uses `CATEGORY_BASE_RELEVANCE` (14–18 by category, 2 for uncategorised).

---

### 2. Severity — max 20

Scores concrete, verifiable threat signals only. Sentiment words ("critical breach") are not scored.

| Signal | Points |
|---|---|
| `actively_exploited` tag | +10 |
| Text regex: "actively exploited / exploited in the wild / zero-day exploit" | +8 |
| Text regex: "rce / remote code execution / execute arbitrary code" | +7 |
| `proof_of_concept` tag | +4 |
| Text regex: "proof-of-concept / exploit code released" | +3 |
| Each CVE identifier in text (capped at 5 pts) | +2 each |
| Each named threat actor from LLM intelligence (capped at 4 pts) | +2 each |
| Quantified impact ≥ million users/records | +4 |
| Quantified impact ≥ thousand | +2 |
| Each `HIGH_SEVERITY_TAGS` match (beyond the above) | +2 |
| Each `ELEVATED_SEVERITY_TAGS` match | +1 |

**`HIGH_SEVERITY_TAGS`**: `actively_exploited`, `proof_of_concept`, `agent_hijacking`, `mcp_exploitation`, `excessive_agency`, `prompt_injection`, `sensitive_data_disclosure`, `model_extraction`, `data_poisoning`

**`ELEVATED_SEVERITY_TAGS`**: `jailbreak`, `overreliance`, `rag_attack`, `ml_supply_chain`, `model_backdoor`, `insecure_output_handling`, `model_dos`, `deepfake`, `ai_generated_phishing`, `ai_generated_malware`, `voice_cloning`, `ai_reconnaissance`, `agent_memory_attack`, `multi_agent_attack`, `nation_state`, `supply_chain`

**Uncategorised cap**: if `main_category = "uncategorised"`, the effective severity contribution is capped at 8. This prevents generic CVE-dump sources from outranking AI-focused content.

---

### 3. Operational actionability — max 20

Rewards content analysts can act on immediately:

| Signal | Points |
|---|---|
| IOC/detection artifact: "indicators of compromise", "ioc", "yara rule", "sigma rule", "snort rule", "detection rule", "hunting query" | +6 |
| `analyst_brief.watch_points` ≥ 3 entries | +5 |
| `analyst_brief.watch_points` > 0 entries | +3 |
| `intelligence.key_entities.affected_products` ≥ 3 entries | +4 |
| `intelligence.key_entities.affected_products` > 0 entries | +2 |
| `source_type = government_advisory` | +4 |
| `source_type = vendor_advisory` | +3 |
| Patch or mitigation confirmed available | +3 |
| `critical_infrastructure` tag | +3 |
| Low-value signal detected | −5 |

**Low-value signals**: "product launch", "marketing", "sponsored content", "webinar", "thought leadership", "press release"

---

### 4. Novelty (information density) — max 15

*Database column is `novelty_score` for historical compatibility; the function is `scoreInformationDensity`.*

| Signal | Points |
|---|---|
| `source_type = research_paper` | +6 |
| `source_type = threat_intel` | +5 |
| `source_type = government_advisory` | +4 |
| `source_type = vendor_advisory` | +3 |
| `source_type = security_blog` | +1 |
| LLM-extracted CVEs (`intelligence.key_entities.cves`), +2 each, max 4 pts | +2 each |
| LLM-extracted threat actors > 0 | +2 |
| LLM-extracted trend signals (`intelligence.trend_signals`), max 3 pts | +1 each |
| CVE identifiers in raw text (capped at 3) | +1 each |
| Quantified claims with specific numbers (capped at 3) | +1 each |
| LLM-extracted claims ≥ 5 | +3 |
| LLM-extracted claims ≥ 2 | +1 |
| Low-value signal detected | −4 |

---

### 5. Source credibility — max 10

Direct lookup from `CREDIBILITY_BY_TIER`:

| Trust tier | Score |
|---|---|
| `primary` | 10 |
| `curated` | 9 |
| `high` | 8 |
| `medium` | 6 |
| `low` | 3 |
| `unknown` | 2 |

---

### 6. Singapore/ASEAN relevance — max 10

| Signal | Points |
|---|---|
| Each matched Singapore/ASEAN term in text | +3 each |
| `critical_infrastructure` tag | +2 |

**Terms checked**: "singapore", "csa singapore", "imda", "govtech", "asean", "southeast asia", "south-east asia", "critical information infrastructure"

---

### 7. Time sensitivity — max 5

| Signal | Points |
|---|---|
| `actively_exploited` tag | +3 |
| Published ≤ 24 hours ago | +5 |
| Published ≤ 72 hours ago | +3 |
| Published ≤ 168 hours (7 days) ago | +1 |

---

## Priority label thresholds

```
priority_score ≥ 85 → critical
priority_score ≥ 65 → high
priority_score ≥ 45 → medium
priority_score ≥ 25 → low
priority_score  < 25 → background
```

A representative `critical` profile: AI specificity (≥15) + confirmed exploitation (≥10) + source credibility (≥8) + operational signal. A source with only AI relevance and a good trust tier typically lands at `medium`.

---

## Report score components (5, max ~90)

### 1. AI security relevance — max 20

Same as priority score component 1.

---

### 2. Report quality — max 25

| Signal | Points |
|---|---|
| LLM `horizon_relevance` score (1–5) × 2 | up to 10 |
| LLM trend signals × 2, capped at 3 signals | up to 6 |
| `threat_maturity = emerging` | +4 |
| `threat_maturity = growing` | +2 |
| Named threat actors > 0 | +2 |
| Named CVEs (capped at 3) | +1 each |
| `analyst_brief` fields with substance ≥ 40 chars (max 5 fields) | +1 each |
| `source_type = research_paper` | +4 |
| `source_type = threat_intel` | +3 |
| `source_type = government_advisory` | +2 |
| Low-value signal detected | −6 |

---

### 3. Horizon signal — max 20

| Signal | Points |
|---|---|
| `threat_maturity = emerging` | +8 |
| `threat_maturity = growing` | +5 |
| LLM `horizon_relevance` (1–5) × 2 | up to 10 |
| `intelligence.report_tier = weekly` | +4 |
| `intelligence.report_tier = monthly` | +2 |

---

### 4. Source credibility — max 10

Same as priority score component 5.

---

### 5. Novelty (information density) — max 15

Same as priority score component 4.

---

## Priority reason

`priority_reason` is a human-readable explanation listing which components contributed meaningfully (severity ≥ 10, actionability ≥ 12, Singapore relevance ≥ 5, credibility ≥ 8, information density ≥ 10) and the source's non-generic tags. Surfaced in the dashboard to explain ranking.

---

## Score version

Current version: `priority-v5.0`. Stored in `score_version` column. All sources can be rescored in bulk via `POST /api/score-sources`.
