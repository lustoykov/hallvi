// The branch watch: the worker noticing that a tracked branch moved, and
// waking the application's main conversation to deploy that exact commit.
//
// It adds no second way to deploy. A push is a wakeup: Pi receives a message
// in the main conversation and deploys as it would if the owner had asked,
// with the same tools, permission mode and evidence. What the watch owns is
// the part a conversation cannot: noticing, not starting twice, and saying
// truthfully what became of each attempt.
//
// Nothing here is remembered in memory that matters. What is running comes
// from release records, what GitHub said and what was attempted come from the
// deployment record, so a restart picks up where the files say things stand:
// commits pushed while Hallvi was off are found on the first look, and an
// attempt a restart cut short is reported as interrupted rather than retried.

import { randomUUID } from "node:crypto";

import { listApplicationChats, listApplications } from "./db";
import {
  changeDeploymentState,
  chooseDeployment,
  deployedRevision,
  deploymentChoiceSchema,
  deploymentState,
  deploymentStatus,
  lookAtBranch,
  LOOK_INTERVAL_SECONDS,
  releaseSince,
  sameCommit,
  type DeploymentAttempt,
  type DeploymentState,
} from "./deployment-automation";
import { operatorSettings } from "./operator-execution";
import { WAKEUP_PREFIX, type Transcript } from "./pi-transcript";
import { WorkerRefusal } from "./worker-link";

interface Conversations {
  driving(chatId: string): boolean;
  send(
    scope: { applicationId: string; chatId: string },
    message: { id: string; body: string; delivery: "next" },
  ): Promise<unknown>;
  transcript(scope: {
    applicationId: string;
    chatId: string;
  }): Promise<Transcript>;
}

const mainChat = (applicationId: string) =>
  listApplicationChats(applicationId).find((chat) => chat.kind === "main");

/** What Pi is told. The owner reads it too, marked as started automatically. */
function wakeup(
  state: DeploymentState,
  target: NonNullable<DeploymentState["latest"]>,
  trigger: DeploymentAttempt["trigger"],
  deployed: string | null,
) {
  const short = target.commit.slice(0, 7);
  return [
    trigger === "push"
      ? `Automatic deployment: ${state.branch} moved to ${short}${target.title ? ` (“${target.title}”)` : ""}. The owner chose to deploy this application automatically whenever ${state.branch} changes, so this deployment is already authorized and needs no question to them.`
      : `The owner pressed Deploy on the Deployment page: deploy ${state.branch} at ${short}${target.title ? ` (“${target.title}”)` : ""}.`,
    deployed
      ? `The last verified release is ${deployed.slice(0, 7)}.`
      : "No verified release is on record yet.",
    `Deploy exactly commit ${target.commit}: call copy_repository_to_server with ref "${target.commit}", not the branch name, so a later push cannot change what you deploy. Update the existing application in place, keep its data, credentials and Compose project identity, and verify that the running application is healthy and is this commit.`,
    `Then save the deployment result with revision "${target.commit}": status verified with its checks only when that verification passed, otherwise status failed saying what went wrong. If the new version does not come up healthy, put the last verified release back when you safely can, and say plainly which commit is running now. Hallvi reads that record to decide whether this commit is deployed; without it this attempt is reported as failed.`,
  ].join("\n\n");
}

