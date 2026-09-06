import type { ConformanceCheckDefinition, ConformanceCheckKey } from "./types";

/**
 * The versioned conformance check set for the `fastapi-uv` profile. Every
 * check is executed by Server Guy's runner over an exact source tree; none of
 * them is satisfied by a filename, a substring or anything the application
 * prints. A changed definition is a new version, which makes results bound to
 * the old version stale.
 */
export const CONFORMANCE_DEFINITION = {
  id: "fastapi-uv/conformance",
  version: 1,
  runnerImage: "ghcr.io/astral-sh/uv:python3.12-bookworm-slim",
  databaseImage: "postgres:16-alpine",
  limits: {
    installSeconds: 420,
    migrationSeconds: 180,
    startupSeconds: 90,
    behaviorSeconds: 60,
    testSeconds: 300,
    commandSeconds: 180,
    attemptSeconds: 1_500,
    outputBytes: 32 * 1024,
    memoryBytes: 1024 * 1024 * 1024,
    pids: 256,
    cpus: 1,
  },
  /** Hosts the dependency step may reach through the allowlisting proxy. */
  dependencyHosts: [
    "pypi.org",
    "files.pythonhosted.org",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
  ],
  checks: [
    {
      key: "install",
      label: "Locked dependency installation",
      proves:
        "uv sync --locked succeeds in a fresh container: uv.lock is consistent with pyproject.toml and every locked distribution installs for the runner's platform.",
      limits:
        "Downloads go through an allowlisted proxy to the package index only; a lockfile that resolves but pins a broken package is not detected until later checks run it.",
      required: true,
    },
    {
      key: "configuration",
      label: "Required configuration is enforced",
      proves:
        "With the contract's secret variables absent, the application refuses to start and its output names a missing variable, so a deployment without configuration fails loudly instead of running with defaults.",
      limits:
        "Only the contract's recorded secret variables are removed; other defaults are not examined. The message check is a case-insensitive name match on bounded output.",
      required: true,
    },
    {
      key: "database",
      label: "Disposable PostgreSQL is reachable",
      proves:
        "A fresh PostgreSQL container with synthetic credentials accepts connections on the internal network before migrations and startup use it.",
      limits:
        "Proves the runner's database, not the production one; Phase 7 establishes the real service. Not applicable when the contract records no PostgreSQL database.",
      required: true,
    },
    {
      key: "migrations",
      label: "Migrations apply to an empty database",
      proves:
        "The contract's migration tool applies every migration against the empty disposable database and exits successfully.",
      limits:
        "Applies forward only; rollback and compatibility with existing data are the open U16 policy. Not applicable when the contract records no migration tool.",
      required: true,
    },
    {
      key: "startup",
      label: "Application starts",
      proves:
        "The start command from the executed tree loads the ASGI application with the synthetic configuration and keeps running until the health probe connects.",
      limits:
        "Runs in Server Guy's runner image, not the repository's Dockerfile image (build ownership is the open F-8 policy); a slow import that exceeds the startup bound counts as a failure.",
      required: true,
    },
    {
      key: "health",
      label: "Health endpoint answers from outside the process",
      proves:
        "A sibling container on the same internal network receives HTTP 200 from the contract's health path on the contract's port, so the bind address and port are reachable, not just declared.",
      limits:
        "A private-network probe; the public HTTPS hostname is verified at P8.G4. The response body is not interpreted.",
      required: true,
    },
    {
      key: "behavior",
      label: "Accepted application behavior",
      proves:
        "The accepted application-specific steps, proposed from cited routes, receive the expected statuses and bodies from a sibling probe, including data written and read back through the running application and its database.",
      limits:
        "Executes only the accepted definition; it does not review the application's other routes, authentication or data model. Not run until a definition is accepted.",
      required: true,
    },
    {
      key: "tests",
      label: "Repository tests pass",
      proves:
        "The repository's own pytest suite passes in the runner with the disposable database available.",
      limits:
        "Repository-authored tests prove what their authors chose to test; they are never a substitute for the checks above. Not applicable when the tree has no tests directory.",
      required: true,
    },
  ] satisfies ConformanceCheckDefinition[],
} as const;

export const CHECK_ORDER: readonly ConformanceCheckKey[] =
  CONFORMANCE_DEFINITION.checks.map((check) => check.key);

export function checkDefinition(
  key: ConformanceCheckKey,
): ConformanceCheckDefinition {
  return (
    CONFORMANCE_DEFINITION.checks.find((check) => check.key === key) ?? {
      key,
      label: "Command",
      proves: "Only what its own output shows; worker evidence.",
      limits: "Never a gate input.",
      required: false,
    }
  );
}

/**
 * Paths a conformance change may never touch: they carry authority that a
 * source change to the application does not. They are rejected at proposal
 * time and flagged as scope violations in any returned change.
 */
export const SENSITIVE_PATH_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /^\.github\//,
    reason: "GitHub workflows and repository automation",
  },
  { pattern: /^\.git\//, reason: "git internals and hooks" },
  { pattern: /^\.githooks\//, reason: "git hooks" },
  { pattern: /(^|\/)\.pre-commit-config\.ya?ml$/, reason: "commit hooks" },
  { pattern: /(^|\/)\.env(\..*)?$/, reason: "environment files" },
  {
    pattern: /\.(pem|key|p12|pfx|jks|keystore|tfvars|kdbx)$/i,
    reason: "key material and credential stores",
  },
  { pattern: /(^|\/)(secrets?|credentials?)(\/|\.|$)/i, reason: "secrets" },
  {
    pattern: /(^|\/)\.(npmrc|pypirc|netrc|git-credentials)$/,
    reason: "credential files",
  },
  { pattern: /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/, reason: "SSH keys" },
];

export function sensitivePathReason(path: string) {
  return (
    SENSITIVE_PATH_PATTERNS.find(({ pattern }) => pattern.test(path))?.reason ??
    null
  );
}
