export type ObservationStatus = "passed" | "failed" | "unavailable";

export interface ApplicationRecord {
  id: string;
  name: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  createdAt: string;
  updatedAt: string;
  permissionMode?: import("./operator-data").OperatorSettings["permissionMode"];
  host?: import("./operator-data").OperatorSettings["host"];
  repositoryId?: number | null;
  repositoryCheck?: Observation | null;
}

/** An application-owned transcript with its own native model session. */
export interface Chat {
  id: string;
  applicationId: string;
  title: string;
  createdAt: string;
  archivedAt: string | null;
  kind?: "main" | "side";
  status?: import("./operator-data").ConversationStatus;
  currentResponseId?: string | null;
}

/** A chat as the list shows it: with the time of its newest message. */
export interface ChatSummary extends Chat {
  lastActivityAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  body: string;
  blocks?: import("./operator-data").MessageBlock[];
  /**
   * `user` is the engineer's own message. `haldur` marks a recorded
   * event or a request Haldur started itself; it is never presented as
   * the engineer's words. The stored value keeps the product's former name
   * so messages already saved under it read the same way.
   */
  source: "user" | "pi" | "haldur";
  createdAt: string;
  status: "completed" | PiRunStatus;
  revision: number;
}

export type PiRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "interrupted";

export interface PiRun {
  id: string;
  applicationId: string;
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestKey: string;
  retryOfId: string | null;
  status: PiRunStatus;
  revision: number;
  error: string | null;
  piCalls: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AcceptedPiRun {
  run: PiRun;
  userMessageId: string;
  assistantMessageId: string;
}

export interface Decision {
  id: string;
  applicationId: string;
  sourceMessageId: string;
  kind: "launch-priority";
  label: string;
  value: string;
  supersededById: string | null;
  createdAt: string;
}

export interface Observation {
  id: string;
  applicationId: string;
  kind: string;
  status: ObservationStatus;
  summary: string;
  sourceLabel: string;
  sourceUrl: string | null;
  raw: unknown;
  observedAt: string;
}

/**
 * One meaningful application event: a saved or changed requirement, a
 * repository access result, or retained history of retired preparation work.
 * Reply execution is not an Activity Event; it travels with its Chat reply.
 */
export interface ActivityEvent {
  id: string;
  applicationId: string;
  kind: string;
  summary: string;
  detail: string;
  createdAt: string;
}

/**
 * The authoritative Chat state delivered over SSE and on demand: messages,
 * their Pi Runs, the application's operations and Activity.
 */
export interface ChatRunSnapshot {
  executions?: import("./operator-execution").ExecutionRecord[];
  /** Whether a Pi worker is alive to read this queue. */
  worker?: import("./worker-presence").WorkerPresence;
  information?: import("./operator-data").SavedInformation[];
  operations?: import("./operation-record").ApplicationOperation[];
  /** What Pi ran during these runs, in order. */
  piActivity?: import("./pi-activity").ActivityRecord[];
  messages: ChatMessage[];
  runs: PiRun[];
  activity: ActivityEvent[];
}

/** The application page: conversations and the shared application records. */
export interface OperatorView {
  executions?: import("./operator-execution").ExecutionRecord[];
  /** Whether a Pi worker is alive to read this application's queue. */
  worker?: import("./worker-presence").WorkerPresence;
  information?: import("./operator-data").SavedInformation[];
  /**
   * What Pi has asked the owner for: names, reasons, and whether a value has
   * been supplied. Never values — there is no route that returns one.
   */
  secrets?: import("./application-secrets").SecretRequest[];

  operations?: import("./operation-record").ApplicationOperation[];
  /** What Pi ran in this application's conversations, in order. */
  piActivity?: import("./pi-activity").ActivityRecord[];
  application: ApplicationRecord | null;
  /** The latest repository access check with the current GitHub login. */
  repository?: {
    status: "passed" | "blocked" | "not-yet";
    result: string;
    checkedAt: string | null;
    /** Whether a GitHub login is saved to run the check with. */
    connected: boolean;
  };
  chats: ChatSummary[];
  selectedChatId: string | null;
  messages: ChatMessage[];
  /** Active saved requirements. */
  decisions: Decision[];
  activity: ActivityEvent[];
  /**
   * Facts the controller can read from its own durable records, carried on
   * the view so the shell's existing poll refreshes them. A view that fetches
   * its own facts on demand, like the firewall, merges them over these.
   */
  facts?: import("./application-facts").ApplicationFacts;
}

export interface CreateApplicationInput {
  /** Stable identity for one creation attempt, retained across HTTP retries. */
  requestKey?: string;
  name?: string;
  repositoryUrl: string;
}

export interface PiDecision {
  kind: "launch-priority";
  value: string;
  replaces?: string;
}

export interface PiTurnResult {
  message: string;
}
