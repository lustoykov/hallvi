import { controllerProtectionFacts } from "./controller-protection";
import { chatSnapshot } from "./pi-conversation";
import { chatStreamBaseline } from "./chat-stream-baseline";
import { deploymentStatus } from "./deployment-automation";
import { listExecutions } from "./operator-execution";
import { listSecrets } from "./application-secrets";
import { listInformation } from "./saved-information";
import { listApplicationChatSummaries } from "./db";
import { loadApplication, loadChat, repositoryAccess } from "./applications";
import { githubAppRegistration } from "./github-connection";
import type { OperatorMetadata, OperatorView } from "./types";

/**
 * The application page, projected from durable records: the selected
 * conversation, every conversation, and the records they share. Without a
 * selected chat, the first active conversation is shown.
 */
export async function getOperatorView(
  applicationId: string,
  chatId?: string,
): Promise<OperatorView> {
  const view = await getOperatorMetadata(applicationId, chatId);
  const conversation = view.selectedChatId
    ? await chatSnapshot(applicationId, view.selectedChatId)
    : null;
  return {
    ...view,
    ...(conversation && view.selectedChatId
      ? {
          chatStreamBaseline: chatStreamBaseline(
            applicationId,
            view.selectedChatId,
            conversation,
          ),
        }
      : {}),
    executions:
      conversation?.executions ?? (await listExecutions(applicationId)),
    piActivity: conversation?.piActivity ?? [],
    worker: conversation?.worker,
    messages: conversation?.messages ?? [],
    information:
      conversation?.information ??
      (await listInformation(applicationId, "", true)).filter(
        (r) => r.presentation,
      ),
  };
}

/** Keep non-chat facts current without reconstructing an unchanged history. */
export async function getOperatorMetadata(
  applicationId: string,
  chatId?: string,
): Promise<OperatorMetadata> {
  const application = chatId
    ? (await loadChat(applicationId, chatId)).application
    : await loadApplication(applicationId);
  const chats = await listApplicationChatSummaries(application.id);
  const selected =
    (chatId ? chats.find((chat) => chat.id === chatId) : null) ??
    chats.find((chat) => !chat.archivedAt) ??
    chats[0] ??
    null;
  const access = await repositoryAccess(application);
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
      signIn: Boolean(githubAppRegistration()),
    },
    chats,
    selectedChatId: selected?.id ?? null,
    secrets: listSecrets(application.id),
    deployment: await deploymentStatus(application.id),
    // Hallvi's own protection is the same fact for every application:
    // read from the controller's records, not from this application's.
    facts: { controllerProtection: controllerProtectionFacts() },
  };
}
