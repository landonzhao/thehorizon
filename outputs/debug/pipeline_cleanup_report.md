# Pipeline Cleanup Report — 2026-05-27

## Summary

Post-refactor cleanup to make the codebase consistent through Layer 7.1 (Rawfact Branch).
All old source type names removed or migrated. Dead code annotated. Outdated docs archived.

---

## Source Type Changes

### Old → New Renames

| Old Name | New Name |
|---|---|
| `policy_regulatory_signal` | `governance_signal` |
| `governance_organizational_response` | `governance_signal` |
| `ecosystem_market_signal` | `ecosystem_signal` |
| `strategic_foresight_signal` | `strategic_signal` |
| `adjacent_contextual` | `unknown` |
| `academic_research` | `research_finding` |
| `tooling_platform_development` | `ecosystem_signal` |

### New Types Added

| Type | Description |
|---|---|
| `capability_demonstration` | Proof-of-concept capabilities shown to work, not yet observed in the wild |
| `adversary_adoption_signal` | Evidence of adversaries operationalising AI capabilities |
| `infrastructure_dependency_signal` | Dependency growth creating new attack surface |
| `trust_boundary_shift` | Shifts in trust assumptions that create new exploit conditions |

### Migration Map

`lib/config/sourceTypes.js` exports `OLD_SOURCE_TYPE_MAP` for runtime DB migration.
`lib/pipeline/classify/classifySourceType.js` LEGACY_TYPE_MAP covers all old connector-emitted names.

---

## Files Updated

### Core Config
- `lib/config/sourceTypes.js` — Rewrote with 15 new canonical types + OLD_SOURCE_TYPE_MAP
- `lib/taxonomy/categories.js` — Created (re-exports from lib/config/categories.js)
- `lib/taxonomy/sourceTypes.js` — Unchanged (already re-exports correctly)

### Classification
- `lib/pipeline/classify/classifySourceType.js` — Updated LEGACY_TYPE_MAP, CONNECTOR_TYPE_MAP, TAG_TYPE_MAP, TEXT_RULES (arxiv → research_finding, cisa → governance_signal)

### Layer 5 — Taxonomy / Understanding
- `lib/pipeline/understand/understandSource.js` — Updated source type list in LLM prompt

### Layer 7.1 — Rawfact Branch
- `lib/pipeline/rawfact/rawfactTaxonomy.js` — Updated system prompt, inferOperationalRelevanceFromType, buildDefaultSourceTypeContext (new shapes for governance_signal, ecosystem_signal, strategic_signal, capability_demonstration, adversary_adoption_signal, infrastructure_dependency_signal, trust_boundary_shift)
- `lib/pipeline/rawfact/scoreRawfacts.js` — Renamed scoring cases + added 4 new type scorers + fixed penalties
- `lib/pipeline/rawfact/extractRawfacts.js` — Updated source type references in system prompt

### Ingestion
- `lib/pipeline/ingest/sourceRegistry.js` — Updated all `policy_regulatory_signal` and `governance_organizational_response` entries to `governance_signal`

### Analytics
- `lib/pipeline/analytics/analyticsTaxonomy.js` — Replaced old type names
- `lib/pipeline/analytics/visualizationSpecs.js` — Updated SOURCE_TYPE_LABELS with all 15 new types

### Feed (Deprecated Layer)
- `lib/pipeline/feed/feedTaxonomy.js` — Added @deprecated notice, updated old type refs
- `lib/pipeline/feed/feedScoring.js` — Added @deprecated notice, updated SOURCE_TYPE_SCORES

### Synthesis (Beyond Current Scope)
- `lib/pipeline/synthesis/analyzeCategories.js` — Added scope note
- `lib/pipeline/synthesis/synthesizeViewpoints.js` — Added scope note

---

## Docs

### Archived (moved to docs/archive/)
- `docs/logic-layer6-synthesis.md`
- `docs/logic-layer7-slides.md`
- `docs/logic-layer8-qa.md`
- `docs/logic-layer9-runner.md`
- `docs/prompts/layer6-category-analysis.md`
- `docs/prompts/layer6-evidence-extraction.md`
- `docs/prompts/layer6-viewpoint-synthesis.md`
- `docs/prompts/layer7-slide-content.md`
- `docs/prompts/layer7-speaker-notes.md`

### Updated
- `docs/pipeline.md` — Updated Layer 5 source type lists, rawfact taxonomy prompt
- `docs/source-types.md` — Already had correct Final Recommended Source Types section

---

## Validation

End-to-end pipeline test after all changes:
```
node scripts/runHorizonScanMVP.js --no-llm --no-persist
QA: PASS | Sources: 645 | Slides: 11 | Elapsed: 2.6s
```
