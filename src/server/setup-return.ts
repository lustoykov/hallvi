import { getApplication, getChat } from "./db";

/**
 * Where setup sends the reader back to.
 *
 * A composer that cannot take a message points at Settings, and until now
 * nothing carried the reader home: they finished connecting ChatGPT and
 * landed on the applications list, holding a half-typed question about one
 * particular application.
 *
 * The link carries two record ids, never a URL. Both are looked up here and
 * the chat has to belong to the application, so the only destination that can
 * come out of this is a conversation that exists — an address typed into the
 * query string cannot become a redirect off this controller.
 */
export type SetupReturn = {
  href: string;
  label: string;
  query: string;
  firstRun?: { applicationId: string; chatId: string; name: string };
};

export function setupReturnDestination(params: {
  application?: string | string[];
  chat?: string | string[];
  onboarding?: string | string[];
}): SetupReturn | null {
  const applicationId = single(params.application);
  const chatId = single(params.chat);
  if (!applicationId || !chatId) return null;
  const application = getApplication(applicationId);
  const chat = getChat(chatId);
  if (!application || !chat || chat.applicationId !== application.id)
    return null;
  const firstRun =
    params.onboarding === "1" &&
    chat.kind === "main" &&
    !chat.archivedAt &&
    // Pi holds nothing for it yet: nobody has written in it.
    !chat.nativeSessionId;
  return {
    ...(firstRun
      ? {
          firstRun: {
            applicationId: application.id,
            chatId: chat.id,
            name: application.name,
          },
        }
      : {}),
    href: `/applications/${application.id}?chat=${chat.id}`,
    label: "Back to the conversation",
    // Carried from one Settings tab to the next, so connecting a second
    // account does not strand the reader away from their conversation.
    query: `?application=${application.id}&chat=${chat.id}${firstRun ? "&onboarding=1" : ""}`,
  };
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" && /^[\da-f-]{36}$/.test(value)
    ? value
    : null;
}
