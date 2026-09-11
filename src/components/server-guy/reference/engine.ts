// The prototype engine: replays a scenario to a step, and lets the user act
// on that state in memory. Approvals and investigations that the scenario
// scripts jump to the step that shows their consequence; everything else
// changes an in-memory copy until the step changes. Pure functions only.
import type { Issue } from "@/server/application-facts";
import {
  applicationOperations,
  type ApplicationOperation,
} from "@/server/operation-record";

import {
  at,
  chat,
  message,
  nextId,
  operation,
  resetIds,
  steps as buildSteps,
  type ReferenceState,
} from "./data";
import type { Scenario } from "./scenario";

export function stateAt(scenario: Scenario, step: number): ReferenceState {
  resetIds();
  const state = scenario.initial();
  for (const item of scenario.steps.slice(0, step + 1)) {
    state.clock = item.clock;
    item.apply(state);
  }
  return state;
}

/**
 * Every operation the shell renders: the deployment record's projection
 * (given a generic decision while it waits, since the prototype cannot call
 * the real approval endpoint) plus the scenario's own operations.
 */
export function allOperations(state: ReferenceState): ApplicationOperation[] {
  const projected = applicationOperations(state.deployment).map((item) => {
    if (item.state === "proposed" && state.deployment?.offer)
      return {
        ...item,
        decision: {
          kind: "approval" as const,
          note: `${state.deployment.native?.summary ?? ""} Creates one ${state.deployment.offer.serverType.toUpperCase()} at Hetzner and deploys this exact revision.`,
          cost: `${state.deployment.offer.currency} ${state.deployment.offer.monthly.toFixed(2)} per month · ${state.deployment.offer.cores} CPUs · ${state.deployment.offer.memory} GB RAM · ${state.deployment.offer.location} · hourly billing`,
          inputs: (state.deployment.native?.inputs ?? []).map((name) => ({
            name,
            hint: state.deployment?.native?.inputReasons?.[name],
            secret: true,
          })),
          action: "Create server and deploy",
        },
      };
    if (item.state === "failed")
      return {
        ...item,
        decision: {
          kind: "recovery" as const,
          retry: "Retry this deployment",
          cancel: "Cancel deployment setup",
          inputs: [],
        },
      };
    return item;
  });
  return [...projected, ...state.operations];
}

function operationState(state: ReferenceState, id: string) {
  return allOperations(state).find((item) => item.id === id)?.state ?? null;
}

/** The first later step where this operation is no longer waiting. */
export function stepAfterDecision(
  scenario: Scenario,
  current: number,
  operationId: string,
) {
  const before = operationState(stateAt(scenario, current), operationId);
  for (let step = current + 1; step < scenario.steps.length; step += 1)
    if (operationState(stateAt(scenario, step), operationId) !== before)
      return step;
  return null;
}

/** The first later step where this issue has an investigation. */
export function stepAfterInvestigation(
  scenario: Scenario,
  current: number,
  issueId: string,
) {
  for (let step = current + 1; step < scenario.steps.length; step += 1) {
    const issue = stateAt(scenario, step).facts.monitoring?.issues.find(
      (item) => item.id === issueId,
    );
    if (issue?.conversationId) return step;
  }
  return null;
}

/** Advances the clock a little so relative times move. */
function later(state: ReferenceState, minutes = 1) {
  state.clock = at(state.clock, minutes);
}

export function acknowledgeIssue(state: ReferenceState, issueId: string) {
  const next = structuredClone(state);
  later(next);
  const issue = next.facts.monitoring?.issues.find(
    (item) => item.id === issueId,
  );
  if (issue && issue.state === "open") {
    issue.state = "acknowledged";
    issue.unread = false;
  }
  return next;
}

/**
 * Investigate opens a conversation linked to the issue, records the issue
 * as an event there, adopts the automatic operation into that conversation
 * so its receipt and decision have a home, and asks Server Guy to look.
 */
export function investigateIssue(state: ReferenceState, issueId: string) {
  const next = structuredClone(state);
  later(next);
  const issue = next.facts.monitoring?.issues.find(
    (item) => item.id === issueId,
  );
  if (!issue) return { state: next, chatId: null };
  if (issue.conversationId)
    return { state: next, chatId: issue.conversationId };
  const chatId = nextId("chat-investigate");
  chat(next, chatId, `Investigate: ${issue.title.toLowerCase()}`);
  const event = message(
    next,
    chatId,
    "assistant",
    `${issue.title} · detected ${new Date(issue.detectedAt).toUTCString().slice(17, 22)} UTC. ${issue.impact} ${issue.evidence}`,
    { source: "server-guy" },
  );
  const adopted = next.operations.find((item) => item.id === issue.operationId);
  if (adopted && !adopted.origin)
    adopted.origin = { chatId, messageId: event.id };
  message(
    next,
    chatId,
    "assistant",
    `I’m looking at the evidence behind this. Ask me what you want to know, or tell me what to change; I’ll propose the change here before doing anything.`,
  );
  issue.state = issue.state === "open" ? "acknowledged" : issue.state;
  issue.unread = false;
  issue.conversationId = chatId;
  return { state: next, chatId };
}

