// Every number a page draws from a string Pi wrote.
//
// A parser that guesses is worse than one that gives up: "534" read as
// gigabytes drew a volume a thousand times the size of its disk, and nothing
// on the page said it had guessed. So each of these asserts either the right
// number or an honest nothing — never a plausible wrong one.

import { beforeEach, describe, expect, it } from "vitest";

import { processesFromRecords } from "@/components/haldur/processes-records";
import { reachFromRecords } from "@/components/haldur/reach-records";
import { storageFromRecords } from "@/components/haldur/storage-records";
import { supplyFromRecords } from "@/components/haldur/supply-records";
import {
  APP,
  NOW,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const fact = (key: string, value: string, claim = "contents") =>
  ({ key, label: key, value, claim, basis: "observed" }) as never;
const check = (
  key: string,
  status: "passed" | "failed",
  claim = "reachability",
) => ({ key, label: key, status, claim, basis: "observed" }) as never;

const sizeOf = (value: string) =>
  storageFromRecords({
    records: [
      states({ kind: "volume", id: "v" }, {
        facts: [fact("size", value)],
      } as never),
    ],
    applicationId: APP,
    now: NOW,
  }).volumes[0].sizeGb;

const portOf = (value: string) =>
  processesFromRecords({
    records: [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      states({ kind: "process", id: "web" }, {
        facts: [fact("port", value, "configuration")],
      } as never),
    ],
    applicationId: APP,
    now: NOW,
  }).processes[0];

const imageOf = (value: string) =>
  processesFromRecords({
    records: [
      topology([{ id: "web", kind: "web", name: "Web" }]),
      states({ kind: "process", id: "web" }, {
        facts: [fact("image", value, "identity")],
      } as never),
    ],
    applicationId: APP,
    now: NOW,
  }).processes[0];

describe("sizes", () => {
  const GB = 1000 ** 3;
  const GiB = 1024 ** 3;

  it("reads every unit it is given", () => {
    expect(sizeOf("534 bytes")).toBeCloseTo(534 / GB, 12);
    expect(sizeOf("8 KiB")).toBeCloseTo((8 * 1024) / GiB, 12);
    expect(sizeOf("8 KB")).toBeCloseTo(8000 / GB, 12);
    expect(sizeOf("220 MB")).toBeCloseTo(0.22, 6);
    expect(sizeOf("220 MiB")).toBeCloseTo((220 * 1024 ** 2) / GiB, 6);
    expect(sizeOf("1.5 GB")).toBeCloseTo(1.5, 6);
    expect(sizeOf("1.5 GiB")).toBeCloseTo(1.5, 6);
    expect(sizeOf("2 TB")).toBeCloseTo(2000, 3);
  });

  it("reads thousands separators", () => {
    expect(sizeOf("48,217,962 bytes")).toBeCloseTo(0.048217962, 8);
    expect(sizeOf("1,024.5 MiB")).toBeCloseTo((1024.5 * 1024 ** 2) / GiB, 6);
  });

  it("reads zero as zero, not as unknown", () => {
    expect(sizeOf("0 bytes")).toBe(0);
  });

  it("gives up rather than guessing", () => {
    // Each of these could be read as a number by a parser willing to guess,
    // and each guess would be wrong.
    for (const value of ["534", "not measured", "a few MB-ish", "-", "n/a", ""])
      expect(sizeOf(value), value).toBeNull();
  });

  it("does not mistake a ratio for a size", () => {
    // "3.1 of 38 GB used" is a disk reading, not a volume size. Taking the
    // last number would say the volume is the whole disk.
    expect(sizeOf("3.1 of 38 GB used")).toBeCloseTo(38, 3);
  });
});

describe("ports", () => {
  it("reads the container port out of every shape Docker prints", () => {
    expect(portOf("3000").port).toBe(3000);
    expect(portOf("3000/tcp").port).toBe(3000);
    expect(portOf("127.0.0.1:3000 → 3000/tcp").port).toBe(3000);
    expect(portOf("0.0.0.0:8080->8080/tcp").port).toBe(8080);
  });

  it("keeps an IPv6 binding readable rather than guessing at it", () => {
    const item = portOf("[::1]:8443 → 8443/tcp");
    expect(item.port).toBe(8443);
    expect(item.reach).toContain("[::1]:8443 → 8443/tcp");
  });

  it("says nothing was recorded rather than showing a zero", () => {
    const item = processesFromRecords({
      records: [
        topology([{ id: "web", kind: "web", name: "Web" }]),
        states({ kind: "process", id: "web" }, {} as never),
      ],
      applicationId: APP,
      now: NOW,
    }).processes[0];
    expect(item.port).toBeNull();
    expect(item.reach).toContain("its port");
  });
});

describe("images", () => {
  it("does not mistake a registry port for a tag", () => {
    // registry.example.com:5000/team/app is a host and a port, and the text
    // after the last colon is "5000/team/app" — not a version.
    const item = imageOf("registry.example.com:5000/team/app:2.4.0");
    expect(item.image).toBe("registry.example.com:5000/team/app:2.4.0");
    expect(item.imageShort).toBe("app:2.4.0");
  });

  it("shortens a digest rather than printing sixty-four characters", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(imageOf(`example/app@${digest}`).imageShort).toBe(
      `app · ${"a".repeat(12)}`,
    );
  });

  it("keeps a Unicode name intact", () => {
    expect(imageOf("registry.test/ünïcøde-web:1").imageShort).toBe(
      "ünïcøde-web:1",
    );
  });
});

