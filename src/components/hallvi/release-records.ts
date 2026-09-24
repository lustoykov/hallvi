"use client";

// Releases, and which one is actually running.
//
// Deployment read `releases[0]` — the newest deployment record, whatever
// became of it — and called that the release. So an update that built an
// image and could not start replaced a release that had been running for
// days, and the page answered "what is running?" with the thing that is not.
//
// Three different questions live in this file and none of them may be
// collapsed into another:
//
//   What is running        the newest release that was verified
//   What happened last     the newest attempt, verified or not
//   What else has run      every earlier release, in order
//
// When the last attempt failed, the first two are different records and the
// page has to say both. When an attempt's outcome was never established, the
// honest answer to the first is "unknown", not the previous release — a
// container that was replaced by something that did not start is not still
// running the old image.

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import { releaseOutcome } from "@/server/release-outcome";

import {
  clip,
  commandOf,
  essence,
  intentOf,
  placeOf,
  whereItRan,
} from "./execution-text";

type Content = NonNullable<
  NonNullable<SavedInformation["presentation"]>["content"]
>;
type Deployment = Extract<Content, { kind: "deployment" }>;
type Access = Extract<Content, { kind: "application-access" }>;

export interface Release {
  /** The record's own id, so a link can reach it. */
  id: string;
  at: string;
  revision: string;
  /** Short form, for a list. */
  short: string;
  image: string | null;
  server: string;
  changes: string[];
  /** What Pi said about it, where it said anything. */
  note: string;
  /**
   * `deployed` means a check proved it started or answered. `failed` means a
   * check proved it did not. `attempted` means neither — something ran and
   * nothing established what came of it, which is its own answer.
   */
  outcome: "deployed" | "failed" | "attempted";
  checks: { label: string; passed: boolean }[];
}

/**
 * One command that went into a release.
 *
 * `where` is provenance on the step and never a filter above the list: the
 * application is on the server always, and only some of the commands ran
 * anywhere else. Narrowing a whole page by machine answers a question nobody
 * arrives at Deployment with.
 */
export interface ReleaseStep {
  id: string;
  title: string;
  /** The command, short enough to read in a row. */
  caption: string;
  /** The whole thing, for whoever wants it. */
  command: string;
  where: string | null;
  /** How long it took. Null while it is still running. */
  seconds: number | null;
  outcome: ExecutionRecord["status"];
  output: string;
}

export interface ReleaseView {
  /** The newest release a check proved. Null when none ever was. */
  running: Release | null;
  /** The newest attempt. The same object as `running` when it worked. */
  latest: Release | null;
  /** Every release, newest first, including the two above. */
  all: Release[];
  /** Where the application can be opened, when a record says. */
  access: {
    url: string;
    mode: "private" | "public";
    at: string;
    /** A private address only works from the machine running Hallvi. */
    localOnly: boolean;
  } | null;
}

export function releasesFromRecords(
  records: SavedInformation[],
  applicationId: string,
): ReleaseView {
  const live = records.filter((record) => !record.retiredAt);
  const all: Release[] = live
    .filter((record) => record.presentation?.content?.kind === "deployment")
    .map((record) => {
      const content = record.presentation!.content as Deployment;
      const at = record.establishedAt ?? record.createdAt;
      return {
        id: record.id,
        at,
        revision: content.revision,
        short: content.revision.slice(0, 7),
        image: content.image ?? content.services?.[0]?.image ?? null,
        server: content.server,
        changes: content.changes ?? [],
        note: record.body?.trim() ?? "",
        outcome: releaseOutcome(record),
        checks: (record.presentation?.checks ?? []).map((check) => ({
          label: check.label,
          passed: check.status === "passed",
        })),
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const latest = all[0] ?? null;
  // The newest one that was actually proved — which is not necessarily the
  // newest one, and that gap is the whole point of this projection.
  const running = all.find((release) => release.outcome === "deployed") ?? null;

  const accessRecord = live
    .filter(
      (record) => record.presentation?.content?.kind === "application-access",
    )
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )[0];
  const accessContent = accessRecord?.presentation?.content as
    Access | undefined;
  void applicationId;

  return {
    all,
    latest,
    running,
    access:
      accessRecord && accessContent && accessRecord.presentation?.url
        ? {
            url: accessRecord.presentation.url,
            mode: accessContent.mode,
            at: accessRecord.establishedAt ?? accessRecord.createdAt,
            localOnly: accessContent.mode === "private",
          }
        : null,
  };
}

const TITLE_OF: Record<string, string> = {
  server_bash: "On the server",
  open_pull_request: "In the repository on GitHub",
  bash: "In the repository copy",
  powershell: "In the repository copy",
  hetzner_request: "With the provider",
  request_approval: "Your decision",
  open_server_port: "Opening the tunnel",
};

/**
 * The commands that produced one release, from that release's own evidence.
 *
 * Only its own. The story of the latest attempt could fall back to the newest
 * run when a record cited nothing, because there was one story and it was
 * about the newest thing that happened. A list of releases cannot: the same
 * fallback would hang the same commands under every release that cited none,
 * which is a page inventing work that a release did not do.
 */
export function workFor(
  release: Pick<Release, "id">,
  records: SavedInformation[],
  executions: ExecutionRecord[],
): ReleaseStep[] {
  const record = records.find((one) => one.id === release.id);
  if (!record) return [];
  const runs = new Set<string>();
  const ids = new Set<string>();
  for (const item of record.evidence ?? []) {
    if (item.type === "message" && "id" in item) runs.add(item.id);
    if (item.type === "execution") ids.add(item.id);
  }
  if (!runs.size && !ids.size) return [];
  return executions
    .filter((execution) => ids.has(execution.id) || runs.has(execution.runId))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((execution) => {
      const full = commandOf(execution.input);
      const place = whereItRan({
        ...execution,
        target: execution.target ?? "",
      });
      const finished = execution.finishedAt
        ? Date.parse(execution.finishedAt) - Date.parse(execution.createdAt)
        : null;
      return {
        id: execution.id,
        title:
          intentOf(execution.input) ??
          TITLE_OF[execution.tool] ??
          execution.tool.replaceAll("_", " "),
        caption: clip(essence(full), 120),
        command: full,
        where: place
          ? [place.said, place.detail].filter(Boolean).join(" · ")
          : placeOf(execution.tool),
        seconds:
          finished === null || !Number.isFinite(finished)
            ? null
            : Math.max(0, Math.round(finished / 1000)),
        outcome: execution.status,
        output: execution.output ?? "",
      };
    });
}

/**
 * What the page leads with.
 *
 * Deliberately not one sentence with a tone: "running b2c3d4e, and the update
 * after it failed" is two facts, and a reader who is told only the second one
 * does not know whether their shop is up.
 */
export function releaseHeadline(view: ReleaseView) {
  const { running, latest } = view;
  if (!latest) return { says: "Nothing has been released yet.", limit: null };
  if (!running)
    return {
      says:
        latest.outcome === "failed"
          ? "No successful release is recorded."
          : "A release was attempted and nothing established what came of it.",
      limit: null,
    };
  if (running.id === latest.id)
    return { says: `Running ${running.short}.`, limit: null };
  return {
    says: `Last verified release: ${running.short}.`,
    limit:
      latest.outcome === "failed"
        ? `The update to ${latest.short} failed. Check what is running now.`
        : `An update to ${latest.short} was attempted after it and nothing established what came of it, so what is running now is unconfirmed.`,
  };
}
