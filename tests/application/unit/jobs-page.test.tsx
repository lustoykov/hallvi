// Jobs as a register: a schedule in words, runs as evidence, and a next run
// that is only ever the one a record states.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobsPage, cronWords } from "@/components/hallvi/jobs-page";
import type { SupplyView } from "@/components/hallvi/supply-prototype/supply-story";

const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(NOW - hours * 3600_000).toISOString();

const job = (
  name: string,
  schedule: string,
  outcome: "succeeded" | "failed",
  nextAt: string | null,
) => ({
  name,
  command: `/opt/site/bin/${name}`,
  schedule,
  timezone: "UTC",
  nextAt,
  paused: false,
  last: { outcome, at: hoursAgo(3), seconds: 14 },
});

const draw = (jobs: SupplyView["jobs"], runs: SupplyView["runs"] = []) =>
  renderToStaticMarkup(
    <JobsPage
      story={
        { name: "Site", jobs, runs, recurring: [] } as unknown as SupplyView
      }
      now={NOW}
      head={null}
      onAsk={() => undefined}
      onOpenDestination={() => undefined}
    />,
  );

describe("the Jobs page", () => {
  it("puts the common cron shapes into words and leaves the rest alone", () => {
    expect(cronWords("0 */6 * * *")).toBe("Every 6 hours");
    expect(cronWords("15 4 * * *")).toBe("Every day at 04:15");
    expect(cronWords("30 2 * * 0")).toBe("Sundays at 02:30");
    expect(cronWords("*/5 * * * *")).toBe("Every 5 minutes");
    expect(cronWords("0 9 1 * *")).toBe("0 9 1 * *");
  });

  it("leads with the job whose last run failed, and opens it", () => {
    const html = draw(
      [
        job("youtube-updater", "0 */6 * * *", "succeeded", null),
        job("sitemap", "15 4 * * *", "failed", null),
      ],
      [
        { id: "a", jobName: "sitemap", outcome: "succeeded", at: hoursAgo(27) },
        { id: "b", jobName: "sitemap", outcome: "failed", at: hoursAgo(3) },
      ],
    );
    expect(html).toContain("sitemap failed its last run");
    expect(html).toContain("Why did it fail?");
    expect(html).toContain("/opt/site/bin/sitemap");
  });

  it("never works out a next run from the schedule", () => {
    const html = draw([
      job("youtube-updater", "0 */6 * * *", "succeeded", null),
    ]);
    expect(html).toContain("1 scheduled job · its last run succeeded");
    expect(html).toContain("not recorded");
  });
});
