import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import {
  piModelOptions,
  validatePiSelection,
} from "../../../src/server/pi-models";
import { OPENROUTER_MODEL_IDS } from "../../../src/server/pi-settings";

describe("the bundled Pi model catalog", () => {
  it("offers ChatGPT's models and the chosen OpenRouter ones with Pi's own reasoning levels", async () => {
    const catalog = await ModelRuntime.create({
      modelsPath: null,
      refreshOnCreate: false,
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => undefined,
        delete: async () => {},
      },
    });
    const options = piModelOptions(catalog);
    // Every OpenRouter model Hallvi names is still in the catalog Pi ships.
    expect(
      options.filter((model) => model.providerId === "openrouter").length,
    ).toBe(OPENROUTER_MODEL_IDS.length);
    expect(
      options.find((model) => model.providerId !== "openai-codex"),
    ).toMatchObject({ name: "Claude Sonnet 5", price: { input: 2 } });
    expect(
      options.find((model) => model.id === "gpt-6-sol")?.reasoningEfforts,
    ).toContain("high");
    for (const option of options) {
      const model = catalog.getModel(option.providerId, option.id)!;
      expect(option.reasoningEfforts).toEqual(
        getSupportedThinkingLevels(model),
      );
      for (const reasoningEffort of option.reasoningEfforts) {
        expect(
          validatePiSelection(catalog, {
            providerId: option.providerId,
            modelId: option.id,
            reasoningEffort,
          }),
        ).toBe(model);
      }
    }
    expect(() =>
      validatePiSelection(catalog, {
        providerId: "openai-codex",
        modelId: "gpt-6-astra",
        reasoningEffort: "off",
      }),
    ).toThrow("does not support");
    expect(() =>
      validatePiSelection(catalog, {
        providerId: "openai",
        modelId: "gpt-5.4",
        reasoningEffort: "high",
      }),
    ).toThrow("Hallvi offers");
    expect(() =>
      validatePiSelection(catalog, {
        providerId: "openrouter",
        modelId: "openai/gpt-6-sol",
        reasoningEffort: "high",
      }),
    ).toThrow("Hallvi offers");
  });
});
