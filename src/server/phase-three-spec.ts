import { PHASES } from "./phase-one-spec";
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import type { ConformanceView, EvidenceReference, GateCheck } from "./types";

export const PHASE_THREE = PHASES[2];

export const PHASE_THREE_CHECKS = [
  {
    key: "candidate-identified",
    label: "Exact candidate revision identified",
    definition:
      "One immutable repository commit is recorded as the conformance candidate. When a pull request was needed, this is the merged target revision observed on the default branch, never an unmerged head.",
  },
  {
    key: "changes-resolved",
    label: "Required source changes resolved",
    definition:
      "Every conformance item recorded on the Application Contract is mapped to a change, the candidate contains exactly the reviewed change, and nothing outside the allowed scope was touched. Unmerged or unexpected changes keep this check unsatisfied.",
  },
  {
    key: "conformance-passed",
    label: "Profile conformance checks pass for the exact candidate",
    definition:
      "Server Guy's runner executed every required check of the current check-set version, including the accepted application-behavior check, against the exact candidate with the current contract, and every required check passed. Previews, worker self-reports and unrun checks never satisfy it.",
  },
] as const;

export function phaseThreeCheckListForPrompt() {
  return PHASE_THREE_CHECKS.map(
    (check, index) => `${index + 1}. ${check.label}.`,
  ).join("\n");
}

const REFRESH = {
  key: "conformance-refresh" as const,
  label: "Refresh from GitHub",
};
const VERIFY = {
  key: "conformance-verify" as const,
  label: "Verify candidate",
};
const RERUN = {
  key: "conformance-verify" as const,
  label: "Run conformance checks again",
};

type Result = Omit<GateCheck, "key" | "label" | "definition">;

function proposalEvidence(view: ConformanceView): EvidenceReference[] {
  const { proposal } = view;
  return proposal
    ? [
        {
          recordType: "conformance-proposal",
          recordId: proposal.id,
          role:
            proposal.origin === "no-change"
              ? "No-change candidate"
              : proposal.origin === "external"
                ? "Returned change"
                : "Proposed change",
          label: proposal.summary.slice(0, 120),
          href: `/api/conformance/proposals/${proposal.id}`,
          observedAt: proposal.createdAt,
        },
      ]
    : [];
}

function runEvidence(view: ConformanceView): EvidenceReference[] {
  const run = view.latestCandidateRun;
  return run
    ? [
        {
          recordType: "conformance-run",
          recordId: run.id,
          role: "Conformance run",
          label: run.summary.slice(0, 120),
          href: `/api/conformance/runs/${run.id}`,
          observedAt: run.finishedAt ?? run.createdAt,
        },
      ]
    : [];
}

/**
 * Evaluates the Phase 3 Exit Gate from current records. Like the earlier
 * phases, results are projections: an unmerged pull request, a preview over a
 * working tree, a stale contract or check-set version, or a run over another
 * commit never satisfies a check.
 */
