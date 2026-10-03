import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, CDPSession, Page } from "@playwright/test";
import { longHistory } from "../fixtures/long-history";
import { test, expect } from "./fixtures";
import { scriptWorker } from "./scripted-worker";

// Timing profiles must not record every full history in Playwright's trace.
test.use({ scriptedWorker: true, notificationMetrics: true, trace: "off" });

async function setup(page: Page, fixture: { state: string }, calls?: number) {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: `https://github.com/qa/history-${randomUUID()}`,
    },
  });
  expect(created.ok()).toBe(true);
  const view = await created.json();
  const app = view.application.id as string,
    chat = view.selectedChatId as string,
    name = view.application.name as string;
  const { transcript, executions } = longHistory(chat, app, calls);
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
  return { app, chat, name, transcript, executions, last, call, worker, store };
}

test("older evidence and open disclosures survive changes, completion, view switching and reconnect", async ({
  page,
  fixture,
}) => {
  const state = await setup(page, fixture);
  const { app, chat, transcript, last, call, worker, store } = state;
  let ax: CDPSession | undefined;
  try {
    await page.goto(`/applications/${app}`);
    // It opens on its latest message; the earlier ones are drawn after it.
    await expect(page.locator('[id="hv-message-reply:79"]')).toBeInViewport();
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
    // With the turn idle, a destination round trip must not move the reader
    // or replace their draft. Keep an older, expanded reply on screen.
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    const draft = "Explain this earlier command when I return.";
    await composer.fill(draft);
    await old.scrollIntoViewIfNeeded();
    await expect(old).toBeInViewport();
    const transcriptScroll = page.locator(".hv-conversation > div").first();
    const reading = await transcriptScroll.evaluate((element) => ({
      top: element.scrollTop,
      end: element.scrollHeight - element.clientHeight,
    }));
    expect(reading.top).toBeGreaterThan(0);
    expect(reading.top).toBeLessThan(reading.end);
    const accessibility = await page.context().newCDPSession(page);
    ax = accessibility;
    // Role queries do not account for inert. Read Chromium's
    // accessibility tree instead.
    const exposedComposers = async () => {
      const { nodes } = await accessibility.send("Accessibility.getFullAXTree");
      expect(nodes.length).toBeGreaterThan(0);
      return nodes.filter(
        (node) =>
          !node.ignored &&
          node.role?.value === "textbox" &&
          node.name?.value === "Message Hallvi",
      ).length;
    };
    await expect.poll(exposedComposers).toBe(1);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect.poll(exposedComposers).toBe(0);
    // The mounted conversation must not steal focus from the destination.
    await page.locator("#pi-composer").evaluate((element) => element.focus());
    expect(
      await page.evaluate(() => document.activeElement?.id === "pi-composer"),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Main operator", exact: true })
      .click();
    // Returning intentionally focuses the composer; it must leave the
    // independently scrolling transcript where the reader put it.
    await expect(composer).toBeFocused();
    await expect(composer).toBeInViewport();
    await expect(composer).toHaveValue(draft);
    await expect.poll(exposedComposers).toBe(1);
    await expect
      .poll(() => transcriptScroll.evaluate((element) => element.scrollTop))
      .toBe(reading.top);
    await expect(old).toBeInViewport();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(old.locator(".hv-did-detail")).toContainText("END-3");
    await composer.press("End");
    await page.keyboard.type(" Keep the evidence.");
    await expect(composer).toHaveValue(`${draft} Keep the evidence.`);
    // Keyboard navigation does not light-dismiss the native Permissions
    // popover. Its top-layer content must be hidden with the conversation.
    await page.getByRole("button", { name: /^Permissions:/ }).click();
    const permissions = page.getByRole("radiogroup", {
      name: "Permissions",
      exact: true,
    });
    await expect(permissions).toBeVisible();
    const overview = page.getByRole("button", {
      name: "Overview",
      exact: true,
    });
    await overview.focus();
    await overview.press("Enter");
    await expect(page.locator("#hv-mode-menu")).toBeHidden();
    await expect(permissions).toHaveCount(0);
    await page.goBack();
    await expect(permissions).toBeVisible();
    await expect(composer).toHaveValue(`${draft} Keep the evidence.`);
    await page.keyboard.press("Escape");
    await expect(permissions).toHaveCount(0);
    await composer.fill("");
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
    // A link to a message in the middle takes the reader there, and the
    // conversation keeping to its latest message does not carry them back.
    await page.goto(`/applications/${app}?message=reply:40`);
    const linked = page.locator('[id="hv-message-reply:40"]');
    await expect(page.locator('[id="hv-message-asked:0"]')).toBeAttached();
    await page.waitForTimeout(1000);
    await expect(linked).toBeInViewport();
    // Once: a reader who has gone back to the latest message stays there
    // when the next one arrives.
    await page
      .getByRole("button", { name: "Scroll to the latest message" })
      .click();
    transcript.messages.push({
      id: "asked:after",
      chatId: chat,
      role: "user",
      body: "One more question.",
      source: "user",
      status: "delivered",
      createdAt: last.finishedAt!,
      revision: 0,
    });
    worker.changed({ kind: "chat", applicationId: app, chatId: chat });
    await expect(page.getByText("One more question.")).toBeInViewport();
    await expect(linked).not.toBeInViewport();
  } finally {
    try {
      await ax?.detach();
    } finally {
      await worker();
    }
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
    const eventPath = testInfo.outputPath("reader-events.jsonl");
    const recordEvent = (value: object) =>
      appendFileSync(
        eventPath,
        JSON.stringify({ at: Date.now(), ...value }) + "\n",
      );
    recordEvent({ stage: "setup" });
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
      recordEvent({ stage: "warm" });
      for (const incremental of process.env.HALLVI_RESPONSE_MODE === "changes"
        ? [true]
        : process.env.HALLVI_RESPONSE_MODE === "full"
          ? [false]
          : [false, true]) {
        const readers: Page[] = [];
        transcript.messages.at(-1)!.body = baseBody;
        last.output = baseOutput;
        call.preview = baseOutput;
        store();
        worker.changed({ kind: "execution", applicationId: app });
        while (readers.length < count) {
          recordEvent({
            stage: "opening",
            incremental,
            reader: readers.length,
          });
          const context = await browser.newContext({ baseURL: fixture.url });
          contexts.push(context);
          await context.addInitScript(() => {
            type Event = {
              kind: string;
              at: number;
              state: number;
              chars?: number;
              tail?: string;
              marks?: string[];
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
                    const entry = {
                      kind,
                      at: performance.now(),
                      state: this.readyState,
                      ...(data
                        ? {
                            chars: data.length,
                            tail: data.slice(-600),
                            marks: [
                              ...new Set(data.match(/PROFILE-\d+-\d+/g) ?? []),
                            ],
                          }
                        : {}),
                    };
                    events.push(entry);
                    console.info("QA-SSE " + JSON.stringify(entry));
                    if (events.length > 60) events.shift();
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
          const index = readers.length;
          reader.on("console", (message) => {
            if (message.text().startsWith("QA-SSE "))
              recordEvent({
                incremental,
                reader: index,
                event: JSON.parse(message.text().slice(7)),
              });
          });
          const connected = reader.waitForResponse((response) =>
            new URL(response.url()).pathname.endsWith(`/chats/${chat}/events`),
          );
          await reader.goto(`/applications/${app}`);
          recordEvent({ stage: "loaded", incremental, reader: index });
          await connected;
          recordEvent({ stage: "sse-response", incremental, reader: index });
          await expect(reader.locator(`#execution-${last.id}`)).toBeVisible();
          readers.push(reader);
          recordEvent({ stage: "connected", incremental, reader: index });
        }
        // Begin after the pending connect notices and initial frames settle.
        await page.waitForTimeout(800);
        const before = await metrics(true);
        const at = performance.now();
        const visibleMs: number[] = [];
        for (let wave = 0; wave < 6; wave++) {
          const changedAt = performance.now();
          const mark = `PROFILE-${count}-${wave}`;
          recordEvent({ stage: "changed", incremental, mark });
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
          recordEvent({
            stage: "visible",
            incremental,
            mark,
            visibleMs: visibleMs.at(-1),
          });
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
          projections: after.projections,
          workerReads: after.workerReads,
          transcriptReads: worker.reads(),
          clientEvents: await Promise.all(
            readers.map((reader) =>
              reader.evaluate(
                () => (window as unknown as { qaSse: unknown }).qaSse,
              ),
            ),
          ),
        });
        writeFileSync(
          testInfo.outputPath("active-response-profile.json"),
          JSON.stringify(report, null, 2),
        );
        for (const context of contexts)
          await context.close().catch(() => undefined);
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
      for (const context of contexts)
        await context.close().catch(() => undefined);
      await worker();
    }
  });
}

test.describe("opening a long conversation from the list", () => {
  test.skip(
    process.env.HALLVI_OPEN_PROFILE !== "1",
    "Opt-in timing; the journey above checks where a conversation opens.",
  );
  for (const calls of [240, 900, 2000])
    test(`profile opening ${calls} calls while Hallvi works`, async ({
      page,
      fixture,
    }, testInfo) => {
      test.setTimeout(180_000);
      const state = await setup(page, fixture, calls);
      const { app, chat, name, transcript, worker } = state;
      // A turn in flight: every token is a change notice.
      const streaming = setInterval(() => {
        transcript.messages.at(-1)!.body += " token";
        transcript.messages.at(-1)!.revision++;
        worker.changed({ kind: "chat", applicationId: app, chatId: chat });
      }, 60);
      const runs: object[] = [];
      try {
        const latest = `hv-message-reply:${Math.floor((calls - 1) / 3)}`;
        for (let round = 0; round < 3; round++) {
          await page.goto("/applications");
          const open = page
            .getByRole("listitem")
            .filter({ hasText: name })
            .getByRole("link", { name: "Open app" });
          await expect(open).toBeVisible();
          await page.waitForTimeout(1000);
          await page.evaluate((latest) => {
            const marks: Record<string, number> = { longTasks: 0, longest: 0 };
            Object.assign(window, { qaOpen: marks });
            document.addEventListener(
              "click",
              () => (marks.click = performance.now()),
              { capture: true, once: true },
            );
            new PerformanceObserver((list) => {
              for (const task of list.getEntries()) {
                if (!marks.click || task.startTime < marks.click) continue;
                marks.longTasks += task.duration;
                marks.longest = Math.max(marks.longest, task.duration);
              }
            }).observe({ type: "longtask" });
            const watch = () => {
              const reply = document.getElementById(latest);
              const port = reply
                ?.closest(".hv-conversation")
                ?.getBoundingClientRect();
              const box = reply?.getBoundingClientRect();
              if (box && port && box.bottom > port.top && box.top < port.bottom)
                marks.latestOnScreen ??= performance.now();
              if (document.getElementById("hv-message-asked:0"))
                marks.allDrawn ??= performance.now();
              if (!marks.allDrawn || !marks.latestOnScreen)
                requestAnimationFrame(watch);
            };
            requestAnimationFrame(watch);
          }, latest);
          await open.click();
          await expect(page.locator('[id="hv-message-asked:0"]')).toBeAttached({
            timeout: 60_000,
          });
          await page.waitForTimeout(3000);
          const marks = await page.evaluate(
            () =>
              (window as unknown as { qaOpen: Record<string, number> }).qaOpen,
          );
          runs.push({
            calls,
            latestOnScreenMs: Math.round(marks.latestOnScreen - marks.click),
            allDrawnMs: Math.round(marks.allDrawn - marks.click),
            longTasksMs: Math.round(marks.longTasks),
            longestTaskMs: Math.round(marks.longest),
          });
        }
      } finally {
        clearInterval(streaming);
        writeFileSync(
          testInfo.outputPath("open-profile.json"),
          JSON.stringify(runs, null, 2),
        );
        await testInfo.attach("open-profile", {
          body: JSON.stringify(runs, null, 2),
          contentType: "application/json",
        });
        await worker();
      }
    });
});
