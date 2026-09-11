import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ githubJson: vi.fn() }));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  githubJson: mocks.githubJson,
}));

import {
  fetchRepositoryFile,
  fetchRepositoryTree,
  INSPECTION_LIMITS,
  normalizeRepositoryPath,
  RepositoryPathError,
} from "../../../src/server/github-inspection";
import { deploymentSourceFiles } from "../../../src/server/deployment-source-files";
import {
  deniedPathReason,
  looksLikeSecret,
  redactSecrets,
} from "../../../src/server/secrets";
import { treeResponse } from "../../fixtures/github-responses";

const SHA = "a".repeat(40);
const file = (content: string | Buffer, size?: number) => ({
  type: "file",
  encoding: "base64",
  content: Buffer.from(content).toString("base64"),
  sha: "blob",
  size: size ?? Buffer.byteLength(content),
  path: "x",
});

beforeEach(() => {
  mocks.githubJson.mockReset();
});

describe("repository paths and secrets", () => {
  it.each(["../etc/passwd", "app/../../x", "/abs//x", "a\\b", "", "a/./b"])(
    "rejects %s",
    (path) => {
      expect(() => normalizeRepositoryPath(path)).toThrow(RepositoryPathError);
    },
  );
  it("normalizes a leading ./ or /", () => {
    expect(normalizeRepositoryPath("./app/main.py")).toBe("app/main.py");
    expect(normalizeRepositoryPath("/README.md")).toBe("README.md");
  });
  it.each([
    ".env",
    ".env.production",
    "deploy/server.key",
    "certs/cert.pem",
    "id_rsa",
    ".netrc",
    "config/secrets.yaml",
    "app/credentials.json",
    ".npmrc",
  ])("denies %s", (path) => {
    expect(deniedPathReason(path)).not.toBeNull();
  });
  it.each([
    ".env.example",
    ".env.sample",
    "app/config.py",
    "README.md",
    "secret_santa.md",
  ])("allows %s", (path) => {
    expect(deniedPathReason(path)).toBeNull();
  });
  it("redacts credential-shaped values and counts them", () => {
    const text =
      "SECRET_KEY=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab\nAWS=AKIAABCDEFGHIJKLMNOP\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\nplain=value";
    const redacted = redactSecrets(text);
    expect(redacted.count).toBe(3);
    expect(redacted.text).not.toContain("ghp_");
    expect(redacted.text).not.toContain("AKIA");
    expect(redacted.text).not.toContain("BEGIN PRIVATE");
    expect(redacted.text).toContain("plain=value");
    expect(looksLikeSecret("sk-abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(looksLikeSecret("DATABASE_URL")).toBe(false);
  });
});

describe("bounded tree and file reads", () => {
  it("fetches the recursive tree at the exact commit and keeps blobs and trees", async () => {
    mocks.githubJson.mockResolvedValueOnce({
      data: treeResponse("qa/fastapi-app", SHA),
      scopes: [],
    });
    const tree = await fetchRepositoryTree("qa/fastapi-app", SHA, "token");
    expect(mocks.githubJson).toHaveBeenCalledWith(
      `/repos/qa/fastapi-app/git/trees/${SHA}?recursive=1`,
      "token",
      { signal: undefined },
    );
    expect(tree.truncated).toBe(false);
    expect(tree.entries.find((e) => e.path === "app")).toEqual({
      path: "app",
      type: "tree",
      sha: expect.any(String),
    });
    expect(tree.entries.find((e) => e.path === "app/main.py")).toMatchObject({
      type: "blob",
      size: expect.any(Number),
    });
  });

  it("truncates oversized inspection trees, lists them whole for deployment planning and honors GitHub's own truncation flag", async () => {
    const signal = new AbortController().signal;
    const big = {
      sha: SHA,
      truncated: false,
      tree: Array.from(
        { length: INSPECTION_LIMITS.treeEntries + 1 },
        (_, i) => ({
          path: `f${i}.txt`,
          type: "blob",
          size: 1,
          sha: "s",
        }),
      ),
    };
    mocks.githubJson.mockResolvedValue({ data: big, scopes: [] });
    const tree = await fetchRepositoryTree("qa/big", SHA, "token");
    expect(tree.entries).toHaveLength(INSPECTION_LIMITS.treeEntries);
    expect(tree.truncated).toBe(true);
    const source = await deploymentSourceFiles("qa/big", SHA, "token", signal);
    expect(source.paths).toHaveLength(INSPECTION_LIMITS.treeEntries + 1);
    mocks.githubJson.mockResolvedValue({
      data: { sha: SHA, truncated: true, tree: [] },
      scopes: [],
    });
    expect((await fetchRepositoryTree("qa/big", SHA, "token")).truncated).toBe(
      true,
    );
    await expect(
      deploymentSourceFiles("qa/big", SHA, "token", signal),
    ).rejects.toThrow("incomplete");
  });

  it("decodes, bounds and redacts a file pinned to the commit", async () => {
    const config =
      'SECRET_KEY = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab"\nDEBUG = False\n';
    const content = {
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(config),
      name: "config.py",
      path: "app/config.py",
      sha: "c".repeat(40),
      content: Buffer.from(config).toString("base64"),
      url: `https://api.github.com/repos/qa/fastapi-secret/contents/app/config.py?ref=${SHA}`,
    };
    mocks.githubJson.mockResolvedValueOnce({ data: content, scopes: [] });
    const read = await fetchRepositoryFile(
      "qa/fastapi-secret",
      SHA,
      "app/config.py",
      "token",
    );
    expect(mocks.githubJson).toHaveBeenCalledWith(
      `/repos/qa/fastapi-secret/contents/app/config.py?ref=${SHA}`,
      "token",
      { signal: undefined },
    );
    expect(read).toMatchObject({
      path: "app/config.py",
      binary: false,
      truncated: false,
      redactedCount: 1,
    });
    expect(read.content).toContain("[REDACTED]");
    expect(read.content).not.toContain("ghp_");
  });

  it("never fetches a denied path and refuses oversized files before the network", async () => {
    await expect(
      fetchRepositoryFile("qa/x", SHA, ".env", "token"),
    ).rejects.toThrow("not read");
    await expect(
      fetchRepositoryFile("qa/x", SHA, "big.bin", "token", {
        size: INSPECTION_LIMITS.largestReadableBytes + 1,
      }),
    ).rejects.toThrow("not read");
    expect(mocks.githubJson).not.toHaveBeenCalled();
  });

  it("marks binary files, truncates long text and rejects directories or non-inline content", async () => {
    mocks.githubJson.mockResolvedValueOnce({
      data: file(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])),
      scopes: [],
    });
    expect(
      await fetchRepositoryFile("qa/x", SHA, "logo.png", "token"),
    ).toMatchObject({ binary: true, content: "" });
    const long = "x".repeat(INSPECTION_LIMITS.fileBytes + 10);
    mocks.githubJson.mockResolvedValueOnce({ data: file(long), scopes: [] });
    const truncated = await fetchRepositoryFile(
      "qa/x",
      SHA,
      "long.txt",
      "token",
    );
    expect(truncated.truncated).toBe(true);
    expect(truncated.content).toHaveLength(INSPECTION_LIMITS.fileBytes);
    mocks.githubJson.mockResolvedValueOnce({
      data: [{ type: "file", path: "app/a.py" }],
      scopes: [],
    });
    await expect(
      fetchRepositoryFile("qa/x", SHA, "app", "token"),
    ).rejects.toThrow("is a directory");
    mocks.githubJson.mockResolvedValueOnce({
      data: { ...file("x"), encoding: "none", content: "" },
      scopes: [],
    });
    await expect(
      fetchRepositoryFile("qa/x", SHA, "x", "token"),
    ).rejects.toThrow("cannot be read here");
    mocks.githubJson.mockResolvedValueOnce({
      data: { ...file("x"), type: "symlink" },
      scopes: [],
    });
    await expect(
      fetchRepositoryFile("qa/x", SHA, "x", "token"),
    ).rejects.toThrow("not a readable file");
  });

  it("passes the cancellation signal through and surfaces provider failures as errors", async () => {
    const controller = new AbortController();
    mocks.githubJson.mockImplementationOnce(async (_p, _t, options) => {
      expect(options.signal).toBe(controller.signal);
      throw new Error("GitHub is unavailable. Try again later.");
    });
    await expect(
      fetchRepositoryFile("qa/x", SHA, "README.md", "token", {
        signal: controller.signal,
      }),
    ).rejects.toThrow("GitHub is unavailable");
  });

  it("lists only files for deployment planning and reads listed files at the revision", async () => {
    const signal = new AbortController().signal;
    mocks.githubJson.mockResolvedValueOnce({
      data: {
        sha: SHA,
        tree: [
          { path: "Dockerfile", type: "blob", size: 16 },
          { path: "media/scan.pdf", type: "blob", size: 5_000_000 },
          { path: "src", type: "tree" },
        ],
      },
      scopes: [],
    });
    const source = await deploymentSourceFiles("qa/x", SHA, "token", signal);
    expect(source.paths).toEqual(["Dockerfile", "media/scan.pdf"]);
    mocks.githubJson.mockResolvedValueOnce({
      data: file("FROM python:3.12"),
      scopes: [],
    });
    await expect(source.read("Dockerfile")).resolves.toBe("FROM python:3.12");
    expect(mocks.githubJson).toHaveBeenLastCalledWith(
      `/repos/qa/x/contents/Dockerfile?ref=${SHA}`,
      "token",
      { signal },
    );
    // Oversized and unlisted files are refused without another request.
    await expect(source.read("media/scan.pdf")).rejects.toThrow("not read");
    await expect(source.read("src/missing.py")).rejects.toThrow("absent");
    expect(mocks.githubJson).toHaveBeenCalledTimes(2);
  });
});
