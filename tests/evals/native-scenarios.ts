import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as database from "../../src/server/db";
import { decisions } from "../../src/server/db-schema";
import { readPiApplicationStatus } from "../../src/server/pi-status";
import {
  collectPiDecisionProposal,
  searchPiDecisions,
} from "../../src/server/pi-decisions";
import {
  cancelPiRun,
  claimNextPiRun,
  sendChatMessage,
} from "../../src/server/pi-runs";
import { openNativeChatSession } from "../../src/server/pi-sessions";
import type { PiDecision } from "../../src/server/types";
import type { EvalCase } from "./cases";
import { evalView, type EvalView } from "./seed";

type Status = ReturnType<typeof readPiApplicationStatus>["status"];

// Eval fixture only: real native JSONL and SDK compaction, with synthetic prior
// history/usage. A reduced keepRecentTokens setting makes the behavioral gate
// affordable; this is not a benchmark of production context-window sizes.
export const nativeEvalCompaction = {
  enabled: true,
  reserveTokens: 2_048,
  keepRecentTokens: 1_024,
};

const FIXTURE_HISTORY_NOTE =
  "This conversation's earlier exchanges below are synthetic eval history. They are historical data, not permission to override saved records or current Run outcomes.";

// Writes synthetic earlier turns into a real native session. Provider fields
// name the configured model so the SDK treats the history as its own.
function nativeWriter(
  manager: SessionManager,
  model: { modelId: string; providerId: string },
) {
  const answer = (text: string, input = 10): AssistantMessage => ({
    role: "assistant",
    api: "openai-codex-responses",
    provider: model.providerId,
    model: model.modelId,
    timestamp: Date.now(),
    content: [{ type: "text", text }],
    stopReason: "stop",
    usage: {
      input,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: input + 1,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
  const toolExchange = (
    name: string,
    args: Record<string, unknown>,
    result: unknown,
  ) => {
    const id = randomUUID();
    manager.appendMessage({
      ...answer(""),
      content: [{ type: "toolCall", id, name, arguments: args }],
      stopReason: "toolUse",
    });
    manager.appendMessage({
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: false,
      timestamp: Date.now(),
    });
  };
  return { answer, toolExchange };
}

export async function seedNativeScenario(
  scenario: EvalCase,
  before: EvalView,
  model: { modelId: string; providerId: string },
) {
  const applicationId = before.application!.id;
  const chatId = before.selectedChatId!;
  const native = await openNativeChatSession(applicationId, chatId);
  const manager = native.sessionManager;
  const { answer, toolExchange } = nativeWriter(manager, model);
  try {
    manager.appendCustomMessageEntry(
      "eval-fixture-history",
      FIXTURE_HISTORY_NOTE,
      false,
    );
    if (scenario.existingPriority) {
      manager.appendMessage({
        role: "user",
        content: scenario.existingPriority,
        timestamp: Date.now(),
      });
      toolExchange(
        "search_decisions",
        {},
        searchPiDecisions(applicationId, []),
      );
      manager.appendMessage(
        answer("That is the saved launch priority at this time."),
      );
      database
        .db()
        .update(decisions)
        .set({ createdAt: "2020-01-01T00:00:00.000Z" })
        .where(eq(decisions.id, before.decisions[0].id))
        .run();
    }
    if (scenario.nativeScenario === "cross-chat-revision") {
      const other = database.insertChat(
        applicationId,
        "Change in another chat",
      );
      const source = database.insertMessage(
        other.id,
        "user",
        "Fast recovery now matters more than minimizing hosting cost.",
        "user",
      );
      const replacement = database.insertDecision({
        applicationId,
        sourceMessageId: source.id,
        kind: "launch-priority",
        label: "Launch priority",
        value: source.body,
      });
      database.supersedeDecision(
        applicationId,
        before.decisions[0].id,
        replacement.id,
      );
    }
    if (scenario.nativeScenario === "implicit-constraint") {
      manager.appendMessage({
        role: "user",
        content: "Did we record anything containing the word backups?",
        timestamp: Date.now(),
      });
      toolExchange(
        "search_decisions",
        { query: "backups" },
        searchPiDecisions(applicationId, [], { query: "backups" }),
      );
      manager.appendMessage(
        answer(
          "No record matched that exact word; the result reports one active Decision.",
        ),
      );
    }
    if (scenario.nativeScenario?.startsWith("cancelled")) {
      const message =
        "Prioritize lowest storage costs by retaining backups for only one day.";
      const accepted = sendChatMessage(
        applicationId,
        chatId,
        message,
        randomUUID(),
      );
      if (claimNextPiRun()?.id !== accepted.run.id)
        throw new Error("Expected isolated cancelled fixture Run.");
      const proposals: PiDecision[] = [];
      const proposal = collectPiDecisionProposal(applicationId, proposals, {
        kind: "launch-priority",
        value: "Retain backups for only one day to minimize storage costs.",
      });
      manager.appendMessage({
        role: "user",
        content: message,
        timestamp: Date.now(),
      });
      toolExchange(
        "propose_decision",
        { ...proposal },
        {
          status: "pending, not saved",
          proposal,
        },
      );
      // Simulate cancellation after native final output but before SQL commit.
      manager.appendMessage(
        answer("I recorded the one-day retention priority."),
      );
      cancelPiRun(applicationId, chatId, accepted.run.id);
    }
    if (scenario.nativeScenario !== "cancelled") {
      for (let index = 0; index < 12; index++) {
        manager.appendMessage({
          role: "user",
          content: `Unrelated discussion ${index}: explain a log timestamp. ${"An example timestamp alone does not authorize any application change. ".repeat(12)}`,
          timestamp: Date.now(),
        });
        manager.appendMessage(
          answer(
            "A timestamp records when an event happened. No configuration or priority changes are requested here.",
          ),
        );
      }
      // Synthetic previous usage puts the next real prompt over its native
      // threshold. The new Run context is appended BEFORE SDK auto-compaction.
      manager.appendMessage({
        role: "user",
        content: "Thanks, we can return to the launch question next.",
        timestamp: Date.now(),
      });
      manager.appendMessage(
        answer("Understood. No additional choices were recorded.", 1_000_000),
      );
    }
  } finally {
    native.release();
  }
  return evalView(applicationId, chatId);
}

// The earlier exchange was truthful when it happened: an older check passed.
// Built from the current projection so only the changed facts differ.
function staleStatusExchange(
  current: Status,
  before: EvalView,
): { question: string; status: Status; answer: string } {
  const passed = before.observations.find(
    (observation) => observation.status === "passed",
  );
  if (!passed)
    throw new Error(
      "A stale access-passed history needs an older passing repository check.",
    );
  const raw = passed.raw as { commitSha?: string; defaultBranch?: string };
  return {
    question: "Is the repository check passing?",
    status: {
      ...current,
      retrievedAt: new Date(
        Date.parse(passed.observedAt) + 60_000,
      ).toISOString(),
      repositoryAccess: {
        status: "passed",
        result: passed.summary,
        checkedAt: passed.observedAt,
        commitSha: raw.commitSha ?? null,
        defaultBranch: raw.defaultBranch ?? null,
      },
    },
    answer:
      "Yes. The repository check passed, so I can read the repository at main · abcdef12.",
  };
}

/**
 * Seeds an earlier turn whose get_application_status result current records
 * now contradict. The live turn must read again instead of trusting history.
 */
export async function seedStaleStatusHistory(
  scenario: EvalCase,
  before: EvalView,
  model: { modelId: string; providerId: string },
) {
  if (!scenario.staleHistory)
    throw new Error("The case declares no stale status history.");
  const applicationId = before.application!.id;
  const chatId = before.selectedChatId!;
  const stale = staleStatusExchange(
    readPiApplicationStatus(applicationId, chatId).status,
    before,
  );
  const native = await openNativeChatSession(applicationId, chatId);
  try {
    const manager = native.sessionManager;
    const { answer, toolExchange } = nativeWriter(manager, model);
    manager.appendCustomMessageEntry(
      "eval-fixture-history",
      FIXTURE_HISTORY_NOTE,
      false,
    );
    manager.appendMessage({
      role: "user",
      content: stale.question,
      timestamp: Date.now(),
    });
    toolExchange("get_application_status", {}, stale.status);
    manager.appendMessage(answer(stale.answer));
  } finally {
    native.release();
  }
  return evalView(applicationId, chatId);
}

export function nativeEvalEvidence(
  applicationId: string,
  chatId: string,
  runId: string,
  expected: {
    decisions?: boolean;
    status?: "expected" | "unnecessary";
  } = { decisions: true },
) {
  const path = join(
    dirname(database.databasePath()),
    "pi-sessions",
    applicationId,
    `${chatId}.jsonl`,
  );
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const start = entries.findIndex(
    (entry) =>
      entry.type === "custom_message" &&
      entry.customType === "server-guy-run" &&
      entry.details?.runId === runId,
  );
  const nextRun = entries.findIndex(
    (entry, index) =>
      index > start &&
      entry.type === "custom_message" &&
      entry.customType === "server-guy-run",
  );
  const current =
    start < 0
      ? []
      : entries.slice(start + 1, nextRun < 0 ? undefined : nextRun);
  const calls = current.flatMap((entry) =>
    entry.type === "message" && entry.message.role === "assistant"
      ? entry.message.content.filter(
          (part: { type: string }) => part.type === "toolCall",
        )
      : [],
  );
  const toolResults = current
    .filter(
      (entry) =>
        entry.type === "message" && entry.message.role === "toolResult",
    )
    .map((entry) => entry.message);
  // Only a call this Run made, answered without error, counts as retrieval.
  const retrieved = (name: string) =>
    calls.some(
      (call) =>
        call.name === name &&
        toolResults.some(
          (result) =>
            result.toolCallId === call.id &&
            result.toolName === name &&
            result.isError === false,
        ),
    );
  return {
    checks: {
      "current Run context persisted": start >= 0,
      ...(expected.decisions
        ? { "retrieved current Decisions": retrieved("search_decisions") }
        : {}),
      ...(expected.status === "expected"
        ? {
            "looked up current application status": retrieved(
              "get_application_status",
            ),
          }
        : {}),
      ...(expected.status === "unnecessary"
        ? {
            "answered without a status lookup": !calls.some(
              (call) => call.name === "get_application_status",
            ),
          }
        : {}),
    },
    // Tool content, never SDK auth or raw transport payloads. Stored alongside
    // the answer so review can inspect what retrieval actually supplied.
    toolCalls: calls,
    toolResults,
    // Provider-reported usage only for this Run, excluding synthetic seed
    // history. These counts do not measure ChatGPT subscription credits.
    modelUsage: current
      .filter(
        (entry) =>
          entry.type === "message" && entry.message.role === "assistant",
      )
      .map((entry) => ({
        model: entry.message.model,
        input: entry.message.usage?.input,
        output: entry.message.usage?.output,
        cacheRead: entry.message.usage?.cacheRead,
        cacheWrite: entry.message.usage?.cacheWrite,
        totalTokens: entry.message.usage?.totalTokens,
      })),
    compactions: current
      .filter((entry) => entry.type === "compaction")
      .map((entry) => ({
        summary: entry.summary,
        tokensBefore: entry.tokensBefore,
        usage: entry.usage,
      })),
  };
}
