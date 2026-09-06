import {
  currentContract,
  findRepositoryFileObservation,
  getActiveDecision,
  getApplicationMessage,
  getObservation,
  insertActivity,
  insertContract,
  insertObservation,
  latestObservation,
  listObservations,
  listRepositoryFileObservations,
  supersedeContract,
} from "./db";
import {
  APPLICATION_PROFILE,
  resolveApplicationProfile,
  type InspectedTreeEntry,
} from "./application-profile";
import {
  contractGapReport,
  describeContractChanges,
  reviewContractProvenance,
  validateContractProposal,
  type ContractValidationContext,
} from "./application-contract";
import { GithubAccessError } from "./github-api";
import { classifyGithubFailure, inspectGithubRepository } from "./github";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
} from "./github-connection";
import {
  fetchRepositoryFile,
  fetchRepositoryTree,
  INSPECTION_LIMITS,
  normalizeRepositoryPath,
  RepositoryPathError,
} from "./github-inspection";
import { REPOSITORY_OBSERVATION } from "./phase-one-evidence";
import { observationMatchesConnection } from "./phase-one-spec";
import { deniedPathReason } from "./secrets";
import type {
  ApplicationContractProposal,
  ApplicationContractView,
  ApplicationRecord,
  ContractCitation,
  Observation,
  PhaseWorkspaceRecord,
  PiRun,
  ProfileResolution,
  RepositoryInspectionSummary,
} from "./types";
import { loadApplication, loadChat } from "./workspaces";

export const INSPECTION_OBSERVATION = "github-repository-inspection";
export const FILE_OBSERVATION = "github-repository-file";

interface InspectionRaw {
  connectionId?: string;
  repositoryId?: number;
  defaultBranch?: string;
  commitSha?: string;
  treeUrl?: string;
  entries?: InspectedTreeEntry[];
  truncated?: boolean;
  checkedAt?: string;
  resolutionFiles?: string[];
  error?: string;
}

function inspectionRaw(observation: Observation | null): InspectionRaw {
  return observation?.raw && typeof observation.raw === "object"
    ? (observation.raw as InspectionRaw)
    : {};
}

function fileRaw(observation: Observation) {
  return observation.raw as {
    path?: string;
    content?: string;
    size?: number;
    commitSha?: string;
  };
}

export function latestInspection(applicationId: string) {
  return latestObservation(applicationId, INSPECTION_OBSERVATION);
}

export interface RepositoryEvidence {
  inspection: Observation | null;
  connectionId: string | null;
  /** Passed, and made with the current GitHub connection. */
  current: boolean;
  commitSha: string | null;
  defaultBranch: string | null;
  entries: InspectedTreeEntry[];
  truncated: boolean;
  files: Observation[];
  resolution: ProfileResolution;
}

/**
 * Current Phase 2 evidence: the latest inspection, whether it can support
 * checks, the files saved at its commit and the profile it resolves to. Read
 * from records on every call; nothing is cached.
 */
export function repositoryEvidence(applicationId: string): RepositoryEvidence {
  const inspection = latestInspection(applicationId);
  const connectionId = currentGithubConnectionId();
  const raw = inspectionRaw(inspection);
  const passed = inspection?.status === "passed";
  const current =
    passed && observationMatchesConnection(inspection, connectionId);
  const commitSha = passed ? (raw.commitSha ?? null) : null;
  const entries = passed ? (raw.entries ?? []) : [];
  const files = commitSha
    ? listRepositoryFileObservations(applicationId, commitSha)
    : [];
  const contents = new Map<string, string>();
  for (const file of files) {
    const { path, content } = fileRaw(file);
    if (typeof path === "string" && typeof content === "string")
      contents.set(path, content);
  }
  return {
    inspection,
    connectionId,
    current,
    commitSha,
    defaultBranch: passed ? (raw.defaultBranch ?? null) : null,
    entries,
    truncated: Boolean(raw.truncated),
    files,
    resolution: resolveApplicationProfile({
      inspected: current,
      entries,
      files: contents,
    }),
  };
}

