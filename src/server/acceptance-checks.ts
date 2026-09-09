import { createHash } from "node:crypto";
import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  credentialShapedPaths,
  resolveCitation,
  type ContractValidationContext,
} from "./application-contract";
import type {
  AcceptanceChecksProposal,
  AcceptanceChecksRecord,
  AcceptanceStep,
  ApplicationContractRecord,
  RepositoryCitation,
} from "./types";

export const ACCEPTANCE_LIMITS = {
  steps: 12,
  bodyCharacters: 2_000,
  rationaleCharacters: 800,
  includes: 6,
  reportedIssues: 12,
} as const;

const citationSchema = Type.Object(
  {
    observationId: Type.String({ minLength: 1, maxLength: 64 }),
    path: Type.String({ minLength: 1, maxLength: 512 }),
    snippet: Type.String({ minLength: 1, maxLength: 400 }),
  },
  { additionalProperties: false },
);

export const acceptanceChecksParameters = Type.Object(
  {
    rationale: Type.String({
      minLength: 1,
      maxLength: ACCEPTANCE_LIMITS.rationaleCharacters,
      description:
        "Why these steps represent the application's behavior, citing what was read.",
    }),
    steps: Type.Array(
      Type.Object(
        {
          name: Type.String({ minLength: 1, maxLength: 120 }),
          method: Type.Union([
            Type.Literal("GET"),
            Type.Literal("POST"),
            Type.Literal("PUT"),
            Type.Literal("PATCH"),
            Type.Literal("DELETE"),
          ]),
          path: Type.String({
            minLength: 1,
            maxLength: 300,
            description: "Request path starting with /, for example /todos.",
          }),
          body: Type.Optional(
            Type.String({
              maxLength: ACCEPTANCE_LIMITS.bodyCharacters,
              description: "JSON request body, sent as application/json.",
            }),
          ),
          expectStatus: Type.Integer({ minimum: 100, maximum: 599 }),
          expectBodyIncludes: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
              maxItems: ACCEPTANCE_LIMITS.includes,
              description:
                "Substrings the response body must contain, such as a created title.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: ACCEPTANCE_LIMITS.steps },
    ),
    evidence: Type.Array(citationSchema, {
      minItems: 1,
      maxItems: 12,
      description:
        "Verbatim snippets of saved reads (route declarations, models) that the steps are derived from.",
    }),
  },
  { additionalProperties: false },
);

export class AcceptanceChecksError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Acceptance checks rejected:\n${issues
        .slice(0, ACCEPTANCE_LIMITS.reportedIssues)
        .map((issue, index) => `${index + 1}. ${issue}`)
        .join("\n")}`,
    );
  }
}

function firstSegment(path: string) {
  return `/${path.split("?")[0].split("/").filter(Boolean)[0] ?? ""}`;
}

export function acceptanceDigest(steps: AcceptanceStep[]) {
  return createHash("sha256").update(JSON.stringify(steps)).digest("hex");
}

/**
 * Validates a proposed behavior definition: well-formed HTTP steps, JSON
 * bodies, and every route grounded in a cited snippet of a saved read at the
 * contract commit that contains the route's first path segment. A route the
 * repository does not declare cannot be proposed.
 */
export function validateAcceptanceChecks(
  input: unknown,
  context: {
    contract: ApplicationContractRecord;
    citations: Pick<
      ContractValidationContext,
      "applicationId" | "commitSha"
    > & {
      lookups: Pick<ContractValidationContext["lookups"], "observation">;
    };
  },
): AcceptanceChecksProposal {
  if (!Value.Check(acceptanceChecksParameters, input))
    throw new AcceptanceChecksError(
      [...Value.Errors(acceptanceChecksParameters, input)]
        .slice(0, ACCEPTANCE_LIMITS.reportedIssues)
        .map((error) => `${error.instancePath || "/"}: ${error.message}`),
    );
  const credentialShaped = credentialShapedPaths(input);
  if (credentialShaped.length)
    throw new AcceptanceChecksError(
      credentialShaped.map(
        (location) =>
          `${location}: credential-shaped text is never accepted in a check definition`,
      ),
    );
  const issues: string[] = [];
  const evidence: RepositoryCitation[] = [];
  const snippets: string[] = [];
  for (const citation of input.evidence) {
    const resolved = resolveCitation(citation, context.citations);
    if (!resolved.ok) {
      issues.push(`evidence ${citation.path}: ${resolved.reason}`);
      continue;
    }
    evidence.push(
      resolved.line !== undefined
        ? { ...citation, line: resolved.line }
        : citation,
    );
    snippets.push(citation.snippet);
  }
  const steps: AcceptanceStep[] = [];
  for (const step of input.steps) {
    if (!step.path.startsWith("/")) {
      issues.push(`${step.name}: path must start with /`);
      continue;
    }
    if (/^https?:\/\//i.test(step.path) || step.path.includes("://")) {
      issues.push(`${step.name}: path must be relative to the application`);
      continue;
    }
    const segment = firstSegment(step.path);
    if (segment === "/") {
      issues.push(
        `${step.name}: the root path cannot be an application behavior check`,
      );
      continue;
    }
    if (!snippets.some((snippet) => snippet.includes(segment))) {
      issues.push(
        `${step.name}: no cited snippet declares ${segment}; cite the route or router declaration that does, or leave the route out`,
      );
      continue;
    }
    if (step.body !== undefined) {
      try {
        JSON.parse(step.body);
      } catch {
        issues.push(`${step.name}: body is not valid JSON`);
        continue;
      }
    }
    steps.push({
      name: step.name.trim(),
      method: step.method,
      path: step.path,
      ...(step.body !== undefined ? { body: step.body } : {}),
      expectStatus: step.expectStatus,
      ...(step.expectBodyIncludes?.length
        ? { expectBodyIncludes: step.expectBodyIncludes }
        : {}),
    });
  }
  if (!steps.some((step) => step.method !== "GET" || step.expectBodyIncludes))
    issues.push(
      "At least one step must write or assert on the body: a set of unasserted GET requests does not establish behavior.",
    );
  if (issues.length) throw new AcceptanceChecksError(issues);
  return {
    rationale: input.rationale.trim(),
    steps,
    evidence,
    digest: acceptanceDigest(steps),
    contractId: context.contract.id,
    contractVersion: context.contract.version,
  };
}

/**
 * Whether a proposed definition is weaker than an accepted one: fewer steps,
 * fewer writes or fewer body assertions. A weaker definition cannot be
 * accepted automatically; the engineer must accept it explicitly.
 */
export function weakensAcceptedChecks(
  proposed: AcceptanceStep[],
  accepted: AcceptanceChecksRecord | null,
) {
  if (!accepted) return false;
  const strength = (steps: AcceptanceStep[]) => ({
    steps: steps.length,
    writes: steps.filter((step) => step.method !== "GET").length,
    assertions: steps.reduce(
      (total, step) => total + (step.expectBodyIncludes?.length ?? 0),
      0,
    ),
  });
  const before = strength(accepted.steps);
  const after = strength(proposed);
  return (
    after.steps < before.steps ||
    after.writes < before.writes ||
    after.assertions < before.assertions
  );
}
