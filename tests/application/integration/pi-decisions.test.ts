import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as store from "../../../src/server/db";
import {
  collectPiDecisionProposal,
  MAX_PI_DECISION_PROPOSALS,
  PI_DECISION_PAGE_SIZE,
  proposeDecisionParameters,
  searchDecisionParameters,
  searchPiDecisions,
} from "../../../src/server/pi-decisions";
import * as runs from "../../../src/server/pi-runs";
import type { PiDecision } from "../../../src/server/types";
import { pushTestDatabase } from "../../test-database";

let directory: string;
let current: ReturnType<typeof fixtureApplication>;

function fixtureApplication(name: string) {
  const app = store.insertApplication({
    name,
    repositoryUrl: `https://github.com/qa/${name}`,
    repositoryOwner: "qa",
    repositoryName: name,
    environment: "production",
    approvalMode: "pi-decides",
    approvalScope: "Current application launch",
  });
  const workspace = store.insertWorkspace(app.id);
  const chat = store.insertChat(workspace.id, "Main", true);
  const source = store.insertMessage(chat.id, "user", "Priorities", "user");
  return { app, workspace, chat, source };
}

function saved(
  value: string,
  fixture = current,
  label = "Additional launch priority",
) {
  return store.insertDecision({
    applicationId: fixture.app.id,
    sourceMessageId: fixture.source.id,
    kind: "launch-priority",
    label,
    value,
  });
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-decision-tools-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(directory, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(directory, "config"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});

beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  current = fixtureApplication("current");
});

afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("scoped saved Decision lookup", () => {
  it("keeps no-match counts and pending proposals distinct from saved records", () => {
    const first = saved("Never risk customer data");
    const proposals: PiDecision[] = [
      { kind: "launch-priority", value: "Pending searchable phrase" },
    ];
    expect(
      searchPiDecisions(current.app.id, proposals, { query: "searchable" }),
    ).toEqual({
      records: [],
      nextOffset: null,
      activeCount: 1,
      pendingCount: 1,
    });
    expect(searchPiDecisions(current.app.id, proposals)).toEqual({
      records: [
        {
          id: first.id,
          kind: first.kind,
          label: first.label,
          value: first.value,
          createdAt: first.createdAt,
          sourceMessageId: first.sourceMessageId,
          replaces: null,
        },
      ],
      nextOffset: null,
      activeCount: 1,
      pendingCount: 1,
    });
  });

  it("paginates all matches in creation-time and rowid order, including old active records", () => {
    const expected = Array.from(
      { length: PI_DECISION_PAGE_SIZE * 2 + 3 },
      (_, index) => saved(`Recover quickly ${index}`, current, "Reliability"),
    );
    saved("Unrelated active choice");
    saved(
      "Recover quickly in another application",
      fixtureApplication("other"),
    );
    const old = "2001-01-01T00:00:00.000Z";
    store
      .db()
      .$client.prepare(
        "UPDATE decisions SET created_at = ? WHERE application_id = ?",
      )
      .run(old, current.app.id);
    // This one sorts after every old record even though its rowid comes first.
    store
      .db()
      .$client.prepare("UPDATE decisions SET created_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", expected[0].id);
    const ids: string[] = [];
    let offset: number | null = 0;
    const offsets: Array<number | null> = [];
    while (offset !== null) {
      const result = searchPiDecisions(current.app.id, [], {
        query: "rELiABiLITY",
        offset,
      });
      expect(result.activeCount).toBe(expected.length + 1);
      expect(result.records.length).toBeLessThanOrEqual(PI_DECISION_PAGE_SIZE);
      ids.push(...result.records.map((record) => record.id));
      offset = result.nextOffset;
      offsets.push(offset);
    }
    expect(offsets).toEqual([
      PI_DECISION_PAGE_SIZE,
      PI_DECISION_PAGE_SIZE * 2,
      null,
    ]);
    expect(ids).toEqual(
      [...expected.slice(1), expected[0]].map((record) => record.id),
    );
  });

  it("matches literal substrings in label and value without wildcard expansion", () => {
    const percent = saved("Keep 100% recoverable", current, "Risk");
    const underscore = saved("Keep costs low", current, "cost_priority");
    saved("Keep everything recoverable", current, "CostXpriority");
    expect(
      searchPiDecisions(current.app.id, [], { query: "%" }).records.map(
        (row) => row.id,
      ),
    ).toEqual([percent.id]);
    expect(
      searchPiDecisions(current.app.id, [], { query: "_" }).records.map(
        (row) => row.id,
      ),
    ).toEqual([underscore.id]);
    expect(
      searchPiDecisions(current.app.id, [], {
        query: "100% RECOV",
      }).records.map((row) => row.id),
    ).toEqual([percent.id]);
  });

  it("matches mixed-case Cyrillic substrings in both label and value", () => {
    const valueMatch = saved("Първо НАДЕЖДНОСТТА", current, "Priority");
    const labelMatch = saved("Protect customer data", current, "Надеждност");
    saved("Разходи");
    expect(
      searchPiDecisions(current.app.id, [], {
        query: "нАдЕжДнОсТ",
      }).records.map((row) => row.id),
    ).toEqual([valueMatch.id, labelMatch.id]);
  });

  it("returns only active records and one level of same-application lineage", () => {
    const original = saved("Cost first");
    const previous = saved("Reliability first");
    const latest = saved("Never risk customer data");
    store.supersedeDecision(current.app.id, original.id, previous.id);
    store.supersedeDecision(current.app.id, previous.id, latest.id);
    expect(searchPiDecisions(current.app.id, []).records).toEqual([
      {
        id: latest.id,
        kind: latest.kind,
        label: latest.label,
        value: latest.value,
        createdAt: latest.createdAt,
        sourceMessageId: latest.sourceMessageId,
        replaces: { id: previous.id, value: previous.value },
      },
    ]);
    expect(
      searchPiDecisions(current.app.id, [], { query: "Cost" }).records,
    ).toEqual([]);
  });

  it("does not leak foreign source or replacement references from inconsistent legacy rows", () => {
    const foreign = fixtureApplication("other");
    const original = saved("Private foreign value", foreign);
    const local = saved("Visible local value");
    store
      .db()
      .$client.prepare("UPDATE decisions SET superseded_by_id = ? WHERE id = ?")
      .run(local.id, original.id);
    store
      .db()
      .$client.prepare(
        "UPDATE decisions SET source_message_id = ? WHERE id = ?",
      )
      .run(foreign.source.id, local.id);
    expect(searchPiDecisions(current.app.id, []).records).toMatchObject([
      { id: local.id, sourceMessageId: null, replaces: null },
    ]);
    expect(searchPiDecisions(current.app.id, []).activeCount).toBe(1);
    expect(searchPiDecisions(foreign.app.id, []).records).toEqual([]);
  });

  it("performs no writes and propagates lookup failures instead of returning empty success", () => {
    saved("Never risk customer data");
    const client = store.db().$client;
    const changes = () =>
      client.prepare("SELECT total_changes() AS count").get();
    const before = changes();
    searchPiDecisions(current.app.id, []);
    expect(changes()).toEqual(before);
    const failingRead = vi
      .spyOn(client, "prepare")
      .mockImplementationOnce(() => {
        throw new Error("Decision lookup unavailable");
      });
    try {
      expect(() => searchPiDecisions(current.app.id, [])).toThrow(
        "Decision lookup unavailable",
      );
    } finally {
      failingRead.mockRestore();
    }
  });

  it.each([
    { offset: -1 },
    { offset: 1.5 },
    { applicationId: "other" },
    { query: 4 },
  ])(
    "rejects malformed or expanded search authority through the SDK schema: %j",
    (input) => expect(Value.Check(searchDecisionParameters, input)).toBe(false),
  );
});

