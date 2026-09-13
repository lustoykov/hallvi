// The same subject, read by different pages.
//
// Each projection is written on its own, which is the point — no universal
// view-state object — and the risk that buys is two pages describing one
// thing differently. A reader who sees "healthy" on Overview and "not
// answering" on Processes does not conclude that one of them is wrong; they
// conclude the product does not know.
//
// So the contradictions are enumerated here, from one record set.

import { beforeEach, describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/server-guy/architecture-records";
import { databaseFromRecords } from "@/components/server-guy/database-records";
import { monitoringFromRecords } from "@/components/server-guy/monitoring-records";
import { overviewFromRecords } from "@/components/server-guy/overview-records";
import { processesFromRecords } from "@/components/server-guy/processes-records";
import { reachFromRecords } from "@/components/server-guy/reach-records";
import { storageFromRecords } from "@/components/server-guy/storage-records";
import { supplyFromRecords } from "@/components/server-guy/supply-records";
import type { SavedInformation } from "@/server/operator-data";
import {
  APP,
  NOW,
  record,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const fact = (
  key: string,
  value: string,
  claim = "configuration",
  basis = "observed",
) => ({ key, label: key, value, claim, basis });
const check = (
  key: string,
  status: "passed" | "failed" | "info",
  claim = "reachability",
  extra: object = {},
) => ({ key, label: key, status, claim, basis: "observed", ...extra });

/** One application, described once, read by everything. */
function world(): SavedInformation[] {
  return [
    topology(
      [
        { id: "web", kind: "web", name: "Web" },
        { id: "db", kind: "private", name: "Postgres" },
        { id: "data", kind: "volume", name: "Data" },
        { id: "http", kind: "gate", name: "HTTP" },
      ],
      [
        { from: "web", to: "db", network: "private" },
        { from: "db", to: "data", network: "disk" },
        { from: "http", to: "web", network: "public" },
      ],
    ),
    states({ kind: "host", id: "hetzner-1" }, {
      title: "The host is up",
      facts: [fact("region", "Helsinki", "configuration", "reported")],
      checks: [check("ssh", "passed")],
    } as never),
    states({ kind: "process", id: "web" }, {
      title: "The web process answers",
      facts: [fact("port", "3000"), fact("product", "Web")],
      checks: [check("http", "passed", "liveness")],
    } as never),
    states({ kind: "process", id: "db" }, {
      title: "Postgres is running",
      facts: [fact("port", "5432")],
      checks: [check("reachable", "passed", "liveness")],
    } as never),
    states({ kind: "volume", id: "data" }, {
      title: "The data survives",
      facts: [fact("path", "/var/lib/pg"), fact("size", "48 MB", "contents")],
      checks: [check("persistence", "passed", "configuration")],
    } as never),
    states({ kind: "database", id: "db" }, {
      title: "Postgres answers queries",
      facts: [
        fact("engine", "PostgreSQL", "identity", "reported"),
        fact("version", "16", "identity", "reported"),
      ],
      checks: [check("answering", "passed", "liveness")],
    } as never),
    states({ kind: "door", id: "http" }, {
      title: "Port 80 is open",
      facts: [fact("port", "80"), fact("sources", "anywhere")],
      checks: [check("open", "passed")],
    } as never),
    states({ kind: "monitor", id: "uptime" }, {
      title: "An uptime check watches the web process",
      facts: [
        fact("target", "http://127.0.0.1:8080/", "configuration", "reported"),
        fact("interval", "60 s", "configuration", "reported"),
      ],
      checks: [check("answering", "passed", "liveness")],
    } as never),
    states({ kind: "variable", id: "DATABASE_URL" }, {
      title: "The database URL is set",
      facts: [fact("source", "Written by the release"), fact("scope", "web")],
    } as never),
    record({
      about: [{ kind: "application", id: APP }],
      title: "Released",
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/o/r",
        revision: "abc1234",
        server: "hetzner-1",
        changes: [],
        services: [
          { process: "web", image: "example/web:2.1" },
          { process: "db", image: "postgres:16" },
        ],
      },
    } as never),
    record({
      about: [{ kind: "application", id: APP }],
      title: "It is reachable",
      url: "http://127.0.0.1:8080",
      content: {
        kind: "application-access",
        mode: "private",
        server: "hetzner-1",
        localPort: 8080,
        remotePort: 3000,
      },
    } as never),
  ];
}

const of = (records: SavedInformation[]) => ({
  processes: processesFromRecords({ records, applicationId: APP, now: NOW }),
  storage: storageFromRecords({ records, applicationId: APP, now: NOW }),
  database: databaseFromRecords({ records, applicationId: APP, now: NOW }),
  reach: reachFromRecords({
    records,
    applicationId: APP,
    applicationName: "App",
    now: NOW,
  }),
  monitoring: monitoringFromRecords({
    records,
    applicationId: APP,
    applicationName: "App",
    now: NOW,
  }),
  supply: supplyFromRecords({
    records,
    applicationId: APP,
    applicationName: "App",
    secrets: [],
    now: NOW,
  }),
  architecture: architectureFromRecords({
    records,
    applicationId: APP,
    applicationName: "App",
    now: NOW,
  })!,
  overview: overviewFromRecords({
    records,
    executions: [],
    applicationId: APP,
    applicationName: "App",
    headline: "App",
    chats: [],
    now: NOW,
    onOpenConversation: () => {},
  }),
});

describe("Deployment and Processes agree about what each service runs", () => {
  it("gives each process the image the release named for it", () => {
    const { processes } = of(world());
    expect(
      Object.fromEntries(processes.processes.map((p) => [p.name, p.image])),
    ).toEqual({ web: "example/web:2.1", db: "postgres:16" });
  });
});

describe("Architecture and the destinations agree", () => {
  // Architecture draws layout slots, so the web process is "app" and a gate
  // is "gate:http". Volumes and private services keep the reference Pi gave
  // them. Matching is by the topology name, which both sides carry.
  it("draws a part for every subject the pages draw", () => {
    const { architecture, processes, storage } = of(world());
    const names = architecture.parts.map((part) => part.name);
    for (const item of processes.processes)
      expect(names).toContain(item.product);
    for (const item of storage.volumes)
      expect(architecture.parts.map((part) => part.id)).toContain(item.name);
  });

  it("never shows a part healthy that its own page shows failing", () => {
    const records: SavedInformation[] = world().map((item) =>
      item.presentation?.states?.ref.id === "web" &&
      item.presentation.states.ref.kind === "process"
        ? ({
            ...item,
            presentation: {
              ...item.presentation,
              status: "failed" as const,
              checks: [check("http", "failed", "liveness")],
            },
          } as SavedInformation)
        : item,
    );
    const { architecture, processes } = of(records);
    expect(processes.tone).toBe("failed");
    const part = architecture.parts.find((item) => item.id === "app");
    expect(part?.evidence.certainty).toBe("failed");
  });

  it("gives every drawn part its own slot", () => {
    // Slots are fixed positions in the design and parts are Pi's. Two of a
    // kind landing in one slot would put one part on top of another, and
    // React would report the duplicate key rather than the hidden part.
    const records = [
      topology([
        { id: "web-a", kind: "web", name: "Web A" },
        { id: "web-b", kind: "web", name: "Web B" },
        { id: "ssh", kind: "gate", name: "SSH" },
        { id: "http", kind: "gate", name: "HTTP" },
      ]),
      states({ kind: "process", id: "web-a" }, { title: "A" } as never),
      states({ kind: "process", id: "web-b" }, { title: "B" } as never),
    ];
    const { architecture } = of(records);
    const ids = architecture.parts.map((part) => part.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Database and Storage agree about where the bytes are", () => {
  it("puts the database in the volume the map joins it to", () => {
    const { database, storage } = of(world());
    expect(database.database?.volume?.name).toBe("data");
    expect(storage.volumes.map((item) => item.name)).toContain("data");
  });

  it("does not let Database claim a copy Backups has not got", () => {
    const { database, storage } = of(world());
    expect(database.newestCopyAt).toBeNull();
    expect(storage.copies).toEqual([]);
    expect(database.protection).toEqual(storage.protection);
  });
});

describe("Security and Processes agree about the way in", () => {
  it("reads the same access mode on both", () => {
    const { processes, reach } = of(world());
    expect(processes.restricted).toBe(true);
    expect(reach.audience).toBe("controller");
  });

  it("shows the same processes Security draws inside the wall", () => {
    const { processes, reach } = of(world());
    expect(reach.processes.map((item) => item.name)).toEqual(
      processes.processes.map((item) => item.name),
    );
  });
});

describe("Monitoring and the subjects it watches agree", () => {
  it("has a station for every subject a page draws", () => {
    const { monitoring, processes, storage } = of(world());
    for (const item of [...processes.processes, ...storage.volumes])
      expect(monitoring.parts).toContain(item.name);
  });

  it("reads a check the same way the subject's own page does", () => {
    const { monitoring, processes } = of(world());
    const look = monitoring.looks.find((item) => item.part === "web");
    expect(look?.state).toBe("passing");
    expect(processes.processes[0].probes[0].passed).toBe(true);
  });
});

describe("Environment Variables and Processes agree about scope", () => {
  it("names the process that reads the value", () => {
    const { supply, processes } = of(world());
    expect(supply.values[0].service).toBe("web");
    expect(processes.processes.map((item) => item.name)).toContain(
      supply.values[0].service,
    );
  });
});

describe("Overview does not disagree with the lane it links to", () => {
  it("reads the application healthy only when its own page does", () => {
    const { overview, processes } = of(world());
    expect(processes.tone).toBe("verified");
    expect(
      overview.vitals.some((item) => item.status.certainty === "failed"),
    ).toBe(false);
  });

  it("shows a failure on Overview when the destination shows one", () => {
    const records: SavedInformation[] = world().map((item) =>
      item.presentation?.states?.ref.id === "web" &&
      item.presentation.states.ref.kind === "process"
        ? ({
            ...item,
            presentation: {
              ...item.presentation,
              status: "failed" as const,
              checks: [check("http", "failed", "liveness")],
            },
          } as SavedInformation)
        : item,
    );
    const { overview, processes } = of(records);
    expect(processes.tone).toBe("failed");
    expect(
      overview.needs.length > 0 ||
        overview.vitals.some((item) => item.status.certainty === "failed"),
    ).toBe(true);
  });
});
