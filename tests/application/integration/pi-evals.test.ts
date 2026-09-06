import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { checkPhaseOne } from "../../evals/check-phase-one";
import {
  evalRepeatCount,
  phaseOneCases,
  selectPhaseOneCases,
  type PhaseOneEvalCase,
} from "../../evals/phase-one-cases";
import type {
  Decision,
  PhaseOneOperatorView,
  PiTurnResult,
} from "../../../src/server/types";

function example(scenario: PhaseOneEvalCase = phaseOneCases[1]) {
  const application = {
    id: "app",
    name: "example",
    repositoryUrl: "https://github.com/qa/example",
    repositoryOwner: "qa",
    repositoryName: "example",
    environment: "production" as const,
    approvalMode: "always-ask" as const,
    approvalScope: "Current application launch",
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
  };
  const prior: Decision = {
    id: "prior",
    applicationId: "app",
    sourceMessageId: "prior-user",
    kind: "launch-priority",
    label: "Additional launch priority",
    value: scenario.existingPriority ?? "Lowest cost",
    supersededById: null,
    createdAt: application.createdAt,
  };
  const before: PhaseOneOperatorView = {
    application,
    workspace: null,
    workspaces: [],
    inspection: null,
    contract: null,
    chats: [],
    selectedChatId: "chat",
    messages: [],
    checks: [],
    decisions: scenario.existingPriority ? [prior] : [],
    observations: [],
    upcomingRequirements: [],
    activity: [],
  };
  const reply: PiTurnResult = {
    message: "A normal reply",
    decisionProposals: scenario.expectedProposals
      ? [
          {
            kind: "launch-priority",
            value: "Fast recovery over lowest cost",
            ...(scenario.replacesExisting ? { replaces: "prior" } : {}),
          },
        ]
      : [],
  };
  const after: PhaseOneOperatorView = {
    ...before,
    messages: [
      {
        id: "user",
        status: "completed",
        revision: 0,
        chatId: "chat",
        role: "user",
        body: scenario.message,
        source: "user",
        createdAt: application.createdAt,
      },
      {
        id: "assistant",
        status: "completed",
        revision: 1,
        chatId: "chat",
        role: "assistant",
        body: reply.message,
        source: "pi",
        createdAt: application.createdAt,
      },
    ],
    decisions: [
      ...(scenario.replacesExisting ? [] : before.decisions),
      ...reply.decisionProposals.map((p) => ({
        ...prior,
        id: "new",
        sourceMessageId: "user",
        value: p.value,
      })),
    ],
  };
  const history = before.decisions.map((d) => ({
    ...d,
    supersededById: scenario.replacesExisting ? "new" : null,
  }));
  const check = () => checkPhaseOne(scenario, before, after, reply, history);
  return { before, after, reply, history, check };
}

describe("Phase 1 eval casebook and exact graders (no model calls)", () => {
  it("has twenty-nine uniquely named cases with explicit semantic rubrics", () => {
    expect(new Set(phaseOneCases.map((c) => c.id)).size).toBe(29);
    expect(phaseOneCases.every((c) => c.message && c.rubric)).toBe(true);
  });

  it("selects a case subset without silently expanding invalid selections", () => {
    expect(selectPhaseOneCases().length).toBe(29);
    expect(
      selectPhaseOneCases("greeting,hypothetical").map((c) => c.id),
    ).toEqual(["greeting", "hypothetical"]);
    for (const value of ["", "missing", "greeting,greeting", "greeting,", ".*"])
      expect(() => selectPhaseOneCases(value)).toThrow("PI_EVAL_CASES");
  });

  it.each(phaseOneCases)(
    "accepts correct structural/state evidence for $id",
    (scenario) => {
      expect(Object.values(example(scenario).check()).every(Boolean)).toBe(
        true,
      );
    },
  );

  it("detects a missing required tool proposal", () => {
    const fixture = example();
    fixture.reply.decisionProposals = [];
    expect(fixture.check()["expected proposal count"]).toBe(false);
  });

  it("rejects a chat that changes repository verification evidence", () => {
    const fixture = example();
    fixture.after.observations = [
      {
        id: "fabricated",
        applicationId: "app",
        kind: "github-repository-identity",
        status: "passed",
        summary: "Claimed access",
        sourceLabel: "Fake",
        sourceUrl: null,
        raw: {},
        observedAt: "2026-09-05T00:00:00Z",
      },
    ];
    expect(
      fixture.check()["repository evidence and gate results unchanged by chat"],
    ).toBe(false);
  });

  it("detects fabricated replacement IDs and incorrect supersession", () => {
    const fixture = example(
      phaseOneCases.find((c) => c.id === "revise-existing")!,
    );
    fixture.reply.decisionProposals[0].replaces = "fabricated";
    fixture.history[0].supersededById = null;
    expect(fixture.check()["exact replacement target"]).toBe(false);
    expect(
      fixture.check()["prior Decisions preserved or superseded exactly"],
    ).toBe(false);
  });

  it("detects mismatched provenance and duplicate messages", () => {
    const fixture = example();
    fixture.after.decisions[0].sourceMessageId = "unrelated-user";
    fixture.after.messages.push(...fixture.after.messages);
    expect(fixture.check()["proposal persistence and provenance"]).toBe(false);
    expect(fixture.check()["one persisted message pair"]).toBe(false);
  });

  it("does not pretend exact checks can judge meaning", () => {
    const fixture = example();
    // Semantically opposite to the requested priority, but structurally valid.
    // This must still be caught by the separate, explicit meaning review.
    fixture.reply.decisionProposals[0].value =
      "Lowest cost matters more than fast recovery";
    fixture.after.decisions[0].value = fixture.reply.decisionProposals[0].value;
    expect(Object.values(fixture.check()).every(Boolean)).toBe(true);
  });

  it("defaults to one repetition and allows explicit extra repetitions", () => {
    expect(evalRepeatCount()).toBe(1);
    expect(evalRepeatCount(undefined)).toBe(1);
    expect(evalRepeatCount("2")).toBe(2);
  });

  it.each(["0", "6", "2.5", "nope"])(
    "rejects an unbounded or invalid repeat count: %s",
    (value) => {
      expect(() => evalRepeatCount(value)).toThrow("1 to 5");
    },
  );

  it.each([
    ["0", "1", "Opt in"],
    ["1", "9", "PI_EVAL_REPEATS"],
  ])(
    "fails closed before loading the live suite (%s, %s)",
    (consent, repeats, expected) => {
      const run = spawnSync(
        process.execPath,
        [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "tests/evals/vitest.config.ts",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SERVER_GUY_LIVE_EVALS: consent,
            PI_EVAL_REPEATS: repeats,
          },
          timeout: 10_000,
        },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(expected);
    },
  );
});
