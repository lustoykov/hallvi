import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as database from "../../../src/server/db";
import * as configuration from "../../../src/server/pi-configuration";
import { searchPiDecisions } from "../../../src/server/pi-decisions";
import { buildPiRunContext } from "../../../src/server/pi-run-context";
import * as runs from "../../../src/server/pi-runs";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import type { PhaseOneOperatorView } from "../../../src/server/types";
import {
  nativeEvalCompaction,
  nativeEvalEvidence,
  seedNativeScenario,
} from "../../evals/native-scenarios";
import {
  phaseOneCases,
  type PhaseOneEvalCase,
} from "../../evals/phase-one-cases";
import { seedPhaseOneEvalCase } from "../../evals/seed-phase-one";
import { pushTestDatabase } from "../../test-database";

const scenarios = phaseOneCases.filter((scenario) => scenario.nativeScenario);
const syntheticModel = {
  providerId: "synthetic-no-network",
  modelId: "never-requested",
};
let root: string;
const fetch = vi.fn(() => {
  throw new Error("Native seed tests cannot make network requests.");
});
const configure = vi.fn(async () => {
  throw new Error("Native seed tests cannot configure a provider.");
});
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-native-eval-seed-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "eval.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "pi"));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(configuration, "configuredPiRuntime").mockImplementation(configure);
  pushTestDatabase(database.databasePath());
});
beforeEach(() => {
  database.db().$client.exec("DELETE FROM applications");
  fetch.mockClear();
  configure.mockClear();
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(configure).not.toHaveBeenCalled();
  expect(configuration.readPiConfiguration()).toBeNull();
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function scenario(kind: PhaseOneEvalCase["nativeScenario"]) {
  return scenarios.find((item) => item.nativeScenario === kind)!;
}
async function seed(item: PhaseOneEvalCase) {
  const before = seedPhaseOneEvalCase(item, 1);
  const after = await seedNativeScenario(item, before, syntheticModel);
  const native = await openNativeChatSession(
    after.application!.id,
    after.selectedChatId!,
  );
  try {
    return {
      before,
      after,
      entries: native.sessionManager.getEntries(),
      nativeId: native.sessionManager.getSessionId(),
      path: native.sessionManager.getSessionFile()!,
    };
  } finally {
    native.release();
  }
}
function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    api: "openai-codex-responses",
    provider: syntheticModel.providerId,
    model: syntheticModel.modelId,
    content,
    stopReason,
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
function lookup(manager: SessionManager, id: string) {
  manager.appendMessage(
    assistant(
      [
        {
          type: "toolCall",
          id,
          name: "search_decisions",
          arguments: { query: id },
        },
      ],
      "toolUse",
    ),
  );
}
function lookupResult(manager: SessionManager, id: string, isError = false) {
  manager.appendMessage({
    role: "toolResult",
    toolCallId: id,
    toolName: "search_decisions",
    content: [
      {
        type: "text",
        text: isError
          ? "Lookup failed"
          : JSON.stringify({
              records: [],
              nextOffset: null,
              activeCount: 0,
              pendingCount: 0,
            }),
      },
    ],
    isError,
    timestamp: Date.now(),
  });
}
function acceptedRun(view: PhaseOneOperatorView, message: string) {
  const accepted = runs.sendChatMessage(
    view.application!.id,
    view.selectedChatId!,
    message,
    randomUUID(),
  );
  expect(runs.claimNextPiRun()?.id).toBe(accepted.run.id);
  return runs.getPiRun(accepted.run.id)!;
}

describe("the seven native eval scenarios use real local data and explicitly synthetic history", () => {
  it("keeps correction and addition distinct in the fixed casebook", () => {
    expect(scenarios).toHaveLength(7);
    expect(new Set(scenarios.map((item) => item.nativeScenario)).size).toBe(7);
    expect(scenario("correction")).toMatchObject({
      expectedProposals: 1,
      replacesExisting: true,
    });
    expect(scenario("addition")).toMatchObject({
      expectedProposals: 1,
    });
    expect(scenario("addition").replacesExisting).toBeUndefined();
    expect(
      scenarios.filter((item) => item.expectedProposals === 0),
    ).toHaveLength(5);
  });
  it.each(scenarios)(
    "$id seeds a private native session without configuring credentials or making a model call",
    async (item) => {
      const { before, after, entries, nativeId, path } = await seed(item);
      expect(existsSync(path)).toBe(true);
      expect(path).toContain(
        join(
          "pi-sessions",
          after.application!.id,
          `${after.selectedChatId}.jsonl`,
        ),
      );
      expect(
        JSON.parse(readFileSync(path, "utf8").split("\n")[0]),
      ).toMatchObject({ type: "session", id: nativeId });
      expect(entries).toContainEqual(
        expect.objectContaining({
          type: "custom_message",
          customType: "eval-fixture-history",
          content: expect.stringContaining("synthetic eval history"),
        }),
      );
      expect(after.application).toEqual(before.application);
      expect(after.observations).toEqual(before.observations);
      expect(after.checks).toEqual(before.checks);
      expect(after.messages.slice(0, before.messages.length)).toEqual(
        before.messages,
      );
      expect(entries.some((entry) => entry.type === "compaction")).toBe(false);
      const syntheticUsage = entries.filter(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          entry.message.usage.input === 1_000_000,
      );
      expect(syntheticUsage).toHaveLength(
        item.nativeScenario === "cancelled" ? 0 : 1,
      );
      expect(nativeEvalCompaction).toEqual({
        enabled: true,
        reserveTokens: 2_048,
        keepRecentTokens: 1_024,
      });
      const storedRuns = runs.chatRunSnapshot(
        after.application!.id,
        after.selectedChatId!,
      ).runs;
      expect(storedRuns.every((run) => run.piCalls === 0)).toBe(true);
      if (
        item.existingPriority &&
        item.nativeScenario !== "cross-chat-revision"
      ) {
        expect(after.decisions).toHaveLength(1);
        expect(after.decisions[0]).toMatchObject({
          id: before.decisions[0].id,
          value: item.existingPriority,
          createdAt: "2020-01-01T00:00:00.000Z",
          supersededById: null,
        });
      }
    },
  );

  it("changes the saved priority in another Chat while preserving the original Chat's stale native tool history", async () => {
    const { before, after, entries } = await seed(
      scenario("cross-chat-revision"),
    );
    expect(after.decisions).toHaveLength(1);
    const replacement = after.decisions[0];
    expect(replacement.id).not.toBe(before.decisions[0].id);
    expect(replacement.value).toContain("Fast recovery now matters more");
    expect(database.getDecision(before.decisions[0].id)?.supersededById).toBe(
      replacement.id,
    );
    const source = database
      .listMessages(
        after.chats.find((chat) => chat.id !== after.selectedChatId)!.id,
      )
      .find((message) => message.id === replacement.sourceMessageId)!;
    expect(source.body).toBe(replacement.value);
    expect(source.chatId).not.toBe(after.selectedChatId);
    expect(after.messages.some((message) => message.id === source.id)).toBe(
      false,
    );
    const oldLookup = entries.find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "search_decisions",
    )!;
    expect(JSON.stringify(oldLookup)).toContain(before.decisions[0].value);
    expect(JSON.stringify(oldLookup)).not.toContain(replacement.value);
    const current = searchPiDecisions(after.application!.id, []);
    expect(current.records).toMatchObject([
      {
        id: replacement.id,
        replaces: {
          id: before.decisions[0].id,
          value: before.decisions[0].value,
        },
      },
    ]);
  });

  it("seeds a genuine narrow-query miss with activeCount one so broadening has real work to do", async () => {
    const { after, entries } = await seed(scenario("implicit-constraint"));
    const results = entries.flatMap((entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "search_decisions"
        ? [entry.message]
        : [],
    );
    expect(results).toHaveLength(2);
    const missed = JSON.parse(
      results[1].content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
    );
    expect(missed).toEqual({
      records: [],
      nextOffset: null,
      activeCount: 1,
      pendingCount: 0,
    });
    expect(searchPiDecisions(after.application!.id, []).records).toMatchObject([
      { value: "Never risk customer data." },
    ]);
  });

  it.each(["cancelled", "cancelled-compacted"] as const)(
    "%s records an unsuccessful Run but never commits the proposed Decision or native answer",
    async (kind) => {
      const { after, entries } = await seed(scenario(kind));
      expect(after.decisions).toEqual([]);
      expect(
        database.db().$client.prepare("SELECT * FROM decisions").all(),
      ).toEqual([]);
      const [previous] = runs.chatRunSnapshot(
        after.application!.id,
        after.selectedChatId!,
      ).runs;
      expect(previous).toMatchObject({ status: "cancelled", piCalls: 0 });
      expect(after.messages.at(-1)).toMatchObject({
        role: "assistant",
        status: "cancelled",
        body: "",
      });
      const nativeText = JSON.stringify(entries);
      expect(nativeText).toContain("pending, not saved");
      expect(nativeText).toContain(
        "I recorded the one-day retention priority.",
      );
      expect(
        after.messages.some(
          (message) =>
            message.body === "I recorded the one-day retention priority.",
        ),
      ).toBe(false);
      const next = acceptedRun(after, "What is saved now?");
      expect(
        JSON.parse(buildPiRunContext(next, "Current checks")).previousAttempt,
      ).toMatchObject({
        runId: previous.id,
        status: "cancelled",
        savedOutcome: expect.stringContaining("none were committed"),
      });
    },
  );
});

describe("native eval evidence belongs to the requested Run", () => {
  it.each(["missing", "failed", "unmatched"] as const)(
    "a %s lookup result cannot count as successful current retrieval",
    async (resultKind) => {
      const { after } = await seed(scenario("buried-active"));
      const run = acceptedRun(after, "Current question");
      const native = await openNativeChatSession(
        after.application!.id,
        after.selectedChatId!,
      );
      try {
        const manager = native.sessionManager;
        manager.appendCustomMessageEntry(
          "server-guy-run",
          "Current context",
          false,
          { runId: run.id },
        );
        lookup(manager, "current-lookup");
        if (resultKind === "failed")
          lookupResult(manager, "current-lookup", true);
        if (resultKind === "unmatched") lookupResult(manager, "another-lookup");
        expect(
          nativeEvalEvidence(
            after.application!.id,
            after.selectedChatId!,
            run.id,
          ).checks,
        ).toEqual({
          "current Run context persisted": true,
          "retrieved current Decisions": false,
        });
        lookup(manager, "successful-lookup");
        lookupResult(manager, "successful-lookup");
        expect(
          nativeEvalEvidence(
            after.application!.id,
            after.selectedChatId!,
            run.id,
          ).checks["retrieved current Decisions"],
        ).toBe(true);
      } finally {
        native.release();
      }
    },
  );
  it("does not count seeded retrieval or a manual fixture checkpoint when the current Run has no lookup", async () => {
    const { after } = await seed(scenario("implicit-constraint"));
    const native = await openNativeChatSession(
      after.application!.id,
      after.selectedChatId!,
    );
    const run = acceptedRun(after, "A new question");
    try {
      const kept = native.sessionManager.appendMessage({
        role: "user",
        content: "Synthetic fixture checkpoint",
        timestamp: 1,
      });
      native.sessionManager.appendCompaction(
        "Seed checkpoint only",
        kept,
        1_000,
      );
      native.sessionManager.appendCustomMessageEntry(
        "server-guy-run",
        "Current run context",
        false,
        { runId: run.id },
      );
      const evidence = nativeEvalEvidence(
        after.application!.id,
        after.selectedChatId!,
        run.id,
      );
      expect(evidence.checks).toEqual({
        "current Run context persisted": true,
        "retrieved current Decisions": false,
      });
      expect(evidence.toolCalls).toEqual([]);
      expect(evidence.toolResults).toEqual([]);
      expect(evidence.compactions).toEqual([]);
    } finally {
      native.release();
    }
  });
  it("fails the evidence checks without a matching Run context instead of adopting seed tools", async () => {
    const { after } = await seed(scenario("implicit-constraint"));
    const evidence = nativeEvalEvidence(
      after.application!.id,
      after.selectedChatId!,
      "missing-run-marker",
    );
    expect(evidence.checks).toEqual({
      "current Run context persisted": false,
      "retrieved current Decisions": false,
    });
    expect(evidence.toolCalls).toEqual([]);
    expect(evidence.toolResults).toEqual([]);
    expect(evidence.compactions).toEqual([]);
    expect(evidence.modelUsage).toEqual([]);
  });
  it("excludes later Runs' tool calls, results and compactions when reading earlier evidence", async () => {
    const { after } = await seed(scenario("buried-active"));
    const first = acceptedRun(after, "First observed question");
    runs.finishPiRun(first.id, "interrupted", "Fixture ended first Run");
    const second = acceptedRun(after, "Second observed question");
    const native = await openNativeChatSession(
      after.application!.id,
      after.selectedChatId!,
    );
    try {
      const manager = native.sessionManager;
      manager.appendCustomMessageEntry(
        "server-guy-run",
        "First context",
        false,
        { runId: first.id },
      );
      lookup(manager, "first-run-search");
      lookupResult(manager, "first-run-search");
      const kept = manager.appendMessage({
        role: "user",
        content: "Synthetic first-run checkpoint",
        timestamp: 1,
      });
      manager.appendCompaction("First-run checkpoint", kept, 123);
      manager.appendCustomMessageEntry(
        "server-guy-run",
        "Second context",
        false,
        { runId: second.id },
      );
      lookup(manager, "second-run-search");
      lookupResult(manager, "second-run-search");
      manager.appendCompaction("Second-run checkpoint", kept, 456);
      const evidence = nativeEvalEvidence(
        after.application!.id,
        after.selectedChatId!,
        first.id,
      );
      expect(evidence.checks).toEqual({
        "current Run context persisted": true,
        "retrieved current Decisions": true,
      });
      expect(evidence.toolCalls).toMatchObject([{ id: "first-run-search" }]);
      expect(evidence.toolCalls).toHaveLength(1);
      expect(evidence.modelUsage).toHaveLength(1);
      expect(evidence.modelUsage[0]).toMatchObject({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
      expect(evidence.toolResults).toMatchObject([
        { toolCallId: "first-run-search" },
      ]);
      expect(evidence.toolResults).toHaveLength(1);
      expect(evidence.compactions).toMatchObject([
        { summary: "First-run checkpoint", tokensBefore: 123 },
      ]);
      expect(evidence.compactions).toHaveLength(1);
    } finally {
      native.release();
    }
  });
});
