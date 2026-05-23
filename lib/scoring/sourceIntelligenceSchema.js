import { PUBLISHER_TYPES, EVENT_TYPES } from "./relevanceRules.js";

const EVIDENCE_LEVELS = [
  "confirmed_exploitation",
  "poc_available",
  "theoretical",
  "vendor_confirmed",
  "attributed_incident",
  "unverified_claim",
];

const EXPLOITATION_STATUSES = [
  "exploited_in_wild",
  "poc_available",
  "not_exploited",
  "unknown",
];

const AFFECTED_AI_LAYERS = [
  "llm_inference",
  "agent_orchestration",
  "training_pipeline",
  "model_weights",
  "plugin_tool",
  "mcp_server",
  "embedding_model",
  "inference_api",
];

const ATTACK_NOVELTY_VALUES = [
  "novel_technique",
  "new_variant",
  "known_technique_new_target",
  "established",
];

// JSON schema for OpenAI structured output (response_format: { type: "json_schema" })
export const SOURCE_INTELLIGENCE_SCHEMA = {
  name: "source_intelligence",
  schema: {
    type: "object",
    properties: {
      publisher_type: {
        type: "string",
        enum: PUBLISHER_TYPES,
        description: "What kind of organisation published this source",
      },
      event_type: {
        type: "string",
        enum: EVENT_TYPES,
        description: "Primary event or document type described in the source",
      },
      evidence_level: {
        type: "string",
        enum: EVIDENCE_LEVELS,
        description: "Strongest evidence for the claimed threat or finding",
      },
      exploitation_status: {
        type: "string",
        enum: EXPLOITATION_STATUSES,
        description: "Whether the vulnerability or technique has been exploited in the wild",
      },
      affected_ai_layer: {
        type: "array",
        items: { type: "string", enum: AFFECTED_AI_LAYERS },
        description: "Which AI system layers are affected or targeted",
      },
      attack_novelty: {
        type: "string",
        enum: ATTACK_NOVELTY_VALUES,
        description: "How novel the described attack technique is",
      },
      geographic_scope: {
        type: "array",
        items: { type: "string" },
        description: "Countries or regions mentioned as targets or context (e.g. 'singapore', 'asean', 'us', 'eu', 'global')",
      },
    },
    required: [
      "publisher_type",
      "event_type",
      "evidence_level",
      "exploitation_status",
      "affected_ai_layer",
      "attack_novelty",
      "geographic_scope",
    ],
    additionalProperties: false,
  },
  strict: true,
};
