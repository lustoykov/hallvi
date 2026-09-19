import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionRecord } from "../../src/server/operator-execution";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("server output streams inline, preserves reading position and stays readable on completion @journey-streaming-output", async ({
  page,
  fixture,
}) => {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/streaming-output",
    },
  });
  expect(created.ok()).toBe(true);
  const result = await created.json();
  const appId = result.application?.id ?? result.id;
  const chat = { id: result.selectedChatId as string };
  const now = new Date().toISOString();
  const executionId = randomUUID();
  // Pi's side: a reply in progress whose one call is the server command.
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(
      chat.id,
      "Show the command output.",
      { body: "Here is the command running on the server.", status: "running" },
    );
    return {
      status: "working",
      messages,
      calls: {
        "call-1": {
          replyId,
          sequence: 1,
          tool: "server_bash",
          args: {},
          at: new Date().toISOString(),
        },
      },
      said: [],
    };
  });
  const runId = chat.id;
  const directory = join(fixture.state, "operator", appId, "executions");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${executionId}.json`);
  let record: ExecutionRecord = {
    id: executionId,
    applicationId: appId,
    chatId: chat.id,
    runId,
    toolCallId: "call-1",
    tool: "server_bash",
    target: "root@fixture-server:22",
    input: JSON.stringify({
      command: "docker compose up -d",
      timeoutSeconds: 120,
    }),
    mode: "pi-decides",
    status: "running",
    output: "",
    createdAt: now,
  };
  function update(next: Partial<ExecutionRecord>) {
    record = { ...record, ...next };
    writeFileSync(`${path}.tmp`, JSON.stringify(record));
    renameSync(`${path}.tmp`, path);
  }
  try {
    // A command earns a card once there is output to watch.
    update({ output: "Pulling images" });
    await page.goto(`/applications/${appId}`);
    const card = page.locator(`#execution-${executionId}`);
    const output = card.getByRole("region", { name: "Command output" });
    await expect(output).toContainText("Pulling images");
    // What ran is a caption above the output, not a second scrolling pane.
    // Two clipped panes in one dark box read as two terminals running two
    // things, which is the single most confusing thing on this screen.
    // Which machine, said as a machine. "on your server" was printed over
    // every shell command whatever it touched.
    await expect(card.locator(".hv-execution-where")).toContainText(
      "On the server · fixture-server",
    );
    await expect(card.locator(".hv-execution-where")).toHaveAttribute(
      "title",
      "root@fixture-server:22",
    );
    const ran = card.locator(".hv-stream-ran code");
    await expect(ran).toHaveText("docker compose up -d");
    expect(
      await card.locator(".hv-stream-terminal pre").count(),
      "one command, one output pane",
    ).toBe(1);
    // This payload carries a timeoutSeconds beside the command, so there is
    // something behind the disclosure — but one line of script, so it must
    // not be advertised as two.
    const full = card.getByRole("button", {
      name: "Full command",
      exact: true,
    });
    await expect(full).toBeVisible();
    await full.click();
    await expect(card.getByLabel("Full command")).toContainText(
      "timeoutSeconds: 120",
    );
    await card.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(card.getByLabel("Full command")).toHaveCount(0);
    const lines = Array.from(
      { length: 60 },
      (_, i) => `Building layer ${i + 1}/60`,
    ).join("\n");
    update({ output: lines });
    await expect(output).toContainText("Building layer 60/60");
    await expect
      .poll(() =>
        output.evaluate(
          (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
        ),
      )
      .toBeLessThan(2);
    await output.evaluate((el) => (el.scrollTop = 80));
    await expect(
      card.getByRole("button", { name: "Follow latest", exact: true }),
    ).toBeVisible();
    update({ output: lines + "\nStarting web container…" });
    await expect(output).toContainText("Starting web container");
    await expect.poll(() => output.evaluate((el) => el.scrollTop)).toBe(80);
    await card
      .getByRole("button", { name: "Follow latest", exact: true })
      .click();
    await expect
      .poll(() =>
        output.evaluate(
          (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
        ),
      )
      .toBeLessThan(2);
    await page.screenshot({
      path: "tests/results/streaming-output-desktop.png",
    });
    update({
      status: "succeeded",
      exitCode: 0,
      finishedAt: new Date().toISOString(),
      output: record.output + "\nContainer web started.",
    });
    await expect(card.getByText("Completed", { exact: true })).toBeVisible();
    await expect(card.getByText("exit 0", { exact: true })).toBeVisible();
    await expect(output).toBeVisible();
    await expect(output).toContainText("Container web started.");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await card.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(card).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "Container web started.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "tests/results/streaming-output-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await card.locator("summary").click();
    await expect(output).not.toBeVisible();
    // A failure is shown on the same card, with the command's own words.
    update({
      status: "failed",
      exitCode: 3,
      output: JSON.stringify({ output: "missing service", exitCode: 3 }),
    });
    await card.locator("summary").click();
    await expect(card.getByText("Failed", { exact: true })).toBeVisible();
    await expect(card.getByText("exit 3", { exact: true })).toBeVisible();
    await expect(output).toHaveText("missing service");
    // After a reload the finished call is folded into the reply's transcript,
    // at the place Pi made it.
    await page.reload();
    await expect(page.getByRole("button", { name: /1 command/ })).toBeVisible();
  } finally {
    await closeWorker();
  }
});
