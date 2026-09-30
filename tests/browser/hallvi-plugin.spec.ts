import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const first = "3ee7c9a7-5da8-434a-8222-cccac5089141";
const second = "3ee7c9a7-5da8-434a-8222-cccac5089142";
const origin = "http://127.0.0.1:3978";

// Actual panel, synthetic MCP host. No controller, model or account access.
async function panel(page: Page) {
  const html = await readFile("plugins/hallvi/panel.html", "utf8");
  const sends: { application_id: string; request_key: string }[] = [];
  const state = {
    offline: false,
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
          applications: [first, second].map((id, i) => ({
            id,
            name: i ? "Second app" : "First app",
            mainChatId: id,
            permissionMode: "always-ask",
            page: `${origin}/applications/${id}`,
          })),
        };
      else if (name === "hallvi_exec") {
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
          attention: [],
        };
      else
        data = {
          revision: "same",
          unchanged: args.known === "same",
          status: "idle",
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
        target.postMessage({jsonrpc:'2.0', id:m.id, result}, '*');
      });
    </script>`,
    });
  });
  await page.goto(origin);
  const frame = page.frameLocator("iframe");
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
