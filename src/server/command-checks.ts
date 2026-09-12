import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Criterion } from "./deployment-release";
import type { CheckResult } from "./deployment-runtime";
import { deploymentEvent, saveDeployment } from "./deployment-store";
import { deploymentSsh, shellQuote } from "./deployment-ssh";
import type { DeploymentRecord } from "./deployment-types";
import { releaseSecrets } from "./release-executor";
import { composeProject, currentFacts } from "./release-facts";

export type CommandCheck = NonNullable<Criterion["commands"]>[number];

/** Characters of a command's output kept with its result. */
const OUTPUT_CHARACTERS = 2_000;

/**
 * Where a check runs and where the host keeps its durable result: the
 * application's own Compose project, or an isolated restored copy. The
 * project never coincides with the application's for a copy.
 */
export interface CheckTarget {
  /** The directory holding compose.json. */
  cwd: string;
  project: string;
  /** Host directory for the check's start and result records. */
  results: string;
  /** Hold the deployment while this check's outcome is unknown. */
  hold: boolean;
}

/** The running application, with results beside the attempt's host result. */
export function releaseCheckTarget(
  record: DeploymentRecord,
  attemptId: string,
): CheckTarget {
  z.uuid().parse(record.id);
  z.uuid().parse(attemptId);
  const cwd = `/opt/server-guy/${record.id}`;
  return {
    cwd,
    project: composeProject(record.id),
    results: `${cwd}/releases/${attemptId}/checks`,
    hold: true,
  };
}

/** What the deployment retains while a command's outcome is unknown. */
export interface PendingCommand {
  attemptId: string;
  /** The operation whose attempt ran it. */
  operationId: string;
  name: string;
  service: string;
  token: string;
  results: string;
  startedAt: string;
  timeoutSeconds: number;
  /**
   * The owner's decision, made through a card after this hold, that the
   * command may run again should the host's record of it be lost.
   */
  acceptedAt?: string;
  acceptedBy?: string;
}

/**
 * The owner's decision that a held command may run again if its host record
 * is lost: a Retry, or an approval whose text names the unknown. A
 * continuation Pi creates under existing authority is not such a decision.
 * Nothing runs before reconciliation reads the host's record, and a command
 * still running holds regardless of any decision.
 */
export function acceptUnknownCommand(
  record: DeploymentRecord,
  decision: { title: string; operationId: string },
) {
  const pending = record.commandPending;
  if (!pending || pending.acceptedAt) return;
  pending.acceptedAt = new Date().toISOString();
  pending.acceptedBy = decision.operationId;
  deploymentEvent(
    record,
    `The owner's decision to continue (${decision.title}) accepts the unknown outcome of command check ${pending.name} (attempt ${pending.attemptId}): it may run again if the host's record shows it never completed.`,
  );
  saveDeployment(record);
}

/**
 * What an earlier attempt already established, so a reconciled verification
 * consumes its receipts instead of running the checks again.
 */
export interface VerificationResume {
  /** Passed results of the reconciled attempt, and the resolved command. */
  completed: CheckResult[];
}

/** Keep a check's result with the attempt it verifies. */
export function recordCheck(record: DeploymentRecord, result: CheckResult) {
  const attempt = record.lifecycle?.attempts.at(-1);
  if (attempt?.outcome !== "working") return;
  (attempt.checks ??= []).push(result);
  saveDeployment(record);
}

const outcomeSchema = z.object({
  exitCode: z.number().int().min(0).max(255),
  /** The command ran under the container's own timeout, so 124 stopped it. */
  bounded: z.number().int().min(0).max(1),
});

/**
 * The host-side script: private inputs are read from standard input into
 * the host shell's own names and exported only to the detached job that runs
 * the command, so no input can shadow a host variable. The job survives a
 * lost SSH session and writes the exit status beside the output. When the
 * container has `timeout`, the command runs under it, so a time limit stops
 * the command instead of only abandoning the client; 124 is then a known
 * failure. The foreground waits for the result, then prints it after the
 * marker; a still-running job prints `pending`.
 */
