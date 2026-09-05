"use client";

import { ArrowDown } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className = "", ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={`sg-conversation ${className}`.trim()}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export function ConversationContent({
  className = "",
  ...props
}: ConversationContentProps) {
  return <StickToBottom.Content className={className} {...props} />;
}

export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const handleClick = useCallback(() => scrollToBottom(), [scrollToBottom]);

  if (isAtBottom) return null;
  return (
    <button
      aria-label="Scroll to the latest message"
      className="sg-conversation-scroll"
      onClick={handleClick}
      type="button"
    >
      <ArrowDown weight="bold" />
    </button>
  );
}
