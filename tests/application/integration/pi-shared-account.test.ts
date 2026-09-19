import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it } from "vitest";

// Applications now work at the same time on one ChatGPT account. Each
// conversation builds its own runtime over the same credential file, as
// configuredPiRuntime does, and a rotated refresh token must be spent once.

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-shared-account-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function runtime(authPath: string, refreshes: string[]) {
  const created = await ModelRuntime.create({
    authPath,
    modelsPath: null,
    modelsStorePath: join(root, `models-${Math.random()}.json`),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  created.registerProvider("shared-account-test", {
    api: "shared-account-test",
    baseUrl: "https://invalid.test",
    oauth: {
      name: "Shared account",
      isSubscription: true,
      login: async () => {
        throw new Error("not used");
      },
      // A provider that rotates: the old refresh token is dead once spent.
      async refreshToken(credentials) {
        refreshes.push(credentials.refresh);
        await delay(100);
        if (credentials.refresh !== "refresh-1")
          throw new Error("refresh token already rotated");
        return {
          access: "access-2",
          refresh: "refresh-2",
          expires: Date.now() + 3_600_000,
        };
      },
      getApiKey: (credentials) => credentials.access,
    },
    models: [
      {
        id: "synthetic",
        name: "Synthetic",
        reasoning: false,
        input: ["text"],
        contextWindow: 8_192,
        maxTokens: 2_048,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  return created;
}

it("two conversations on one expired account refresh it once and both get the new token", async () => {
  const authPath = join(root, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({
      "shared-account-test": {
        type: "oauth",
        access: "access-1",
        refresh: "refresh-1",
        expires: Date.now() - 1_000,
      },
    }),
    { mode: 0o600 },
  );
  const refreshes: string[] = [];
  const [a, b] = await Promise.all([
    runtime(authPath, refreshes),
    runtime(authPath, refreshes),
  ]);
  const auth = await Promise.all(
    [a, b].map((each) =>
      each.getAuth(each.getModel("shared-account-test", "synthetic")!),
    ),
  );
  expect(refreshes).toEqual(["refresh-1"]);
  expect(JSON.stringify(auth[0])).toContain("access-2");
  expect(JSON.stringify(auth[1])).toContain("access-2");
  expect(
    JSON.parse(readFileSync(authPath, "utf8"))["shared-account-test"],
  ).toMatchObject({ access: "access-2", refresh: "refresh-2" });
});
