import { Type } from "typebox";

import { acceptanceChecksParameters } from "./acceptance-checks";
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import {
  collectAcceptanceProposal,
  collectSourceProposal,
  commandForRun,
  conformanceBriefForRun,
  previewConformanceForRun,
  type StagedConformance,
} from "./phase-three";
import { sourceChangeParameters } from "./source-proposal";
import type { PiRun } from "./types";

export { acceptanceChecksParameters, sourceChangeParameters };

// Empty input: the worker binds the application and phase from the Run.
export const conformanceBriefParameters = Type.Object(
  {},
  { additionalProperties: false },
);

export const conformancePreviewParameters = Type.Object(
  {},
  { additionalProperties: false },
);

export const repositoryCommandParameters = Type.Object(
  {
    command: Type.Array(Type.String({ minLength: 1, maxLength: 400 }), {
      minItems: 1,
      maxItems: 40,
      description:
        'The command and its arguments, run inside the isolated runner after uv sync; for example ["uv", "run", "pytest", "tests/test_todos.py", "-q"].',
    }),
  },
  { additionalProperties: false },
);

export const MAX_CONFORMANCE_TOOL_CHARACTERS = 60_000;

function bounded<T>(result: T) {
  const text = JSON.stringify(result);
  if (text.length > MAX_CONFORMANCE_TOOL_CHARACTERS)
    throw new Error(
      "The conformance result is larger than the supported tool result.",
    );
  return { result, text };
}

export function readPiConformanceBrief(run: PiRun, staged: StagedConformance) {
  return bounded(conformanceBriefForRun(run, staged));
}

export function collectPiSourceChanges(
  run: PiRun,
  staged: StagedConformance,
  params: unknown,
) {
  return bounded(collectSourceProposal(run, staged, params));
}

export function collectPiAcceptanceChecks(
  run: PiRun,
  staged: StagedConformance,
  params: unknown,
) {
  return bounded(collectAcceptanceProposal(run, staged, params));
}

export async function runPiConformancePreview(
  run: PiRun,
  staged: StagedConformance,
  signal?: AbortSignal,
) {
  return bounded(await previewConformanceForRun(run, staged, signal));
}

export async function runPiRepositoryCommand(
  run: PiRun,
  staged: StagedConformance,
  params: { command: string[] },
  signal?: AbortSignal,
) {
  if (params.command.some((part) => part.includes("\0")))
    throw new Error("The command contains invalid characters.");
  return bounded(await commandForRun(run, staged, params, signal));
}

export const CONFORMANCE_LIMIT_NOTE = `Each execution runs in a fresh, isolated container with ${CONFORMANCE_DEFINITION.limits.memoryBytes / (1024 * 1024)} MiB, ${CONFORMANCE_DEFINITION.limits.cpus} CPU and no network beyond the package index during installation.`;
