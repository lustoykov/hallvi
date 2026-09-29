// `hallvi apps`, `exec`, `wait` and `inspect`: work sent to an application a
// named controller already runs, and what it recorded. Talking to the
// controller is controller-client.mjs; this is only the terminal: arguments,
// progress on stderr, one result on stdout, and exit codes a script can use.
//
// None of it reads this machine's installation. Choosing a controller is
// always explicit, and nothing here starts, stops or finds one.
import { parseArgs } from "node:util";

import {
  ClientError,
  controllerClient,
  ENVIRONMENT,
  isId,
  newRequestKey,
  observe,
  parseHandle,
  requestHandle,
  selectController,
} from "./controller-client.mjs";

export const REQUEST_COMMANDS = ["apps", "exec", "wait", "inspect"];

/** The documented exit codes: docs/cli.md. */
export const EXIT = {
  ok: 0,
  failed: 1,
  attention: 2,
  timeout: 3,
  stopped: 4,
  signal: 130,
};

const EXIT_OF = {
  completed: EXIT.ok,
  failed: EXIT.failed,
  "waiting-for-approval": EXIT.attention,
  "waiting-for-input": EXIT.attention,
  cancelled: EXIT.stopped,
  interrupted: EXIT.stopped,
};

const COMMON = {
  controller: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};
const OPTIONS = {
  apps: COMMON,
  exec: {
    ...COMMON,
    timeout: { type: "string" },
    background: { type: "boolean" },
    bg: { type: "boolean" },
    "request-key": { type: "string" },
  },
  wait: { ...COMMON, timeout: { type: "string" } },
  inspect: { ...COMMON, execution: { type: "string" } },
};

export const USAGE = `Send work to an application a running Hallvi controller already has, and read
what it recorded. Name the controller with --controller or ${ENVIRONMENT}.

  apps                          the applications, with their recorded state
  exec <app> "request"          send a request to the application's main
                                conversation, then follow it until it settles
  exec <app> -                  the same, reading the request from stdin
  wait <handle>                 follow a request already sent; never resends it
  inspect <app>                 the application's recorded state, bounded
  inspect <app> --execution <id>
                                one recorded execution in full

  --controller <url>            e.g. http://127.0.0.1:4747
  --json                        exactly one JSON object on stdout
  --timeout <seconds>           exec, wait: stop watching (not the work) after
                                this long; 0 reads the state once
  --background, --bg            exec: return once Pi has the request
  --request-key <uuid>          exec: the request's key; reuse it to retry

Exit codes: 0 completed, 1 failed, 2 approval or input needed, 3 still running
when the wait ended, 4 cancelled or interrupted, 130 stopped with Ctrl-C.
Completed means Pi finished answering, not that the work succeeded: read the
evidence. docs/cli.md in the repository describes the JSON.`;

const usage = (message) => new ClientError("usage", message);

function seconds(value) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number) || number < 0)
    throw usage("--timeout takes a number of seconds, 0 or more.");
  return number * 1000;
}

async function readStdin(stdin, signal) {
  let text = "";
  stdin.setEncoding("utf8");
  // Ctrl-C ends the read too; there is no prompt to wait at.
  signal.addEventListener("abort", () => stdin.destroy(), { once: true });
  for await (const chunk of stdin) {
    text += chunk;
    // The controller takes 5,000 characters; this only stops a runaway pipe.
    if (text.length > 1_000_000)
      throw usage("The request on stdin is far longer than Hallvi accepts.");
  }
  return text;
}

/** "Check the database answers — docker compose ps", or the first line. */
function described({ tool, target, input }) {
  let said = input;
  try {
    const args = JSON.parse(input);
    const command = args.command ?? args.path ?? args.title ?? args.action;
    said =
      typeof command === "string"
        ? args.intent
          ? `${args.intent} — ${command}`
          : command
        : // Arguments without a command read best on one line.
          JSON.stringify(args);
  } catch {
    // Not JSON, or cut short: its first line will do.
  }
  const line = String(said).trim().split("\n")[0] ?? "";
  return `${tool}${target ? ` on ${target}` : ""}: ${line.length > 160 ? `${line.slice(0, 160)}…` : line}`;
}

