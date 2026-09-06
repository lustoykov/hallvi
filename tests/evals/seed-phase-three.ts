import { vi } from "vitest";

import { CONFORMANCE_DEFINITION } from "../../src/server/conformance-definition";
import * as database from "../../src/server/db";
import * as executionTree from "../../src/server/execution-tree";
import { getOperatorView } from "../../src/server/operator-view";
import { setConformanceExecutor } from "../../src/server/phase-three";
import { PHASE_THREE } from "../../src/server/phase-three-spec";
import type { InspectAppEvidence } from "../../src/server/types";
import { primaryChatTitle } from "../../src/server/workspaces";
import { FakeExecutor, missingEnvironment } from "../fixtures/fake-executor";
import { repositoryFixtures } from "../fixtures/repositories";
import type { PhaseOneEvalCase } from "./phase-one-cases";
import { seedPhaseTwoEvalCase } from "./seed-phase-two";

/**
 * Seeds an application already in Make launch-ready: the Phase 2 seed with a
 * committed contract, the completed Inspect app workspace with its retained
 * evidence, and the Phase 3 workspace and chat. The runner is the fake
 * executor, whose outcomes follow the staged tree over the fixture tree
 * served in-process; GitHub stays blocked, archive download included.
 */
export function seedPhaseThreeEvalCase(
  scenario: PhaseOneEvalCase,
  repetition: number,
) {
  const phaseThree = scenario.phaseThree!;
  const executor = new FakeExecutor();
  if (phaseThree.executionEnvironment === "missing")
    executor.status = missingEnvironment();
  setConformanceExecutor(executor);
  const baseTree = repositoryFixtures[phaseThree.repository].map((file) => ({
    path: file.path,
    content: Buffer.from(file.content, "utf8"),
    mode: 0o644,
  }));
  vi.spyOn(executionTree, "fetchBaseTree").mockImplementation(
    async () => baseTree,
  );
  const phaseTwo = seedPhaseTwoEvalCase(
    {
      ...scenario,
      phaseTwo: {
        repository:
          phaseThree.repository === "fastapi-import-error"
            ? "fastapi-conforming"
            : phaseThree.repository,
        existingContract: true,
        expectedContract: "any",
      },
    },
    repetition,
  );
  const application = phaseTwo.application!;
  const inspectApp = phaseTwo.workspaces.find(
    (workspace) => workspace.phaseKey === "inspect-app",
  )!;
  const contract = database.currentContract(application.id)!;
  const evidence: InspectAppEvidence = {
    completedAt: new Date().toISOString(),
    checks: phaseTwo.checks.map(
      ({ key, label, status, result, evidence: refs }) => ({
        key,
        label,
        status,
        result,
        evidence: refs,
      }),
    ),
    contractId: contract.id,
    contractVersion: contract.version,
    profileId: contract.profileId,
    profileVersion: contract.profileVersion,
    commitSha: contract.commitSha,
    inspectionObservationId: phaseTwo.inspection!.observationId,
    connectionId: null,
  };
  database.completeWorkspace(inspectApp.id, evidence);
  const workspace = database.insertWorkspace(application.id, PHASE_THREE.key);
  const chat = database.insertChat(
    workspace.id,
    primaryChatTitle(PHASE_THREE.key),
    true,
  );
  database.insertMessage(
    chat.id,
    "assistant",
    `Phase 3, Make launch-ready, starts here. The deliverable is a Conformance Result (check set v${CONFORMANCE_DEFINITION.version}).`,
    "server-guy",
  );
  return getOperatorView(application.id, chat.id);
}
