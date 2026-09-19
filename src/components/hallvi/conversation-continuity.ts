import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";

export interface ConversationContext {
  section: ApplicationSection;
  label: string;
  requestKey?: string;
}
export interface PendingSubmission {
  message: string;
  key: string;
}

export function acceptedDraftCanClear(
  current: string,
  submitted: string,
  editedAfterSubmission: boolean,
) {
  return !editedAfterSubmission && (!current || current === submitted);
}

function storageKey(
  applicationId: string,
  chatId: string,
  kind: "draft" | "context",
) {
  return `hv:${kind}:${applicationId}:${chatId}`;
}

function submissionKey(applicationId: string, chatId: string) {
  return `hv:submission:${applicationId}:${chatId}`;
}

export function readPendingSubmission(
  applicationId: string,
  chatId: string,
): PendingSubmission | null {
  try {
    const durable = localStorage.getItem(submissionKey(applicationId, chatId));
    const value = JSON.parse(
      durable ?? sessionStorage.getItem(`pi-submission:${chatId}`) ?? "null",
    );
    const submission =
      value &&
      typeof value.message === "string" &&
      typeof value.key === "string"
        ? (value as PendingSubmission)
        : null;
    if (submission && durable === null) {
      localStorage.setItem(
        submissionKey(applicationId, chatId),
        JSON.stringify(submission),
      );
      sessionStorage.removeItem(`pi-submission:${chatId}`);
    }
    return submission;
  } catch {
    return null;
  }
}

export function writePendingSubmission(
  applicationId: string,
  chatId: string,
  submission: PendingSubmission,
) {
  try {
    localStorage.setItem(
      submissionKey(applicationId, chatId),
      JSON.stringify(submission),
    );
  } catch {
    // The request key still protects this in-memory attempt.
  }
}

export function clearPendingSubmission(applicationId: string, chatId: string) {
  try {
    localStorage.removeItem(submissionKey(applicationId, chatId));
    sessionStorage.removeItem(`pi-submission:${chatId}`);
  } catch {
    // Storage is recovery help; acceptance is established by the API.
  }
}

export function sectionContext(
  section: ApplicationSection,
): ConversationContext {
  return {
    section,
    label:
      applicationSections.find((candidate) => candidate.id === section)
        ?.label ?? section,
  };
}

export function readConversationDraft(applicationId: string, chatId: string) {
  try {
    // The application id makes the boundary inspectable even though chat ids
    // are already globally unique. Keep the old key as a one-time migration.
    const key = storageKey(applicationId, chatId, "draft");
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
    const legacy = sessionStorage.getItem(`hv-draft:${chatId}`) ?? "";
    if (legacy) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(`hv-draft:${chatId}`);
    }
    return legacy;
  } catch {
    return "";
  }
}

export function writeConversationDraft(
  applicationId: string,
  chatId: string,
  value: string,
) {
  try {
    const key = storageKey(applicationId, chatId, "draft");
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // A browser without durable storage still keeps React state for this tab.
  }
}

export function readConversationContext(
  applicationId: string,
  chatId: string,
): ConversationContext | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey(applicationId, chatId, "context")) ??
        "null",
    ) as Partial<ConversationContext> | null;
    if (
      !parsed ||
      typeof parsed.section !== "string" ||
      typeof parsed.label !== "string" ||
      !applicationSections.some((section) => section.id === parsed.section)
    )
      return null;
    return {
      section: parsed.section as ApplicationSection,
      label: parsed.label,
      ...(typeof parsed.requestKey === "string"
        ? { requestKey: parsed.requestKey }
        : {}),
    };
  } catch {
    return null;
  }
}

export function writeConversationContext(
  applicationId: string,
  chatId: string,
  context: ConversationContext | null,
) {
  try {
    const key = storageKey(applicationId, chatId, "context");
    if (context) localStorage.setItem(key, JSON.stringify(context));
    else localStorage.removeItem(key);
  } catch {
    // Context is useful UI state, not application evidence.
  }
}
