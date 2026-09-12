import {
  listActiveDecisions,
  listActivity,
  listApplicationChatSummaries,
  listMessages,
} from "./db";
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
    application,
    repository: {
      status: access.status,
      result: access.result,
      checkedAt: access.current
        ? (access.observation?.observedAt ?? null)
        : null,
      connected: access.connected,
    },
    operations: [],
    chats,
    selectedChatId: selected?.id ?? null,
    messages: selected ? listMessages(selected.id) : [],
    decisions: listActiveDecisions(application.id),
    activity: listActivity(application.id),
  };
}
