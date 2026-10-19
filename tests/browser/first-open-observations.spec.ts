import { randomUUID } from "node:crypto";
import type { Transcript } from "../../src/server/pi-transcript";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("one collection owner and unchanged opening outcomes avoid repeat observations", async ({
  page,
  fixture,
}) => {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/first-open",
    },
  });
  expect(created.ok()).toBe(true);
  const view = await created.json();
  const app = view.application.id;
  const chat = view.selectedChatId;
  const prefix = `/api/applications/${app}`;
  expect(
    (
      await page.request.post(`${prefix}/traffic/collection`, {
        data: { action: "keep" },
      })
    ).ok(),
  ).toBe(true);
  const transcript: Transcript = {
    status: "idle",
    messages: exchange(chat, "Inspect the application", {
      body: "The saved inspection is complete.",
      status: "completed",
    }).messages,
    calls: {},
    said: [],
  };
  const worker = await scriptWorker(fixture, () => transcript);
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith(prefix))
      requests.push(url.pathname + url.search);
  });
  await page.addInitScript(() => {
    let frames = 0;
    Object.defineProperty(window, "qaChatFrames", { get: () => frames });
    const native = window.EventSource;
    window.EventSource = class extends native {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        if (String(url).includes("/chats/"))
          this.addEventListener("message", () => frames++);
      }
    };
  });
  const count = (suffix: string) =>
    requests.filter((path) => path.endsWith(suffix)).length;
  // Development Strict Mode replays mount effects; production reads once.
  const openingReads = process.env.HALLVI_QA_PRODUCTION === "1" ? 1 : 2;
  try {
    await page.goto(`/applications/${app}#traffic`);
    await expect(
      page.getByRole("heading", { name: "Traffic", exact: true }),
    ).toBeVisible();
    await page.waitForFunction(
      () => (window as unknown as { qaChatFrames: number }).qaChatFrames > 0,
    );
    await expect.poll(() => count("/traffic/history?range=7d")).toBe(1);
    expect(count("/traffic/collection")).toBe(openingReads);
    expect(count("/access")).toBe(openingReads);
    expect(count("&view=metadata")).toBe(1);

    // A changed completed outcome still refreshes facts and access immediately.
    transcript.messages.at(-1)!.revision++;
    worker.changed({ kind: "chat", applicationId: app, chatId: chat });
    await expect.poll(() => count("/access")).toBe(openingReads + 1);
    await expect.poll(() => count("&view=metadata")).toBe(2);
    expect(count("/traffic/collection")).toBe(openingReads);
  } finally {
    await page.goto("about:blank");
    await worker();
  }
});
