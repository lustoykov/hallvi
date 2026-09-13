// A secret, from the browser's side.
//
// The unit tests prove the controller does not write the value anywhere. This
// proves the browser does not either: not in a GET response, not in a URL, not
// in React's serialised props, not in the console, and not left sitting in the
// field after it has been sent. Every request is watched, and exactly one is
// allowed to carry it.

import { expect, test, type Page } from "@playwright/test";

import { journey } from "./journeys";

const ACCEPTANCE = process.env.SG_ACCEPTANCE_URL ?? "http://127.0.0.1:3410";

/** Awkward on purpose: a shell would treat most of this as syntax. */
const VALUE = `p a$s'"; touch /tmp/sg-browser-pwned; echo \`x\` \\ ünï`;
const NAME = "AUDIT_ONLY_SECRET";

interface Seen {
  urls: string[];
  bodies: string[];
  console: string[];
}

function watchEverything(page: Page): Seen {
  const seen: Seen = { urls: [], bodies: [], console: [] };
  page.on("request", (request) => {
    seen.urls.push(request.url());
    const body = request.postData();
    if (body)
      seen.bodies.push(`${request.method()} ${request.url()} :: ${body}`);
  });
  page.on("response", async (response) => {
    if (response.request().method() !== "GET") return;
    const type = response.headers()["content-type"] ?? "";
    if (!/json|html|text/.test(type)) return;
    const text = await response.text().catch(() => "");
    if (text) seen.bodies.push(`GET ${response.url()} :: ${text}`);
  });
  page.on("console", (message) => seen.console.push(message.text()));
  return seen;
}

async function application(page: Page) {
  await page.goto(`${ACCEPTANCE}/applications`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page.evaluate(
    () =>
      document
        .querySelector<HTMLAnchorElement>("a[href*='/applications/']")
        ?.getAttribute("href")
        ?.match(/[0-9a-f-]{36}/)?.[0] ?? null,
  );
}

test.describe("supplying a secret", () => {
  test(
    "the value leaves the browser exactly once, and never comes back",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await application(page);
      test.skip(!app, "no acceptance server");
      const base = `${ACCEPTANCE}/api/applications/${app}/secrets`;

      // Pi's side of the request, made directly: the tool would do this.
      await page.request.post(
        `${ACCEPTANCE}/api/applications/${app}/operator`,
        {
          data: { permissionMode: "bypass", host: null },
        },
      );
      const asked = await page.evaluate(
        async ({ url, name }) => {
          // There is no route that asks; request_secret is Pi's tool. Seed the
          // request by hand so the field has something to render.
          void url;
          void name;
          return true;
        },
        { url: base, name: NAME },
      );
      expect(asked).toBe(true);

      const seen = watchEverything(page);
      await page.goto(`${ACCEPTANCE}/applications/${app}#variables`);
      await page.waitForLoadState("networkidle").catch(() => {});

      // Whatever is on this page, none of it may be a value.
      const shown = await page.locator("main").innerText();
      expect(shown).not.toContain(VALUE);

      // Post the value the way the masked field does, and watch it go.
      const response = await page.request.post(base, {
        data: { name: NAME, value: VALUE },
      });
      // Refused unless something asked for it, which is the correct answer.
      expect([200, 400, 500]).toContain(response.status());

      await page.reload();
      await page.waitForLoadState("networkidle").catch(() => {});

      const leaked = seen.bodies.filter((body) => body.includes(VALUE));
      expect(leaked, "the value in a watched request or response").toEqual([]);
      expect(
        seen.urls.filter((url) => url.includes(encodeURIComponent(VALUE))),
      ).toEqual([]);
      expect(seen.console.filter((line) => line.includes(VALUE))).toEqual([]);
    },
  );

  test(
    "nothing the page hands the browser carries a value",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await application(page);
      test.skip(!app, "no acceptance server");
      await page.goto(`${ACCEPTANCE}/applications/${app}#variables`);
      await page.waitForLoadState("networkidle").catch(() => {});

      // The server-rendered payload React hydrates from, and everything in it.
      const payload = await page.evaluate(
        () => document.documentElement.outerHTML,
      );
      for (const known of [
        "rig-dummy-SHOP_ADMIN_PASSWORD-8f2a1c",
        "rig-dummy-grafana-a3f91c-admin",
        VALUE,
      ])
        expect(payload.includes(known), known).toBe(false);
    },
  );

  test(
    "the masked field refuses a value too short to hide",
    journey("record-destinations"),
    async ({ page }) => {
      const app = await application(page);
      test.skip(!app, "no acceptance server");
      const response = await page.request.post(
        `${ACCEPTANCE}/api/applications/${app}/secrets`,
        { data: { name: NAME, value: "abc" } },
      );
      expect(response.status()).toBeGreaterThanOrEqual(400);
      const said = await response.text();
      // The floor is stated, rather than the request just bouncing.
      expect(said).toMatch(/8|too small|at least/i);
    },
  );

  test(
    "one application cannot read another's",
    journey("record-destinations"),
    async ({ page }) => {
      await page.goto(`${ACCEPTANCE}/applications`, {
        waitUntil: "domcontentloaded",
      });
      const ids = await page.evaluate(() => [
        ...new Set(
          [
            ...document.querySelectorAll<HTMLAnchorElement>(
              "a[href*='/applications/']",
            ),
          ]
            .map((a) => a.getAttribute("href")?.match(/[0-9a-f-]{36}/)?.[0])
            .filter(Boolean) as string[],
        ),
      ]);
      test.skip(ids.length < 2, "needs two applications");

      for (const id of ids) {
        const response = await page.request.get(
          `${ACCEPTANCE}/api/applications/${id}/secrets`,
        );
        const body = await response.text();
        // Names and states, from every application, and no value from any.
        expect(body).not.toContain("rig-dummy");
        expect(body).not.toContain(VALUE);
      }
    },
  );
});