export function inspectionSummary(
  evidence: RepositoryEvidence,
): RepositoryInspectionSummary | null {
  const { inspection } = evidence;
  if (!inspection) return null;
  return {
    observationId: inspection.id,
    status: inspection.status,
    summary: inspection.summary,
    observedAt: inspection.observedAt,
    commitSha: evidence.commitSha,
    defaultBranch: evidence.defaultBranch,
    current: evidence.current,
    entries: evidence.entries.length,
    truncated: evidence.truncated,
    filesRead: evidence.files.length,
    profile: evidence.resolution,
  };
}

function lookups(applicationId: string): ContractValidationContext["lookups"] {
  return {
    observation: getObservation,
    activeDecision: (id) => getActiveDecision(applicationId, id),
    applicationMessage: (id) => getApplicationMessage(applicationId, id),
  };
}

export function contractView(
  applicationId: string,
): ApplicationContractView | null {
  const record = currentContract(applicationId);
  if (!record) return null;
  return {
    ...record,
    gaps: contractGapReport(record.body),
    provenanceIssues: reviewContractProvenance(record, {
      applicationId,
      commitSha: record.commitSha,
      lookups: lookups(applicationId),
    }),
  };
}

// Repository inspection: deterministic, read-only, pinned to one commit.

const inspections = new Map<string, Promise<Observation>>();

function recordedRepositoryId(applicationId: string) {
  const recorded = listObservations(applicationId).find(
    (observation) =>
      observation.kind === REPOSITORY_OBSERVATION &&
      observation.status === "passed" &&
      observation.raw &&
      typeof observation.raw === "object" &&
      "repositoryId" in observation.raw,
  );
  const raw = recorded?.raw as { repositoryId?: unknown } | undefined;
  return typeof raw?.repositoryId === "number" ? raw.repositoryId : undefined;
}

function fullName(application: ApplicationRecord) {
  return `${application.repositoryOwner}/${application.repositoryName}`;
}

function shortSha(sha: string | null | undefined) {
  return sha?.slice(0, 8) ?? "unknown";
}

async function recordRepositoryFile(
  application: ApplicationRecord,
  connectionId: string,
  commitSha: string,
  path: string,
  token: string,
  options: { signal?: AbortSignal; size?: number } = {},
) {
  const existing = findRepositoryFileObservation(
    application.id,
    commitSha,
    path,
  );
  if (existing) return { observation: existing, cached: true };
  const read = await fetchRepositoryFile(
    fullName(application),
    commitSha,
    path,
    token,
    options,
  );
  const notes = [
    `${read.size} bytes`,
    ...(read.binary ? ["binary, content not stored"] : []),
    ...(read.truncated
      ? [`truncated to ${INSPECTION_LIMITS.fileBytes} bytes`]
      : []),
    ...(read.redactedCount
      ? [
          `${read.redactedCount} credential-shaped value${read.redactedCount === 1 ? "" : "s"} redacted`,
        ]
      : []),
  ];
  const observation = insertObservation({
    applicationId: application.id,
    kind: FILE_OBSERVATION,
    status: "passed",
    summary: `Read ${path} at ${shortSha(commitSha)} (${notes.join(", ")}).`,
    sourceLabel: `Repository file · ${path}`,
    sourceUrl: `${application.repositoryUrl}/blob/${commitSha}/${path}`,
    raw: {
      connectionId,
      commitSha,
      path,
      blobSha: read.blobSha,
      size: read.size,
      content: read.content,
      truncated: read.truncated,
      binary: read.binary,
      redactedCount: read.redactedCount,
      checkedAt: new Date().toISOString(),
    },
  });
  return { observation, cached: false };
}

