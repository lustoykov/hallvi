// "Pi is still working in this conversation."
//
// The owner read a finished-looking answer, typed the next thing, and met
// that sentence as a red bar under the composer. The guard was right — a
// backup request Hallvi had started for itself was genuinely running —
// but the conversation never said so anywhere the typing happens, and the
// answer they had just read said nothing about it either.
//
// So: the state has to be legible before it is enforced, it has to say what
// is actually running rather than "Working", and it has to clear the moment
// the turn is done, across a reload.

import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExecutionRecord } from "../../src/server/operator-execution";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";
import {
  exchange,
  scriptedAt,
  scriptWorker,
  seedToolCall,
} from "./scripted-worker";

// The page is what is under test; Pi's side of the conversation is scripted.
test.use({ scriptedWorker: true });

const earlier = (chatId: string) =>
  Array.from({ length: 24 }, (_, index) => ({
    id: `earlier-${index}`,
    chatId,
    role: "assistant" as const,
    body: `Earlier step ${index + 1}.`,
    source: "pi" as const,
    status: "completed" as const,
    createdAt: scriptedAt,
    revision: 0,
  }));

test(
  "a turn in flight says what it is doing, and lets go when it finishes",
  journey("still-working"),
  async ({ page, fixture }) => {
    test.setTimeout(120_000);
    const created = await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: "https://github.com/qa/still-working",
      },
    });
    expect(created.ok()).toBe(true);
    const result = await created.json();
    const appId = result.application?.id ?? result.id;
    const chat = { id: result.selectedChatId as string };
    // Enough transcript above it that the running turn can leave the screen,
    // which is the only situation the composer line exists for.
    const executionId = randomUUID();
    let finished = false;
    const startedAt = new Date(Date.now() - 200_000).toISOString();
    const closeWorker = await scriptWorker(fixture, () => {
      const { replyId, messages } = exchange(chat.id, "Take a backup now.", {
        body: finished ? "The backup finished." : "",
        status: finished ? "completed" : "running",
        startedAt,
      });
      return {
        status: finished ? "idle" : "working",
        messages: [...earlier(chat.id), ...messages],
        calls: { "backup-call": { replyId, sequence: 1 } },
        said: [],
      };
    });
    const runId = "reply:asked";
    seedToolCall(fixture, {
      applicationId: appId,
      chatId: chat.id,
      toolCallId: "backup-call",
      tool: "server_bash",
      executionId,
    });

    const directory = join(fixture.state, "operator", appId, "executions");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${executionId}.json`);
    let record: ExecutionRecord = {
      id: executionId,
      applicationId: appId,
      chatId: chat.id,
      runId: chat.id,
      toolCallId: "backup-call",
      tool: "server_bash",
      target: "root@backup-host:22",
      input: JSON.stringify({ command: "restic backup /srv/data" }),
      mode: "pi-decides",
      status: "running",
      output: "scanning /srv/data",
      createdAt: new Date(Date.now() - 150_000).toISOString(),
      outputAt: new Date(Date.now() - 90_000).toISOString(),
    };
    function update(next: Partial<ExecutionRecord>) {
      record = { ...record, ...next };
      writeFileSync(`${path}.tmp`, JSON.stringify(record));
      renameSync(`${path}.tmp`, path);
    }
    update({});

    await page.goto(`/applications/${appId}`);

    // The reply itself says which machine, and that the command has gone
    // quiet, rather than "Working for 2m 30s" over a command that may be
    // wedged. One line, at the end of the turn it belongs to.
    const line = page.locator(`[id="hv-message-${runId}"] .hv-still-working`);
    await expect(line).toContainText("Running a command on the server");
    await expect(line).toContainText("quiet for");
    await expect(page.locator(".hv-still-working")).toHaveCount(1);
    await page.screenshot({ path: "tests/results/still-working-desktop.png" });

    // Stop is where Send is while nothing is typed, and Send next comes back
    // with the first character so a follow-up can still be queued.
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeVisible();
    await composer.fill("And then");
    await expect(stop).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send next", exact: true }),
    ).toBeVisible();
    await composer.fill("");

    // A decision nobody has made is not the turn working. It outranks
    // everything else and says who it is waiting on.
    update({ status: "awaiting-approval" });
    await expect(line).toContainText("Waiting for you to approve a command");

    // The turn finishes.
    update({
      status: "succeeded",
      exitCode: 0,
      output: "snapshot 9f2a saved",
      finishedAt: new Date().toISOString(),
    });
    finished = true;

    await expect(page.locator(".hv-still-working")).toHaveCount(0);
    await expect(stop).toHaveCount(0);

    // And it is still true after a reload, not just in this render.
    await page.reload();
    await expect(page.locator(".hv-still-working")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeVisible();
    await closeWorker();
  },
);

test(
  "an outstanding secret request is reachable once it scrolls away",
  journey("still-working"),
  async ({ page, fixture }) => {
    // The chip above the composer watches the request in the transcript and
    // appears only while it is out of sight. It had no browser coverage at
    // all, so this is also the first proof that it does what its comment says.
    const created = await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: "https://github.com/qa/secret-chip",
      },
    });
    const result = await created.json();
    const appId = result.application?.id ?? result.id;
    const chatId = result.selectedChatId as string;
    const now = new Date().toISOString();
    const closeWorker = await scriptWorker(fixture, () => ({
      status: "idle",
      messages: earlier(chatId),
      calls: {},
      said: [],
    }));

    // Only Pi can ask for a secret, so the store is seeded the way the
    // controller writes it.
    mkdirSync(join(fixture.state, "secrets"), { recursive: true });
    writeFileSync(
      join(fixture.state, "secrets", `${appId}.json`),
      JSON.stringify([
        {
          name: "GF_SECURITY_ADMIN_PASSWORD",
          why: "Grafana needs an admin password before it will start.",
          process: "grafana",
          requestedAt: now,
          establishedAt: null,
          origin: "owner",
          revision: 0,
          sealed: null,
        },
      ]),
    );

    await page.goto(`/applications/${appId}`);
    const chip = page.locator(".hv-secrets-chip");
    const request = page.getByText("GF_SECURITY_ADMIN_PASSWORD").first();
    await expect(request).toBeVisible();
    // In view, so the chip stays out of the way.
    await expect(chip).toHaveCount(0);

    await page
      .getByText("Earlier step 1.", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(request).toBeInViewport();
    await closeWorker();
  },
);
