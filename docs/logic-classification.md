# Classification Logic

## What it does

Classification is split into two distinct layers with different responsibilities:

1. **Taxonomy (LLM)** — reads the source text and decides: what AI threat techniques does this cover, and how central is AI to this source? Outputs tags and an AI specificity score.
2. **Classification (rule-based)** — reads the tags and deterministically derives the main category. No LLM involved.

This separation means category assignment is testable, predictable, and not subject to LLM hallucination. It also gives cleaner signal: if the LLM cannot identify specific AI threat tags in a source, the source is correctly `uncategorised` regardless of surface-level AI mentions.

---

## LLM usage in this layer

e| Step | File | Purpose | API keys |
|---|---|---|---|
| Taxonomy (tags + AI score) | `lib/claims/enrichSource.js` | Identify AI threat techniques; score AI relevance | `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GEMINI_API_KEY_2` |
| Category derivation | `lib/classification/deriveCategory.js` | Tag counts → main_category | None — deterministic |

**Provider rotation order** (7 slots, first available key is used):
1. OpenAI `gpt-4o-mini` (`OPENAI_API_KEY`)
2. OpenAI-2 `gpt-4o-mini` (`OPENAI_API_KEY_2`, secondary key)
3. Groq `llama-3.3-70b-versatile` (`GROQ_API_KEY`, free tier)
4. Gemini Flash `gemini-2.0-flash` (`GEMINI_API_KEY`, higher RPD quota)
5. Gemini 2.5 `gemini-2.5-flash` (`GEMINI_API_KEY`)
6. Gemini Flash-2 `gemini-2.0-flash` (`GEMINI_API_KEY_2`, secondary key)
7. Gemini 2.5-2 `gemini-2.5-flash` (`GEMINI_API_KEY_2`, last resort)

Quota-exhausted providers (HTTP 429 with `insufficient_quota` / `RESOURCE_EXHAUSTED`) are skipped. Rate-limited providers wait the `retry-after` duration (up to 30s) and retry the same provider up to 3 times. Non-quota errors (auth, network) bail immediately. The 2.5-second inter-call delay in `classifyStoredSources.js` keeps throughput within Groq's free-tier rate limit (30 RPM).

---

## Pipeline position

```
Ingestion → Cleaning → Dedup → Validation → Initial Tagging → Snapshot → [LLM Taxonomy] → [Tag→Category] → Score → Report
```

Both layers run together in `lib/classification/classifyStoredSources.js`, which queries `sources` for unclassified sources and processes them sequentially.

---

## Layer 1: LLM taxonomy

`lib/claims/enrichSource.js` sends each source to an LLM with a structured prompt. The LLM outputs:

**Taxonomy fields (classification use):**
- `classification.tags` — list of tags from the allowed vocabulary
- `classification.ai_specificity_score` — integer 0–100
- `classification.ai_specificity_reason` — one sentence justifying the score

**The LLM does NOT assign `main_category`.** Category is derived from tags in Layer 2.

**Enrichment fields (analysis and report use):**
- `short_summary`, `analyst_brief`, `intelligence`, `claims`

### AI specificity score

The LLM scores how central AI threats are to the source:

| Range | Interpretation |
|---|---|
| 0–10 | Purely generic cybersecurity — no AI involvement |
| 11–19 | AI mentioned incidentally; core topic is traditional cyber |
| 20–39 | AI is a contributing factor but not the primary subject |
| 40–70 | AI is a primary factor (AI tool used, AI system targeted) |
| 71–100 | AI or ML is the core subject (LLM threats, agentic risks, deepfakes) |

Sources scoring < 10 are deleted. Defensive AI tools (SOC automation, AI scanners) score ≤ 20.

### Tag selection

The prompt instructs the LLM:
- Select tags ONLY from `ALLOWED_TAGS` (the full list is in the prompt)
- Tags must reflect techniques actually present in the source, not the publisher domain
- Assign 0 tags if the source only mentions AI in passing

This is the relevance gate: a source about a generic CVE that happens to mention "AI-powered tools" gets 0 threat tags and scores ≤ 10, landing in `uncategorised` and eventually being purged.

---

## Layer 2: tag-to-category derivation

