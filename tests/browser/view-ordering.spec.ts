import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { openConversation } from "./workspace-helpers";
import type { OperatorView } from "../../src/server/types";

test("a delayed action view cannot replace a reply already completed by the stream", async ({
  page,
}) => {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/view-ordering",
    },
  });
  expect(created.ok()).toBe(true);
  const view = (await created.json()) as OperatorView;
  const applicationId = view.application!.id;
  const chatId = view.selectedChatId!;
  await page.goto(`/applications/${applicationId}?chat=${chatId}`);
  await openConversation(page);

  let captured!: (view: OperatorView) => void;
  const snapshot = new Promise<OperatorView>((resolve) => {
    captured = resolve;
  });
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint = `/api/applications/${applicationId}`;
  await page.route(`**${endpoint}?chat=${chatId}`, async (route) => {
    const response = await route.fetch();
    captured((await response.json()) as OperatorView);
    await released;
    await route.fulfill({ response });
  });
  const renamed = await page.request.patch(endpoint, {
    data: { name: "Refreshed application name" },
  });
  expect(renamed.ok()).toBe(true);
  const message = "Finish this reply [slow]";
  const composer = page.getByRole("textbox", { name: "Message Hallvi" });
  try {
    await composer.fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const older = await snapshot;
    expect(older.messages.at(-1)?.status).toBe("running");
    const reply = page.getByText(`[QA fixture reply] ${message}`, {
      exact: true,
    });
    await expect(reply).toBeVisible();
    await expect(page.locator(".hv-still-working")).toHaveCount(0);
    await composer.fill("A second question");
    const delivered = page.waitForResponse((response) =>
      response.url().endsWith(`${endpoint}?chat=${chatId}`),
    );
    release();
    await delivered;
    // Send becomes enabled after the held action finishes applying its view.
    // A stale running snapshot instead leaves "Send next" and a partial reply.
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeEnabled();
    await expect(reply).toBeVisible();
    await expect(page.locator(".hv-still-working")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Switch application: Refreshed application name",
        exact: true,
      }),
    ).toBeVisible();
    await page.unroute(`**${endpoint}?chat=${chatId}`);
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await expect(reply).toHaveCount(0);
    await composer.fill("A side conversation");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const sideReply = page.getByText("[QA fixture reply] A side conversation", {
      exact: true,
    });
    await expect(sideReply).toBeVisible();
    await expect(reply).toHaveCount(0);
    const mainTitle = view.chats.find((chat) => chat.id === chatId)!.title;
    await page
      .getByRole("navigation", { name: "Application workspace" })
      .getByRole("button", { name: mainTitle, exact: true })
      .click();
    await expect(reply).toBeVisible();
    await expect(sideReply).toHaveCount(0);
  } finally {
    release();
  }
});

test("a quiet disconnected stream does not hide a newer HTTP conversation view", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeEventSource = window.EventSource;
    const sources: EventSource[] = [];
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        sources.push(this);
      }
    };
    window.addEventListener("qa-close-streams", () => {
      sources.forEach((source) => source.close());
    });
  });
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/quiet-stream",
    },
  });
  expect(created.ok()).toBe(true);
  const view = (await created.json()) as OperatorView;
  const applicationId = view.application!.id;
  const chatId = view.selectedChatId!;
  const endpoint = `/api/applications/${applicationId}`;
  const messages = `${endpoint}/chats/${chatId}/messages`;
  await page.goto(`/applications/${applicationId}?chat=${chatId}`);
  await openConversation(page);
  const composer = page.getByRole("textbox", { name: "Message Hallvi" });
  await composer.fill("Establish the stream [slow]");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("[QA fixture reply] Establish the stream [slow]", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("qa-close-streams")),
  );
  // Return an actual later full view once Pi finishes. No stream frame can
  // advance during this request, so its previously cached reply cannot win.
  await page.route(`**${endpoint}?chat=${chatId}`, async (route) => {
    await expect
      .poll(async () => {
        const snapshot = await (await page.request.get(messages)).json();
        return snapshot.messages.at(-1)?.status;
      })
      .toBe("completed");
    await route.fulfill({ response: await route.fetch() });
  });
  await composer.fill("Keep the newer HTTP answer [slow]");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("[QA fixture reply] Keep the newer HTTP answer [slow]", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".hv-still-working")).toHaveCount(0);
});
