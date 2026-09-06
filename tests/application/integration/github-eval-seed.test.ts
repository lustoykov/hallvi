import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as database from "../../../src/server/db";
import { currentGithubConnectionId } from "../../../src/server/github-connection";
import * as api from "../../../src/server/github-api";
import { getApplicationStatus } from "../../../src/server/phase-one";
import { executePiTurn } from "../../execute-pi-turn";
import { checkPhaseOne } from "../../evals/check-phase-one";
import { phaseOneCases } from "../../evals/phase-one-cases";
import { seedPhaseOneEvalCase } from "../../evals/seed-phase-one";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({ askPi: vi.fn() }));
vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.askPi,
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof api>()),
  githubJson: vi.fn(() => {
    throw new Error("No GitHub API calls in eval fixtures");
  }),
  githubDeviceRequest: vi.fn(() => {
    throw new Error("No GitHub login in eval fixtures");
  }),
  readGithubCliCredential: vi.fn(() => {
    throw new Error("No real GitHub credentials in eval fixtures");
  }),
}));

let directory: string;
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-eval-seed-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(directory, "eval.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(directory, "config"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(() => {
  database.db().$client.exec("DELETE FROM applications");
  mocks.askPi
    .mockReset()
    .mockResolvedValue({ message: "A fixture answer.", decisionProposals: [] });
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("GitHub eval scenarios use real local state with no GitHub or model calls", () => {
  it.each(phaseOneCases.filter((scenario) => scenario.githubState))(
    "$id supplies the actual check result to Pi and preserves repository evidence",
    async (scenario) => {
      const before = seedPhaseOneEvalCase(scenario, 1);
      const check = before.checks.find(
        (item) => item.key === "repository-readable",
      )!;
      expect(currentGithubConnectionId()).not.toBeNull();
      expect(check.status).toBe(
        scenario.githubState === "verified"
          ? "passed"
          : scenario.githubState === "access-denied"
            ? "blocked"
            : "not-yet",
      );
      expect(before.workspace?.status).toBe(
        scenario.githubState === "verified" ? "ready" : "in-progress",
      );
      // A stale-history status case also seeds an older passing check; the
      // newest record comes first.
      expect(before.observations).toHaveLength(
        scenario.staleHistory === "checks-passed" ? 2 : 1,
      );
      if (scenario.githubState === "access-denied") {
        expect(before.observations[0].status).toBe("failed");
        expect(check.result).toContain("Allow this exact repository");
        expect(before.observations[0].raw).toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
      } else if (scenario.githubState === "reconnected") {
        expect(before.observations[0].status).toBe("passed");
        expect(before.observations[0].raw).not.toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
        expect(check.result).toContain("current GitHub connection");
        expect(before.messages.at(-1)?.body).toContain(
          "All four Launch Brief checks passed",
        );
      } else {
        expect(check.result).toContain("main · abcdef12");
        expect(before.observations[0].raw).toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
      }
      const after = await executePiTurn(
        before.application!.id,
        before.selectedChatId!,
        scenario.message,
      );
      const input = mocks.askPi.mock.calls[0][0];
      // No application summary travels with the request. The recorded check
      // reaches Pi only when it calls the scoped status tool.
      expect(JSON.parse(input.runContext)).not.toHaveProperty(
        "currentApplication",
      );
      expect(input.runContext).not.toContain(check.label);
      const status = getApplicationStatus(
        before.application!.id,
        before.selectedChatId!,
      );
      const repository = status.checks.find(
        (item) => item.key === "repository-readable",
      )!;
      expect(repository).toMatchObject({
        status: check.status,
        result: check.result,
      });
      const text = JSON.stringify(status);
      expect(text).not.toContain("ghu_");
      expect(text).not.toContain("previous-eval-user");
      if (scenario.githubState === "reconnected") {
        expect(before.messages.at(-1)?.body).toContain(
          "All four Launch Brief checks passed",
        );
        expect(input).not.toHaveProperty("messages");
        expect(text).not.toContain("readable at main");
        // The invalidated Observation is not offered as current evidence.
        expect(repository.evidence).toEqual([]);
      } else {
        expect(repository.evidence).toEqual([
          expect.objectContaining({
            recordType: "observation",
            recordId: before.observations[0].id,
            observedAt: before.observations[0].observedAt,
          }),
        ]);
      }
      expect(
        Object.values(
          checkPhaseOne(
            scenario,
            before,
            after,
            await mocks.askPi.mock.results[0].value,
            [],
          ),
        ),
      ).not.toContain(false);
      expect(api.githubJson).not.toHaveBeenCalled();
      expect(api.githubDeviceRequest).not.toHaveBeenCalled();
      expect(api.readGithubCliCredential).not.toHaveBeenCalled();
    },
  );

  it("resets global connection state before an ordinary case and keeps each application's records separate", () => {
    const github = phaseOneCases.find(
      (scenario) => scenario.githubState === "verified",
    )!;
    const first = seedPhaseOneEvalCase(github, 1);
    const second = seedPhaseOneEvalCase(github, 2);
    expect(first.application?.id).not.toBe(second.application?.id);
    expect(first.observations[0].id).not.toBe(second.observations[0].id);
    const ordinary = seedPhaseOneEvalCase(phaseOneCases[0], 1);
    expect(currentGithubConnectionId()).toBeNull();
    expect(ordinary.observations).toEqual([]);
    expect(ordinary.messages).toEqual([]);
    expect(
      ordinary.checks.find((item) => item.key === "repository-readable")
        ?.status,
    ).toBe("not-yet");
  });
});
