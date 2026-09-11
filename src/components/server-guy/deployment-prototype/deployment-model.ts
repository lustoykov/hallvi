// PROTOTYPE · claude/deployment-history · throwaway.
// What the Deployment page says, derived from the deployment record and its
// operations: what is live, how it got there (the recorded actions grouped
// into a few plain phases, attempts included), the checks it passes, the
// latest logs, and what is not set up. A scenario may reshape the record;
// the page labels it.

import type { DeploymentRecord } from "@/server/deployment-types";
import { deploymentRuntime } from "@/server/deployment-runtime";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";

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

type Kind =
  | "inspect"
  | "plan"
  | "provision"
  | "deliver"
  | "verify"
  | "recreate"
  | "other";

function kindOf(text: string): Kind {
  if (/^(Inspecting the repository|Reading )/.test(text)) return "inspect";
  if (/^(Deployment configuration prepared|Recommendation ready)/.test(text))
    return "plan";
  if (
    /^(Preparing SSH|Creating the accepted|Waiting for the pinned SSH|HTTP restricted|Metadata access restricted)/.test(
      text,
    )
  )
    return "provision";
  if (/^(Host prepared|Building the application|Uploading)/.test(text))
    return "deliver";
  if (/^Recreating the accepted containers/.test(text)) return "recreate";
  if (
    /^(Checking public HTTP|Passed:|Verified private|Application behavior verified|Reconciled the existing container|Recreated containers)/.test(
      text,
    )
  )
    return "verify";
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
  const plan = record?.plan ?? null;
  const facts = currentFacts(record);
  const name = productName(plan?.image, "the application");
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

  // ---- The recorded actions, as attempts and then plain phases.
  const events = record?.events ?? [];
  const lines: StoryLine[] = events.map((event) => ({
    at: event.at,
    text: event.message,
    tone: toneOf(event.message),
  }));
  type Attempt = { kind: "first" | "retry" | "recreate"; lines: StoryLine[] };
  const attempts: Attempt[] = [];
  let checked = false;
  for (const line of lines) {
    const kind = kindOf(line.text);
    const current = attempts.at(-1);
    if (!current) attempts.push({ kind: "first", lines: [line] });
    else if (kind === "recreate") {
      attempts.push({ kind: "recreate", lines: [line] });
      checked = false;
      continue;
    } else if (kind === "provision" && checked) {
      attempts.push({ kind: "retry", lines: [line] });
      checked = false;
      continue;
    } else current.lines.push(line);
    if (kind === "verify") checked = true;
  }

  const failure = operations.find(
    (operation) =>
      operation.source.type === "deployment" && operation.state === "failed",
  );
  const recreated = operations.find(
    (operation) =>
      operation.source.type === "release" && operation.state === "verified",
  );
  const services = [
    name,
    ...(plan?.services ?? []).map((service) =>
      productName(service.image, service.name),
    ),
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

  attempts.forEach((attempt, index) => {
    const next = attempts[index + 1];
    const passed = attempt.lines.some((line) =>
      /^(Application behavior verified|Recreated containers)/.test(line.text),
    );
    if (attempt.kind === "first") {
      const by = (kind: Kind) =>
        attempt.lines.filter((line) => kindOf(line.text) === kind);
      const read = by("inspect");
      add(
        "inspect",
        "Read the repository",
        `${read.filter((line) => line.text.startsWith("Reading")).length || "Its"} files at ${short}`,
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
      add(
        "deliver",
        "Delivered and started it",
        `Revision ${short}: ${services.join(" and ")}`,
        by("deliver"),
        "pass",
      );
      const verify = [...by("verify"), ...by("other")].sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      if (verify.length)
        add(
          "verify",
          passed
            ? "Checked it from your network"
            : next
              ? "The first check failed"
              : state === "working"
                ? "Checking it now"
                : "Checked it",
          passed
            ? `${verify.filter((line) => line.tone === "pass").length} checks passed`
            : (failure?.next ??
                "It didn't pass its checks, so nothing was claimed"),
          verify,
          passed
            ? "pass"
            : next
              ? "fail"
              : state === "working"
                ? "work"
                : "fail",
          next?.lines[0]?.at,
        );
    } else if (attempt.kind === "retry") {
      add(
        `retry-${index}`,
        passed ? "Retried, and it passed" : "Retried",
        attempt.lines.some((line) => line.text.startsWith("Reconciled"))
          ? "Reconnected, kept the running containers, and every check passed"
          : "Every check passed",
        attempt.lines,
        passed ? "pass" : state === "working" && !next ? "work" : "fail",
      );
    } else {
      add(
        `recreate-${index}`,
        "Recreated the containers",
        recreated?.summary ??
          "Replaced the containers and checked the application again",
        attempt.lines,
        passed ? "pass" : state === "working" && !next ? "work" : "fail",
      );
    }
  });
  if (state === "working" && phases.length) phases.at(-1)!.tone = "work";

  // ---- The checks it passes, public first, then inside the server.
  const lastSaid = (text: string) =>
    events.findLast((event) => event.message === text)?.at ?? null;
  const checks: Check[] = (plan?.checks ?? []).map((check) => ({
    name: check.name,
    probe: `${check.method} ${check.path} → ${check.expectedStatus}${check.contains ? ` · contains ${check.contains}` : ""}`,
    inside: false,
    at: lastSaid(`Passed: ${check.name}`),
  }));
  const privately = new Map<string, Check>();
  for (const event of events) {
    const match = /^Verified private (\S+): (\S+)$/.exec(event.message);
    if (!match) continue;
    const service = plan?.services?.find((item) => item.name === match[1]);
    const label = productName(service?.image, cap(match[1]));
    privately.set(`${match[1]} ${match[2]}`, {
      name: /ready/.test(match[2])
        ? `${label} is ready`
        : `${label} answers queries`,
      probe: `GET ${match[2]}`,
      inside: true,
      at: event.at,
    });
  }
  checks.push(...privately.values());

  // ---- What is live, plain first and exact on demand.
  const images = [
    plan?.image && { name, ref: plan.image },
    ...(plan?.services ?? []).map((service) => ({
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
              ? `${name} may have changed on the server.`
              : `${name} is serving revision ${short}.`;
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
      ? "A recorded check, not continuous monitoring."
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
    // Recreating containers after a verified deploy is not another attempt.
    attempts: attempts.filter((item) => item.kind !== "recreate").length,
    checks,
    logs: {
      at: record?.logsCollectedAt ?? null,
      lines: cleanLogs(record?.logs ?? ""),
    },
    gaps: [
      {
        id: "rollback",
        title: "Roll back to an earlier release",
        detail:
          "Not available yet. The verified images are kept, but switching back isn't built.",
      },
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
