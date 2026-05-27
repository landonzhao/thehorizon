# Layer 7.2C — Analytics Visualization Recommendation Prompt (Optional)

## Purpose

Optional LLM pass to recommend which of the generated visualization specs are most
useful for specific slide sections. The actual chart data is always generated
deterministically — this prompt only recommends placement and priority.

**Use only when:** visualization recommendations are needed for slide planning.
Skip for standard pipeline runs (`skipVizRecommendation: true` by default).

Implementation: `lib/pipeline/analytics/runAnalyticsBranch.js` (`runVisualizationRecommendations()`)

---

## System Prompt

```
You are recommending visualizations for a strategic AI-cyber horizon scan slide deck.

Only reference visualization IDs that actually exist in the list provided.
Do not invent data or suggest visualizations not in the list.
Return strict JSON only.
```

---

## User Prompt Template

```
AVAILABLE VISUALIZATION IDs: {{visualization_ids joined by ", "}}

CATEGORY COUNTS: {{category_counts as JSON}}
TOP ATTACK VECTORS: {{top 5 attack vectors}}
TOP SIGNAL CLUSTERS: {{top 5 signal clusters}}
TOTAL SOURCES: {{total_sources}}
DATE RANGE: {{date_range.start}} to {{date_range.end}}

Recommend which visualizations are most useful for:
- executive overview slides
- each threat category section
- early signals section
- 6-month outlook section
- appendix/reference

Return JSON:
{
  "recommendations": [
    {
      "visualization_id": "",
      "recommended_slide_use": "",
      "why_useful": "",
      "priority": "high | medium | low"
    }
  ]
}
```

---

## Output Schema

```json
{
  "recommendations": [
    {
      "visualization_id": "string (must match a generated spec ID)",
      "recommended_slide_use": "string (e.g. executive_overview, llm_threats_section)",
      "why_useful": "string (1 sentence)",
      "priority": "high | medium | low"
    }
  ]
}
```

---

## Available Visualization IDs (from generateVisualizationSpecs)

| ID | Type | Default Slide Use |
|---|---|---|
| `category_distribution` | bar_chart | threat_landscape_overview |
| `source_type_distribution` | bar_chart | executive_overview |
| `attack_vector_frequency` | bar_chart | category_insight |
| `attack_surface_heatmap` | heatmap | cross_category_convergence |
| `maturity_distribution` | stacked_bar | threat_landscape_overview |
| `operational_status_by_category` | stacked_bar | threat_landscape_overview |
| `monthly_category_timeline` | stacked_bar | executive_overview |
| `signal_cluster_heatmap` | heatmap | cross_category_convergence |
| `recurring_theme_heatmap` | heatmap | outlook_support |
| `timeline_events` | timeline | executive_overview |
| `category_maturity_matrix` | matrix | threat_landscape_overview |
| `source_type_by_category` | stacked_bar | category_insight |
| `signal_cluster_radar` | radar_chart | cross_category_convergence |
| `ai_layer_frequency` | bar_chart | threat_landscape_overview |

**Token budget:** ~400 tokens input + ~200 tokens output ≈ $0.00006 per run (one call per deck).
