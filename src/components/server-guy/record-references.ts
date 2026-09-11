// Which saved records a reply produced, so the transcript can point at them
// ("Saved from this reply: Saved requirement") without carrying a second set
// of controls. Pure over the application view.
import type { OperatorView } from "@/server/types";

export interface RecordReference {
  key: string;
  label: string;
  status: string;
  tone: "current" | "waiting" | "done" | "replaced";
}

/**
 * References keyed by the assistant message they belong under. A record's
 * source message is the request that produced it, so its reference sits under
 * the first reply from that request onwards.
 */
export function recordReferences(
  view: OperatorView,
): Map<string, RecordReference[]> {
  const references = new Map<string, RecordReference[]>();
  for (const decision of view.decisions) {
    const index = view.messages.findIndex(
      (message) => message.id === decision.sourceMessageId,
    );
    const reply =
      index < 0
        ? undefined
        : view.messages
            .slice(index)
            .find((message) => message.role === "assistant");
    if (!reply) continue;
    references.set(reply.id, [
      ...(references.get(reply.id) ?? []),
      {
        key: `decision:${decision.id}`,
        label: "Saved requirement",
        status: "current",
        tone: "current",
      },
    ]);
  }
  return references;
}
