# Relevance and Importance Scoring Logic

## What it does

Scoring assigns each source two composite scores: **`priority_score`** (operational ranking for the dashboard) and **`report_score`** (strategic value for intelligence reports). A third derived value, **`priority_label`**, buckets the priority score into a human-readable tier.

Scoring runs after classification. The current v6 system operates in two phases:

1. **LLM extraction** — a lightweight LLM call identifies `publisher_type`, `event_type`, `evidence_level`, `exploitation_status`, `affected_ai_layer`, `attack_novelty`, and `geographic_scope`. These signals are stored in `llm_extracted_intelligence` (JSONB).
2. **Deterministic type-aware scoring** — the extracted signals plus existing classification fields drive a fully deterministic scorer. No LLM is called in this phase.

The v5 scorer (`scoreSource.js`) is retained for backward compatibility. V6 is activated via `useV6: true` in `scoreStoredSources()` or `?use_v6=true` on the API endpoint.

---

## Two scores, two purposes

**`priority_score`** answers: *what should analysts read today?* It rewards breaking threats with confirmed exploitation, actionable detection artifacts, and content relevant to the Singapore/ASEAN jurisdiction. It penalises generic CVE noise and marketing content.

**`report_score`** answers: *what belongs in this week's or month's strategic report?* It rewards forward-looking signals, emerging threat maturity, structured intelligence density, and source credibility. It does not weight Singapore relevance or time sensitivity.

The two scores share `ai_security_relevance`, `source_credibility_score`, and `novelty_score` but diverge on operational vs. strategic dimensions.

---

## Phase 1: LLM extraction (`extractSourceIntelligence.js`)

A short, structured prompt asks an LLM to classify the source on 7 dimensions. The source's title, publisher, source_type, date, existing tags, and up to 4,000 characters of full text are provided. Response is validated against an allowed-values set; invalid values default to safe fallbacks.

**Extracted fields:**

| Field | Allowed values |
|---|---|
| `publisher_type` | `government_agency`, `academic`, `major_vendor`, `security_vendor`, `threat_intel_firm`, `news_media`, `independent_researcher`, `community_aggregator`, `unknown` |
| `event_type` | `active_exploitation`, `vulnerability_disclosure`, `research_finding`, `threat_actor_report`, `policy_advisory`, `incident_report`, `analysis_essay`, `product_announcement`, `low_value_noise`, `unrelated` |
| `evidence_level` | `confirmed_exploitation`, `attributed_incident`, `poc_available`, `vendor_confirmed`, `theoretical`, `unverified_claim` |
| `exploitation_status` | `exploited_in_wild`, `poc_available`, `not_exploited`, `unknown` |
| `affected_ai_layer` | `llm_inference`, `agent_orchestration`, `training_pipeline`, `model_weights`, `plugin_tool`, `mcp_server`, `embedding_model`, `inference_api` |
| `attack_novelty` | `novel_technique`, `new_variant`, `known_technique_new_target`, `established` |
| `geographic_scope` | free-form lowercase strings (`"singapore"`, `"asean"`, `"us"`, etc.) |

**Idempotency:** if `source.llm_extracted_intelligence.event_type` is already set, extraction is skipped — no API call is made.

**Provider rotation:** OpenAI (structured JSON schema output) → OpenAI-2 → Groq (JSON mode) → Gemini Flash → Gemini 2.5 Flash → Gemini Flash-2 → Gemini 2.5-2. Same quota/rate-limit handling as the enrichment pipeline.

---

## Phase 2: Deterministic scoring (`scoreSourceV6.js`)

### Priority score components (7, max 100 before caps)

#### 1. AI security relevance — max 20

Scales `ai_specificity_score` (0–100) → 0–17, then adds a category bonus:

| Category | Bonus |
|---|---|
| `agentic_ai_threats`, `ai_enabled_threats` | +3 |
| `llm_threats` | +2 |
| `traditional_ai_threats` | +1 |
| `uncategorised` | capped at 4 total |

Fallback when classification hasn't run: uses `CATEGORY_BASE_RELEVANCE` (14–18 by category, 2 for uncategorised).

---

#### 2. Severity / exploitability — max 20

V6 primary path (when `llm_extracted_intelligence` present):

| Signal | Points |
|---|---|
| `evidence_level = confirmed_exploitation` | 20 |
| `evidence_level = attributed_incident` | 15 |
| `evidence_level = poc_available` | 12 |
| `evidence_level = vendor_confirmed` | 10 |
| `evidence_level = theoretical` | 5 |
| `evidence_level = unverified_claim` | 3 |
| `exploitation_status = exploited_in_wild` AND evidence level is not `confirmed_exploitation` | +5 |

V5 fallback (when no intel):

| Signal | Points |
|---|---|
| `actively_exploited` tag | +10 |
| Text: "actively exploited / exploited in the wild / zero-day exploit" | +8 |
| `proof_of_concept` tag | +4 |
| Text: "proof-of-concept / exploit code released" | +3 |

