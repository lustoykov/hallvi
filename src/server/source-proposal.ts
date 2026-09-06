import { Type } from "typebox";
import { Value } from "typebox/value";

import { credentialShapedPaths } from "./application-contract";
import { ARCHIVE_LIMITS, overlayDigest } from "./execution-tree";
import {
  normalizeRepositoryPath,
  RepositoryPathError,
} from "./github-inspection";
import { sensitivePathReason } from "./conformance-definition";
import { deniedPathReason } from "./secrets";
import type {
  ApplicationContractRecord,
  ConformanceMappingEntry,
  ProposedFileChange,
  SourceChangeProposal,
} from "./types";

export const SOURCE_PROPOSAL_LIMITS = {
  files: ARCHIVE_LIMITS.changedFiles,
  fileCharacters: ARCHIVE_LIMITS.changedFileBytes,
  summaryCharacters: 1_000,
  explanationCharacters: 600,
  reportedIssues: 12,
} as const;

const path = Type.String({ minLength: 1, maxLength: 512 });

export const sourceChangeParameters = Type.Object(
  {
    summary: Type.String({
      minLength: 1,
      maxLength: SOURCE_PROPOSAL_LIMITS.summaryCharacters,
      description:
        "What the change does and why, for the engineer's review and the pull request body.",
    }),
    changes: Type.Array(
      Type.Union([
        Type.Object(
          {
            path,
            content: Type.String({
              maxLength: SOURCE_PROPOSAL_LIMITS.fileCharacters,
              description: "The complete new content of the file (UTF-8 text).",
            }),
          },
          { additionalProperties: false },
        ),
        Type.Object(
          { path, delete: Type.Literal(true) },
          { additionalProperties: false },
        ),
      ]),
      {
        minItems: 1,
        maxItems: SOURCE_PROPOSAL_LIMITS.files,
        description:
          "Every file the change creates, replaces or deletes, with complete contents; partial edits are not accepted.",
      },
    ),
    mapping: Type.Array(
      Type.Object(
        {
          field: Type.String({
            minLength: 1,
            maxLength: 80,
            description:
              "A conformance item's contract field key from the brief, such as health.path.",
          }),
          paths: Type.Array(path, { minItems: 1, maxItems: 20 }),
          explanation: Type.String({
            minLength: 1,
            maxLength: SOURCE_PROPOSAL_LIMITS.explanationCharacters,
          }),
        },
        { additionalProperties: false },
      ),
      {
        maxItems: 40,
        description:
          "Which changed paths resolve which required change. Every required change in the brief must be mapped.",
      },
    ),
    requestApproval: Type.Optional(
      Type.Boolean({
        description:
          "Under the Let Server Guy decide policy: whether publication should wait for the engineer's explicit approval. Ignored under Always ask (always waits) and Full autonomy (never waits).",
      }),
    ),
  },
  { additionalProperties: false },
);

