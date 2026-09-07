import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  APPLICATION_PROFILE,
  profileField,
  profileRule,
  type ProfileField,
} from "./application-profile";
import { looksLikeSecret } from "./secrets";
import type {
  ApplicationContractBody,
  ApplicationContractProposal,
  ApplicationContractRecord,
  ChatMessage,
  ContractCitation,
  ContractField,
  ContractGapReport,
  ContractProvenance,
  Decision,
  Observation,
  ProfileResolution,
  RepositoryCitation,
} from "./types";

/** Bound on the values and citations one contract may carry. */
export const CONTRACT_LIMITS = {
  fields: 40,
  valueCharacters: 500,
  snippetCharacters: 400,
  textCharacters: 600,
  reportedIssues: 12,
} as const;

const id = Type.String({ minLength: 1, maxLength: 64 });
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });

export const repositoryCitationSchema = Type.Object(
  {
    observationId: id,
    path: text(512),
    snippet: text(CONTRACT_LIMITS.snippetCharacters),
  },
  {
    additionalProperties: false,
    description:
      "A verbatim excerpt of a repository file read in this phase: the Observation ID and path returned by read_repository_file, and a snippet copied exactly from its content.",
  },
);
export const absenceCitationSchema = Type.Object(
  {
    observationId: id,
    absent: text(512),
  },
  {
    additionalProperties: false,
    description:
      "A path proven absent by the inspection tree: the inspection Observation ID from get_repository_inspection and the missing path.",
  },
);
const citationSchema = Type.Union([
  repositoryCitationSchema,
  absenceCitationSchema,
]);
const blockerSchema = Type.Union([
  Type.Literal("unknown"),
  Type.Literal("contradiction"),
  Type.Literal("unsupported"),
]);

export const provenanceSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("repository-declared"),
      citation: repositoryCitationSchema,
    },
    {
      additionalProperties: false,
      description:
        "The value appears verbatim in the cited snippet of a file that was read.",
    },
  ),
  Type.Object(
    { kind: Type.Literal("profile-rule"), ruleId: text(80) },
    {
      additionalProperties: false,
      description:
        "The value is the profile convention identified by ruleId, exactly as get_repository_inspection lists it, for the one field that rule governs.",
    },
  ),
  Type.Object(
    {
      kind: Type.Literal("user-confirmed"),
      source: Type.Union([
        Type.Object(
          {
            type: Type.Literal("message"),
            messageId: id,
            quote: text(CONTRACT_LIMITS.snippetCharacters),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          { type: Type.Literal("decision"), decisionId: id },
          { additionalProperties: false },
        ),
      ]),
    },
    {
      additionalProperties: false,
      description:
        "The engineer chose the value: quote their own message (the userMessageId in the run context) verbatim, or cite an active saved Decision.",
    },
  ),
  Type.Object(
    { kind: Type.Literal("inferred"), citation: citationSchema },
    {
      additionalProperties: false,
      description:
        "Server Guy's interpretation of cited repository content; use when the value is not a verbatim declaration.",
    },
  ),
  Type.Object(
    {
      kind: Type.Literal("unresolved"),
      blocker: blockerSchema,
      reason: text(CONTRACT_LIMITS.textCharacters),
      observed: Type.Optional(text(CONTRACT_LIMITS.textCharacters)),
      citation: Type.Optional(citationSchema),
    },
    {
      additionalProperties: false,
      description:
        "No supported value: unknown (not determinable from evidence), contradiction (the repository conflicts with the profile) or unsupported. Blocks Phase 2 until resolved.",
    },
  ),
  Type.Object(
    {
      kind: Type.Literal("unresolved"),
      blocker: Type.Literal("policy"),
      dependency: text(16),
      reason: text(CONTRACT_LIMITS.textCharacters),
    },
    {
      additionalProperties: false,
      description:
        "An open product policy (U1, U15, U16, F-8) that a later launch gate requires; visible now, not decided here.",
    },
  ),
]);

