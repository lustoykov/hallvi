import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SavedInformation } from "../../src/server/operator-data";
import type { ExecutionRecord } from "../../src/server/operator-execution";
import type { Transcript } from "../../src/server/pi-transcript";
import { accessRouteIdentity } from "../../src/server/access-record";
import { reconnectReference } from "../../src/components/hallvi/reconnect-request";
import { test, expect } from "./fixtures";
import { scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("Reconnect uses Main operator, keeps drafts, and exposes queue, decision and Open after refresh", async ({
  page,
  fixture,
}) => {
  const created = await (
    await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: "https://github.com/qa/reconnect-notes",
      },
    })
  ).json();
  const appId = created.application.id;
  const mainId = created.selectedChatId;
  const side = await (
    await page.request.post(`/api/applications/${appId}/chats`, {
      data: { title: "Explain" },
    })
  ).json();
  const sideId = side.selectedChatId;
  const database = new Database(join(fixture.state, "qa.db"));
  const now = new Date().toISOString();
  const record: SavedInformation = {
    id: randomUUID(),
    applicationId: appId,
    title: "Private connection",
    body: "The saved route is on this controller.",
    evidence: [],
    establishedAt: now,
    createdAt: now,
    updatedAt: now,
    retiredAt: null,
    presentation: {
      views: ["overview", "deployment", "access"],
      role: "status",
      status: "verified",
      checks: [],
      url: "http://127.0.0.1:18000",
      content: {
        kind: "application-access",
        mode: "private",
        server: "192.0.2.1",
        localPort: 18000,
        remotePort: 8080,
      },
    },
  } as SavedInformation;
  database
    .prepare(
      "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      record.id,
      appId,
      record.title,
      record.body,
      "[]",
      now,
      JSON.stringify(record.presentation),
      now,
      now,
    );
  const deployment = {
    ...record,
    id: randomUUID(),
    title: "Private Notes deployed",
    presentation: {
      views: ["overview", "deployment"],
      role: "outcome",
      status: "verified",
      checks: [],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/reconnect-notes",
        revision: "abcdef0123456789",
        image: "private-notes:fixture",
        server: "192.0.2.1",
        changes: [],
      },
    },
  };
  database
    .prepare(
      "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      deployment.id,
      appId,
      deployment.title,
      record.body,
      "[]",
      now,
      JSON.stringify(deployment.presentation),
      now,
      now,
    );
  database
    .prepare("UPDATE applications SET name=? WHERE id=?")
    .run("Private Notes", appId);
  let open = false;
  await page.route(`**/api/applications/${appId}/access`, (route) =>
    route.fulfill({
      json: {
        mode: "private",
        routeIdentity: accessRouteIdentity(record),
        open,
        reconnectable: true,
        server: "answering",
      },
    }),
  );
  await page.route(`**/api/applications/${appId}/traffic`, (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"type":"state","state":"no-server"}\n\n',
    }),
  );
  let transcript: Transcript = {
    status: "idle",
    messages: [],
    calls: {},
    said: [],
  };
  const sends: {
    scope: { chatId: string };
    message: { id: string; body: string };
  }[] = [];
  const worker = await scriptWorker(
    fixture,
    () => transcript,
    (body) => {
      sends.push(body);
      transcript = {
        ...transcript,
        status: "working",
        messages: [
          {
            id: body.message.id,
            requestKey: body.message.id,
            chatId: mainId,
            role: "user",
            body: body.message.body,
            source: "user",
            status: "waiting",
            createdAt: now,
            revision: 0,
          },
        ],
      };
    },
  );
  const capture = process.env.HALLVI_RECONNECT_CAPTURE;
  async function screenshots(state: string) {
    if (!capture) return;
    const dir = join("work/private-access/reconnect-evidence", capture);
    mkdirSync(dir, { recursive: true });
    for (const [device, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["narrow", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.screenshot({
        path: join(dir, `${state}-${device}.png`),
        animations: "disabled",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  try {
    await page.goto(`/applications/${appId}?chat=${mainId}`);
    await page.locator("#pi-composer").fill("My main draft");
    await page.goto(`/applications/${appId}?chat=${sideId}`);
    await page.locator("#pi-composer").fill("My side draft");
    await page.goto(`/applications/${appId}?chat=${sideId}#overview`);
    const action = page.locator(".axj3-head").getByRole("button", {
      name: capture === "baseline" ? "Open the connection again" : "Reconnect",
      exact: true,
    });
    await expect(action).toBeVisible();
    await screenshots("closed");
    if (capture === "baseline") {
      await action.click();
      await expect(page.locator("#pi-composer")).toBeVisible();
      await screenshots("after-click");
      return;
    }
    await action.dblclick();
    await expect.poll(() => sends.length).toBe(1);
    expect(sends[0].scope.chatId).toBe(mainId);
    expect(reconnectReference(sends[0].message.body)).toEqual({
      accessRecordId: record.id,
      expectedUpdatedAt: record.updatedAt,
    });
    await expect(page.locator(".hv-reconnect-notice")).toContainText("queued");
    await expect(action).toBeDisabled();
    await screenshots("after-click");
    await page.goto(`/applications/${appId}?chat=${sideId}#overview`);
    await expect(page.locator(".hv-reconnect-notice")).toContainText("queued");
    await expect(action).toBeDisabled();
    await page.reload();
    await expect(page.locator(".hv-reconnect-notice")).toContainText("queued");
    await expect(action).toBeDisabled();
    expect(sends).toHaveLength(1);
    const replyId = `reply:${sends[0].message.id}`;
    transcript.messages[0].status = "delivered";
    transcript.messages.push({
      id: replyId,
      chatId: mainId,
      role: "assistant",
      source: "pi",
      status: "running",
      body: "",
      createdAt: now,
      startedAt: now,
      responseTo: sends[0].message.id,
      revision: 0,
    });
    transcript.calls = {
      reconnect: {
        replyId,
        sequence: 0,
        tool: "open_server_port",
        args: reconnectReference(sends[0].message.body),
        at: now,
      },
    };
    const evidence: ExecutionRecord = {
      id: randomUUID(),
      applicationId: appId,
      chatId: mainId,
      runId: mainId,
      toolCallId: "reconnect",
      tool: "open_server_port",
      target: "Reconnect http://127.0.0.1:18000 through root@192.0.2.1:22",
      input: JSON.stringify({
        accessRecordId: record.id,
        expectedUpdatedAt: record.updatedAt,
        remotePort: 8080,
        localPort: 18000,
      }),
      mode: "always-ask",
      status: "awaiting-approval",
      output: "",
      createdAt: now,
    };
    const dir = join(fixture.state, "operator", appId, "executions");
    mkdirSync(dir, { recursive: true });
    const save = () =>
      writeFileSync(join(dir, `${evidence.id}.json`), JSON.stringify(evidence));
    save();
    worker.changed({ kind: "execution", applicationId: appId });
    await expect(page.locator(".hv-reconnect-notice")).toContainText(
      "awaiting approval",
    );
    await page.reload();
    await expect(page.locator(".hv-reconnect-notice")).toContainText(
      "awaiting approval",
    );
    await expect(action).toBeDisabled();
    await expect(
      page
        .locator(".hv-reconnect-notice")
        .getByRole("button", { name: "Main operator" }),
    ).toBeVisible();
    await screenshots("approval");
    await page
      .locator(".hv-reconnect-notice")
      .getByRole("button", { name: "Main operator" })
      .click();
    await expect(page.locator("#pi-composer")).toHaveValue("My main draft");
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    evidence.status = "succeeded";
    evidence.finishedAt = new Date().toISOString();
    evidence.output = JSON.stringify({
      httpStatus: 200,
      accessRecordId: record.id,
      url: record.presentation!.url,
      checkedAt: evidence.finishedAt,
    });
    save();
    transcript.status = "idle";
    transcript.messages[1].status = "completed";
    transcript.messages[1].finishedAt = evidence.finishedAt;
    transcript.messages[1].body =
      "The controller received HTTP 200 at the saved URL. This does not verify application health.";
    transcript.calls.reconnect.result = {
      text: evidence.output,
      failed: false,
      at: evidence.finishedAt,
    };
    open = true;
    worker.changed({ kind: "execution", applicationId: appId });
    await page.goto(`/applications/${appId}?chat=${mainId}#overview`);
    await expect(
      page.getByRole("link", { name: "Open Private Notes" }),
    ).toHaveAttribute("href", record.presentation!.url!);
    await expect(page.locator(".hv-reconnect-notice")).toContainText(
      "Controller HTTP 200",
    );
    await screenshots("result-open");
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Open Private Notes" }),
    ).toBeVisible();
    await page.goto(`/applications/${appId}?chat=${sideId}`);
    await expect(page.locator("#pi-composer")).toHaveValue("My side draft");
    for (const [status, phrase] of [
      ["failed", "could not open"],
      ["declined", "was declined"],
      ["interrupted", "was interrupted"],
    ] as const) {
      open = false;
      evidence.status = status;
      evidence.output = status === "failed" ? "Address already in use" : "";
      save();
      transcript.messages[1].status =
        status === "declined" ? "completed" : status;
      transcript.calls.reconnect.result = {
        text: evidence.output,
        failed: status === "failed",
        at: evidence.finishedAt!,
      };
      transcript.status = status === "interrupted" ? "interrupted" : "idle";
      worker.changed({ kind: "execution", applicationId: appId });
      await page.goto(`/applications/${appId}?chat=${sideId}#overview`);
      await expect(page.locator(".hv-reconnect-notice")).toContainText(phrase);
      await screenshots(status);
      await page.reload();
      await expect(page.locator(".hv-reconnect-notice")).toContainText(phrase);
      expect(sends).toHaveLength(1);
    }
    await worker();
    open = false;
    await page.goto(`/applications/${appId}?chat=${mainId}#overview`);
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.locator(".hv-reconnect-notice")).toContainText(
      "Pi is unavailable",
    );
    await screenshots("worker-unavailable");
    await page
      .locator(".hv-reconnect-notice")
      .getByRole("button", { name: "Main operator" })
      .click();
    await expect(page.locator("#pi-composer")).toHaveValue("My main draft");
    expect(sends).toHaveLength(1);
  } finally {
    if (worker.subscribers()) await worker();
    database.close();
  }
});

test("unknown acceptance survives refresh and retries the same key without populating an empty composer", async ({
  page,
  fixture,
}) => {
  const created = await (
    await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: "https://github.com/qa/reconnect-unknown",
      },
    })
  ).json();
  const appId = created.application.id;
  const mainId = created.selectedChatId;
  const database = new Database(join(fixture.state, "qa.db"));
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    applicationId: appId,
    title: "Private connection",
    body: "Saved route",
    evidence: [],
    establishedAt: now,
    createdAt: now,
    updatedAt: now,
    retiredAt: null,
    presentation: {
      views: ["access"],
      role: "status",
      status: "verified",
      checks: [],
      url: "http://127.0.0.1:18000",
      content: {
        kind: "application-access",
        mode: "private",
        server: "192.0.2.1",
        localPort: 18000,
        remotePort: 8080,
      },
    },
  } as SavedInformation;
  database
    .prepare(
      "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      record.id,
      appId,
      record.title,
      record.body,
      "[]",
      now,
      JSON.stringify(record.presentation),
      now,
      now,
    );
  await page.route(`**/api/applications/${appId}/access`, (route) =>
    route.fulfill({
      json: {
        mode: "private",
        routeIdentity: accessRouteIdentity(record),
        open: false,
        reconnectable: true,
        server: "answering",
      },
    }),
  );
  let transcript: Transcript = {
    status: "idle",
    messages: [],
    calls: {},
    said: [],
  };
  let accepted = 0;
  const worker = await scriptWorker(
    fixture,
    () => transcript,
    (body) => {
      accepted++;
      transcript = {
        ...transcript,
        status: "working",
        messages: [
          {
            id: body.message.id,
            requestKey: body.message.id,
            chatId: mainId,
            role: "user",
            body: body.message.body,
            source: "user",
            status: "waiting",
            createdAt: now,
            revision: 0,
          },
        ],
      };
    },
  );
  const attempts: { requestKey: string; message: string }[] = [];
  let lost = true;
  await page.route(
    `**/api/applications/${appId}/chats/${mainId}/messages`,
    (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push(route.request().postDataJSON());
      return lost ? route.abort("failed") : route.continue();
    },
  );
  try {
    await page.goto(`/applications/${appId}#access`);
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.locator(".hv-reconnect-notice")).toContainText(
      "acceptance is unknown",
    );
    expect(attempts).toHaveLength(1);
    expect(accepted).toBe(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry Reconnect", exact: true }),
    ).toBeVisible();
    expect(attempts).toHaveLength(1);
    lost = false;
    await page
      .getByRole("button", { name: "Retry Reconnect", exact: true })
      .dblclick();
    await expect.poll(() => accepted).toBe(1);
    await expect(page.locator(".hv-reconnect-notice")).toContainText("queued");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toMatchObject({
      requestKey: attempts[0].requestKey,
      message: attempts[0].message,
    });
    await page
      .locator(".hv-reconnect-notice")
      .getByRole("button", { name: "Main operator" })
      .click();
    await expect(page.locator("#pi-composer")).toHaveValue("");
    await page.reload();
    await expect(page.locator("#pi-composer")).toHaveValue("");
    expect(accepted).toBe(1);
  } finally {
    await worker();
    database.close();
  }
});
