import { contractGapReport } from "./application-contract";
import { APPLICATION_PROFILE, profileField } from "./application-profile";
import {
  CONFORMANCE_DEFINITION,
  SENSITIVE_PATH_PATTERNS,
} from "./conformance-definition";
import type {
  AcceptanceChecksRecord,
  ApplicationContractRecord,
  ApplicationRecord,
  ConformanceBrief,
  ConformanceRunConfiguration,
  ContractField,
} from "./types";

export const SYNTHETIC_DATABASE = {
  host: "db",
  port: 5432,
  user: "app",
  database: "app",
  /** Shown in the brief; the runner substitutes a per-attempt password. */
  passwordPlaceholder: "<synthetic-per-run>",
} as const;

function value(contract: ApplicationContractRecord, key: string) {
  return contract.body.fields.find((field) => field.key === key) ?? null;
}

function names(field: ContractField | null) {
  return (field?.value ?? "")
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
}

/** The connection URL scheme the repository's own example declares, if any. */
function connectionScheme(field: ContractField | null) {
  const snippet =
    field && "citation" in field.provenance && field.provenance.citation
      ? "snippet" in field.provenance.citation
        ? field.provenance.citation.snippet
        : ""
      : "";
  const match = /(postgres(?:ql)?(?:\+[a-z0-9_]+)?):\/\//i.exec(snippet);
  return match?.[1] ?? "postgresql";
}

/**
 * The execution configuration derived deterministically from the contract:
 * port, health path, the database the runner must provide, the migration
 * tool, and every required variable with a synthetic value. No production
 * value ever enters it.
 */
export function executionConfiguration(
  contract: ApplicationContractRecord,
  password = SYNTHETIC_DATABASE.passwordPlaceholder,
): Omit<ConformanceRunConfiguration, "startCommand" | "startCommandSource"> {
  const port = Number(value(contract, "network.port")?.value ?? "");
  const database =
    value(contract, "persistence.database")?.value?.toLowerCase() ===
    "postgresql"
      ? "postgresql"
      : "none";
  const connection = value(contract, "persistence.connectionSetting");
  const connectionName = connection?.value?.trim() ?? null;
  const url = `${connectionScheme(connection)}://${SYNTHETIC_DATABASE.user}:${password}@${SYNTHETIC_DATABASE.host}:${SYNTHETIC_DATABASE.port}/${SYNTHETIC_DATABASE.database}`;
  const environment: Record<string, string> = {};
  const required = names(value(contract, "configuration.requiredVariables"));
  for (const name of required) {
    if (name === connectionName || /DATABASE_URL|DB_URL|POSTGRES/.test(name))
      environment[name] = database === "postgresql" ? url : "";
    else if (/LOG_LEVEL/.test(name)) environment[name] = "info";
    else if (/PORT$/.test(name))
      environment[name] = String(
        Number.isInteger(port) && port > 0 ? port : 8000,
      );
    else
      environment[name] = `synthetic-${name.toLowerCase().replace(/_/g, "-")}`;
  }
  if (connectionName && database === "postgresql")
    environment[connectionName] = url;
  const migration = value(contract, "migrations.tool")
    ?.value?.trim()
    .toLowerCase();
  return {
    port: Number.isInteger(port) && port > 0 ? port : 8000,
    healthPath: value(contract, "health.path")?.value?.trim() || "/health",
    environment,
    database,
    migrationTool: migration && migration !== "none" ? migration : null,
  };
}

/** Variable names the configuration check removes: the contract's secrets. */
export function secretVariableNames(contract: ApplicationContractRecord) {
  return names(value(contract, "configuration.secretVariables"));
}

