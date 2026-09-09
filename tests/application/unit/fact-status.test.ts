import { describe, expect, it } from "vitest";

import {
  monitoringStatus,
  protectionStatus,
} from "../../../src/components/server-guy/fact-status";
import type {
  MonitoringFacts,
  ProtectionFacts,
} from "../../../src/server/application-facts";

const at = "2026-09-09T10:00:00Z";
const now = Date.parse(at);
const healthy: MonitoringFacts = {
  collector: {
    state: "running",
    lastObservationAt: at,
    hostReachable: true,
    detail: "Watching",
  },
  checks: [
    {
      id: "http",
      name: "HTTP",
      kind: "http",
      target: "/",
      state: "passing",
      lastAt: at,
      detail: "200",
    },
  ],
  resources: null,
  issues: [],
  providers: [],
};
const protectedData: ProtectionFacts = {
  destination: {
    provider: "r2",
    bucket: "backups",
    region: "auto",
    connectedAt: at,
    access: "Write backups",
  },
  policy: { schedule: "Daily", timezone: "UTC", retention: "7 days" },
  coverage: [
    {
      key: "db",
      label: "PostgreSQL",
      method: "dump",
      state: "protected",
      lastSuccessfulAt: at,
    },
  ],
  lastAttempt: { at, outcome: "succeeded" },
  restoreTest: null,
  history: [],
};

describe("truthful view summaries", () => {
  it("requires current observations and passing checks for a healthy summary", () => {
    expect(monitoringStatus(healthy, now).tone).toBe("ok");
    for (const facts of [
      { ...healthy, checks: [] },
      {
        ...healthy,
        checks: [{ ...healthy.checks[0], state: "unknown" as const }],
      },
      {
        ...healthy,
        checks: [{ ...healthy.checks[0], state: "failing" as const }],
      },
      { ...healthy, checks: [{ ...healthy.checks[0], lastAt: null }] },
      {
        ...healthy,
        collector: { ...healthy.collector, lastObservationAt: null },
      },
      { ...healthy, collector: { ...healthy.collector, hostReachable: false } },
    ]) {
      expect(monitoringStatus(facts, now).tone).not.toBe("ok");
      expect(monitoringStatus(facts, now).title).not.toBe("All checks passing");
    }
    expect(monitoringStatus(healthy, now + 25 * 3_600_000).title).toBe(
      "Monitoring is stale",
    );
  });

  it("acknowledging an incident does not claim recovery", () => {
    const facts: MonitoringFacts = {
      ...healthy,
      issues: [
        {
          id: "incident",
          title: "Errors",
          impact: "Requests fail",
          detectedAt: at,
          state: "acknowledged",
          evidence: "HTTP 500",
          next: "Investigate",
          source: { kind: "check", id: "http" },
          unread: false,
        },
      ],
    };
    expect(monitoringStatus(facts, now)).toEqual({
      tone: "warn",
      title: "1 issue needs attention",
    });
  });

  it("requires actual coverage and successful copies, not just a configured schedule", () => {
    expect(protectionStatus(protectedData).tone).toBe("ok");
    const incomplete: ProtectionFacts[] = [
      { ...protectedData, destination: null },
      { ...protectedData, policy: null },
      { ...protectedData, coverage: [] },
      {
        ...protectedData,
        coverage: [{ ...protectedData.coverage[0], lastSuccessfulAt: null }],
      },
      { ...protectedData, lastAttempt: { at, outcome: "partial" } },
      ...(["not-covered", "unprotected", "behind", "failed"] as const).map(
        (state) => ({
          ...protectedData,
          coverage: [{ ...protectedData.coverage[0], state }],
        }),
      ),
    ];
    for (const facts of incomplete)
      expect(protectionStatus(facts).tone).not.toBe("ok");
  });
});
