import Database from "better-sqlite3";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

// The real worker process is killed outright while Pi is answering and holds a
// follow-up, and a new worker is started: the contract a restart must keep.
// It gets an app of its own, because no other journey should lose its worker.
test.use({ isolatedApp: true });

test("a killed worker runs nothing when it comes back, and the owner's next message resumes what Pi held", async ({
  page,
  fixture,
}, testInfo) => {
  test.setTimeout(240_000);
  const hand = JSON.parse(
    readFileSync(join(dirname(fixture.state), "worker.json"), "utf8"),
  ) as { pid: number; app: string; env: Record<string, string> };
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/restart-journey",
    },
  });
  const view = await created.json();
  const chatId = view.selectedChatId;
  const db = new Database(join(fixture.state, "qa.db"));
  const rows = () =>
    db
      .prepare(
        "SELECT role, status, body, native_entry_id AS entry FROM messages WHERE conversation_id = ? AND source != 'hallvi' ORDER BY status = 'waiting', coalesce(started_at, finished_at, created_at), rowid",
      )
      .all(chatId) as Array<{
      role: string;
      status: string;
      body: string;
      entry: string | null;
    }>;
  let next: ChildProcess | undefined;
  try {
    await page.goto(`/applications/${view.application.id}`);
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    await composer.fill("Inspect the application [hold]");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".hv-still-working")).toBeVisible();
    await composer.fill("Then explain the result.");
    await page.getByRole("button", { name: "Send next", exact: true }).click();
    // Pi has taken the follow-up and named it.
    await expect
      .poll(() => rows().find((row) => row.status === "waiting")?.entry)
      .toBeTruthy();
    const heldAs = rows().find((row) => row.status === "waiting")!.entry;

    process.kill(hand.pid, "SIGKILL");
    await expect(
      page.getByText("The worker stopped", { exact: false }).first(),
    ).toBeVisible({ timeout: 30_000 });

    next = spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
      cwd: hand.app,
      env: { ...process.env, ...hand.env },
      stdio: "ignore",
    });
    await expect(
      page.getByText("Whether the last command finished is not known", {
        exact: false,
      }),
    ).toBeVisible({ timeout: 60_000 });
    // The worker is back and nothing runs: the reply stays interrupted with
    // its draft, and the follow-up is still Pi's, under the same id, unread.
    await page.waitForTimeout(4_000);
    expect(rows().map((row) => `${row.role} ${row.status}`)).toEqual([
      "user delivered",
      "assistant interrupted",
      "user waiting",
    ]);
    expect(rows()[2].entry).toBe(heldAs);
    expect(rows()[1].body).toContain("[QA fixture reply]");
    await expect(
      page.getByText("Pi holds this and has not read it.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Pi holds this and has not read it.", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("after-worker-restart.png"),
      fullPage: true,
    });

    // The owner continues. What Pi held runs first, once, then this message.
    await composer.fill("Carry on.");
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect(
      page.getByText("[QA fixture reply] Carry on.", { exact: true }),
    ).toBeVisible({ timeout: 120_000 });
    const after = rows();
    expect(
      after.filter((row) => row.body === "Then explain the result."),
    ).toHaveLength(1);
    expect(after.map((row) => row.status)).not.toContain("waiting");
    expect(
      after.filter((row) => row.role === "user").map((row) => row.body),
    ).toEqual([
      "Inspect the application [hold]",
      "Then explain the result.",
      "Carry on.",
    ]);
    await page.screenshot({
      path: testInfo.outputPath("after-continue.png"),
      fullPage: true,
    });
  } finally {
    next?.kill("SIGTERM");
    db.close();
  }
});