Always scored (both paths):

| Signal | Points |
|---|---|
| Text: "rce / remote code execution / execute arbitrary code" | +5 |
| Each CVE identifier in text (capped at 5 pts) | +2 each |
| Each named threat actor from LLM intelligence (capped at 4 pts) | +2 each |
| Quantified impact ≥ million users/records | +4 |
| Quantified impact ≥ thousand | +2 |
| Each `HIGH_SEVERITY_TAGS` match (excluding `actively_exploited`, `proof_of_concept`) | +2 |
| Each `ELEVATED_SEVERITY_TAGS` match | +1 |

**Uncategorised cap:** if `main_category = "uncategorised"`, effective severity is capped at 8.

---

#### 3. Operational actionability — max 20

| Signal | Points |
|---|---|
| IOC/detection artifact in text: "indicators of compromise", "ioc", "yara rule", "sigma rule", "snort rule", "detection rule", "hunting query" | +6 |
| `analyst_brief.watch_points` ≥ 3 entries | +5 |
| `analyst_brief.watch_points` > 0 entries | +3 |
| `intelligence.key_entities.affected_products` ≥ 3 entries | +4 |
| `intelligence.key_entities.affected_products` > 0 entries | +2 |
| `source_type = government_advisory` | +4 |
| `source_type = vendor_advisory` | +3 |
| Patch or mitigation confirmed: "patch available/released" or "mitigation available/published" | +3 |
| `critical_infrastructure` tag | +3 |
| Low-value signal detected | −5 |

---

#### 4. Information density (novelty) — max 15

*Stored in `novelty_score` column for DB compatibility.*

| Signal | Points |
|---|---|
| `source_type = research_paper` | +6 |
| `source_type = threat_intel` | +5 |
| `source_type = government_advisory` | +4 |
| `source_type = vendor_advisory` | +3 |
| `source_type = security_blog` | +1 |
| LLM-extracted CVEs, +2 each (max 4 pts) | |
| LLM-extracted threat actors > 0 | +2 |
| LLM-extracted trend signals (max 3 pts) | +1 each |
| CVE identifiers in raw text (max 3 pts) | +1 each |
| Quantified claims with specific numbers (max 3 pts) | +1 each |
| LLM-extracted claims ≥ 5 | +3 |
| LLM-extracted claims ≥ 2 | +1 |
| Low-value signal detected | −4 |

---

#### 5. Source credibility — max 10

V6 uses `publisher_type` from extracted intel as primary, averaged with `trust_tier`:

| Publisher type | Base score |
|---|---|
| `government_agency`, `threat_intel_firm`, `academic` | 9–10 |
| `security_vendor`, `major_vendor` | 8 |
| `independent_researcher` | 7 |
| `news_media` | 5 |
| `community_aggregator` | 4 |
| `unknown` | 2 |

Final credibility = `round((publisher_type_score + trust_tier_score) / 2)`, capped at 10.

`trust_tier` scores: `primary` → 10, `curated` → 6, `high` → 8, `medium` → 6, `low` → 3, `unknown` → 2.

---

#### 6. Singapore/ASEAN relevance — max 10

| Signal | Points |
|---|---|
| Each matched term in text | +3 each |
| `critical_infrastructure` tag | +2 |

**V6 expanded term list:** `"singapore"`, `"csa singapore"`, `"cybersecurity agency of singapore"`, `"imda"`, `"govtech"`, `"asean"`, `"southeast asia"`, `"south-east asia"`, `"critical information infrastructure"`, `"pdpa"`, `"mas"`, `"dsta"`, `"htx"`, `"a*star"`, `"ntu"`, `"nus"`, `"smu"`.

---

#### 7. Time sensitivity — max 5

| Signal | Points |
|---|---|
| `actively_exploited` tag | +3 |
| Published ≤ 24 hours ago | +5 |
| Published ≤ 72 hours ago | +3 |
| Published ≤ 168 hours (7 days) ago | +1 |

---

### Event-type profile deltas

After computing raw component scores, additive deltas are applied per `event_type` **before** clamping each component to its max. This shifts the score distribution toward type-appropriate ranges without breaking component bounds.

| Event type | Component deltas |
|---|---|
| `active_exploitation` | severity +8, operational +5 |
| `vulnerability_disclosure` | severity +3, operational +2, novelty +4 |
| `research_finding` | report_quality +5, horizon_signal +3, novelty +5 |
| `threat_actor_report` | severity +5, report_quality +3, novelty +2 |
| `policy_advisory` | operational +3, credibility +2, report_quality +2 |
| `incident_report` | severity +4, operational +3, report_quality +2 |
| `analysis_essay` | report_quality +2, horizon_signal +1 |
| `product_announcement`, `low_value_noise`, `unrelated` | (no deltas) |

---

### Event-type score caps

After summing components, `priority_score` and `report_score` are capped per `event_type`:

