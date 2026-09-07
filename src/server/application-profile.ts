import type { ApplicationContractBody, ProfileResolution } from "./types";

/**
 * The one supported Application Profile in this build: a single FastAPI
 * service managed with uv, run by an ASGI server in a container, with
 * PostgreSQL as the intended durable database. Its conventions are versioned
 * here; a changed convention is a new profile version, which makes contracts
 * built under the old version stale until they are revised. This does not
 * decide how many profiles V1 supports (U2).
 */
export const APPLICATION_PROFILE = {
  id: "fastapi-uv",
  version: 1,
  label: "FastAPI + uv",
  description:
    "One FastAPI service whose dependencies are locked with uv, started by an ASGI server inside a container, with PostgreSQL as the intended database.",
  /** Each rule governs exactly one material field; a rule cited for any
   * other field is not provenance, whatever value it carries. */
  rules: {
    "package-manager": {
      field: "build.packageManager",
      value: "uv",
      label: "Dependencies are installed with uv",
      definition:
        "Dependencies come from pyproject.toml and uv.lock through uv sync; no other installer is used.",
    },
    port: {
      field: "network.port",
      value: "8000",
      label: "Container port 8000",
      definition:
        "The service listens on port 8000 inside the container unless the repository declares another port.",
    },
    "bind-host": {
      field: "network.bindHost",
      value: "0.0.0.0",
      label: "Bind all interfaces",
      definition:
        "The server binds 0.0.0.0 inside the container so the host can reach it; a localhost-only bind is unreachable.",
    },
    "health-path": {
      field: "health.path",
      value: "/health",
      label: "GET /health",
      definition:
        "The service exposes GET /health returning HTTP 200 while it can serve requests. Deployment and monitoring probe it.",
    },
    database: {
      field: "persistence.database",
      value: "PostgreSQL",
      label: "PostgreSQL database",
      definition:
        "Durable application data lives in PostgreSQL, not in files inside disposable container storage.",
    },
    logging: {
      field: "observability.logging",
      value: "stdout",
      label: "Logs to stdout",
      definition:
        "The process writes logs to stdout/stderr; the host collects and retains them.",
    },
  },
  groups: {
    build: "Build",
    runtime: "Runtime",
    network: "Port and bind",
    health: "Health and readiness",
    persistence: "Persistence",
    migrations: "Migrations",
    configuration: "Configuration and secrets",
    observability: "Logs and telemetry",
    backup: "Backup",
    verification: "Verification",
  },
  fields: [
    {
      key: "build.packageManager",
      group: "build",
      label: "Package manager",
      definition: "How dependencies are installed for the build.",
    },
    {
      key: "build.pythonVersion",
      group: "build",
      label: "Python version",
      definition: "The Python requirement the build must satisfy.",
    },
    {
      key: "build.containerImage",
      group: "build",
      label: "Container build",
      definition:
        "How the container image is produced: a repository Dockerfile, or unresolved until build ownership is settled.",
      policy: {
        dependency: "F-8",
        requiredBeforePhase: 8,
        optional: true,
        question:
          "Build ownership and location (F-8) is not settled; a repository Dockerfile resolves this field for now.",
      },
    },
    {
      key: "runtime.startCommand",
      group: "runtime",
      label: "Start command",
      definition: "The command that starts the ASGI server in the container.",
    },
    {
      key: "runtime.application",
      group: "runtime",
      label: "ASGI application",
      definition: "The module:attribute the ASGI server loads.",
    },
    {
      key: "network.port",
      group: "network",
      label: "Container port",
      definition: "The port the service listens on inside the container.",
    },
    {
      key: "network.bindHost",
      group: "network",
      label: "Bind address",
      definition: "The interface the server binds to inside the container.",
    },
    {
      key: "health.path",
      group: "health",
      label: "Health endpoint",
      definition:
        "The HTTP path that returns 200 while the service can serve requests.",
    },
    {
      key: "persistence.database",
      group: "persistence",
      label: "Database",
      definition: "The durable database engine the application uses.",
    },
    {
      key: "persistence.connectionSetting",
      group: "persistence",
      label: "Database connection setting",
      definition:
        "The configuration variable that carries the database connection; its value is never recorded.",
    },
    {
      key: "migrations.tool",
      group: "migrations",
      label: "Migration tool",
      definition: "How schema migrations are applied, or none.",
    },
    {
      key: "migrations.rollbackPolicy",
      group: "migrations",
      label: "Rollback expectation",
      definition:
        "Whether migrations must be reversible before a Release; a product policy, not a repository fact.",
      policy: {
        dependency: "U16",
        requiredBeforePhase: 8,
        question:
          "Migration compatibility and rollback expectations (U16) are undecided; required before Go live (P8.G2).",
      },
    },
    {
      key: "configuration.requiredVariables",
      group: "configuration",
      label: "Required configuration variables",
      definition:
        "The variable names the application needs at start; values are never recorded.",
    },
    {
      key: "configuration.secretVariables",
      group: "configuration",
      label: "Secret variables",
      definition:
        "Which of those variables are secrets that must come from a protected source.",
    },
    {
      key: "observability.logging",
      group: "observability",
      label: "Application logs",
      definition: "Where the application writes logs.",
    },
    {
      key: "observability.telemetry",
      group: "observability",
      label: "Telemetry",
      definition:
        "Which telemetry channels are required before the application is live; a product policy.",
      policy: {
        dependency: "U1",
        requiredBeforePhase: 7,
        question:
          "The minimum required telemetry set (U1) is undecided; required before Configure and protect (P7.G4).",
      },
    },
    {
      key: "backup.policy",
      group: "backup",
      label: "Backup and restore",
      definition:
        "The backup and restore-verification bar before the application is live; a product policy.",
      policy: {
        dependency: "U1",
        requiredBeforePhase: 7,
        question:
          "The minimum backup and restore bar (U1) is undecided; required before Configure and protect (P7.G3).",
      },
    },
    {
      key: "verification.smokeChecks",
      group: "verification",
      label: "Smoke checks",
      definition:
        "Requests Server Guy proposes to verify a deployed Release through its public hostname.",
    },
    {
      key: "verification.requiredChecks",
      group: "verification",
      label: "Required verification set",
      definition:
        "Which checks are mandatory versus Pi-selected before a Release is called healthy; a product policy.",
      policy: {
        dependency: "U15",
        requiredBeforePhase: 4,
        question:
          "The mandatory verification set (U15) is undecided; required before Review launch plan (P4.G4).",
      },
    },
  ],
} as const;

