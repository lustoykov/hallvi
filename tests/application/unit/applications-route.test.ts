import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
}));

vi.mock("../../../src/server/applications", () => ({
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class NotFoundError extends Error {},
  createApplication: mocks.createApplication,
}));
vi.mock("../../../src/server/operator-view", () => ({
  getOperatorView: (id: string) => ({ application: { id } }),
}));

import { POST } from "../../../src/app/api/applications/route";

const requestKey = "00000000-0000-4000-8000-000000000099";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/applications", {
    method: "POST",
    body: JSON.stringify({ requestKey, ...body }),
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
    mocks.createApplication.mockReset();
  });

  it("passes the repository and request key to the domain", async () => {
    mocks.createApplication.mockResolvedValue({
      created: true,
      application: { id: "app" },
    });

    const response = await POST(
      request({
        repositoryUrl: "git@github.com:lustoykov/todo-fastapi.git",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createApplication).toHaveBeenCalledWith({
      requestKey,
      repositoryUrl: "git@github.com:lustoykov/todo-fastapi.git",
    });
  });

  it("rejects a retired approval mode instead of storing it", async () => {
    const response = await POST(
      request({
        repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
        approvalMode: "always-ask",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("Unrecognized key"),
    });
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it.each([
    ["missing repository URL", {}, "Enter a GitHub repository URL."],
    [
      "non-text repository URL",
      { repositoryUrl: 42 },
      "Enter a GitHub repository URL.",
    ],
    [
      "oversized repository URL",
      { repositoryUrl: "x".repeat(2_049) },
      "under 2,048 characters",
    ],
    [
      "unknown field",
      {
        repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
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
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(rawRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before parsing fields", async () => {
    const response = await POST(
      rawRequest(
        JSON.stringify({
          repositoryUrl: "https://github.com/lustoykov/todo-fastapi",
          padding: "x".repeat(16_384),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Keep the request body under 16,384 characters.",
    });
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });
});
