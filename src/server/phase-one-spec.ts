import type {
  ApplicationRecord,
  ApprovalMode,
  BlockerRecord,
  GateCheck,
  ObservationRecord,
} from "./types";

export const PHASES = [
  { number: 1, name: "Start", deliverable: "Launch Brief", group: "plan" },
  { number: 2, name: "Inspect app", deliverable: "Application Contract", group: "plan" },
  { number: 3, name: "Make launch-ready", deliverable: "Conformance Result", group: "plan" },
  { number: 4, name: "Review launch plan", deliverable: "Launch Plan", group: "plan" },
  { number: 5, name: "Set up server", deliverable: "Host Record", group: "setup" },
  { number: 6, name: "Connect domain", deliverable: "Domain Route", group: "setup" },
  { number: 7, name: "Configure and protect", deliverable: "Operational Baseline", group: "setup" },
  { number: 8, name: "Go live", deliverable: "Verified Release", group: "live" },
  { number: 9, name: "Handoff", deliverable: "Operations Handoff", group: "live" },
] as const;

export const PHASE_ONE_CHECKS = [
  {
    key: "application-identity",
    label: "Application identity recorded",
    definition:
      "The application has a durable name, repository identity, target environment, and Server Guy application ID.",
  },
  {
    key: "repository-readable",
    label: "Repository readable at a recorded identity",
    definition:
      "Server Guy can read the repository and has recorded its default branch and exact commit SHA.",
  },
  {
    key: "target-environment",
    label: "Target environment explicit",
    definition:
      "The intended deployment environment is recorded rather than inferred from repository content.",
  },
  {
    key: "approval-authority",
    label: "Permission policy is explicit",
    definition:
      "The user has chosen how Pi should decide when to ask, and the launch scope plus currently available access are recorded.",
  },
  {
    key: "intent-prerequisites",
    label: "Launch baseline and prerequisites recorded",
    definition:
      "Server Guy's production baseline and the known provider/domain prerequisites are explicit, with owners and resolution paths.",
  },
] as const;

export const PRODUCTION_BASELINE = [
  { key: "protect-database", label: "Protect database data", rule: "Required for every production launch" },
  { key: "minimize-downtime", label: "Minimize downtime", rule: "Prefer changes that preserve availability" },
  { key: "keep-cost-low", label: "Keep infrastructure cost low", rule: "Use the smallest credible infrastructure" },
] as const;

export const PREREQUISITES = [
  {
    key: "hetzner-access",
    label: "Hetzner access",
    owner: "engineer" as const,
    resolutionPath: "Connect or verify Hetzner before Create server.",
    requiredBeforePhase: 5,
  },
  {
    key: "cloudflare-access",
    label: "Cloudflare access",
    owner: "engineer" as const,
    resolutionPath: "Connect or verify Cloudflare before Claim domain.",
    requiredBeforePhase: 6,
  },
  {
    key: "domain-starting-state",
    label: "Domain starting state",
    owner: "engineer" as const,
    resolutionPath: "Tell Pi whether the domain is already owned before Claim domain.",
    requiredBeforePhase: 6,
  },
] as const;

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  "pi-decides": "Pi decides",
  "always-ask": "Always ask",
  "full-autonomy": "Full autonomy",
};

/**
 * Evaluates the Phase 1 exit gate from durable records only. Statuses come from the
 * application record, the latest GitHub observation, and the recorded prerequisites,
 * never from chat prose.
 */
export function computeChecks(
  application: ApplicationRecord,
  repository: ObservationRecord | null,
  blockers: BlockerRecord[],
): GateCheck[] {
  const recordUrl = `/api/applications/${application.id}`;
  const prerequisitesRecorded = PREREQUISITES.every(({ key }) =>
    blockers.some((blocker) => blocker.key === key),
  );
  const intentRecordedAt =
    [application.createdAt, ...blockers.map((blocker) => blocker.createdAt)].sort().at(-1) ??
    application.createdAt;
  const githubAccess =
    repository?.status === "passed"
      ? "GitHub repository access is recorded."
      : "GitHub repository access is not currently available.";

  const values = {
    "application-identity": {
      status: "passed",
      result: `${application.name} · ${application.repositoryOwner}/${application.repositoryName} · Production`,
      sourceLabel: "Application record",
      sourceUrl: recordUrl,
      observationId: null,
      observedAt: application.createdAt,
      canRerun: false,
    },
    "repository-readable": {
      status: repository ? (repository.status === "passed" ? "passed" : "blocked") : "not-yet",
      result: repository?.summary ?? "The repository has not been checked yet.",
      sourceLabel: repository?.sourceLabel ?? "GitHub",
      sourceUrl: repository?.sourceUrl ?? application.repositoryUrl,
      observationId: repository?.id ?? null,
      observedAt: repository?.observedAt ?? null,
      canRerun: true,
    },
    "target-environment": {
      status: "passed",
      result: "Production",
      sourceLabel: "Application record",
      sourceUrl: recordUrl,
      observationId: null,
      observedAt: application.createdAt,
      canRerun: false,
    },
    "approval-authority": {
      status: repository ? "passed" : "not-yet",
      result: repository
        ? `${APPROVAL_MODE_LABELS[application.approvalMode]} · ${application.approvalScope}. ${githubAccess} Hetzner and Cloudflare are not configured yet.`
        : "Choose how Pi should ask for permission and record the access currently available.",
      sourceLabel: "Application permission policy",
      sourceUrl: recordUrl,
      observationId: repository?.id ?? null,
      observedAt: repository?.observedAt ?? application.createdAt,
      canRerun: false,
    },
    "intent-prerequisites": {
      status: prerequisitesRecorded ? "passed" : "not-yet",
      result: prerequisitesRecorded
        ? `${PRODUCTION_BASELINE.map(({ label }) => label).join(", ")}. ${PREREQUISITES.length} later prerequisites are recorded with owners and resolution paths.`
        : "The production baseline or later prerequisites are incomplete.",
      sourceLabel: "Launch record",
      sourceUrl: recordUrl,
      observationId: null,
      observedAt: intentRecordedAt,
      canRerun: false,
    },
  } satisfies Record<
    (typeof PHASE_ONE_CHECKS)[number]["key"],
    Omit<GateCheck, "key" | "label" | "definition">
  >;

  return PHASE_ONE_CHECKS.map((check) => ({ ...check, ...values[check.key] }));
}
