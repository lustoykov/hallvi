import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

import {
  activeCredential,
  createPiCatalog,
  defaultPiSelection,
  detectPiSetup,
  forgetChatgpt,
  loadPiSdk,
  openRouterAuthPath,
  piAccountDir,
  readOpenRouterKey,
  readPiConfiguration,
  readPiCredential,
  savePiConfiguration,
} from "./pi-configuration";
import type {
  DetectedPiSetup,
  PiSdkLoader,
  PiSelection,
} from "./pi-configuration";
import {
  OPENROUTER_PROVIDER_ID,
  PI_MODEL_LABEL,
  PI_PROVIDER_ID,
} from "./pi-settings";
import { traceExportConfiguration } from "./tracing-config";
import { diagnosticLogPath } from "./diagnostics";
import { openRouterLogin } from "./openrouter-login";
import {
  piModelOptions,
  validatePiSelection,
  type PiModelOption,
} from "./pi-models";

export type PiSetupState =
  | "needs-choice"
  | "ready"
  | "needs-auth"
  | "auth-error"
  | "model-unavailable"
  | "runtime-unavailable";

/**
 * What the next message would think with. `state`, `ready` and `issue` are
 * about the active model; `connections` says which accounts are saved, so a
 * page can offer switching between them.
 */
export interface PiSetupStatus {
  state: PiSetupState;
  ready: boolean;
  /** How ChatGPT is signed in, or null when it is not. */
  mode: "shared" | "separate" | null;
  connections: { chatgpt: boolean; openRouter: boolean };
  billing: "subscription" | "api";
  detected: DetectedPiSetup | null;
  hasSavedConfiguration: boolean;
  models: PiModelOption[];
  separateAuthPath: string;
  openRouterAuthPath: string;
  diagnosticLogPath: string;
  localTracePath: string;
  traceExport: ReturnType<typeof traceExportConfiguration>;
  runtime: {
    label: string;
    detail: string;
  };
  authentication: {
    configured: boolean;
    label: string;
    source: string;
  };
  selection: PiSelection & {
    provider: string;
    model: string;
  };
  issue: string | null;
}

const providerLabel = (providerId: string) =>
  providerId === OPENROUTER_PROVIDER_ID ? "OpenRouter" : "ChatGPT";