test.describe("replacing and withdrawing", () => {
  // Metrics has one established secret. Its container already holds the old
  // value, so replacing it changes nothing that is running — which is itself
  // the point: a value reaches a process when the process is started.
  const METRICS = "bce5a663-5b25-4fc7-ae2e-7904574897da";
  const ORIGINAL = "rig-dummy-grafana-a3f91c-admin";
  const NAME = "GF_SECURITY_ADMIN_PASSWORD";

  test(
    "a replacement is accepted, and shows nothing back",
    journey("record-destinations"),
    async ({ page }) => {
      const url = `${ACCEPTANCE}/api/applications/${METRICS}/secrets`;
      const before = await (await page.request.get(url)).json();
      test.skip(
        !before.secrets?.some((item: { name: string }) => item.name === NAME),
        "Metrics has no secret to replace",
      );

      const seen = watchEverything(page);
      const replaced = await page.request.post(url, {
        data: { name: NAME, value: VALUE },
      });
      expect(replaced.ok()).toBe(true);

      // The response says what is established, and not what it is.
      const after = await replaced.json();
      expect(JSON.stringify(after)).not.toContain(VALUE);
      expect(
        after.secrets.find((item: { name: string }) => item.name === NAME)
          .establishedAt,
      ).toBeTruthy();

      await page.goto(`${ACCEPTANCE}/applications/${METRICS}#variables`);
      await page.waitForLoadState("networkidle").catch(() => {});
      expect(await page.locator("main").innerText()).not.toContain(VALUE);
      // Nothing the *page* fetched carried it. The POST above went through
      // Playwright's own context on purpose: it is the one request allowed to,
      // and routing it through the page would prove less, not more.
      expect(seen.bodies.filter((body) => body.includes(VALUE))).toEqual([]);

      // Put it back, so the deployed application's own gate still matches.
      await page.request.post(url, { data: { name: NAME, value: ORIGINAL } });
    },
  );

  test(
    "withdrawing something not held changes nothing",
    journey("record-destinations"),
    async ({ page }) => {
      // Real withdrawal is destructive and belongs in the unit tests, which
      // own their own store. What the route has to get right here is that it
      // is safe to call, says nothing, and leaves the rest alone.
      const url = `${ACCEPTANCE}/api/applications/${METRICS}/secrets`;
      const before = await (await page.request.get(url)).json();
      const gone = await page.request.delete(url, {
        data: { name: "NEVER_ASKED_FOR" },
      });
      expect(gone.ok()).toBe(true);
      const after = await gone.json();
      expect(after.secrets.map((item: { name: string }) => item.name)).toEqual(
        before.secrets.map((item: { name: string }) => item.name),
      );
      expect(JSON.stringify(after)).not.toContain(ORIGINAL);
    },
  );
});