export function briefExportText(brief: ConformanceBrief) {
  const lines = [
    `# Conformance brief for ${brief.repository.owner}/${brief.repository.name}`,
    "",
    `Repository: ${brief.repository.url}`,
    `Starting revision (base): ${brief.baseSha}${brief.repository.defaultBranch ? ` on ${brief.repository.defaultBranch}` : ""}`,
    `Application Contract: v${brief.contract.version} (${brief.contract.id}), profile ${brief.contract.profileLabel} v${brief.contract.profileVersion}`,
    "",
    "## Required changes",
    ...(brief.requiredChanges.length
      ? brief.requiredChanges.map(
          (item) =>
            `- ${item.label} (${item.field}): required value "${item.required}". Now: ${item.observed} Change: ${item.change}`,
        )
      : [
          "- None: the contract records no conformance work. A candidate revision still needs current conformance evidence.",
        ]),
    ...(brief.blockers.length
      ? [
          "",
          "## Blocked until decided (not source changes)",
          ...brief.blockers.map((item) => `- ${item.label}: ${item.reason}`),
        ]
      : []),
    "",
    "## Allowed scope",
    `- ${brief.scope.allowed}`,
    `- Never change: ${brief.scope.forbidden.join("; ")}.`,
    "- Do not upgrade unrelated dependencies, restructure the project or change behavior beyond the required changes.",
    "",
    "## Acceptance (verified independently by Server Guy's runner, check set v" +
      String(brief.acceptance.definitionVersion) +
      ")",
    ...brief.acceptance.checks.map(
      (check) => `- ${check.label}: ${check.proves}`,
    ),
    brief.acceptance.applicationBehavior
      ? `- Application behavior v${brief.acceptance.applicationBehavior.version} (${brief.acceptance.applicationBehavior.status}): ${brief.acceptance.applicationBehavior.steps
          .map(
            (step) =>
              `${step.method} ${step.path} → ${step.expectStatus}${step.expectBodyIncludes ? ` containing ${step.expectBodyIncludes.map((item) => JSON.stringify(item)).join(", ")}` : ""}`,
          )
          .join("; ")}`
      : "- Application behavior: not yet established; Server Guy proposes it from the repository's routes.",
    `- Runner configuration: port ${brief.acceptance.configuration.port}, health path ${brief.acceptance.configuration.healthPath}, database ${brief.acceptance.configuration.database === "postgresql" ? "disposable PostgreSQL with synthetic credentials" : "none"}, migrations ${brief.acceptance.configuration.migrationTool ?? "none"}, variables ${Object.keys(brief.acceptance.configuration.environment).join(", ") || "none"}.`,
    "",
    "## Exclusions",
    ...brief.exclusions.map((item) => `- ${item}`),
    "",
    "## Return",
    `Open a pull request against ${brief.repository.defaultBranch ?? "the default branch"} from base ${brief.baseSha.slice(0, 8)}, or push a branch, and return its URL, branch or commit SHA to Server Guy. Your own test output is welcome as worker evidence; Server Guy verifies the merged revision independently.`,
  ];
  return lines.join("\n");
}

/**
 * The bounded brief every working environment receives: the exact starting
 * revision, the contract it serves, the required changes with what the
 * repository does now, the allowed scope, the independent acceptance bar and
 * what is excluded. Unknown or contradictory values are listed as blockers,
 * never converted into changes or choices.
 */
export function buildConformanceBrief(
  application: ApplicationRecord,
  contract: ApplicationContractRecord,
  acceptance: AcceptanceChecksRecord | null,
  defaultBranch: string | null,
): ConformanceBrief {
  const gaps = contractGapReport(contract.body);
  const brief: ConformanceBrief = {
    repository: {
      url: application.repositoryUrl,
      owner: application.repositoryOwner,
      name: application.repositoryName,
      defaultBranch,
    },
    baseSha: contract.commitSha,
    contract: {
      id: contract.id,
      version: contract.version,
      profileId: contract.profileId,
      profileVersion: contract.profileVersion,
      profileLabel: APPLICATION_PROFILE.label,
    },
    requiredChanges: gaps.conformance.map((item) => ({
      field: item.field,
      label: profileField(item.field)?.label ?? item.field,
      required: value(contract, item.field)?.value ?? "",
      observed: item.observed,
      change: item.change,
    })),
    blockers: gaps.blockers.map((item) => ({
      field: item.field,
      label: item.label,
      reason: `${item.blocker}: ${item.reason}`,
    })),
    scope: {
      allowed:
        "Application source, configuration examples, migrations, tests and the Dockerfile under the repository root, as needed to resolve the required changes.",
      forbidden: SENSITIVE_PATH_PATTERNS.map((entry) => entry.reason).filter(
        (reason, index, all) => all.indexOf(reason) === index,
      ),
      sensitive: SENSITIVE_PATH_PATTERNS.map((entry) => entry.pattern.source),
    },
    acceptance: {
      definitionVersion: CONFORMANCE_DEFINITION.version,
      checks: CONFORMANCE_DEFINITION.checks.map((check) => ({ ...check })),
      applicationBehavior: acceptance,
      configuration: executionConfiguration(contract),
    },
    exclusions: [
      "No deployment, infrastructure, DNS, hostname or production database work; those are later phases.",
      "No merge by Server Guy: it publishes a reviewable branch and pull request, and the engineer merges on GitHub.",
      "No workflow, hook, credential or secret file changes; they are separately sensitive scope.",
      "No release artifact or image build decisions (F-8), backup or telemetry policy (U1), rollback expectation (U16) or required verification set (U15): still open.",
      "No changes that resolve a blocker by choosing for the engineer.",
    ],
    exportText: "",
  };
  brief.exportText = briefExportText(brief);
  return brief;
}
