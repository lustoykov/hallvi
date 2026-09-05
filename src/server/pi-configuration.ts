import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  PI_MODEL_ID,
  PI_PROVIDER_ID,
  PI_REASONING_EFFORT,
} from "./pi-settings";
import { validatePiSelection } from "./pi-models";

export type PiSdk = typeof import("@earendil-works/pi-coding-agent");
export type PiSdkLoader = () => Promise<PiSdk>;
export const loadPiSdk: PiSdkLoader = () =>
  import("@earendil-works/pi-coding-agent");

const effortSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const selectionSchema = z.object({
  providerId: z.string().min(1).max(200),
  modelId: z.string().min(1).max(200),
  reasoningEffort: effortSchema,
});
const configurationSchema = selectionSchema.extend({
  mode: z.enum(["shared", "separate"]),
  authPath: z.string().min(1),
  credentialType: z.enum(["oauth", "api_key"]),
});
export type PiConfiguration = z.infer<typeof configurationSchema>;
export type PiSelection = z.infer<typeof selectionSchema>;

export const choosePiSetupSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("separate") }),
  z.strictObject({
    mode: z.literal("shared"),
    candidateId: z.string().length(64),
  }),
]);

export const updatePiPreferencesSchema = z.strictObject({
  modelId: selectionSchema.shape.modelId,
  reasoningEffort: effortSchema,
});

export function piConfigDir() {
  // Runtime-owned local state, never an input to the deployed code bundle.
  return resolve(
    /* turbopackIgnore: true */ process.env.SERVER_GUY_CONFIG_DIR ??
      join(process.cwd(), ".server-guy"),
  );
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    // JSON parser errors can contain credential fragments. Never expose them.
    throw new Error(
      "The Pi configuration or credential file could not be read. Repair it or use a new ChatGPT connection.",
    );
  }
}

export function readPiConfiguration(): PiConfiguration | null {
  const value = readJsonFile(join(piConfigDir(), "pi-settings.json"));
  if (value === undefined) return null;
  const result = configurationSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Server Guy’s saved Pi configuration is invalid. Choose a setup again.",
    );
  return result.data;
}

