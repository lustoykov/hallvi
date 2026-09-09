// Every scenario step must replay cleanly and keep the record invariants
// the views rely on: receipts have a home, decisions only while waiting,
// verified operations carry evidence, issues link to their conversation
// once investigated.
import { describe, expect, it } from "vitest";

import {
  allOperations,
  investigateIssue,
  send,
  stateAt,
  stepAfterDecision,
  stepAfterInvestigation,
  tick,
  runJob,
} from "../../../src/components/server-guy/reference/engine";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import { simpleScenario } from "../../../src/components/server-guy/reference/scenario-simple";

describe.each([simpleScenario, richScenario])("$name scenario", (scenario) => {
  it("replays every step with consistent records", () => {
    scenario.steps.forEach((_, index) => {
      const state = stateAt(scenario, index);
      const operations = allOperations(state);
      for (const operation of operations) {
        if (operation.origin) {
          expect(
            state.chats.some((chat) => chat.id === operation.origin!.chatId),
          ).toBe(true);
          if (operation.origin.messageId)
            expect(
              state.messages.some(
                (message) => message.id === operation.origin!.messageId,
              ),
            ).toBe(true);
        }
        if (operation.decision)
          expect(["proposed", "failed"]).toContain(operation.state);
        if (operation.state === "verified" || operation.state === "inspected")
          expect(operation.evidence ?? operation.summary).toBeTruthy();
      }
      for (const issue of state.facts.monitoring?.issues ?? [])
        if (issue.conversationId)
          expect(
            state.chats.some((chat) => chat.id === issue.conversationId),
          ).toBe(true);
      expect(state.clock).toBe(scenario.steps[index].clock);
    });
  });

  it("finds the step that resolves each waiting decision", () => {
    scenario.steps.forEach((_, index) => {
      const state = stateAt(scenario, index);
      for (const operation of allOperations(state))
        if (operation.state === "proposed")
          expect(
            stepAfterDecision(scenario, index, operation.id),
          ).not.toBeNull();
    });
  });
});

describe("in-memory interactions", () => {
  it("investigates an issue into a linked conversation that adopts the work", () => {
    const state = stateAt(richScenario, 7);
    const issue = state.facts.monitoring!.issues[0];
    expect(stepAfterInvestigation(richScenario, 7, issue.id)).toBe(8);
    const result = investigateIssue(state, issue.id);
    expect(result.chatId).toBeTruthy();
    const adopted = result.state.operations.find(
      (item) => item.id === issue.operationId,
    );
    expect(adopted?.origin?.chatId).toBe(result.chatId);
  });

  it("runs a job to completion over ticks", () => {
    let state = runJob(stateAt(richScenario, 13), "Sanity check");
    expect(state.facts.jobs!.runs[0].outcome).toBe("running");
    for (let i = 0; i < 6; i += 1) state = tick(state);
    expect(state.facts.jobs!.runs[0].outcome).toBe("succeeded");
    expect(
      state.operations.find((item) => item.id.startsWith("job-run"))?.state,
    ).toBe("verified");
  });

  it("answers about backups by referring to the existing operation", () => {
    const state = send(
      stateAt(richScenario, 6),
      "chat-deploy",
      "Is my data backed up?",
    );
    const backups = state.operations.find((item) => item.id === "backups")!;
    expect(
      backups.mentions.some((mention) => mention.chatId === "chat-deploy"),
    ).toBe(true);
  });
});
