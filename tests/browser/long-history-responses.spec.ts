import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { longHistory } from "../fixtures/long-history";
import { test, expect } from "./fixtures";
import { scriptWorker } from "./scripted-worker";

// Timing profiles must not record every full history in Playwright's trace.
test.use({ scriptedWorker: true, notificationMetrics: true, trace: "off" });

async function setup(page: Page, fixture: { state: string }) {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: `https://github.com/qa/history-${randomUUID()}`,
    },
  });
  expect(created.ok()).toBe(true);
  const view = await created.json();
  const app = view.application.id as string,
    chat = view.selectedChatId as string;
  const { transcript, executions } = longHistory(chat, app);
  const last = executions.at(-1)!;
  last.status = "running";
  delete last.finishedAt;
  delete last.exitCode;
  transcript.status = "working";
  transcript.messages.at(-1)!.status = "running";
  delete transcript.messages.at(-1)!.finishedAt;
  const call = transcript.calls[last.toolCallId!];
  delete call.result;
  call.preview = last.output;
  const directory = join(fixture.state, "operator", app, "executions");
  mkdirSync(directory, { recursive: true });
  const store = () => {
    const path = join(directory, `${last.id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(last));
    renameSync(`${path}.tmp`, path);
  };
  for (const execution of executions)
    writeFileSync(
      join(directory, `${execution.id}.json`),
      JSON.stringify(execution),
    );
  const worker = await scriptWorker(fixture, () => transcript);
  return { app, chat, transcript, executions, last, call, worker, store };
}

test("older evidence and open disclosures survive changes, completion, view switching and reconnect", async ({
  page,
  fixture,
}) => {
  const state = await setup(page, fixture);
  const { app, chat, transcript, last, call, worker, store } = state;
  try {
    await page.goto(`/applications/${app}`);
    const old = page.locator('[id="hv-message-reply:1"]');
    await old.getByRole("button", { name: /1 file read/ }).click();
    const row = old.locator(".hv-did-row").first();
    await row.click();
    await expect(old.locator(".hv-did-detail")).toContainText("END-3");
    const card = page.locator(`#execution-${last.id}`);
    const output = card.getByRole("region", { name: "Command output" });
    await expect(output).toContainText("END-239");
    last.output += "\nLIVE-UPDATE";
    call.preview = last.output;
    transcript.messages.at(-1)!.body += " Answer updated.";
    transcript.messages.at(-1)!.revision++;
    store();
    worker.changed({ kind: "execution", applicationId: app });
    worker.changed({ kind: "chat", applicationId: app, chatId: chat });
    await expect(output).toContainText("LIVE-UPDATE");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(old.locator(".hv-did-detail")).toContainText("END-3");
    last.status = "succeeded";
    last.exitCode = 0;
    last.finishedAt = new Date().toISOString();
    last.output += "\nCOMPLETE-EVIDENCE";
    transcript.status = "idle";
    transcript.messages.at(-1)!.status = "completed";
    transcript.messages.at(-1)!.finishedAt = last.finishedAt;
    call.result = { text: last.output, failed: false, at: last.finishedAt };
    call.preview = "";
    store();
    worker.changed({ kind: "execution", applicationId: app });
    worker.changed({ kind: "chat", applicationId: app, chatId: chat });
    await expect(card.getByText("Completed", { exact: true })).toBeVisible();
    await expect(output).toContainText("COMPLETE-EVIDENCE");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByRole("button", { name: "Main operator", exact: true })
      .click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await page.context().setOffline(true);
    await page.waitForTimeout(300);
    transcript.messages[3].body += " Updated while disconnected.";
    transcript.messages[3].revision++;
    worker.changed({ kind: "chat", applicationId: app, chatId: chat });
    await page.context().setOffline(false);
    await expect(old).toContainText("Updated while disconnected.");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: "tests/results/long-history-evidence.png" });
    // A new subscription replaces its baseline with full current state.
    await page.reload();
    const latest = page.locator('[id="hv-message-reply:79"]');
    await latest.getByRole("button", { name: /2 commands/ }).click();
    await latest.locator(".hv-did-row").last().click();
    await expect(latest.locator(".hv-did-detail")).toContainText(
      "COMPLETE-EVIDENCE",
    );
    await old.getByRole("button", { name: /1 file read/ }).click();
    await old.locator(".hv-did-row").first().click();
    await expect(old.locator(".hv-did-detail")).toContainText("END-3");
    const detail = await page.request.get(
      `/api/applications/${app}/executions/${last.id}`,
    );
    expect(detail.ok()).toBe(true);
    expect((await detail.json()).output).toContain("COMPLETE-EVIDENCE");
  } finally {
    await worker();
  }
});

