import type {
  Decision,
  PhaseOneOperatorView,
  PiTurnResult,
} from "../../src/server/types";
import type { PhaseOneEvalCase } from "./phase-one-cases";

/**
 * Exact structural/state checks only. Meaning is deliberately a separate
 * review.
 */
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
  const expectedReplacement = scenario.replacesExisting
    ? before.decisions[0]?.id
    : undefined;
  return {
    "repository evidence and gate results unchanged by chat":
      JSON.stringify(after.observations) ===
        JSON.stringify(before.observations) &&
      JSON.stringify(after.checks) === JSON.stringify(before.checks),
    "expected proposal count": proposals.length === scenario.expectedProposals,
    "supported nonempty values": proposals.every(
      (p) =>
        p.kind === "launch-priority" &&
        p.value.trim().length > 0 &&
        p.value.length <= 300,
    ),
    "exact replacement target": scenario.replacesExisting
      ? Boolean(expectedReplacement) &&
        proposals.length === 1 &&
        proposals[0].replaces === expectedReplacement
      : proposals.every((p) => p.replaces === undefined),
    "one persisted message pair":
      after.messages.length === before.messages.length + 2 &&
      user?.role === "user" &&
      user.body === scenario.message &&
      assistant?.role === "assistant" &&
      assistant.source === "pi" &&
      assistant.body === reply.message &&
      reply.message.trim().length > 0,
    "proposal persistence and provenance":
      added.length === proposals.length &&
      added.every(
        (d, index) =>
          d.sourceMessageId === user?.id &&
          d.applicationId === before.application?.id &&
          d.kind === proposals[index].kind &&
          d.value === proposals[index].value,
      ),
    "prior Decisions preserved or superseded exactly":
      priorDecisionHistory.length === before.decisions.length &&
      priorDecisionHistory.every(
        (d, index) =>
          d?.id === before.decisions[index].id &&
          d.value === before.decisions[index].value &&
          d.supersededById ===
            (scenario.replacesExisting ? added[0]?.id : null),
      ) &&
      after.decisions.length ===
        before.decisions.length +
          added.length -
          (scenario.replacesExisting ? 1 : 0),
  };
}

/**
 * Phase 2 checks: whether a contract was committed as expected, and that the
 * committed contract carries the expected conformance items, blockers and no
 * forbidden repository-declared values. Provenance itself was validated by
 * the commit; an invented citation could not have been saved.
 */
export function checkPhaseTwo(
  scenario: PhaseOneEvalCase,
  before: PhaseOneOperatorView,
  after: PhaseOneOperatorView,
) {
  const expected = scenario.phaseTwo!;
  const previous = before.contract?.version ?? 0;
  const contract = after.contract;
  const committed = contract !== null && contract.version === previous + 1;
  const declared = (field: string) =>
    contract?.body.fields.find((item) => item.key === field);
  return {
    "contract committed as expected":
      expected.expectedContract === "any"
        ? contract === null || contract.version === previous || committed
        : expected.expectedContract === 1
          ? committed
          : contract === null || contract.version === previous,
    "expected conformance items recorded": (expected.conformance ?? []).every(
      (field) =>
        !committed ||
        contract.gaps.conformance.some((gap) => gap.field === field),
    ),
    "expected blockers recorded": (expected.blockers ?? []).every(
      (field) =>
        !committed || contract.gaps.blockers.some((gap) => gap.field === field),
    ),
    "no forbidden repository-declared values": (
      expected.forbiddenDeclared ?? []
    ).every((item) => {
      const field = declared(item.field);
      return !(
        field &&
        field.value === item.value &&
        field.provenance.kind === "repository-declared"
      );
    }),
    "every cited file read belongs to this application":
      contract === null ||
      contract.body.fields.every((field) => {
        const citation =
          "citation" in field.provenance ? field.provenance.citation : null;
        if (!citation || "absent" in citation) return true;
        return after.observations.some(
          (observation) => observation.id === citation.observationId,
        );
      }),
  };
}

/** Exact structural checks for Phase 3 cases; meaning is reviewed
 * separately. */
export function checkPhaseThree(
  scenario: PhaseOneEvalCase,
  before: PhaseOneOperatorView,
  after: PhaseOneOperatorView,
) {
  const expected = scenario.phaseThree!;
  const proposal = after.conformance?.proposal ?? null;
  const saved =
    proposal !== null && proposal.id !== before.conformance?.proposal?.id;
  const acceptance =
    after.conformance?.proposedAcceptance ??
    after.conformance?.acceptance ??
    null;
  const previews = (after.conformance?.runs ?? []).filter(
    (run) => run.kind === "preview",
  ).length;
  return {
    "source change saved as expected":
      expected.expectedSourceChange === "any"
        ? true
        : expected.expectedSourceChange === 1
          ? saved
          : !saved,
    "every expected field mapped": (expected.mappedFields ?? []).every(
      (field) =>
        !saved || proposal.mapping.some((entry) => entry.field === field),
    ),
    "no forbidden path changed": (expected.forbiddenPaths ?? []).every(
      (path) =>
        !proposal || !proposal.changes.some((change) => change.path === path),
    ),
    "behavior checks saved as expected":
      expected.expectedAcceptance === undefined ||
      expected.expectedAcceptance === "any"
        ? true
        : expected.expectedAcceptance === 1
          ? acceptance !== null
          : acceptance === null,
    "preview runs as expected":
      expected.expectedPreview === undefined ||
      expected.expectedPreview === "any"
        ? true
        : expected.expectedPreview === 1
          ? previews > 0
          : previews === 0,
    "nothing published or merged by the turn":
      !proposal ||
      (proposal.publication === null && proposal.candidate === null),
  };
}
