import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatPane } from "../../../src/components/server-guy/chat-pane";
import { ContractRecord } from "../../../src/components/server-guy/contract-record";
import { describeCurrentStep } from "../../../src/components/server-guy/current-step";
import { CurrentStepBar } from "../../../src/components/server-guy/current-step-bar";
import { Inspector } from "../../../src/components/server-guy/inspector";
import { PhaseRail } from "../../../src/components/server-guy/phase-rail";
import type {
  ApplicationContractView,
  ApplicationRecord,
  OperatorView,
  PhaseWorkspaceView,
} from "../../../src/server/types";

const at = "2026-09-06T10:00:00.000Z";
const COMMIT = "f".repeat(40);
const application: ApplicationRecord = {
  id: "app",
  name: "todo",
  repositoryUrl: "https://github.com/qa/todo",
  repositoryOwner: "qa",
  repositoryName: "todo",
  environment: "production",
  approvalMode: "pi-decides",
  approvalScope: "Current application launch",
  createdAt: at,
  updatedAt: at,
};
const start: PhaseWorkspaceView = {
  id: "ws-1",
  applicationId: "app",
  phaseKey: "start",
  createdAt: at,
  completedAt: null,
  deliverableEvidence: null,
  phaseNumber: 1,
  name: "Start",
  deliverable: "Launch Brief",
  status: "ready",
  current: true,
};
const completedStart: PhaseWorkspaceView = {
  ...start,
  completedAt: at,
  deliverableEvidence: { completedAt: at, checks: [] },
  status: "completed",
  current: false,
};
const inspect: PhaseWorkspaceView = {
  ...start,
  id: "ws-2",
  phaseKey: "inspect-app",
  phaseNumber: 2,
  name: "Inspect app",
  deliverable: "Application Contract",
  status: "in-progress",
};
const contract: ApplicationContractView = {
  id: "contract-1",
  applicationId: "app",
  workspaceId: "ws-2",
  version: 2,
  profileId: "fastapi-uv",
  profileVersion: 1,
  commitSha: COMMIT,
  sourceMessageId: "m",
  body: {
    profileId: "fastapi-uv",
    profileVersion: 1,
    commitSha: COMMIT,
    summary: "FastAPI service managed with uv.",
    fields: [
      {
        key: "network.port",
        value: "8000",
        provenance: {
          kind: "repository-declared",
          citation: {
            observationId: "o1",
            path: "Dockerfile",
            snippet: "EXPOSE 8000",
            line: 7,
          },
        },
      },
      {
        key: "health.path",
        value: "/healthz",
        provenance: {
          kind: "user-confirmed",
          source: { type: "message", messageId: "m1", quote: "/healthz" },
        },
        conformance: { observed: "no route", change: "add GET /healthz" },
      },
      {
        key: "persistence.database",
        value: null,
        provenance: {
          kind: "unresolved",
          blocker: "contradiction",
          reason: "SQLite where PostgreSQL is expected.",
          observed: "sqlite:///./todo.db",
          citation: {
            observationId: "o2",
            path: "app/config.py",
            snippet: "sqlite",
            line: 5,
          },
        },
      },
      {
        key: "backup.policy",
        value: null,
        provenance: {
          kind: "unresolved",
          blocker: "policy",
          dependency: "U1",
          reason: "Open until U1.",
        },
      },
      {
        key: "runtime.startCommand",
        value: "uv run uvicorn app.main:app",
        provenance: {
          kind: "inferred",
          citation: {
            observationId: "o1",
            path: "Dockerfile",
            snippet: 'CMD ["uv"]',
            line: 8,
          },
        },
      },
    ],
  },
  supersededById: null,
  createdAt: at,
  gaps: {
    blockers: [
      {
        field: "persistence.database",
        label: "Database",
        blocker: "contradiction",
        reason: "SQLite where PostgreSQL is expected.",
        observed: "sqlite:///./todo.db",
      },
    ],
    conformance: [
      {
        field: "health.path",
        label: "Health endpoint",
        observed: "no route",
        change: "add GET /healthz",
      },
    ],
    policies: [
      {
        field: "backup.policy",
        label: "Backup and restore",
        dependency: "U1",
        requiredBeforePhase: 7,
        reason: "Open until U1.",
      },
    ],
  },
  provenanceIssues: [],
};
function view(overrides: Partial<OperatorView>): OperatorView {
  return {
    application,
    workspace: start,
    workspaces: [start],
    chats: [],
    selectedChatId: null,
    messages: [],
    checks: [],
    decisions: [],
    observations: [],
    upcomingRequirements: [],
    activity: [],
    inspection: null,
    contract: null,
    conformance: null,
    ...overrides,
  };
}

