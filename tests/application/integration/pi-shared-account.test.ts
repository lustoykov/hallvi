import {
  AgentHarness,
  BACKGROUND_CONTEXT as ctx,
  JsonlSessionRepo,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
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

const keysTheProviderSaw: Array<string | undefined> = [];

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
    streamSimple: (model, _context, options) => {
      keysTheProviderSaw.push(options?.apiKey);
      const stream = createAssistantMessageEventStream();
      const message = {
        role: "assistant" as const,
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [{ type: "text" as const, text: "ok" }],
        stopReason: "stop" as const,
        timestamp: Date.now(),
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: "stop", message });
      return stream;
    },
    models: [
      {
        id: "synthetic",
        name: "Synthetic",
        reasoning: false,
        input: ["text"],
        contextWindow: 272_000,
        maxTokens: 32_000,
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

it("the harness authenticates through Pi's own ModelRuntime, refresh included", async () => {
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
  keysTheProviderSaw.length = 0;
  // Exactly what Hallvi composes: coding-agent's runtime handed to agent-core.
  const models = await runtime(authPath, refreshes);
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: root }),
    sessionsRoot: join(root, "sessions"),
  });
  const { harness } = await AgentHarness.create(
    {
      session: await repo.create({ cwd: root }, ctx),
      models,
      model: models.getModel("shared-account-test", "synthetic")!,
      systemPrompt: "x",
      tools: [],
    },
    ctx,
  );
  const lane = await harness.lane("main", ctx);
  const run = await lane.prompt("hello", undefined, ctx);
  await harness.close(ctx);
  expect(run.ok && run.value.status).toBe("completed");
  expect(refreshes).toEqual(["refresh-1"]);
  expect(keysTheProviderSaw).toEqual(["access-2"]);
});