/** The permission modes as Hallvi names them. */
const MODES = {
  "always-ask": "Always ask",
  "pi-decides": "Hallvi decides",
  bypass: "Bypass",
};

const ended = ({ status, exitCode }) =>
  `${status}${exitCode === null || exitCode === undefined ? "" : ` · exit ${exitCode}`}`;

/**
 * Progress on stderr: the state as it changes, and a line for each call as it
 * starts and as it ends. Each line names its call, because several calls can
 * change between two reads.
 */
function narrator(say) {
  let status = null;
  const calls = new Map();
  return (outcome) => {
    if (outcome.status !== status) {
      status = outcome.status;
      if (status === "queued") say("Waiting behind Pi's current work.");
      if (status === "working")
        say(`Pi is working · operation ${outcome.operation?.id}`);
    }
    for (const call of outcome.evidence ?? []) {
      const key = call.toolCallId ?? call.executionId;
      if (calls.get(key) === call.status) continue;
      calls.set(key, call.status);
      say(`  ${ended(call)}  ${described(call)}`);
    }
  };
}

/** The result of exec and wait, as a person reads it. */
function readable(result) {
  const { outcome } = result;
  const follow = `Follow it with: hallvi wait ${result.handle}`;
  if (result.error) {
    const lines = [result.error.message];
    if (result.error.code === "acceptance-unknown")
      lines.push(
        `Send it again with --request-key ${result.requestKey} to find out, or: hallvi wait ${result.handle}`,
      );
    else if (result.accepted && result.handle) lines.push(follow);
    return lines;
  }
  if (result.background) return ["Pi has the request.", follow];
  if (!outcome) return [follow];
  if (result.timedOut || result.stoppedByUser)
    return [
      `${outcome.status === "queued" ? "Still waiting behind Pi's current work" : "Still working"}. Pi keeps the request; stopping this command did not stop it.`,
      follow,
    ];
  const { attention } = outcome;
  const asked = outcome.evidence?.find(
    (call) => call.executionId && call.executionId === attention?.executionId,
  );
  const lines = {
    "waiting-for-approval": [
      `Waiting for approval: ${asked ? described(asked) : attention?.reason}`,
      "That call has not run. Approve or decline it in Hallvi:",
      `  ${attention?.page}`,
    ],
    "waiting-for-input": [
      `Waiting for input: ${attention?.reason}`,
      "Answer in Hallvi:",
      `  ${attention?.page}`,
    ],
    interrupted: [
      `Interrupted. ${attention?.reason}`,
      "Continue or stop it in Hallvi:",
      `  ${attention?.page}`,
    ],
  }[outcome.status] ?? [
    outcome.dropped
      ? `Cancelled. ${outcome.dropped}`
      : `${outcome.status[0].toUpperCase()}${outcome.status.slice(1)} · operation ${outcome.operation?.id}`,
  ];
  if (outcome.failure) lines.push(outcome.failure);
  if (outcome.answer)
    lines.push(
      "",
      "Pi's answer:",
      outcome.answer,
      ...(outcome.answerTruncated
        ? ["[cut short: the whole answer is in Hallvi]"]
        : []),
    );
  if (outcome.evidence?.length) {
    lines.push(
      "",
      `Recorded${outcome.evidenceOmitted ? ` (the last ${outcome.evidence.length} of ${outcome.evidence.length + outcome.evidenceOmitted})` : ""}:`,
    );
    for (const call of outcome.evidence)
      lines.push(
        `  ${ended(call)}  ${described(call)}${call.executionId ? `  [execution ${call.executionId}]` : ""}`,
      );
  }
  if (outcome.operation?.requestKeys?.length > 1)
    lines.push(
      "",
      `Pi read ${outcome.operation.requestKeys.length} requests in this operation; each of them gets this result.`,
    );
  if (outcome.status === "completed")
    lines.push(
      "",
      "Completed means Pi finished answering. Whether the work succeeded is in the evidence above.",
    );
  // Where a person acts first, the next command is to follow it again.
  lines.push(
    "",
    ["waiting-for-approval", "interrupted"].includes(outcome.status)
      ? follow
      : `Handle: ${result.handle}`,
  );
  return lines;
}

