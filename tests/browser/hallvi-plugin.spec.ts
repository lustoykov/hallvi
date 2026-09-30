import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const first = "3ee7c9a7-5da8-434a-8222-cccac5089141";
const second = "3ee7c9a7-5da8-434a-8222-cccac5089142";
const origin = "http://127.0.0.1:3978";

// Actual panel, synthetic MCP host. No controller, model or account access.
async function panel(page: Page, empty = false) {
  const html = (await readFile("plugins/hallvi/panel.html", "utf8")).replaceAll(
    "__HALLVI_UI_VERSION__",
    "1111111111111111",
  );
  const sends: { application_id: string; request_key: string }[] = [];
  const state = {
    offline: false,
    availableVersion: "1111111111111111",
    dropUpdate: false,
    updateCalls: 0,
    attention: [] as {
      kind: string;
      reason: string;
      requestedAt?: string;
      page: string;
    }[],
    working: false,
    condition: "Initial condition",
    hold: false,
    accepted: null as boolean | null,
  };
  let release: (() => void) | undefined;
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/panel")
      return route.fulfill({ contentType: "text/html", body: html });
    if (path === "/call") {
      const { name, arguments: args } = route.request().postDataJSON();
      let data: unknown;
      if (name === "hallvi_apps")
        data = {
          page: "http://127.0.0.1:5147",
          ui: { version: state.availableVersion },
          applications: (empty ? [] : [first, second]).map((id, i) => ({
            id,
            name: i ? "Second app" : "First app",
            mainChatId: id,
            permissionMode: "always-ask",
            page: `${origin}/applications/${id}`,
          })),
        };
      else if (name === "hallvi_reload_ui") {
        state.updateCalls++;
        if (state.dropUpdate) return route.fulfill({ json: { drop: true } });
        data = { changed: false, version: state.availableVersion };
      } else if (name === "hallvi_exec") {
        sends.push(args);
        if (state.hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        data =
          state.accepted === true
            ? { accepted: true }
            : {
                accepted: null,
                error: {
                  code: "acceptance-unknown",
                  message: "Lost acknowledgement",
                },
              };
      } else if (state.offline)
        data = {
          error: { code: "unreachable", message: "Controller stopped" },
        };
      else if (name === "hallvi_inspect")
        data = {
          application: { permissionMode: "always-ask" },
          condition: {
            text: `${args.application_id === first ? "First" : "Second"}: ${state.condition}`,
          },
          traffic: { unavailable: true },
          attention: state.attention,
        };
      else
        data = {
          revision: state.working ? "working" : "same",
          unchanged: args.known === (state.working ? "working" : "same"),
          status: state.working ? "working" : "idle",
          worker: { alive: true },
          readAt: new Date().toISOString(),
          turns: [],
        };
      return route.fulfill({ json: { structuredContent: data } });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<iframe title="Hallvi" src="/panel" style="width:320px;height:780px;border:0"></iframe><script>
      addEventListener('message', async (e) => {
        const m = e.data; if (m.id == null) return;
        const target = e.source;
        const result = m.method === 'tools/call' ? await (await fetch('/call', {method:'POST', body:JSON.stringify(m.params)})).json() : {};
        if (!result.drop) target.postMessage({jsonrpc:'2.0', id:m.id, result}, '*');
      });
    </script>`,
    });
  });
  await page.goto(origin);
  const frame = page.frameLocator("iframe");
  if (empty)
    await expect(
      frame.getByRole("heading", { name: "No applications yet" }),
    ).toBeVisible();
  else
    await expect(
      frame.getByRole("button", { name: /First: Initial condition/ }),
    ).toBeVisible();
  return { frame, sends, state, release: () => release?.() };
}

test("an in-flight send keeps its key across app switches and panel reload", async ({
  page,
}) => {
  const p = await panel(page);
  p.state.hold = true;
  await p.frame
    .getByRole("textbox", { name: "Message to Hallvi" })
    .fill("Read-only check");
  await p.frame.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => p.sends.length).toBe(1);
  const original = p.sends[0].request_key;
  await expect(
    p.frame.getByRole("textbox", { name: "Message to Hallvi" }),
  ).toBeDisabled();
  await p.frame.getByLabel("Application", { exact: true }).selectOption(second);
  await p.frame
    .getByRole("textbox", { name: "Message to Hallvi" })
    .fill("Keep the second draft");
  await p.frame.getByLabel("Application", { exact: true }).selectOption(first);
  await expect(
    p.frame.getByRole("button", { name: "Send again" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    p.frame.getByRole("button", { name: "Send again" }),
  ).toBeVisible();
  p.state.hold = false;
  p.release();
  await p.frame.getByRole("button", { name: "Send again" }).click();
  await expect.poll(() => p.sends.length).toBe(2);
  expect(p.sends[1]).toMatchObject({
    application_id: first,
    request_key: original,
  });
  await p.frame.getByLabel("Application", { exact: true }).selectOption(second);
  await expect(
    p.frame.getByRole("textbox", { name: "Message to Hallvi" }),
  ).toHaveValue("Keep the second draft");
});

test("details refresh after recovery even when the conversation revision is unchanged", async ({
  page,
}) => {
  const p = await panel(page);
  await p.frame
    .getByRole("button", { name: /First: Initial condition/ })
    .click();
  p.state.offline = true;
  await p.frame.getByRole("button", { name: "More", exact: true }).click();
  await p.frame.getByRole("menuitem", { name: "Refresh", exact: true }).click();
  await expect(p.frame.getByText(/Can't reach Hallvi. Showing/)).toBeVisible();
  p.state.condition = "Recovered condition";
  p.state.offline = false;
  await p.frame.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    p.frame.getByRole("button", { name: /First: Recovered condition/ }),
  ).toBeVisible();
  await expect(p.frame.getByText(/Can't reach Hallvi. Showing/)).toHaveCount(0);
  const overflow = await page
    .locator("iframe")
    .evaluate((iframe: HTMLIFrameElement) => {
      const d = iframe.contentDocument!.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
  expect(overflow).toBe(0);
  await page.screenshot({ path: "tests/results/plugin-293-recovered.png" });
});

// Opaque MCP frames can deny storage; in-panel app switches must still be safe.
test("late acceptance settles the original app when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage denied");
      },
    }),
  );
  const p = await panel(page);
  p.state.hold = true;
  p.state.accepted = true;
  await p.frame
    .getByRole("textbox", { name: "Message to Hallvi" })
    .fill("Read-only check");
  await p.frame.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => p.sends.length).toBe(1);
  await p.frame.getByLabel("Application", { exact: true }).selectOption(second);
  await p.frame
    .getByRole("textbox", { name: "Message to Hallvi" })
    .fill("Second draft");
  const acknowledged = page.waitForResponse(
    (r) =>
      r.url().endsWith("/call") &&
      r.request().postDataJSON().name === "hallvi_exec",
  );
  p.release();
  await acknowledged;
  await expect(
    p.frame.getByRole("textbox", { name: "Message to Hallvi" }),
  ).toHaveValue("Second draft");
  await p.frame.getByLabel("Application", { exact: true }).selectOption(first);
  await expect(
    p.frame.getByRole("textbox", { name: "Message to Hallvi" }),
  ).toHaveValue("");
});

test("an empty controller opens its configured Hallvi address", async ({
  page,
}) => {
  const p = await panel(page, true);
  await p.frame
    .getByRole("button", { name: "Open Hallvi", exact: true })
    .click();
  await expect(
    p.frame.getByRole("textbox", { name: "Address", exact: true }),
  ).toHaveValue("http://127.0.0.1:5147/");
});

test("old input requests keep their date without overriding the operator's state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 820 });
  const p = await panel(page);
  p.state.attention = [
    {
      kind: "input",
      reason: "How to reach the DNS of shop.test.",
      requestedAt: "2026-09-24T14:54:00Z",
      page: `${origin}/applications/${first}`,
    },
  ];
  p.state.working = true;
  await p.frame.getByRole("button", { name: "More", exact: true }).click();
  await p.frame.getByRole("menuitem", { name: "Refresh", exact: true }).click();
  await expect(
    p.frame.getByRole("heading", { name: "1 open request" }),
  ).toBeVisible();
  await expect(p.frame.getByText(/Asked .*24|Asked 24/)).toBeVisible();
  await expect(p.frame.getByText("Working", { exact: true })).toBeVisible();
  await expect(
    p.frame.getByText("Awaiting approval", { exact: true }),
  ).toHaveCount(0);
  await expect(
    p.frame.getByRole("button", { name: "Review in Hallvi" }),
  ).toBeVisible();
  await page.screenshot({ path: "tests/results/plugin-dated-request.png" });
  p.state.attention = [];
  p.state.working = false;
  await p.frame.getByRole("button", { name: "More", exact: true }).click();
  await p.frame.getByRole("menuitem", { name: "Refresh", exact: true }).click();
  await expect(
    p.frame.getByRole("heading", { name: "1 open request" }),
  ).toHaveCount(0);
});

test("a cached panel reports the version mismatch even when the adapter already reloaded", async ({
  page,
}) => {
  const p = await panel(page);
  await p.frame
    .getByRole("textbox", { name: "Message to Hallvi" })
    .fill("Keep this unsent message");
  p.state.availableVersion = "2222222222222222";
  // The host sends a new tool result but keeps the existing iframe.
  await page.locator("iframe").evaluate((iframe: HTMLIFrameElement) => {
    iframe.contentWindow!.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { structuredContent: { ui: { version: "2222222222222222" } } },
      },
      "*",
    );
  });
  const notice = p.frame.getByRole("region", {
    name: "Panel update",
    exact: true,
  });
  await expect(notice).toContainText("Panel update available");
  await expect(notice).not.toContainText("null");
  await expect(notice).toContainText("new chat");
  await expect(notice).toContainText("reconnect the Hallvi plugin");
  await expect(notice).toContainText(
    "Shown: 1111111111111111. Available: 2222222222222222.",
  );
  await p.frame.getByRole("button", { name: "More", exact: true }).click();
  await p.frame
    .getByRole("menuitem", { name: "Check for a panel update" })
    .click();
  await expect.poll(() => p.state.updateCalls).toBe(1);
  await expect(notice).toContainText("Panel update available");
  await expect(p.frame.getByRole("menu")).toBeHidden();
  await expect(
    p.frame.getByRole("textbox", { name: "Message to Hallvi" }),
  ).toHaveValue("Keep this unsent message");
  expect(p.sends).toHaveLength(0);
  for (const width of [320, 760]) {
    await page
      .locator("iframe")
      .evaluate((iframe: HTMLIFrameElement, width) => {
        iframe.style.width = `${width}px`;
      }, width);
    const overflow = await page
      .locator("iframe")
      .evaluate(
        (iframe: HTMLIFrameElement) =>
          iframe.contentDocument!.documentElement.scrollWidth -
          iframe.clientWidth,
      );
    expect(overflow).toBe(0);
    await page.screenshot({ path: `tests/results/plugin-update-${width}.png` });
  }
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toBeHidden();
});

test("an unanswered update check times out, permits retry, and never sends operator work", async ({
  page,
}) => {
  await page.clock.install();
  const p = await panel(page);
  p.state.dropUpdate = true;
  await p.frame.getByRole("button", { name: "More", exact: true }).click();
  await p.frame
    .getByRole("menuitem", { name: "Check for a panel update" })
    .click();
  await expect.poll(() => p.state.updateCalls).toBe(1);
  const notice = p.frame.getByRole("region", {
    name: "Panel update",
    exact: true,
  });
  await expect(
    notice.getByRole("button", { name: "Check again" }),
  ).toBeDisabled();
  await page.clock.fastForward(15_001);
  await expect(notice).toContainText("The check may still finish");
  await expect(
    notice.getByRole("button", { name: "Check again" }),
  ).toBeEnabled();
  p.state.dropUpdate = false;
  await notice.getByRole("button", { name: "Check again" }).click();
  await expect(notice).toContainText("This panel matches the installed UI");
  await expect(notice).toContainText(
    "Adapter code changes require a plugin reconnect",
  );
  expect(p.state.updateCalls).toBe(2);
  expect(p.sends).toHaveLength(0);
});
