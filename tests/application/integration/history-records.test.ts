import { describe, expect, it } from "vitest";

import { historyFromRecords } from "@/components/server-guy/history-records";
import type { SavedInformation } from "@/server/operator-data";

describe("record history origins", () => {
  it("does not render a conversation action without a resolvable chat id", () => {
    const record: SavedInformation = {
      id: "record-1",
      applicationId: "application-1",
      title: "The application answered",
      body: "The health check passed.",
      evidence: [{ type: "message", id: "message-1" }],
      establishedAt: "2026-09-12T16:05:00.000Z",
      presentation: {
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
