import { controllerProtectionFacts } from "./controller-protection";
import { listActivity } from "./pi-activity";
import { chatSnapshot } from "./pi-conversation";
import { listExecutions } from "./operator-execution";
import { listSecrets } from "./application-secrets";
import { listInformation } from "./saved-information";
import { listApplicationChatSummaries } from "./db";
import { loadApplication, loadChat, repositoryAccess } from "./applications";
import type { OperatorView } from "./types";

/**
 * The application page, projected from durable records: the selected
 * conversation, every conversation, and the records they share. Without a
 * selected chat, the first active conversation is shown.
 */
export async function getOperatorView(
  applicationId: string,
  chatId?: string,
): Promise<OperatorView> {
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
  // The selected conversation comes from Pi, with evidence placed into it.
  const conversation = selected
    ? await chatSnapshot(application.id, selected.id)
    : null;
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
    executions: conversation?.executions ?? listExecutions(applicationId),
    piActivity: conversation?.piActivity ?? listActivity(applicationId),
    worker: conversation?.worker,
    chats,
    selectedChatId: selected?.id ?? null,
    messages: conversation?.messages ?? [],
    information: listInformation(application.id, "", true).filter(
      (r) => r.presentation,
    ),
    secrets: listSecrets(application.id),
    // Hallvi's own protection is the same fact for every application:
    // read from the controller's records, not from this application's.
    facts: { controllerProtection: controllerProtectionFacts() },
  };
}
