import type { ProfileCriterion, ProfileResolution } from "./types";

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
  /** Files Server Guy reads at inspection so the profile can be resolved
   * without a model; every other read is Pi's choice. */
  resolutionFiles: ["pyproject.toml"],
  /** A second root-level runtime manifest means this single-service profile
   * cannot describe the whole repository. */
  competingManifests: [
    "package.json",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "pom.xml",
    "composer.json",
  ],
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

/**
 * A deliberately small reading of pyproject.toml: the `[project]` table's
 * `requires-python` and `dependencies`, and whether a `[tool.uv]` table
 * exists. Dynamic dependencies or unusual layouts do not match, and the
 * criteria say so instead of guessing.
 */
export function readPyproject(text: string) {
  let section = "";
  let requiresPython: string | null = null;
  const dependencies: string[] = [];
  let hasToolUv = false;
  let dynamicDependencies = false;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      if (section === "tool.uv") hasToolUv = true;
      continue;
    }
    if (section !== "project") continue;
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, rest] = pair;
    if (key === "requires-python") {
      const literal = /^["']([^"']*)["']/.exec(rest);
      requiresPython = literal?.[1] ?? null;
    }
    if (key === "dynamic" && /dependencies/.test(rest))
      dynamicDependencies = true;
    if (key === "dependencies") {
      let array = rest;
      while (!/\]/.test(array) && index + 1 < lines.length)
        array += "\n" + lines[++index];
      for (const match of array.matchAll(/["']([^"']+)["']/g))
        dependencies.push(match[1]);
    }
  }
  return { requiresPython, dependencies, hasToolUv, dynamicDependencies };
}

/** PEP 508 distribution name of one dependency specifier, normalized. */
export function dependencyName(specifier: string) {
  return (
    /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(specifier)?.[1] ?? ""
  ).toLowerCase();
}

/**
 * Deterministic profile resolution from an inspection's tree and the files it
 * captured. Every criterion reports what it found and where, so an unmatched
 * or ambiguous repository is an explanation, not a silent failure.
 */
export function resolveApplicationProfile(input: {
  inspected: boolean;
  entries: readonly InspectedTreeEntry[];
  files: ReadonlyMap<string, string>;
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
      reason: "The repository has not been inspected yet.",
    };
  const has = (path: string) =>
    input.entries.some((entry) => entry.path === path);
  const pyprojectText = input.files.get("pyproject.toml");
  const pyproject =
    pyprojectText === undefined ? null : readPyproject(pyprojectText);
  const fastapi = pyproject?.dependencies.find(
    (dependency) => dependencyName(dependency) === "fastapi",
  );
  const criteria: ProfileCriterion[] = [
    {
      id: "pyproject-present",
      label: "pyproject.toml at the repository root",
      matched: has("pyproject.toml"),
      evidence: has("pyproject.toml")
        ? pyprojectText === undefined
          ? "pyproject.toml is in the tree but its content was not captured"
          : "pyproject.toml is in the tree and was read"
        : "no pyproject.toml at the root",
    },
    {
      id: "fastapi-dependency",
      label: "fastapi in [project] dependencies",
      matched: Boolean(fastapi),
      evidence: fastapi
        ? `pyproject.toml declares "${fastapi}"`
        : pyproject?.dynamicDependencies
          ? "pyproject.toml marks dependencies as dynamic"
          : pyproject
            ? "pyproject.toml declares no fastapi dependency"
            : "pyproject.toml was not read",
    },
    {
      id: "uv-managed",
      label: "uv.lock at the root or a [tool.uv] table",
      matched: has("uv.lock") || Boolean(pyproject?.hasToolUv),
      evidence: has("uv.lock")
        ? "uv.lock is in the tree"
        : pyproject?.hasToolUv
          ? "pyproject.toml has a [tool.uv] table"
          : "neither uv.lock nor [tool.uv] was found",
    },
    {
      id: "requires-python",
      label: "requires-python declared",
      matched: Boolean(pyproject?.requiresPython),
      evidence: pyproject?.requiresPython
        ? `requires-python = "${pyproject.requiresPython}"`
        : "no requires-python in [project]",
    },
  ];
  // Criteria are only meaningful once the manifest was readable; an
  // uncaptured pyproject.toml is reported by the first criterion alone.
  if (has("pyproject.toml") && pyprojectText === undefined)
    criteria[0].matched = false;
  const rejected = criteria.filter((criterion) => !criterion.matched);
  if (rejected.length)
    return {
      ...base,
      status: "unmatched",
      criteria,
      reason: `${APPLICATION_PROFILE.label} did not match: ${rejected
        .map((criterion) => criterion.evidence)
        .join("; ")}.`,
    };
  const competing = APPLICATION_PROFILE.competingManifests.filter(has);
  if (competing.length)
    return {
      ...base,
      status: "ambiguous",
      criteria,
      reason: `The FastAPI service matched, but ${competing.join(", ")} at the root shows another runtime this single-service profile cannot describe.`,
    };
  return { ...base, status: "matched", criteria, reason: null };
}