| Event type | `priority_cap` | `report_cap` |
|---|---|---|
| `active_exploitation` | 100 | 90 |
| `vulnerability_disclosure` | 90 | 80 |
| `research_finding` | 75 | 100 |
| `threat_actor_report` | 85 | 90 |
| `policy_advisory` | 80 | 85 |
| `incident_report` | 90 | 85 |
| `analysis_essay` | 65 | 75 |
| `product_announcement` | 50 | 40 |
| `low_value_noise` | 25 | 25 |
| `unrelated` | 20 | 20 |

**Design rationale:** a `research_finding` can never reach `priority_score ≥ 85` (critical) regardless of how AI-relevant it is — breaking academic research into operational response belongs in a different workflow. Conversely, `research_finding` has `report_cap: 100` because novel research is the highest-value report content. `active_exploitation` caps at 100 / 90 — confirmed in-the-wild exploitation is the highest-priority operational signal.

---

## Priority label thresholds

```
priority_score ≥ 85 → critical
priority_score ≥ 65 → high
priority_score ≥ 45 → medium
priority_score ≥ 25 → low
priority_score  < 25 → background
```

**Representative profiles:**
- `critical` (≥85): confirmed active exploitation (`active_exploitation` event, `confirmed_exploitation` evidence) + AI specificity ≥15 + credible source. Requires the `active_exploitation` cap (100) to be reachable.
- `high` (≥65): PoC vulnerability from security vendor, OR threat actor campaign report with Singapore/ASEAN relevance, OR novel research paper (capped at 75).
- `medium` (≥45): policy advisory, analysis essay from credible source, or government advisory without exploitation evidence.
- `low/background`: product announcements, roundups, or sources with minimal AI signal.

---

## Report score components (5, max 100)

### 1. AI security relevance — max 20
Same as priority score component 1.

### 2. Report quality — max 25

| Signal | Points |
|---|---|
| LLM `horizon_relevance` (1–5) × 2 | up to 10 |
| LLM trend signals × 2 (max 3 signals) | up to 6 |
| `threat_maturity = emerging` | +4 |
| `threat_maturity = growing` | +2 |
| Named threat actors > 0 | +2 |
| Named CVEs (max 3) | +1 each |
| `analyst_brief` fields with substance ≥ 40 chars (max 5 fields) | +1 each |
| `source_type = research_paper` | +4 |
| `source_type = threat_intel` | +3 |
| `source_type = government_advisory` | +2 |
| `attack_novelty = novel_technique` | +4 |
| `attack_novelty = new_variant` | +2 |
| Low-value signal detected | −6 |

### 3. Horizon signal — max 20

| Signal | Points |
|---|---|
| `threat_maturity = emerging` | +8 |
| `threat_maturity = growing` | +5 |
| `horizon_relevance` (1–5) × 2 | up to 10 |
| `report_tier = weekly` | +4 |
| `report_tier = monthly` | +2 |
| `attack_novelty = novel_technique` | +4 |
| `attack_novelty = new_variant` | +2 |

### 4. Source credibility — max 10
Same as priority score component 5.

### 5. Information density — max 15
Same as priority score component 4.

---

## Priority reason

`priority_reason` is a human-readable explanation listing which components contributed meaningfully (severity ≥ 10, actionability ≥ 12, Singapore relevance ≥ 5, credibility ≥ 8, information density ≥ 10) plus the detected event_type, attack_novelty (if novel), and source tags. Surfaced in the dashboard to explain ranking.

---

## Score versions

| Version | File | Notes |
|---|---|---|
| `priority-v5.0` | `lib/scoring/scoreSource.js` | Rule-based only; no LLM extraction |
| `priority-v6.0-type-aware-horizon` | `lib/scoring/scoreSourceV6.js` | Two-phase: LLM extraction + type-aware scoring |

V6 is activated by `useV6: true` in `scoreStoredSources()` or `?use_v6=true` on `POST /api/score-sources`. V5 remains the default to avoid unintentional LLM calls during routine rescoring.

---

## DB migration for v6 columns

```sql
ALTER TABLE sources ADD COLUMN IF NOT EXISTS llm_extracted_intelligence jsonb;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS publisher_type text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS event_type text;
CREATE INDEX IF NOT EXISTS idx_sources_event_type ON sources(event_type);
```

V6 writes to these columns via `gracefulUpdate()` in `scoreStoredSources.js`. If the columns do not exist, the first write error sets a module-level flag and subsequent writes omit the v6-only columns automatically — no restart required.

---

## Running scoring

**Via API** (Vercel, timeouts apply):
```
POST /api/score-sources?limit=1000
POST /api/score-sources?limit=100&use_v6=true&test_set=true
```

**Running tests:**
```
node tests/scoring.test.js
```

**Calibration examples** (8 examples covering all score bands) are in `data/scoringCalibrationExamples.json`. Tests verify component max values, event-type caps, evidence-level ordering, and that each calibration example falls within its expected priority range.
