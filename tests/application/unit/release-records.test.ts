// Which release is running, when the newest one is not.
//
// Deployment read the newest deployment record and called it the release, so
// an update that built an image and could not start replaced a release that
// had been serving for days. The page then answered "what is running?" with
// the thing that is not running.

import { describe, expect, it } from "vitest";

import {
  releaseHeadline,
  releasesFromRecords,
} from "@/components/server-guy/release-records";
import type { SavedInformation } from "@/server/operator-data";

const APP = "11111111-2222-4333-8444-555555555555";

const release = (
  id: string,
  at: string,
  revision: string,
  outcome: "deployed" | "failed" | "attempted",
): SavedInformation =>
  ({
    id,
    applicationId: APP,
    title: id,
    body: "",
    evidence: [],
    establishedAt: at,
    createdAt: at,
    updatedAt: at,
    retiredAt: null,
    presentation: {
      views: ["deployment"],
      role: "outcome",
      status:
        outcome === "failed"
          ? "failed"
          : outcome === "deployed"
            ? "verified"
            : "info",
      checks:
        outcome === "attempted"
          ? []
          : [
              {
                key: "started",
                label: "The container started",
                status: outcome === "deployed" ? "passed" : "failed",
              },
            ],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/shop",
        revision,
        image: `ghcr.io/qa/shop:${revision.slice(0, 7)}`,
        server: "shop-host",
        changes: ["A change"],
      },
    },
  }) as unknown as SavedInformation;

describe("what is running, and what happened last", () => {
  it("keeps the last verified release without claiming it survived a failed update", () => {
    const view = releasesFromRecords(
      [
        release("r1", "2026-09-10T10:00:00.000Z", "aaaaaaa1111", "deployed"),
        release("r2", "2026-09-14T10:00:00.000Z", "bbbbbbb2222", "failed"),
      ],
      APP,
    );
    expect(view.running?.id).toBe("r1");
    expect(view.latest?.id).toBe("r2");
    const said = releaseHeadline(view);
    expect(said.says).toBe("Last verified release: aaaaaaa.");
    expect(said.limit).toBe(
      "The update to bbbbbbb failed. Check what is running now.",
    );
  });

  it("says unknown rather than the previous release when nothing was established", () => {
    // Something ran and no check came back. The old container may already be
    // gone, so naming the previous release as what is running is a guess.
    const view = releasesFromRecords(
      [
        release("r1", "2026-09-10T10:00:00.000Z", "aaaaaaa1111", "deployed"),
        release("r2", "2026-09-14T10:00:00.000Z", "bbbbbbb2222", "attempted"),
      ],
      APP,
    );
    expect(view.running?.id).toBe("r1");
    expect(releaseHeadline(view).says).toBe("Last verified release: aaaaaaa.");
    expect(releaseHeadline(view).limit).toContain("unconfirmed");
  });

  it("is one fact when the newest release is the running one", () => {
    const view = releasesFromRecords(
      [
        release("r1", "2026-09-10T10:00:00.000Z", "aaaaaaa1111", "deployed"),
        release("r2", "2026-09-14T10:00:00.000Z", "bbbbbbb2222", "deployed"),
      ],
      APP,
    );
    expect(view.running?.id).toBe("r2");
    expect(releaseHeadline(view).limit).toBeNull();
  });

  it("does not invent a release from no record", () => {
    const view = releasesFromRecords([], APP);
    expect(view.all).toEqual([]);
    expect(releaseHeadline(view).says).toContain("Nothing has been released");
  });

  it("keeps every earlier release, newest first", () => {
    const view = releasesFromRecords(
      [
        release("r2", "2026-09-14T10:00:00.000Z", "bbbbbbb2222", "deployed"),
        release("r1", "2026-09-10T10:00:00.000Z", "aaaaaaa1111", "deployed"),
        release("r3", "2026-09-15T10:00:00.000Z", "ccccccc3333", "failed"),
      ],
      APP,
    );
    expect(view.all.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
  });
});
