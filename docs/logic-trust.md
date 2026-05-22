# Trust Scoring Logic

## What it does

Trust scoring answers: **how much weight should we give the organisation that published this source?** It is distinct from validity (structural data quality) and relevance (AI threat content). A source can be structurally complete (high validity), highly AI-relevant (high classification score), and still come from an unreliable publisher (low trust).

Trust operates at two levels: the **trust tier** set at collection time, and the **credibility label** derived from structural validity.

---

## Trust tier

Trust tier is assigned at collection time, from the source registry or connector metadata. It is a human-curated judgement about the publishing organisation.

| Tier | Assigned to | Credibility weight |
|---|---|---|
| `primary` | Government agencies (CISA, NCSC, CSA, ENISA, NIST), AI labs (Anthropic, OpenAI) | 10 |
| `high` | Established security vendors (Google, Microsoft, CrowdStrike, Unit 42), reputable practitioner blogs (Krebs, Schneier, Trail of Bits, Simon Willison), academic institutions | 8 |
| `medium` | General security news outlets (BleepingComputer, SecurityWeek, The Hacker News, Dark Reading, Ars Technica, Wired) | 6 |
| `curated` | Manually imported sources from the Excel backlog | 9 |
| `low` | Lower-confidence sources | 3 |
| `unknown` | Undetermined — assigned when no tier is specified | 2 |

**Why primary > curated**: Primary sources (governments, AI labs) are authoritative by definition. Curated sources are trusted by human curation but may be secondary analyses or blog posts; they rank just below primary.

**Why the credibility weight is capped at 10**: The trust tier contributes to `priority_score` as `source_credibility_score`. At a maximum of 10 out of ~100 total, trust adjusts the ranking without overriding content relevance. A high-trust source about a minor topic should not outrank a medium-trust source about an active zero-day.

**Assignment is static**: trust tier does not change after ingestion. If a publisher's reputation changes, the source registry entry is updated, and future ingestion picks up the new tier. Existing stored sources retain their original tier.

---

## Credibility label (from validity scoring)

A second, structural measure is computed by the validity layer and stored as `credibility_label`.

| Score | Label |
|---|---|
| ≥ 85 | `primary` |
| ≥ 75 | `high_trust` |
| ≥ 55 | `medium_trust` |
| ≥ 30 | `low_trust` |
| < 30 | `do_not_use` |

This label reflects data completeness (title, URL, publisher, date, text length) weighted by trust tier. It is used in the dashboard UI to show users a quick structural quality signal.

**The credibility label is not the trust tier**: a source from CISA (primary trust tier) that arrives with a missing title scores lower on the credibility label because the data record is incomplete, even though the source organisation is authoritative. Conversely, a well-formed record from an unknown publisher gets a medium credibility label despite having no trust tier.

---

## How trust tier flows downstream

**Validity**: `trust_tier = "primary"` adds +35 to the validity score, making it very difficult for a government advisory to fall below the usability gate. `trust_tier = "low"` subtracts 5, making it slightly easier to fail.

**Purge protection**: `trust_tier = "curated"` sources are never purged during classification, regardless of `ai_specificity_score`. Manually imported sources are protected because they were deliberately added and should not be silently deleted.

**Priority scoring**: trust tier feeds directly into `source_credibility_score` via `CREDIBILITY_BY_TIER`. This is one of seven components of `priority_score`.

**Report scoring**: `source_credibility_score` is also one of five components of `report_score`. High-trust sources rank higher in reports, all else equal, because analysts need to know whether a finding comes from a government advisory or a personal blog.

---

## Curated sources

The `curated` trust tier is specifically for sources imported manually via `scripts/importCuratedExcel.js`. These are typically high-quality historical sources or sources from organisations that do not have public RSS feeds.

Curated sources:
- Are never deleted by the AI specificity purge (score < 10 threshold does not apply)
- Are never deleted by any automated pipeline step
- Carry a credibility weight of 9 (between `high` and `primary`)
- Can be identified by querying `trust_tier = 'curated'`

This allows analysts to maintain a protected set of reference sources that remain in the database regardless of what automated classification decides.

Curated sources are subject to the same validation gates as any other source. Missing title or missing/unsafe URL causes immediate rejection regardless of curated status. The "curated" tag (set on every imported source) is used for purge protection across all pipeline stages — sources carrying this tag are never deleted by the AI specificity purge, even if their trust tier is no longer literally `"curated"`. Trust tier is inferred from the publisher (primary, high, medium) and is not hardcoded.