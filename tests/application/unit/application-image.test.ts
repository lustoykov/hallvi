import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { pack } from "tar-stream";
import { describe, expect, it, vi } from "vitest";
import {
  buildApplicationImage,
  loadBuiltImage,
  removeBuiltImage,
} from "../../../src/server/application-image";
import { DockerClient } from "../../../src/server/docker";

function archive(kind: "file" | "symlink" = "file", name = "image.tar") {
  const tar = pack();
  if (kind === "file") tar.entry({ name }, "image bytes");
  else tar.entry({ name, type: "symlink", linkname: "/etc/passwd" });
  tar.finalize();
  return Readable.from(tar) as IncomingMessage;
}

function clientWithArchive(source: IncomingMessage) {
  const client = new DockerClient("/unused-test-socket");
  vi.spyOn(client, "archiveStream").mockResolvedValue(source);
  return client;
}

describe("built image transfer", () => {
  it("unwraps the outer archive and streams only the image to Docker", async () => {
    const client = clientWithArchive(archive());
    let uploaded = "";
    vi.spyOn(client, "request").mockImplementation(async (path, options) => {
      expect(path).toBe("/images/load?quiet=true");
      expect(options?.body).toBeInstanceOf(Readable);
      for await (const chunk of options!.body as Readable)
        uploaded += chunk.toString();
      return {
        status: 200,
        headers: {},
        body: Buffer.from('{"stream":"Loaded image"}\n'),
        truncated: false,
      };
    });
    await loadBuiltImage(client, "builder");
    expect(uploaded).toBe("image bytes");
  });

  it.each(["symlink", "wrong-name"])(
    "refuses unexpected archive content: %s",
    async (kind) => {
      const source =
        kind === "symlink" ? archive("symlink") : archive("file", "other.tar");
      const client = clientWithArchive(source);
      const upload = vi.spyOn(client, "request");
      await expect(loadBuiltImage(client, "builder")).rejects.toThrow(
        /one bounded image/,
      );
      expect(upload).not.toHaveBeenCalled();
      expect(source.destroyed).toBe(true);
    },
  );

  it("does not treat Docker's HTTP 200 error stream as a successful import", async () => {
    const client = clientWithArchive(archive());
    vi.spyOn(client, "request").mockImplementation(async (_path, options) => {
      for await (const chunk of options!.body as Readable) void chunk;
      return {
        status: 200,
        headers: {},
        body: Buffer.from('{"error":"invalid image"}\n'),
        truncated: false,
      };
    });
    await expect(loadBuiltImage(client, "builder")).rejects.toThrow(
      "invalid image",
    );
  });

  it("refuses build paths outside the repository before contacting Docker", async () => {
    const client = new DockerClient("/unused-test-socket");
    const inspect = vi.spyOn(client, "inspectImage");
    await expect(
      buildApplicationImage(
        client,
        [],
        { dockerfile: "../Dockerfile" },
        { labels: {} },
      ),
    ).rejects.toThrow(/Unsafe path/);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("never removes a caller-supplied unrelated image", async () => {
    const client = new DockerClient("/unused-test-socket");
    const remove = vi.spyOn(client, "request");
    await expect(
      removeBuiltImage(client, "user/application:production"),
    ).rejects.toThrow(/Not an owned/);
    expect(remove).not.toHaveBeenCalled();
  });
});