export class SourceProposalError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Change rejected:\n${issues
        .slice(0, SOURCE_PROPOSAL_LIMITS.reportedIssues)
        .map((issue, index) => `${index + 1}. ${issue}`)
        .join("\n")}`,
    );
  }
}

export interface SourceProposalContext {
  contract: ApplicationContractRecord;
  requiredFields: string[];
  /** Existing paths at the base commit, from the inspection tree. */
  treePaths: Set<string>;
  /** Saved read at the base commit for a path, when one exists. */
  baseObservationId: (path: string) => string | null;
}

/**
 * Validates a staged change: complete UTF-8 files at safe, non-sensitive
 * paths, credential shapes rejected before any reason could echo them, and a
 * mapping that covers every required change. The mapping is deterministic
 * scope; the explanation is Pi's interpretation.
 */
export function validateSourceProposal(
  input: unknown,
  context: SourceProposalContext,
): SourceChangeProposal {
  if (!Value.Check(sourceChangeParameters, input))
    throw new SourceProposalError(
      [...Value.Errors(sourceChangeParameters, input)]
        .slice(0, SOURCE_PROPOSAL_LIMITS.reportedIssues)
        .map((error) => `${error.instancePath || "/"}: ${error.message}`),
    );
  const credentialShaped = credentialShapedPaths(input);
  if (credentialShaped.length)
    throw new SourceProposalError(
      credentialShaped.map(
        (location) =>
          `${location}: credential-shaped text is never accepted in a change; read the value from configuration instead`,
      ),
    );
  const issues: string[] = [];
  const changes: ProposedFileChange[] = [];
  const seen = new Set<string>();
  for (const change of input.changes) {
    let normalized: string;
    try {
      normalized = normalizeRepositoryPath(change.path);
    } catch (error) {
      issues.push(
        error instanceof RepositoryPathError
          ? error.message
          : `${change.path}: invalid path`,
      );
      continue;
    }
    if (seen.has(normalized)) {
      issues.push(`${normalized}: listed more than once`);
      continue;
    }
    seen.add(normalized);
    const denied = deniedPathReason(normalized);
    if (denied) {
      issues.push(`${normalized}: not changed, ${denied}`);
      continue;
    }
    const sensitive = sensitivePathReason(normalized);
    if (sensitive) {
      issues.push(
        `${normalized}: outside the allowed scope (${sensitive}); such paths need a separate, explicitly approved change`,
      );
      continue;
    }
    const exists = context.treePaths.has(normalized);
    if ("delete" in change) {
      if (!exists) {
        issues.push(
          `${normalized}: cannot delete a file that does not exist at the base commit`,
        );
        continue;
      }
      changes.push({
        path: normalized,
        content: null,
        baseObservationId: context.baseObservationId(normalized),
      });
      continue;
    }
    if (change.content.includes("\0")) {
      issues.push(`${normalized}: binary content is not accepted`);
      continue;
    }
    if (exists && context.baseObservationId(normalized) === null) {
      issues.push(
        `${normalized}: read the current file with read_repository_file before replacing it, so the change can be reviewed as a diff`,
      );
      continue;
    }
    changes.push({
      path: normalized,
      content: change.content,
      baseObservationId: exists ? context.baseObservationId(normalized) : null,
    });
  }
  const mapping: ConformanceMappingEntry[] = [];
  const mapped = new Set<string>();
  for (const entry of input.mapping) {
    if (!context.requiredFields.includes(entry.field)) {
      issues.push(
        `${entry.field}: not a required change in the brief (${context.requiredFields.join(", ") || "none"})`,
      );
      continue;
    }
    const paths = entry.paths.map((item) => {
      try {
        return normalizeRepositoryPath(item);
      } catch {
        return item;
      }
    });
    const unknown = paths.filter((item) => !seen.has(item));
    if (unknown.length) {
      issues.push(
        `${entry.field}: mapped to paths that are not in this change: ${unknown.join(", ")}`,
      );
      continue;
    }
    mapped.add(entry.field);
    mapping.push({ field: entry.field, paths, explanation: entry.explanation });
  }
  const unmapped = context.requiredFields.filter((field) => !mapped.has(field));
  if (unmapped.length)
    issues.push(
      `Required changes without a mapped path: ${unmapped.join(", ")}. Map each one, or explain in your answer why it cannot be resolved by a source change.`,
    );
  if (issues.length) throw new SourceProposalError(issues);
  return {
    baseSha: context.contract.commitSha,
    contractId: context.contract.id,
    contractVersion: context.contract.version,
    summary: input.summary.trim(),
    changes,
    filesDigest: overlayDigest(changes),
    mapping,
    requestApproval: input.requestApproval ?? true,
  };
}

/** A bounded, line-based diff for review; not a patch format. */
export function lineDiff(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  // Longest common subsequence over lines, bounded for review purposes.
  const limit = 4_000;
  if (a.length > limit || b.length > limit)
    return { added: b.length, removed: a.length, hunks: [] as string[] };
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (
      j < b.length &&
      (i >= a.length || table[i][j + 1] >= table[i + 1][j])
    ) {
      lines.push(`+${b[j]}`);
      added++;
      j++;
    } else {
      lines.push(`-${a[i]}`);
      removed++;
      i++;
    }
  }
  // Keep three lines of context around changes.
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line[0] === "+" || line[0] === "-")
      for (let k = index - 3; k <= index + 3; k++) keep.add(k);
  });
  const hunks: string[] = [];
  let current: string[] = [];
  lines.forEach((line, index) => {
    if (keep.has(index)) current.push(line);
    else if (current.length) {
      hunks.push(current.join("\n"));
      current = [];
    }
  });
  if (current.length) hunks.push(current.join("\n"));
  return { added, removed, hunks };
}
