import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { countDay } from "../../src/server/traffic/count";
import type { TrafficLine } from "../../src/server/traffic/contract";
import { dayBounds, dayOf } from "../../src/server/traffic/days";
import { test, expect } from "./fixtures";

test("stopping keeps traffic totals; forgetting and keeping again cannot restore deleted figures", async ({
  page,
  fixture,
}, testInfo) => {
  // This journey also compiles the Traffic routes in the disposable controller.
  test.slow();
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/traffic-history",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const collectionUrl = `/api/applications/${appId}/traffic/collection`;
  expect(
    (await page.request.post(collectionUrl, { data: { action: "keep" } })).ok(),
  ).toBe(true);
  const historyUrl = `/api/applications/${appId}/traffic/history?range=7d`;
  const initial = await (await page.request.get(historyUrl)).json();
  const now = Date.now();
  const day = dayOf(now, initial.timeZone);
  const { start } = dayBounds(day, initial.timeZone);
  const lines: TrafficLine[] = Array.from({ length: 40 }, (_, index) => ({
    at: now - 10_000,
    host: "qa.example",
    method: "GET",
    path: "/before-forget",
    kept: {},
    status: 200,
    ms: 30,
    address: `203.0.113.${index + 1}`,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    referrer: null,
    fetchDest: "document",
    fetchMode: "navigate",
    purpose: null,
    contentType: "text/html",
    cdnCountry: "US",
  }));
  const totals = countDay(lines, {
    day,
    timeZone: initial.timeZone,
    now,
    scriptSince: null,
    coverage: {
      from: new Date(start).toISOString(),
      to: new Date(now).toISOString(),
      gaps: [],
    },
  });
  const database = new Database(join(fixture.state, "traffic.db"));
  database
    .prepare("INSERT INTO days VALUES (?, ?, ?, ?, ?)")
    .run(appId, day, 0, now - start, JSON.stringify(totals));
  database.close();

  await page.goto(`/applications/${appId}#traffic`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("main")).toContainText("/before-forget");
  await page
    .getByRole("switch", { name: "Keep traffic history" })
    .press("Space");
  await expect(page.locator("main")).toContainText("History is off");
  expect((await (await page.request.get(historyUrl)).json()).totals.views).toBe(
    40,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toContainText("History is off");
  await expect(page.locator("main")).toContainText("/before-forget");
  const stopped = testInfo.outputPath("stopped-history-keeps-totals.png");
  await page.screenshot({ path: stopped, fullPage: true });
  await testInfo.attach("stopped-history-keeps-totals.png", {
    path: stopped,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Forget stored totals" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Forget/ }).click();
  await expect(
    page.getByRole("button", { name: "Keep traffic history", exact: true }),
  ).toBeVisible();
  expect((await (await page.request.get(historyUrl)).json()).totals.views).toBe(
    0,
  );

  // The choice and deletion use the real routes. Interrupt only the next
  // history reads: erased totals must not remain as their fallback.
  await page.route("**/traffic/history?*", (route) => route.abort());
  await page
    .getByRole("button", { name: "Keep traffic history", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Keep traffic history" }),
  ).toBeChecked();
  const kept = testInfo.outputPath(
    "kept-again-with-interrupted-history-read.png",
  );
  await page.screenshot({ path: kept, fullPage: true });
  await testInfo.attach("kept-again-with-interrupted-history-read.png", {
    path: kept,
    contentType: "image/png",
  });
  await expect(page.locator("main")).not.toContainText("/before-forget");
  await page.unroute("**/traffic/history?*");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).not.toContainText("/before-forget");
  expect((await (await page.request.get(historyUrl)).json()).totals.views).toBe(
    0,
  );
});
