import { contractGapReport } from "./application-contract";
import { PHASES } from "./phase-one-spec";
import type {
  ApplicationContractView,
  EvidenceReference,
  GateCheck,
  Observation,
  ProfileResolution,
} from "./types";

export const PHASE_TWO = PHASES[1];

export const PHASE_TWO_CHECKS = [
  {
    key: "profile-resolved",
    label: "Supported application profile",
    definition:
      "Server Guy inspected the repository at an exact commit and matched it to one supported Application Profile. An unmatched or ambiguous repository cannot advance; the criteria say what was found.",
  },
  {
    key: "contract-complete",
    label: "Application Contract complete",
    definition:
      "Every material field the profile requires is present in the current Application Contract, built from the latest inspection commit and the current profile version. Unknown values are recorded as explicit gaps, never omitted.",
  },
  {
    key: "contract-provenance",
    label: "Every field has a source",
    definition:
      "Each field is labeled repository-declared, profile rule, your choice, inferred or unresolved, and its cited source still resolves: the file that was read, the profile rule, your message or the saved requirement.",
  },
  {
    key: "contract-gaps",
    label: "No unresolved contract gaps",
    definition:
      "No required value is unknown, contradictory or unsupported. Known code changes are recorded as conformance work for Phase 3 and do not block; open product policies stay visible until the later gates that need them.",
  },
] as const;

export function phaseTwoCheckListForPrompt() {
  return PHASE_TWO_CHECKS.map(
    (check, index) => `${index + 1}. ${check.label}.`,
  ).join("\n");
}

function observationEvidence(
  observation: Observation,
  role: string,
): EvidenceReference {
  return {
    recordType: "observation",
    recordId: observation.id,
    role,
    label: observation.sourceLabel,
    href: `/api/observations/${observation.id}`,
    observedAt: observation.observedAt,
  };
}

function contractEvidence(
  contract: ApplicationContractView,
): EvidenceReference {
  return {
    recordType: "contract",
    recordId: contract.id,
    role: `Application Contract v${contract.version}`,
    label: "Application Contract",
    href: `/api/contracts/${contract.id}`,
    observedAt: contract.createdAt,
  };
}

const INSPECT = {
  key: "repository-inspection" as const,
  label: "Inspect repository",
};
const REINSPECT = {
  key: "repository-inspection" as const,
  label: "Re-inspect repository",
};

/**
 * Evaluates the Phase 2 Exit Gate from current records. Like the Phase 1
 * evaluation, results are projections: never stored, and never satisfied by
 * an inspection made with a previous GitHub connection, a contract built at a
 * different commit, or a source that no longer resolves.
 */
