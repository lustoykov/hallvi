import type {
  AcceptedPiRun,
  ApprovalMode,
  ChatRunSnapshot,
  PhaseOneOperatorView,
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
  return jsonRequest<PhaseOneOperatorView>(url, {
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
    return jsonRequest<PhaseOneOperatorView>(
      `/api/applications/${applicationId}?chat=${encodeURIComponent(chatId)}`,
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
  rerunRepositoryCheck(applicationId: string) {
    return post(
      `/api/applications/${applicationId}/checks/repository-readable/rerun`,
      {},
    );
  },
};
