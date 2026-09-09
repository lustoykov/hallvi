import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildApplicationImage,
  removeBuiltImage,
} from "../../../src/server/application-image";
import {
  DockerClient,
  discoverExecutionEnvironment,
} from "../../../src/server/docker";

describe.skipIf(process.env.SERVER_GUY_DOCKER_TESTS !== "1")(
  "application image builds in real Docker",
  () => {
    it("uses the selected Dockerfile, context and stage and preserves image startup metadata", async () => {
      const environment = await discoverExecutionEnvironment();
      expect(environment.ready, environment.summary).toBe(true);
      const client = new DockerClient(
        environment.endpoint!.slice("unix://".length),
      );
      const labels = { "server-guy.test": `application-image-${randomUUID()}` };
      const image = await buildApplicationImage(
        client,
        [
          {
            path: "deploy/Dockerfile",
            mode: 0o644,
            content: Buffer.from(
              `FROM alpine:3.20 AS base\nRUN mkdir /application && test ! -S /var/run/docker.sock\nCOPY payload.txt /application/proof\nWORKDIR /application\nUSER 1000:1000\nENTRYPOINT ["cat"]\nCMD ["proof"]\nFROM base AS production\nENV TARGET=production\nFROM base AS development\nCMD ["wrong-stage"]\n`,
            ),
          },
          {
            path: "services/api/payload.txt",
            mode: 0o644,
            content: Buffer.from("actual-image\n"),
          },
        ],
        {
          dockerfile: "deploy/Dockerfile",
          context: "services/api",
          target: "production",
        },
        { labels },
      );
      let container: string | undefined;
      try {
        const metadata = await client.inspectImage(image.imageId);
        expect(metadata.Config).toMatchObject({
          Labels: labels,
          WorkingDir: "/application",
          User: "1000:1000",
          Entrypoint: ["cat"],
          Cmd: ["proof"],
        });
        const created = await client.createContainer(
          `sg-image-test-${randomUUID()}`,
          {
            Image: image.imageId,
            Labels: labels,
            HostConfig: {
              NetworkMode: "none",
              CapDrop: ["ALL"],
              SecurityOpt: ["no-new-privileges:true"],
              ReadonlyRootfs: true,
              Memory: 64 * 1024 * 1024,
              PidsLimit: 16,
            },
          },
        );
        container = created.Id;
        await client.startContainer(container);
        expect(
          (await client.waitContainer(container, { timeoutMs: 10_000 }))
            .exitCode,
        ).toBe(0);
        expect((await client.containerLogs(container, 1024)).stdout).toBe(
          "actual-image\n",
        );
      } finally {
        if (container) await client.removeContainer(container);
        await removeBuiltImage(client, image.reference);
      }
      expect(await client.listContainers(labels)).toEqual([]);
      expect(await client.listNetworks(labels)).toEqual([]);
    }, 120_000);

    it("cancels a build without retaining its containers or network", async () => {
      const environment = await discoverExecutionEnvironment();
      expect(environment.ready).toBe(true);
      const client = new DockerClient(
        environment.endpoint!.slice("unix://".length),
      );
      const labels = { "server-guy.test": `application-image-${randomUUID()}` };
      const controller = new AbortController();
      await expect(
        buildApplicationImage(
          client,
          [
            {
              path: "Dockerfile",
              mode: 0o644,
              content: Buffer.from("FROM alpine:3.20\nRUN sleep 120\n"),
            },
          ],
          { dockerfile: "Dockerfile" },
          {
            labels,
            signal: controller.signal,
            onProgress: (message) => {
              if (message.startsWith("Building ")) controller.abort();
            },
          },
        ),
      ).rejects.toThrow();
      expect(await client.listContainers(labels)).toEqual([]);
      expect(await client.listNetworks(labels)).toEqual([]);
      expect(await client.listImages(labels)).toEqual([]);
    }, 120_000);

    it("a failing Dockerfile is a failed build, with no leaked containers or networks", async () => {
      const environment = await discoverExecutionEnvironment();
      expect(environment.ready).toBe(true);
      const client = new DockerClient(
        environment.endpoint!.slice("unix://".length),
      );
      const labels = { "server-guy.test": `application-image-${randomUUID()}` };
      await expect(
        buildApplicationImage(
          client,
          [
            {
              path: "Dockerfile",
              mode: 0o644,
              content: Buffer.from("FROM alpine:3.20\nRUN exit 37\n"),
            },
          ],
          { dockerfile: "Dockerfile" },
          { labels },
        ),
      ).rejects.toThrow(/build exited/);
      expect(await client.listContainers(labels)).toEqual([]);
      expect(await client.listNetworks(labels)).toEqual([]);
    }, 120_000);
  },
);
