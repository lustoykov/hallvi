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
import { getApplicationStatus } from "../../../src/server/phase-one";
import * as runs from "../../../src/server/pi-runs";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import type {
  ApplicationStatus,
  PhaseOneOperatorView,
} from "../../../src/server/types";
import {
  nativeEvalEvidence,
  seedStaleStatusHistory,
} from "../../evals/native-scenarios";
import { phaseOneCases } from "../../evals/phase-one-cases";
import { seedPhaseOneEvalCase } from "../../evals/seed-phase-one";
import { pushTestDatabase } from "../../test-database";

const DAY = 86_400_000;
const syntheticModel = {
  providerId: "synthetic-no-network",
  modelId: "never-requested",
};
const byId = (id: string) => phaseOneCases.find((item) => item.id === id)!;
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
async function nativeStatusExchange(view: PhaseOneOperatorView) {
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
      stale: JSON.parse(text(result.message)) as ApplicationStatus,
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
const repository = (status: ApplicationStatus) =>
  status.checks.find((check) => check.key === "repository-readable")!;

describe("application status eval cases", () => {
  it("declares which cases must, and which need not, look up status", () => {
    const declared = phaseOneCases.filter((item) => item.statusLookup);
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
      "status-approval-mode-changed",
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
      phaseOneCases.filter((item) => item.staleHistory).map((item) => item.id),
    ).toEqual(["status-stale-check-history", "status-approval-mode-changed"]);
  });

  it("ages the verified repository check so retrieval time and observation time differ", () => {
    const before = seedPhaseOneEvalCase(
      byId("status-repository-still-readable"),
      1,
    );
    const age = Date.now() - Date.parse(before.observations[0].observedAt);
    expect(age).toBeGreaterThan(1.9 * DAY);
    expect(age).toBeLessThan(2.1 * DAY);
    const status = getApplicationStatus(
      before.application!.id,
      before.selectedChatId!,
    );
    expect(repository(status)).toMatchObject({
      status: "passed",
      evidence: [{ observedAt: before.observations[0].observedAt }],
    });
    expect(
      Date.parse(status.retrievedAt) -
        Date.parse(repository(status).evidence[0].observedAt),
    ).toBeGreaterThan(1.9 * DAY);
    expect(status.workspace.status).toBe("ready");
  });

  it("seeds an older success that a newer failed check supersedes, with history claiming readiness", async () => {
    const item = byId("status-stale-check-history");
    const before = seedPhaseOneEvalCase(item, 1);
    expect(
      before.observations.map((observation) => observation.status),
    ).toEqual(["failed", "passed"]);
    const [failed, passed] = before.observations;
    expect(
      Date.parse(failed.observedAt) - Date.parse(passed.observedAt),
    ).toBeGreaterThan(2.9 * DAY);
    const after = await seedStaleStatusHistory(item, before, syntheticModel);
    expect(after.observations).toEqual(before.observations);
    expect(after.checks).toEqual(before.checks);
    expect(after.messages).toEqual(before.messages);
    const { note, stale, assistantText } = await nativeStatusExchange(after);
    expect(note).toBe(true);
    expect(stale.workspace.status).toBe("ready");
    expect(repository(stale)).toMatchObject({
      status: "passed",
      evidence: [{ recordId: passed.id, observedAt: passed.observedAt }],
    });
    expect(
      assistantText.some((body) => body.includes("Launch Brief is ready")),
    ).toBe(true);
    const current = getApplicationStatus(
      after.application!.id,
      after.selectedChatId!,
    );
    expect(current.workspace.status).toBe("in-progress");
    expect(repository(current)).toMatchObject({
      status: "blocked",
      result: failed.summary,
      evidence: [{ recordId: failed.id }],
    });
    expect(JSON.stringify(current)).not.toContain(passed.id);
    expect(
      runs.chatRunSnapshot(after.application!.id, after.selectedChatId!).runs,
    ).toEqual([]);
  });

  it("seeds an outdated Approval Mode answer while the saved mode is Always ask", async () => {
    const item = byId("status-approval-mode-changed");
    const before = seedPhaseOneEvalCase(item, 1);
    const after = await seedStaleStatusHistory(item, before, syntheticModel);
    expect(after.application).toEqual(before.application);
    expect(after.application?.approvalMode).toBe("always-ask");
    const { stale, assistantText } = await nativeStatusExchange(after);
    expect(stale.application.approvalMode).toEqual({
      key: "pi-decides",
      label: "Let Server Guy decide",
    });
    expect(
      assistantText.some((body) => body.includes("Let Server Guy decide")),
    ).toBe(true);
    expect(
      getApplicationStatus(after.application!.id, after.selectedChatId!)
        .application.approvalMode,
    ).toEqual({ key: "always-ask", label: "Always ask" });
  });

  it("counts a status lookup only from a successful call in the requested Run", async () => {
    const before = seedPhaseOneEvalCase(byId("status-blocking-next-step"), 1);
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