function baseStatus(): PiSetupStatus {
  return {
    state: "needs-choice",
    ready: false,
    mode: null,
    connections: { chatgpt: false, openRouter: false },
    billing: "subscription",
    detected: null,
    hasSavedConfiguration: false,
    models: [],
    separateAuthPath: join(piAccountDir(), "pi-auth.json"),
    openRouterAuthPath: openRouterAuthPath(),
    diagnosticLogPath: resolve(diagnosticLogPath()),
    localTracePath: resolve(diagnosticLogPath("spans.ndjson")),
    traceExport: traceExportConfiguration(),
    runtime: {
      label: "Bundled Pi SDK",
      detail: "No separate Pi or Codex CLI installation is required.",
    },
    authentication: {
      configured: false,
      label: "Not connected",
      source: join(piAccountDir(), "pi-auth.json"),
    },
    selection: {
      ...defaultPiSelection,
      provider: "ChatGPT",
      model: PI_MODEL_LABEL,
    },
    issue: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Pi could not inspect its runtime.";
}

export async function getPiSetupStatus(
  sdkLoader: PiSdkLoader = loadPiSdk,
  preview = false,
): Promise<PiSetupStatus> {
  const status = baseStatus();
  try {
    const sdk = await sdkLoader();
    const catalog = await createPiCatalog(sdk);
    status.models = piModelOptions(catalog);
    const modelName = (selection: PiSelection) =>
      status.models.find(
        (model) =>
          model.providerId === selection.providerId &&
          model.id === selection.modelId,
      )?.name ?? selection.modelId;
    // Detection is read-only and runs before rendering, including recovery from
    // a broken saved login.
    status.detected = await detectPiSetup(sdk);
    let configuration;
    try {
      configuration = readPiConfiguration();
    } catch (error) {
      if (!preview) throw error;
    }
    status.hasSavedConfiguration = Boolean(configuration);
    status.connections.chatgpt = Boolean(configuration?.mode);
    // Damage to an unused account must not disable the selected one. The
    // active credential is checked below and still reports its own error.
    try {
      status.connections.openRouter = Boolean(readOpenRouterKey());
    } catch {
      status.connections.openRouter = false;
    }
    if (!configuration || preview) {
      const detected = status.detected;
      const selection = detected.canReuse
        ? detected.selection
        : defaultPiSelection;
      return {
        ...status,
        detected,
        selection: {
          ...selection,
          provider: "ChatGPT",
          model: modelName(selection),
        },
        authentication: {
          configured: detected.canReuse,
          label: detected.canReuse
            ? "ChatGPT OAuth found — not used yet"
            : "ChatGPT connection required",
          source: detected.canReuse
            ? detected.authPath
            : status.separateAuthPath,
        },
      };
    }
    status.mode = configuration.mode ?? null;
    status.selection = {
      providerId: configuration.providerId,
      modelId: configuration.modelId,
      reasoningEffort: configuration.reasoningEffort,
      provider: providerLabel(configuration.providerId),
      model: configuration.modelId,
    };
    const expected = activeCredential(configuration);
    status.authentication.source =
      expected?.authPath ?? status.separateAuthPath;
    let model;
    try {
      model = validatePiSelection(catalog, configuration);
    } catch (error) {
      return {
        ...status,
        state: "model-unavailable",
        ready: false,
        issue: errorMessage(error),
      };
    }

    status.selection.model = modelName(configuration);
    const credential = expected
      ? readPiCredential(expected.authPath, configuration.providerId)
      : null;
    if (!expected || !credential) {
      return { ...status, state: "needs-auth", ready: false };
    }
    if (credential.type !== expected.type) {
      return {
        ...status,
        state: "auth-error",
        ready: false,
        authentication: {
          ...status.authentication,
          configured: true,
          label: "Unsupported credential type",
        },
        issue: `The credential type changed. Connect ${status.selection.provider} again.`,
      };
    }
    status.billing =
      credential.type === "oauth" &&
      catalog.getProvider(model.provider)?.auth.oauth?.isSubscription
        ? "subscription"
        : "api";

    return {
      ...status,
      state: "ready",
      ready: true,
      authentication: {
        ...status.authentication,
        configured: true,
        label: `${status.selection.provider} connected — checked with provider on send`,
      },
    };
  } catch (error) {
    return {
      ...status,
      state: status.hasSavedConfiguration
        ? "auth-error"
        : "runtime-unavailable",
      ready: false,
      issue: errorMessage(error),
    };
  }
}

export type PiLoginAttemptState =
  "starting" | "awaiting-user" | "complete" | "failed" | "cancelled";

export interface PiLoginAttempt {
  id: string;
  state: PiLoginAttemptState;
  verificationUri: string | null;
  userCode: string | null;
  message: string;
  expiresAt: string | null;
  selection: PiSelection;
  authPath: string;
}

interface PiLoginAttemptRecord {
  public: PiLoginAttempt;
  controller: AbortController;
  updatedAt: number;
}

const ACTIVE_ATTEMPT_TTL_MS = 16 * 60_000;
const FINISHED_ATTEMPT_TTL_MS = 5 * 60_000;

export class PiLoginCoordinator {
  private readonly attempts = new Map<string, PiLoginAttemptRecord>();

  constructor(private readonly sdkLoader: PiSdkLoader = loadPiSdk) {}

  start(
    preferences: Pick<PiSelection, "modelId" | "reasoningEffort"> & {
      providerId?: string;
    },
  ): PiLoginAttempt {
    this.cleanup();
    openRouterLogin.cancelAll();
    // Signing in to ChatGPT from an OpenRouter model starts on ChatGPT's own.
    if (preferences.providerId && preferences.providerId !== PI_PROVIDER_ID)
      preferences = defaultPiSelection;
    for (const record of this.attempts.values()) {
      if (
        record.public.state === "starting" ||
        record.public.state === "awaiting-user"
      ) {
        return { ...record.public };
      }
    }
    const id = randomUUID();
    const record: PiLoginAttemptRecord = {
      public: {
        id,
        state: "starting",
        verificationUri: null,
        userCode: null,
        message: "Requesting a one-time code from OpenAI…",
        expiresAt: null,
        selection: {
          modelId: preferences.modelId,
          reasoningEffort: preferences.reasoningEffort,
          providerId: PI_PROVIDER_ID,
        },
        authPath: join(piAccountDir(), `pi-auth-${id}.json`),
      },
      controller: new AbortController(),
      updatedAt: Date.now(),
    };
    this.attempts.set(id, record);
    void this.run(record);
    return { ...record.public };
  }

  get(id: string): PiLoginAttempt | null {
    this.cleanup();
    const record = this.attempts.get(id);
    return record ? { ...record.public } : null;
  }

  cancel(id: string): PiLoginAttempt | null {
    this.cleanup();
    const record = this.attempts.get(id);
    if (!record) return null;
    if (
      record.public.state === "starting" ||
      record.public.state === "awaiting-user"
    ) {
      record.controller.abort();
      this.update(record, {
        state: "cancelled",
        message: "Sign-in cancelled. No login was changed.",
      });
    }
    return { ...record.public };
  }

  cancelAll() {
    for (const id of this.attempts.keys()) this.cancel(id);
  }

  disconnect() {
    // A pending login must not reconnect this installation after disconnect
    // returns.
    this.cancelAll();
    forgetChatgpt();
  }

  private update(
    record: PiLoginAttemptRecord,
    update: Partial<PiLoginAttempt>,
  ) {
    record.public = { ...record.public, ...update };
    record.updatedAt = Date.now();
  }

  private async run(record: PiLoginAttemptRecord) {
    let accepted = false;
    try {
      const sdk = await this.sdkLoader();
      record.controller.signal.throwIfAborted();
      const { selection, authPath } = record.public;
      const modelRuntime = await sdk.ModelRuntime.create({
        authPath,
        modelsPath: null,
        refreshOnCreate: false,
      });
      validatePiSelection(modelRuntime, selection);
      record.controller.signal.throwIfAborted();
      mkdirSync(piAccountDir(), { recursive: true, mode: 0o700 });
      let synchronizationWarning = false;
      try {
        await modelRuntime.login(PI_PROVIDER_ID, "oauth", {
          signal: record.controller.signal,
          prompt: async (prompt) => {
            if (
              prompt.type === "select" &&
              prompt.options.some((option) => option.id === "device_code")
            ) {
              return "device_code";
            }
            throw new Error(
              `Pi requested an unsupported ${prompt.type} login prompt.`,
            );
          },
          notify: (event) => {
            if (record.controller.signal.aborted) return;
            if (event.type === "device_code") {
              this.update(record, {
                state: "awaiting-user",
                verificationUri: event.verificationUri,
                userCode: event.userCode,
                message: "Open OpenAI, enter the code, then return here.",
                expiresAt: new Date(
                  Date.now() + (event.expiresInSeconds ?? 15 * 60) * 1000,
                ).toISOString(),
              });
            } else if (event.type === "progress") {
              this.update(record, { message: event.message });
            }
          },
        });
      } catch (error) {
        if (
          !sdk.CredentialSynchronizationError ||
          !(error instanceof sdk.CredentialSynchronizationError)
        )
          throw error;
        // This SDK error means the credential was saved, but its local snapshot
        // refresh failed.
        // Never expose the error object: it contains the credential itself.
        synchronizationWarning = true;
      }
      record.controller.signal.throwIfAborted();
      if (readPiCredential(authPath, PI_PROVIDER_ID)?.type !== "oauth")
        throw new Error(
          "Sign-in did not save a usable ChatGPT login. Try again.",
        );
      // Commit one configuration pointer only after success. Old credentials
      // and in-flight turns stay intact.
      savePiConfiguration({
        ...selection,
        mode: "separate",
        authPath,
      });
      accepted = true;
      this.update(record, {
        state: "complete",
        message: synchronizationWarning
          ? "Login saved. Pi’s local refresh failed; access will be checked when you send a message."
          : "ChatGPT login saved.",
      });
    } catch (error) {
      if (record.controller.signal.aborted) return;
      this.update(record, {
        state: "failed",
        message: errorMessage(error),
      });
    } finally {
      // Only this attempt's unaccepted file is disposable, never the user's
      // existing login.
      if (!accepted) {
        try {
          rmSync(record.public.authPath, { force: true });
        } catch {
          this.update(record, {
            message:
              record.public.message +
              " An unused login file could not be removed; see storage details.",
          });
        }
      }
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, record] of this.attempts) {
      const active =
        record.public.state === "starting" ||
        record.public.state === "awaiting-user";
      const ttl = active ? ACTIVE_ATTEMPT_TTL_MS : FINISHED_ATTEMPT_TTL_MS;
      if (now - record.updatedAt <= ttl) continue;
      if (active) record.controller.abort();
      this.attempts.delete(id);
    }
  }
}

const globalForPiLogin = globalThis as typeof globalThis & {
  hallviPiLoginCoordinator?: PiLoginCoordinator;
};

export const piLoginCoordinator =
  globalForPiLogin.hallviPiLoginCoordinator ?? new PiLoginCoordinator();

if (process.env.NODE_ENV !== "production") {
  globalForPiLogin.hallviPiLoginCoordinator = piLoginCoordinator;
}
