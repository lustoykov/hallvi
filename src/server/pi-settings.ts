export const PI_PROVIDER_ID = "openai-codex";
export const PI_PROVIDER_LABEL = "OpenAI Codex";
export const PI_MODEL_ID = "gpt-6-sol";
export const PI_MODEL_LABEL = "GPT-6 Sol";
export const PI_REASONING_EFFORT = "high" as const;

export const OPENROUTER_PROVIDER_ID = "openrouter";
/**
 * The OpenRouter models Hallvi offers, first the default. OpenRouter lists
 * hundreds; these are the ones that hold up over a long session of tool calls,
 * from the strongest to the cheapest. Names and prices come from Pi's catalog.
 */
export const OPENROUTER_MODEL_IDS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5.5",
  "google/gemini-3.8-flash",
  "moonshotai/kimi-k2.7-code",
  "deepseek/deepseek-v4.1-flash",
] as const;
export const OPENROUTER_MODEL_ID = OPENROUTER_MODEL_IDS[0];

/** The model accounts Hallvi can think through. */
export type ModelProviderId =
  typeof PI_PROVIDER_ID | typeof OPENROUTER_PROVIDER_ID;