async function performInspection(
  application: ApplicationRecord,
  workspace: PhaseWorkspaceRecord,
): Promise<Observation> {
  const checkedAt = new Date().toISOString();
  const name = fullName(application);
  const record = (
    status: Observation["status"],
    summary: string,
    raw: InspectionRaw,
  ) => {
    const observation = insertObservation({
      applicationId: application.id,
      kind: INSPECTION_OBSERVATION,
      status,
      summary,
      sourceLabel: "Repository inspection",
      sourceUrl: raw.commitSha
        ? `${application.repositoryUrl}/tree/${raw.commitSha}`
        : application.repositoryUrl,
      raw: { ...raw, checkedAt, limits: INSPECTION_LIMITS },
    });
    insertActivity(
      workspace.id,
      status === "passed"
        ? "repository-inspected"
        : "repository-inspection-failed",
      status === "passed"
        ? "Repository inspected"
        : "Repository inspection did not pass",
      observation.summary,
    );
    return observation;
  };
  const identity = await inspectGithubRepository(
    {
      owner: application.repositoryOwner,
      name: application.repositoryName,
      canonicalUrl: application.repositoryUrl,
    },
    recordedRepositoryId(application.id),
  );
  if (identity.status !== "passed")
    return record(
      identity.status,
      `Repository inspection did not pass: ${identity.summary}`,
      { connectionId: identity.raw.connectionId, error: identity.raw.error },
    );
  const { commitSha, connectionId, defaultBranch, repositoryId } = identity.raw;
  if (!commitSha || !connectionId)
    return record(
      "unavailable",
      "Repository inspection is unavailable: no commit was recorded.",
      {},
    );
  try {
    const credential = await connectedGithubCredential();
    if (credential.connection.id !== connectionId)
      throw new GithubAccessError(
        "The GitHub connection changed during this inspection. Run it again.",
        "auth",
      );
    const tree = await fetchRepositoryTree(name, commitSha, credential.token);
    const resolutionFiles: string[] = [];
    for (const path of APPLICATION_PROFILE.resolutionFiles) {
      const entry = tree.entries.find(
        (candidate) => candidate.path === path && candidate.type === "blob",
      );
      if (!entry) continue;
      try {
        await recordRepositoryFile(
          application,
          connectionId,
          commitSha,
          path,
          credential.token,
          { size: entry.size },
        );
        resolutionFiles.push(path);
      } catch (error) {
        // A denied or unreadable manifest is reported by the profile
        // criteria; a provider failure is not, so it fails the inspection.
        if (!(error instanceof RepositoryPathError)) throw error;
      }
    }
    const blobs = tree.entries.filter((entry) => entry.type === "blob").length;
    const directories = tree.entries.length - blobs;
    return record(
      "passed",
      `Inspected ${name} at ${defaultBranch} · ${shortSha(commitSha)}: ${blobs} files in ${directories} directories${tree.truncated ? " (tree truncated)" : ""}.`,
      {
        connectionId,
        repositoryId,
        defaultBranch,
        commitSha,
        treeUrl: `${application.repositoryUrl}/tree/${commitSha}`,
        entries: tree.entries,
        truncated: tree.truncated,
        resolutionFiles,
      },
    );
  } catch (error) {
    const failure = classifyGithubFailure(error);
    return record(
      failure.status,
      failure.status === "unavailable"
        ? `Repository inspection is unavailable: ${failure.reason}`
        : `Repository inspection did not pass: ${failure.reason}`,
      { connectionId, commitSha, defaultBranch, error: failure.reason },
    );
  }
}

/**
 * Pins the default branch to an exact commit, records the bounded tree and
 * reads only the profile's resolution manifest. Every other file is Pi's
 * choice during a Run. Concurrent requests share one inspection.
 */
export async function inspectRepository(applicationId: string) {
  const { application, current } = loadApplication(applicationId);
  if (current.phaseKey !== "inspect-app" || current.completedAt)
    throw new Error(
      "Repository inspection belongs to Inspect app. Complete the Launch Brief first.",
    );
  const pending = inspections.get(application.id);
  if (pending) return pending;
  const work = performInspection(application, current);
  inspections.set(application.id, work);
  try {
    return await work;
  } finally {
    inspections.delete(application.id);
  }
}

// Reads Pi performs during a Run.

export interface RunReadBudget {
  reads: number;
  bytes: number;
}

export function newRunReadBudget(): RunReadBudget {
  return { reads: 0, bytes: 0 };
}

