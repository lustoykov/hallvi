// Processes, read from records.
//
// Every case here is a way the page could quietly say more than the records
// support: counting a shape on the map as a running process, ageing a pass
// into a failure, or letting a one-image release claim to be every process's
// image.

import { describe, expect, it } from "vitest";

import type { SavedInformation } from "@/server/operator-data";
import { processesFromRecords } from "@/components/haldur/processes-records";

const APP = "app-1";
const now = Date.parse("2026-09-13T12:00:00.000Z");

let counter = 0;
function record(input: {
  at?: string | null;
  states?: SavedInformation["presentation"] extends infer P
    ? P extends { states?: infer S }
      ? S
      : never
    : never;
  [key: string]: unknown;
}): SavedInformation {
  const { at, ...presentation } = input;
  return {
    id: `r${++counter}`,
    applicationId: APP,
    title: "A record",
    body: "",
    evidence: [],
    establishedAt: at === undefined ? "2026-09-13T11:55:00.000Z" : at,
    createdAt: "2026-09-13T11:55:00.000Z",
    updatedAt: "2026-09-13T11:55:00.000Z",
    retiredAt: null,
    presentation: {
      views: ["processes"],
      role: "status",
      status: "verified",
      checks: [],
      ...presentation,
    },
  } as SavedInformation;
}

const topology = (parts: { id: string; kind: string; name: string }[]) =>
  record({
    states: { ref: { kind: "application", id: APP }, presence: "present" },
    content: {
      kind: "topology",
      from: "observed",
      parts: parts.map((part) => ({
        ...part,
        role: "a part",
        plain: "a part",
      })),
      edges: [],
    },
  });

const process = (id: string, extra: object = {}) =>
  record({
    states: { ref: { kind: "process", id }, presence: "present" },
    ...extra,
  });

