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
import { readPiApplicationStatus } from "../../../src/server/pi-status";
import { executePiTurn } from "../../execute-pi-turn";
import { checkTurn } from "../../evals/checks";
import { evalCases } from "../../evals/cases";
import { evalView, seedEvalCase } from "../../evals/seed";
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
  it.each(evalCases.filter((scenario) => scenario.githubState))(
    "$id supplies the actual check result to Pi and preserves repository evidence",
    async (scenario) => {
      const before = seedEvalCase(scenario, 1);
      const status = () =>
        readPiApplicationStatus(before.application!.id, before.selectedChatId!)
          .status;
      const access = status().repositoryAccess;
      expect(currentGithubConnectionId()).not.toBeNull();
      expect(access.status).toBe(
        scenario.githubState === "verified"
          ? "passed"
          : scenario.githubState === "access-denied"
            ? "blocked"
            : "not-yet",
      );
      // The application page reports the same result.
      expect(before.repository?.status).toBe(access.status);
      // A stale-history status case also seeds an older passing check; the
      // newest record comes first.
      expect(before.observations).toHaveLength(
        scenario.staleHistory === "access-passed" ? 2 : 1,
      );
      if (scenario.githubState === "access-denied") {
        expect(before.observations[0].status).toBe("failed");
        expect(access.result).toContain("Allow this exact repository");
        expect(before.observations[0].raw).toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
      } else if (scenario.githubState === "reconnected") {
        expect(before.observations[0].status).toBe("passed");
        expect(before.observations[0].raw).not.toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
        expect(access.result).toContain("current GitHub connection");
        expect(before.messages.at(-1)?.body).toContain(
          "The repository check passed",
        );
      } else {
        expect(access.result).toContain("main · abcdef12");
        expect(before.observations[0].raw).toMatchObject({
          connectionId: currentGithubConnectionId(),
        });
      }
      await executePiTurn(
        before.application!.id,
        before.selectedChatId!,
        scenario.message,
      );
      const after = evalView(before.application!.id, before.selectedChatId!);
      const input = mocks.askPi.mock.calls[0][0];
      // No application summary travels with the request. The recorded check
      // reaches Pi only when it calls the scoped status tool.
      expect(JSON.parse(input.runContext)).not.toHaveProperty(
        "currentApplication",
      );
      expect(input.runContext).not.toContain("repositoryAccess");
      const current = status();
      expect(current.repositoryAccess).toMatchObject({
        status: access.status,
        result: access.result,
      });
      const text = JSON.stringify(current);
      expect(text).not.toContain("ghu_");
      expect(text).not.toContain("previous-eval-user");
      if (scenario.githubState === "reconnected") {
        expect(input).not.toHaveProperty("messages");
        expect(text).not.toContain("readable at main");
        // The invalidated Observation is not offered as current evidence.
        expect(current.repositoryAccess.checkedAt).toBeNull();
      } else {
        expect(current.repositoryAccess.checkedAt).toBe(
          before.observations[0].observedAt,
        );
      }
      expect(
        Object.values(
          checkTurn(
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
    const github = evalCases.find(
      (scenario) => scenario.githubState === "verified",
    )!;
    const first = seedEvalCase(github, 1);
    const second = seedEvalCase(github, 2);
    expect(first.application?.id).not.toBe(second.application?.id);
    expect(first.observations[0].id).not.toBe(second.observations[0].id);
    const ordinary = seedEvalCase(evalCases[0], 1);
    expect(currentGithubConnectionId()).toBeNull();
    expect(ordinary.observations).toEqual([]);
    expect(ordinary.messages).toEqual([]);
    expect(ordinary.repository).toMatchObject({
      status: "not-yet",
      connected: false,
    });
  });
});
