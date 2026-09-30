import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

import {
  piAccountLocation,
  stateLocation,
} from "../../scripts/state-location.mjs";

import {
  OPENROUTER_MODEL_ID,
  OPENROUTER_PROVIDER_ID,
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
/**
 * The active model, and the ChatGPT sign-in when there is one. An OpenRouter
 * key is not recorded here: it is its own file, and holding it is what makes
 * OpenRouter connected.
 */
const configurationSchema = selectionSchema
  .extend({
    mode: z.enum(["shared", "separate"]).optional(),
    authPath: z.string().min(1).optional(),
  })
  .refine((value) => !value.mode === !value.authPath);
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
  providerId: selectionSchema.shape.providerId.optional(),
  modelId: selectionSchema.shape.modelId,
  reasoningEffort: effortSchema,
});

export function piConfigDir() {
  // Runtime-owned local state, never an input to the deployed code bundle.
  return resolve(
    /* turbopackIgnore: true */ process.env.HALLVI_CONFIG_DIR ??
      stateLocation(process.cwd(), { hidden: true }).directory,
  );
}

/** Account settings travel across checkouts; application state never does.
 * An explicit controller config directory remains isolated unless its owner
 * explicitly selects a shared Pi directory too (including browser fixtures).
 */
export function piAccountDir() {
  return resolve(
    /* turbopackIgnore: true */ process.env.HALLVI_PI_CONFIG_DIR?.trim() ||
      process.env.HALLVI_CONFIG_DIR ||
      piAccountLocation(homedir()),
  );
}

/**
 * A connection to one of the owner's accounts — GitHub, Hetzner, Cloudflare —
 * is account settings too, so it lives beside the ChatGPT login and travels
 * with it. Copying one between checkouts is what this exists to end: renewing
 * the GitHub login rotates its refresh token, and the copy left behind dies.
 */
export function accountFile(name: string) {
  return join(piAccountDir(), name);
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
  const value = readJsonFile(join(piAccountDir(), "pi-settings.json"));
  if (value === undefined) return null;
  const result = configurationSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Hallvi’s saved Pi configuration is invalid. Choose a setup again.",
    );
  return result.data;
}

export function savePiConfiguration(configuration: PiConfiguration) {
  const directory = piAccountDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `pi-settings-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(configuration, null, 2), {
    mode: 0o600,
  });
  renameSync(temporary, join(directory, "pi-settings.json"));
}

/**
 * Forget the ChatGPT sign-in, never delete a shared or separate credential
 * file. OpenRouter, when connected, becomes the model; otherwise nothing is.
 */
export function forgetChatgpt() {
  const configuration = readPiConfiguration();
  if (!configuration) return;
  const rest = {
    providerId: configuration.providerId,
    modelId: configuration.modelId,
    reasoningEffort: configuration.reasoningEffort,
  };
  if (configuration.providerId !== PI_PROVIDER_ID)
    return savePiConfiguration(rest);
  if (readOpenRouterKey())
    return savePiConfiguration({
      ...rest,
      ...defaultOpenRouterSelection,
    });
  rmSync(join(piAccountDir(), "pi-settings.json"), { force: true });
}

/** Pi's own credential format, holding only the OpenRouter key. */
export function openRouterAuthPath() {
  return join(piAccountDir(), "openrouter-auth.json");
}

export function readOpenRouterKey() {
  const credential = readPiCredential(
    openRouterAuthPath(),
    OPENROUTER_PROVIDER_ID,
  );
  return credential?.type === "api_key" ? credential.key : null;
}

export const openRouterKeySchema = z.strictObject({
  key: z
    .string()
    .trim()
    .regex(
      /^sk-or-[\w-]{16,200}$/,
      "That doesn’t look like an OpenRouter key.",
    ),
});

/**
 * Save the key and think with OpenRouter from the next message: connecting it
 * is choosing it. The ChatGPT sign-in, if any, stays for switching back.
 */
export function saveOpenRouterKey(key: string) {
  const directory = piAccountDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `openrouter-auth-${randomUUID()}.tmp`);
  writeFileSync(
    temporary,
    JSON.stringify({ [OPENROUTER_PROVIDER_ID]: { type: "api_key", key } }),
    { mode: 0o600 },
  );
  renameSync(temporary, openRouterAuthPath());
  savePiConfiguration({
    ...readPiConfiguration(),
    ...defaultOpenRouterSelection,
  });
}

/** The key is Hallvi's own copy; revoking it is OpenRouter's business. */
export function forgetOpenRouter() {
  rmSync(openRouterAuthPath(), { force: true });
  const configuration = readPiConfiguration();
  if (configuration?.providerId !== OPENROUTER_PROVIDER_ID) return;
  if (configuration.mode)
    return savePiConfiguration({ ...configuration, ...defaultPiSelection });
  rmSync(join(piAccountDir(), "pi-settings.json"), { force: true });
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

export const defaultOpenRouterSelection: PiSelection = {
  providerId: OPENROUTER_PROVIDER_ID,
  modelId: OPENROUTER_MODEL_ID,
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
      authPath: join(piAccountDir(), "pi-auth.json"),
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
  });
}

/** Where the active model's credential lives, and the kind it must be. */
export function activeCredential(configuration: PiConfiguration) {
  if (configuration.providerId === OPENROUTER_PROVIDER_ID)
    return { authPath: openRouterAuthPath(), type: "api_key" as const };
  return configuration.authPath
    ? { authPath: configuration.authPath, type: "oauth" as const }
    : null;
}

export async function updatePiPreferences(
  input: z.infer<typeof updatePiPreferencesSchema>,
  sdkLoader = loadPiSdk,
) {
  const preferences = updatePiPreferencesSchema.parse(input);
  const catalog = await createPiCatalog(await sdkLoader());
  const configuration = readPiConfiguration();
  if (!configuration)
    throw new Error("Connect a model before saving model preferences.");
  const next = {
    ...configuration,
    ...preferences,
    providerId: preferences.providerId ?? configuration.providerId,
  };
  validatePiSelection(catalog, next);
  if (!activeCredential(next))
    throw new Error("Connect ChatGPT before choosing one of its models.");
  if (next.providerId === OPENROUTER_PROVIDER_ID && !readOpenRouterKey())
    throw new Error("Connect OpenRouter before choosing one of its models.");
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
      "Open Settings and connect a model: ChatGPT or OpenRouter.",
    );
  const expected = activeCredential(configuration);
  if (!expected)
    throw new Error("Open Settings and connect ChatGPT for this model.");
  const credential = readPiCredential(
    expected.authPath,
    configuration.providerId,
  );
  if (!credential || credential.type !== expected.type) {
    throw new Error(
      "The chosen model's credential is missing or its type changed. Open Settings and connect it again.",
    );
  }
  const modelRuntime = await sdk.ModelRuntime.create({
    authPath: expected.authPath,
    modelsPath: null,
    refreshOnCreate: false,
  });
  const model = validatePiSelection(modelRuntime, configuration);
  if (!(await modelRuntime.getAuth(model)))
    throw new Error("Provider is not configured");
  return { configuration, modelRuntime, model };
}