function requireCurrentInspection(applicationId: string) {
  const evidence = repositoryEvidence(applicationId);
  if (!evidence.inspection)
    throw new Error(
      "The repository has not been inspected in this phase. Ask the engineer to use Inspect repository in the check details.",
    );
  if (!evidence.current || !evidence.commitSha)
    throw new Error(
      evidence.inspection.status === "passed"
        ? "The latest inspection used a previous GitHub connection. Ask the engineer to re-inspect the repository with the current connection."
        : `The latest inspection did not pass: ${evidence.inspection.summary} Ask the engineer to re-inspect the repository.`,
    );
  return evidence as RepositoryEvidence & { commitSha: string };
}

export const TREE_LISTING_LIMIT = 400;

/** The local projection behind `get_repository_inspection`. */
export function repositoryInspectionForRun(
  run: PiRun,
  input: { prefix?: string } = {},
) {
  const { application, workspace } = loadChat(run.applicationId, run.chatId);
  const evidence = repositoryEvidence(application.id);
  const prefix = input.prefix?.replace(/^\/+/, "") ?? "";
  const matching = evidence.entries.filter((entry) =>
    entry.path.startsWith(prefix),
  );
  return {
    retrievedAt: new Date().toISOString(),
    phaseKey: workspace.phaseKey,
    inspection: evidence.inspection
      ? {
          observationId: evidence.inspection.id,
          status: evidence.inspection.status,
          summary: evidence.inspection.summary,
          observedAt: evidence.inspection.observedAt,
          current: evidence.current,
          commitSha: evidence.commitSha,
          defaultBranch: evidence.defaultBranch,
          treeTruncated: evidence.truncated,
        }
      : null,
    profile: {
      ...evidence.resolution,
      rules: Object.entries(APPLICATION_PROFILE.rules).map(([id, rule]) => ({
        ruleId: id,
        value: rule.value,
        label: rule.label,
        definition: rule.definition,
      })),
      fields: APPLICATION_PROFILE.fields.map((field) => ({
        key: field.key,
        group: APPLICATION_PROFILE.groups[field.group],
        label: field.label,
        definition: field.definition,
        ...("policy" in field
          ? {
              policy: {
                dependency: field.policy.dependency,
                requiredBeforePhase: field.policy.requiredBeforePhase,
                question: field.policy.question,
                optional: "optional" in field.policy && field.policy.optional,
              },
            }
          : {}),
      })),
    },
    tree: {
      prefix,
      total: matching.length,
      entries: matching
        .slice(0, TREE_LISTING_LIMIT)
        .map((entry) =>
          entry.type === "blob"
            ? `${entry.path} (${entry.size ?? "?"} bytes)`
            : `${entry.path}/`,
        ),
      truncated: matching.length > TREE_LISTING_LIMIT,
    },
    filesRead: evidence.files.map((file) => ({
      observationId: file.id,
      path: fileRaw(file).path,
      size: fileRaw(file).size,
    })),
    limits: {
      readsPerRun: INSPECTION_LIMITS.readsPerRun,
      fileCharacters: INSPECTION_LIMITS.toolContentCharacters,
    },
  };
}

/**
 * The read behind `read_repository_file`. Pinned to the current inspection's
 * commit; a successful network read is saved as an Observation before its
 * content is returned, so it stays citable after cancellation. A provider
 * failure throws, and the tree, not the provider, decides absence.
 */