describe("processesFromRecords", () => {
  it("says nobody looked when no record names a process", () => {
    const story = processesFromRecords({
      records: [],
      applicationId: APP,
      now,
    });
    expect(story.state).toBe("none");
    expect(story.processes).toEqual([]);
  });

  it("does not count a shape on the map as a running process", () => {
    // The map is composition. Only a record can say a process exists.
    const story = processesFromRecords({
      records: [topology([{ id: "web", kind: "web", name: "Web" }])],
      applicationId: APP,
      now,
    });
    expect(story.state).toBe("none");
  });

  it("takes the role from the map and the reach from the port", () => {
    const story = processesFromRecords({
      records: [
        topology([
          { id: "app", kind: "web", name: "Web" },
          { id: "db", kind: "private", name: "Database" },
        ]),
        process("app", {
          facts: [
            {
              key: "port",
              label: "Port",
              value: "3000",
              claim: "configuration",
              basis: "observed",
            },
          ],
        }),
        process("db", {
          facts: [
            {
              key: "port",
              label: "Port",
              value: "5432",
              claim: "configuration",
              basis: "observed",
            },
          ],
        }),
        record({
          states: {
            ref: { kind: "application", id: APP },
            presence: "present",
          },
          url: "http://127.0.0.1:8080",
          content: {
            kind: "application-access",
            mode: "private",
            server: "host-1",
            localPort: 8080,
            remotePort: 3000,
          },
        }),
      ],
      applicationId: APP,
      now,
    });
    const [app, db] = story.processes;
    expect(app.role).toBe("web");
    expect(app.reach).toBe("Port 80 → 3000 · from your network only");
    expect(db.role).toBe("private");
    expect(db.reach).toBe("Port 5432 · inside the server only");
    expect(story.restricted).toBe(true);
  });

  it("gives each process the image the release says it runs", () => {
    const story = processesFromRecords({
      records: [
        topology([
          { id: "grafana", kind: "web", name: "Grafana" },
          { id: "prometheus", kind: "private", name: "Prometheus" },
        ]),
        process("grafana"),
        process("prometheus"),
        record({
          about: [{ kind: "application", id: APP }],
          content: {
            kind: "deployment",
            repositoryUrl: "https://github.com/o/r",
            revision: "abc1234",
            server: "host-1",
            changes: [],
            services: [
              { process: "grafana", image: "grafana/grafana:11.2.0" },
              { process: "prometheus", image: "prom/prometheus:v2.54.1" },
            ],
          },
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.processes.map((item) => item.image)).toEqual([
      "grafana/grafana:11.2.0",
      "prom/prometheus:v2.54.1",
    ]);
    expect(story.processes.map((item) => item.product)).toEqual([
      "Grafana",
      "Prometheus",
    ]);
  });

  it("does not hand a one-image release to a private process", () => {
    const story = processesFromRecords({
      records: [
        topology([
          { id: "app", kind: "web", name: "App" },
          { id: "cache", kind: "private", name: "Cache" },
        ]),
        process("app"),
        process("cache"),
        record({
          about: [{ kind: "application", id: APP }],
          content: {
            kind: "deployment",
            repositoryUrl: "https://github.com/o/r",
            revision: "abc1234",
            server: "host-1",
            changes: [],
            image: "docker/getting-started:latest",
          },
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.processes[0].image).toBe("docker/getting-started:latest");
    expect(story.processes[1].image).toBe("Not recorded");
  });

  // How a stale reading and a failed one read, on this same projection, is
  // proved against the clock in unit/state-matrix.test.ts.
  it("draws a process with no checks rather than hiding it", () => {
    const story = processesFromRecords({
      records: [
        topology([{ id: "app", kind: "web", name: "App" }]),
        process("app"),
      ],
      applicationId: APP,
      now,
    });
    expect(story.processes).toHaveLength(1);
    expect(story.processes[0].probes).toEqual([]);
    expect(story.processes[0].lastPassed).toBeNull();
  });
});

describe("the port, as Pi actually writes it", () => {
  const withPort = (value: string) =>
    processesFromRecords({
      records: [
        topology([{ id: "app", kind: "web", name: "App" }]),
        process("app", {
          facts: [
            {
              key: "port",
              label: "Published port",
              value,
              claim: "configuration",
              basis: "observed",
            },
          ],
        }),
      ],
      applicationId: APP,
      now,
    }).processes[0];

  it("keeps Pi's own mapping, which is more exact than anything derived", () => {
    // Reading this as a bare number threw it away and the page said "its
    // port" while the record said exactly which.
    expect(withPort("127.0.0.1:3000 → 3000/tcp").reach).toBe(
      "127.0.0.1:3000 → 3000/tcp · open to anyone",
    );
    expect(withPort("127.0.0.1:3000 → 3000/tcp").port).toBe(3000);
  });

  it("reads a bare port and a docker-style one alike", () => {
    expect(withPort("3000").port).toBe(3000);
    expect(withPort("3000/tcp").port).toBe(3000);
    expect(withPort("3000").reach).toBe("Port 80 → 3000 · open to anyone");
  });

  it("takes the address filter from the door, not from the access mode", () => {
    const story = processesFromRecords({
      records: [
        topology([{ id: "app", kind: "web", name: "App" }]),
        process("app"),
        record({
          states: {
            ref: { kind: "door", id: "app-port" },
            presence: "present",
          },
          facts: [
            {
              key: "sources",
              label: "Listener sources",
              value: "127.0.0.1 only",
              claim: "configuration",
              basis: "observed",
            },
          ],
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.from).toBe("127.0.0.1 only");
  });

  it("leaves the filter unknown when no door recorded one", () => {
    const story = processesFromRecords({
      records: [
        topology([{ id: "app", kind: "web", name: "App" }]),
        process("app"),
      ],
      applicationId: APP,
      now,
    });
    expect(story.from).toBeNull();
  });
});

describe("a process a check named but nothing spoke for", () => {
  // A deployment is an event: it legitimately says "the http check passed,
  // about process:web" and states nothing. Reading only stated subjects made
  // the page empty for an application whose every check named a process.
  const mentioned = () =>
    processesFromRecords({
      records: [
        topology([{ id: "web", kind: "web", name: "Web" }]),
        record({
          about: [{ kind: "application", id: APP }],
          checks: [
            {
              key: "http",
              label: "It answered",
              status: "passed",
              claim: "liveness",
              basis: "observed",
              about: { kind: "process", id: "web" },
            },
          ],
          content: {
            kind: "deployment",
            repositoryUrl: "https://github.com/o/r",
            revision: "abc1234",
            server: "host-1",
            changes: [],
            image: "app:1",
          },
        }),
      ],
      applicationId: APP,
      now,
    });

  it("draws it, with the check that named it", () => {
    const story = mentioned();
    expect(story.processes).toHaveLength(1);
    expect(story.processes[0].name).toBe("web");
    expect(story.processes[0].probes[0].name).toBe("It answered");
  });

  it("does not promote the mention into a statement of presence", () => {
    // Nothing said the process is there. The page draws what was checked and
    // stops short of claiming it is running.
    expect(mentioned().state).toBe("planned");
  });
});

describe("two processes from the same image", () => {
  it("does not give them both the same name", () => {
    // Shop's web and worker run one built image, so both derived "Shop":
    // two rows with one label, and a reader with no way to tell which is
    // which. A name that does not distinguish is not a name.
    const story = processesFromRecords({
      records: [
        topology([
          { id: "shop-web", kind: "web", name: "shop-web" },
          { id: "shop-worker", kind: "private", name: "shop-worker" },
        ]),
        process("shop-web"),
        process("shop-worker"),
        record({
          about: [{ kind: "application", id: APP }],
          content: {
            kind: "deployment",
            repositoryUrl: "https://github.com/o/r",
            revision: "abc1234",
            server: "host-1",
            changes: [],
            services: [
              { process: "shop-web", image: "haldur/shop:1" },
              { process: "shop-worker", image: "haldur/shop:1" },
            ],
          },
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.processes.map((item) => item.product)).toEqual([
      "shop-web",
      "shop-worker",
    ]);
  });

  it("keeps a shared name when Pi wrote distinct ones", () => {
    const story = processesFromRecords({
      records: [
        topology([
          { id: "a", kind: "web", name: "a" },
          { id: "b", kind: "private", name: "b" },
        ]),
        process("a", {
          facts: [
            {
              key: "product",
              label: "Product",
              value: "Grafana",
              claim: "identity",
              basis: "reported",
            },
          ],
        }),
        process("b", {
          facts: [
            {
              key: "product",
              label: "Product",
              value: "Prometheus",
              claim: "identity",
              basis: "reported",
            },
          ],
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.processes.map((item) => item.product)).toEqual([
      "Grafana",
      "Prometheus",
    ]);
  });
});

describe("a process whose only check failed", () => {
  const check = (key: string, status: "passed" | "failed", claim: string) => ({
    key,
    label: key,
    status,
    claim,
    basis: "observed",
  });

  // That it reads failed, and keeps reading failed however old the check is,
  // is proved in unit/state-matrix.test.ts.
  it("is still running when something else about it passed", () => {
    const story = processesFromRecords({
      records: [
        topology([{ id: "app", kind: "web", name: "App" }]),
        process("app", {
          checks: [
            check("http", "passed", "liveness"),
            check("dependency-audit", "failed", "configuration"),
          ],
        }),
      ],
      applicationId: APP,
      now,
    });
    expect(story.state).toBe("running");
    expect(story.tone).toBe("failed");
  });
});