export const contractFieldSchema = Type.Object(
  {
    key: text(80),
    value: Type.Union([text(CONTRACT_LIMITS.valueCharacters), Type.Null()]),
    provenance: provenanceSchema,
    conformance: Type.Optional(
      Type.Object(
        {
          observed: text(CONTRACT_LIMITS.textCharacters),
          change: text(CONTRACT_LIMITS.textCharacters),
          citation: Type.Optional(citationSchema),
        },
        {
          additionalProperties: false,
          description:
            "Known Phase 3 work: what the repository currently does and the change required to meet the value.",
        },
      ),
    ),
  },
  { additionalProperties: false },
);

const profileSelectionSchema = Type.Object(
  {
    profileId: text(80),
    rationale: text(CONTRACT_LIMITS.textCharacters),
    citations: Type.Array(repositoryCitationSchema, {
      minItems: 1,
      maxItems: 8,
    }),
  },
  {
    additionalProperties: false,
    description:
      "Your evidence-backed choice from the available supported profiles. Explain the actual application, distinguish development tooling from runtime services, and cite the files you chose to read. A profile selection is interpretation, not a successful build or execution.",
  },
);

/** Pi selects a supported profile; the commit is bound server-side. */
export const contractProposalParameters = Type.Object(
  {
    summary: text(CONTRACT_LIMITS.textCharacters),
    profileSelection: Type.Optional(profileSelectionSchema),
    fields: Type.Array(contractFieldSchema, {
      minItems: 1,
      maxItems: CONTRACT_LIMITS.fields,
    }),
    revises: Type.Optional(
      Type.String({
        description:
          "The exact ID of the current Application Contract this proposal replaces. Omit for the first contract.",
        minLength: 1,
        maxLength: 64,
      }),
    ),
  },
  { additionalProperties: false },
);

