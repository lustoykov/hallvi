import type { HTMLAttributes } from "react";

type MessageRole = "user" | "assistant";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole;
};

export function Message({ className = "", from, ...props }: MessageProps) {
  return <article className={`sg-message sg-message-${from} ${className}`.trim()} {...props} />;
}

export function MessageContent({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`sg-message-content ${className}`.trim()} {...props} />;
}

export function MessageResponse({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`sg-message-response ${className}`.trim()} {...props} />;
}