function checkScript(
  check: CommandCheck,
  names: string[],
  target: CheckTarget,
  token: string,
  marker: string,
) {
  const seconds = check.timeoutSeconds ?? 60;
  const compose = `docker compose -p ${shellQuote(target.project)} -f compose.json`;
  const exec = `${compose} exec -T ${names.map((name) => `-e ${name} `).join("")}${shellQuote(check.service)}`;
  const argv = check.run.map(shellQuote).join(" ");
  const results = shellQuote(target.results);
  const record = `${results}/${token}`;
  return [
    `cd ${shellQuote(target.cwd)} || exit 90`,
    ...names.map((_, index) => `IFS= read -r SG_V${index} || exit 90`),
    `mkdir -p ${results} || exit 90`,
    `printf '%s\\n' ${shellQuote(JSON.stringify({ name: check.name, service: check.service, at: new Date().toISOString() }))} > ${record}.started || exit 90`,
    ...names.map((_, index) => `export SG_V${index}`),
    // The job: detached from this session, with the recorded names bound.
    `nohup sh -c ${shellQuote(
      [
        "bounded=0",
        `if ${compose} exec -T ${shellQuote(check.service)} sh -c 'command -v timeout >/dev/null 2>&1'; then bounded=1; fi`,
        `if [ "$bounded" = 1 ]; then env ${names.map((name, index) => `${name}="$SG_V${index}" `).join("")}timeout -k 5 $((${seconds} + 15)) ${exec} timeout -k 5 ${seconds} ${argv} > ${record}.out 2>&1 </dev/null; else env ${names.map((name, index) => `${name}="$SG_V${index}" `).join("")}timeout -k 5 ${seconds} ${exec} ${argv} > ${record}.out 2>&1 </dev/null; fi`,
        "code=$?",
        `printf '{"exitCode":%s,"bounded":%s}' "$code" "$bounded" > ${record}.tmp && mv ${record}.tmp ${record}.json`,
      ].join("\n"),
    )} >/dev/null 2>&1 &`,
    `i=0; while [ ! -f ${record}.json ] && [ "$i" -lt $((${seconds} + 25)) ]; do sleep 1; i=$((i + 1)); done`,
    `if [ -f ${record}.json ]; then tail -c ${OUTPUT_CHARACTERS * 8} ${record}.out; printf '\\n${marker}%s\\n' "$(cat ${record}.json)"; else printf '\\n${marker}pending\\n'; fi`,
  ].join("\n");
}

/**
 * Run one recorded command check in a running service's container. Named
 * private inputs travel on standard input into its environment, never on a
 * command line or into records; output is redacted and bounded. The command
 * is what Pi recorded and the owner approved, so it may change data: while
 * its outcome is unknown the deployment holds, and only the host's record
 * of that command resolves the hold.
 */