export const contractBodySchema = Type.Object(
  {
    profileId: text(80),
    profileVersion: Type.Integer({ minimum: 1 }),
    commitSha: Type.String({ pattern: "^[a-f0-9]{40}$" }),
    summary: text(CONTRACT_LIMITS.textCharacters),
    profileSelection: Type.Optional(profileSelectionSchema),
    fields: Type.Array(
      Type.Object(
        {
          ...contractFieldSchema.properties,
          provenance: provenanceSchema,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: CONTRACT_LIMITS.fields },
    ),
  },
  { additionalProperties: false },
);

export class ContractValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Contract rejected:\n${issues
        .slice(0, CONTRACT_LIMITS.reportedIssues)
        .map((issue, index) => `${index + 1}. ${issue}`)
        .join("\n")}${
        issues.length > CONTRACT_LIMITS.reportedIssues
          ? `\n… and ${issues.length - CONTRACT_LIMITS.reportedIssues} more.`
          : ""
      }`,
    );
  }
}

export interface ContractValidationContext {
  applicationId: string;
  /** The latest passed inspection made with the current connection. */
  commitSha: string;
  profile: ProfileResolution;
  currentContract: ApplicationContractRecord | null;
  lookups: {
    observation(id: string): Observation | null;
    activeDecision(id: string): Decision | null;
    applicationMessage(id: string): ChatMessage | null;
  };
}

type Resolved = { ok: true; line?: number } | { ok: false; reason: string };

function fileContent(observation: Observation): string | null {
  const raw = observation.raw;
  return raw &&
    typeof raw === "object" &&
    "content" in raw &&
    typeof raw.content === "string"
    ? raw.content
    : null;
}

function rawString(observation: Observation, key: string): string | null {
  const raw = observation.raw as Record<string, unknown> | null;
  return raw && typeof raw[key] === "string" ? (raw[key] as string) : null;
}

function inspectedPaths(observation: Observation): string[] | null {
  const raw = observation.raw as Record<string, unknown> | null;
  const entries = raw?.entries;
  return Array.isArray(entries)
    ? entries
        .map((entry) =>
          entry && typeof entry === "object" && "path" in entry
            ? String(entry.path)
            : "",
        )
        .filter(Boolean)
    : null;
}

/**
 * A citation resolves only against a saved record of this application at the
 * contract's commit. A path existing or a snippet matching validates the
 * reference; it does not by itself prove an arbitrary value.
 */
export function resolveCitation(
  citation: ContractCitation,
  context: Pick<ContractValidationContext, "applicationId" | "commitSha"> & {
    lookups: Pick<ContractValidationContext["lookups"], "observation">;
  },
): Resolved {
  if ("absent" in citation) {
    const inspection = context.lookups.observation(citation.observationId);
    if (
      !inspection ||
      inspection.applicationId !== context.applicationId ||
      inspection.kind !== "github-repository-inspection" ||
      inspection.status !== "passed"
    )
      return {
        ok: false,
        reason: `absence must cite a passed repository inspection of this application, not ${citation.observationId}`,
      };
    if (rawString(inspection, "commitSha") !== context.commitSha)
      return {
        ok: false,
        reason: `the cited inspection is at ${rawString(inspection, "commitSha")?.slice(0, 8) ?? "an unknown commit"}, not the contract commit ${context.commitSha.slice(0, 8)}`,
      };
    const paths = inspectedPaths(inspection);
    const truncated = Boolean(
      (inspection.raw as Record<string, unknown> | null)?.truncated,
    );
    const path = citation.absent.replace(/^\/+/, "");
    if (!paths || truncated)
      return {
        ok: false,
        reason: `the inspection tree was truncated, so ${path} is not proven absent`,
      };
    if (
      paths.includes(path) ||
      paths.some((entry) => entry.startsWith(`${path}/`))
    )
      return { ok: false, reason: `${path} exists in the inspected tree` };
    return { ok: true };
  }
  const observation = context.lookups.observation(citation.observationId);
  if (
    !observation ||
    observation.applicationId !== context.applicationId ||
    observation.kind !== "github-repository-file" ||
    observation.status !== "passed"
  )
    return {
      ok: false,
      reason: `Observation ${citation.observationId} is not a saved repository-file read of this application`,
    };
  const commit = rawString(observation, "commitSha");
  if (commit !== context.commitSha)
    return {
      ok: false,
      reason: `${citation.path} was read at ${commit?.slice(0, 8) ?? "an unknown commit"}, but the current inspection is at ${context.commitSha.slice(0, 8)}; read it again`,
    };
  if (rawString(observation, "path") !== citation.path)
    return {
      ok: false,
      reason: `Observation ${citation.observationId} is a read of ${rawString(observation, "path")}, not ${citation.path}`,
    };
  const content = fileContent(observation);
  if (content === null)
    return { ok: false, reason: `${citation.path} has no readable content` };
  const index = content.indexOf(citation.snippet);
  if (index < 0)
    return {
      ok: false,
      reason: `the quoted snippet does not occur verbatim in ${citation.path}`,
    };
  return {
    ok: true,
    line: content.slice(0, index).split("\n").length,
  };
}

function policyOf(field: ProfileField) {
  return "policy" in field ? field.policy : null;
}

function withLine(
  citation: RepositoryCitation,
  resolved: Resolved,
): RepositoryCitation {
  return resolved.ok && resolved.line !== undefined
    ? { ...citation, line: resolved.line }
    : citation;
}

/**
 * Every string leaf of a proposal (summary, values, quotes, snippets, reasons,
 * paths, ids) is checked against the supported credential shapes before any
 * other validation, so no later message can echo a matched value. Reports the
 * JSON path only. Pattern matching bounds the risk; it does not detect every
 * secret.
 */
export function credentialShapedPaths(value: unknown, path = ""): string[] {
  if (typeof value === "string")
    return looksLikeSecret(value) ? [path || "/"] : [];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      credentialShapedPaths(item, `${path}/${index}`),
    );
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      credentialShapedPaths(item, `${path}/${key}`),
    );
  return [];
}

/**
 * Validates a proposal against current records and returns the normalized
 * proposal (values trimmed, citation lines computed). Called when Pi proposes,
 * for feedback, and again inside the final transaction, as the guard.
 */
export function validateContractProposal(
  input: unknown,
  context: ContractValidationContext,
): ApplicationContractProposal {
  if (!Value.Check(contractProposalParameters, input))
    throw new ContractValidationError(
      [...Value.Errors(contractProposalParameters, input)]
        .slice(0, CONTRACT_LIMITS.reportedIssues)
        .map((error) => `${error.instancePath || "/"}: ${error.message}`),
    );
  const credentialShaped = credentialShapedPaths(input);
  if (credentialShaped.length)
    throw new ContractValidationError(
      credentialShaped.map(
        (path) =>
          `${path}: credential-shaped text is never recorded in a contract; remove it and describe the setting by name`,
      ),
    );
  const selection =
    input.profileSelection ?? context.currentContract?.body.profileSelection;
  if (!selection)
    throw new ContractValidationError([
      "Select an available application profile with profileSelection: explain your interpretation and cite the repository files you read. Filenames alone do not select a profile.",
    ]);
  const issues: string[] = [];
  if (selection.profileId !== APPLICATION_PROFILE.id)
    issues.push(
      `Profile ${selection.profileId} is not currently supported. Describe the application accurately and explain the capability limitation; do not relabel it as ${APPLICATION_PROFILE.label}.`,
    );
  for (const citation of selection.citations) {
    const resolved = resolveCitation(citation, context);
    if (!resolved.ok) issues.push(`Profile selection: ${resolved.reason}`);
  }
  const seen = new Set<string>();
  const fields: ContractField[] = [];
  for (const field of input.fields) {
    const definition = profileField(field.key);
    if (!definition) {
      issues.push(`${field.key}: not a field of ${context.profile.label}`);
      continue;
    }
    if (seen.has(field.key)) {
      issues.push(`${field.key}: listed more than once`);
      continue;
    }
    seen.add(field.key);
    const value = field.value?.trim() ?? null;
    if (field.value !== null && !value) {
      issues.push(`${field.key}: value is empty; use null when unresolved`);
      continue;
    }
    const policy = policyOf(definition);
    const provenance = field.provenance;
    let normalized: ContractProvenance = provenance;
    if (provenance.kind === "unresolved") {
      if (value !== null) {
        issues.push(`${field.key}: an unresolved field has no value`);
        continue;
      }
      if (provenance.blocker === "policy") {
        if (!policy || policy.dependency !== provenance.dependency) {
          issues.push(
            policy
              ? `${field.key}: its open policy is ${policy.dependency}, not ${provenance.dependency}`
              : `${field.key}: not a policy field; use unknown, contradiction or unsupported with a reason`,
          );
          continue;
        }
      } else if (provenance.citation) {
        const resolved = resolveCitation(provenance.citation, context);
        if (!resolved.ok) {
          issues.push(`${field.key}: ${resolved.reason}`);
          continue;
        }
        if ("snippet" in provenance.citation)
          normalized = {
            ...provenance,
            citation: withLine(provenance.citation, resolved),
          };
      }
    } else {
      if (policy && !("optional" in policy && policy.optional)) {
        issues.push(
          `${field.key}: ${policy.question} Record it as unresolved with dependency ${policy.dependency}.`,
        );
        continue;
      }
      if (value === null) {
        issues.push(`${field.key}: a resolved field needs a value`);
        continue;
      }
      if (provenance.kind === "repository-declared") {
        const resolved = resolveCitation(provenance.citation, context);
        if (!resolved.ok) {
          issues.push(`${field.key}: ${resolved.reason}`);
          continue;
        }
        if (!provenance.citation.snippet.includes(value)) {
          issues.push(
            `${field.key}: "${value}" is not a verbatim part of the cited snippet; label it inferred, or unresolved if the repository does not declare it`,
          );
          continue;
        }
        normalized = {
          kind: "repository-declared",
          citation: withLine(provenance.citation, resolved),
        };
      } else if (provenance.kind === "profile-rule") {
        const rule = profileRule(provenance.ruleId);
        if (!rule) {
          issues.push(
            `${field.key}: ${provenance.ruleId} is not a rule of ${APPLICATION_PROFILE.id}@${APPLICATION_PROFILE.version}`,
          );
          continue;
        }
        if (rule.field !== field.key) {
          issues.push(
            `${field.key}: rule ${provenance.ruleId} governs ${rule.field}, not ${field.key}; cite the rule for this field or another provenance`,
          );
          continue;
        }
        if (rule.value !== value) {
          issues.push(
            `${field.key}: rule ${provenance.ruleId} sets "${rule.value}", not "${value}"; a different value is not a profile rule`,
          );
          continue;
        }
      } else if (provenance.kind === "user-confirmed") {
        if (provenance.source.type === "decision") {
          const decision = context.lookups.activeDecision(
            provenance.source.decisionId,
          );
          if (!decision || decision.applicationId !== context.applicationId) {
            issues.push(
              `${field.key}: Decision ${provenance.source.decisionId} is not an active saved requirement of this application`,
            );
            continue;
          }
        } else {
          const message = context.lookups.applicationMessage(
            provenance.source.messageId,
          );
          if (
            !message ||
            message.role !== "user" ||
            message.source !== "user"
          ) {
            issues.push(
              `${field.key}: message ${provenance.source.messageId} is not one of the engineer's own messages in this application`,
            );
            continue;
          }
          if (!message.body.includes(provenance.source.quote)) {
            issues.push(
              `${field.key}: the quote does not occur verbatim in the engineer's message`,
            );
            continue;
          }
        }
      } else {
        const resolved = resolveCitation(provenance.citation, context);
        if (!resolved.ok) {
          issues.push(`${field.key}: ${resolved.reason}`);
          continue;
        }
        if ("snippet" in provenance.citation)
          normalized = {
            kind: "inferred",
            citation: withLine(provenance.citation, resolved),
          };
      }
    }
    let conformance = field.conformance;
    if (conformance) {
      if (value === null) {
        issues.push(
          `${field.key}: conformance work needs the value the repository must meet`,
        );
        continue;
      }
      if (conformance.citation) {
        const resolved = resolveCitation(conformance.citation, context);
        if (!resolved.ok) {
          issues.push(`${field.key}: conformance citation: ${resolved.reason}`);
          continue;
        }
        if ("snippet" in conformance.citation)
          conformance = {
            ...conformance,
            citation: withLine(conformance.citation, resolved),
          };
      }
    }
    fields.push({
      key: field.key,
      value,
      provenance: normalized,
      ...(conformance ? { conformance } : {}),
    });
  }
  const missing = APPLICATION_PROFILE.fields
    .map((field) => field.key)
    .filter((key) => !seen.has(key));
  if (missing.length)
    issues.push(
      `Missing material fields: ${missing.join(", ")}. Record each one, as unresolved with a reason when the repository does not answer it.`,
    );
  if (context.currentContract) {
    if (input.revises !== context.currentContract.id)
      issues.push(
        `Application Contract v${context.currentContract.version} (${context.currentContract.id}) already exists. Supply revises with that exact ID to revise it.`,
      );
  } else if (input.revises)
    issues.push("There is no contract to revise yet; omit revises.");
  if (issues.length) throw new ContractValidationError(issues);
  return {
    body: {
      profileId: context.profile.profileId,
      profileVersion: context.profile.profileVersion,
      commitSha: context.commitSha,
      summary: input.summary.trim(),
      profileSelection: selection,
      fields: APPLICATION_PROFILE.fields.map((definition) =>
        fields.find((field) => field.key === definition.key)!,
      ),
    },
    revises: input.revises ?? null,
  };
}

