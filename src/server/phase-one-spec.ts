import type {
  ApplicationRecord,
  EvidenceReference,
  GateCheck,
  GateStatus,
  Observation,
  UpcomingRequirement,
} from "./types";
import { APPROVAL_MODES } from "./types";

export const PHASES = [
  {
    key: "start",
    number: 1,
    name: "Start",
    deliverable: "Launch Brief",
    group: "plan",
  },
  {
    key: "inspect-app",
    number: 2,
    name: "Inspect app",
    deliverable: "Application Contract",
    group: "plan",
  },
  {
    key: "make-launch-ready",
    number: 3,
    name: "Make launch-ready",
    deliverable: "Conformance Result",
    group: "plan",
  },
  {
    key: "review-launch-plan",
    number: 4,
    name: "Review launch plan",
    deliverable: "Launch Plan",
    group: "plan",
  },
  {
    key: "set-up-server",
    number: 5,
    name: "Set up server",
    deliverable: "Host Record",
    group: "setup",
  },
  {
    key: "connect-domain",
    number: 6,
    name: "Connect domain",
    deliverable: "Domain Route",
    group: "setup",
  },
  {
    key: "configure-protect",
    number: 7,
    name: "Configure and protect",
    deliverable: "Operational Baseline",
    group: "setup",
  },
  {
    key: "go-live",
    number: 8,
    name: "Go live",
    deliverable: "Verified Release",
    group: "live",
  },
  {
    key: "handoff",
    number: 9,
    name: "Handoff",
    deliverable: "Operations Handoff",
    group: "live",
  },
] as const;

export const PHASE_ONE = PHASES[0];

export const PHASE_ONE_CHECKS = [
  {
    key: "application-identity",
    label: "Application details",
    definition:
      "Your application’s name and GitHub repository are saved in Server Guy.",
  },
  {
    key: "repository-readable",
    label: "GitHub repository access",
    definition:
      "Checks whether Server Guy can read this repository, and saves its default branch and exact version (commit). This does not review or deploy the code.",
  },
  {
    key: "target-environment",
    label: "Deployment environment",
    definition:
      "Production means the app is intended for real use, not testing. That choice is saved here; the hosting provider and server are chosen later.",
  },
  {
    key: "approval-authority",
    label: "When Server Guy asks for approval",
    definition:
      "Your choice of when Server Guy should ask you before changing code or infrastructure is saved. Phase 1 makes no external changes.",
  },
] as const;

export const PRODUCTION_BASELINE = [
  {
    key: "protect-database",
    label: "Protect database data",
    rule: "Required for every production launch",
  },
  {
    key: "minimize-downtime",
    label: "Minimize downtime",
    rule: "Prefer changes that preserve availability",
  },
  {
    key: "keep-cost-low",
    label: "Keep infrastructure cost low",
    rule: "Use the smallest credible infrastructure",
  },
] as const;

export const UPCOMING_REQUIREMENTS = [
  {
    key: "hetzner-access",
    label: "Hetzner access",
    owner: "engineer" as const,
    resolutionPath: "Connect or verify Hetzner before Set up server.",
    requiredBeforePhase: 5,
  },
  {
    key: "cloudflare-access",
    label: "Cloudflare access",
    owner: "engineer" as const,
    resolutionPath: "Connect or verify Cloudflare before Connect domain.",
    requiredBeforePhase: 6,
  },
  {
    key: "domain-starting-state",
    label: "Domain starting state",
    owner: "engineer" as const,
    resolutionPath:
      "Tell Server Guy whether the domain is already owned before Connect domain.",
    requiredBeforePhase: 6,
  },
] as const;

export function phaseOneCheckListForPrompt() {
  return PHASE_ONE_CHECKS.map(
    (check, index) => `${index + 1}. ${check.label}.`,
  ).join("\n");
}

function applicationEvidence(
  application: ApplicationRecord,
  role: string,
): EvidenceReference {
  return {
    recordType: "application",
    recordId: application.id,
    role,
    label: "Application record",
    href: `/api/applications/${application.id}`,
    observedAt: application.updatedAt,
  };
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

function repositoryStatus(repository: Observation | null): GateStatus {
  if (!repository || repository.status === "unavailable") return "not-yet";
  return repository.status === "passed" ? "passed" : "blocked";
}

/**
 * Evaluates the Phase 1 Exit Gate from current records. Gate results are
 * projections:
 * they are never stored and they never fall back to an older passing
 * Observation.
 */
export function computeChecks(
  application: ApplicationRecord,
  repository: Observation | null,
  githubConnectionId: string | null,
): GateCheck[] {
  const raw = repository?.raw;
  const currentRepository = Boolean(
    githubConnectionId &&
    raw &&
    typeof raw === "object" &&
    "connectionId" in raw &&
    raw.connectionId === githubConnectionId,
  );
  const identityComplete = Boolean(
    application.id &&
    application.name &&
    application.repositoryUrl &&
    application.repositoryOwner &&
    application.repositoryName,
  );
  const environmentExplicit = application.environment === "production";
  const approvalExplicit = Object.hasOwn(
    APPROVAL_MODES,
    application.approvalMode,
  );

  const values = {
    "application-identity": {
      status: identityComplete ? "passed" : "not-yet",
      result: identityComplete
        ? `${application.name} · ${application.repositoryOwner}/${application.repositoryName} · Production`
        : "The application identity is incomplete.",
      evidence: [
        applicationEvidence(application, "Saved application and repository"),
      ],
      canRerun: false,
    },
    "repository-readable": {
      status: currentRepository ? repositoryStatus(repository) : "not-yet",
      result: !githubConnectionId
        ? "Connect GitHub, then run the repository check."
        : !currentRepository
          ? "Run the repository check with your current GitHub connection."
          : (repository?.summary ?? "The repository has not been checked yet."),
      evidence: repository
        ? [observationEvidence(repository, "Latest repository check")]
        : [],
      canRerun: true,
    },
    "target-environment": {
      status: environmentExplicit ? "passed" : "not-yet",
      result: environmentExplicit
        ? "Production"
        : "Choose a target environment.",
      evidence: [
        applicationEvidence(application, "Saved deployment environment"),
      ],
      canRerun: false,
    },
    "approval-authority": {
      status: approvalExplicit ? "passed" : "not-yet",
      result: approvalExplicit
        ? `${APPROVAL_MODES[application.approvalMode].label} · ${application.approvalScope}`
        : "Choose how Server Guy should ask before external changes.",
      evidence: [applicationEvidence(application, "Saved approval settings")],
      canRerun: false,
    },
  } satisfies Record<
    (typeof PHASE_ONE_CHECKS)[number]["key"],
    Omit<GateCheck, "key" | "label" | "definition">
  >;

  return PHASE_ONE_CHECKS.map((check) => ({ ...check, ...values[check.key] }));
}

export function deriveUpcomingRequirements(): UpcomingRequirement[] {
  return UPCOMING_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    status: "missing",
    evidence: [],
  }));
}
