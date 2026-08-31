import type { ApprovalMode } from "./types";

export const PHASES = [
  { number: 1, name: "Start", deliverable: "Launch Brief", group: "plan" },
  { number: 2, name: "Inspect app", deliverable: "Application Contract", group: "plan" },
  { number: 3, name: "Prepare app", deliverable: "Conformance Result", group: "plan" },
  { number: 4, name: "Review plan", deliverable: "Launch Plan", group: "plan" },
  { number: 5, name: "Create server", deliverable: "Host Record", group: "setup" },
  { number: 6, name: "Claim domain", deliverable: "Domain Route", group: "setup" },
  { number: 7, name: "Add safeguards", deliverable: "Operational Baseline", group: "setup" },
  { number: 8, name: "Go live", deliverable: "Verified Release", group: "live" },
  { number: 9, name: "Operate", deliverable: "Operations Handoff", group: "live" },
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
      "The user has chosen how Pi should decide when to ask, and the current launch scope is recorded.",
  },
  {
    key: "intent-prerequisites",
    label: "Launch priorities and prerequisites recorded",
    definition:
      "The product defaults and known provider/domain prerequisites are recorded with owners and resolution paths.",
  },
] as const;

export const PRODUCT_DEFAULTS = [
  ["protect_database", "Protect database data", "Required for every production launch"],
  ["minimize_downtime", "Minimize downtime", "Prefer changes that preserve availability"],
  ["keep_cost_low", "Keep infrastructure cost low", "Use the smallest credible infrastructure"],
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