export function contractFieldLabel(key: string) {
  return profileField(key)?.label ?? key;
}

/** Derived, never stored: what blocks Phase 2, what Phase 3 owes, and which
 * product policies stay open until their later gates. */
export function contractGapReport(
  body: ApplicationContractBody,
): ContractGapReport {
  const report: ContractGapReport = {
    blockers: [],
    conformance: [],
    policies: [],
  };
  for (const field of body.fields) {
    const label = contractFieldLabel(field.key);
    if (field.provenance.kind === "unresolved") {
      if (field.provenance.blocker === "policy") {
        const definition = profileField(field.key);
        const policy = definition ? policyOf(definition) : null;
        report.policies.push({
          field: field.key,
          label,
          dependency: field.provenance.dependency,
          requiredBeforePhase: policy?.requiredBeforePhase ?? 9,
          reason: field.provenance.reason,
        });
      } else
        report.blockers.push({
          field: field.key,
          label,
          blocker: field.provenance.blocker,
          reason: field.provenance.reason,
          observed: field.provenance.observed ?? null,
        });
    }
    if (field.conformance)
      report.conformance.push({
        field: field.key,
        label,
        observed: field.conformance.observed,
        change: field.conformance.change,
      });
  }
  return report;
}

/**
 * Re-resolves every field's source against current records: a replaced
 * Decision, a re-inspected commit or a changed profile rule makes the field's
 * provenance stale. Stale provenance is reported, never silently accepted.
 */