export function deploymentWatch(
  conversations: Conversations,
  signal?: AbortSignal,
) {
  const lookedAt = new Map<string, number>();

  /** Say what became of an attempt whose conversation is no longer running. */
  async function settle(applicationId: string, attempt: DeploymentAttempt) {
    const chat = mainChat(applicationId);
    if (chat && conversations.driving(chat.id)) return;
    const release = releaseSince(
      applicationId,
      attempt.commit,
      attempt.startedAt,
    );
    let outcome: DeploymentAttempt["outcome"] = "failed";
    let detail: string | null = null;
    if (release?.outcome === "deployed") outcome = "deployed";
    else if (release)
      detail =
        release.outcome === "failed"
          ? [
              release.record.title,
              ...(release.record.presentation?.checks ?? [])
                .filter((check) => check.status === "failed")
                .map((check) => check.detail ?? check.label),
            ].join(" · ")
          : "Hallvi recorded this release without a check that proves it is running.";
    else {
      const transcript = chat
        ? await conversations
            .transcript({ applicationId, chatId: chat.id })
            .catch(() => null)
        : null;
      const reply = transcript?.messages.findLast(
        (message) => message.role === "assistant",
      );
      if (transcript?.status === "interrupted") {
        outcome = "interrupted";
        detail =
          "Hallvi stopped while this was deploying, so what reached the server is unknown. Continue the conversation to let it finish, or deploy again.";
      } else
        detail =
          reply?.status === "failed" && reply.error
            ? reply.error
            : reply?.status === "cancelled"
              ? "The conversation was stopped before the deployment finished."
              : "Hallvi finished without recording a verified release of this commit. The conversation says what happened.";
    }
    changeDeploymentState(applicationId, (state) => ({
      ...state,
      attempts: state.attempts.map((one) =>
        one.id === attempt.id
          ? {
              ...one,
              outcome,
              detail: detail?.slice(0, 600) ?? null,
              recordId: release?.record.id ?? null,
              finishedAt: new Date().toISOString(),
            }
          : one,
      ),
    }));
  }

  /** Wake Pi for the newest commit. Throws the worker's refusal, if any. */
  async function start(
    applicationId: string,
    trigger: DeploymentAttempt["trigger"],
  ) {
    const state = deploymentState(applicationId);
    const chat = mainChat(applicationId);
    if (!state.latest || !chat)
      throw new WorkerRefusal(
        state.checkError ?? "Hallvi has not read this branch from GitHub yet.",
        "not-ready",
      );
    if (!operatorSettings(applicationId).host)
      throw new WorkerRefusal(
        "No server is connected for this application yet.",
        "not-ready",
      );
    if (conversations.driving(chat.id))
      throw new WorkerRefusal(
        "Hallvi is working in the conversation. The deployment can start when that finishes.",
        "busy",
      );
    const attempt: DeploymentAttempt = {
      id: `${WAKEUP_PREFIX}${randomUUID()}`,
      commit: state.latest.commit,
      title: state.latest.title,
      trigger,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      outcome: "running",
      detail: null,
      recordId: null,
    };
    // Pi takes the message before the attempt is written down: a refusal
    // leaves no attempt behind, and an attempt always has a message.
    await conversations.send(
      { applicationId, chatId: chat.id },
      {
        id: attempt.id,
        body: wakeup(
          state,
          state.latest,
          trigger,
          deployedRevision(applicationId),
        ),
        delivery: "next",
      },
    );
    changeDeploymentState(applicationId, (current) => ({
      ...current,
      blocked: null,
      attempts: [attempt, ...current.attempts],
    }));
  }

  async function care(applicationId: string) {
    let state = deploymentState(applicationId);
    if (!state.branch || !state.mode) return;
    const running = state.attempts.find((one) => one.outcome === "running");
    if (running) await settle(applicationId, running);

    if (
      Date.now() - (lookedAt.get(applicationId) ?? 0) >=
      LOOK_INTERVAL_SECONDS * 1000
    ) {
      lookedAt.set(applicationId, Date.now());
      await lookAtBranch(applicationId, signal);
    }

    state = deploymentState(applicationId);
    const deployed = deployedRevision(applicationId);
    const last = state.attempts[0];
    if (
      state.mode !== "automatic" ||
      state.paused ||
      !state.latest ||
      // Automatic deployment continues a deployment that exists. The first
      // one is the owner's conversation with Pi, not something to race.
      !deployed ||
      sameCommit(deployed, state.latest.commit) ||
      // One attempt per commit. A failure waits for the owner or the next
      // push; it is never tried again by itself.
      last?.outcome === "running" ||
      last?.commit === state.latest.commit
    )
      return;
    try {
      await start(applicationId, "push");
    } catch (error) {
      const blocked =
        error instanceof WorkerRefusal
          ? error.message
          : "Hallvi could not start the deployment.";
      // A busy conversation is the ordinary case and says nothing; anything
      // else is why a due deployment is not happening.
      const say = error instanceof WorkerRefusal && error.code === "busy";
      if ((say ? null : blocked) !== state.blocked)
        changeDeploymentState(applicationId, (current) => ({
          ...current,
          blocked: say ? null : blocked.slice(0, 400),
        }));
    }
  }

  return {
    /** Every application once. One that fails never stops the others. */
    async tick() {
      for (const { id } of listApplications()) {
        if (signal?.aborted) return;
        await care(id).catch((error) =>
          console.warn(
            `Hallvi could not look after deployment of ${id}: ${error instanceof Error ? error.message : "unknown reason"}`,
          ),
        );
      }
    },

    /** What the app asks for: the card, the page and its buttons. */
    async handle(
      scope: { applicationId: string },
      message: unknown,
    ): Promise<unknown> {
      const { applicationId } = scope;
      const request = message as { action?: string; choice?: unknown };
      if (request.action === "choose")
        await chooseDeployment(
          applicationId,
          deploymentChoiceSchema.parse(request.choice),
          signal,
        );
      else if (request.action === "deploy") {
        const running = deploymentState(applicationId).attempts.find(
          (one) => one.outcome === "running",
        );
        if (running) await settle(applicationId, running);
        if (
          deploymentState(applicationId).attempts.some(
            (one) => one.outcome === "running",
          )
        )
          throw new WorkerRefusal("A deployment is already running.", "busy");
        lookedAt.set(applicationId, Date.now());
        await lookAtBranch(applicationId, signal);
        await start(applicationId, "owner");
      } else throw new Error("Unknown deployment request.");
      return deploymentStatus(applicationId);
    },
  };
}
