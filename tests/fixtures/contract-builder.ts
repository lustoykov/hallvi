// Builds a deterministic propose_application_contract call from the tool
// results a synthetic model has seen. It mirrors what a careful model would
// do with the fixture repositories: quote verbatim snippets for declared
// values, cite profile rules, label interpretations as inferred, and leave
// policy fields open. No imports, so it can be copied into the disposable
// browser app.

export interface SeenInspection {
  inspection: { observationId: string; commitSha: string } | null;
  tree: { entries: string[] };
}

export interface SeenRead {
  status: "read" | "absent" | "unknown";
  observationId?: string;
  inspectionObservationId?: string;
  path: string;
  content?: string;
}

export interface BuiltCitation {
  observationId: string;
  path: string;
  snippet: string;
}

type Provenance =
  | { kind: "repository-declared"; citation: BuiltCitation }
  | { kind: "profile-rule"; ruleId: string }
  | {
      kind: "user-confirmed";
      source: { type: "message"; messageId: string; quote: string };
    }
  | {
      kind: "inferred";
      citation: BuiltCitation | { observationId: string; absent: string };
    }
  | {
      kind: "unresolved";
      blocker: "unknown" | "contradiction" | "unsupported";
      reason: string;
      observed?: string;
      citation?: BuiltCitation;
    }
  | {
      kind: "unresolved";
      blocker: "policy";
      dependency: string;
      reason: string;
    };

export interface BuiltField {
  key: string;
  value: string | null;
  provenance: Provenance;
  conformance?: { observed: string; change: string; citation?: BuiltCitation };
}

/** Files the synthetic model reads, in order, when the tree has them. */
export const CONTRACT_READ_ORDER = [
  "pyproject.toml",
  "Dockerfile",
  "app/main.py",
  "app/config.py",
  ".env.example",
  "alembic.ini",
  "README.md",
];

export function treePaths(inspection: SeenInspection) {
  return inspection.tree.entries.map((entry) =>
    entry.replace(/ \(\d+ bytes\)$/, "").replace(/\/$/, ""),
  );
}

function line(read: SeenRead | undefined, pattern: RegExp) {
  const match = read?.content
    ?.split("\n")
    .find((candidate) => pattern.test(candidate));
  return match?.trim() || null;
}

function cite(read: SeenRead, snippet: string): BuiltCitation {
  return { observationId: read.observationId!, path: read.path, snippet };
}

const policy = (dependency: string, reason: string): Provenance => ({
  kind: "unresolved",
  blocker: "policy",
  dependency,
  reason,
});