for (const count of [1, 5, 10]) {
  test(`profile warm active responses with ${count} browser readers`, async ({
    page,
    browser,
    fixture,
  }, testInfo) => {
    test.skip(
      process.env.HALLVI_RESPONSE_PROFILE !== "1",
      "Opt-in timing comparison; correctness runs above.",
    );
    test.setTimeout(120_000);
    const { app, chat, transcript, last, call, worker, store } = await setup(
      page,
      fixture,
    );
    const contexts: BrowserContext[] = [];
    const report: object[] = [];
    const browserErrors: string[] = [];
    const readerPages: Page[] = [];
    const baseBody = transcript.messages.at(-1)!.body;
    const baseOutput = last.output;
    const metrics = async (reset = false) =>
      (
        await page.request.get(
          `/api/qa-notification-metrics?responses=1${reset ? "&reset=1" : ""}`,
          { timeout: 5_000 },
        )
      ).json();
    try {
      // Warm SSR and handlers; each mode uses the same code and data.
      await page.goto(`/applications/${app}`);
      await expect(page.locator(`#execution-${last.id}`)).toBeVisible();
      await page.goto("about:blank");
      for (const incremental of [false, true]) {
        const readers: Page[] = [];
        transcript.messages.at(-1)!.body = baseBody;
        last.output = baseOutput;
        call.preview = baseOutput;
        store();
        worker.changed({ kind: "execution", applicationId: app });
        while (readers.length < count) {
          const context = await browser.newContext({ baseURL: fixture.url });
          contexts.push(context);
          await context.addInitScript(() => {
            type Event = {
              kind: string;
              at: number;
              state: number;
              chars?: number;
              tail?: string;
            };
            const events: Event[] = [];
            (window as unknown as { qaSse: Event[] }).qaSse = events;
            const Native = window.EventSource;
            window.EventSource = class extends Native {
              constructor(url: string | URL, options?: EventSourceInit) {
                super(url, options);
                for (const kind of ["open", "error", "message"])
                  this.addEventListener(kind, (event) => {
                    const data =
                      kind === "message"
                        ? (event as MessageEvent<string>).data
                        : undefined;
                    events.push({
                      kind,
                      at: performance.now(),
                      state: this.readyState,
                      ...(data
                        ? { chars: data.length, tail: data.slice(-600) }
                        : {}),
                    });
                    if (events.length > 12) events.shift();
                  });
              }
            };
          });
          await context.route("**/*", (route) => {
            const url = new URL(route.request().url());
            if (url.origin !== fixture.url) return route.abort();
            if (!incremental && url.pathname.endsWith("/events")) {
              url.searchParams.delete("changes");
              return route.continue({ url: url.href });
            }
            return route.continue();
          });
          const reader = await context.newPage();
          readerPages.push(reader);
          reader.on("pageerror", (error) => browserErrors.push(error.message));
          const connected = reader.waitForResponse((response) =>
            new URL(response.url()).pathname.endsWith(`/chats/${chat}/events`),
          );
          await reader.goto(`/applications/${app}`);
          await connected;
          await expect(reader.locator(`#execution-${last.id}`)).toBeVisible();
          readers.push(reader);
        }
        // Begin after the pending connect notices and initial frames settle.
        await page.waitForTimeout(800);
        const before = await metrics(true);
        const at = performance.now();
        const visibleMs: number[] = [];
        for (let wave = 0; wave < 6; wave++) {
          const changedAt = performance.now();
          const mark = `PROFILE-${count}-${wave}`;
          last.output += `\n${mark}`;
          call.preview = last.output;
          transcript.messages.at(-1)!.body += ` ${mark}`;
          transcript.messages.at(-1)!.revision++;
          store();
          worker.changed({ kind: "execution", applicationId: app });
          worker.changed({ kind: "chat", applicationId: app, chatId: chat });
          await Promise.all(
            readers.map((reader) =>
              expect(reader.locator(`#execution-${last.id}`)).toContainText(
                mark,
              ),
            ),
          );
          visibleMs.push(performance.now() - changedAt);
          await page.waitForTimeout(550);
        }
        const after = await metrics();
        expect(after.frames.length).toBe(count * 6);
        expect(browserErrors).toEqual([]);
        expect(after.parses - before.parses).toBeLessThanOrEqual(6);
        expect(
          after.frames.every(
            (frame: { full: boolean }) => frame.full !== incremental,
          ),
        ).toBe(true);
        report.push({
          incremental,
          readers: count,
          elapsedMs: performance.now() - at,
          visibleMs,
          snapshots: after.snapshots - before.snapshots,
          scans: after.scans - before.scans,
          parses: after.parses - before.parses,
          maxLoopDelayMs: after.maxLoopDelayMs,
          frames: after.frames,
        });
        writeFileSync(
          testInfo.outputPath("active-response-profile.json"),
          JSON.stringify(report, null, 2),
        );
        for (const context of contexts) await context.close();
        contexts.length = 0;
      }
      await testInfo.attach("active-response-profile", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      writeFileSync(
        testInfo.outputPath("active-response-profile.json"),
        JSON.stringify(report, null, 2),
      );
    } finally {
      const clientEvents = await Promise.all(
        readerPages.map((reader) =>
          reader.isClosed()
            ? null
            : reader
                .evaluate(() => (window as unknown as { qaSse: unknown }).qaSse)
                .catch(() => null),
        ),
      );
      writeFileSync(
        testInfo.outputPath("active-response-profile-partial.json"),
        JSON.stringify(
          {
            report,
            browserErrors,
            clientEvents,
            metrics: await metrics().catch(() => null),
          },
          null,
          2,
        ),
      );
      for (const context of contexts) await context.close();
      await worker();
    }
  });
}
