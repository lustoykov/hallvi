import { describe, expect, it } from "vitest";

import { classifyGithubFailure, parseGithubRepository } from "../src/server/github";

describe("parseGithubRepository", () => {
  it("normalizes an HTTPS GitHub URL", () => {
    expect(parseGithubRepository("https://github.com/lustoykov/todo-fastapi.git")).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("normalizes an SSH GitHub URL", () => {
    expect(parseGithubRepository("git@github.com:lustoykov/todo-fastapi.git")).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("canonicalizes case, a trailing slash, and URL metadata", () => {
    expect(
      parseGithubRepository("https://github.com/LusToykov/Todo-FastAPI.git/?tab=readme"),
    ).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("rejects a non-GitHub repository", () => {
    expect(() => parseGithubRepository("https://gitlab.com/example/app")).toThrow(
      "currently accepts GitHub repositories only",
    );
  });

  it("rejects paths that do not identify exactly one repository", () => {
    expect(() => parseGithubRepository("https://github.com/example/app/issues/1")).toThrow(
      "only an owner and repository name",
    );
  });
});

describe("classifyGithubFailure", () => {
  it("marks missing or unauthenticated GitHub tooling as unavailable", () => {
    expect(classifyGithubFailure({ code: "ENOENT", message: "spawn gh ENOENT" })).toEqual({
      status: "unavailable",
      reason: "spawn gh ENOENT",
    });
    expect(classifyGithubFailure({ stderr: "gh: not logged into any GitHub hosts" })).toEqual({
      status: "unavailable",
      reason: "gh: not logged into any GitHub hosts",
    });
  });

  it("marks a killed gh process as unavailable rather than a failed repository check", () => {
    expect(
      classifyGithubFailure({
        killed: true,
        signal: "SIGTERM",
        code: null,
        message: "Command failed: gh api repos/lustoykov/todo-fastapi\n",
      }),
    ).toEqual({ status: "unavailable", reason: "gh did not respond in time." });
  });

  it("preserves provider errors that mean the repository check failed", () => {
    expect(classifyGithubFailure({ stderr: "gh: Not Found (HTTP 404)" })).toEqual({
      status: "failed",
      reason: "gh: Not Found (HTTP 404)",
    });
  });
});
