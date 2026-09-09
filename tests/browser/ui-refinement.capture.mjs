// Captures the prototype application views for design review. Not a test.
// Usage: node tests/browser/ui-refinement.capture.mjs [base] [out] [width]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3101";
const out = process.argv[3] ?? "tests/results/ui-refinement";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1000);
mkdirSync(out, { recursive: true });

const shots = [
  ["overview-rich", "scenario=rich&step=13&section=overview"],
  ["overview-simple", "scenario=simple&step=4&section=overview"],
  ["architecture-rich", "scenario=rich&step=13&section=architecture"],
  ["architecture-simple", "scenario=simple&step=4&section=architecture"],
  ["deployment", "scenario=rich&step=15&section=deployment"],
  ["history", "scenario=rich&step=15&section=history"],
  ["processes", "scenario=rich&step=13&section=processes"],
  ["processes-simple", "scenario=simple&step=4&section=processes"],
  ["database", "scenario=rich&step=13&section=database"],
  ["cache", "scenario=rich&step=13&section=cache"],
  ["jobs", "scenario=rich&step=13&section=jobs"],
  ["storage", "scenario=rich&step=13&section=storage"],
  ["backups", "scenario=rich&step=6&section=backups"],
  ["backups-empty", "scenario=simple&step=4&section=backups"],
  ["logs", "scenario=rich&step=13&section=logs"],
  ["monitoring", "scenario=rich&step=11&section=monitoring"],
  ["monitoring-stale", "scenario=rich&step=25&section=monitoring"],
  ["domains", "scenario=rich&step=19&section=domains"],
  ["domains-simple", "scenario=simple&step=4&section=domains"],
  ["variables", "scenario=rich&step=22&section=variables"],
  ["conversation", "scenario=rich&step=8"],
  ["conversation-proposal", "scenario=simple&step=2"],
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
for (const [name, query] of shots) {
  await page.goto(`${base}/prototype/app?${query}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
for (const [name, path] of [
  ["applications", "/prototype/applications"],
  ["shell-variants", "/prototype/shell"],
  ["applications-empty", "/prototype/applications?state=empty"],
  ["index", "/prototype"],
]) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
await browser.close();
if (errors.length) console.error("Page errors:", errors);
console.log(`Captured ${shots.length + 4} screens into ${out}`);
