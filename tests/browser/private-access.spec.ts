import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { accessRouteIdentity } from "../../src/server/access-record";
import type { SavedInformation } from "../../src/server/operator-data";
import type { Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

test("private route observations stay with their route, survive refresh and lose current status when Hallvi is unavailable", async ({
  page,
  fixture,
}) => {
  const created = await (
    await page.request.post("/api/applications", {
      data: {
        requestKey: randomUUID(),
        repositoryUrl: "https://github.com/qa/private-notes",
      },
    })
  ).json();
  const appId = created.application.id;
  const database = new Database(join(fixture.state, "qa.db"));
  const { id: chatId } = database
    .prepare(
      "SELECT id FROM conversations WHERE application_id=? AND kind='main'",
    )
    .get(appId) as { id: string };
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 24 * 3600_000).toISOString();
  const selected: SavedInformation = {
    id: randomUUID(),
    applicationId: appId,
    title: "Private connection",
    body: "The saved route is on this controller.",
    evidence: [],
    establishedAt: old,
    createdAt: old,
    updatedAt: now,
    retiredAt: null,
    presentation: {
      views: ["overview", "deployment", "access"],
      role: "status",
      status: "verified",
      url: "http://127.0.0.1:18000",
      checks: [],
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 18000,
        remotePort: 8080,
      },
    },
  } as SavedInformation;
  const earlier: SavedInformation = {
    ...selected,
    id: randomUUID(),
    title: "Earlier private connection",
    establishedAt: now,
    updatedAt: old,
    presentation: {
      ...selected.presentation!,
      url: "http://127.0.0.1:18001",
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 18001,
        remotePort: 8080,
      },
    },
  };
  const deployment: SavedInformation = {
    ...selected,
    id: randomUUID(),
    title: "Private Notes deployed",
    body: "A saved item is in the fixture application.",
    presentation: {
      views: ["overview", "deployment"],
      role: "outcome",
      status: "verified",
      checks: [
        {
          label: "Application responded when deployed",
          status: "passed",
          subject: "application",
          key: "http",
          claim: "reachability",
          basis: "observed",
        },
      ],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/private-notes",
        revision: "abcdef0123456789",
        image: "private-notes:fixture",
        server: "fixture-server",
        changes: [],
      },
    },
  } as SavedInformation;
  const insert = database.prepare(
    "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const row of [selected, earlier, deployment])
    insert.run(
      row.id,
      appId,
      row.title,
      row.body,
      "[]",
      row.establishedAt,
      JSON.stringify(row.presentation),
      row.createdAt,
      row.updatedAt,
    );
  database
    .prepare("UPDATE applications SET name=? WHERE id=?")
    .run("Private Notes", appId);
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(
      chatId,
      "Show the saved application",
      {
        body: "These are saved fixture records, not a live deployment.",
        status: "completed",
      },
    );
    return {
      status: "idle",
      messages,
      calls: Object.fromEntries(
        [deployment, selected, earlier].map((row, i) => [
          `save-${i}`,
          {
            replyId,
            sequence: i,
            tool: "save_information",
            args: {},
            at: old,
            informationId: row.id,
          },
        ]),
      ),
      said: [],
    };
  });
  let response: Record<string, unknown> | "unavailable" = {
    mode: "private",
    routeIdentity: accessRouteIdentity(selected),
    open: true,
    server: "answering",
  };
  let delayNext = false;
  let delayed: Route | undefined;
  await page.route(`**/api/applications/${appId}/access`, (route) => {
    if (delayNext) {
      delayNext = false;
      delayed = route;
      return;
    }
    return response === "unavailable"
      ? route.abort("failed")
      : route.fulfill({ json: response });
  });
  await page.route(`**/api/applications/${appId}/traffic`, (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"type":"state","state":"no-server"}\n\n',
    }),
  );
  await page.clock.install();
  try {
    const capture = process.env.HALLVI_ACCESS_CAPTURE;
    await page.goto(`/applications/${appId}#overview`);
    const header = page.locator(".axj3-head");
    await expect(
      header.getByRole("link", { name: "Open Private Notes" }),
    ).toBeVisible();
    if (capture) {
      await expect(page.getByText("No server is connected")).toBeVisible();
      const dir = join("work/private-access/evidence", capture);
      mkdirSync(dir, { recursive: true });
      for (const [state, answer] of [
        [
          "normal",
          {
            mode: "private",
            routeIdentity: accessRouteIdentity(selected),
            open: true,
            server: "answering",
          },
        ],
        [
          "closed",
          {
            mode: "private",
            routeIdentity: accessRouteIdentity(selected),
            open: false,
            server: "answering",
          },
        ],
        [
          "unknown",
          {
            mode: "private",
            routeIdentity: accessRouteIdentity(selected),
            server: "unknown",
          },
        ],
        ["controller-unreachable", "unavailable"],
      ] as const) {
        // Controller loss follows a successful observation.
        if (state === "controller-unreachable") {
          response = {
            mode: "private",
            routeIdentity: accessRouteIdentity(selected),
            open: true,
            server: "answering",
          };
          await page.clock.runFor(30_001);
          await expect(
            header.getByRole("link", { name: "Open Private Notes" }),
          ).toBeVisible();
        }
        response = answer;
        const read = page.waitForRequest(`**/api/applications/${appId}/access`);
        await page.clock.runFor(30_001);
        await read;
        const word =
          state === "closed"
            ? "The way in is closed"
            : capture === "baseline"
              ? "The way in is open"
              : state === "unknown"
                ? "Access has not been checked"
                : state === "controller-unreachable"
                  ? "Cannot reach Hallvi"
                  : "The way in is open";
        await expect(page.locator(".ovl-health-word")).toHaveText(word);
        for (const [device, viewport] of [
          ["desktop", { width: 1440, height: 1000 }],
          ["narrow", { width: 390, height: 844 }],
        ] as const) {
          await page.setViewportSize(viewport);
          await page.locator(".ovl-health").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: join(dir, `${state}-${device}.png`),
            animations: "disabled",
          });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      if (capture === "baseline") return;
    }
    response = {
      mode: "private",
      routeIdentity: accessRouteIdentity(selected),
      open: true,
      server: "answering",
    };
    await page.reload();
    await expect(
      header.getByRole("link", { name: "Open Private Notes" }),
    ).toHaveAttribute("href", selected.presentation!.url!);
    await expect(page.getByText("It answered just now.")).toHaveCount(0);
    await page.goto(`/applications/${appId}`);
    const chat = page.locator(".hv-chat-pane");
    await expect(
      chat.locator(`a[href="${selected.presentation!.url}"]`),
    ).toHaveCount(1);
    await expect(
      chat.locator(`a[href="${earlier.presentation!.url}"]`),
    ).toHaveCount(0);
    await page.goto(`/applications/${appId}#deployment`);
    await expect(
      page.getByRole("link", { name: "127.0.0.1:18000", exact: false }),
    ).toHaveAttribute("href", selected.presentation!.url!);
    response = "unavailable";
    await page.clock.runFor(30_001);
    await expect(
      page.locator(".rp").getByText("Cannot reach Hallvi"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "127.0.0.1:18000", exact: false }),
    ).toHaveCount(0);
    response = {
      mode: "private",
      routeIdentity: accessRouteIdentity(selected),
      open: false,
      server: "answering",
    };
    await page.clock.runFor(30_001);
    await expect(
      page.locator(".rp").getByText("The tunnel is closed"),
    ).toBeVisible();
    await page
      .locator(".rp")
      .getByRole("button", { name: "Open the connection again" })
      .click();
    await expect(page.locator("#pi-composer")).toHaveValue(/18000/);
    await expect(page.locator("#pi-composer")).not.toHaveValue(/18001/);
    await page.goto(`/applications/${appId}#overview`);
    response = {
      mode: "private",
      routeIdentity: accessRouteIdentity(selected),
      server: "unknown",
    };
    await page.clock.runFor(30_001);
    await expect(header.getByText("Access has not been checked")).toBeVisible();
    await expect(header.getByRole("link")).toHaveCount(0);
    // An edited route cannot borrow the earlier route's answer.
    const changed = {
      ...selected,
      updatedAt: new Date(Date.now() + 1000).toISOString(),
      presentation: {
        ...selected.presentation!,
        url: "http://127.0.0.1:18002",
        content: {
          kind: "application-access",
          mode: "private",
          server: "fixture-server",
          localPort: 18002,
          remotePort: 8080,
        },
      },
    } as SavedInformation;
    database
      .prepare(
        "UPDATE saved_information SET presentation=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify(changed.presentation),
        changed.updatedAt,
        selected.id,
      );
    response = {
      mode: "private",
      routeIdentity: accessRouteIdentity(selected),
      open: true,
      server: "answering",
    };
    await page.reload();
    await expect(header.getByText("Access has not been checked")).toBeVisible();
    await expect(header.getByRole("link")).toHaveCount(0);
    response = {
      mode: "private",
      routeIdentity: accessRouteIdentity(changed),
      open: true,
      server: "answering",
    };
    await page.clock.runFor(30_001);
    await expect(
      header.getByRole("link", { name: "Open Private Notes" }),
    ).toHaveAttribute("href", changed.presentation!.url!);
    // A slow successful read cannot replace a later controller-loss result.
    delayNext = true;
    await page.clock.runFor(30_001);
    await expect.poll(() => Boolean(delayed)).toBe(true);
    response = "unavailable";
    await page.clock.runFor(30_001);
    await expect(header.getByText("Cannot reach Hallvi")).toBeVisible();
    const staleRead = page.waitForResponse(
      `**/api/applications/${appId}/access`,
    );
    await delayed!.fulfill({
      json: {
        mode: "private",
        routeIdentity: accessRouteIdentity(changed),
        open: true,
        server: "answering",
      },
    });
    await staleRead;
    await page.clock.runFor(100);
    await expect(header.getByText("Cannot reach Hallvi")).toBeVisible();
    await expect(header.getByRole("link")).toHaveCount(0);
  } finally {
    await closeWorker();
    database.close();
  }
});