function absolute(outcome, controller) {
  if (!outcome?.attention) return outcome;
  return {
    ...outcome,
    attention: {
      ...outcome.attention,
      page: new URL(outcome.attention.page, controller).href,
    },
  };
}

/** One request, followed: the shape `exec` and `wait` both print. */
function requestResult(target, fields) {
  const outcome = absolute(fields.outcome ?? null, target.controller);
  return {
    controller: target.controller,
    applicationId: target.applicationId,
    chatId: target.chatId ?? null,
    requestKey: target.requestKey ?? null,
    handle: target.chatId ? requestHandle(target) : null,
    accepted: fields.accepted ?? null,
    status: fields.background ? null : (outcome?.status ?? null),
    timedOut: fields.stopped === "timeout",
    stoppedByUser: fields.stopped === "signal",
    background: Boolean(fields.background),
    outcome,
    error: fields.error
      ? { code: fields.error.code ?? "failed", message: fields.error.message }
      : null,
  };
}

function exitOf(result) {
  if (result.stoppedByUser) return EXIT.signal;
  if (result.error) return EXIT.failed;
  if (result.background) return EXIT.ok;
  if (result.timedOut) return EXIT.timeout;
  return EXIT_OF[result.status] ?? EXIT.failed;
}

/** What a JSON caller gets: the result, flat. */
function flat(result) {
  const { outcome, ...rest } = result;
  return {
    ...rest,
    operation: outcome?.operation ?? null,
    answer: outcome?.answer ?? null,
    answerTruncated: outcome?.answerTruncated ?? false,
    failure: outcome?.failure ?? outcome?.dropped ?? null,
    attention: outcome?.attention ?? null,
    evidence: outcome?.evidence ?? [],
    evidenceOmitted: outcome?.evidenceOmitted ?? 0,
  };
}

/**
 * Follow a request and say what became of it. Accepted is only claimed when
 * the caller knows it, or when Pi has been seen holding the request.
 */
async function follow(client, target, options, io) {
  try {
    const { outcome, stopped, problem } = await observe(client, target, {
      ...options,
      signal: io.signal,
      onChange: io.json ? undefined : narrator(io.say),
    });
    return requestResult(target, {
      accepted: options.known || outcome ? true : null,
      outcome,
      stopped,
      // Out of time while reads were failing: said, so the state is not taken
      // for the one last read.
      error: problem,
    });
  } catch (error) {
    return requestResult(target, {
      accepted: options.known || error.outcome ? true : null,
      outcome: error.outcome,
      error,
    });
  }
}