describe("phase strip", () => {
  it("marks the current, completed and viewed phases and leaves future phases inert", () => {
    const html = renderToStaticMarkup(
      <PhaseRail
        busy={false}
        checks={[]}
        onSelectPhase={() => {}}
        viewedPhaseKey="start"
        workspaces={[completedStart, { ...inspect, current: true }]}
      />,
    );
    expect(html).toContain('class="sg-phase completed viewed"');
    expect(html).toContain('class="sg-phase active"');
    expect(html).toContain('aria-label="View completed phase 1, Start"');
    expect(html).toContain('aria-label="View phase 2, Inspect app"');
    expect(html).toContain("Completed");
    expect(html).not.toContain('aria-label="View phase 3');
    expect(html).toContain('title="Deliverable: Conformance Result"');
  });
});

describe("current step bar", () => {
  const render = (v: OperatorView) =>
    renderToStaticMarkup(
      <CurrentStepBar
        busy={null}
        demo={false}
        onAction={() => {}}
        repository="qa/todo"
        step={describeCurrentStep(v)}
      />,
    );
  it("offers Continue only on a ready, current Launch Brief", () => {
    expect(render(view({ workspace: start }))).toContain(
      "Continue to Inspect app",
    );
    expect(
      render(view({ workspace: { ...start, status: "in-progress" } })),
    ).not.toContain("Continue to Inspect app");
    expect(
      render(
        view({
          workspace: completedStart,
          workspaces: [completedStart, { ...inspect, current: true }],
        }),
      ),
    ).not.toContain("Continue to Inspect app");
    expect(
      render(view({ workspace: { ...inspect, status: "ready" } })),
    ).not.toContain("Continue to Inspect app");
  });
  it("names the phase's purpose and offers Continue to Phase 3 when the contract is ready", () => {
    const html = render(
      view({
        workspace: { ...inspect, status: "ready" },
        workspaces: [completedStart, { ...inspect, status: "ready" }],
        // Ready means no blocker is left; the fixture contract keeps its one
        // required change for Phase 3.
        contract: { ...contract, gaps: { ...contract.gaps, blockers: [] } },
        inspection: {
          observationId: "insp",
          status: "passed",
          summary: "Inspected",
          observedAt: at,
          commitSha: COMMIT,
          defaultBranch: "main",
          connectionCurrent: true,
          current: true,
          entries: 12,
          truncated: false,
          filesRead: 3,
          profile: {
            status: "matched",
            profileId: "fastapi-uv",
            profileVersion: 1,
            label: "FastAPI + uv",
            criteria: [],
            reason: null,
          },
        },
      }),
    );
    expect(html).toContain(
      "Understand the application and identify required changes",
    );
    expect(html).toContain("Continue to Make launch-ready");
    expect(html).toContain("Waiting for you");
    expect(html).toContain("1 required change remains for Phase 3");
  });
  it("sends a completed phase to the current one instead of offering its Continue", () => {
    const html = render(
      view({
        workspace: completedStart,
        workspaces: [completedStart, { ...inspect, current: true }],
      }),
    );
    expect(html).toContain("Go to Phase 2 · Inspect app");
    expect(html).toContain("retained as recorded then");
  });
});

describe("inspector record", () => {
  const render = (v: OperatorView) =>
    renderToStaticMarkup(
      <Inspector
        onHide={() => undefined}
        onToggleWidth={() => undefined}
        busy={null}
        checks={v.checks}
        onConformance={() => {}}
        onSelectCheck={() => {}}
        view={v}
      />,
    );
  it("explains a completed phase as retained evidence and names the viewed deliverable", () => {
    const html = render(
      view({
        workspace: completedStart,
        workspaces: [completedStart, inspect],
      }),
    );
    expect(html).toContain("retained as recorded then");
    expect(html).toContain("Launch Brief");
    expect(html).toContain("Completed");
  });
  it("shows the contract record for Inspect app without a Continue of its own", () => {
    const html = render(
      view({
        workspace: { ...inspect, status: "ready" },
        workspaces: [completedStart, inspect],
        contract,
      }),
    );
    expect(html).toContain("Application Contract v2");
    expect(html).toContain("Ready for review");
    expect(html).not.toContain("Continue to Make launch-ready");
    expect(
      render(
        view({ workspace: inspect, workspaces: [completedStart, inspect] }),
      ),
    ).toContain("No Application Contract yet");
  });
});