describe("sources on a door", () => {
  const doorOf = (sources: string) =>
    reachFromRecords({
      records: [
        states({ kind: "door", id: "d" }, {
          facts: [
            fact("port", "443", "configuration"),
            fact("sources", sources, "configuration"),
          ],
          checks: [check("open", "passed")],
        } as never),
      ],
      applicationId: APP,
      applicationName: "App",
      now: NOW,
    }).doors[0];

  it("reads every way of saying everyone", () => {
    for (const value of ["anywhere", "0.0.0.0/0", "::/0", "Anywhere"])
      expect(doorOf(value).reach, value).toBe("internet");
  });

  it("reads a list of addresses as a list", () => {
    expect(doorOf("203.0.113.4, 2001:db8::10").sources).toEqual([
      "203.0.113.4",
      "2001:db8::10",
    ]);
  });

  it("keeps prose as one source", () => {
    expect(doorOf("Server loopback via SSH tunnel").sources).toHaveLength(1);
  });

  it("does not read a restricted list as open to everyone", () => {
    expect(doorOf("203.0.113.4").reach).toBe("restricted");
  });
});

describe("queue depths and durations", () => {
  const queueOf = (facts: object[]) =>
    supplyFromRecords({
      records: [states({ kind: "queue", id: "q" }, { facts } as never)],
      applicationId: APP,
      applicationName: "App",
      secrets: [],
      now: NOW,
    }).queues[0];

  it("reads seconds, minutes and hours", () => {
    expect(queueOf([fact("oldest", "95 s")]).oldestSeconds).toBe(95);
    expect(queueOf([fact("oldest", "4 min")]).oldestSeconds).toBe(240);
    expect(queueOf([fact("oldest", "2 h")]).oldestSeconds).toBe(7200);
  });

  it("leaves an unmeasured depth unmeasured rather than zero", () => {
    expect(queueOf([]).backlog).toBeNull();
    expect(queueOf([]).oldestSeconds).toBeNull();
  });

  it("reads a measured zero as zero", () => {
    expect(queueOf([fact("depth", "0")]).backlog).toBe(0);
  });
});

describe("counts", () => {
  const queueOf = (facts: object[]) =>
    supplyFromRecords({
      records: [states({ kind: "queue", id: "q" }, { facts } as never)],
      applicationId: APP,
      applicationName: "App",
      secrets: [],
      now: NOW,
    }).queues[0];

  it("reads a thousands separator", () => {
    // Number("1,204") is NaN, and the page printed "NaN tasks waiting".
    expect(queueOf([fact("depth", "1,204")]).backlog).toBe(1204);
    expect(queueOf([fact("failed", "1,024")]).failedLastHour).toBe(1024);
  });

  it("reads a count with words after it", () => {
    expect(queueOf([fact("depth", "12 jobs")]).backlog).toBe(12);
  });

  it("reads no number as unmeasured, never as zero", () => {
    for (const value of ["unknown", "", "several"])
      expect(queueOf([fact("depth", value)]).backlog, value).toBeNull();
  });
});