const commands = {
  async apps({ values }, io) {
    const controller = (io.controller = selectController({
      flag: values.controller,
      env: io.env,
    }));
    const applications = await controllerClient(controller).applications({
      signal: io.signal,
    });
    return {
      exit: EXIT.ok,
      json: { controller, applications },
      text: [
        `Hallvi at ${controller}`,
        ...(applications.length
          ? applications.flatMap((application) => [
              `${application.id}  ${application.name}  (${application.source})`,
              `  ${[
                application.condition.text,
                application.stack,
                application.address,
                MODES[application.permissionMode],
              ]
                .filter(Boolean)
                .join(" · ")}`,
            ])
          : ["No applications yet."]),
      ],
    };
  },

  async exec({ values, positionals }, io) {
    const [applicationId, ...words] = positionals;
    const background = Boolean(values.background || values.bg);
    if (!isId(applicationId))
      throw usage(
        'Name the application by the ID `hallvi apps` prints: hallvi exec <app> "request".',
      );
    if (background && values.timeout !== undefined)
      throw usage(
        "--background returns as soon as Pi has the request, so it takes no --timeout.",
      );
    const timeoutMs = seconds(values.timeout);
    const requestKey = values["request-key"] ?? newRequestKey();
    if (!isId(requestKey)) throw usage("--request-key takes a UUID.");
    const controller = (io.controller = selectController({
      flag: values.controller,
      env: io.env,
    }));
    io.applicationId = applicationId;
    const message =
      words.length === 1 && words[0] === "-"
        ? await readStdin(io.stdin, io.signal)
        : words.join(" ");
    if (!message.trim())
      throw usage(
        'Say what to do: hallvi exec <app> "request", or - to read it from stdin.',
      );
    const client = controllerClient(controller);
    const application = await client.application(applicationId, {
      signal: io.signal,
    });
    if (!application.mainChatId)
      throw new ClientError(
        "not-found",
        "This application has no main conversation to send to.",
      );
    const target = {
      controller,
      applicationId,
      chatId: application.mainChatId,
      requestKey,
    };
    io.say(`Hallvi at ${controller} · ${application.name}`);
    try {
      await client.send({ ...target, message }, { signal: io.signal });
    } catch (error) {
      const unknown = io.signal.aborted || error.code === "acceptance-unknown";
      const result = requestResult(target, {
        accepted: unknown ? null : false,
        stopped: io.signal.aborted ? "signal" : null,
        error: io.signal.aborted
          ? new ClientError(
              "acceptance-unknown",
              "Stopped before the controller answered, so whether Pi accepted the request is not known.",
            )
          : error,
      });
      return { exit: exitOf(result), result };
    }
    io.say(`Pi has it · request ${requestKey}`);
    if (background) {
      const result = requestResult(target, { accepted: true, background });
      return { exit: EXIT.ok, result };
    }
    const result = await follow(client, target, { timeoutMs, known: true }, io);
    return { exit: exitOf(result), result };
  },

  async wait({ values, positionals }, io) {
    if (positionals.length !== 1)
      throw usage("hallvi wait <handle>: the handle `hallvi exec` printed.");
    const timeoutMs = seconds(values.timeout);
    const target = parseHandle(positionals[0], {
      flag: values.controller,
      env: io.env,
    });
    io.controller = target.controller;
    io.applicationId = target.applicationId;
    const result = await follow(
      controllerClient(target.controller),
      target,
      { timeoutMs },
      io,
    );
    return { exit: exitOf(result), result };
  },

  async inspect({ values, positionals }, io) {
    const [applicationId] = positionals;
    if (positionals.length !== 1 || !isId(applicationId))
      throw usage("hallvi inspect <app>, with the ID `hallvi apps` prints.");
    if (values.execution !== undefined && !isId(values.execution))
      throw usage("--execution takes an execution ID, as the evidence lists.");
    const controller = (io.controller = selectController({
      flag: values.controller,
      env: io.env,
    }));
    io.applicationId = applicationId;
    const client = controllerClient(controller);
    if (values.execution) {
      const execution = await client.execution(
        applicationId,
        values.execution,
        {
          signal: io.signal,
        },
      );
      return {
        exit: EXIT.ok,
        json: { controller, applicationId, execution },
        text: [
          `${described(execution)}`,
          `${ended(execution)} · started ${execution.startedAt}${execution.finishedAt ? ` · finished ${execution.finishedAt}` : ""}`,
          `execution ${execution.id} · tool call ${execution.toolCallId ?? "none"} · ${execution.mode}`,
          "",
          "Input:",
          execution.input,
          "",
          `Output${execution.outputTruncated ? " (the last 100,000 characters the executor kept)" : ""}:`,
          execution.output || "(none recorded)",
        ],
      };
    }
    const inspection = await client.inspection(applicationId, {
      signal: io.signal,
    });
    const { application: app, main, deployment } = inspection;
    return {
      exit: EXIT.ok,
      json: { controller, applicationId, ...inspection },
      text: [
        `${app.name} · ${app.id} · Hallvi at ${controller}`,
        `  repository   ${app.repositoryUrl}`,
        `  permission   ${MODES[app.permissionMode] ?? "not set"}`,
        `  host         ${app.host ? `${app.host.user}@${app.host.address}:${app.host.port}${app.host.provider ? ` (${app.host.provider}${app.host.serverId ? ` ${app.host.serverId}` : ""})` : ""}` : "none attached"}`,
        `  condition    ${inspection.condition.text}${inspection.condition.nextStep ? ` — ${inspection.condition.nextStep}` : ""}`,
        `  main chat    ${main ? `${main.status ?? "not known: no worker answered"} · ${main.chatId}` : "none"}`,
        `  deployment   ${deployment.mode ?? "not chosen"}${deployment.branch ? ` from ${deployment.branch}` : ""}${deployment.deployed ? ` · deployed ${deployment.deployed.slice(0, 12)}` : ""}${deployment.paused ? " · paused" : ""}`,
        ...(inspection.attention.length
          ? [
              "",
              "Needs a person:",
              ...inspection.attention.map(
                (item) =>
                  `  ${item.kind}  ${item.reason}  → ${new URL(item.page, controller).href}`,
              ),
            ]
          : []),
        ...(inspection.records.length
          ? [
              "",
              `Records${inspection.recordsOmitted ? ` (newest ${inspection.records.length} of ${inspection.records.length + inspection.recordsOmitted})` : ""}:`,
              ...inspection.records.map(
                (record) =>
                  `  ${(record.status ?? "info").padEnd(8)}  ${record.title}`,
              ),
            ]
          : []),
        ...(inspection.executions.length
          ? [
              "",
              `Executions, newest first${inspection.executionsOmitted ? ` (${inspection.executions.length} of ${inspection.executions.length + inspection.executionsOmitted})` : ""}:`,
              ...inspection.executions.map(
                (call) =>
                  `  ${call.executionId}  ${ended(call)}  ${described(call)}`,
              ),
            ]
          : []),
      ],
    };
  },
};

