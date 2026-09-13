"use client";

// Deployment, built from what Pi recorded and what actually ran.
//
// The first view that needs both. The release itself is a record — one per
// release, written once, so "the third attempt" is the third record rather
// than a number somebody increments. The phases are executions, and those
// belong to the controller: Pi never re-types what a command already proves.
//
// Nothing here re-runs anything to fill a panel. The output shown is the
// output that was captured, with the time it was captured.

import { clip, commandOf, essence } from "./execution-text";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import { releasedServices, tagFor } from "@/server/record-projection";

import type {
  Check,
  DeploymentStory,
  LiveFact,
  Phase,
  StoryLine,
  StoryState,
  Tone,
} from "./deployment-prototype/deployment-model";
import { toneOf, took } from "./deployment-prototype/deployment-model";

type Content = NonNullable<
  NonNullable<SavedInformation["presentation"]>["content"]
>;
type Deployment = Extract<Content, { kind: "deployment" }>;
type Access = Extract<Content, { kind: "application-access" }>;

function contentOf<T extends Content["kind"]>(
  records: SavedInformation[],
  kind: T,
) {
  return records
    .filter((record) => !record.retiredAt)
    .filter((record) => record.presentation?.content?.kind === kind)
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    );
}

const phaseTone: Record<ExecutionRecord["status"], Phase["tone"]> = {
  "awaiting-approval": "wait",
  running: "work",
  succeeded: "pass",
  failed: "fail",
  declined: "fail",
  interrupted: "fail",
};

/** What an execution is called in the story of a release. */
function titleOf(execution: ExecutionRecord) {
  switch (execution.tool) {
    case "server_bash":
      return "On the server";
    case "request_approval":
      return "Your decision";
    case "bash":
    case "powershell":
      return "In the repository copy";
    case "hetzner_request":
      return "With the provider";
    case "open_server_port":
      return "Opening the tunnel";
    default:
      return execution.tool.replaceAll("_", " ");
  }
}

function lines(output: string): StoryLine[] {
  return output
    .split("\n")
    .map((text) => text.trimEnd())
    .filter(Boolean)
    .slice(-40)
    .map((text) => ({ at: "", text, tone: toneOf(text) }));
}

/**
 * The run that produced this release. A record cites the moment it was
 * saved, so its message evidence names the run; without that, the newest run
 * on record is the best the controller can offer and is labelled as such.
 */
function runFor(
  record: SavedInformation | undefined,
  executions: ExecutionRecord[],
) {
  const cited = record?.evidence.find((item) => item.type === "message");
  if (cited && "id" in cited) {
    const mine = executions.filter((item) => item.runId === cited.id);
    if (mine.length) return mine;
  }
  const newest = [...executions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0];
  return newest ? executions.filter((item) => item.runId === newest.runId) : [];
}

/**
 * What to call the running image in one line. A digest is the honest
 * identity and unreadable as a headline, so the name carries the line and
 * the digest stays in the exact rows underneath.
 */
function readableImage(image: string) {
  const [reference, digest] = image.split("@");
  const tag = reference.includes(":") ? reference.split(":").at(-1) : null;
  if (tag) return tag;
  const name = reference.split("/").at(-1) ?? reference;
  return digest
    ? `${name} · ${digest.replace("sha256:", "").slice(0, 12)}`
    : name;
}

