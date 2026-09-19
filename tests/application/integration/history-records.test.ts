import { describe, expect, it } from "vitest";

import { historyFromRecords } from "@/components/hallvi/history-records";
import type { SavedInformation } from "@/server/operator-data";

describe("record history origins", () => {
  it("does not render a conversation action without a resolvable chat id", () => {
    const record: SavedInformation = {
      id: "record-1",
      applicationId: "application-1",
      // A consequential record, because History no longer lists an ordinary
      // passing inspection: a check that found everything normal is Server
      // Guy doing its job, not a thing that happened to the application.
      title: "Private access reopened",
      body: "Reopened on port 18000; the application answered.",
      evidence: [{ type: "message", id: "message-1" }],
      establishedAt: "2026-09-12T16:05:00.000Z",
      presentation: {
        states: {
          ref: { kind: "access", id: "private-access" },
          presence: "present",
        },
        views: ["history"],
        role: "outcome",
        status: "verified",
        checks: [],
      },
      createdAt: "2026-09-12T16:05:00.000Z",
      updatedAt: "2026-09-12T16:05:00.000Z",
      retiredAt: null,
    };

    expect(
      historyFromRecords({ records: [record], executions: [] })[0].origin,
    ).toBeNull();
  });
});
