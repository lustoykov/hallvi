// What the Deployment page says, derived from the deployment record and its
// operations: what is live, how it got there (the approach to the first
// execution in a few plain phases, then every recorded attempt with its own
// events and outcome), the checks it passes with when each last passed, the
// latest logs, and what is not set up.

import type { DeploymentRecord } from "@/server/deployment-types";
import { deploymentRuntime } from "@/server/deployment-runtime";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts, primaryHttp } from "@/server/release-facts";

import {
  ago,
  CITIES,
  FRESH_MS,
  productName,
  shortImage,
} from "../architecture-prototype/model";

export type LineTone = "pass" | "fail" | "work" | "info";
export interface StoryLine {
  at: string;
  text: string;
  tone: LineTone;
}
export type PhaseTone = "pass" | "fail" | "work" | "wait";
export interface Phase {
  id: string;
  title: string;
  detail: string;
  start: string;
  end: string;
  tone: PhaseTone;
  lines: StoryLine[];
}
export interface Check {
  name: string;
  probe: string;
  /** Checked inside the server, on the private network. */
  inside: boolean;
  at: string | null;
}
export interface LiveFact {
  label: string;
  value: string;
  sub: string;
  exact: { label: string; value: string; mono?: boolean }[];
}
export type StoryState =
  "none" | "working" | "awaiting" | "failed" | "live" | "unknown";
export type Tone = "verified" | "stale" | "failed" | "planned" | "checking";

export interface DeploymentStory {
  state: StoryState;
  name: string;
  revision: string | null;
  statement: string;
  tone: Tone;
  word: string;
  detail: string;
  facts: LiveFact[];
  phases: Phase[];
  started: string | null;
  took: string | null;
  attempts: number;
  checks: Check[];
  logs: { at: string | null; lines: string[] };
  gaps: { id: string; title: string; detail: string }[];
  chat: { chatId: string; messageId: string | null } | null;
  repository: string;
}