export function runJob(state: ReferenceState, jobName: string) {
  const next = structuredClone(state);
  later(next);
  const job = next.deployment?.stack?.jobs?.find(
    (item) => item.name === jobName,
  );
  if (!job || !next.facts.jobs) return next;
  const runId = nextId("run");
  next.facts.jobs.runs.unshift({
    id: runId,
    jobName,
    startedAt: next.clock,
    outcome: "running",
    trigger: "run-now",
    revision: next.deployment?.revision ?? "",
  });
  operation(next, {
    id: `job-${runId}`,
    source: "job",
    kind: "change",
    title: `Run ${jobName} now`,
    state: "working",
    destinations: ["jobs"],
    origin: null,
    summary: `${job.command} started by hand; the scheduled trigger is untouched and cannot overlap this run.`,
    steps: buildSteps(
      [
        "Start in the application's image",
        "Run the command",
        "Record the result",
      ],
      1,
    ),
  });
  return next;
}

export function pauseJob(
  state: ReferenceState,
  jobName: string,
  paused: boolean,
) {
  const next = structuredClone(state);
  later(next);
  const job = next.deployment?.stack?.jobs?.find(
    (item) => item.name === jobName,
  );
  if (job) job.paused = paused;
  return next;
}

export function measureDatabase(state: ReferenceState) {
  const next = structuredClone(state);
  later(next);
  if (next.facts.database) {
    next.facts.database.measuredAt = next.clock;
    next.facts.database.sizeGb =
      Math.round((next.facts.database.sizeGb + 0.02) * 100) / 100;
  }
  operation(next, {
    id: nextId("measure"),
    source: "inspection",
    kind: "inspection",
    title: "Measure database storage",
    state: "inspected",
    destinations: ["database", "storage"],
    origin: null,
    summary: "Measured on the host. Nothing was changed.",
    evidence: next.facts.database
      ? `${next.facts.database.sizeGb.toFixed(2)} GB · ${next.facts.database.connections} connections open`
      : "No database to measure.",
  });
  return next;
}

export function refreshLogs(state: ReferenceState) {
  const next = structuredClone(state);
  later(next);
  if (next.facts.logs?.snapshot) next.facts.logs.snapshot.at = next.clock;
  if (next.deployment) next.deployment.logsCollectedAt = next.clock;
  return next;
}

export function runBackup(state: ReferenceState) {
  const next = structuredClone(state);
  later(next);
  const id = nextId("backup-now");
  operation(next, {
    id,
    source: "backup",
    kind: "change",
    title: "Back up now",
    state: "working",
    destinations: ["backups", "database", "storage"],
    origin: null,
    summary: "An extra backup outside the schedule, to the same bucket.",
    steps: buildSteps(
      ["Dump the database", "Archive the volumes", "Upload and verify"],
      0,
    ),
  });
  return next;
}

export function testRestore(state: ReferenceState) {
  const next = structuredClone(state);
  later(next);
  operation(next, {
    id: nextId("restore-test"),
    source: "restore",
    kind: "inspection",
    title: "Test a restore",
    state: "working",
    destinations: ["backups", "database"],
    origin: null,
    summary:
      "Restores the latest recovery point into an isolated scratch database and checks it. The running data is not touched.",
    steps: buildSteps(
      [
        "Fetch the latest recovery point",
        "Restore into a scratch database",
        "Check the data",
      ],
      0,
    ),
  });
  return next;
}

