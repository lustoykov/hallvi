// How one application deploys, and what the branch watch has seen.
//
// One file per application holds the owner's choice (automatically when a
// branch changes, or only when asked), what GitHub last said the branch is at,
// and the attempts the watch started. Pi's tools, the choice card and the
// Deployment page all read and change this one record.
//
// Only the worker writes it. Every change is a read and a write with nothing
// awaited in between, in the one process that owns Pi's sessions, so two
// writers never interleave; the app reads the file and asks the worker for
// anything else. What is *running* is deliberately not kept here: that is the
// newest release record a check proved, the same one the page reads.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { z } from "zod";

import { loadApplication } from "./applications";
import { githubJson, GithubAccessError } from "./github-api";
import { repositoryCredential } from "./github-connection";
import { piConfigDir } from "./pi-configuration";
import { releaseOutcome } from "./release-outcome";
import { listInformation } from "./saved-information";

/**
 * How often the worker asks GitHub where the branch is. Hallvi runs behind a
 * home router where GitHub cannot call it, so it looks; a push is noticed
 * within this long, not instantly, and every surface that mentions it says so.
 */
export const LOOK_INTERVAL_SECONDS = 60;
const KEPT_ATTEMPTS = 20;

const commit = z.string().regex(/^[0-9a-f]{40}$/);
const branchName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  // Git's own rules, near enough: no spaces, control characters or the
  // characters a ref may not hold. It is sent to GitHub, never to a shell.
  .regex(/^[^\s~^:?*[\\\x00-\x1f\x7f]+$/, "That is not a branch name.");

const attemptSchema = z.strictObject({
  /** Also the id of the message that woke Pi: the same attempt is one send. */
  id: z.string(),
  commit,
  title: z.string().max(200),
  /** A push the watch noticed, or the owner pressing Deploy. */
  trigger: z.enum(["push", "owner"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  /**
   * `deployed` only when a release record for this commit says a check
   * proved it. `interrupted` is a worker that went away mid-deployment: what
   * reached the server is unknown.
   */
  outcome: z.enum(["running", "deployed", "failed", "interrupted"]),
  detail: z.string().max(600).nullable(),
  recordId: z.string().nullable(),
});
export type DeploymentAttempt = z.infer<typeof attemptSchema>;

const stateSchema = z.strictObject({
  /** Null until the owner has chosen. */
  mode: z.enum(["automatic", "manual"]).nullable(),
  branch: branchName.nullable(),
  /** Automatic deployments wait; looking at GitHub carries on. */
  paused: z.boolean(),
  /** When Pi asked how this should deploy: where the card sits. */
  askedAt: z.string().nullable(),
  chosenAt: z.string().nullable(),
  latest: z
    .strictObject({
      commit,
      title: z.string().max(200),
      committedAt: z.string().nullable(),
      detectedAt: z.string(),
    })
    .nullable(),
  /** The last time GitHub answered. Activity is this, never the preference. */
  checkedAt: z.string().nullable(),
  checkError: z.string().max(400).nullable(),
  /** Why a deployment that is due has not started. */
  blocked: z.string().max(400).nullable(),
  attempts: z.array(attemptSchema).max(KEPT_ATTEMPTS),
});
export type DeploymentState = z.infer<typeof stateSchema>;

const EMPTY: DeploymentState = {
  mode: null,
  branch: null,
  paused: false,
  askedAt: null,
  chosenAt: null,
  latest: null,
  checkedAt: null,
  checkError: null,
  blocked: null,
  attempts: [],
};

function path(applicationId: string) {
  return join(
    piConfigDir(),
    "operator",
    z.uuid().parse(applicationId),
    "deployment.json",
  );
}

export function deploymentState(applicationId: string): DeploymentState {
  try {
    return stateSchema.parse(
      JSON.parse(readFileSync(path(applicationId), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY;
    throw error;
  }
}

/** Worker only, and never across an await: see the note at the top. */
export function changeDeploymentState(
  applicationId: string,
  change: (state: DeploymentState) => DeploymentState,
) {
  const next = stateSchema.parse(change(deploymentState(applicationId)));
  next.attempts = next.attempts.slice(0, KEPT_ATTEMPTS);
  const file = path(applicationId);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
  return next;
}

/** Pi writes a revision as it likes; seven characters of one commit is it. */
export function sameCommit(a: string, b: string) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.startsWith(short);
}

/** Release records for this application, newest first. */
function releases(applicationId: string) {
  return listInformation(applicationId)
    .flatMap((record) => {
      const content = record.presentation?.content;
      return content?.kind === "deployment"
        ? [
            {
              record,
              revision: content.revision,
              at: record.establishedAt ?? record.createdAt,
              outcome: releaseOutcome(record),
            },
          ]
        : [];
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The commit a check proved is running, exactly as the page reads it. */
export function deployedRevision(applicationId: string) {
  return (
    releases(applicationId).find((release) => release.outcome === "deployed")
      ?.revision ?? null
  );
}

/** What Pi recorded about this commit since an attempt began. */
export function releaseSince(
  applicationId: string,
  wanted: string,
  since: string,
) {
  return (
    releases(applicationId).find(
      (release) =>
        sameCommit(release.revision, wanted) &&
        Date.parse(release.record.updatedAt) >= Date.parse(since),
    ) ?? null
  );
}

/** One look per application at a time, with the ETag of its last answer. */
const etags = new Map<string, { branch: string; etag: string }>();

/**
 * Ask GitHub where the tracked branch is, and write down what it said.
 *
 * A failure is written down too and thrown to nobody: the watch carries on,
 * and the page says since when GitHub has not answered.
 */
export async function lookAtBranch(
  applicationId: string,
  signal?: AbortSignal,
) {
  const { branch } = deploymentState(applicationId);
  if (!branch) return deploymentState(applicationId);
  try {
    const tip = await branchTip(applicationId, branch, signal);
    const now = new Date().toISOString();
    return changeDeploymentState(applicationId, (state) =>
      // The owner changed branch while GitHub was answering about the old one.
      state.branch !== branch
        ? state
        : {
            ...state,
            checkedAt: now,
            checkError: null,
            latest:
              tip && tip.commit !== state.latest?.commit
                ? { ...tip, detectedAt: now }
                : state.latest,
          },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    return changeDeploymentState(applicationId, (state) => ({
      ...state,
      checkError:
        error instanceof GithubAccessError
          ? error.message
          : "Hallvi could not read the branch from GitHub.",
    }));
  }
}

/** Null when GitHub says nothing has moved since the last answer. */
async function branchTip(
  applicationId: string,
  branch: string,
  signal?: AbortSignal,
) {
  const application = loadApplication(applicationId);
  const { token } = await repositoryCredential();
  if (!token)
    throw new GithubAccessError(
      "Connect GitHub in Settings → GitHub so Hallvi can watch this branch.",
      "auth",
    );
  const known = etags.get(applicationId);
  const answer = await githubJson(
    `/repos/${application.repositoryOwner}/${application.repositoryName}/commits/${encodeURIComponent(branch)}`,
    token,
    {
      signal,
      ifNoneMatch: known?.branch === branch ? known.etag : undefined,
    },
  );
  if (answer.unchanged) return null;
  const data = answer.data as {
    sha: string;
    commit?: { message?: string; committer?: { date?: string } };
  };
  if (answer.etag) etags.set(applicationId, { branch, etag: answer.etag });
  return {
    commit: commit.parse(data.sha),
    title: (data.commit?.message ?? "").split("\n")[0].slice(0, 200),
    committedAt: data.commit?.committer?.date ?? null,
  };
}

export const deploymentChoiceSchema = z.strictObject({
  mode: z.enum(["automatic", "manual"]).optional(),
  branch: branchName.optional(),
  paused: z.boolean().optional(),
});

/**
 * Save the owner's choice, having first asked GitHub about that branch the
 * way the watch will. A branch GitHub does not have, or a login it refuses,
 * is refused here rather than saved as a preference nothing can act on.
 */
export async function chooseDeployment(
  applicationId: string,
  input: z.infer<typeof deploymentChoiceSchema>,
  signal?: AbortSignal,
) {
  const choice = deploymentChoiceSchema.parse(input);
  const before = deploymentState(applicationId);
  const branch = choice.branch ?? before.branch;
  const mode = choice.mode ?? before.mode;
  if (mode && !branch) throw new Error("Say which branch to deploy from.");
  if (branch && branch !== before.branch) {
    etags.delete(applicationId);
    try {
      await branchTip(applicationId, branch, signal);
    } catch (error) {
      // Only GitHub being away is let through: the look below records it and
      // the watch keeps trying. Anything else would never start working.
      if (!(error instanceof GithubAccessError) || error.kind !== "unavailable")
        throw error;
    }
    etags.delete(applicationId);
  }
  changeDeploymentState(applicationId, (state) => ({
    ...state,
    mode,
    branch,
    paused: choice.paused ?? state.paused,
    chosenAt: mode ? (state.chosenAt ?? new Date().toISOString()) : null,
    ...(branch !== state.branch
      ? { latest: null, checkedAt: null, checkError: null, blocked: null }
      : {}),
  }));
  return lookAtBranch(applicationId, signal);
}

/** Pi asked the owner how this should deploy; the card sits at this moment. */
export function askDeploymentChoice(applicationId: string, branch?: string) {
  return changeDeploymentState(applicationId, (state) => ({
    ...state,
    askedAt: state.askedAt ?? new Date().toISOString(),
    branch: state.branch ?? (branch ? branchName.parse(branch) : null),
  }));
}

/**
 * The record with what is running beside it, and whether the watch is really
 * watching: a choice of automatic says what the owner wants, and only a recent
 * answer from GitHub says it is happening.
 */
export function deploymentStatus(applicationId: string, now = Date.now()) {
  const state = deploymentState(applicationId);
  const deployed = deployedRevision(applicationId);
  const fresh =
    state.checkedAt !== null &&
    now - Date.parse(state.checkedAt) < LOOK_INTERVAL_SECONDS * 5 * 1000;
  return {
    ...state,
    deployed,
    upToDate:
      deployed && state.latest
        ? sameCommit(deployed, state.latest.commit)
        : null,
    watching: Boolean(state.branch) && fresh && !state.checkError,
    lookIntervalSeconds: LOOK_INTERVAL_SECONDS,
  };
}
export type DeploymentStatus = ReturnType<typeof deploymentStatus>;
