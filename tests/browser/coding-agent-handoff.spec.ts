import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("a saved Markdown problem packet is copied whole and survives refresh @journey-handoff", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/handoff",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const database = new Database(join(fixture.state, "qa.db"));
  const { id: chatId } = database
    .prepare(
      "SELECT id FROM conversations WHERE application_id=? AND kind='main'",
    )
    .get(appId) as { id: string };
  const id = randomUUID();
  const now = new Date().toISOString();
  const packet = [
    "## Shop: accepted orders have no receipt",
    "**Application:** Shop, https://github.com/qa/handoff\n**Running revision:** unknown; these are supplied fixture observations, not a live host check.",
    "### Reproduction\nStart the web and worker processes with the same receipt directory. Create a new order with item pear; note the returned order ID, then request that order's receipt.",
    "### Expected / actual\nExpected: the worker prices it at 400 cents and returns a 4.00 EUR receipt. Reported actual: POST accepts the order, but the receipt stays absent.",
    "### Evidence and attempts\nSynthetic worker log supplied by the owner: ValueError: cannot price order; password={{secret:DATABASE_PASSWORD}}.\nNo server commands or repairs were attempted. No running commit or image was observed.",
    "### Hypothesis\nThe worker's pricing path may fail before writing the receipt. The cause is unverified.",
    "### Acceptance check\nAfter the code repair, create a new pear order and retrieve that exact order's receipt containing 4.00 EUR. A health response or old receipt does not establish this result. Verify the running revision separately.",
  ].join("\n\n");
  database
    .prepare(
      "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      appId,
      "Accepted orders have no receipt",
      packet,
      "[]",
      null,
      JSON.stringify({
        views: ["history"],
        role: "outcome",
        status: "info",
        checks: [],
      }),
      now,
      now,
    );
  let closeWorker: (() => Promise<unknown>) | undefined;
  try {
    closeWorker = await scriptWorker(fixture, () => {
      const { replyId, messages } = exchange(
        chatId,
        "Prepare a coding-agent handoff from these synthetic observations.",
        { body: packet, status: "completed" },
      );
      return {
        status: "idle",
        messages,
        said: [],
        calls: {
          "save-packet": {
            replyId,
            sequence: 1,
            tool: "save_information",
            args: {},
            at: now,
            informationId: id,
          },
        },
      };
    });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/applications/" + appId);
    const record = page.locator('[data-information-id="' + id + '"]');
    await expect(record).toContainText("Running revision:");
    await expect(record).toContainText(
      "No server commands or repairs were attempted.",
    );
    await page.getByRole("button", { name: "Copy reply", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(packet);
    await page.reload();
    await expect(record).toContainText("Acceptance check");
    await page.getByRole("button", { name: "Copy reply", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(packet);
    const persisted = database
      .prepare("SELECT body FROM saved_information WHERE id=?")
      .get(id) as { body: string };
    expect(persisted.body).toBe(packet);
    await page.screenshot({
      path: "tests/results/handoff-packet-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "tests/results/handoff-packet-mobile.png",
      fullPage: true,
    });
  } finally {
    database.close();
    await closeWorker?.();
  }
});
