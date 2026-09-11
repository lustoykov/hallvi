import { randomUUID } from "node:crypto";
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

/** Keep a check's result with the attempt it verifies. */
export function recordCheck(record: DeploymentRecord, result: CheckResult) {
  const attempt = record.lifecycle?.attempts.at(-1);
  if (attempt?.outcome !== "working") return;
  (attempt.checks ??= []).push(result);
  saveDeployment(record);
}

/**
 * Run one recorded command check in a running service's container. Named
 * private inputs travel on standard input into its environment, never on a
 * command line or into records; output is redacted and bounded. The command
 * is what Pi recorded and the owner approved, so it may change data.
 */
export async function runCommandCheck(
  record: DeploymentRecord,
  check: CommandCheck,
  signal: AbortSignal,
  target = {
    directory: `/opt/server-guy/${record.id}`,
    project: composeProject(record.id),
  },
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
  // The host shell reads values into its own names; env passes each to the
  // command under the recorded name, so no input can shadow the host's.
  const marker = `SG_CHECK_EXIT_${randomUUID().replaceAll("-", "")}`;
  const seconds = check.timeoutSeconds ?? 60;
  const script = [
    `cd ${shellQuote(target.directory)} || exit 90`,
    ...names.map((_, index) => `IFS= read -r SG_V${index} || exit 90`),
    'output=$(mktemp) || exit 90',
    `env ${names.map((name, index) => `${name}="$SG_V${index}" `).join("")}timeout -k 5 ${seconds} docker compose -p ${target.project} -f compose.json exec -T ${names.map((name) => `-e ${name} `).join("")}${shellQuote(check.service)} ${check.run.map(shellQuote).join(" ")} >"$output" 2>&1 </dev/null`,
    "code=$?",
    `tail -c ${OUTPUT_CHARACTERS * 8} "$output"`,
    'rm -f "$output"',
    `printf '\\n${marker}%s\\n' "$code"`,
  ].join("\n");
  const at = new Date().toISOString();
  const started = Date.now();
  const result = (status: number | null, output: string): CheckResult => ({
    name: check.name,
    kind: "command",
    target: check.service,
    at,
    durationMs: Date.now() - started,
    passed:
      status === 0 && (!check.contains || output.includes(check.contains)),
    status,
    output: output.slice(-OUTPUT_CHARACTERS),
  });
  let raw: string;
  try {
    raw = await deploymentSsh(record, script, {
      input: values.map((value) => `${value}\n`).join(""),
      signal,
      timeout: (seconds + 30) * 1000,
    });
  } catch {
    signal.throwIfAborted();
    return result(
      null,
      "The host command did not complete, so the check's outcome is unknown.",
    );
  }
  const end = raw.lastIndexOf(`\n${marker}`);
  if (end < 0)
    return result(null, secrets.redact(raw).trim() || "No exit status.");
  return result(
    Number(raw.slice(end + marker.length + 1).trim()),
    secrets.redact(raw.slice(0, end)).trim(),
  );
}

/**
 * The recorded criterion's commands, in order, after its HTTP checks. The
 * first failure stops verification with its evidence for correction.
 */
export async function verifyCommandChecks(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  for (const check of currentFacts(record)?.criterion?.commands ?? []) {
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