/**
 * Run one of the request commands. Returns the exit code; writes one result.
 * `io` stands in for the process in tests.
 */
export async function runRequest(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    stdin = process.stdin,
    env = process.env,
    signal,
  } = {},
) {
  const [command, ...args] = argv;
  const json = args.includes("--json");
  const stop = new AbortController();
  const onSignal = () => stop.abort();
  if (!signal) process.once("SIGINT", onSignal);
  const io = {
    json,
    env,
    stdin,
    signal: signal ?? stop.signal,
    say: (line) => json || stderr.write(`${line}\n`),
  };
  let exit;
  let body;
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args,
        options: OPTIONS[command],
        allowPositionals: true,
        strict: true,
      });
    } catch (error) {
      throw usage(`${error.message} See: hallvi ${command} --help`);
    }
    if (parsed.values.help) {
      stdout.write(`${USAGE}\n`);
      return EXIT.ok;
    }
    const done = await commands[command](parsed, io);
    exit = done.exit;
    body = done.result
      ? {
          json: flat(done.result),
          text: readable(done.result),
          // What a person reads about a request goes where they look: the
          // answer and evidence to stdout; a note about the wait, or why the
          // command failed, to stderr.
          toStderr: done.result.stoppedByUser || Boolean(done.result.error),
        }
      : done;
  } catch (caught) {
    exit = io.signal.aborted ? EXIT.signal : EXIT.failed;
    // Stopped before a request was handed over: nothing was sent.
    const error = io.signal.aborted
      ? new ClientError(
          "stopped",
          command === "exec" ? "Stopped before anything was sent." : "Stopped.",
        )
      : caught;
    body = {
      json: {
        // Whatever was chosen before the failure, so a caller can tell which
        // controller and application it was about.
        controller: io.controller ?? null,
        applicationId: io.applicationId ?? null,
        error: {
          code: error instanceof ClientError ? error.code : "failed",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      text: [error instanceof Error ? error.message : String(error)],
      toStderr: true,
    };
  } finally {
    process.removeListener("SIGINT", onSignal);
  }
  if (json) stdout.write(`${JSON.stringify(body.json)}\n`);
  else (body.toStderr ? stderr : stdout).write(`${body.text.join("\n")}\n`);
  return exit;
}