export function deploymentFromRecords({
  records,
  executions,
  applicationName,
  now,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  applicationName: string;
  now: number;
}): DeploymentStory {
  const releases = contentOf(records, "deployment");
  const release = releases[0];
  const content = release?.presentation?.content as Deployment | undefined;
  const accessRecord = contentOf(records, "application-access")[0];
  const access = accessRecord?.presentation?.content as Access | undefined;

  const ordered = [...runFor(release, executions)].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const phases: Phase[] = ordered.map((execution) => ({
    id: execution.id,
    title: titleOf(execution),
    detail: clip(essence(commandOf(execution.input)), 140),
    start: execution.createdAt,
    end: execution.finishedAt ?? execution.createdAt,
    tone: phaseTone[execution.status] ?? "work",
    lines: lines(execution.output ?? ""),
  }));

  const waiting = ordered.some(
    (execution) => execution.status === "awaiting-approval",
  );
  const working = ordered.some((execution) => execution.status === "running");
  const status = release?.presentation?.status;
  const state: StoryState = waiting
    ? "awaiting"
    : working
      ? "working"
      : !release
        ? "none"
        : status === "failed"
          ? "failed"
          : "live";

  const shown = release?.presentation?.checks ?? [];
  const tag = release ? tagFor(release, shown, now) : "info";
  const tone: Tone =
    tag === "verified"
      ? "verified"
      : tag === "stale"
        ? "stale"
        : tag === "failed"
          ? "failed"
          : state === "working" || state === "awaiting"
            ? "checking"
            : "planned";
  const word =
    state === "none"
      ? "Not deployed"
      : state === "awaiting"
        ? "Waiting for you"
        : state === "working"
          ? "Working"
          : tag === "stale"
            ? "Last verified"
            : tag === "failed"
              ? "Failed"
              : "Verified";

  const facts: LiveFact[] = [];
  const services = content ? releasedServices(content) : [];
  if (content)
    facts.push({
      label: "Running",
      // A tag reads as a version; a digest-pinned reference does not. Taking
      // the text after the last colon gives "13.2.1" for one and a bare
      // 64-character hash for the other, so the two are read apart.
      //
      // Two services are two things running, so the headline counts them
      // rather than picking one and implying it is the whole release.
      value:
        services.length > 1
          ? `${services.length} services`
          : services.length === 1
            ? readableImage(services[0].image)
            : "Not recorded",
      sub: content.server,
      exact: [
        ...services.map((service) => ({
          label: service.process ? service.process : "Image",
          value: service.digest
            ? `${service.image.split("@")[0]} · ${service.digest.replace("sha256:", "").slice(0, 12)}`
            : service.image,
          mono: true,
        })),
        { label: "Revision", value: content.revision.slice(0, 12), mono: true },
        { label: "Server", value: content.server },
      ],
    });
  if (access)
    facts.push({
      label: "Reached",
      value:
        access.mode === "private" ? "Only from this PC" : "On the internet",
      sub: accessRecord?.presentation?.url ?? "",
      exact: [
        {
          label: "How",
          value: access.mode === "private" ? "SSH tunnel" : "Public address",
        },
        ...(access.localPort
          ? [
              {
                label: "Here",
                value: `127.0.0.1:${access.localPort}`,
                mono: true,
              },
            ]
          : []),
        ...(access.remotePort
          ? [
              {
                label: "On the server",
                value: `${access.remotePort}`,
                mono: true,
              },
            ]
          : []),
      ],
    });

  const checks: Check[] = shown.map((check) => ({
    name: check.label,
    probe: check.detail ?? "",
    // A check about the application's own parts was made on the server; one
    // about how it is reached was made from this PC.
    inside: check.about
      ? check.about.kind === "process" || check.about.kind === "volume"
      : true,
    at: release?.establishedAt ?? null,
  }));

  const newest = [...ordered].reverse().find((item) => item.output?.trim());
  const started = ordered[0]?.createdAt ?? null;
  const finished = ordered.at(-1)?.finishedAt ?? null;

  return {
    state,
    name: applicationName,
    revision: content?.revision ?? null,
    statement: release?.title ?? "Nothing has been deployed yet.",
    tone,
    word,
    detail:
      release?.body ??
      "Ask in the conversation and Server Guy will work out what this application needs.",
    facts,
    phases,
    started,
    took:
      started && finished
        ? took(Date.parse(finished) - Date.parse(started))
        : null,
    // Each release is its own record, so the count is the history.
    attempts: releases.length,
    checks,
    logs: {
      at: newest?.finishedAt ?? newest?.createdAt ?? null,
      lines: (newest?.output ?? "").split("\n").filter(Boolean).slice(-60),
    },
    gaps: records
      .filter(
        (record) =>
          !record.retiredAt &&
          record.presentation?.role === "recommendation" &&
          record.presentation.views.includes("deployment"),
      )
      .map((record) => ({
        id: record.id,
        title: record.title,
        detail: record.presentation?.nextStep ?? record.body,
      })),
    chat: null,
    repository: content?.repositoryUrl ?? "",
  };
}
