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
import { listApplicationChats } from "./db";
import { getPiRun } from "./pi-runs";
import { piConfigDir } from "./pi-configuration";
import { redactSecrets } from "./secrets";
import type { PiRun } from "./types";

export const operatorSettingsSchema = z.object({
  permissionMode: z.enum(["always-ask", "pi-decides", "bypass"]),
  host: z
    .object({
      address: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/),
      user: z.string().regex(/^[a-z_][a-z0-9_-]*$/),
      port: z.number().int().min(1).max(65535),
      privateKeyPath: z.string().startsWith("/"),
      knownHostsPath: z.string().startsWith("/"),
    })
    .nullable(),
});
export type OperatorSettings = z.infer<typeof operatorSettingsSchema>;
export interface ExecutionRecord {
  id: string;
  applicationId: string;
  chatId: string;
  runId: string;
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
  loadApplication(applicationId);
  return operatorSettingsSchema.parse(
    read(join(directory(applicationId), "settings.json")) ?? {
      permissionMode: "pi-decides",
      host: null,
    },
  );
}
export function saveOperatorSettings(
  applicationId: string,
  value: OperatorSettings,
) {
  loadApplication(applicationId);
  mkdirSync(directory(applicationId), { recursive: true, mode: 0o700 });
  const settings = operatorSettingsSchema.parse(value);
  write(join(directory(applicationId), "settings.json"), settings);
  return settings;
}
export function isMainChat(applicationId: string, chatId: string) {
  loadChat(applicationId, chatId);
  return listApplicationChats(applicationId)[0]?.id === chatId;
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
      // A stopped turn is never resumed or replayed by this execution log.
      if (
        ["running", "awaiting-approval"].includes(record.status) &&
        getPiRun(record.runId)?.status !== "running"
      )
        return {
          ...record,
          status: "interrupted" as const,
          output:
            record.output ||
            "The turn stopped. Any remote effect must be checked by Pi.",
        };
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
  if (
    !record ||
    record.status !== "awaiting-approval" ||
    getPiRun(record.runId)?.status !== "running"
  )
    throw new Error("This request is no longer waiting for approval.");
  writeFileSync(
    `${recordPath(applicationId, id)}.decision`,
    JSON.stringify({ approved }),
    { flag: "wx", mode: 0o600 },
  );
  return { approved };
}
export function executionContext(run: PiRun, signal?: AbortSignal) {
  let lastApproval: string | undefined;
  async function execute<T>(
    tool: string,
    target: string,
    input: unknown,
    work: (output: (text: string) => void) => Promise<T>,
    ask = false,
  ): Promise<T | { declined: true }> {
    signal?.throwIfAborted();
    if (!isMainChat(run.applicationId, run.chatId))
      throw new Error(
        "Side chats are read-only. Send this work to the main operator.",
      );
    if (getPiRun(run.id)?.status !== "running")
      throw new Error("This turn is no longer running.");
    const mode = operatorSettings(run.applicationId).permissionMode;
    const needsApproval =
      mode === "always-ask" || (mode === "pi-decides" && ask);
    const record: ExecutionRecord = {
      id: randomUUID(),
      applicationId: run.applicationId,
      chatId: run.chatId,
      runId: run.id,
      tool,
      target,
      input: redactSecrets(
        typeof input === "string" ? input : JSON.stringify(input),
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
    const output = (text: string) => {
      record.output = redactSecrets(text).text.slice(-100_000);
      save();
    };
    save();
    try {
      if (needsApproval) {
        let decision;
        while (!(decision = read<{ approved: boolean }>(`${path}.decision`))) {
          await delay(150, undefined, { signal });
          if (getPiRun(run.id)?.status !== "running")
            throw new Error("This turn stopped while waiting for approval.");
        }
        signal?.throwIfAborted();
        if (!decision.approved) {
          record.status = "declined";
          return { declined: true };
        }
        record.approvalId = record.id;
        if (ask) lastApproval = record.id;
      }
      if (getPiRun(run.id)?.status !== "running")
        throw new Error("This turn is no longer running.");
      record.status = "running";
      save();
      const result = await work(output);
      output(typeof result === "string" ? result : JSON.stringify(result));
      const exitCode =
        result && typeof result === "object" && "exitCode" in result
          ? (result.exitCode as number | null)
          : undefined;
      record.exitCode = exitCode;
      record.status =
        exitCode === undefined || exitCode === 0 ? "succeeded" : "failed";
      return result;
    } catch (error) {
      record.status =
        signal?.aborted || getPiRun(run.id)?.status !== "running"
          ? "interrupted"
          : "failed";
      output(
        record.output +
          "\n" +
          (error instanceof Error ? error.message : "Execution failed."),
      );
      throw new Error(
        redactSecrets(
          error instanceof Error ? error.message : "Execution failed.",
        ).text,
      );
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
          "-F",
          "/dev/null",
          "-T",
          "-i",
          host.privateKeyPath,
          "-p",
          String(host.port),
          "-o",
          `UserKnownHostsFile=${host.knownHostsPath}`,
          "-o",
          "StrictHostKeyChecking=yes",
          "-o",
          "BatchMode=yes",
          "-o",
          "IdentitiesOnly=yes",
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
