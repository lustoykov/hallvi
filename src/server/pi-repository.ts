import { Type } from "typebox";

import { INSPECTION_LIMITS } from "./github-inspection";
import {
  readRepositoryFileForRun,
  repositoryInspectionForRun,
  type RunReadBudget,
} from "./phase-two";
import type { PiRun } from "./types";

export const repositoryInspectionParameters = Type.Object(
  {
    prefix: Type.Optional(
      Type.String({
        maxLength: INSPECTION_LIMITS.pathCharacters,
        description:
          'Optional path prefix to list only part of the tree, such as "app/". Omit for the whole tree, bounded.',
      }),
    ),
  },
  { additionalProperties: false },
);

export const readRepositoryFileParameters = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      maxLength: INSPECTION_LIMITS.pathCharacters,
      description:
        "Repository-relative path of one file at the inspected commit, such as app/main.py.",
    }),
  },
  { additionalProperties: false },
);

/** Bound on either tool's result; larger results are tool errors. */
export const MAX_REPOSITORY_TOOL_CHARACTERS = 60_000;

function bounded<T>(result: T) {
  const text = JSON.stringify(result);
  if (text.length > MAX_REPOSITORY_TOOL_CHARACTERS)
    throw new Error(
      "The repository result is larger than the supported tool result. Use a narrower prefix.",
    );
  return { result, text };
}

export function readPiRepositoryInspection(
  run: PiRun,
  params: { prefix?: string },
) {
  return bounded(repositoryInspectionForRun(run, params));
}

export async function readPiRepositoryFile(
  run: PiRun,
  params: { path: string },
  budget: RunReadBudget,
  signal?: AbortSignal,
) {
  return bounded(await readRepositoryFileForRun(run, params, budget, signal));
}
