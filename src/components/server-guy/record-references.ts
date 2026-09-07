// Which saved records a reply produced, so the transcript can point at the
// Record ("Saved from this reply: Proposed change · replaced") without
// carrying a second set of controls. Pure over the Operator View.
import type { OperatorView } from "@/server/types";

export type RecordSection =
  | "checks"
  | "contract"
  | "change"
  | "runs"
  | "environment"
  | "history"
  | "requirements";

export interface RecordReference {
  key: string;
  label: string;
  status: string;
  tone: "current" | "waiting" | "done" | "replaced";
  section: RecordSection;
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
  const add = (sourceMessageId: string | null, reference: RecordReference) => {
    const index = sourceMessageId
      ? view.messages.findIndex((message) => message.id === sourceMessageId)
      : -1;
    if (index < 0) return;
    const reply = view.messages
      .slice(index)
      .find((message) => message.role === "assistant");
    if (!reply) return;
    references.set(reply.id, [...(references.get(reply.id) ?? []), reference]);
  };

  for (const decision of view.decisions)
    add(decision.sourceMessageId, {
      key: `decision:${decision.id}`,
      label: "Saved requirement",
      status: "current",
      tone: "current",
      section: "requirements",
    });

  if (view.contract)
    add(view.contract.sourceMessageId, {
      key: `contract:${view.contract.id}`,
      label: `Application Contract v${view.contract.version}`,
      status: "current",
      tone: "current",
      section: "contract",
    });

  const conformance = view.conformance;
  if (conformance) {
    for (const proposal of conformance.proposals) {
      const current = conformance.proposal?.id === proposal.id;
      const status =
        !current || proposal.status === "superseded"
          ? "replaced"
          : proposal.status === "withdrawn"
            ? "withdrawn"
            : proposal.candidate
              ? "merged"
              : proposal.status === "published"
                ? "published"
                : proposal.status === "approved"
                  ? "approved"
                  : "waiting for your approval";
      add(proposal.sourceMessageId, {
        key: `proposal:${proposal.id}`,
        label:
          proposal.origin === "no-change"
            ? "No change required"
            : proposal.origin === "external"
              ? "Returned change"
              : "Proposed change",
        status,
        tone:
          status === "replaced" || status === "withdrawn"
            ? "replaced"
            : status === "waiting for your approval"
              ? "waiting"
              : "done",
        section: "change",
      });
    }
    const acceptance = conformance.proposedAcceptance ?? conformance.acceptance;
    if (acceptance)
      add(acceptance.sourceMessageId, {
        key: `acceptance:${acceptance.id}`,
        label: `Behavior checks v${acceptance.version}`,
        status:
          acceptance.status === "accepted"
            ? "accepted"
            : "waiting for your acceptance",
        tone: acceptance.status === "accepted" ? "done" : "waiting",
        section: "change",
      });
  }
  return references;
}
