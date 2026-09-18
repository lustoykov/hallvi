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
    const panel = page.getByRole("region", { name: "Hallvi itself" });

    // 1. No destination: Hallvi is stated as unprotected beside the data,
    //    and the single action that fixes both is on the page.
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("Not copied", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("form", { name: "Connect backup storage" }),
    ).toBeVisible();
    await expect(panel).toContainText(
      "Connecting off-host storage protects your application\u2019s data and Hallvi together",
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
    await expect(panel.getByText("Kit not saved", { exact: true })).toBeVisible(
      { timeout: 30_000 },
    );
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
    await expect(panel.getByText("Recoverable", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Nothing is asked of the owner again, and the passphrase is not shown
    // here a second time.
    await expect(panel.getByLabel("Recovery kit")).toHaveCount(0);
    await expect(panel.locator("[data-recovery-passphrase]")).toHaveCount(0);
    await expect(panel).toContainText("you hold the passphrase");

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
