// Types for the plain-Node controller client the `hallvi` command uses, and
// that an adapter for another agent can use in the same way.
export const ENVIRONMENT: "HALLVI_CONTROLLER_URL";
export const SETTLED: string[];
export function isId(value: string | undefined): boolean;

export class ClientError extends Error {
  constructor(code: string, message: string, options?: { transient?: boolean });
  code: string;
  transient: boolean;
  /** The last state read before an observation failed, when there was one. */
  outcome?: Outcome | null;
}

export interface Target {
  controller: string;
  applicationId: string;
  chatId: string;
  requestKey: string;
}

/** What the controller says became of a request: docs/cli.md. */
export interface Outcome {
  applicationId: string;
  chatId: string;
  requestKey: string;
  status: string;
  operation: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    requestKeys: string[];
  } | null;
  answer: string | null;
  answerTruncated: boolean;
  failure: string | null;
  attention: {
    kind: "approval" | "input" | "interrupted";
    reason: string;
    page: string;
    executionId?: string;
  } | null;
  evidence: Record<string, unknown>[];
  evidenceOmitted: number;
  /** Set only when the request was seen and then no longer held by Pi. */
  dropped?: string;
}

type Env = Record<string, string | undefined>;
export function controllerOrigin(value: string, from: string): string;
export function selectController(options?: {
  flag?: string;
  env?: Env;
}): string;
export function requestHandle(target: Target): string;
export function parseHandle(
  handle: string,
  options?: { flag?: string; env?: Env },
): Target;
export function newRequestKey(): string;

type Options = { signal?: AbortSignal };
export function controllerClient(controller: string): {
  controller: string;
  applications(options?: Options): Promise<Record<string, unknown>[]>;
  application(
    applicationId: string,
    options?: Options,
  ): Promise<Record<string, unknown> & { mainChatId: string | null }>;
  outcome(target: Target, options?: Options): Promise<Outcome>;
  inspection(
    applicationId: string,
    options?: Options,
  ): Promise<Record<string, unknown>>;
  execution(
    applicationId: string,
    executionId: string,
    options?: Options,
  ): Promise<Record<string, unknown>>;
  send(
    request: Omit<Target, "controller"> & { message: string },
    options?: Options & { attempts?: number; pauseMs?: number },
  ): Promise<{ accepted: true }>;
};

export function observe(
  client: ReturnType<typeof controllerClient>,
  target: Target,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    onChange?: (outcome: Outcome) => void;
    known?: boolean;
    pollMs?: number;
    patienceMs?: number;
  },
): Promise<{
  outcome: Outcome | null;
  stopped: "timeout" | "signal" | null;
  /** Set when the time ran out while reads were failing. */
  problem?: ClientError;
}>;