export async function readRepositoryFileForRun(
  run: PiRun,
  input: { path: string },
  budget: RunReadBudget,
  signal?: AbortSignal,
) {
  const { application } = loadChat(run.applicationId, run.chatId);
  const evidence = requireCurrentInspection(application.id);
  const path = normalizeRepositoryPath(input.path);
  const denied = deniedPathReason(path);
  if (denied) throw new RepositoryPathError(`${path} is not read: ${denied}.`);
  const commitSha = evidence.commitSha;
  const bound = (content: string) =>
    content.length > INSPECTION_LIMITS.toolContentCharacters
      ? {
          content: content.slice(0, INSPECTION_LIMITS.toolContentCharacters),
          contentTruncated: true,
        }
      : { content, contentTruncated: false };
  const entry = evidence.entries.find((candidate) => candidate.path === path);
  if (!entry) {
    if (
      evidence.entries.some((candidate) =>
        candidate.path.startsWith(`${path}/`),
      )
    )
      throw new RepositoryPathError(
        `${path} is a directory; list it with get_repository_inspection using prefix "${path}/".`,
      );
    return {
      status: evidence.truncated ? ("unknown" as const) : ("absent" as const),
      path,
      commitSha,
      inspectionObservationId: evidence.inspection!.id,
      note: evidence.truncated
        ? `${path} is not in the recorded tree, but the tree was truncated, so its absence is not proven.`
        : `${path} does not exist at ${shortSha(commitSha)} according to the inspection tree. Cite this absence with observationId ${evidence.inspection!.id} and absent "${path}".`,
    };
  }
  if (entry.type === "tree")
    throw new RepositoryPathError(
      `${path} is a directory; list it with get_repository_inspection using prefix "${path}/".`,
    );
  const existing = findRepositoryFileObservation(
    application.id,
    commitSha,
    path,
  );
  if (existing) {
    const raw = fileRaw(existing) as ReturnType<typeof fileRaw> & {
      truncated?: boolean;
      binary?: boolean;
      redactedCount?: number;
    };
    return {
      status: "read" as const,
      cached: true,
      observationId: existing.id,
      observedAt: existing.observedAt,
      path,
      commitSha,
      size: raw.size,
      truncated: Boolean(raw.truncated),
      binary: Boolean(raw.binary),
      redactedCount: raw.redactedCount ?? 0,
      ...bound(raw.content ?? ""),
    };
  }
  if (budget.reads >= INSPECTION_LIMITS.readsPerRun)
    throw new Error(
      `This request has reached its limit of ${INSPECTION_LIMITS.readsPerRun} repository reads. Work with what was read, or ask the engineer to continue in a new message.`,
    );
  if (budget.bytes + (entry.size ?? 0) > INSPECTION_LIMITS.bytesPerRun)
    throw new Error(
      `Reading ${path} would exceed this request's ${INSPECTION_LIMITS.bytesPerRun}-byte read budget.`,
    );
  signal?.throwIfAborted();
  const credential = await connectedGithubCredential();
  if (credential.connection.id !== evidence.connectionId)
    throw new Error(
      "The GitHub connection changed since the inspection. Ask the engineer to re-inspect the repository.",
    );
  const { observation } = await recordRepositoryFile(
    application,
    credential.connection.id,
    commitSha,
    path,
    credential.token,
    { signal, size: entry.size },
  );
  budget.reads++;
  budget.bytes += entry.size ?? 0;
  const raw = fileRaw(observation) as ReturnType<typeof fileRaw> & {
    truncated?: boolean;
    binary?: boolean;
    redactedCount?: number;
  };
  return {
    status: "read" as const,
    cached: false,
    observationId: observation.id,
    observedAt: observation.observedAt,
    path,
    commitSha,
    size: raw.size,
    truncated: Boolean(raw.truncated),
    binary: Boolean(raw.binary),
    redactedCount: raw.redactedCount ?? 0,
    ...bound(raw.content ?? ""),
  };
}

// Contract proposals: validated when proposed, guarded when committed.

export interface StagedContract {
  proposal: ApplicationContractProposal | null;
}

function validationContext(
  applicationId: string,
  evidence: RepositoryEvidence & { commitSha: string },
): ContractValidationContext {
  return {
    applicationId,
    commitSha: evidence.commitSha,
    profile: evidence.resolution,
    currentContract: currentContract(applicationId),
    lookups: lookups(applicationId),
  };
}

