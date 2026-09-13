// A release with more than one image, and the older records that named one.
//
// The bug this closes was not cosmetic: a Grafana-and-Prometheus release
// could only record one image, so Prometheus's digest was stored against a
// Grafana deployment. Both shapes have to read, and the older one has to
// keep answering exactly what it always answered.

import { describe, expect, it } from "vitest";

import { informationInputSchema } from "@/server/operator-data";
import { reviewRecord } from "@/server/record-contract";
import { releasedServices, type Deployment } from "@/server/record-projection";

const base = {
  repositoryUrl: "https://github.com/owner/repo",
  revision: "a1b2c3d4e5f6",
  server: "hetzner-165619823",
  changes: [] as string[],
};

const deployment = (extra: object) =>
  ({ kind: "deployment", ...base, ...extra }) as Deployment;

describe("releasedServices", () => {
  it("reads a record written before services existed", () => {
    expect(
      releasedServices(deployment({ image: "docker/getting-started:latest" })),
    ).toEqual([
      { process: null, image: "docker/getting-started:latest", digest: null },
    ]);
  });

  it("keeps a digest pinned inside the reference", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(
      releasedServices(deployment({ image: `grafana/grafana@${digest}` })),
    ).toEqual([{ process: null, image: `grafana/grafana@${digest}`, digest }]);
  });

  it("names each service of a two-image release", () => {
    const digest = `sha256:${"b".repeat(64)}`;
    expect(
      releasedServices(
        deployment({
          services: [
            { process: "grafana", image: "grafana/grafana:11.2.0", digest },
            { process: "prometheus", image: "prom/prometheus:v2.54.1" },
          ],
        }),
      ),
    ).toEqual([
      { process: "grafana", image: "grafana/grafana:11.2.0", digest },
      { process: "prometheus", image: "prom/prometheus:v2.54.1", digest: null },
    ]);
  });

  it("prefers services when a record carries both", () => {
    const read = releasedServices(
      deployment({
        image: "grafana/grafana:11.2.0",
        services: [{ process: "web", image: "prom/prometheus:v2.54.1" }],
      }),
    );
    expect(read).toHaveLength(1);
    expect(read[0].process).toBe("web");
  });
});

describe("the contract on a release", () => {
  const record = (content: object) =>
    reviewRecord(
      informationInputSchema.parse({
        title: "Released",
        body: "",
        establishedAt: "2026-09-13T07:00:00.000Z",
        presentation: {
          about: [{ kind: "application", id: "app-1" }],
          views: ["deployment"],
          role: "outcome",
          status: "verified",
          checks: [],
          content: { kind: "deployment", ...base, ...content },
        },
      }),
    );

  it("refuses a release that says nothing about what it deployed", () => {
    const found = record({});
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("has to say what it deployed");
    expect(found[0]).toContain("services");
  });

  it("accepts either shape", () => {
    expect(record({ image: "nginx:1.27" })).toEqual([]);
    expect(
      record({ services: [{ process: "web", image: "nginx:1.27" }] }),
    ).toEqual([]);
  });
});
