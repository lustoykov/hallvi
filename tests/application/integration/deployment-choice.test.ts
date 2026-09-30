import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import * as store from "@/server/db";
import {
  askDeploymentChoice,
  chooseDeployment,
  deploymentState,
  deploymentStatus,
} from "@/server/deployment-automation";
import { pushTestDatabase } from "../../test-database";

// Real choice persistence and GitHub credential selection with an empty
// account. Only the GitHub HTTP response is stood in for; no model or host.
const SHA = "a".repeat(40);
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-public-choice-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("HALLVI_PI_CONFIG_DIR", join(root, "account"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await store.closeDatabase();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

async function application(name: string) {
  return store.insertApplication({
    name,
    repositoryUrl: `https://github.com/fixture/${name}`,
    repositoryOwner: "fixture",
    repositoryName: name,
  });
}

it("accepts a manual public branch without login, but refuses automatic mode even on the same branch", async () => {
  const app = await application("public");
  const fetcher = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ sha: SHA, commit: { message: "Public revision" } }),
        ),
    );
  vi.stubGlobal("fetch", fetcher);
  askDeploymentChoice(app.id, "master");
  const chosen = await chooseDeployment(app.id, {
    mode: "manual",
    branch: "master",
  });
  expect(chosen).toMatchObject({
    mode: "manual",
    branch: "master",
    latest: { commit: SHA },
    checkError: null,
  });
  expect(chosen.chosenAt).not.toBeNull();
  expect((await deploymentStatus(app.id)).mode).toBe("manual");
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetcher.mock.calls) {
    expect(url).toBe(
      "https://api.github.com/repos/fixture/public/commits/master",
    );
    expect(request.headers).not.toHaveProperty("Authorization");
  }

  fetcher.mockClear();
  await expect(chooseDeployment(app.id, { mode: "automatic" })).rejects.toThrow(
    "Connect GitHub",
  );
  expect(deploymentState(app.id).mode).toBe("manual");
  expect(fetcher).not.toHaveBeenCalled();
});

it("refuses an anonymous manual choice when the private branch cannot be read", async () => {
  const app = await application("private");
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  askDeploymentChoice(app.id, "master");
  await expect(
    chooseDeployment(app.id, { mode: "manual", branch: "master" }),
  ).rejects.toThrow("Private repositories need a GitHub connection");
  expect(deploymentState(app.id).mode).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
