import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { createPiCatalog, defaultPiSelection, detectPiSetup, loadPiSdk, piConfigDir, readPiConfiguration, readPiCredential } from "./pi-configuration";
import type { DetectedPiSetup, PiSdkLoader, PiSelection } from "./pi-configuration";
import { PI_MODEL_ID, PI_PROVIDER_ID } from "./pi-settings";

export type PiSetupState =
  | "needs-choice"
  | "ready"
  | "needs-auth"
  | "auth-error"
  | "model-unavailable"
  | "runtime-unavailable";

export interface PiSetupStatus {
  state: PiSetupState;
  ready: boolean;
  mode: "shared" | "separate" | null;
  billing: "subscription" | "api";
  detected: DetectedPiSetup | null;
  hasSavedConfiguration: boolean;
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

function baseStatus(): PiSetupStatus {
  return {
    state: "needs-choice",
    ready: false,
    mode: null,
    billing: "subscription",
    detected: null,
    hasSavedConfiguration: false,
    runtime: {
      label: "Bundled Pi SDK",
      detail: "No separate Pi or Codex CLI installation is required.",
    },
    authentication: {
      configured: false,
      label: "Not connected",
      source: join(piConfigDir(), "pi-auth.json"),
    },
    selection: {
      ...defaultPiSelection,
      provider: "OpenAI Codex",
      model: "GPT-5.6 Sol",
    },
    issue: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Pi could not inspect its runtime.";
}

export async function getPiSetupStatus(
  sdkLoader: PiSdkLoader = loadPiSdk,
  preview = false,
): Promise<PiSetupStatus> {
  const status = baseStatus();
  try {
    const sdk = await sdkLoader();
    let configuration;
    try { configuration = readPiConfiguration(); } catch (error) { if (!preview) throw error; }
    status.hasSavedConfiguration = Boolean(configuration);
    if (!configuration || preview) {
      const detected = await detectPiSetup(sdk);
      return {
        ...status,
        detected,
        billing: detected.billing,
        selection: { ...detected.selection, provider: detected.selection.providerId, model: detected.selection.modelId },
        authentication: {
          configured: Boolean(detected.credentialType),
          label: detected.credentialType ? `${detected.credentialType === "oauth" ? "OAuth" : "API key"} found — not used yet` : "No matching credential",
          source: detected.authPath,
        },
      };
    }
    status.mode = configuration.mode;
    status.selection = { providerId: configuration.providerId, modelId: configuration.modelId, reasoningEffort: configuration.reasoningEffort, provider: configuration.providerId, model: configuration.modelId };
    status.authentication.source = configuration.authPath;
    const catalog = await createPiCatalog(sdk);
    const model = catalog.getModel(configuration.providerId, configuration.modelId);
    if (!model) {
      return {
        ...status,
        state: "model-unavailable",
        ready: false,
        issue: "The chosen model is not present in the bundled Pi catalog. Choose a setup again.",
      };
    }

    status.selection.model = model.name;
    const credential = readPiCredential(configuration.authPath, configuration.providerId);
    if (!credential) {
      return { ...status, state: "needs-auth", ready: false };
    }
    if (credential.type !== configuration.credentialType) {
      return {
        ...status,
        state: "auth-error",
        ready: false,
        authentication: {
          ...status.authentication,
          configured: true,
          label: "Unsupported credential type",
        },
        issue: "The credential type changed. Choose a setup again to confirm its billing method.",
      };
    }
    status.billing = credential.type === "oauth" && catalog.getProvider(configuration.providerId)?.auth.oauth?.isSubscription
      ? "subscription" : "api";

    return {
      ...status,
      state: "ready",
      ready: true,
      authentication: {
        ...status.authentication,
        configured: true,
        label: `${credential.type === "oauth" ? "OAuth" : "API key"} present — checked with provider on send`,
      },
    };
  } catch (error) {
    return {
      ...status,
      state: status.mode ? "auth-error" : "runtime-unavailable",
      ready: false,
      issue: errorMessage(error),
    };
  }
}

export type PiLoginAttemptState = "starting" | "awaiting-user" | "complete" | "failed" | "cancelled";

export interface PiLoginAttempt {
  id: string;
  state: PiLoginAttemptState;
  verificationUri: string | null;
  userCode: string | null;
  message: string;
  expiresAt: string | null;
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

  start(): PiLoginAttempt {
    this.cleanup();
    for (const record of this.attempts.values()) {
      if (record.public.state === "starting" || record.public.state === "awaiting-user") {
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
    if (record.public.state === "starting" || record.public.state === "awaiting-user") {
      record.controller.abort();
      this.update(record, {
        state: "cancelled",
        message: "Login cancelled. No credential was saved.",
      });
    }
    return { ...record.public };
  }

  private update(record: PiLoginAttemptRecord, update: Partial<PiLoginAttempt>) {
    record.public = { ...record.public, ...update };
    record.updatedAt = Date.now();
  }

  private async run(record: PiLoginAttemptRecord) {
    try {
      const configuration = readPiConfiguration();
      if (configuration?.mode !== "separate") {
        throw new Error("Choose Configure separately before connecting ChatGPT. Shared Pi credentials are not overwritten here.");
      }
      const sdk = await this.sdkLoader();
      const modelRuntime = await sdk.ModelRuntime.create({ authPath: configuration.authPath, modelsPath: null, refreshOnCreate: false });
      if (!modelRuntime.getModel(PI_PROVIDER_ID, PI_MODEL_ID)) {
        throw new Error(`${PI_PROVIDER_ID}/${PI_MODEL_ID} is unavailable.`);
      }
      await modelRuntime.login(PI_PROVIDER_ID, "oauth", {
        signal: record.controller.signal,
        prompt: async (prompt) => {
          if (
            prompt.type === "select" &&
            prompt.options.some((option) => option.id === "device_code")
          ) {
            return "device_code";
          }
          throw new Error(`Pi requested an unsupported ${prompt.type} login prompt.`);
        },
        notify: (event) => {
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
      if (!record.controller.signal.aborted) {
        this.update(record, {
          state: "complete",
          message: "ChatGPT OAuth is connected in Server Guy’s separate credential file.",
        });
      }
    } catch (error) {
      if (record.controller.signal.aborted) return;
      this.update(record, {
        state: "failed",
        message: errorMessage(error),
      });
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, record] of this.attempts) {
      const active = record.public.state === "starting" || record.public.state === "awaiting-user";
      const ttl = active ? ACTIVE_ATTEMPT_TTL_MS : FINISHED_ATTEMPT_TTL_MS;
      if (now - record.updatedAt <= ttl) continue;
      if (active) record.controller.abort();
      this.attempts.delete(id);
    }
  }
}

const globalForPiLogin = globalThis as typeof globalThis & {
  serverGuyPiLoginCoordinator?: PiLoginCoordinator;
};

export const piLoginCoordinator =
  globalForPiLogin.serverGuyPiLoginCoordinator ?? new PiLoginCoordinator();

if (process.env.NODE_ENV !== "production") {
  globalForPiLogin.serverGuyPiLoginCoordinator = piLoginCoordinator;
}