/** "9 s", "1 min 22 s", "8 min 33 s", "2 h 5 min". */
export function took(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

export function toneOf(text: string): LineTone {
  if (/failed|timed out|Stopped|error/i.test(text)) return "fail";
  if (/^Passed:|^Verified|verified|reverified/.test(text)) return "pass";
  if (
    /^(Inspecting|Reading|Checking|Creating|Waiting|Preparing|Building|Recreating|Uploading)/.test(
      text,
    )
  )
    return "work";
  return "info";
}

/** Names the approach's steps; executions come from attempt records. */
type Kind = "inspect" | "plan" | "provision" | "other";

function kindOf(text: string): Kind {
  if (/^(Inspecting the repository|Reading )/.test(text)) return "inspect";
  if (/^(Deployment configuration prepared|Recommendation ready)/.test(text))
    return "plan";
  if (
    /^(Preparing SSH|Creating the accepted|Waiting for the pinned SSH|HTTP restricted|Metadata access restricted|Host prepared)/.test(
      text,
    )
  )
    return "provision";
  return "other";
}

const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Progress bars and layer pulls are noise; the rest is the application. */
function cleanLogs(logs: string) {
  return logs
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        line.trim() &&
        !/Downloading \[|Extracting|Pulling fs layer|Verifying Checksum|Download complete|Pull complete|Waiting$|Already exists/.test(
          line,
        ),
    )
    .slice(-40);
}

/**
 * The selected configuration's services, the one people open first. A
 * service built from the repository has no image to name it by.
 */
export function configuredServices(record: DeploymentRecord | null) {
  const services = Object.entries(record?.native?.resolved.services ?? {}).map(
    ([name, service]) => ({
      name,
      image: service.build ? null : (service.image ?? null),
    }),
  );
  const opened = primaryHttp(currentFacts(record))?.service;
  return services.toSorted(
    (a, b) => Number(b.name === opened) - Number(a.name === opened),
  );
}

export function buildStory({
  record,
  operations,
  now,
  approvedIn,
}: {
  record: DeploymentRecord | null;
  operations: ApplicationOperation[];
  now: number;
  /** The conversation the plan was approved in. */
  approvedIn: string | null;
}): DeploymentStory {
  const facts = currentFacts(record);
  const [app, ...beside] = configuredServices(record);
  const name = productName(app?.image, "the application");
  const revision = record?.revision ?? null;
  const short = revision?.slice(0, 7) ?? "the selected revision";
  const offer = record?.offer ?? null;
  const city = offer ? (CITIES[offer.location]?.[0] ?? offer.location) : null;
  const restricted = facts?.httpAccess === "controller";
  const runtime = deploymentRuntime(record);
  const working =
    record &&
    ["queued", "planning", "deploy-queued", "deploying"].includes(
      record.status,
    );
  const state: StoryState = !record
    ? "none"
    : working
      ? "working"
      : record.status === "awaiting-approval"
        ? "awaiting"
        : record.status === "failed"
          ? "failed"
          : runtime.state === "unknown" || runtime.state === "observed"
            ? "unknown"
            : "live";

  // ---- The approach to the first execution, then each recorded attempt
  // with the events between its offset and the next attempt's.
  const events = record?.events ?? [];
  const line = (event: { at: string; message: string }): StoryLine => ({
    at: event.at,
    text: event.message,
    tone: toneOf(event.message),
  });
  const recorded = record?.lifecycle?.attempts ?? [];
  const approach = events
    .slice(0, recorded[0]?.eventOffset ?? events.length)
    .map(line);
  const failure = operations.find(
    (operation) =>
      operation.source.type === "deployment" && operation.state === "failed",
  );
  const services = [
    name,
    ...beside.map((service) => productName(service.image, service.name)),
  ];
  const phases: Phase[] = [];
  const add = (
    id: string,
    title: string,
    detail: string,
    group: StoryLine[],
    tone: PhaseTone,
    end?: string,
  ) => {
    if (!group.length) return;
    phases.push({
      id,
      title,
      detail,
      start: group[0].at,
      end: end ?? group[group.length - 1].at,
      tone,
      lines: group,
    });
  };
  const by = (kind: Kind) =>
    approach.filter((item) => kindOf(item.text) === kind);
  const read = by("inspect");
  add(
    "inspect",
    "Read the repository",
    `${read.filter((item) => item.text.startsWith("Reading")).length || "Its"} files at ${short}`,
    read,
    "pass",
  );
  const planned = by("plan");
  add(
    "plan",
    "Planned the server",
    offer
      ? `A ${offer.serverType.toUpperCase()} in ${city} for ${money(offer.monthly, offer.currency)} a month; nothing bought yet`
      : "The deployment configuration was prepared",
    planned,
    "pass",
  );
  const provision = by("provision");
  if (planned.length && provision.length) {
    const waited =
      Date.parse(provision[0].at) - Date.parse(planned.at(-1)!.at);
    if (waited > 20_000)
      phases.push({
        id: "approval",
        title: "You approved it",
        detail: approvedIn
          ? `In ${approvedIn}, ${took(waited)} later`
          : `In the conversation, ${took(waited)} later`,
        start: planned.at(-1)!.at,
        end: provision[0].at,
        tone: "wait",
        lines: [],
      });
  }
  add(
    "provision",
    "Created the server and locked it down",
    `${offer ? `Hetzner ${offer.serverType.toUpperCase()}, ` : ""}SSH with its own key, a firewall${restricted ? ", HTTP only from your network" : ""}`,
    provision,
    "pass",
  );
  // Records from before attempts were kept: their execution as it was told.
  if (!recorded.length)
    add(
      "deliver",
      "Delivered and checked it",
      `Revision ${short}: ${services.join(" and ")}`,
      by("other"),
      state === "live" ? "pass" : state === "working" ? "work" : "fail",
    );
  const revisionOf = (releaseId: string) =>
    (
      record?.lifecycle?.releases.find((release) => release.id === releaseId)
        ?.revision ?? releaseId
    ).slice(0, 7);
  recorded.forEach((attempt, index) => {
    const next = recorded[index + 1];
    const group = events
      .slice(attempt.eventOffset, next?.eventOffset ?? events.length)
      .map(line);
    const at = revisionOf(attempt.releaseId);
    const rollback = operations
      .find((operation) => operation.id === attempt.operationId)
      ?.title.startsWith("Roll back");
    const passed = (attempt.checks ?? []).filter((check) => check.passed);
    phases.push({
      id: `attempt-${attempt.id}`,
      title:
        attempt.kind === "recreate"
          ? "Recreated the containers"
          : attempt.kind === "reconcile"
            ? "Reconciled a lost outcome from the host"
            : rollback
              ? `Rolled back to ${at}`
              : attempt.kind === "release"
                ? `Released revision ${at}`
                : `Deployed revision ${at}`,
      detail:
        attempt.outcome === "working"
          ? "In progress"
          : attempt.outcome === "failed" || attempt.outcome === "interrupted"
            ? (attempt.error ?? "Stopped before claiming success")
            : attempt.outcome === "observed"
              ? "Running; no behavior checks passed or were recorded"
              : passed.length
                ? `${passed.length} ${passed.length === 1 ? "check" : "checks"} passed: ${passed.map((check) => check.name).join(", ")}`
                : "Verified against its recorded checks",
      start: attempt.startedAt,
      end: attempt.finishedAt ?? group.at(-1)?.at ?? attempt.startedAt,
      tone:
        attempt.outcome === "verified" || attempt.outcome === "observed"
          ? "pass"
          : attempt.outcome === "working"
            ? "work"
            : "fail",
      lines: group,
    });
  });
  if (state === "working" && phases.length) phases.at(-1)!.tone = "work";

  // ---- The checks it passes, each with when it last passed on record.
  const ran = recorded.flatMap((attempt) => attempt.checks ?? []);
  const lastPassed = (check: string) =>
    ran.findLast((item) => item.name === check && item.passed)?.at ?? null;
  const checks: Check[] = [
    ...(facts?.criterion?.checks ?? []).map((check) => ({
      name: check.name,
      probe: `${check.method} ${check.path} → ${check.expectedStatus}${check.contains ? ` · contains ${check.contains}` : ""}`,
      inside: false,
      at: lastPassed(check.name),
    })),
    ...(facts?.criterion?.commands ?? []).map((check) => ({
      name: check.name,
      probe: `Runs in ${check.service}${check.inputs?.length ? ` with ${check.inputs.join(", ")}` : ""}${check.contains ? ` · prints ${check.contains}` : ""}`,
      inside: true,
      at: lastPassed(check.name),
    })),
    ...(facts?.criterion?.services ?? []).flatMap((service) => {
      const label = productName(
        beside.find((item) => item.name === service.name)?.image,
        cap(service.name),
      );
      return [
        { name: `${label} is ready`, path: service.healthPath },
        ...service.checks.map((check) => ({
          name: `${label} answers ${check.path}`,
          path: check.path,
        })),
      ].map((check) => ({
        name: check.name,
        probe: `GET ${check.path} on port ${service.port}`,
        inside: true,
        at: null,
      }));
    }),
  ];

  // ---- What is live, plain first and exact on demand.
  const images = [
    app?.image && { name, ref: app.image },
    ...beside.map((service) => ({
      name: productName(service.image, service.name),
      ref: service.image ?? "built from the repository",
    })),
  ].filter((item): item is { name: string; ref: string } => Boolean(item));
  type Exact = LiveFact["exact"][number];
  const present = (...rows: (Exact | "" | 0 | false | null | undefined)[]) =>
    rows.filter((row): row is Exact => Boolean(row));
  const liveFacts: LiveFact[] = record
    ? [
        {
          label: "Revision",
          value: short,
          sub: record.repository,
          exact: [
            { label: "Revision", value: revision ?? "not chosen", mono: true },
            { label: "Repository", value: record.repository },
          ],
        },
        {
          label: "Images",
          value: images.map((image) => image.name).join(" · ") || name,
          sub: images.length ? "Pinned by digest" : "Built from source",
          exact: images.map((image) => ({
            label: image.name,
            value: shortImage(image.ref),
            mono: true,
          })),
        },
        {
          label: "Server",
          value: offer
            ? `Hetzner ${offer.serverType.toUpperCase()}`
            : "Not chosen",
          sub: offer
            ? `${city} · ${money(offer.monthly, offer.currency)} a month`
            : "Chosen when you approve",
          exact: present(
            offer && {
              label: "Size",
              value: `${offer.cores} vCPU · ${offer.memory} GB`,
            },
            record.address && {
              label: "Address",
              value: record.address,
              mono: true,
            },
            record.serverId && {
              label: "Server",
              value: `#${record.serverId}`,
              mono: true,
            },
          ),
        },
        {
          label: "Access",
          value: restricted ? "Your network only" : "Anyone",
          sub: "HTTP on port 80",
          exact: present(
            record.httpSourceIp && {
              label: "Allowed from",
              value: record.httpSourceIp,
              mono: true,
            },
            record.url && { label: "Address", value: record.url, mono: true },
          ),
        },
      ]
    : [];

  const verifiedAt = runtime.lastVerified?.checkedAt ?? record?.verifiedAt;
  const fresh = verifiedAt && now - Date.parse(verifiedAt) < FRESH_MS;
  const statement =
    state === "none"
      ? "Nothing is deployed yet."
      : state === "working"
        ? `Server Guy is deploying ${name}.`
        : state === "awaiting"
          ? "A plan is waiting for your approval."
          : state === "failed"
            ? "The latest deployment stopped."
            : state === "unknown"
              ? `${cap(name)} may have changed on the server.`
              : `${cap(name)} is serving revision ${short}.`;
  const tone: Tone =
    state === "live"
      ? fresh
        ? "verified"
        : "stale"
      : state === "failed"
        ? "failed"
        : state === "working"
          ? "checking"
          : state === "unknown"
            ? "stale"
            : "planned";
  const word =
    state === "live" && verifiedAt
      ? `Verified ${ago(verifiedAt, now)}`
      : state === "working"
        ? "In progress"
        : state === "failed"
          ? "Stopped"
          : state === "awaiting"
            ? "Waiting for you"
            : state === "unknown"
              ? "Needs a check"
              : "Not deployed";
  const detail =
    state === "live"
      ? `Against the ${checks.length} ${checks.length === 1 ? "check" : "checks"} listed below, and nothing else. A recorded check, not continuous monitoring.`
      : state === "failed"
        ? (failure?.next ??
          record?.error ??
          "It stopped before claiming success.")
        : state === "awaiting"
          ? offer
            ? `A ${offer.serverType.toUpperCase()} in ${city} for ${money(offer.monthly, offer.currency)} a month. Nothing is bought until you approve.`
            : "Nothing is bought until you approve."
          : state === "working"
            ? "Follow each step below as it lands."
            : state === "unknown"
              ? "A change may have reached the server after the last check."
              : "Ask Server Guy in the conversation to deploy it.";

  const started = events[0]?.at ?? null;
  const ended = events.at(-1)?.at ?? null;
  return {
    state,
    name,
    revision,
    statement,
    tone,
    word,
    detail,
    facts: liveFacts,
    phases,
    started,
    took:
      started && ended ? took(Date.parse(ended) - Date.parse(started)) : null,
    // Executions only: recreation and reconciliation are not attempts to
    // reach a release.
    attempts: recorded.length
      ? recorded.filter(
          (attempt) => attempt.kind === "deploy" || attempt.kind === "release",
        ).length
      : events.length
        ? 1
        : 0,
    checks,
    logs: {
      at: record?.logsCollectedAt ?? null,
      lines: cleanLogs(record?.logs ?? ""),
    },
    gaps: [
      {
        id: "push",
        title: "Deploy when you push",
        detail:
          "Not set up. A release happens when you ask for it in the conversation.",
      },
    ],
    chat: record
      ? { chatId: record.chatId, messageId: record.originMessageId ?? null }
      : null,
    repository: record?.repository ?? "",
  };
}