export function reviewContractProvenance(
  contract: ApplicationContractRecord,
  context: Omit<ContractValidationContext, "profile" | "currentContract">,
): Array<{ field: string; reason: string }> {
  const issues: Array<{ field: string; reason: string }> = [];
  const check = (field: string, citation: ContractCitation | undefined) => {
    if (!citation) return;
    const resolved = resolveCitation(citation, context);
    if (!resolved.ok) issues.push({ field, reason: resolved.reason });
  };
  for (const field of contract.body.fields) {
    const provenance = field.provenance;
    if (
      provenance.kind === "repository-declared" ||
      provenance.kind === "inferred"
    )
      check(field.key, provenance.citation);
    else if (provenance.kind === "profile-rule") {
      const rule = profileRule(provenance.ruleId);
      if (!rule)
        issues.push({
          field: field.key,
          reason: `rule ${provenance.ruleId} no longer exists in the current profile`,
        });
      else if (rule.field !== field.key)
        issues.push({
          field: field.key,
          reason: `rule ${provenance.ruleId} governs ${rule.field}, not this field`,
        });
      else if (rule.value !== field.value)
        issues.push({
          field: field.key,
          reason: `rule ${provenance.ruleId} now sets "${rule.value}"`,
        });
    } else if (provenance.kind === "user-confirmed") {
      if (provenance.source.type === "decision") {
        const decision = context.lookups.activeDecision(
          provenance.source.decisionId,
        );
        if (!decision || decision.applicationId !== context.applicationId)
          issues.push({
            field: field.key,
            reason: "the cited saved requirement was replaced or removed",
          });
      } else if (
        !context.lookups.applicationMessage(provenance.source.messageId)
      )
        issues.push({
          field: field.key,
          reason: "the cited engineer message no longer exists",
        });
    } else if (provenance.blocker !== "policy")
      check(field.key, provenance.citation);
    check(field.key, field.conformance?.citation);
  }
  return issues;
}