describe("contract record", () => {
  const html = renderToStaticMarkup(
    <ContractRecord
      application={application}
      contract={contract}
      inspection={{
        observationId: "insp",
        status: "passed",
        summary: "Inspected",
        observedAt: at,
        commitSha: COMMIT,
        defaultBranch: "main",
        connectionCurrent: true,
        current: true,
        entries: 12,
        truncated: false,
        filesRead: 3,
        profile: {
          status: "matched",
          profileId: "fastapi-uv",
          profileVersion: 1,
          label: "FastAPI + uv",
          criteria: [],
          reason: null,
        },
      }}
    />,
  );
  it("groups fields with provenance badges and exact source links", () => {
    expect(html).toContain("Port and bind");
    expect(html).toContain('class="sg-provenance repository-declared"');
    expect(html).toContain('class="sg-provenance user-confirmed"');
    expect(html).toContain('class="sg-provenance inferred"');
    expect(html).toContain('class="sg-provenance unresolved"');
    expect(html).toContain(
      `https://github.com/qa/todo/blob/${COMMIT}/Dockerfile#L7`,
    );
    expect(html).toContain("EXPOSE 8000");
    expect(html).toContain("You said: “/healthz”");
    expect(html).toContain(`href="/api/contracts/contract-1"`);
    expect(html).toContain(`https://github.com/qa/todo/tree/${COMMIT}`);
  });
  it("separates blockers, conformance work and open policies", () => {
    expect(html).toContain("Needs your decision");
    expect(html).toContain(
      "contradiction: SQLite where PostgreSQL is expected.",
    );
    expect(html).toContain("Conformance work for Phase 3");
    expect(html).toContain("Phase 3 work");
    expect(html).toContain("Open product policies for later gates");
    expect(html).toContain("U1 · required before phase 7");
    expect(html).toContain("Open policy");
  });
  it("escapes repository text instead of rendering it", () => {
    const hostile = renderToStaticMarkup(
      <ContractRecord
        application={application}
        inspection={null}
        contract={{
          ...contract,
          body: {
            ...contract.body,
            summary: "<img src=x onerror=alert(1)>",
            fields: [
              {
                key: "network.port",
                value: "8000",
                provenance: {
                  kind: "repository-declared",
                  citation: {
                    observationId: "o1",
                    path: "Dockerfile",
                    snippet: "<script>EXPOSE 8000</script>",
                    line: 1,
                  },
                },
              },
            ],
          },
          gaps: { blockers: [], conformance: [], policies: [] },
        }}
      />,
    );
    expect(hostile).not.toContain("<script>");
    expect(hostile).not.toContain("<img");
    expect(hostile).toContain("&lt;script&gt;");
  });
});

describe("chat pane phase states", () => {
  const base = (overrides: Partial<OperatorView>) =>
    renderToStaticMarkup(
      <ChatPane
        view={view(overrides)}
        activeChat={{
          id: "chat",
          workspaceId: "ws-2",
          title: "Application Contract",
          isPrimary: true,
          createdAt: at,
          archivedAt: null,
        }}
        busy={null}
        error={null}
        pendingMessage={null}
        piReady
        composer=""
        onComposerChange={vi.fn()}
        onSend={vi.fn()}
        onArchive={vi.fn()}
        runs={[]}
        reconnecting={false}
        onRunAction={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );
  it("attributes a request Server Guy started to Server Guy, never to the engineer", () => {
    const html = base({
      workspace: inspect,
      messages: [
        {
          id: "m1",
          chatId: "chat",
          role: "user",
          source: "server-guy",
          body: "Inspect the repository and propose the Application Contract.",
          createdAt: at,
          status: "completed",
          revision: 0,
        },
        {
          id: "m2",
          chatId: "chat",
          role: "user",
          source: "user",
          body: "Hello",
          createdAt: at,
          status: "completed",
          revision: 0,
        },
      ],
    });
    expect(html).toContain("Started automatically");
    expect(html).toMatch(
      /SG<\/span><strong>Server Guy<\/strong><span class="sg-source-tag">Started automatically/,
    );
    expect(html).toMatch(/You<\/span><strong>You<\/strong>/);
    // The phase's state lives in the current-step bar; the chat header only
    // names the chat.
    expect(html).toContain("Main phase chat");
    expect(html).not.toContain("Working toward");
  });
  it("makes a completed phase read-only with an explicit reason", () => {
    const html = base({
      workspace: completedStart,
      workspaces: [completedStart, inspect],
    });
    expect(html).toContain("Phase 1 is complete · read-only");
    expect(html).toContain("Phase 1 is complete and its chats are read-only");
    expect(html).toMatch(/<textarea disabled/);
    expect(html).not.toContain("Archive chat");
  });
});
