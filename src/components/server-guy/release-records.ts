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

import type { SavedInformation } from "@/server/operator-data";

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
    /** A private address only works from the machine running Server Guy. */
    localOnly: boolean;
  } | null;
}

function outcomeOf(record: SavedInformation): Release["outcome"] {
  const status = record.presentation?.status;
  const checks = record.presentation?.checks ?? [];
  if (status === "failed" || checks.some((check) => check.status === "failed"))
    return "failed";
  // A release is running because something checked, not because a record was
  // written. `verified` with no check behind it is still Pi's own judgement
  // and counts; a record with neither says only that an attempt happened.
  if (
    status === "verified" ||
    checks.some((check) => check.status === "passed")
  )
    return "deployed";
  return "attempted";
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
        outcome: outcomeOf(record),
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
          ? "No release has ever started successfully."
          : "A release was attempted and nothing established what came of it.",
      limit: null,
    };
  if (running.id === latest.id)
    return { says: `Running ${running.short}.`, limit: null };
  return {
    says: `Running ${running.short}.`,
    limit:
      latest.outcome === "failed"
        ? `The update to ${latest.short} after it did not start, so this is still what is deployed.`
        : `An update to ${latest.short} was attempted after it and nothing established what came of it, so what is running now is unconfirmed.`,
  };
}
