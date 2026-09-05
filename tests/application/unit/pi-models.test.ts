import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import {
  piModelOptions,
  validatePiSelection,
} from "../../../src/server/pi-models";

describe("the bundled Pi model catalog", () => {
  it("offers only ChatGPT models with Pi's own supported reasoning levels", async () => {
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
    const options = piModelOptions(catalog.getModels());
    expect(options.length).toBeGreaterThan(1);
    expect(
      options.find((model) => model.id === "gpt-5.6-sol")?.reasoningEfforts,
    ).toContain("high");
    for (const option of options) {
      const model = catalog.getModel("openai-codex", option.id)!;
      expect(option.reasoningEfforts).toEqual(
        getSupportedThinkingLevels(model),
      );
      for (const reasoningEffort of option.reasoningEfforts) {
        expect(
          validatePiSelection(catalog, {
            providerId: "openai-codex",
            modelId: option.id,
            reasoningEffort,
          }),
        ).toBe(model);
      }
    }
    expect(() =>
      validatePiSelection(catalog, {
        providerId: "openai-codex",
        modelId: "gpt-5.4",
        reasoningEffort: "max",
      }),
    ).toThrow("does not support");
    expect(() =>
      validatePiSelection(catalog, {
        providerId: "openai",
        modelId: "gpt-5.4",
        reasoningEffort: "high",
      }),
    ).toThrow("subscription access only");
  });
});
