import type { SavedInformation } from "@/server/operator-data";
import type { ChatMessage } from "@/server/types";
import type { ExecutionRecord } from "@/server/operator-execution";

const PREFIX = "Reconnect the saved private route.\n";

export function reconnectRequest(record: SavedInformation) {
  return `${PREFIX}${JSON.stringify({ accessRecordId: record.id, expectedUpdatedAt: record.updatedAt })}
Use open_server_port with exactly those saved-route arguments. Reopen only this established private connection, preserving its saved host, ports and URL. Report the controller HTTP status and check time.
Do not use the explicit-port form or fall back to a different route. Do not modify the saved record or attached connection, publish access, restart services, or repair the application. If access fails or the route changed, report that result and stop; investigation needs a separate request.`;
}

export function reconnectReference(message: string) {
  if (!message.startsWith(PREFIX)) return null;
  try {
    const value = JSON.parse(message.slice(PREFIX.length).split("\n")[0]);
    return typeof value.accessRecordId === "string" &&
      typeof value.expectedUpdatedAt === "string"
      ? (value as { accessRecordId: string; expectedUpdatedAt: string })
      : null;
  } catch {
    return null;
  }
}

/** Derive progress from the existing request, reply and execution evidence. */
export function reconnectProgress(
  messages: ChatMessage[],
  executions: ExecutionRecord[],
  record: SavedInformation | undefined,
) {
  const request = messages.findLast(
    (message) => message.role === "user" && reconnectReference(message.body),
  );
  if (!request) return null;
  const reply = messages.findLast(
    (message) => message.responseTo === request.id,
  );
  const ids =
    reply?.blocks?.flatMap((block) =>
      block.type === "execution" ? [block.id] : [],
    ) ?? [];
  const calls = executions.filter((execution) => ids.includes(execution.id));
  const pending = calls.find((call) => call.status === "awaiting-approval");
  const failed = calls.find((call) => call.status === "failed");
  const declined = calls.find((call) => call.status === "declined");
  const interrupted = calls.find((call) => call.status === "interrupted");
  const done = Boolean(
    reply?.finishedAt || ["cancelled", "interrupted"].includes(request.status),
  );
  const ref = reconnectReference(request.body)!;
  // An in-flight request still owns the action if the saved record changes.
  // A historical result cannot describe the replacement route.
  if (
    done &&
    (ref.accessRecordId !== record?.id ||
      ref.expectedUpdatedAt !== record.updatedAt)
  )
    return null;
  const active = !done;
  let observation: string | null = null;
  for (const call of calls) {
    if (call.tool !== "open_server_port" || call.status !== "succeeded")
      continue;
    try {
      const result = JSON.parse(call.output);
      if (
        result.accessRecordId !== ref.accessRecordId ||
        result.url !== record?.presentation?.url
      )
        continue;
      const at = new Date(result.checkedAt);
      if (!Number.isFinite(at.getTime())) continue;
      const time = at.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (result.httpStatus === null)
        observation = `Private connection opened; the application did not answer the controller check at ${time}.`;
      else if (Number.isInteger(result.httpStatus))
        observation = `Private connection opened. Controller HTTP ${result.httpStatus} at ${time}.`;
    } catch {
      /* A missing result cannot establish an HTTP observation. */
    }
  }
  const text = pending
    ? "Reconnect is awaiting approval."
    : declined
      ? "Reconnect was declined."
      : interrupted ||
          reply?.status === "interrupted" ||
          request.status === "interrupted"
        ? "Reconnect was interrupted. Check Main operator before continuing."
        : failed || reply?.status === "failed"
          ? "Reconnect could not open this connection."
          : request.status === "cancelled"
            ? "The reconnect request was cancelled."
            : request.status === "waiting"
              ? "Reconnect is queued in Main operator."
              : done
                ? (observation ??
                  "Reconnect finished. See the recorded result in Main operator.")
                : "Pi is reconnecting the saved private route.";
  return { active, text, replyId: reply?.id ?? request.id };
}
