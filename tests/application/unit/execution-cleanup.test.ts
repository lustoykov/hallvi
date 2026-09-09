import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerClient } from "../../../src/server/docker";
import { dockerConformanceExecutor } from "../../../src/server/conformance-executor";
import { readyEnvironment } from "../../fixtures/fake-executor";

afterEach(() => vi.restoreAllMocks());

describe("execution resource cleanup", () => {
  it("keeps resources belonging to other active runs when cleaning selected interrupted runs", async () => {
    const executor = dockerConformanceExecutor();
    vi.spyOn(executor, "environment").mockResolvedValue(readyEnvironment());
    const label = (run: string) => ({ "server-guy.run": run });
    vi.spyOn(DockerClient.prototype, "listContainers").mockResolvedValue([
      { Id: "old-container", Names: [], Labels: label("old") },
      { Id: "active-container", Names: [], Labels: label("active") },
    ]);
    vi.spyOn(DockerClient.prototype, "listNetworks").mockResolvedValue([
      { Id: "old-net", Name: "old-net", Labels: label("old") },
      { Id: "active-net", Name: "active-net", Labels: label("active") },
    ]);
    vi.spyOn(DockerClient.prototype, "listVolumes").mockResolvedValue([
      { Name: "old-volume", Labels: label("old") },
      { Name: "active-volume", Labels: label("active") },
    ]);
    vi.spyOn(DockerClient.prototype, "listImages").mockResolvedValue([
      {
        Id: "old-image",
        Labels: label("old"),
        RepoTags: [`server-guy-build:${"a".repeat(24)}`, "user/kept:tag"],
      },
      {
        Id: "active-image",
        Labels: label("active"),
        RepoTags: [`server-guy-build:${"b".repeat(24)}`],
      },
    ]);
    const containers = vi
      .spyOn(DockerClient.prototype, "removeContainer")
      .mockResolvedValue(undefined);
    const networks = vi
      .spyOn(DockerClient.prototype, "removeNetwork")
      .mockResolvedValue(undefined);
    const volumes = vi
      .spyOn(DockerClient.prototype, "removeVolume")
      .mockResolvedValue(undefined);
    const images = vi
      .spyOn(DockerClient.prototype, "request")
      .mockResolvedValue({
        status: 200,
        headers: {},
        body: Buffer.alloc(0),
        truncated: false,
      });
    expect(await executor.cleanupLeftovers(["old"])).toBe(4);
    expect(containers.mock.calls).toEqual([["old-container"]]);
    expect(networks.mock.calls).toEqual([["old-net"]]);
    expect(volumes.mock.calls).toEqual([["old-volume"]]);
    expect(images.mock.calls).toEqual([
      [
        `/images/server-guy-build%3A${"a".repeat(24)}?noprune=true`,
        { method: "DELETE" },
      ],
    ]);
  });
});
