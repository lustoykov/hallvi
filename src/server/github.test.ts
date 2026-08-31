import { describe, expect, it } from "vitest";

import { parseGithubRepository } from "./github";

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

  it("rejects a non-GitHub repository", () => {
    expect(() => parseGithubRepository("https://gitlab.com/example/app")).toThrow(
      "currently accepts GitHub repositories only",
    );
  });
});