export type ProfileRuleId = keyof typeof APPLICATION_PROFILE.rules;
export type ProfileFieldKey =
  (typeof APPLICATION_PROFILE.fields)[number]["key"];
export type ProfileField = (typeof APPLICATION_PROFILE.fields)[number];
export type ProfileGroup = keyof typeof APPLICATION_PROFILE.groups;

export function profileField(key: string): ProfileField | null {
  return APPLICATION_PROFILE.fields.find((field) => field.key === key) ?? null;
}

export function profileRule(id: string) {
  return Object.hasOwn(APPLICATION_PROFILE.rules, id)
    ? APPLICATION_PROFILE.rules[id as ProfileRuleId]
    : null;
}

/** Stable rule identity for provenance: `fastapi-uv@1/health-path`. */
export function profileRuleReference(id: ProfileRuleId) {
  return `${APPLICATION_PROFILE.id}@${APPLICATION_PROFILE.version}/${id}`;
}

export interface InspectedTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

/** A supported capability selected by Pi from cited repository evidence.
 * No file-name or dependency heuristics decide what the application is. */
export function resolveApplicationProfile(input: {
  inspected: boolean;
  selection?: ApplicationContractBody["profileSelection"];
}): ProfileResolution {
  const base = {
    profileId: APPLICATION_PROFILE.id,
    profileVersion: APPLICATION_PROFILE.version,
    label: APPLICATION_PROFILE.label,
  };
  if (!input.inspected)
    return {
      ...base,
      status: "not-inspected",
      criteria: [],
      reason:
        "The repository has not been inspected with the current connection.",
    };
  if (!input.selection)
    return {
      ...base,
      status: "pending",
      criteria: [],
      reason:
        "Repository context is ready. Server Guy must inspect the relevant files and propose an evidence-backed application profile.",
    };
  if (input.selection.profileId !== APPLICATION_PROFILE.id)
    return {
      ...base,
      status: "unmatched",
      criteria: [],
      reason: `The selected profile ${input.selection.profileId} is not currently supported.`,
    };
  return {
    ...base,
    status: "matched",
    reason: null,
    criteria: [
      {
        id: "model-selection",
        label: "Profile selected from repository evidence",
        matched: true,
        evidence: input.selection.rationale,
      },
    ],
  };
}
