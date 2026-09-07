import {
  getApplication,
  getChat,
  getWorkspaceById,
  listWorkspaces,
} from "./db";
import { PHASES } from "./phase-one-spec";
import type {
  ApplicationRecord,
  Chat,
  PhaseKey,
  PhaseWorkspaceRecord,
} from "./types";

export class ExistingApplicationConflictError extends Error {}
export class NotFoundError extends Error {}

export function phaseDefinition(key: PhaseKey) {
  return PHASES.find((phase) => phase.key === key)!;
}

/** The primary Chat of each phase carries its deliverable's name. */
export function primaryChatTitle(key: PhaseKey) {
  return phaseDefinition(key).deliverable;
}

export function currentWorkspace(workspaces: PhaseWorkspaceRecord[]) {
  return (
    workspaces.find((workspace) => !workspace.completedAt) ?? workspaces.at(-1)
  );
}

/**
 * An application with every phase workspace it has. The current workspace is
 * the earliest unfinished phase; later work pauses during a correction.
 */
export function loadApplication(applicationId: string): {
  application: ApplicationRecord;
  workspaces: PhaseWorkspaceRecord[];
  current: PhaseWorkspaceRecord;
} {
  const application = getApplication(applicationId);
  const workspaces = application ? listWorkspaces(application.id) : [];
  const current = currentWorkspace(workspaces);
  if (!application || !current)
    throw new NotFoundError("Application not found.");
  return { application, workspaces, current };
}

export function loadChat(applicationId: string, chatId: string) {
  const { application, workspaces, current } = loadApplication(applicationId);
  const chat = getChat(chatId);
  const workspace = chat ? getWorkspaceById(chat.workspaceId) : null;
  if (!chat || !workspace || workspace.applicationId !== application.id)
    throw new NotFoundError("Chat not found.");
  return {
    application,
    workspaces,
    workspace,
    chat,
    current: workspace.id === current.id,
  };
}

/** Why a chat cannot accept new work, or null when it can. */
export function chatReadOnlyReason(
  chat: Chat,
  workspace: PhaseWorkspaceRecord,
) {
  if (chat.archivedAt) return "This Chat is archived.";
  if (workspace.completedAt)
    return `Phase ${phaseDefinition(workspace.phaseKey).number} is complete; its chats are read-only.`;
  if (
    currentWorkspace(listWorkspaces(workspace.applicationId))?.id !==
    workspace.id
  )
    return "An earlier phase is being reviewed. Complete it before continuing here.";
  return null;
}

export function assertChatWritable(
  chat: Chat,
  workspace: PhaseWorkspaceRecord,
) {
  const reason = chatReadOnlyReason(chat, workspace);
  if (reason) throw new Error(reason);
}
