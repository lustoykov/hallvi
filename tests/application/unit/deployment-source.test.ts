import { beforeEach, expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
const mock = vi.hoisted(() => ({
  api: vi.fn(),
  observation: vi.fn(),
  connection: "github-a",
}));
vi.mock("../../../src/server/db", () => ({
  listObservations: mock.observation,
}));
vi.mock("../../../src/server/github-api", () => ({ githubJson: mock.api }));
vi.mock("../../../src/server/github-connection", () => ({
  connectedGithubCredential: async () => ({
    connection: { id: mock.connection },
    token: "synthetic",
  }),
  currentGithubConnectionId: () => mock.connection,
}));
import { checkDeploymentSource } from "../../../src/server/deployment-source";
beforeEach(() => {
  mock.connection = "github-a";
  mock.observation.mockReturnValue([
    {
      kind: "github-repository-identity",
      status: "passed",
      raw: { repositoryId: 41 },
    },
  ]);
  mock.api.mockImplementation(async (path: string) => ({
    data: path.includes("/commits/")
      ? { sha: "a".repeat(40) }
      : { id: 41, full_name: "qa/todo" },
  }));
});
it("binds numeric repository identity and the selected revision", async () => {
  const record = {
    applicationId: "app",
    repository: "qa/todo",
    revision: "a".repeat(40),
  } as DeploymentRecord;
  await checkDeploymentSource(record, true);
  expect(record).toMatchObject({
    repositoryId: 41,
    githubConnectionId: "github-a",
  });
  expect(record).not.toHaveProperty("inspectedRevision");
  await checkDeploymentSource(record);
  mock.connection = "github-b";
  await expect(checkDeploymentSource(record)).rejects.toThrow(
    "GitHub access changed",
  );
});
it("rejects a reused repository name when its numeric identity changed", async () => {
  const record = {
    applicationId: "app",
    repository: "qa/todo",
    revision: null,
  } as DeploymentRecord;
  mock.api.mockResolvedValue({ data: { id: 42, full_name: "qa/todo" } });
  await expect(checkDeploymentSource(record, true)).rejects.toThrow(
    "Repository identity changed",
  );
});
