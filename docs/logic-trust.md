# Trust Scoring Logic

## What it does

Trust scoring answers: **how much weight should we give the organisation that published this source?** It is distinct from validity (structural data quality) and relevance (AI threat content). A source can be structurally complete (high validity), highly AI-relevant (high classification score), and still come from an unreliable publisher (low trust).

Trust operates at two levels: the **trust tier** set at collection time, and the **credibility label** derived from structural validity.

---

## Trust tier

Trust tier is assigned at collection time, from the source registry or connector metadata. It is a human-curated judgement about the publishing organisation.

| Tier | Assigned to | `publisher_trust_score` | `CREDIBILITY_BY_TIER` (scoring) |
|---|---|---|---|
| `primary` | Government agencies (CISA, NCSC, CSA, ENISA, NIST), AI labs (Anthropic, OpenAI) | 10 | 10 |
| `high` | Established security vendors (Google, Microsoft, CrowdStrike), reputable practitioner blogs | 8 | 8 |
| `medium` | General security news outlets (BleepingComputer, SecurityWeek, The Hacker News) | 6 | 6 |
| `curated` | Manually imported sources (purge-protected, not auto-ranked) | 9 | 6 |
| `low` | Lower-confidence sources | 3 | 3 |
| `unknown` | Undetermined — assigned when no tier is specified | 2 | 2 |

Two weights apply because curated sources serve different purposes in different contexts. `publisher_trust_score` (stored in `sourceValidity.js`) is a metadata field reflecting that manually imported sources come from known-good publishers — it scores 9. `CREDIBILITY_BY_TIER` (in `relevanceRules.js`) feeds the priority/report scoring formula — curated scores 6 (same as medium) so that imported background sources don't auto-outrank organically discovered primary advisories.

**Assignment is static**: trust tier does not change after ingestion. If a publisher's reputation changes, the source registry entry is updated, and future ingestion picks up the new tier. Existing stored sources retain their original tier.

---

## Structural validity score vs publisher trust score

These two scores are fully independent and must not be combined at the validity layer.

**`structural_validity_score`** (0–90) measures data completeness:
- Base: 50 (title present and URL safe)
- Publisher field present: +10
- Publication date present and confident: up to +15
- Full text length ≥ 500 chars: +15; ≥ 50 chars: +5; < 50 chars: –5
- URL unreachable: –10
- Trust tier plays **no role** in structural validity

**`publisher_trust_score`** (0–10) measures publisher reputation:
- Directly maps trust tier to a score (primary→10, curated→9, high→8, medium→6, low→3, unknown→2)
- Stored as a metadata field on each source; reflects the known quality of the publishing organisation
- Distinct from `CREDIBILITY_BY_TIER` (scoring weight): curated sources score 9 here but contribute 6 to the priority/report scoring formula

**Why they are separate**: a CISA advisory (primary tier) with a missing title is still structurally invalid — the trust tier should not rescue a broken record. Conversely, a well-formed blog post from an unknown source has good structural validity even with a low publisher trust score.

**Backward compat**: `source_validity_score` is a stored alias for `structural_validity_score`.

---

## Credibility label (from validity scoring)

A categorical label derived from `structural_validity_score` and stored alongside sources:

| Score | Label | Reachable? |
|---|---|---|
| ≥ 80 | `primary` | No — maximum score is 65 |
| ≥ 65 | `high_trust` | Yes — perfect source (publisher + date + long text) |
| ≥ 45 | `medium_trust` | Yes — most well-formed sources |
| ≥ 25 | `low_trust` | Yes — poorly formed records |
| < 25 | `do_not_use` | Yes — source dropped before storage |

The `primary` credibility label is unreachable. The scoring algorithm uses absence penalties (not presence bonuses) so the maximum achievable score is 65. This is a known calibration issue — the `do_not_use` gate (the only functionally significant threshold) is unaffected.

Hard gates: a missing title or an unsafe/missing URL immediately returns `credibility_label = "do_not_use"` and `structural_validity_score = 0`, regardless of trust tier.

---

## How trust tier flows downstream

**Validity**: trust tier is NOT used to adjust the structural validity score. It is only used to set `publisher_trust_score` (0–10).

**Purge protection**: `trust_tier = "curated"` sources are never deleted by the AI specificity purge or any automated pipeline step.

**Priority scoring (v5)**: trust tier feeds directly into `source_credibility_score` via `CREDIBILITY_BY_TIER`. This is one of seven components of `priority_score`.

**Priority scoring (v6)**: v6 scoring adds a `publisher_type` dimension extracted by LLM. `source_credibility_score` becomes the average of `publisher_type` score and `trust_tier` score. See `lib/scoring/relevanceRules.js: PUBLISHER_CREDIBILITY_V6`.

**Report scoring**: `source_credibility_score` is also one of five components of `report_score`.

---

## Curated sources

The `curated` trust tier is specifically for sources imported manually via `scripts/importCuratedExcel.js`. These are typically high-quality historical sources or sources from organisations without public RSS feeds.

**Curated means: purge protection only — not automatic high ranking.**

Curated sources:
- Are never deleted by the AI specificity purge (score < 10 threshold does not apply)
- Are never deleted by any automated pipeline step
- Carry a credibility weight of **6** (same as medium) — this is intentional; curated sources are protected, not privileged
- Can be identified by querying `is_curated = true` or `trust_tier = 'curated'`

A curated source about an off-topic subject will not outrank an organically discovered primary advisory about an active zero-day. Analysts who deliberately import a source should enrich it (tags, category) via `importCuratedExcel.js` if they want it ranked above the automatic threshold.

**Why curated ≠ high**: In earlier versions, `CREDIBILITY_BY_TIER.curated = 9` caused all imported sources to rank above automatically discovered medium-trust sources, regardless of content relevance. Since the pipeline now imports hundreds of curated background sources, this inflated the report with historical material instead of recent events.

**The `is_curated` field**: a boolean on every source row, separate from `trust_tier`. A source can have `is_curated = true` with `trust_tier = "high"` if the publisher is high-trust by the registry but the source was manually imported. `is_curated` governs purge protection; `trust_tier` governs credibility scoring.

**Version stamp**: trust version is stored as `trust_version = "trust-v2.0"` on every source row, allowing downstream tools to detect stale trust assessments.