`lib/classification/deriveCategory.js` reads the assigned tags and returns a `main_category` deterministically.

**Algorithm:**
1. Count threat tags (non-context tags) per category using the `TAG_DEFINITIONS` mapping
2. Pick the category with the highest count
3. If tied: find the highest-severity tag (by position in `HIGH_SEVERITY_TAGS` then `ELEVATED_SEVERITY_TAGS`) among the tied categories — that tag's category wins
4. If no threat tags at all (only context tags or empty): return `uncategorised`

**Category confidence** is computed as:

```
confidence = min(100, round(40 + dominance × 40 + min(bestCount, 5) × 4))
```

Where `dominance` = (winning category tag count) / (total threat tag count) and `bestCount` = the winning category's tag count. A single tag at 100% dominance yields ~84; five or more aligned tags at 100% dominance reaches 100. Split signals (e.g., 50% dominance) produce lower scores. Confidence is stored in `category_confidence` and surfaced in the dashboard as a quality indicator.

**Tie-break fallback**: if no severity tag from the tied categories appears in `SEVERITY_PRIORITY`, the first tied category in the `MAIN_CATEGORIES` array order wins (`traditional_ai_threats` → `llm_threats` → `agentic_ai_threats` → `ai_enabled_threats`).

**Examples:**

| Tags | Category | Why |
|---|---|---|
| `prompt_injection, jailbreak, rag_attack` | `llm_threats` (100%) | All tags map to llm_threats |
| `mcp_exploitation, agent_hijacking, tool_abuse` | `agentic_ai_threats` (100%) | All tags map to agentic |
| `jailbreak, mcp_exploitation` | `agentic_ai_threats` (68%) | Tie; mcp_exploitation is in HIGH_SEVERITY above jailbreak |
| `prompt_injection, agent_memory_attack` | `llm_threats` (68%) | Tie; prompt_injection is in HIGH_SEVERITY above agent_memory_attack |
| `cve, actively_exploited, nation_state` | `uncategorised` | All are context tags — no threat category signal |

---

## Relevance tier

Derived from `ai_specificity_score` after LLM classification:

| Tier | Condition | Meaning |
|---|---|---|
| `core` | Score ≥ 40 | AI is a primary factor — appears in reports and dashboard |
| `adjacent` | 20 ≤ score < 40 | AI is relevant but not primary — archive only |
| `context` | 10 ≤ score < 20 | AI mentioned incidentally — archive only |
| (deleted) | Score < 10 | No AI signal — deleted from the database |

Curated sources are never deleted and default to `core` if not previously tiered.

---

## Purge pre-filter

Before LLM enrichment runs, `lib/classification/purgeIrrelevantSources.js` removes clear off-topic sources using a broad AI keyword list. This avoids spending LLM tokens on sources that have no AI content at all.

- **Pass 1**: Already-classified sources with `ai_specificity_score < 10` → delete
- **Pass 2**: Unclassified sources with zero AI keyword matches → delete; any match passes to LLM

---

## Classification version

Every classified source is stamped with `tag_version = "classify-v5.0"` and `claim_extraction_status = "success"`. The `tag_version` field is the canonical "classified" marker.

When `onlyUnclassified = true` (the default), `classifyStoredSources()` queries `WHERE tag_version IS NULL`.

---

## Running classification

**Via API** (Vercel, timeouts apply):
```
POST /api/classify-sources?limit=100
POST /api/classify-sources?limit=100&test_set=true
```

**Via script** (no timeout, preferred for large batches):
```
node scripts/enrichSources.js [limit] [delay_ms]
node scripts/enrichSources.js 50 500         # OpenAI speed
node scripts/enrichSources.js 50 7000        # Gemini free tier
node scripts/enrichSources.js --test-set
```

---

## What was removed in v5.0

- **Rule-based classifier** — deprecated stub; no longer called
- **Phrase rules** — empty export; all phrase matching removed
- **`ai_weight`** — removed from tag definitions; the LLM assigns `ai_specificity_score` directly
- **`main_category` from LLM prompt** — category is now derived from tags, not from the LLM
- **`ai_for_security` category** — removed; defensive AI is not threat intelligence
- **Geographical tags** (`singapore_relevance`, `asean_relevance`) — removed from tag vocabulary
