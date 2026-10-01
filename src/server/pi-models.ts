import {
  getSupportedThinkingLevels,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";

import {
  OPENROUTER_MODEL_IDS,
  OPENROUTER_PROVIDER_ID,
  PI_PROVIDER_ID,
  type ModelProviderId,
} from "./pi-settings";

export function supportedPiEfforts(model: Model<Api>) {
  return getSupportedThinkingLevels(model);
}

export interface PiModelOption {
  providerId: ModelProviderId;
  id: string;
  name: string;
  reasoningEfforts: ReturnType<typeof supportedPiEfforts>;
  /** US dollars per million tokens; null on a subscription. */
  price: { input: number; output: number } | null;
}

function offered(providerId: string, modelId: string) {
  return (
    providerId === PI_PROVIDER_ID ||
    (providerId === OPENROUTER_PROVIDER_ID &&
      (OPENROUTER_MODEL_IDS as readonly string[]).includes(modelId))
  );
}

/** Every model Hallvi offers, ChatGPT's first, in the catalog's order. */
export function piModelOptions(catalog: {
  getModels(providerId: string): readonly Model<Api>[];
}): PiModelOption[] {
  const openRouter = catalog.getModels(OPENROUTER_PROVIDER_ID);
  return [
    ...catalog.getModels(PI_PROVIDER_ID),
    ...OPENROUTER_MODEL_IDS.flatMap(
      (id) => openRouter.find((model) => model.id === id) ?? [],
    ),
  ].map((model) => ({
    providerId: model.provider as ModelProviderId,
    id: model.id,
    // OpenRouter names carry their maker: "Anthropic: Claude Sonnet 5".
    name: model.name.replace(/^[^:]+:\s*/, ""),
    reasoningEfforts: supportedPiEfforts(model),
    price:
      model.provider === OPENROUTER_PROVIDER_ID
        ? { input: model.cost.input, output: model.cost.output }
        : null,
  }));
}

export function validatePiSelection(
  catalog: {
    getModel(providerId: string, modelId: string): Model<Api> | undefined;
  },
  selection: { providerId: string; modelId: string; reasoningEffort: string },
) {
  if (!offered(selection.providerId, selection.modelId)) {
    throw new Error(
      "Hallvi offers ChatGPT models and a few OpenRouter models. Choose one in Settings.",
    );
  }
  const model = catalog.getModel(selection.providerId, selection.modelId);
  if (!model)
    throw new Error(
      "This model is not in the bundled Pi catalog. Custom model/provider definitions are not imported; choose an available model.",
    );
  if (
    !supportedPiEfforts(model).some(
      (level) => level === selection.reasoningEffort,
    )
  ) {
    throw new Error(
      "This model does not support the selected reasoning effort. Choose one of its available levels.",
    );
  }
  return model;
}
