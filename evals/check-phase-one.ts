import type { Decision, PhaseOneOperatorView, PiTurnResult } from "../src/server/types";
import type { PhaseOneEvalCase } from "./phase-one-cases";

/** Exact structural/state checks only. Meaning is deliberately a separate review. */
export function checkPhaseOne(
  scenario: PhaseOneEvalCase,
  before: PhaseOneOperatorView,
  after: PhaseOneOperatorView,
  reply: PiTurnResult,
  priorDecisionHistory: Array<Decision | null>,
) {
  const proposals = reply.decisionProposals;
  const oldIds = new Set(before.decisions.map((decision) => decision.id));
  const added = after.decisions.filter((decision) => !oldIds.has(decision.id));
  const [user, assistant] = after.messages.slice(-2);
  const expectedReplacement = scenario.replacesExisting ? before.decisions[0]?.id : undefined;
  return {
    "expected proposal count": proposals.length === scenario.expectedProposals,
    "supported nonempty values": proposals.every((p) => p.kind === "launch-priority" && p.value.trim().length > 0 && p.value.length <= 300),
    "exact replacement target": scenario.replacesExisting
      ? Boolean(expectedReplacement) && proposals.length === 1 && proposals[0].replaces === expectedReplacement
      : proposals.every((p) => p.replaces === undefined),
    "one persisted message pair": after.messages.length === before.messages.length + 2
      && user?.role === "user" && user.body === scenario.message
      && assistant?.role === "assistant" && assistant.source === "pi" && assistant.body === reply.message
      && reply.message.trim().length > 0,
    "proposal persistence and provenance": added.length === proposals.length && added.every((d, index) =>
      d.sourceMessageId === user?.id && d.applicationId === before.application?.id
      && d.kind === proposals[index].kind && d.value === proposals[index].value),
    "prior Decisions preserved or superseded exactly": priorDecisionHistory.length === before.decisions.length
      && priorDecisionHistory.every((d, index) => d?.id === before.decisions[index].id
        && d.value === before.decisions[index].value
        && d.supersededById === (scenario.replacesExisting ? added[0]?.id : null))
      && after.decisions.length === before.decisions.length + added.length - (scenario.replacesExisting ? 1 : 0),
  };
}
