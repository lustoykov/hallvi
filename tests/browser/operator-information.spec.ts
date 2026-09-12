import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "./fixtures";

test("shared information cards survive refresh and appear in their selected views @journey-shared-information @smoke", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/shared-information",
    },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  const appId = result.application?.id ?? result.id;
  const database = new Database(join(fixture.state, "qa.db"));
  const chat = database
    .prepare(
      "SELECT id FROM conversations WHERE application_id = ? AND kind = 'main'",
    )
    .get(appId) as { id: string };
  const now = new Date().toISOString();
  const verified = randomUUID();
  const failed = randomUUID();
  for (const [id, title, status, body] of [
    [
      verified,
      "Application verified",
      "verified",
      "The application responded successfully.",
    ],
    [
      failed,
      "Earlier check failed",
      "failed",
      "The application did not respond during this check.",
    ],
  ]) {
    database
      .prepare(
        "INSERT INTO saved_information (id, application_id, title, body, evidence, established_at, presentation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        appId,
        title,
        body,
        "[]",
        now,
        JSON.stringify({
          views: ["overview", "deployment"],
          role: "outcome",
          status,
          checks: [
            {
              label: "Public HTTP check",
              status: status === "verified" ? "passed" : "failed",
            },
          ],
          ...(status === "failed"
            ? { nextStep: "Inspect application logs." }
            : { url: "https://example.com" }),
        }),
        now,
        now,
      );
  }
  database
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, body, source, blocks, created_at, updated_at) VALUES (?, ?, 'assistant', ?, 'pi', ?, ?, ?)",
    )
    .run(
      randomUUID(),
      chat.id,
      "Here are the recorded outcomes.",
      JSON.stringify([
        { type: "saved-information", id: verified },
        { type: "saved-information", id: failed },
      ]),
      now,
      now,
    );
  database.close();
  await page.goto(`/applications/${appId}`);
  await expect(page.locator(".sg-chat-pane .sg-information-card")).toHaveCount(
    2,
  );
  await expect(
    page.getByRole("link", { name: "Open application ↗" }),
  ).toHaveAttribute("href", "https://example.com");
  await page.reload();
  await expect(page.locator(".sg-chat-pane .sg-information-card")).toHaveCount(
    2,
  );
  await page.screenshot({
    path: "tests/results/operator-information-chat.png",
    fullPage: true,
  });
  await page
    .locator(".sg-chat-pane")
    .getByRole("button", { name: "Open Deployment →" })
    .first()
    .click();
  await expect(
    page.locator(".sg-section-deployment .sg-information-card"),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.locator(".sg-section-deployment .sg-information-card"),
  ).toHaveCount(2);
  await page.screenshot({
    path: "tests/results/operator-information-deployment.png",
    fullPage: true,
  });
});
