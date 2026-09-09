import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 1000 },
    extraHTTPHeaders: { Authorization: `Basic ${input.auth}` },
  });
  const page = await context.newPage();
  const errors = [];
  let dashboardCanvases = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  if (!input.pluginsOnly) {
    await page.goto(`${input.url}/d/${input.uid}?from=now-1h&to=now`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Recovered samples", { exact: true }).waitFor();
    await page
      .getByText("Encrypted credential query", { exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll("canvas").length >= 2,
    );
    dashboardCanvases = await page.locator("canvas").count();
    await page.screenshot({
      path: join(input.directory, "restored-dashboard.png"),
      fullPage: true,
    });
    if (errors.length)
      throw new Error("Saved dashboard has browser execution errors");
  }
  const pages = [];
  for (const plugin of input.plugins.filter((item) => item.path)) {
    const priorErrors = errors.length;
    await page.goto(input.url + plugin.path, { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    // Wait for lazy plugin chunks and their initial API requests to settle.
    await page.waitForLoadState("networkidle").catch(() => {});
    const text = await page.getByRole("main").innerText();
    await page.screenshot({
      path: join(input.directory, `${plugin.id}.png`),
      fullPage: true,
    });
    let behavior = null;
    if (plugin.id === "grafana-metricsdrilldown-app") {
      if (!text.includes("go_gc_") || errors.length !== priorErrors)
        throw new Error("Metrics Drilldown did not display restored metrics");
      await page.getByText("Select", { exact: true }).first().click();
      await page.waitForFunction(
        () => document.querySelectorAll("canvas").length > 0,
      );
      await page.screenshot({
        path: join(input.directory, "metrics-drilldown-selected.png"),
        fullPage: true,
      });
      if (errors.length !== priorErrors)
        throw new Error("Metrics drilldown failed after selecting a metric");
      behavior = "metrics-query-and-drilldown";
    }
    const states = {
      "grafana-advisor-app": ["requires-feature-flag", "grafanaAdvisor"],
      "grafana-exploretraces-app": [
        "requires-service",
        "Datasource was not found",
      ],
      "grafana-lokiexplore-app": [
        "requires-service",
        "no Loki datasource configured",
      ],
      "grafana-pyroscope-app": [
        "requires-service",
        "Set Up Your Pyroscope Server",
      ],
    };
    const expected = states[plugin.id];
    if (expected && !text.includes(expected[1]))
      throw new Error("Plugin page differs from the inspected fixture state");
    pages.push({
      id: plugin.id,
      text,
      errors: errors.slice(priorErrors),
      behavior,
      uiState: expected?.[0] ?? "working",
    });
  }
  writeFileSync(
    join(input.directory, "browser-observations.json"),
    JSON.stringify({ pages, errors }, null, 2),
    { mode: 0o600 },
  );
  process.stdout.write(
    JSON.stringify({
      dashboardCanvases,
      pages: pages.map(({ id, behavior, uiState, errors }) => ({
        id,
        behavior,
        uiState,
        browserErrors: errors.length,
      })),
    }),
  );
} finally {
  await browser.close();
}
