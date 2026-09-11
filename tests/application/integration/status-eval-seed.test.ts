// Application status eval fixtures: real records, an aged repository check,
// and an explicitly synthetic earlier status exchange that current records now
// contradict. No provider, credential or GitHub work happens here.
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
import { readPiApplicationStatus } from "../../../src/server/pi-status";
import * as runs from "../../../src/server/pi-runs";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import {
  nativeEvalEvidence,
  seedStaleStatusHistory,
} from "../../evals/native-scenarios";
import { evalCases } from "../../evals/cases";
import { seedEvalCase, type EvalView } from "../../evals/seed";
import { pushTestDatabase } from "../../test-database";

const DAY = 86_400_000;
const syntheticModel = {
  providerId: "synthetic-no-network",
  modelId: "never-requested",
};
const byId = (id: string) => evalCases.find((item) => item.id === id)!;
type Status = ReturnType<typeof readPiApplicationStatus>["status"];
const statusOf = (view: EvalView) =>
  readPiApplicationStatus(view.application!.id, view.selectedChatId!).status;
let root: string;
const fetch = vi.fn(() => {
  throw new Error("Status seed tests cannot make network requests.");
});
const configure = vi.fn(async () => {
  throw new Error("Status seed tests cannot configure a provider.");
});
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-status-eval-seed-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "eval.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "pi"));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(configuration, "configuredPiRuntime").mockImplementation(configure);
  pushTestDatabase(database.databasePath());
});
beforeEach(() => {
  database.db().$client.exec("DELETE FROM applications");
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(configure).not.toHaveBeenCalled();
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const text = (message: { content: Array<{ type: string; text?: string }> }) =>
  message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
async function nativeStatusExchange(view: EvalView) {
  const native = await openNativeChatSession(
    view.application!.id,
    view.selectedChatId!,
  );
  try {
    const entries = native.sessionManager.getEntries();
    const result = entries.find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "get_application_status",
    );
    if (
      !result ||
      result.type !== "message" ||
      result.message.role !== "toolResult"
    )
      throw new Error("Expected a seeded status exchange.");
    const assistantText = entries.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "assistant"
        ? [text(entry.message as AssistantMessage)]
        : [],
    );
    return {
      note: entries.some(
        (entry) =>
          entry.type === "custom_message" &&
          entry.customType === "eval-fixture-history",
      ),
      stale: JSON.parse(text(result.message)) as Status,
      assistantText,
    };
  } finally {
    native.release();
  }
}
function statusCall(manager: SessionManager, id: string) {
  manager.appendMessage({
    role: "assistant",
    api: "openai-codex-responses",
    provider: syntheticModel.providerId,
    model: syntheticModel.modelId,
    content: [
      { type: "toolCall", id, name: "get_application_status", arguments: {} },
    ],
    stopReason: "toolUse",
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
}
function statusResult(manager: SessionManager, id: string, isError = false) {
  manager.appendMessage({
    role: "toolResult",
    toolCallId: id,
    toolName: "get_application_status",
    content: [{ type: "text", text: isError ? "Lookup failed" : "{}" }],
    isError,
    timestamp: Date.now(),
  });
}

describe("application status eval cases", () => {
  it("declares which cases must, and which need not, look up status", () => {
    const declared = evalCases.filter((item) => item.statusLookup);
    expect(declared.map((item) => item.id)).toEqual([
      "greeting",
      "github-connected-not-readable",
      "github-reconnected-stale-success",
      "github-verified-not-audited",
      "status-thanks-no-lookup",
      "status-concept-no-lookup",
      "status-blocking-next-step",
      "status-repository-still-readable",
      "status-stale-check-history",
      "status-ready-not-deployed",
    ]);
    expect(
      declared
        .filter((item) => item.statusLookup === "unnecessary")
        .map((item) => item.id),
    ).toEqual([
      "greeting",
      "status-thanks-no-lookup",
      "status-concept-no-lookup",
    ]);
    expect(declared.every((item) => item.expectedProposals === 0)).toBe(true);
    expect(
      evalCases.filter((item) => item.staleHistory).map((item) => item.id),
    ).toEqual(["status-stale-check-history"]);
  });

  it("ages the verified repository check so retrieval time and observation time differ", () => {
    const before = seedEvalCase(byId("status-repository-still-readable"), 1);
    const age = Date.now() - Date.parse(before.observations[0].observedAt);
    expect(age).toBeGreaterThan(1.9 * DAY);
    expect(age).toBeLessThan(2.1 * DAY);
    const status = statusOf(before);
    expect(status.repositoryAccess).toMatchObject({
      status: "passed",
      checkedAt: before.observations[0].observedAt,
    });
    expect(
      Date.parse(status.retrievedAt) -
        Date.parse(status.repositoryAccess.checkedAt!),
    ).toBeGreaterThan(1.9 * DAY);
  });

  it("seeds an older success that a newer failed check supersedes, with history claiming readiness", async () => {
    const item = byId("status-stale-check-history");
    const before = seedEvalCase(item, 1);
    expect(
      before.observations.map((observation) => observation.status),
    ).toEqual(["failed", "passed"]);
    const [failed, passed] = before.observations;
    expect(
      Date.parse(failed.observedAt) - Date.parse(passed.observedAt),
    ).toBeGreaterThan(2.9 * DAY);
    const after = await seedStaleStatusHistory(item, before, syntheticModel);
    expect(after.observations).toEqual(before.observations);
    expect(after.messages).toEqual(before.messages);
    const { note, stale, assistantText } = await nativeStatusExchange(after);
    expect(note).toBe(true);
    expect(stale.repositoryAccess).toMatchObject({
      status: "passed",
      result: passed.summary,
      checkedAt: passed.observedAt,
    });
    expect(
      assistantText.some((body) =>
        body.includes("The repository check passed"),
      ),
    ).toBe(true);
    const current = statusOf(after);
    expect(current.repositoryAccess).toMatchObject({
      status: "blocked",
      result: failed.summary,
      checkedAt: failed.observedAt,
    });
    expect(JSON.stringify(current)).not.toContain(passed.summary);
    expect(
      runs.chatRunSnapshot(after.application!.id, after.selectedChatId!).runs,
    ).toEqual([]);
  });

  it("counts a status lookup only from a successful call in the requested Run", async () => {
    const before = seedEvalCase(byId("status-blocking-next-step"), 1);
    const applicationId = before.application!.id;
    const chatId = before.selectedChatId!;
    const accepted = runs.sendChatMessage(
      applicationId,
      chatId,
      "Where do we stand?",
      randomUUID(),
    );
    expect(runs.claimNextPiRun()?.id).toBe(accepted.run.id);
    const native = await openNativeChatSession(applicationId, chatId);
    try {
      const manager = native.sessionManager;
      manager.appendCustomMessageEntry("server-guy-run", "Context", false, {
        runId: accepted.run.id,
      });
      const evidence = (expected: Parameters<typeof nativeEvalEvidence>[3]) =>
        nativeEvalEvidence(applicationId, chatId, accepted.run.id, expected)
          .checks;
      expect(evidence({ decisions: false, status: "expected" })).toEqual({
        "current Run context persisted": true,
        "looked up current application status": false,
      });
      expect(evidence({ decisions: false, status: "unnecessary" })).toEqual({
        "current Run context persisted": true,
        "answered without a status lookup": true,
      });
      statusCall(manager, "failed-lookup");
      statusResult(manager, "failed-lookup", true);
      expect(evidence({ decisions: false, status: "expected" })).toEqual({
        "current Run context persisted": true,
        "looked up current application status": false,
      });
      statusCall(manager, "successful-lookup");
      statusResult(manager, "successful-lookup");
      expect(evidence({ decisions: false, status: "expected" })).toEqual({
        "current Run context persisted": true,
        "looked up current application status": true,
      });
      expect(evidence({ decisions: false, status: "unnecessary" })).toEqual({
        "current Run context persisted": true,
        "answered without a status lookup": false,
      });
      // Native scenarios keep their original expectation by default.
      expect(evidence(undefined)).toEqual({
        "current Run context persisted": true,
        "retrieved current Decisions": false,
      });
    } finally {
      native.release();
    }
  });
});