/** "health.path: /health → /healthz" for Activity, bounded to five fields. */
export function describeContractChanges(
  previous: ApplicationContractBody,
  next: ApplicationContractBody,
) {
  const before = new Map(previous.fields.map((field) => [field.key, field]));
  const changed = next.fields.filter((field) => {
    const old = before.get(field.key);
    return (
      !old ||
      old.value !== field.value ||
      old.provenance.kind !== field.provenance.kind ||
      JSON.stringify(old.conformance ?? null) !==
        JSON.stringify(field.conformance ?? null)
    );
  });
  const describe = (field: ContractField) => {
    const old = before.get(field.key);
    if (old && old.value === field.value) {
      const details: string[] = [];
      if (old.provenance.kind !== field.provenance.kind)
        details.push(
          `source changed from ${old.provenance.kind} to ${field.provenance.kind}`,
        );
      if (
        JSON.stringify(old.conformance ?? null) !==
        JSON.stringify(field.conformance ?? null)
      )
        details.push(
          field.conformance
            ? "required source change updated"
            : "required source change resolved",
        );
      return `${contractFieldLabel(field.key)}: ${details.join(", ")} (value unchanged)`;
    }
    const show = (item: ContractField | undefined) =>
      item === undefined
        ? "(new)"
        : item.value === null
          ? `unresolved (${item.provenance.kind === "unresolved" ? item.provenance.blocker : "?"})`
          : item.value;
    return `${contractFieldLabel(field.key)}: ${show(old)} → ${show(field)}`;
  };
  const shown = changed.slice(0, 5).map(describe);
  if (changed.length > 5) shown.push(`and ${changed.length - 5} more`);
  return { count: changed.length, detail: shown.join("; ") };
}
