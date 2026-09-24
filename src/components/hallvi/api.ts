import type { ChatMessage, ChatSnapshot, OperatorView } from "@/server/types";

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
        throw new Error("Hallvi returned an unreadable response.");
    }
  }
  if (!response.ok) {
    throw new Error(
      body?.error ?? (text || "Hallvi could not complete that request."),
    );
  }
  if (!body) throw new Error("Hallvi returned an empty response.");
  return body;
}

function post(url: string, body: unknown) {
  return jsonRequest<OperatorView>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Application reads/edits return the whole view; removal returns the removed
 * identity.
 */
export const api = {
  runSnapshot(applicationId: string, chatId: string) {
    return jsonRequest<ChatSnapshot>(
      `/api/applications/${applicationId}/chats/${chatId}/messages`,
    );
  },
  renameApplication(applicationId: string, name: string) {
    return jsonRequest<{ application: { id: string; name: string } }>(
      `/api/applications/${applicationId}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
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
    requestKey: string;
    name?: string;
    repositoryUrl: string;
  }) {
    return post("/api/applications", input);
  },
  view(applicationId: string, chatId: string) {
    return jsonRequest<OperatorView>(
      `/api/applications/${applicationId}?chat=${encodeURIComponent(chatId)}`,
    );
  },
  createChat(applicationId: string) {
    return post(`/api/applications/${applicationId}/chats`, {});
  },
  checkRepository(applicationId: string) {
    return post(`/api/applications/${applicationId}/repository-check`, {});
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
    delivery: "next" | "steer" = "next",
    images: { mimeType: string; data: string }[] = [],
  ) {
    return jsonRequest<ChatSnapshot>(
      `/api/applications/${applicationId}/chats/${chatId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          requestKey,
          delivery,
          ...(images.length ? { images } : {}),
        }),
      },
    );
  },
  /** Pi carries on with what an interruption left unfinished. */
  continueConversation(applicationId: string, chatId: string) {
    return jsonRequest(
      `/api/applications/${applicationId}/chats/${chatId}/continue`,
      { method: "POST" },
    );
  },
  /** Pi ends what it is doing here and drops what it had queued. */
  stopConversation(applicationId: string, chatId: string) {
    return jsonRequest(
      `/api/applications/${applicationId}/chats/${chatId}/stop`,
      { method: "POST" },
    );
  },
};
