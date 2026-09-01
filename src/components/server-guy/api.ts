import type { ApprovalMode, PhaseOneOperatorView } from "@/server/types";

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
      if (response.ok) throw new Error("Server Guy returned an unreadable response.");
    }
  }
  if (!response.ok) {
    throw new Error(body?.error ?? (text || "Server Guy could not complete that request."));
  }
  if (!body) throw new Error("Server Guy returned an empty response.");
  return body;
}

function post(url: string, body: unknown) {
  return jsonRequest<PhaseOneOperatorView>(url, { method: "POST", body: JSON.stringify(body) });
}

/** Every call returns the whole Phase 1 view; the shell replaces its state with it. */
export const api = {
  createApplication(input: { repositoryUrl: string; approvalMode: ApprovalMode }) {
    return post("/api/applications", input);
  },
  view(applicationId: string, sessionId: string) {
    return jsonRequest<PhaseOneOperatorView>(
      `/api/applications/${applicationId}?session=${encodeURIComponent(sessionId)}`,
    );
  },
  createSession(applicationId: string) {
    return post(`/api/applications/${applicationId}/sessions`, {});
  },
  archiveSession(applicationId: string, sessionId: string) {
    return post(`/api/applications/${applicationId}/sessions/${sessionId}/archive`, {});
  },
  sendMessage(applicationId: string, sessionId: string, message: string) {
    return post(`/api/applications/${applicationId}/sessions/${sessionId}/messages`, { message });
  },
  rerunRepositoryCheck(applicationId: string) {
    return post(`/api/applications/${applicationId}/checks/repository-readable/rerun`, {});
  },
};
