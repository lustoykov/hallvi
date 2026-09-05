import { describe, expect, it } from "vitest";

import {
  classifyGithubFailure,
  parseGithubRepository,
} from "../../../src/server/github";
import { GithubAccessError } from "../../../src/server/github-api";

describe("parseGithubRepository", () => {
  it("normalizes an HTTPS GitHub URL", () => {
    expect(
      parseGithubRepository("https://github.com/lustoykov/todo-fastapi.git"),
    ).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("normalizes an SSH GitHub URL", () => {
    expect(
      parseGithubRepository("git@github.com:lustoykov/todo-fastapi.git"),
    ).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("normalizes a scheme-less GitHub URL", () => {
    expect(parseGithubRepository("github.com/lustoykov/todo-fastapi")).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("canonicalizes case, a trailing slash, and URL metadata", () => {
    expect(
      parseGithubRepository(
        "https://github.com/LusToykov/Todo-FastAPI.git/?tab=readme",
      ),
    ).toEqual({
      owner: "lustoykov",
      name: "todo-fastapi",
      canonicalUrl: "https://github.com/lustoykov/todo-fastapi",
    });
  });

  it("rejects a non-GitHub repository", () => {
    expect(() =>
      parseGithubRepository("https://gitlab.com/example/app"),
    ).toThrow("currently accepts GitHub repositories only");
  });

  it("rejects unsupported URL protocols", () => {
    expect(() => parseGithubRepository("ftp://github.com/example/app")).toThrow(
      "GitHub HTTPS or SSH repository URL",
    );
  });

  it("rejects paths that do not identify exactly one repository", () => {
    expect(() =>
      parseGithubRepository("https://github.com/example/app/issues/1"),
    ).toThrow("only an owner and repository name");
  });
});

describe("classifyGithubFailure", () => {
  it("marks authentication failures as unavailable", () => {
    expect(
      classifyGithubFailure(new GithubAccessError("Reconnect", "auth")),
    ).toEqual({ status: "unavailable", reason: "Reconnect" });
  });

  it("does not expose raw provider/CLI errors or credentials", () => {
    expect(
      classifyGithubFailure({
        stderr: "ghp_private-token",
        message: "Authorization: secret",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "GitHub returned an unreadable response. Try the check again.",
    });
  });

  it("preserves provider errors that mean the repository check failed", () => {
    expect(
      classifyGithubFailure(
        new GithubAccessError("Repository access denied", "access"),
      ),
    ).toEqual({
      status: "failed",
      reason: "Repository access denied",
    });
  });
});