describe("Decision proposals and the final commit", () => {
  it("checks replacements before collecting, permits same-kind additions, and saves nothing early", () => {
    const prior = saved("Cost first");
    const proposals: PiDecision[] = [];
    expect(
      collectPiDecisionProposal(current.app.id, proposals, {
        kind: "launch-priority",
        value: "  Reliability first  ",
        replaces: prior.id,
      }),
    ).toEqual({
      kind: "launch-priority",
      value: "Reliability first",
      replaces: prior.id,
    });
    expect(() =>
      collectPiDecisionProposal(current.app.id, proposals, {
        kind: "launch-priority",
        value: "Another revision",
        replaces: prior.id,
      }),
    ).toThrow("pending proposal already replaces");
    collectPiDecisionProposal(current.app.id, proposals, {
      kind: "launch-priority",
      value: "Keep operations simple",
    });
    expect(proposals).toHaveLength(2);
    expect(store.listActiveDecisions(current.app.id)).toEqual([prior]);
    expect(searchPiDecisions(current.app.id, proposals)).toMatchObject({
      activeCount: 1,
      pendingCount: 2,
    });
  });

  it("rejects missing, foreign, stale and blank proposals without collecting them", () => {
    const stale = saved("Old choice");
    const replacement = saved("Current choice");
    store.supersedeDecision(current.app.id, stale.id, replacement.id);
    const foreign = saved(
      "Another application's choice",
      fixtureApplication("other"),
    );
    const proposals: PiDecision[] = [];
    for (const replaces of [randomUUID(), stale.id, foreign.id]) {
      expect(() =>
        collectPiDecisionProposal(current.app.id, proposals, {
          kind: "launch-priority",
          value: "Replacement",
          replaces,
        }),
      ).toThrow("missing, already replaced, or belongs to another application");
      expect(proposals).toEqual([]);
    }
    expect(() =>
      collectPiDecisionProposal(current.app.id, proposals, {
        kind: "launch-priority",
        value: "   ",
      }),
    ).toThrow("empty");
    expect(proposals).toEqual([]);
  });

  it("bounds pending proposals and relies on TypeBox for argument shape validation", () => {
    const proposals: PiDecision[] = Array.from(
      { length: MAX_PI_DECISION_PROPOSALS },
      () => ({
        kind: "launch-priority",
        value: "Additional priority",
      }),
    );
    expect(() =>
      collectPiDecisionProposal(current.app.id, proposals, {
        kind: "launch-priority",
        value: "One too many",
      }),
    ).toThrow("more than 20 Decisions");
    expect(proposals).toHaveLength(MAX_PI_DECISION_PROPOSALS);
    expect(
      Value.Check(proposeDecisionParameters, {
        kind: "launch-priority",
        value: "Priority",
        applicationId: "foreign",
      }),
    ).toBe(false);
  });

  it("rolls back every staged Decision, activity and answer if a valid proposal becomes stale before commit", () => {
    const previous = saved("Cost first");
    const proposals: PiDecision[] = [];
    collectPiDecisionProposal(current.app.id, proposals, {
      kind: "launch-priority",
      value: "Keep operations simple",
    });
    collectPiDecisionProposal(current.app.id, proposals, {
      kind: "launch-priority",
      value: "Reliability first",
      replaces: previous.id,
    });
    const accepted = runs.sendChatMessage(
      current.app.id,
      current.chat.id,
      "Revise priorities",
      randomUUID(),
    );
    const run = runs.claimNextPiRun()!;
    expect(run.id).toBe(accepted.run.id);
    const competing = saved("A newer saved priority");
    store.supersedeDecision(current.app.id, previous.id, competing.id);
    const beforeActivity = store.listActivity(current.workspace.id);
    const beforeMessages = store.listMessages(current.chat.id);
    expect(() =>
      runs.completePiRun(run.id, {
        message: "Saved all priorities",
        decisionProposals: proposals,
      }),
    ).toThrow("already replaced");
    expect(store.listActiveDecisions(current.app.id)).toEqual([competing]);
    expect(store.listActivity(current.workspace.id)).toEqual(beforeActivity);
    expect(store.listMessages(current.chat.id)).toEqual(beforeMessages);
    expect(runs.getPiRun(run.id)?.status).toBe("running");
    runs.finishPiRun(run.id, "failed", "The Decisions could not be saved.");
    expect(runs.getPiRun(run.id)?.status).toBe("failed");
    expect(store.listMessages(current.chat.id).at(-1)?.body).toBe("");
  });

  it("commits a replacement, a same-kind addition, their events, answer and Run success together", () => {
    const previous = saved("Cost first");
    const accepted = runs.sendChatMessage(
      current.app.id,
      current.chat.id,
      "Revise priorities",
      randomUUID(),
    );
    const run = runs.claimNextPiRun()!;
    expect(run.id).toBe(accepted.run.id);
    expect(
      runs.completePiRun(run.id, {
        message: "Updated priorities",
        decisionProposals: [
          {
            kind: "launch-priority",
            value: "Reliability first",
            replaces: previous.id,
          },
          { kind: "launch-priority", value: "Keep operations simple" },
        ],
      }),
    ).toBe(true);
    expect(runs.getPiRun(run.id)?.status).toBe("succeeded");
    expect(store.listMessages(current.chat.id).at(-1)).toMatchObject({
      body: "Updated priorities",
      status: "completed",
    });
    expect(store.listActiveDecisions(current.app.id)).toMatchObject([
      { value: "Reliability first", sourceMessageId: run.userMessageId },
      { value: "Keep operations simple", sourceMessageId: run.userMessageId },
    ]);
    expect(
      store.listActivity(current.workspace.id).map((event) => event.kind),
    ).toEqual(["decision-recorded", "decision-revised"]);
  });

  it("guards replacement ownership as well as the old Decision's active application scope", () => {
    const previous = saved("Current application's choice");
    const foreign = saved(
      "Foreign application's choice",
      fixtureApplication("other"),
    );
    expect(() =>
      store.supersedeDecision(current.app.id, previous.id, foreign.id),
    ).toThrow();
    expect(() =>
      store.supersedeDecision(current.app.id, previous.id, previous.id),
    ).toThrow();
    expect(store.getActiveDecision(current.app.id, previous.id)).toEqual(
      previous,
    );
    expect(store.getActiveDecision(current.app.id, foreign.id)).toBeNull();
  });
});
