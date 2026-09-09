import { test, expect } from "./fixtures";
import { journey } from "./journeys";
import { richScenario } from "../../src/components/server-guy/reference/scenario-rich";
import type { SecurityFacts } from "../../src/server/application-facts";

// Exercise the production application route with synthetic provider evidence.
test(
  "Security reads firewall facts, retains evidence on errors and retries",
  journey("application-shell"),
  async ({ page }) => {
    test.setTimeout(180_000);
    const record = richScenario.initial().deployment!;
    let fail = false;
    let calls = 0;
    const security: SecurityFacts = {
      firewall: {
        state: "active",
        provider: "Hetzner Cloud",
        name: "test-firewall",
        lastCheckedAt: "2026-09-09T14:00:00Z",
        detail: "1 attached firewall applied.",
      },
      rules: [
        {
          id: "1:0",
          port: "22",
          protocol: "tcp",
          sources: ["192.0.2.4/32"],
          reach: "restricted",
        },
      ],
      ssh: { state: "unknown", detail: "Authentication not inspected." },
      privateServices: [],
      privateServicesDetail: "Host networking not inspected.",
    };
    await page.route("**/api/applications/*/deployment", (route) =>
      route.fulfill({
        json: {
          connected: true,
          deployment: {
            ...record,
            applicationId: new URL(route.request().url()).pathname.split(
              "/",
            )[3],
          },
        },
      }),
    );
    await page.route("**/api/applications/*/firewall", (route) => {
      calls++;
      return route.fulfill(
        fail
          ? { status: 502, json: { error: "Synthetic provider unavailable" } }
          : { json: { serverId: record.serverId, security } },
      );
    });
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/security-view");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const nav = page.getByRole("navigation", { name: "Application workspace" });
    await nav
      .getByRole("button", {
        name: "Security",
        exact: true,
      })
      .click();
    const panel = page.locator(".sg-section-security");
    await expect(panel).toContainText("192.0.2.4/32");
    await expect(panel).toContainText("Host networking not inspected");
    expect(calls).toBe(1);
    fail = true;
    await panel.getByRole("button", { name: "Check now", exact: true }).click();
    await expect(panel).toContainText("Synthetic provider unavailable");
    await expect(panel).toContainText(
      "The last successful check is shown below",
    );
    await expect(panel).toContainText("192.0.2.4/32");
    fail = false;
    security.firewall.state = "not-configured";
    security.firewall.detail = "No Hetzner firewall is attached.";
    security.rules = [];
    await panel.getByRole("button", { name: "Check now", exact: true }).click();
    await expect(panel).toContainText(
      "No attached firewall restricts incoming traffic",
    );
    await expect(panel).not.toContainText("192.0.2.4/32");
    await expect(panel).not.toContainText("Synthetic provider unavailable");
    await nav.getByRole("button", { name: "Domains", exact: true }).click();
    await expect(
      nav.getByRole("button", { name: "Security", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Reported incoming rules",
        exact: true,
      }),
    ).toHaveCount(0);
  },
);
