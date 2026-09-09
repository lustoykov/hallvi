import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BackupsView } from "../../../src/components/server-guy/views/backups-view";
import { DatabaseView } from "../../../src/components/server-guy/views/database-view";
import { StorageView } from "../../../src/components/server-guy/views/storage-view";
import { richScenario } from "../../../src/components/server-guy/reference/scenario-rich";
import {
  persistentState,
  stackOf,
} from "../../../src/server/application-stack";
import type { ProtectionFacts } from "../../../src/server/application-facts";

it("shows unknown coverage across views without claiming retained copies are absent", () => {
  const state = richScenario.initial();
  const stack = stackOf(state.deployment);
  const protection: ProtectionFacts = {
    destination: {
      provider: "r2",
      bucket: "fixture",
      region: "auto",
      connectedAt: "2026-09-09T10:00:00Z",
      access: "Configured",
    },
    policy: { schedule: "Daily", timezone: "UTC", retention: "7 copies" },
    coverage: persistentState(stack).map((item) => ({
      ...item,
      state: "unknown",
      lastSuccessfulAt: "2026-09-09T10:00:00Z",
    })),
    lastAttempt: null,
    restoreTest: null,
    history: [],
    observation: {
      at: "2026-09-09T10:00:00Z",
      reachable: false,
      timerActive: true,
      nextAt: null,
      running: false,
      cleanupPending: false,
      retentionFailed: false,
    },
  };
  expect(protection.coverage.length).toBeGreaterThan(0);
  for (const View of [BackupsView, DatabaseView, StorageView]) {
    const html = renderToStaticMarkup(
      <View
        deployment={state.deployment}
        stack={stack}
        facts={{ protection }}
        operations={[]}
        chats={[]}
        now={Date.parse("2026-09-09T12:00:00Z")}
        onOpenDestination={() => {}}
        onOpenConversation={() => {}}
        onAsk={() => {}}
      />,
    );
    expect(html).toMatch(/[Uu]nknown/);
    expect(html).not.toMatch(
      /Behind policy|not backed up off the host|It has no current off-host copy|Every volume has an off-host copy/,
    );
  }
});