export function buildContractProposal(
  inspection: SeenInspection,
  reads: SeenRead[],
  options: {
    revises?: string;
    corrections?: Array<{
      key: string;
      value: string;
      messageId: string;
      quote: string;
    }>;
    invented?: boolean;
  } = {},
) {
  const seen = (path: string) =>
    reads.find((read) => read.path === path && read.status === "read");
  const pyproject = seen("pyproject.toml");
  const dockerfile = seen("Dockerfile");
  const main = seen("app/main.py");
  const config = seen("app/config.py");
  const env = seen(".env.example");
  const alembic = seen("alembic.ini");
  const fields: BuiltField[] = [];
  const declared = (
    key: string,
    read: SeenRead | undefined,
    pattern: RegExp,
    value: string | ((snippet: string) => string | null),
  ) => {
    const snippet = line(read, pattern);
    if (!read || !snippet) return false;
    const resolved = typeof value === "function" ? value(snippet) : value;
    if (!resolved || !snippet.includes(resolved)) return false;
    fields.push({
      key,
      value: resolved,
      provenance: {
        kind: "repository-declared",
        citation: cite(read, snippet),
      },
    });
    return true;
  };

  fields.push({
    key: "build.packageManager",
    value: "uv",
    provenance: { kind: "profile-rule", ruleId: "package-manager" },
  });
  if (
    !declared(
      "build.pythonVersion",
      pyproject,
      /^requires-python/,
      (snippet) => /"([^"]+)"/.exec(snippet)?.[1] ?? null,
    )
  )
    fields.push({
      key: "build.pythonVersion",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "unknown",
        reason: "pyproject.toml declares no requires-python.",
      },
    });
  if (dockerfile)
    fields.push({
      key: "build.containerImage",
      value: "Dockerfile at the repository root",
      provenance: {
        kind: "inferred",
        citation: cite(dockerfile, line(dockerfile, /^FROM /)!),
      },
    });
  else
    fields.push({
      key: "build.containerImage",
      value: null,
      provenance: policy(
        "F-8",
        "No Dockerfile is declared; build ownership is unresolved until F-8 is settled.",
      ),
    });
  const cmd = line(dockerfile, /^CMD /);
  if (dockerfile && cmd)
    fields.push({
      key: "runtime.startCommand",
      value: cmd
        .replace(/^CMD \[/, "")
        .replace(/\]$/, "")
        .split(",")
        .map((part) => part.trim().replace(/^"|"$/g, ""))
        .join(" "),
      provenance: { kind: "inferred", citation: cite(dockerfile, cmd) },
    });
  else
    fields.push({
      key: "runtime.startCommand",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "unknown",
        reason: "No Dockerfile CMD or Procfile declares the start command.",
      },
    });
  if (
    !declared("runtime.application", dockerfile, /^CMD /, "app.main:app") &&
    !declared(
      "runtime.application",
      seen("README.md"),
      /uvicorn app\.main:app/,
      "app.main:app",
    )
  )
    fields.push({
      key: "runtime.application",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "unknown",
        reason: "No start command names the ASGI application.",
      },
    });
  if (!declared("network.port", dockerfile, /^EXPOSE /, "8000"))
    fields.push({
      key: "network.port",
      value: "8000",
      provenance: { kind: "profile-rule", ruleId: "port" },
    });
  if (cmd && cmd.includes("127.0.0.1") && dockerfile)
    fields.push({
      key: "network.bindHost",
      value: "0.0.0.0",
      provenance: { kind: "profile-rule", ruleId: "bind-host" },
      conformance: {
        observed:
          "The Dockerfile CMD binds 127.0.0.1, unreachable from the host.",
        change: "Start uvicorn with --host 0.0.0.0.",
        citation: cite(dockerfile, cmd),
      },
    });
  else if (!declared("network.bindHost", dockerfile, /^CMD /, "0.0.0.0"))
    fields.push({
      key: "network.bindHost",
      value: "0.0.0.0",
      provenance: { kind: "profile-rule", ruleId: "bind-host" },
    });
  if (!declared("health.path", main, /@app\.get\("\/health"\)/, "/health")) {
    const app = line(main, /^app = FastAPI/);
    fields.push({
      key: "health.path",
      value: "/health",
      provenance: { kind: "profile-rule", ruleId: "health-path" },
      conformance: {
        observed: "app/main.py declares no health route.",
        change: "Add GET /health returning 200 when the service can serve.",
        ...(main && app ? { citation: cite(main, app) } : {}),
      },
    });
  }
  const databaseLine = line(config, /database_url/);
  if (config && databaseLine?.includes("sqlite"))
    fields.push({
      key: "persistence.database",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "contradiction",
        reason:
          "The profile targets PostgreSQL, but the repository declares a SQLite file inside container storage. Decide: migrate to PostgreSQL in Phase 3, or keep SQLite on a persistent volume.",
        observed: databaseLine,
        citation: cite(config, databaseLine),
      },
    });
  else if (config && databaseLine?.includes("postgresql"))
    fields.push({
      key: "persistence.database",
      value: "PostgreSQL",
      provenance: { kind: "profile-rule", ruleId: "database" },
    });
  else
    fields.push({
      key: "persistence.database",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "unknown",
        reason: "No configuration declares the database.",
      },
    });
  if (
    !declared(
      "persistence.connectionSetting",
      env,
      /^DATABASE_URL=/,
      "DATABASE_URL",
    )
  )
    fields.push({
      key: "persistence.connectionSetting",
      value: null,
      provenance: {
        kind: "unresolved",
        blocker: "unknown",
        reason: "No .env.example names the database connection variable.",
      },
    });
  if (!declared("migrations.tool", alembic, /^\[alembic\]/, "alembic"))
    fields.push({
      key: "migrations.tool",
      value: "none",
      provenance: inspection.inspection
        ? {
            kind: "inferred",
            citation: {
              observationId: inspection.inspection.observationId,
              absent: "alembic.ini",
            },
          }
        : {
            kind: "unresolved",
            blocker: "unknown",
            reason: "No inspection.",
          },
    });
  fields.push({
    key: "migrations.rollbackPolicy",
    value: null,
    provenance: policy(
      "U16",
      "Migration compatibility and rollback expectations are undecided until U16; required before Go live.",
    ),
  });
  const envFirst = line(env, /^DATABASE_URL=/);
  if (env && envFirst) {
    fields.push({
      key: "configuration.requiredVariables",
      value: "DATABASE_URL, SECRET_KEY, LOG_LEVEL",
      provenance: { kind: "inferred", citation: cite(env, envFirst) },
    });
    fields.push({
      key: "configuration.secretVariables",
      value: "DATABASE_URL, SECRET_KEY",
      provenance: {
        kind: "inferred",
        citation: cite(env, line(env, /^SECRET_KEY=/)!),
      },
    });
  } else
    for (const key of [
      "configuration.requiredVariables",
      "configuration.secretVariables",
    ])
      fields.push({
        key,
        value: null,
        provenance: {
          kind: "unresolved",
          blocker: "unknown",
          reason: "No .env.example or settings module lists the variables.",
        },
      });
  fields.push({
    key: "observability.logging",
    value: "stdout",
    provenance: { kind: "profile-rule", ruleId: "logging" },
  });
  fields.push({
    key: "observability.telemetry",
    value: null,
    provenance: policy(
      "U1",
      "The minimum required telemetry set is undecided until U1; required before Configure and protect.",
    ),
  });
  fields.push({
    key: "backup.policy",
    value: null,
    provenance: policy(
      "U1",
      "The backup and restore bar is undecided until U1; required before Configure and protect.",
    ),
  });
  const router = line(main, /include_router/);
  fields.push({
    key: "verification.smokeChecks",
    value: "GET /health, GET /todos",
    provenance:
      main && router
        ? { kind: "inferred", citation: cite(main, router) }
        : {
            kind: "unresolved",
            blocker: "unknown",
            reason: "No routes were read.",
          },
  });
  fields.push({
    key: "verification.requiredChecks",
    value: null,
    provenance: policy(
      "U15",
      "The mandatory verification set is undecided until U15; required before Review launch plan.",
    ),
  });

  for (const correction of options.corrections ?? []) {
    const index = fields.findIndex((field) => field.key === correction.key);
    const replacement: BuiltField = {
      key: correction.key,
      value: correction.value,
      provenance: {
        kind: "user-confirmed",
        source: {
          type: "message",
          messageId: correction.messageId,
          quote: correction.quote,
        },
      },
    };
    if (index >= 0) fields[index] = replacement;
    else fields.push(replacement);
  }
  if (options.invented)
    fields[fields.findIndex((field) => field.key === "health.path")] = {
      key: "health.path",
      value: "/healthz",
      provenance: {
        kind: "repository-declared",
        citation: {
          observationId: "00000000-0000-4000-8000-00000000dead",
          path: "app/invented.py",
          snippet: '@app.get("/healthz")',
        },
      },
    };
  const blockers = fields.filter(
    (field) =>
      field.provenance.kind === "unresolved" &&
      field.provenance.blocker !== "policy",
  ).length;
  const conformance = fields.filter((field) => field.conformance).length;
  return {
    summary: `FastAPI service managed with uv at ${inspection.inspection?.commitSha.slice(0, 8) ?? "unknown"}: ${fields.length} fields, ${blockers} blocker${blockers === 1 ? "" : "s"}, ${conformance} conformance item${conformance === 1 ? "" : "s"}.`,
    fields,
    ...(options.revises ? { revises: options.revises } : {}),
  };
}
