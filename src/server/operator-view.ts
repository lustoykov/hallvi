import { listExecutions } from "./operator-execution";
import { listInformation } from "./saved-information";
import { listApplicationChatSummaries, listMessages } from "./db";
import { loadApplication, loadChat, repositoryAccess } from "./applications";
import type { OperatorView } from "./types";

/**
 * The application page, projected from durable records: the selected
 * conversation, every conversation, and the records they share. Without a
 * selected chat, the first active conversation is shown.
 */
export function getOperatorView(
  applicationId: string,
  chatId?: string,
): OperatorView {
  const application = chatId
    ? loadChat(applicationId, chatId).application
    : loadApplication(applicationId);
  const chats = listApplicationChatSummaries(application.id);
  const selected =
    (chatId ? chats.find((chat) => chat.id === chatId) : null) ??
    chats.find((chat) => !chat.archivedAt) ??
    chats[0] ??
    null;
  const access = repositoryAccess(application);
  return {
    application: {
      id: application.id,
      name: application.name,
      repositoryUrl: application.repositoryUrl,
      repositoryOwner: application.repositoryOwner,
      repositoryName: application.repositoryName,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    },
    repository: {
      status: access.status,
      result: access.result,
      checkedAt: access.current
        ? (access.observation?.observedAt ?? null)
        : null,
      connected: access.connected,
    },
    executions: listExecutions(applicationId),
    operations: [],
    chats,
    selectedChatId: selected?.id ?? null,
    messages: selected ? listMessages(selected.id) : [],
    decisions: [],
    information: listInformation(application.id, "", true).filter(
      (r) => r.presentation,
    ),
    activity: [],
  };
}
