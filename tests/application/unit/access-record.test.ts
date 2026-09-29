import { expect, it } from "vitest";
import {
  currentAccessRecord,
  accessRouteIdentity,
} from "@/server/access-record";
import { releasesFromRecords } from "@/components/hallvi/release-records";
import { reachFromRecords } from "@/components/hallvi/reach-records";
import { APP, NOW, record } from "../fixtures/records";

const access = () =>
  record({
    url: "http://127.0.0.1:18000",
    content: {
      kind: "application-access",
      mode: "private",
      server: "host",
      localPort: 18000,
      remotePort: 8080,
    },
  });

it("the most recently updated route wins across access projections regardless of input or establishment order", () => {
  const changed = access();
  changed.updatedAt = "2026-09-13T11:59:00.000Z";
  const establishedLater = access();
  establishedLater.establishedAt = "2026-09-13T12:00:00.000Z";
  establishedLater.presentation!.url = "http://127.0.0.1:18001";
  const content = establishedLater.presentation!.content!;
  if (content.kind === "application-access") content.localPort = 18001;
  for (const rows of [
    [establishedLater, changed],
    [changed, establishedLater],
  ]) {
    expect(currentAccessRecord(rows, APP)?.id).toBe(changed.id);
    expect(releasesFromRecords(rows, APP).access?.url).toBe(
      changed.presentation!.url,
    );
    expect(
      reachFromRecords({
        records: rows,
        applicationId: APP,
        applicationName: "App",
        now: NOW,
      }).address,
    ).toBe(changed.presentation!.url);
  }
});

it("an incomplete replacement never resurrects an older route; retired and foreign records do not select", () => {
  const older = access();
  const replacement = access();
  replacement.updatedAt = "2026-09-13T12:00:00.000Z";
  replacement.presentation!.url = "http://127.0.0.1:19000";
  expect(currentAccessRecord([older, replacement], APP)).toBeUndefined();
  replacement.retiredAt = replacement.updatedAt;
  expect(currentAccessRecord([older, replacement], APP)?.id).toBe(older.id);
  replacement.retiredAt = null;
  replacement.applicationId = "another-app";
  expect(currentAccessRecord([replacement, older], APP)?.id).toBe(older.id);
});

it("editing or replacing a saved route changes which observation can validate it", () => {
  const saved = access();
  const identity = accessRouteIdentity(saved);
  for (const change of [
    { id: "replacement" },
    { updatedAt: "2026-09-13T12:00:00.000Z" },
    { presentation: { ...saved.presentation!, url: "http://127.0.0.1:18001" } },
  ])
    expect(accessRouteIdentity({ ...saved, ...change })).not.toBe(identity);
});
