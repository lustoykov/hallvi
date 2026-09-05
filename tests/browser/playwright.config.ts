import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "../results/browser-artifacts",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: fileURLToPath(
          new URL("../results/browser-report", import.meta.url),
        ),
      },
    ],
  ],
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
