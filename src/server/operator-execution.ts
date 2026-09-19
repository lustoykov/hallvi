import { linkActivityExecution, settleActivity } from "./pi-activity";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { loadApplication, loadChat } from "./applications";
import { piConfigDir } from "./pi-configuration";
import { redactHeldSecrets } from "./application-secrets";
import { redactSecrets } from "./secrets";
import { managedSshOptions } from "./managed-ssh";

import { operatorSettingsSchema, type OperatorSettings } from "./operator-data";
export { operatorSettingsSchema, type OperatorSettings } from "./operator-data";
import { db } from "./db";
import { applications } from "./db-schema";
import { eq } from "drizzle-orm";
export interface ExecutionRecord {
  id: string;
  applicationId: string;
  chatId: string;
  /** Where the conversation shows it: set on read, from Pi's transcript. */
  runId: string;
  /** Pi's id for the tool call that made this record. */
  toolCallId?: string;
  tool: string;
  target: string;
  input: string;
  mode: OperatorSettings["permissionMode"];
  status:
    | "awaiting-approval"
    | "running"
    | "succeeded"
    | "failed"
    | "declined"
    | "interrupted";
  output: string;
  exitCode?: number | null;
  approvalId?: string;
  createdAt: string;
  /** When output last arrived, so a quiet command can say how quiet it is. */
  outputAt?: string;
  finishedAt?: string;
}
function directory(applicationId: string) {
  return join(piConfigDir(), "operator", z.uuid().parse(applicationId));
}
function read<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
function write(path: string, value: unknown) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, path);
}
export function operatorSettings(applicationId: string): OperatorSettings {
  const application = loadApplication(applicationId);
  return operatorSettingsSchema.parse({
    permissionMode: application.permissionMode,
    host: application.host,
  });
}
export function saveOperatorSettings(
  applicationId: string,
  value: OperatorSettings,
) {
  loadApplication(applicationId);
  const settings = operatorSettingsSchema.parse(value);
  db()
    .update(applications)
    .set({ ...settings, updatedAt: new Date().toISOString() })
    .where(eq(applications.id, applicationId))
    .run();
  return settings;
}
export function isMainChat(applicationId: string, chatId: string) {
  loadChat(applicationId, chatId);
  return loadChat(applicationId, chatId).chat.kind === "main";
}
function executionDirectory(applicationId: string) {
  return join(directory(applicationId), "executions");
}
function recordPath(applicationId: string, id: string) {
  return join(executionDirectory(applicationId), `${z.uuid().parse(id)}.json`);
}
export function listExecutions(applicationId: string): ExecutionRecord[] {
  loadApplication(applicationId);
  let files: string[];
  try {
    files = readdirSync(executionDirectory(applicationId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return files
    .filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
    .map((name) => {
      const record = read<ExecutionRecord>(
        join(executionDirectory(applicationId), name),
      )!;
      return record;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function decideExecution(
  applicationId: string,
  id: string,
  approved: boolean,
) {
  loadApplication(applicationId);
  const record = read<ExecutionRecord>(recordPath(applicationId, id));
  if (!record || record.status !== "awaiting-approval")
    throw new Error("This request is no longer waiting for approval.");
  writeFileSync(
    `${recordPath(applicationId, id)}.decision`,
    JSON.stringify({ approved }),
    { flag: "wx", mode: 0o600 },
  );
  return { approved };
}
/**
 * Every string in a tool result, cleaned. Walks the shape rather than
 * stringifying it, so a result keeps its types and a nested field cannot slip
 * through by not being the one field somebody remembered to check.
 */
function cleanResult<T>(value: T, clean: (text: string) => string): T {
  if (typeof value === "string") return clean(value) as T;
  if (Array.isArray(value))
    return value.map((item) => cleanResult(item, clean)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cleanResult(item, clean),
      ]),
    ) as T;
  return value;
}

/**
 * What a worker that went away, or a stretch that ended, left unsettled. The
 * record says so; nothing is resumed or replayed from this log.
 */
export function settleRunningExecutions(
  applicationId: string,
  chatId: string | null,
) {
  for (const record of listExecutions(applicationId))
    if (
      ["running", "awaiting-approval"].includes(record.status) &&
      (chatId === null || record.chatId === chatId)
    )
      write(recordPath(applicationId, record.id), {
        ...record,
        status: "interrupted",
        output:
          record.output ||
          "The turn stopped. Any remote effect must be checked by Pi.",
        finishedAt: new Date().toISOString(),
      });
}

/**
 * Permissions and evidence for one conversation's tools. Each record keeps
 * the id Pi gave the tool call, which is what places it in the conversation.
 * Pi's own signal for the call says when it was stopped.
 */
export function executionContext(
  run: { applicationId: string; chatId: string },
  closing?: AbortSignal,
) {
  let lastApproval: string | undefined;
  async function execute<T>(
    tool: string,
    target: string,
    input: unknown,
    work: (output: (text: string) => void) => Promise<T>,
    ask = false,
    /** Pi's tool-call id, so the activity and this record are one thing. */
    toolCallId: string,
    stopped?: AbortSignal,
  ): Promise<T | { declined: true }> {
    const signal = AbortSignal.any(
      [closing, stopped].filter((each): each is AbortSignal => Boolean(each)),
    );
    signal.throwIfAborted();
    if (!isMainChat(run.applicationId, run.chatId))
      throw new Error(
        "Side chats are read-only. Send this work to the main operator.",
      );
    const mode = operatorSettings(run.applicationId).permissionMode;
    const needsApproval =
      mode === "always-ask" || (mode === "pi-decides" && ask);
    const record: ExecutionRecord = {
      id: randomUUID(),
      applicationId: run.applicationId,
      chatId: run.chatId,
      runId: run.chatId,
      toolCallId,
      tool,
      target,
      // What Pi wrote, which carries {{secret:NAME}} handles and not values.
      // Resolution happens later and to a different string, so the record,
      // the activity and the log all keep the handle.
      input: redactSecrets(
        redactHeldSecrets(
          run.applicationId,
          typeof input === "string" ? input : JSON.stringify(input),
        ),
      ).text,
      mode,
      status: needsApproval ? "awaiting-approval" : "running",
      output: "",
      createdAt: new Date().toISOString(),
      ...(lastApproval ? { approvalId: lastApproval } : {}),
    };
    mkdirSync(executionDirectory(run.applicationId), {
      recursive: true,
      mode: 0o700,
    });
    const path = recordPath(run.applicationId, record.id);
    const save = () => write(path, record);
    // One redactor for every way text leaves this execution. A command should
    // not print its own secret, but "should" is not a property anything can
    // rely on, and each of these paths is read by somebody: the owner, the
    // log, and the model.
    const clean = (text: string) =>
      redactSecrets(redactHeldSecrets(run.applicationId, text)).text;
    const output = (text: string) => {
      const next = clean(text).slice(-100_000);
      // Only a change is news. A build that installs 201 packages prints
      // nothing for minutes at a time, and the difference between "quiet" and
      // "stopped" is the one thing a reader cannot get from the text itself.
      if (next !== record.output) record.outputAt = new Date().toISOString();
      record.output = next;
      save();
    };
    save();
    linkActivityExecution(run.applicationId, toolCallId, record.id);
    try {
      if (needsApproval) {
        let decision;
        while (!(decision = read<{ approved: boolean }>(`${path}.decision`)))
          await delay(150, undefined, { signal });
        if (!decision.approved) {
          record.status = "declined";
          // The runtime is handed an ordinary result, not an error, so the
          // activity record would otherwise keep claiming this succeeded.
          settleActivity(run.applicationId, toolCallId, "declined");
          return { declined: true };
        }
        record.approvalId = record.id;
        if (ask) lastApproval = record.id;
      }
      signal.throwIfAborted();
      record.status = "running";
      save();
      // Redacted before anything else touches it. The stored record was
      // already clean; this is the copy the model receives, and a command
      // that printed a held value used to hand it straight back.
      const result = cleanResult(await work(output), clean);
      output(
        tool === "server_bash" &&
          result &&
          typeof result === "object" &&
          "output" in result &&
          typeof result.output === "string"
          ? result.output
          : typeof result === "string"
            ? result
            : JSON.stringify(result),
      );
      const exitCode =
        result && typeof result === "object" && "exitCode" in result
          ? (result.exitCode as number | null)
          : undefined;
      record.exitCode = exitCode;
      record.status =
        exitCode === undefined || exitCode === 0 ? "succeeded" : "failed";
      return result;
    } catch (error) {
      record.status = signal.aborted ? "interrupted" : "failed";
      const said = error instanceof Error ? error.message : "Execution failed.";
      output(record.output + "\n" + said);
      // A failure can carry the value too — a connection string in a driver
      // error, a command echoed back by the shell.
      throw new Error(clean(said));
    } finally {
      record.finishedAt = new Date().toISOString();
      save();
    }
  }
  return { execute };
}

/** Keep SSH credentials and connection options outside the model arguments. */
export function runHostCommand(
  host: NonNullable<OperatorSettings["host"]>,
  command: string,
  signal?: AbortSignal,
  onOutput?: (text: string) => void,
  timeoutSeconds = 120,
) {
  return new Promise<{ output: string; exitCode: number | null }>(
    (resolve, reject) => {
      const child = spawn(
        "ssh",
        [
          ...managedSshOptions(host),
          "-T",
          "-o",
          "ConnectTimeout=10",
          "-o",
          "ServerAliveInterval=15",
          "-o",
          "ServerAliveCountMax=2",
          `${host.user}@${host.address}`,
          "bash -s",
        ],
        { signal, timeout: timeoutSeconds * 1000 },
      );
      let output = "";
      let lastUpdate = 0;
      const append = (chunk: Buffer) => {
        output = (output + chunk.toString("utf8")).slice(-100_000);
        if (Date.now() - lastUpdate > 150) {
          onOutput?.(redactSecrets(output).text);
          lastUpdate = Date.now();
        }
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", reject);
      child.on("close", (exitCode, killedBy) =>
        resolve({
          output: redactSecrets(
            output +
              (killedBy
                ? `\nSSH ended with ${killedBy}; remote completion is unknown.`
                : exitCode === 255
                  ? "\nSSH connection failed; remote completion may be unknown."
                  : ""),
          ).text,
          exitCode,
        }),
      );
      child.stdin.on("error", () => {});
      child.stdin.end(command + "\n");
    },
  );
}
