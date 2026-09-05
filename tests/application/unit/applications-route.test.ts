import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPhaseOneApplication: vi.fn(),
}));

vi.mock("../../../src/server/phase-one", () => ({
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  createPhaseOneApplication: mocks.createPhaseOneApplication,
}));

import { POST } from "../../../src/app/api/applications/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function rawRequest(body: string) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/applications", () => {
  beforeEach(() => {
    mocks.createPhaseOneApplication.mockReset();
  });

  it("passes an explicitly selected permission policy to the domain", async () => {
    mocks.createPhaseOneApplication.mockResolvedValue({
      created: true,
      view: { application: { id: "app" } },
    });

    const response = await POST(
      request({
        repositoryUrl: "git@github.com:lustoykov/todo-fastapi.git",
        approvalMode: "always-ask",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createPhaseOneApplication).toHaveBeenCalledWith({
      repositoryUrl: "git@github.com:lustoykov/todo-fastapi.git",
      environment: "production",
      approvalMode: "always-ask",
    });
  });

  it.each([
    ["missing", undefined],
    ["unsupported", "sometimes-ask"],
  ])(
    "rejects a %s permission policy instead of silently defaulting it",
    async (_label, approvalMode) => {
      const response = await POST(
        request({
          repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
          ...(approvalMode === undefined ? {} : { approvalMode }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Choose a valid permission policy.",
      });
      expect(mocks.createPhaseOneApplication).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "missing repository URL",
      { approvalMode: "pi-decides" },
      "Enter a GitHub repository URL.",
    ],
    [
      "non-text repository URL",
      { repositoryUrl: 42, approvalMode: "pi-decides" },
      "Enter a GitHub repository URL.",
    ],
    [
      "oversized repository URL",
      { repositoryUrl: "x".repeat(2_049), approvalMode: "pi-decides" },
      "under 2,048 characters",
    ],
    [
      "unknown field",
      {
        repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
        approvalMode: "pi-decides",
        environment: "staging",
      },
      "Unrecognized key",
    ],
  ])("rejects a %s", async (_label, body, message) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining(message),
    });
    expect(mocks.createPhaseOneApplication).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(rawRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
    expect(mocks.createPhaseOneApplication).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before parsing fields", async () => {
    const response = await POST(
      rawRequest(
        JSON.stringify({
          repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
          approvalMode: "pi-decides",
          padding: "x".repeat(16_384),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Keep the request body under 16,384 characters.",
    });
    expect(mocks.createPhaseOneApplication).not.toHaveBeenCalled();
  });
});
