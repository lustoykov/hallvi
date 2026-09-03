import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPhaseOneApplication: vi.fn(),
}));

vi.mock("../src/server/phase-one", () => ({
  ExistingApplicationConflictError: class ExistingApplicationConflictError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  createPhaseOneApplication: mocks.createPhaseOneApplication,
}));

import { POST } from "../src/app/api/applications/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    body: JSON.stringify(body),
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
  ])("rejects a %s permission policy instead of silently defaulting it", async (_label, approvalMode) => {
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
  });
});
