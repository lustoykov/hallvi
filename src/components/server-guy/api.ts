import type { ExecutionSetupStatus } from "@/server/execution-setup";
import type {
  AcceptedPiRun,
  ApprovalMode,
  ChatRunSnapshot,
  OperatorView,
  PhaseKey,
} from "@/server/types";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await response.text();
  let body: (T & { error?: string }) | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T & { error?: string };
    } catch {
      if (response.ok)
        throw new Error("Server Guy returned an unreadable response.");
    }
  }
  if (!response.ok) {
    throw new Error(
      body?.error ?? (text || "Server Guy could not complete that request."),
    );
  }
  if (!body) throw new Error("Server Guy returned an empty response.");
  return body;
}

function post(url: string, body: unknown) {
  return jsonRequest<OperatorView>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Workspace reads/edits return the whole view; removal returns the removed
 * identity.
 */
export const api = {
  runSnapshot(applicationId: string, chatId: string) {
    return jsonRequest<ChatRunSnapshot>(
      `/api/applications/${applicationId}/chats/${chatId}/messages`,
    );
  },
  removeApplication(applicationId: string, repository: string) {
    return jsonRequest<{ removedApplicationId: string }>(
      `/api/applications/${applicationId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ repository }),
      },
    );
  },
  createApplication(input: {
    repositoryUrl: string;
    approvalMode: ApprovalMode;
  }) {
    return post("/api/applications", input);
  },
  view(applicationId: string, chatId: string) {
    return jsonRequest<OperatorView>(
      `/api/applications/${applicationId}?chat=${encodeURIComponent(chatId)}`,
    );
  },
  /** A phase's primary chat: how the phase strip switches the viewed phase. */
  viewPhase(applicationId: string, phaseKey: PhaseKey) {
    return jsonRequest<OperatorView>(
      `/api/applications/${applicationId}?phase=${encodeURIComponent(phaseKey)}`,
    );
  },
  createChat(applicationId: string) {
    return post(`/api/applications/${applicationId}/chats`, {});
  },
  archiveChat(applicationId: string, chatId: string) {
    return post(
      `/api/applications/${applicationId}/chats/${chatId}/archive`,
      {},
    );
  },
  sendMessage(
    applicationId: string,
    chatId: string,
    message: string,
    requestKey: string,
  ) {
    return jsonRequest<AcceptedPiRun>(
      `/api/applications/${applicationId}/chats/${chatId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message, requestKey }),
      },
    );
  },
  runAction(
    applicationId: string,
    chatId: string,
    runId: string,
    action: "cancel" | "retry",
  ) {
    return jsonRequest(
      `/api/applications/${applicationId}/chats/${chatId}/runs/${runId}/${action}`,
      { method: "POST" },
    );
  },
  rerunCheck(
    applicationId: string,
    check:
      | "repository-readable"
      | "repository-inspection"
      | "conformance-refresh"
      | "conformance-verify",
  ) {
    return post(`/api/applications/${applicationId}/checks/${check}/rerun`, {});
  },
  /** The explicit Continue from a ready Launch Brief into Inspect app. */
  continueToInspectApp(applicationId: string) {
    return post(`/api/applications/${applicationId}/phases/inspect-app`, {});
  },
  /** The explicit Continue from a ready Application Contract into Phase 3. */
  continueToMakeLaunchReady(applicationId: string) {
    return post(
      `/api/applications/${applicationId}/phases/make-launch-ready`,
      {},
    );
  },
  /** Phase 3 actions; every one returns the Make launch-ready view. */
  conformance(applicationId: string) {
    const root = `/api/applications/${applicationId}/conformance`;
    return {
      continueWithServerGuy: () => post(`${root}/continue`, {}),
      exportBrief: () =>
        jsonRequest<{ text: string }>(`${root}/brief`, {
          method: "POST",
          body: "{}",
        }),
      returnChange: (reference: string) =>
        post(`${root}/return`, { reference }),
      selectCurrentRevision: () => post(`${root}/select-current`, {}),
      refresh: () => post(`${root}/refresh`, {}),
      verify: () => post(`${root}/verify`, {}),
      approve: (proposalId: string) =>
        post(`${root}/proposals/${proposalId}/approve`, {}),
      publish: (proposalId: string) =>
        post(`${root}/proposals/${proposalId}/publish`, {}),
      withdraw: (proposalId: string) =>
        post(`${root}/proposals/${proposalId}/withdraw`, {}),
      acceptChecks: (acceptanceId: string) =>
        post(`${root}/acceptance/${acceptanceId}/accept`, {}),
      cancelRun: (runId: string) => post(`${root}/runs/${runId}/cancel`, {}),
      grant: () => post(`${root}/grant`, {}),
      revoke: () =>
        jsonRequest<OperatorView>(`${root}/grant`, { method: "DELETE" }),
    };
  },
  executionSetup(action?: "check" | "prepare") {
    return action
      ? jsonRequest<ExecutionSetupStatus>("/api/execution/setup", {
          method: "POST",
          body: JSON.stringify({ action }),
        })
      : jsonRequest<ExecutionSetupStatus>("/api/execution/setup");
  },
};
