import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "./fixtures";

// The real worker process is killed outright while Pi is answering and holds a
// follow-up, and a new worker is started: the contract a restart must keep.
// It gets an app of its own, because no other journey should lose its worker.
test.use({ isolatedApp: true });

test("without a worker nothing is accepted; after a restart nothing runs until the owner continues", async ({
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
  const messages = async () =>
    (
      (await (
        await page.request.get(
          `/api/applications/${view.application.id}/chats/${view.selectedChatId}/messages`,
        )
      ).json()) as {
        messages: { role: string; status: string; body: string }[];
      }
    ).messages
      .slice(1)
      .map((m) => `${m.role} ${m.status}`);
  let next: ChildProcess | undefined;
  try {
    await page.goto(`/applications/${view.application.id}`);
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    await composer.fill("Inspect the application [hold]");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".hv-still-working")).toBeVisible({
      timeout: 30_000,
    });
    await composer.fill("Then explain the result.");
    await page.getByRole("button", { name: "Send next", exact: true }).click();
    await expect(
      page.getByText("Pi reads this when its current work is done."),
    ).toBeVisible();

    process.kill(hand.pid, "SIGKILL");
    await expect(page.getByText("No worker is running")).toBeVisible({
      timeout: 30_000,
    });
    // Nothing is accepted without the worker, and what was typed is kept.
    await composer.fill("Is anybody there?");
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect(
      page.getByText("worker is not running", { exact: false }).first(),
    ).toBeVisible();
    await expect(composer).toHaveValue("Is anybody there?");
    await composer.fill("");

    next = spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
      cwd: hand.app,
      env: { ...process.env, ...hand.env },
      stdio: "ignore",
    });
    await expect(
      page.getByText("This conversation was interrupted"),
    ).toBeVisible({ timeout: 60_000 });
    // The worker is back and nothing runs: history is there, the reply says
    // what is not known, and the follow-up is still Pi's, unread.
    await page.waitForTimeout(4_000);
    expect(await messages()).toEqual([
      "user delivered",
      "assistant interrupted",
      "user waiting",
    ]);
    expect(
      (await messages()).filter((each) => each.includes("Is anybody")),
    ).toEqual([]);
    await expect(
      page.getByText("Whether the last command finished is not known", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Pi holds this and has not read it.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop", exact: true }),
    ).toBeVisible();
    // A new question cannot slip in ahead of that choice.
    await composer.fill("What time is it?");
    await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();
    await composer.fill("");
    await page.screenshot({
      path: testInfo.outputPath("after-worker-restart.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText("[QA fixture reply] Then explain the result.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 120_000 });
    expect(await messages()).toEqual([
      "user delivered",
      "assistant completed",
      "user delivered",
      "assistant completed",
    ]);
    await page.screenshot({
      path: testInfo.outputPath("after-continue.png"),
      fullPage: true,
    });
  } finally {
    next?.kill("SIGTERM");
  }
});