export function savePiConfiguration(configuration: PiConfiguration) {
  const directory = piConfigDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `pi-settings-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(configuration, null, 2), {
    mode: 0o600,
  });
  renameSync(temporary, join(directory, "pi-settings.json"));
}

/**
 * Forget Server Guy's consent/selection, never delete a shared or separate
 * credential file.
 */
export function forgetPiConfiguration() {
  rmSync(join(piConfigDir(), "pi-settings.json"), { force: true });
}

const credentialSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oauth"),
    access: z.string().min(1),
    refresh: z.string().min(1),
    expires: z.number().finite(),
  }),
  z.object({ type: z.literal("api_key"), key: z.string().min(1) }),
]);

/**
 * Inspect locally, without running key commands, resolving environment
 * variables, or refreshing OAuth.
 */
export function readPiCredential(authPath: string, providerId: string) {
  const data = readJsonFile(authPath);
  if (data === undefined) return null;
  const entries = z.record(z.string(), z.unknown()).safeParse(data);
  if (!entries.success)
    throw new Error(
      "Pi’s credential file is invalid. Repair it or use a new ChatGPT connection.",
    );
  const value = entries.data[providerId];
  if (value === undefined) return null;
  const credential = credentialSchema.safeParse(value);
  if (!credential.success)
    throw new Error(
      "Pi credentials are incomplete or unsupported. Connect ChatGPT to continue.",
    );
  if (
    credential.data.type === "api_key" &&
    credential.data.key.trimStart().startsWith("!")
  ) {
    throw new Error(
      "Command-based Pi API keys cannot be reused. Connect ChatGPT to continue.",
    );
  }
  return credential.data;
}

const preferencesSchema = z.object({
  defaultProvider: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  defaultThinkingLevel: effortSchema.optional(),
  modelThinkingLevels: z.record(z.string(), effortSchema).optional(),
});

export const defaultPiSelection: PiSelection = {
  providerId: PI_PROVIDER_ID,
  modelId: PI_MODEL_ID,
  reasoningEffort: PI_REASONING_EFFORT,
};

export interface DetectedPiSetup {
  id: string;
  selection: PiSelection;
  settingsPath: string;
  authPath: string;
  credentialType: "oauth" | "api_key" | null;
  usesDefaultModel: boolean;
  billing: "subscription" | "api";
  canReuse: boolean;
  issue: string | null;
}

/**
 * A catalog-only runtime: no file-backed credential store, machine model
 * overrides, or network refresh.
 */
export function createPiCatalog(sdk: PiSdk) {
  return sdk.ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: async () => undefined,
      list: async () => [],
      modify: async () => {
        throw new Error("Read-only catalog");
      },
      delete: async () => {
        throw new Error("Read-only catalog");
      },
    },
  });
}

export async function detectPiSetup(sdk: PiSdk): Promise<DetectedPiSetup> {
  const settingsPath = join(sdk.getAgentDir(), "settings.json");
  const authPath = join(sdk.getAgentDir(), "auth.json");
  let selection = defaultPiSelection;
  let usesDefaultModel = true;
  let credentialType: DetectedPiSetup["credentialType"] = null;
  let billing: DetectedPiSetup["billing"] = "subscription";
  let issue: string | null = null;
  try {
    const parsed = preferencesSchema.safeParse(
      readJsonFile(settingsPath) ?? {},
    );
    if (!parsed.success)
      throw new Error(
        "Pi’s saved model preferences are invalid. Repair them or use a new ChatGPT connection.",
      );
    const preferences = parsed.data;
    if (
      Boolean(preferences.defaultProvider) !== Boolean(preferences.defaultModel)
    ) {
      throw new Error(
        "Pi has an incomplete provider/model selection. Fix its settings or use a new ChatGPT connection.",
      );
    }
    usesDefaultModel = !preferences.defaultProvider;
    const providerId = preferences.defaultProvider ?? PI_PROVIDER_ID;
    const modelId = preferences.defaultModel ?? PI_MODEL_ID;
    selection = {
      providerId,
      modelId,
      reasoningEffort:
        preferences.modelThinkingLevels?.[`${providerId}/${modelId}`] ??
        preferences.defaultThinkingLevel ??
        PI_REASONING_EFFORT,
    };
    credentialType = readPiCredential(authPath, providerId)?.type ?? null;
    const catalog = await createPiCatalog(sdk);
    const provider = catalog.getProvider(providerId);
    billing =
      credentialType !== "api_key" && provider?.auth.oauth?.isSubscription
        ? "subscription"
        : "api";
    validatePiSelection(catalog, selection);
    if (!credentialType)
      throw new Error(
        "No credentials found for this provider. Connect ChatGPT to continue.",
      );
    if (credentialType !== "oauth" || !provider?.auth.oauth?.isSubscription) {
      throw new Error(
        "ChatGPT subscription access only, not API keys. Connect ChatGPT to continue.",
      );
    }
  } catch (error) {
    issue =
      error instanceof Error
        ? error.message
        : "Existing Pi setup could not be inspected.";
  }
  const preview = {
    selection,
    settingsPath,
    authPath,
    credentialType,
    usesDefaultModel,
    billing,
    canReuse: !issue,
    issue,
  };
  // Only non-secret metadata participates. A changed selection requires a fresh
  // confirmation.
  return {
    ...preview,
    id: createHash("sha256").update(JSON.stringify(preview)).digest("hex"),
  };
}

export async function choosePiSetup(
  input: z.infer<typeof choosePiSetupSchema>,
  sdkLoader = loadPiSdk,
) {
  input = choosePiSetupSchema.parse(input);
  if (input.mode === "separate") {
    validatePiSelection(
      await createPiCatalog(await sdkLoader()),
      defaultPiSelection,
    );
    savePiConfiguration({
      ...defaultPiSelection,
      mode: "separate",
      credentialType: "oauth",
      authPath: join(piConfigDir(), "pi-auth.json"),
    });
    return;
  }
  const detected = await detectPiSetup(await sdkLoader());
  if (detected.id !== input.candidateId)
    throw new Error(
      "Pi’s setup changed. Reload this page and confirm the updated login.",
    );
  if (!detected.canReuse || !detected.credentialType)
    throw new Error(detected.issue ?? "This Pi setup cannot be reused.");
  savePiConfiguration({
    ...detected.selection,
    mode: "shared",
    authPath: detected.authPath,
    credentialType: detected.credentialType,
  });
}

export async function updatePiPreferences(
  input: z.infer<typeof updatePiPreferencesSchema>,
  sdkLoader = loadPiSdk,
) {
  const preferences = updatePiPreferencesSchema.parse(input);
  const catalog = await createPiCatalog(await sdkLoader());
  const configuration = readPiConfiguration();
  if (!configuration)
    throw new Error("Choose a Pi setup before saving model preferences.");
  if (configuration.credentialType !== "oauth")
    throw new Error(
      "Configure ChatGPT subscription access before saving preferences.",
    );
  const next = { ...configuration, ...preferences };
  validatePiSelection(catalog, next);
  savePiConfiguration(next);
}

/**
 * Every turn must use an explicitly chosen configuration; never infer consent
 * from credentials.
 */
export async function configuredPiRuntime(sdk: PiSdk) {
  const configuration = readPiConfiguration();
  if (!configuration)
    throw new Error(
      "Open Pi setup and choose whether to reuse Pi or use a new ChatGPT connection.",
    );
  if (
    configuration.providerId !== PI_PROVIDER_ID ||
    configuration.credentialType !== "oauth"
  ) {
    throw new Error(
      "ChatGPT subscription access only. Open Pi setup to connect ChatGPT.",
    );
  }
  const credential = readPiCredential(
    configuration.authPath,
    configuration.providerId,
  );
  if (!credential || credential.type !== configuration.credentialType) {
    throw new Error(
      "The chosen Pi credential is missing or its type changed. Open Pi setup and choose a setup again.",
    );
  }
  const modelRuntime = await sdk.ModelRuntime.create({
    authPath: configuration.authPath,
    modelsPath: null,
    refreshOnCreate: false,
  });
  const model = validatePiSelection(modelRuntime, configuration);
  if (!(await modelRuntime.getAuth(model)))
    throw new Error("Provider is not configured");
  return { configuration, modelRuntime, model };
}
