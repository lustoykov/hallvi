import { Type } from "typebox";

import { currentContract } from "./db";
import { contractGapReport } from "./application-contract";
import { collectContractProposal, type StagedContract } from "./phase-two";
import type { PiRun } from "./types";
import { loadChat } from "./workspaces";

export { contractProposalParameters } from "./application-contract";

// Empty input: the worker binds the application from the accepted Run.
export const applicationContractParameters = Type.Object(
  {},
  { additionalProperties: false },
);

export const MAX_CONTRACT_TOOL_CHARACTERS = 60_000;

function bounded<T>(result: T) {
  const text = JSON.stringify(result);
  if (text.length > MAX_CONTRACT_TOOL_CHARACTERS)
    throw new Error(
      "The Application Contract is larger than the supported tool result.",
    );
  return { result, text };
}

/** The current saved contract, or an explicit absence; never a stale copy. */
export function readPiApplicationContract(run: PiRun) {
  const { application } = loadChat(run.applicationId, run.chatId);
  const contract = currentContract(application.id);
  return bounded(
    contract
      ? {
          retrievedAt: new Date().toISOString(),
          current: {
            id: contract.id,
            version: contract.version,
            createdAt: contract.createdAt,
            profileId: contract.profileId,
            profileVersion: contract.profileVersion,
            commitSha: contract.commitSha,
            summary: contract.body.summary,
            fields: contract.body.fields,
            gaps: contractGapReport(contract.body),
          },
        }
      : { retrievedAt: new Date().toISOString(), current: null },
  );
}

export function collectPiContractProposal(
  run: PiRun,
  staged: StagedContract,
  params: unknown,
) {
  return bounded(collectContractProposal(run, staged, params));
}