export async function runCommandCheck(
  record: DeploymentRecord,
  check: CommandCheck,
  signal: AbortSignal,
  target: CheckTarget = releaseCheckTarget(
    record,
    record.lifecycle?.attempts.at(-1)?.id ?? "",
  ),
): Promise<CheckResult> {
  const secrets = releaseSecrets(record);
  const available: Record<string, string> = secrets.values;
  const names = check.inputs ?? [];
  const values = names.map((name) => {
    const value = available[name];
    if (value === undefined)
      throw new Error(
        `Command check ${check.name}: private input ${name} is unavailable.`,
      );
    if (/[\r\n]/.test(value))
      throw new Error(
        `Command check ${check.name}: private input ${name} spans lines; checks receive single-line values.`,
      );
    return value;
  });
  const marker = `SG_CHECK_EXIT_${randomUUID().replaceAll("-", "")}`;
  const seconds = check.timeoutSeconds ?? 60;
  const token = randomUUID();
  const at = new Date().toISOString();
  const started = Date.now();
  const result = (
    status: number | null,
    output: string,
    passed = status === 0 &&
      (!check.contains || output.includes(check.contains)),
  ): CheckResult => ({
    name: check.name,
    kind: "command",
    target: check.service,
    at,
    durationMs: Date.now() - started,
    passed,
    status,
    output: output.slice(-OUTPUT_CHARACTERS),
  });
  // Durable before the command can start: a crash here still leaves the
  // hold, and reconciliation reads the host's record of what happened.
  if (target.hold) {
    const attempt = record.lifecycle?.attempts.at(-1);
    record.commandPending = {
      attemptId: attempt?.id ?? "",
      operationId: attempt?.operationId ?? "",
      name: check.name,
      service: check.service,
      token,
      results: target.results,
      startedAt: at,
      timeoutSeconds: seconds,
    };
    saveDeployment(record);
  }
  const unknown = (reason: string) =>
    result(
      null,
      `${reason} The check's outcome is unknown${target.hold ? "; nothing runs again under this operation until reconcile_release reads the host's record of it. If that record is lost, only the owner's retry of this work accepts that the command may run again" : ""}.`,
    );
  let raw: string;
  try {
    raw = await deploymentSsh(
      record,
      checkScript(check, names, target, token, marker),
      {
        input: values.map((value) => `${value}\n`).join(""),
        signal,
        timeout: (seconds + 45) * 1000,
      },
    );
  } catch {
    signal.throwIfAborted();
    return unknown("The host session ended before the command's result.");
  }
  const end = raw.lastIndexOf(`\n${marker}`);
  if (end < 0)
    return unknown(
      `The host returned no result record: ${secrets.redact(raw).trim().slice(-500) || "no output"}.`,
    );
  const tail = raw.slice(end + marker.length + 1).trim();
  if (tail === "pending")
    return unknown(
      `The command was still running after ${seconds + 25} s (the host records its exit when it finishes).`,
    );
  const parsed = outcomeSchema.safeParse(
    (() => {
      try {
        return JSON.parse(tail);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    return unknown(
      `The host's result record was unreadable: ${tail.slice(0, 80)}.`,
    );
  const output = secrets.redact(raw.slice(0, end)).trim();
  const { exitCode, bounded } = parsed.data;
  if (exitCode === 124 && !bounded)
    return unknown(
      `The command exceeded its ${seconds} s limit and the container has no timeout command to stop it, so it may still be running.`,
    );
  if (target.hold) {
    record.commandPending = null;
    saveDeployment(record);
  }
  if (exitCode === 124)
    return result(
      exitCode,
      `${output ? `${output}\n` : ""}Stopped after exceeding its ${seconds} s limit.`,
      false,
    );
  return result(exitCode, output);
}

/**
 * The recorded criterion's commands, in order, after its HTTP checks. The
 * first failure stops verification with its evidence for correction; an
 * unknown outcome stops it with a hold that reconciliation resolves.
 */
export async function verifyCommandChecks(
  record: DeploymentRecord,
  signal: AbortSignal,
  resume?: VerificationResume,
) {
  if (record.commandPending)
    throw new Error(
      `Command check ${record.commandPending.name} from an earlier attempt has an unknown outcome. Reconcile it before running checks again.`,
    );
  for (const check of currentFacts(record)?.criterion?.commands ?? []) {
    // A command the reconciled attempt completed is its receipt, not a run.
    const carried = resume?.completed.find(
      (item) =>
        item.kind === "command" && item.name === check.name && item.passed,
    );
    if (carried) {
      const attempt = record.lifecycle?.attempts.at(-1);
      if (!attempt?.checks?.some((item) => item.name === check.name))
        recordCheck(record, carried);
      deploymentEvent(
        record,
        `Carried command check ${check.name} from the reconciled attempt; it did not run again.`,
      );
      continue;
    }
    const result = await runCommandCheck(record, check, signal);
    recordCheck(record, result);
    if (!result.passed)
      throw new Error(
        `Application command check failed: ${check.name} (${result.status === null ? "outcome unknown" : `exit ${result.status}`}${result.status === 0 && check.contains ? `; output lacks "${check.contains}"` : ""}). Output: ${result.output?.slice(-1200) || "none"}`,
      );
    deploymentEvent(
      record,
      `Passed command check: ${check.name} (${result.durationMs} ms)`,
    );
  }
}

/** The host's durable record of a command whose reply was lost. */
export type PendingResolution =
  | { kind: "never-started" }
  | { kind: "running" }
  | { kind: "lost" }
  | { kind: "known"; result: CheckResult };

/**
 * Read what the host recorded for a held command: nothing (it never
 * started), a start without a result (still running, or the host lost it),
 * or its exit status and output. Reading changes nothing on the host.
 */
export async function resolvePendingCommand(
  record: DeploymentRecord,
  signal: AbortSignal,
): Promise<PendingResolution> {
  const pending = record.commandPending!;
  z.uuid().parse(pending.token);
  if (!/^\/[A-Za-z0-9_./-]+$/.test(pending.results))
    throw new Error("The pending command's record path is invalid.");
  const secrets = releaseSecrets(record);
  const marker = `SG_CHECK_RECORD_${randomUUID().replaceAll("-", "")}`;
  const file = shellQuote(`${pending.results}/${pending.token}`);
  const raw = await deploymentSsh(
    record,
    [
      `if [ -f ${file}.json ]; then tail -c ${OUTPUT_CHARACTERS * 8} ${file}.out 2>/dev/null; printf '\\n${marker}%s\\n' "$(cat ${file}.json)"`,
      `elif [ -f ${file}.started ]; then printf '\\n${marker}started\\n'`,
      `else printf '\\n${marker}none\\n'; fi`,
    ].join("\n"),
    { signal, timeout: 60_000 },
  );
  const end = raw.lastIndexOf(`\n${marker}`);
  if (end < 0) throw new Error("The host returned no record.");
  const tail = raw.slice(end + marker.length + 1).trim();
  if (tail === "none") return { kind: "never-started" };
  if (tail === "started") {
    const deadline =
      Date.parse(pending.startedAt) + (pending.timeoutSeconds + 60) * 1000;
    return { kind: Date.now() < deadline ? "running" : "lost" };
  }
  const parsed = outcomeSchema.safeParse(
    (() => {
      try {
        return JSON.parse(tail);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) throw new Error("The host's record was unreadable.");
  const output = secrets.redact(raw.slice(0, end)).trim();
  const check = currentFacts(record)?.criterion?.commands?.find(
    (item) => item.name === pending.name,
  );
  const { exitCode, bounded } = parsed.data;
  if (exitCode === 124 && !bounded) return { kind: "lost" };
  return {
    kind: "known",
    result: {
      name: pending.name,
      kind: "command",
      target: pending.service,
      at: pending.startedAt,
      durationMs: 0,
      passed:
        exitCode === 0 && (!check?.contains || output.includes(check.contains)),
      status: exitCode,
      output:
        `${output.slice(-OUTPUT_CHARACTERS)}${exitCode === 124 ? "\nStopped after exceeding its time limit." : ""} [resolved from the host's record]`.trim(),
    },
  };
}