/** Completes work the user started in this session, one step per tick. */
export function tick(state: ReferenceState): ReferenceState {
  const working = state.operations.filter(
    (item) => item.origin === null && item.state === "working" && item.steps,
  );
  if (!working.length) return state;
  const next = structuredClone(state);
  later(next);
  for (const item of next.operations) {
    if (item.origin !== null || item.state !== "working" || !item.steps)
      continue;
    const active = item.steps.findIndex((step) => step.state === "active");
    if (active < item.steps.length - 1) {
      item.steps[active].state = "done";
      item.steps[active + 1].state = "active";
      item.updatedAt = next.clock;
      continue;
    }
    item.steps = undefined;
    item.updatedAt = next.clock;
    if (item.source.type === "job") {
      item.state = "verified";
      item.evidence = "Exit 0 in 9 s · output recorded";
      const run = next.facts.jobs?.runs.find(
        (candidate) => candidate.outcome === "running",
      );
      if (run) {
        run.outcome = "succeeded";
        run.finishedAt = next.clock;
        run.durationSeconds = 9;
        run.output = "Checked 1,296 documents. No issues found.";
      }
      const job = next.deployment?.stack?.jobs?.find(
        (candidate) => candidate.name === run?.jobName,
      );
      if (job)
        job.lastRun = {
          at: next.clock,
          outcome: "succeeded",
          durationSeconds: 9,
        };
    } else if (item.source.type === "backup") {
      item.state = "verified";
      item.evidence = "Uploaded and verified · recovery point just now";
      const protection = next.facts.protection;
      if (protection) {
        protection.lastAttempt = {
          at: next.clock,
          outcome: "succeeded",
          size: protection.lastAttempt?.size ?? null,
        };
        protection.coverage.forEach((coverage) => {
          if (coverage.state !== "not-covered") {
            coverage.state = "protected";
            coverage.lastSuccessfulAt = next.clock;
          }
        });
        protection.history.unshift({
          id: nextId("h"),
          at: next.clock,
          kind: "backup",
          outcome: "succeeded",
          detail: "Backup on request · uploaded and verified",
          operationId: item.id,
        });
      }
    } else if (item.source.type === "restore") {
      item.state = "inspected";
      item.evidence =
        "Scratch database restored and checked · the running data was not touched";
      const protection = next.facts.protection;
      if (protection)
        protection.restoreTest = {
          at: next.clock,
          recoveryPointAt: protection.lastAttempt?.at ?? next.clock,
          verified: "Scratch restore checked on request",
          operationId: item.id,
        };
    } else item.state = "verified";
  }
  return next;
}

/** Archives a conversation: read-only from now on, still listed. */
export function archiveChat(state: ReferenceState, chatId: string) {
  const next = structuredClone(state);
  later(next);
  const found = next.chats.find((item) => item.id === chatId);
  // One conversation always stays active.
  if (found && next.chats.filter((item) => !item.archivedAt).length > 1)
    found.archivedAt = next.clock;
  return next;
}

export function newConversation(state: ReferenceState) {
  const next = structuredClone(state);
  later(next);
  const chatId = nextId("chat-new");
  chat(next, chatId, "New conversation");
  message(
    next,
    chatId,
    "assistant",
    `We can continue working on ${next.application.name} here. The application keeps its configuration and history; this conversation starts fresh.`,
    { source: "server-guy" },
  );
  return { state: next, chatId };
}

function refer(
  next: ReferenceState,
  chatId: string,
  body: string,
  ids: string[],
) {
  const reply = message(next, chatId, "assistant", body);
  for (const id of ids) {
    const found = next.operations.find((item) => item.id === id);
    if (found)
      found.mentions.push({ chatId, messageId: reply.id, at: next.clock });
  }
  return reply;
}

/**
 * A narrow reply interpreter so the conversation can be tried. It answers
 * about status, logs, backups, jobs, releases and domains from the recorded
 * facts and refers to existing work instead of starting duplicates.
 */
