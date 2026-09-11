// PROTOTYPE · claude/deployment-history · throwaway.
// The one next step the Deployment page offers for each state. Every step
// goes to the conversation: a draft to send, or the message to answer.

import type { DeploymentStory } from "./deployment-model";

export interface NextStep {
  label: string;
  /** Drafts a message, rather than opening one. */
  ask: boolean;
  run: () => void;
}

export function nextStep(
  story: DeploymentStory,
  onAsk: (draft: string) => void,
  onOpenConversation: (chatId: string, messageId: string | null) => void,
): NextStep | null {
  const chat = story.chat;
  switch (story.state) {
    case "live":
      return {
        label: "Release an update",
        ask: true,
        run: () => onAsk(`Release the latest revision of ${story.repository}.`),
      };
    case "awaiting":
      return chat
        ? {
            label: "Review and approve",
            ask: false,
            run: () => onOpenConversation(chat.chatId, chat.messageId),
          }
        : null;
    case "failed":
      return {
        label: "Ask Server Guy to look into it",
        ask: true,
        run: () =>
          onAsk("Find out why the latest deployment stopped, and fix it."),
      };
    case "working":
      return chat
        ? {
            label: "Follow in the conversation",
            ask: false,
            run: () => onOpenConversation(chat.chatId, chat.messageId),
          }
        : null;
    case "unknown":
      return {
        label: "Ask Server Guy to check it",
        ask: true,
        run: () => onAsk(`Check what is running for ${story.name} now.`),
      };
    default:
      return null;
  }
}
