import { openConversation } from "./workspace-helpers";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("a requested secret is supplied once through its masked field and stays out of page responses", async ({
  page,
  fixture,
}) => {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/secret-submission",
    },
  });
  expect(created.status()).toBe(201);
  const view = await created.json();
  const appId = view.application.id;
  const chatId = view.selectedChatId;
  const name = "AUDIT_ONLY_SECRET";
  const value = `fixture-only p a$s'"; echo \`x\` \\ ünï`;
  const closeWorker = await scriptWorker(fixture, () => ({
    status: "idle",
    messages: exchange(chatId, "Prepare this application", {
      body: "Supply the requested value through its field.",
      status: "completed",
    }).messages,
    calls: {},
    said: [],
  }));
  try {
    // The real tool's writer, in this fixture's own credential directory.
    // The model is scripted; the field, POST and credential store are real.
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { requestSecret } from './src/server/application-secrets.ts';
         requestSecret(process.argv[1], {
           name: process.argv[2], why: 'The fixture needs its credential.'
         });`,
        appId,
        name,
      ],
      {
        env: {
          ...process.env,
          HALLVI_CONFIG_DIR: fixture.state,
          HALLVI_PI_CONFIG_DIR: fixture.state,
        },
      },
    );
    const submissions: unknown[] = [];
    const returned: Promise<string>[] = [];
    const console: string[] = [];
    const endpoint = `/api/applications/${appId}/secrets`;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === endpoint
      )
        submissions.push(request.postDataJSON());
      expect(request.url()).not.toContain(encodeURIComponent(value));
    });
    page.on("response", (response) => {
      // Conversation EventSources stay open; inspect finite page/API responses.
      if (
        /json|html|text\/plain/.test(response.headers()["content-type"] ?? "")
      )
        returned.push(response.text().catch(() => ""));
    });
    page.on("console", (message) => console.push(message.text()));
    await page.goto(`/applications/${appId}`);
    await openConversation(page);
    const field = page.getByLabel(name, { exact: false });
    await expect(field).toHaveAttribute("type", "password");
    await field.fill(value);
    const accepted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === endpoint &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Give it", exact: true }).click();
    const response = await accepted;
    expect(response.status()).toBe(200);
    expect(submissions).toEqual([{ name, value }]);
    expect((await response.json()).secrets).toEqual([
      expect.objectContaining({ name, establishedAt: expect.any(String) }),
    ]);
    await expect(field).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Values supplied to Hallvi" }),
    ).toBeVisible();
    expect(await page.locator("html").innerHTML()).not.toContain(value);
    for (const body of await Promise.all(returned)) {
      expect(body).not.toContain(value);
      expect(body).not.toContain(JSON.stringify(value).slice(1, -1));
    }
    expect(submissions).toEqual([{ name, value }]);
    expect(console.join("\n")).not.toContain(value);
  } finally {
    await closeWorker();
  }
});