export function send(state: ReferenceState, chatId: string, text: string) {
  const next = structuredClone(state);
  later(next);
  const chatRecord = next.chats.find((item) => item.id === chatId);
  if (!chatRecord) return next;
  if (chatRecord.title === "New conversation")
    chatRecord.title = text.trim().slice(0, 48);
  message(next, chatId, "user", text.trim());
  const lower = text.toLowerCase();
  const facts = next.facts;
  const ops = next.operations;
  if (/back(ed|ing)? ?up|backup|protect|restore/.test(lower)) {
    const backups = ops.find(
      (item) => item.source.type === "backup" && item.origin,
    );
    if (facts.protection && backups)
      refer(
        next,
        chatId,
        `Backups run ${facts.protection.policy?.schedule.toLowerCase()} ${facts.protection.policy?.timezone} to ${facts.protection.destination?.provider === "r2" ? "Cloudflare R2" : "AWS S3"}, kept ${facts.protection.policy?.retention}. The last attempt ${facts.protection.lastAttempt?.outcome ?? "has not run"}${facts.protection.restoreTest ? ", and a restore was tested" : ""}. This is the operation that set it up; I haven’t started another one.`,
        [backups.id],
      );
    else
      message(
        next,
        chatId,
        "assistant",
        "Nothing is backed up off the host yet. Ask me to set up backups and I’ll inspect what needs protection and propose one plan for your approval.",
      );
  } else if (/log|error|crash/.test(lower)) {
    const lines =
      facts.logs?.snapshot?.lines.slice(0, 3).join("\n") ??
      "No logs collected yet.";
    const reply = message(
      next,
      chatId,
      "assistant",
      `Here are the latest lines I collected from the host (read-only):\n\n\`\`\`\n${lines}\n\`\`\`\n\nOpen Logs for the full snapshot and per-service streams.`,
    );
    operation(next, {
      id: nextId("logs"),
      source: "logs",
      kind: "inspection",
      title: "Collected application logs",
      state: "inspected",
      destinations: ["logs"],
      origin: { chatId, messageId: reply.id },
      summary:
        "Read the latest output from the application host. Nothing on the host was changed.",
      evidence: `Snapshot collected ${next.clock.slice(11, 16)} UTC · latest lines per service.`,
    });
    if (facts.logs?.snapshot) facts.logs.snapshot.at = next.clock;
  } else if (/job|schedule|cron|queue|worker/.test(lower)) {
    const jobs = next.deployment?.stack?.jobs ?? [];
    message(
      next,
      chatId,
      "assistant",
      jobs.length
        ? `${jobs.length} scheduled command${jobs.length === 1 ? "" : "s"} run on the host: ${jobs.map((job) => `${job.name} (${job.schedule.toLowerCase()} ${job.timezone})`).join(", ")}. ${facts.jobs?.queues[0]?.observedAt ? `The queue has ${facts.jobs.queues[0].backlog} waiting.` : ""} Open Jobs for runs and output, or tell me what to change.`
        : "This application records no scheduled commands, queue or worker. Tell me which existing command should run on a schedule and I’ll propose it.",
    );
  } else if (/deploy|release|update|revision|version/.test(lower)) {
    const release = [...ops]
      .reverse()
      .find((item) => item.source.type === "release" && item.origin);
    if (facts.releases?.candidate)
      message(
        next,
        chatId,
        "assistant",
        `A newer revision is available: ${facts.releases.candidate.message}. Its checks ${facts.releases.candidate.ci.state}. Say “deploy it” in the Deploy application conversation, or open Deployment; nothing deploys on push.`,
      );
    else if (release)
      refer(
        next,
        chatId,
        `The last release is the one below; ${facts.releases?.serving?.message ?? "the serving revision"} is verified. There is no newer revision than the one serving.`,
        [release.id],
      );
    else
      message(
        next,
        chatId,
        "assistant",
        `${facts.releases?.serving?.message ?? "The current revision"} is serving and verified. There is no newer revision to release.`,
      );
  } else if (/domain|https|dns|certificate|tls/.test(lower)) {
    const domain = ops.find((item) => item.source.type === "domain");
    if (facts.domains?.domain && domain)
      refer(
        next,
        chatId,
        `${facts.domains.domain.name} ${facts.domains.domain.state === "resolving" ? "resolves here" : "is still waiting for its DNS record"}${facts.domains.tls.state === "valid" ? " with a valid certificate that renews itself" : ""}. This is the operation that set it up.`,
        [domain.id],
      );
    else
      message(
        next,
        chatId,
        "assistant",
        "No custom domain is connected; the instance address answers over HTTP. Tell me the domain and I’ll prepare the route and certificate; you add one DNS record.",
      );
  } else if (/status|health|running|ok|fine|how is/.test(lower)) {
    const monitoring = facts.monitoring;
    const open =
      monitoring?.issues.filter((issue) => issue.state !== "recovered") ?? [];
    message(
      next,
      chatId,
      "assistant",
      monitoring
        ? monitoring.collector.state === "running"
          ? open.length
            ? `The host was observed ${monitoring.collector.lastObservationAt ? "a moment ago" : "recently"}; ${open.length} issue${open.length === 1 ? "" : "s"} need${open.length === 1 ? "s" : ""} attention: ${open.map((issue) => issue.title).join(", ")}. Open Monitoring for the evidence.`
            : `All checks are passing and the host was observed a moment ago. ${facts.releases?.serving?.message ?? "The current revision"} is serving.`
          : `I cannot observe the host right now: ${monitoring.collector.detail}. I am not inferring health from silence.`
        : "The last thing I verified is the deployment itself; there is no continuous monitoring yet.",
    );
  } else {
    message(
      next,
      chatId,
      "assistant",
      "In this prototype I answer about status, logs, backups, jobs, releases and domains, and refer to existing work rather than starting duplicates. Real requests are handled by the agent with the same components.",
    );
  }
  return next;
}

export function issuesOf(state: ReferenceState): Issue[] {
  return state.facts.monitoring?.issues ?? [];
}
