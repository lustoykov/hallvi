// The operation record projected from the deployment record: one shape that
// receipts, views, marks and Overview read, with the origin reply, other
// conversations' mentions and the read-only log snapshot.
import { describe, expect, it } from "vitest";

import {
  applicationOperations,
  deploymentOperation,
} from "../../../src/server/operation-record";
import {
  conversationMarks,
  navigationIndicators,
} from "../../../src/components/server-guy/operation-model";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const record: DeploymentRecord = {
  id: "dep-1",
  applicationId: "app",
  chatId: "chat-a",
  status: "queued",
  repository: "qa/todo",
  revision: "a".repeat(40),
  plan: null,
  offer: null,
  authority: null,
  serverId: null,
  serverCreateAttempted: false,
  address: null,
  imageId: null,
  url: null,
  verifiedAt: null,
  error: null,
  events: [],
  logs: "",
  createdAt: "2026-09-08T19:20:00.000Z",
  updatedAt: "2026-09-08T19:21:00.000Z",
  originMessageId: "msg-origin",
  mentions: [
    { chatId: "chat-b", messageId: "msg-b", at: "2026-09-09T08:00:00.000Z" },
  ],
};
const plan: NonNullable<DeploymentRecord["plan"]> = {
  summary: "Deploy the todo application with a private database.",
  dockerfile: "Dockerfile",
  generatedDockerfile: null,
  context: ".",
  port: 8000,
  command: null,
  environment: [],
  postgres: { version: "16", variable: "DATABASE_URL", scheme: "postgresql" },
  missingInputs: [{ name: "SECRET_KEY", reason: "Signs sessions" }],
  healthPath: "/health",
  checks: [
    {
      name: "Home page",
      method: "GET",
      path: "/",
      body: null,
      expectedStatus: 200,
      contains: "Todo",
      captureId: null,
    },
  ],
};
const offer = {
  serverType: "cx23",
  location: "fsn1",
  cores: 2,
  memory: 4,
  monthly: 5.99,
  hourly: 0.01,
  currency: "EUR",
};

describe("deployment operation", () => {
  it("keeps the origin reply and other conversations' mentions", () => {
    const operation = deploymentOperation(record);
    expect(operation.origin).toEqual({
      chatId: "chat-a",
      messageId: "msg-origin",
    });
    expect(operation.mentions[0].chatId).toBe("chat-b");
    expect(operation.state).toBe("working");
    expect(operation.kind).toBe("inspection");
    expect(operation.destinations[0]).toBe("deployment");
  });

  it("waits for approval without claiming any change", () => {
    const operation = deploymentOperation({
      ...record,
      status: "awaiting-approval",
      plan,
      offer,
    });
    expect(operation.state).toBe("proposed");
    expect(operation.summary).toContain("Nothing is purchased or changed");
    expect(operation.approval?.action).toBe("Create server and deploy");
    expect(operation.destinations).toContain("database");
  });

  it("turns the recorded events into steps while deploying", () => {
    const operation = deploymentOperation({
      ...record,
      status: "deploying",
      events: [
        { at: "1", message: "Creating the accepted Hetzner instance" },
        { at: "2", message: "Preparing Docker and Compose" },
      ],
    });
    expect(operation.steps?.map((step) => step.state)).toEqual([
      "done",
      "active",
    ]);
  });

  it("is verified only with the recorded verification", () => {
    const operation = deploymentOperation({
      ...record,
      status: "live",
      plan,
      offer,
      url: "http://203.0.113.10",
      verifiedAt: "2026-09-08T19:33:41.000Z",
    });
    expect(operation.state).toBe("verified");
    expect(operation.evidence).toContain("Home page");
    expect(operation.destinations).toEqual(
      expect.arrayContaining(["domains", "logs", "variables"]),
    );
  });

  it("carries the failure's next step and keeps the retry decision", () => {
    const operation = deploymentOperation({
      ...record,
      status: "failed",
      error: "Hetzner rejected creation.",
    });
    expect(operation.state).toBe("failed");
    expect(operation.next).toBe("Hetzner rejected creation.");
    expect(operation.steps?.at(-1)).toEqual({
      label: "Stopped",
      state: "failed",
    });
  });

  it("adds the log snapshot as an inspection without a conversation", () => {
    const operations = applicationOperations({
      ...record,
      status: "live",
      logsCollectedAt: "2026-09-09T09:00:00.000Z",
    });
    expect(operations).toHaveLength(2);
    expect(operations[1]).toMatchObject({
      kind: "inspection",
      state: "inspected",
      origin: null,
      destinations: ["logs"],
    });
  });
});

describe("marks", () => {
  it("lets a waiting decision outrank work and clears a change once seen", () => {
    const proposed = deploymentOperation({
      ...record,
      status: "awaiting-approval",
      plan,
      offer,
    });
    const marks = navigationIndicators([proposed], {});
    expect(marks.deployment?.tone).toBe("needs-you");
    const verified = deploymentOperation({
      ...record,
      status: "live",
      plan,
      offer,
      verifiedAt: record.updatedAt,
    });
    expect(navigationIndicators([verified], {}).deployment?.tone).toBe(
      "updated",
    );
    expect(
      navigationIndicators([verified], { deployment: "2026-09-09T00:00:00Z" })
        .deployment,
    ).toBeUndefined();
    expect(
      conversationMarks(
        [proposed],
        [
          {
            id: "chat-a",
            applicationId: "app",
            workspaceId: "ws",
            title: "Deploy",
            isPrimary: true,
            createdAt: record.createdAt,
            archivedAt: null,
            lastActivityAt: record.createdAt,
          },
        ],
      )["chat-a"]?.tone,
    ).toBe("needs-you");
  });
});
