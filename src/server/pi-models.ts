import { getSupportedThinkingLevels, type Api, type Model } from "@earendil-works/pi-ai";

import { PI_PROVIDER_ID } from "./pi-settings";

export function supportedPiEfforts(model: Model<Api>) {
  return getSupportedThinkingLevels(model);
}

export interface PiModelOption {
  id: string;
  name: string;
  reasoningEfforts: ReturnType<typeof supportedPiEfforts>;
}

export function piModelOptions(models: readonly Model<Api>[]): PiModelOption[] {
  return models.filter((model) => model.provider === PI_PROVIDER_ID).map((model) => ({
    id: model.id,
    name: model.name,
    reasoningEfforts: supportedPiEfforts(model),
  }));
}

export function validatePiSelection(
  catalog: { getModel(providerId: string, modelId: string): Model<Api> | undefined },
  selection: { providerId: string; modelId: string; reasoningEffort: string },
) {
  if (selection.providerId !== PI_PROVIDER_ID) {
    throw new Error("ChatGPT subscription access only. Connect ChatGPT to continue.");
  }
  const model = catalog.getModel(selection.providerId, selection.modelId);
  if (!model) throw new Error("This model is not in the bundled Pi catalog. Custom model/provider definitions are not imported; choose an available ChatGPT model.");
  if (!supportedPiEfforts(model).some((level) => level === selection.reasoningEffort)) {
    throw new Error("This model does not support the selected reasoning effort. Choose one of its available levels.");
  }
  return model;
}