export function computePhaseThreeChecks(view: ConformanceView): GateCheck[] {
  const { proposal, retained, latestCandidateRun: run } = view;
  const short = (sha: string | null | undefined) =>
    sha?.slice(0, 8) ?? "unknown";
  const blockedByContract: Result | null = view.contractBlocked
    ? {
        status: "blocked",
        result: view.contractBlocked,
        evidence: [],
        rerun: null,
      }
    : null;

  const candidate: Result =
    blockedByContract ??
    (!retained
      ? {
          status: "not-yet",
          result: "Complete Inspect app first.",
          evidence: [],
          rerun: null,
        }
      : !proposal
        ? {
            status: "not-yet",
            result: view.brief?.requiredChanges.length
              ? "No change is proposed yet. Continue with Server Guy, or work externally from the exported brief."
              : "No candidate is selected yet. The contract records no required changes: verify the current revision, or continue with Server Guy to confirm.",
            evidence: [],
            rerun: null,
          }
        : proposal.candidate
          ? {
              status: "passed",
              result: `${short(proposal.candidate.sha)} on ${proposal.candidate.defaultBranch} · ${
                proposal.candidate.source === "merged-pull-request"
                  ? `merged pull request #${proposal.candidate.merge?.pullRequestNumber}`
                  : proposal.candidate.source === "external"
                    ? "returned change merged"
                    : "the contract commit, no change required"
              }`,
              evidence: proposalEvidence(view),
              rerun: REFRESH,
            }
          : proposal.status === "published" || proposal.external
            ? {
                status: "not-yet",
                result:
                  proposal.external && !proposal.external.pullRequestNumber
                    ? `The returned revision ${short(proposal.external.headSha)} is not on the default branch yet; merge it, then refresh.`
                    : `Pull request ${proposal.publication?.pullRequestUrl ?? proposal.external?.pullRequestUrl ?? ""} is open: an unmerged head gets preview results only. Merge it on GitHub, then refresh.`,
                evidence: proposalEvidence(view),
                rerun: REFRESH,
              }
            : proposal.status === "approved"
              ? {
                  status: "not-yet",
                  result: proposal.publicationError
                    ? `Publication did not complete: ${proposal.publicationError} Retry publishing.`
                    : "The change is approved and waiting to be published as a branch and pull request.",
                  evidence: proposalEvidence(view),
                  rerun: null,
                }
              : {
                  status: "not-yet",
                  result:
                    "A change is proposed and waits for review. Approve it to publish a reviewable pull request, or withdraw it.",
                  evidence: proposalEvidence(view),
                  rerun: null,
                });

  const requiredChanges = view.brief?.requiredChanges ?? [];
  const changes: Result =
    blockedByContract ??
    (!retained
      ? {
          status: "not-yet",
          result: "Complete Inspect app first.",
          evidence: [],
          rerun: null,
        }
      : !proposal
        ? {
            status: "not-yet",
            result: requiredChanges.length
              ? `${requiredChanges.length} required change${requiredChanges.length === 1 ? "" : "s"} recorded on the contract: ${requiredChanges.map((item) => item.label).join(", ")}.`
              : "The contract records no required changes.",
            evidence: [],
            rerun: null,
          }
        : (() => {
            const unmapped = requiredChanges.filter(
              (item) =>
                !proposal.mapping.some((entry) => entry.field === item.field),
            );
            if (proposal.origin !== "no-change" && unmapped.length)
              return {
                status: "blocked" as const,
                result: `The change does not map every required change: ${unmapped.map((item) => item.label).join(", ")}. Ask Server Guy for a complete change or withdraw this one.`,
                evidence: proposalEvidence(view),
                rerun: null,
              };
            if (proposal.origin === "no-change" && requiredChanges.length)
              return {
                status: "blocked" as const,
                result: `The contract records ${requiredChanges.length} required change${requiredChanges.length === 1 ? "" : "s"}; a no-change candidate cannot resolve them.`,
                evidence: proposalEvidence(view),
                rerun: null,
              };
            if (proposal.verification && !proposal.verification.scope.ok)
              return {
                status: "blocked" as const,
                result: `Out-of-scope changes: ${proposal.verification.scope.violations.join("; ")}. They block until a reviewed replacement.`,
                evidence: proposalEvidence(view),
                rerun: REFRESH,
              };
            if (!proposal.candidate)
              return {
                status: "not-yet" as const,
                result:
                  proposal.origin === "no-change"
                    ? "Select the current revision as the candidate."
                    : "The change is not on the default branch yet; it stays unresolved until the pull request is merged.",
                evidence: proposalEvidence(view),
                rerun:
                  proposal.status === "published" || proposal.external
                    ? REFRESH
                    : null,
              };
            if (proposal.origin === "no-change")
              return {
                status: "passed" as const,
                result:
                  "No source change is required; the candidate is the contract commit.",
                evidence: proposalEvidence(view),
                rerun: null,
              };
            if (!proposal.verification)
              return {
                status: "not-yet" as const,
                result:
                  "The merged candidate has not been compared with the reviewed change yet. Refresh from GitHub.",
                evidence: proposalEvidence(view),
                rerun: REFRESH,
              };
            if (proposal.verification.candidateSha !== proposal.candidate.sha)
              return {
                status: "not-yet" as const,
                result:
                  "The candidate moved since it was compared with the reviewed change. Refresh from GitHub.",
                evidence: proposalEvidence(view),
                rerun: REFRESH,
              };
            if (!proposal.verification.changesComplete)
              return {
                status: "blocked" as const,
                result: `The candidate does not contain the reviewed change exactly: ${proposal.verification.differences.join("; ")}. A reviewed replacement is needed.`,
                evidence: proposalEvidence(view),
                rerun: REFRESH,
              };
            return {
              status: "passed" as const,
              result: `${proposal.changes.length} file${proposal.changes.length === 1 ? "" : "s"} changed within scope · every required change mapped · present at ${short(proposal.candidate.sha)}`,
              evidence: proposalEvidence(view),
              rerun: REFRESH,
            };
          })());

  const conformance: Result =
    blockedByContract ??
    (!retained
      ? {
          status: "not-yet",
          result: "Complete Inspect app first.",
          evidence: [],
          rerun: null,
        }
      : !proposal?.candidate
        ? {
            status: "not-yet",
            result: view.latestPreview
              ? `Only preview results exist (${view.latestPreview.status} over tree ${view.latestPreview.source.treeDigest.slice(0, 8)}); previews never satisfy this check. Conformance runs against the exact candidate once it is identified.`
              : "Conformance checks run against the exact candidate once it is identified.",
            evidence: [],
            rerun: null,
          }
        : !view.acceptance
          ? {
              status: "blocked",
              result: view.proposedAcceptance
                ? `No accepted application-behavior check: version ${view.proposedAcceptance.version} is proposed and waits for your acceptance. A health response alone is not sufficient.`
                : "No application-behavior check has been established from the repository's routes. Ask Server Guy to propose one; a health response alone is not sufficient.",
              evidence: [],
              rerun: null,
            }
          : !run || run.source.commitSha !== proposal.candidate.sha
            ? {
                status: "not-yet",
                result: `No conformance run for candidate ${short(proposal.candidate.sha)} yet.`,
                evidence: run ? runEvidence(view) : [],
                rerun: VERIFY,
              }
            : run.status === "queued" || run.status === "running"
              ? {
                  status: "not-yet",
                  result: `Conformance checks are ${run.status} for ${short(run.source.commitSha)}.`,
                  evidence: runEvidence(view),
                  rerun: null,
                }
              : run.contractId !== retained.contractId ||
                  run.contractVersion !==
                    (view.brief?.contract.version ??
                      retained.contractVersion) ||
                  run.definitionVersion !== CONFORMANCE_DEFINITION.version ||
                  run.acceptanceChecksId !== view.acceptance.id
                ? {
                    status: "not-yet",
                    result: `The last run is stale: it was bound to contract v${run.contractVersion}, check set v${run.definitionVersion} and acceptance checks ${run.acceptanceChecksVersion ? `v${run.acceptanceChecksVersion}` : "none"}. Run the checks again.`,
                    evidence: runEvidence(view),
                    rerun: RERUN,
                  }
                : run.status === "passed"
                  ? {
                      status: "passed",
                      result: `${run.results.filter((item) => item.outcome === "passed").length} passed, ${run.results.filter((item) => item.outcome === "not-applicable").length} not applicable with evidence · check set v${run.definitionVersion} · ${short(run.source.commitSha)}`,
                      evidence: runEvidence(view),
                      rerun: RERUN,
                    }
                  : {
                      status: "blocked",
                      result:
                        run.status === "failed"
                          ? `Failed: ${
                              run.results
                                .filter((item) => item.outcome === "failed")
                                .map(
                                  (item) => `${item.label} (${item.summary})`,
                                )
                                .join("; ") ||
                              run.error ||
                              "see the run"
                            }${run.results.some((item) => item.outcome === "not-run") ? " · later checks not run" : ""}`
                          : `The last run ended ${run.status}${run.error ? `: ${run.error}` : ""}. Unrun checks cannot pass this gate.`,
                      evidence: runEvidence(view),
                      rerun: RERUN,
                    });

  const values = {
    "candidate-identified": candidate,
    "changes-resolved": changes,
    "conformance-passed": conformance,
  } satisfies Record<(typeof PHASE_THREE_CHECKS)[number]["key"], Result>;
  return PHASE_THREE_CHECKS.map((check) => ({
    ...check,
    ...values[check.key],
  }));
}
