export const PI_PROVIDER_ID = "openai-codex";
export const PI_PROVIDER_LABEL = "OpenAI Codex";
export const PI_MODEL_ID = "gpt-6-sol";
export const PI_MODEL_LABEL = "GPT-6 Sol";
export const PI_REASONING_EFFORT = "high" as const;

export const OPENROUTER_PROVIDER_ID = "openrouter";
/**
 * The OpenRouter models Hallvi offers, first the default: the frontier models
 * OpenRouter's rankings lead with, as far as the bundled Pi catalog knows
 * them, then two strong ones at a fraction of the price. Hallvi runs long
 * sessions of tool calls; a model that cannot hold one is not offered however
 * cheap. Names and prices come from Pi's catalog, so newer models arrive with
 * a Pi update.
 */
export const OPENROUTER_MODEL_IDS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6-sol",
  "google/gemini-3.1-pro-preview",
  "qwen/qwen3.8-max-0902",
  "z-ai/glm-5.3",
  "deepseek/deepseek-v4-pro-0813",
] as const;
export const OPENROUTER_MODEL_ID = OPENROUTER_MODEL_IDS[0];

/** The model accounts Hallvi can think through. */
export type ModelProviderId =
  typeof PI_PROVIDER_ID | typeof OPENROUTER_PROVIDER_ID;
