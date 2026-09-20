import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "./fixtures";
import { journey } from "./journeys";

/**
 * The owner's glance at Backups has to answer whether Hallvi itself would
 * survive losing this machine. Three states, in the order they actually
 * happen: nothing connected, the first copy taken, and the kit saved.
 */
test(
  "Backups states Hallvi's own protection in every state",
  journey("controller-protection"),
  async ({ page, fixture }) => {
    test.setTimeout(180_000);
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/controller-protection");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const openBackups = async () => {
      const button = page
        .getByRole("navigation", { name: "Application workspace" })
        .getByRole("button", { name: /^Backups/ });
      if ((await button.getAttribute("aria-current")) !== "page")
        await button.click();
    };
    await openBackups();
    // The band is a disclosure, so its summary is what the owner reads at a
    // glance and everything else waits behind a deliberate open. The kit is
    // only fetched once it is open, which is the point of the design.
    const panel = page.getByRole("group", { name: "Hallvi on this PC" });
    const openBand = async () => {
      await expect(panel).toBeVisible({ timeout: 30_000 });
      if (!(await panel.evaluate((band: HTMLDetailsElement) => band.open)))
        await panel.getByText("Hallvi on this PC").click();
      await expect(panel).toHaveJSProperty("open", true);
    };

    // 1. No destination: the summary says so, and opening it offers the one
    //    action that fixes it \u2014 for Hallvi, which is not the application's
    //    own backup plan.
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("Not copied", { exact: true })).toBeVisible();
    await openBand();
    await expect(
      page.getByRole("form", { name: "Connect backup storage" }),
    ).toBeVisible();
    await expect(panel).toContainText(
      "Losing this PC would lose Hallvi\u2019s conversations, connections, deployment access and decisions",
    );
    await expect(panel).toContainText(
      "Application data still needs its own backup plan",
    );

    // 2. A copy has reached storage, but the owner has not saved the kit.
    const state = fixture.state;
    mkdirSync(join(state, "backup-destinations"), { recursive: true });
    const endpoint = `https://${"a".repeat(32)}.r2.cloudflarestorage.com`;
    writeFileSync(
      join(state, "backup-destinations", "default.json"),
      JSON.stringify({
        provider: "r2",
        endpoint,
        bucket: "hallvi-copies",
        region: "auto",
        credentialFile: "default-credentials.json",
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      join(state, "backup-destinations", "default-credentials.json"),
      JSON.stringify({
        accessKeyId: "A".repeat(20),
        secretAccessKey: "s".repeat(40),
      }),
      { mode: 0o600 },
    );
    mkdirSync(join(state, "controller-protection"), { recursive: true });
    const passphrase = "QA-RECOVERY-PASSPHRASE-FOR-BROWSER-TEST";
    const at = new Date(Date.now() - 20 * 60_000).toISOString();
    writeFileSync(
      join(state, "controller-protection", "recovery-key.json"),
      JSON.stringify({ version: 1, passphrase, createdAt: at }),
      { mode: 0o600 },
    );
    writeFileSync(
      join(state, "controller-protection", "state.json"),
      JSON.stringify({
        version: 1,
        kit: {
          createdAt: at,
          bucket: "hallvi-copies",
          endpoint,
          prefix: "controller/",
          confirmedAt: null,
        },
        copies: [
          {
            id: randomUUID(),
            trigger: "daily",
            startedAt: at,
            capturedAt: at,
            finishedAt: at,
            outcome: "succeeded",
            reason: null,
            bytes: 2_345_678,
            sha256: "b".repeat(64),
            objectKey: "controller/20260915T090000Z-1a2b3c4d.tar.enc",
            expiredAt: null,
            retention: { deleted: 0, failed: false },
          },
        ],
      }),
      { mode: 0o600 },
    );
    await page.reload();
    await openBackups();
    // A reload closes the disclosure again; the summary still has to carry
    // the state on its own.
    await expect(
      panel.getByText(/^Copied .*; recovery kit still needs saving$/),
    ).toBeVisible({ timeout: 30_000 });
    await openBand();
    await expect(
      page.getByRole("form", { name: "Connect backup storage" }),
    ).toHaveCount(0);
    const kit = panel.getByLabel("Recovery kit");
    await expect(kit.locator("[data-recovery-passphrase]")).toHaveText(
      passphrase,
      { timeout: 15_000 },
    );
    await expect(kit).toContainText("hallvi-copies");
    await expect(panel).toContainText("Save your recovery kit");

    // 3. The owner says they saved it. One button, no form, and the page
    //    stops claiming anything it cannot back up.
    await kit.getByRole("button", { name: "I saved it" }).click();
    await expect(
      panel.getByText(/^Copied .*; recovery kit saved$/),
    ).toBeVisible({ timeout: 30_000 });
    // Nothing is asked of the owner again, and the passphrase is not shown
    // here a second time. What remains is what was copied, and where.
    await expect(panel.getByLabel("Recovery kit")).toHaveCount(0);
    await expect(panel.locator("[data-recovery-passphrase]")).toHaveCount(0);
    await expect(panel).toContainText(
      "conversations, connections, deployment access and decisions",
    );
    await expect(panel).toContainText("hallvi-copies");

    // Settings shows it again only when the owner deliberately asks.
    await page.goto("/setup/connections");
    const settings = page.getByRole("region", {
      name: "Hallvi recovery kit",
    });
    await expect(settings).toContainText("saved outside this machine");
    await expect(settings.locator("[data-recovery-passphrase]")).toHaveCount(0);
    await settings.getByRole("button", { name: "Show recovery kit" }).click();
    await expect(settings.locator("[data-recovery-passphrase]")).toHaveText(
      passphrase,
      { timeout: 15_000 },
    );
  },
);
