import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  PI_MODEL_ID,
  PI_MODEL_LABEL,
  PI_PROVIDER_ID,
  PI_PROVIDER_LABEL,
  PI_REASONING_EFFORT,
} from "./pi-settings";

type PiSdk = typeof import("@earendil-works/pi-coding-agent");
type PiSdkLoader = () => Promise<PiSdk>;

const loadPiSdk: PiSdkLoader = () => import("@earendil-works/pi-coding-agent");

export type PiSetupState =
  | "ready"
  | "needs-auth"
  | "auth-error"
  | "model-unavailable"
  | "runtime-unavailable";

export interface PiSetupStatus {
  state: PiSetupState;
  ready: boolean;
  runtime: {
    label: string;
    detail: string;
  };
  authentication: {
    configured: boolean;
    label: string;
    source: string;
  };
  selection: {
    provider: string;
    providerId: string;
    model: string;
    modelId: string;
    reasoningEffort: typeof PI_REASONING_EFFORT;
  };
  issue: string | null;
}

function baseStatus(credentialSource: string): Omit<PiSetupStatus, "state" | "ready"> {
  return {
    runtime: {
      label: "Bundled Pi SDK",
      detail: "No separate Pi or Codex CLI installation is required.",
    },
    authentication: {
      configured: false,
      label: "Not connected",
      source: credentialSource,
    },
    selection: {
      provider: PI_PROVIDER_LABEL,
      providerId: PI_PROVIDER_ID,
      model: PI_MODEL_LABEL,
      modelId: PI_MODEL_ID,
      reasoningEffort: PI_REASONING_EFFORT,
    },
    issue: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Pi could not inspect its runtime.";
}

export async function getPiSetupStatus(
  sdkLoader: PiSdkLoader = loadPiSdk,
): Promise<PiSetupStatus> {
  let sdk: PiSdk;
  try {
    sdk = await sdkLoader();
  } catch (error) {
    return {
      ...baseStatus("Unavailable until the bundled runtime loads"),
      state: "runtime-unavailable",
      ready: false,
      runtime: {
        label: "Pi runtime unavailable",
        detail: "Server Guy could not load its bundled Pi SDK.",
      },
      issue: errorMessage(error),
    };
  }

  const credentialSource = join(sdk.getAgentDir(), "auth.json");
  const status = baseStatus(credentialSource);

  try {
    const modelRuntime = await sdk.ModelRuntime.create({ refreshOnCreate: false });
    const model = modelRuntime.getModel(PI_PROVIDER_ID, PI_MODEL_ID);
    if (!model) {
      return {
        ...status,
        state: "model-unavailable",
        ready: false,
        issue: `${PI_PROVIDER_ID}/${PI_MODEL_ID} is not present in the bundled Pi model catalog.`,
      };
    }

    const credentials = await modelRuntime.listCredentials();
    const credential = credentials.find((entry) => entry.providerId === PI_PROVIDER_ID);
    if (!credential) {
      return { ...status, state: "needs-auth", ready: false };
    }
    if (credential.type !== "oauth") {
      return {
        ...status,
        state: "auth-error",
        ready: false,
        authentication: {
          ...status.authentication,
          configured: true,
          label: "Unsupported credential type",
        },
        issue: "Server Guy requires ChatGPT OAuth for the openai-codex provider.",
      };
    }

    try {
      const resolved = await modelRuntime.getAuth(model);
      if (!resolved) {
        return { ...status, state: "needs-auth", ready: false };
      }
    } catch (error) {
      return {
        ...status,
        state: "auth-error",
        ready: false,
        authentication: {
          ...status.authentication,
          configured: true,
          label: "ChatGPT OAuth needs attention",
        },
        issue: `Pi could not refresh the stored credential: ${errorMessage(error)}`,
      };
    }

    return {
      ...status,
      state: "ready",
      ready: true,
      authentication: {
        ...status.authentication,
        configured: true,
        label: "Connected with ChatGPT OAuth",
      },
    };
  } catch (error) {
    return {
      ...status,
      state: "runtime-unavailable",
      ready: false,
      runtime: {
        label: "Pi runtime unavailable",
        detail: "Server Guy loaded Pi but could not initialize its model runtime.",
      },
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
      const sdk = await this.sdkLoader();
      const modelRuntime = await sdk.ModelRuntime.create({ refreshOnCreate: false });
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
          message: "ChatGPT OAuth is connected and stored by Pi.",
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