export function collectContractProposal(
  run: PiRun,
  staged: StagedContract,
  input: unknown,
) {
  const { application, workspace } = loadChat(run.applicationId, run.chatId);
  if (workspace.phaseKey !== "inspect-app")
    throw new Error("Application Contracts belong to Inspect app.");
  const evidence = requireCurrentInspection(application.id);
  const context = validationContext(application.id, evidence);
  const proposal = validateContractProposal(input, context);
  const replaced = staged.proposal !== null;
  staged.proposal = proposal;
  const gaps = contractGapReport(proposal.body);
  return {
    status: "pending, not saved" as const,
    replacedEarlierProposal: replaced,
    version: (context.currentContract?.version ?? 0) + 1,
    revises: proposal.revises,
    commitSha: proposal.body.commitSha,
    fields: proposal.body.fields.length,
    blockers: gaps.blockers.map((gap) => `${gap.field}: ${gap.reason}`),
    conformanceItems: gaps.conformance.map(
      (gap) => `${gap.field}: ${gap.change}`,
    ),
    openPolicies: gaps.policies.map((gap) => `${gap.field}: ${gap.dependency}`),
  };
}

function stripComputed(citation: ContractCitation): ContractCitation {
  if ("absent" in citation) return citation;
  const { observationId, path, snippet } = citation;
  return { observationId, path, snippet };
}

/** The proposal as the tool would receive it, for revalidation at commit. */
export function proposalInput(proposal: ApplicationContractProposal) {
  return {
    summary: proposal.body.summary,
    fields: proposal.body.fields.map((field) => {
      const provenance = field.provenance;
      const normalized =
        "citation" in provenance && provenance.citation
          ? { ...provenance, citation: stripComputed(provenance.citation) }
          : provenance;
      return {
        key: field.key,
        value: field.value,
        provenance: normalized,
        ...(field.conformance
          ? {
              conformance: {
                ...field.conformance,
                ...(field.conformance.citation
                  ? { citation: stripComputed(field.conformance.citation) }
                  : {}),
              },
            }
          : {}),
      };
    }),
    ...(proposal.revises ? { revises: proposal.revises } : {}),
  };
}

/**
 * Called only inside the worker's final transaction. The proposal is validated
 * again against current records, saved as a new version and, for a revision,
 * the previous contract is superseded with a guarded update. One Activity
 * Event per committed contract; a rollback leaves neither.
 */
export function commitContractProposal(
  run: PiRun,
  proposal: ApplicationContractProposal,
) {
  const { application, workspace } = loadChat(run.applicationId, run.chatId);
  if (workspace.phaseKey !== "inspect-app" || workspace.completedAt)
    throw new Error(
      "The Application Contract can only be saved in the current Inspect app phase.",
    );
  const evidence = requireCurrentInspection(application.id);
  const context = validationContext(application.id, evidence);
  const validated = validateContractProposal(proposalInput(proposal), context);
  const previous = context.currentContract;
  const record = insertContract({
    applicationId: application.id,
    workspaceId: workspace.id,
    version: (previous?.version ?? 0) + 1,
    sourceMessageId: run.userMessageId,
    body: validated.body,
  });
  const gaps = contractGapReport(validated.body);
  const counts = `${gaps.blockers.length} blocker${gaps.blockers.length === 1 ? "" : "s"}, ${gaps.conformance.length} conformance item${gaps.conformance.length === 1 ? "" : "s"}, ${gaps.policies.length} open polic${gaps.policies.length === 1 ? "y" : "ies"}`;
  if (validated.revises && previous) {
    supersedeContract(application.id, validated.revises, record.id);
    const changes = describeContractChanges(previous.body, validated.body);
    insertActivity(
      workspace.id,
      "contract-revised",
      "Application Contract revised",
      `v${previous.version} → v${record.version} at ${shortSha(record.commitSha)} · ${changes.count} field${changes.count === 1 ? "" : "s"} changed: ${changes.detail || "provenance only"} · ${counts}`,
    );
  } else
    insertActivity(
      workspace.id,
      "contract-established",
      "Application Contract established",
      `v${record.version} · ${APPLICATION_PROFILE.label} v${record.profileVersion} · ${shortSha(record.commitSha)} · ${record.body.fields.length} fields · ${counts}`,
    );
  return record;
}