export function computePhaseTwoChecks(input: {
  inspection: Observation | null;
  /** Made with the current GitHub connection. */
  inspectionCurrent: boolean;
  githubConnected: boolean;
  resolution: ProfileResolution;
  contract: ApplicationContractView | null;
}): GateCheck[] {
  const { inspection, resolution, contract } = input;
  const inspectionEvidence = inspection
    ? [observationEvidence(inspection, "Latest repository inspection")]
    : [];
  const commit =
    inspection?.raw &&
    typeof inspection.raw === "object" &&
    "commitSha" in inspection.raw
      ? String(inspection.raw.commitSha)
      : null;
  const short = (sha: string | null) => sha?.slice(0, 8) ?? "unknown";

  const profile: Omit<GateCheck, "key" | "label" | "definition"> = !inspection
    ? {
        status: "not-yet",
        result: input.githubConnected
          ? "Inspect the repository to resolve its profile."
          : "Connect GitHub, then inspect the repository.",
        evidence: [],
        rerun: INSPECT,
      }
    : !input.inspectionCurrent
      ? {
          status: "not-yet",
          result:
            "Re-inspect the repository with your current GitHub connection; the last inspection used a previous login.",
          evidence: inspectionEvidence,
          rerun: REINSPECT,
        }
      : inspection.status === "failed"
        ? {
            status: "blocked",
            result: inspection.summary,
            evidence: inspectionEvidence,
            rerun: REINSPECT,
          }
        : inspection.status === "unavailable"
          ? {
              status: "not-yet",
              result: inspection.summary,
              evidence: inspectionEvidence,
              rerun: REINSPECT,
            }
          : resolution.status === "matched"
            ? {
                status: "passed",
                result: `${resolution.label} v${resolution.profileVersion} · ${short(commit)}`,
                evidence: inspectionEvidence,
                rerun: REINSPECT,
              }
            : {
                status: "blocked",
                result:
                  resolution.reason ??
                  `${resolution.label} did not match this repository.`,
                evidence: inspectionEvidence,
                rerun: REINSPECT,
              };

  const profilePassed = profile.status === "passed";
  const complete: Omit<GateCheck, "key" | "label" | "definition"> =
    !profilePassed
      ? {
          status: "not-yet",
          result: "Resolve the application profile first.",
          evidence: [],
          rerun: null,
        }
      : !contract
        ? {
            status: "not-yet",
            result:
              "No Application Contract yet. Ask Server Guy to propose it from the inspected repository.",
            evidence: inspectionEvidence,
            rerun: null,
          }
        : contract.commitSha !== commit
          ? {
              status: "blocked",
              result: `The repository changed since the contract was built (${short(contract.commitSha)} → ${short(commit)}). Ask Server Guy to revise the contract.`,
              evidence: [contractEvidence(contract), ...inspectionEvidence],
              rerun: null,
            }
          : contract.profileId !== resolution.profileId ||
              contract.profileVersion !== resolution.profileVersion
            ? {
                status: "blocked",
                result: `The profile definition changed (${contract.profileId} v${contract.profileVersion} → ${resolution.profileId} v${resolution.profileVersion}). Ask Server Guy to revise the contract.`,
                evidence: [contractEvidence(contract), ...inspectionEvidence],
                rerun: null,
              }
            : {
                status: "passed",
                result: `Application Contract v${contract.version} · ${contract.body.fields.length} fields · ${short(contract.commitSha)}`,
                evidence: [contractEvidence(contract), ...inspectionEvidence],
                rerun: null,
              };

  const contractCurrent = complete.status === "passed" && contract;
  const provenance: Omit<GateCheck, "key" | "label" | "definition"> =
    !contractCurrent
      ? {
          status: "not-yet",
          result: contract
            ? "Bring the Application Contract up to date first."
            : "Provenance is checked once a contract exists.",
          evidence: contract ? [contractEvidence(contract)] : [],
          rerun: null,
        }
      : contract.provenanceIssues.length
        ? {
            status: "blocked",
            result: `${contract.provenanceIssues.length} field${contract.provenanceIssues.length === 1 ? "" : "s"} cite a source that no longer resolves: ${contract.provenanceIssues
              .slice(0, 3)
              .map((issue) => `${issue.field} (${issue.reason})`)
              .join(
                "; ",
              )}${contract.provenanceIssues.length > 3 ? "; …" : ""}.`,
            evidence: [contractEvidence(contract)],
            rerun: null,
          }
        : {
            status: "passed",
            result: `Every field cites a current source: ${describeProvenance(contract)}.`,
            evidence: [contractEvidence(contract)],
            rerun: null,
          };

  const gaps = contract ? contractGapReport(contract.body) : null;
  const unresolved: Omit<GateCheck, "key" | "label" | "definition"> =
    !contractCurrent || !gaps
      ? {
          status: "not-yet",
          result: contract
            ? "Gaps are evaluated against an up-to-date contract."
            : "Gaps are listed once a contract exists.",
          evidence: contract ? [contractEvidence(contract)] : [],
          rerun: null,
        }
      : gaps.blockers.length
        ? {
            status: "blocked",
            result: `${gaps.blockers.length} required value${gaps.blockers.length === 1 ? " needs" : "s need"} a decision: ${gaps.blockers
              .slice(0, 3)
              .map((gap) => `${gap.label} (${gap.blocker}: ${gap.reason})`)
              .join("; ")}${gaps.blockers.length > 3 ? "; …" : ""}`,
            evidence: [contractEvidence(contract)],
            rerun: null,
          }
        : {
            status: "passed",
            result: `No unresolved gaps · ${gaps.conformance.length} conformance item${gaps.conformance.length === 1 ? "" : "s"} for Phase 3 · ${gaps.policies.length} open polic${gaps.policies.length === 1 ? "y" : "ies"} for later gates`,
            evidence: [contractEvidence(contract)],
            rerun: null,
          };

  const values = {
    "profile-resolved": profile,
    "contract-complete": complete,
    "contract-provenance": provenance,
    "contract-gaps": unresolved,
  } satisfies Record<
    (typeof PHASE_TWO_CHECKS)[number]["key"],
    Omit<GateCheck, "key" | "label" | "definition">
  >;
  return PHASE_TWO_CHECKS.map((check) => ({ ...check, ...values[check.key] }));
}

function describeProvenance(contract: ApplicationContractView) {
  const counts = new Map<string, number>();
  for (const field of contract.body.fields)
    counts.set(
      field.provenance.kind,
      (counts.get(field.provenance.kind) ?? 0) + 1,
    );
  const labels: Record<string, string> = {
    "repository-declared": "repository-declared",
    "profile-rule": "profile rules",
    "user-confirmed": "your choices",
    inferred: "inferred",
    unresolved: "unresolved",
  };
  return [...counts]
    .map(([kind, count]) => `${count} ${labels[kind] ?? kind}`)
    .join(", ");
}
