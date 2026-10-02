import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
} from "@playwright/test";
import type { ExecutionRecord } from "../../src/server/operator-execution";
import { test, expect } from "./fixtures";
import { scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true, notificationMetrics: true });
const idle = () => ({
  status: "idle" as const,
  messages: [],
  calls: {},
  said: [],
});
async function application(request: APIRequestContext, name: string) {
  const response = await request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: `https://github.com/qa/${name}`,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
type Reads = { snapshots: number; scans: number; parses: number };
const reads = async (request: APIRequestContext): Promise<Reads> =>
  (await request.get("/api/qa-notification-metrics")).json();
async function open(
  browser: Browser,
  url: string,
  app: string,
  chat: string,
  contexts: BrowserContext[],
) {
  // Independent browser network contexts also avoid HTTP/1's six-connection
  // per-origin limit when ten EventSources are open at once.
  const context = await browser.newContext({ baseURL: url });
  contexts.push(context);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === url
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const connected = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/chats/${chat}/events`),
  );
  await page.goto(`/applications/${app}?chat=${chat}`);
  expect((await connected).ok()).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Message Hallvi" }),
  ).toBeVisible();
  return page;
}

test("one worker subscription scopes notices, relays a Next mutation, and recovers without polling snapshots", async ({
  page,
  browser,
  fixture,
}) => {
  test.setTimeout(120_000);
  const a = await application(page.request, "notification-boundary");
  const b = await application(page.request, "notification-other");
  const side = await (
    await page.request.post(`/api/applications/${a.application.id}/chats`, {
      data: { title: "Side" },
    })
  ).json();
  let worker = await scriptWorker(fixture, idle);
  const contexts: BrowserContext[] = [];
  try {
    const main = await open(
      browser,
      fixture.url,
      a.application.id,
      a.selectedChatId,
      contexts,
    );
    const second = await open(
      browser,
      fixture.url,
      a.application.id,
      side.selectedChatId,
      contexts,
    );
    const other = await open(
      browser,
      fixture.url,
      b.application.id,
      b.selectedChatId,
      contexts,
    );
    await expect.poll(() => worker.subscribers()).toBe(1);
    await page.waitForTimeout(600);
    const before = await reads(page.request);
    worker.changed({
      kind: "chat",
      applicationId: a.application.id,
      chatId: a.selectedChatId,
    });
    await expect
      .poll(async () => (await reads(page.request)).snapshots)
      .toBe(before.snapshots + 1);
    worker.changed({ kind: "information", applicationId: a.application.id });
    await expect
      .poll(async () => (await reads(page.request)).snapshots)
      .toBe(before.snapshots + 3);
    // This is the real Next PATCH handler and database thread. Its notification
    // must reach the separately bundled SSE route and the worker relay.
    const relays = worker.relays();
    const renamed = await page.request.patch(
      `/api/applications/${a.application.id}`,
      { data: { name: "Changed through Next" } },
    );
    expect(renamed.ok()).toBe(true);
    await expect(main.getByRole("log")).toContainText("Changed through Next");
    await expect(second.getByRole("log")).toContainText("Changed through Next");
    await expect(other.getByRole("log")).not.toContainText(
      "Changed through Next",
    );
    expect(worker.relays()).toBeGreaterThan(relays);
    await worker();
    await expect(main.getByText("No worker is running")).toBeVisible();
    await expect(second.getByText("No worker is running")).toBeVisible();
    await expect(other.getByText("No worker is running")).toBeVisible();
    const unavailable = await reads(page.request);
    // Several connection attempts, no history polling.
    await page.waitForTimeout(1800);
    expect(await reads(page.request)).toEqual(unavailable);
    worker = await scriptWorker(fixture, idle);
    await expect(main.getByText("No worker is running")).toHaveCount(0);
    await expect(second.getByText("No worker is running")).toHaveCount(0);
    await expect(other.getByText("No worker is running")).toHaveCount(0);
    await expect.poll(() => worker.subscribers()).toBe(1);
    for (const context of contexts) await context.close();
    contexts.length = 0;
    await expect.poll(() => worker.subscribers()).toBe(0);
  } finally {
    for (const context of contexts) await context.close();
    await worker();
  }
});

test("1, 5 and 10 open chats do no idle history work across every background refresh interval", async ({
  page,
  browser,
  fixture,
}, testInfo) => {
  test.setTimeout(240_000);
  const app = await application(page.request, "notification-long-history");
  const chats: string[] = [app.selectedChatId];
  for (let index = 1; index < 10; index++) {
    const view = await (
      await page.request.post(`/api/applications/${app.application.id}/chats`, {
        data: { title: `Reader ${index + 1}` },
      })
    ).json();
    chats.push(view.selectedChatId);
  }
  const worker = await scriptWorker(fixture, idle);
  const contexts: BrowserContext[] = [];
  const directory = join(
    fixture.state,
    "operator",
    app.application.id,
    "executions",
  );
  mkdirSync(directory, { recursive: true });
  // Old calls from another chat remain in every application-wide snapshot.
  // Keeping them outside the selected chat avoids rendering 2,000 tool cards.
  const historicalChat = randomUUID();
  let historyBytes = 0;
  for (let index = 0; index < 2000; index++) {
    const record: ExecutionRecord = {
      id: randomUUID(),
      applicationId: app.application.id,
      chatId: historicalChat,
      runId: "historical",
      toolCallId: `call-${index}`,
      tool: "fixture",
      target: "local",
      input: "historical check",
      output: "Saved output. ".repeat(40),
      mode: "bypass",
      status: "succeeded",
      createdAt: "2026-09-01T00:00:00.000Z",
      finishedAt: "2026-09-01T00:00:01.000Z",
      exitCode: 0,
    };
    const text = JSON.stringify(record);
    historyBytes += Buffer.byteLength(text);
    writeFileSync(join(directory, `${record.id}.json`), text);
  }
  const measurements: unknown[] = [];
  let metadataRequests = 0;
  let fullOperatorRequests = 0;
  try {
    for (const count of [1, 5, 10]) {
      const opening = performance.now();
      while (contexts.length < count) {
        const opened = await open(
          browser,
          fixture.url,
          app.application.id,
          chats[contexts.length],
          contexts,
        );
        opened.on("request", (request) => {
          const url = new URL(request.url());
          if (url.searchParams.get("view") === "metadata") metadataRequests++;
          if (
            url.pathname.endsWith("/operator") &&
            !url.searchParams.has("settingsOnly")
          )
            fullOperatorRequests++;
        });
      }
      const openMs = performance.now() - opening;
      // Finish initial hydration/read scheduling.
      await page.waitForTimeout(700);
      const before = await reads(page.request);
      const transcripts = worker.reads();
      const metadata = metadataRequests;
      const at = performance.now();
      // Crosses 500ms, 2.5s, 10s and 15s cadences.
      await page.waitForTimeout(16_500);
      const after = await reads(page.request);
      const measurement = {
        chats: count,
        executions: 2000,
        historyBytes,
        openMs: Math.round(openMs),
        idleMs: Math.round(performance.now() - at),
        snapshots: after.snapshots - before.snapshots,
        scans: after.scans - before.scans,
        parses: after.parses - before.parses,
        transcriptReads: worker.reads() - transcripts,
        metadataRequests: metadataRequests - metadata,
        workerSubscriptions: worker.subscribers(),
      };
      measurements.push(measurement);
      expect(after).toEqual(before);
      expect(measurement.transcriptReads).toBe(0);
      expect(measurement.metadataRequests).toBeGreaterThanOrEqual(count);
      expect(measurement.workerSubscriptions).toBe(1);
      expect(fullOperatorRequests).toBe(0);
    }
    const path = testInfo.outputPath("idle-reads.json");
    writeFileSync(path, JSON.stringify(measurements, null, 2));
    await testInfo.attach("Idle read measurements", {
      path,
      contentType: "application/json",
    });
    console.log(JSON.stringify(measurements));
  } finally {
    for (const context of contexts) await context.close();
    await worker();
  }
});
