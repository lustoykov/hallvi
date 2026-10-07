import { openConversation } from "./workspace-helpers";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";
import { failureText, nativeFailure } from "../../src/server/pi-failure";

test.use({ scriptedWorker: true });

test("Pi text stays once in order through completion and reload @journey-streaming-output", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/transcript",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const chatId = created.selectedChatId as string;
  const now = new Date().toISOString();
  const body = "Now checking persistence.";
  // Pi's side of the conversation, as the worker would report it.
  let status: "running" | "completed" = "running";
  let said = false;
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(chatId, "Check persistence.", {
      body,
      status,
    });
    return {
      status: status === "running" ? "working" : "idle",
      messages,
      // Pi's own record of the call: what it was, and what came back.
      calls: {
        "read-package": {
          replyId,
          sequence: 1,
          tool: "read",
          args: { path: "package.json" },
          at: now,
          result: { text: "{}", failed: false, at: now },
        },
      },
      said: said ? [{ replyId, sequence: 2, text: body, at: now }] : [],
    };
  });
  const runId = "reply:asked";
  try {
    await page.goto(`/applications/${appId}`);
    await openConversation(page);
    const message = page.locator(`[id="hv-message-${runId}"]`);
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    // What the group line actually says. It counts and pluralises — "1 file
    // read" — and this asked for "File reads", so the one spec guarding the
    // transcript has been red on main rather than guarding anything.
    const group = message.getByRole("button", { name: /1 file read/ });
    await expect(group).toBeVisible();
    await group.click();
    await expect(
      message.getByText("package.json", { exact: true }),
    ).toBeVisible();
    const text = await message.innerText();
    expect(text.indexOf("package.json")).toBeLessThan(text.indexOf(body));
    said = true;
    closeWorker.changed({ kind: "chat", applicationId: appId, chatId });
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    status = "completed";
    closeWorker.changed({ kind: "chat", applicationId: appId, chatId });
    await page.reload();
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    await expect(group).toBeVisible();
    await page.screenshot({ path: "tests/results/pi-transcript-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(message.getByText(body, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: "tests/results/pi-transcript-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(
      page.getByText("Connect an application server to use Terminal."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Application server terminal" }),
    ).toHaveCount(0);
  } finally {
    await closeWorker();
  }
});

// The integration suite proves the native projection; this fixture checks its
// rendering and recovery control on the shipping page.
test("a native failure reason after a successful status read remains visible after refresh", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/diagnostic",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const chatId = created.selectedChatId as string;
  const failure = nativeFailure(
    "model",
    "HTTP 400 context window exceeded; password=fixture-private; response body {private-payload}",
    (text) => text,
  );
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(chatId, "Check application status", {
      body: "",
      status: "completed",
    });
    return {
      status: "idle",
      messages: messages.map((message) =>
        message.id === replyId
          ? {
              ...message,
              status: "failed",
              failure,
              error: failureText(failure),
            }
          : message,
      ),
      calls: {
        status: {
          replyId,
          sequence: 1,
          tool: "get_application_status",
          args: {},
          at: new Date().toISOString(),
          result: {
            text: "Application is connected",
            failed: false,
            at: new Date().toISOString(),
          },
        },
      },
      said: [],
    };
  });
  try {
    await page.goto(`/applications/${appId}`);
    await openConversation(page);
    const message = page.locator('[id="hv-message-reply:asked"]');
    await expect(
      message.getByText(/The model stopped: HTTP 400 context window exceeded/),
    ).toBeVisible();
    await expect(
      message.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    expect(await message.innerText()).not.toMatch(
      /fixture-private|private-payload|Settings|no command recorded why/,
    );
    await page.reload();
    await expect(
      message.getByText(/The model stopped: HTTP 400 context window exceeded/),
    ).toBeVisible();
    await page.screenshot({ path: "tests/results/native-failure-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      message.getByText(/The model stopped: HTTP 400 context window exceeded/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: "tests/results/native-failure-mobile.png" });
  } finally {
    await closeWorker();
  }
});
