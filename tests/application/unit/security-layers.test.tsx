// Security, drawn as a cross-section.
//
// Two things the rings could not do, which are the reason this replaced them,
// and which have to keep being true: every way in on record is drawn
// somewhere, and where it stops is a different question from how sure anyone
// is that it stops there.
//
// The rings answered both with one circle. A port that refused was not on the
// drawing at all — it was listed underneath it — and certainty survived only
// as the weight of a stroke, so a port the deployment merely asked for looked
// like a port something had connected to.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { reachFromRecords } from "@/components/hallvi/reach-records";
import {
  basisOf,
  BANDS,
  LayersDirection,
  placeOf,
  probed,
} from "@/components/hallvi/reach-prototype/layers";
import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const read = (records: Parameters<typeof reachFromRecords>[0]["records"]) =>
  reachFromRecords({
    records,
    applicationId: APP,
    applicationName: "Shop",
    now: NOW,
  });

const draw = (records: Parameters<typeof reachFromRecords>[0]["records"]) =>
  renderToStaticMarkup(
    <LayersDirection
      story={read(records)}
      now={NOW}
      head={null}
      activity={null}
      onAsk={() => undefined}
      onOpenDestination={() => undefined}
    />,
  );

const AT = "2026-09-13T11:50:00.000Z";

const openDoor = states(
  { kind: "door", id: "https" },
  {
    at: AT,
    title: "HTTPS is open to everyone",
    facts: [fact("port", "443"), fact("sources", "anywhere")],
    checks: [check("open", "passed", "reachability")],
  },
);

const refusedDoor = () =>
  states(
    { kind: "door", id: "postgres" },
    {
      at: AT,
      title: "The database port refuses from outside",
      facts: [fact("port", "5432"), fact("sources", "the container network")],
      checks: [
        check("refused", "passed", "reachability", {
          detail: "timed out from outside",
        }),
      ],
    },
  );

describe("every way in is drawn somewhere", () => {
  it("shows a port that did not answer without attributing the cause to the provider firewall", () => {
    const story = read([openDoor, refusedDoor()]);
    const ways = story.doors.filter((door) => door.id !== "rest");
    expect(ways).toHaveLength(2);
    const refused = ways.find((door) => door.port === "5432")!;
    expect(placeOf(refused)).toBe("refused");
    expect(BANDS.find((band) => band.holds === "refused")?.id).toBe(
      "unreached",
    );
    // Both ports reach the page, which is the regression that matters: the
    // rings drew one and exiled the other.
    const html = draw([openDoor, refusedDoor()]);
    expect(html).toContain("443");
    expect(html).toContain("5432");
    expect(html).toContain(
      "A connection check does not identify what stopped it.",
    );
  });

  it("gives every way in exactly one band, or the unlooked-at group", () => {
    const story = read([openDoor, refusedDoor()]);
    for (const door of story.doors.filter((one) => one.id !== "rest")) {
      const place = placeOf(door);
      const bands = BANDS.filter((band) => band.holds === place);
      expect(bands.length + (place === "unasked" ? 1 : 0)).toBe(1);
    }
  });

  it("draws a band with nothing in it rather than leaving the question open", () => {
    // Only a private way in: the internet band is empty and has to say so.
    const html = draw([
      states(
        { kind: "door", id: "loopback" },
        {
          at: AT,
          title: "Reachable through the tunnel",
          facts: [
            fact("port", "18321 → 3000"),
            fact("sources", "Server loopback via SSH tunnel"),
          ],
          checks: [check("open", "passed", "reachability")],
        },
      ),
    ]);
    expect(html).toContain("Nothing on record answers from out here.");
  });
});

describe("how sure we are is separate from how far in it reaches", () => {
  it("does not read a check that did not settle as nobody having looked", () => {
    // A check that ran and reported neither open nor refused. The projection
    // calls this `looked`, and rounding it down to "nothing has connected to
    // it" is the softer sentence and the wrong one.
    const unsettled = [
      states(
        { kind: "door", id: "http" },
        {
          at: AT,
          title: "The private way in stopped answering",
          facts: [fact("port", "8080")],
          checks: [check("open", "info", "reachability")],
        },
      ),
    ];
    const door = read(unsettled).doors.find((one) => one.id !== "rest")!;
    expect(basisOf(door)).toBe("looked");
    expect(probed(door)).toBe(true);

    const html = draw(unsettled);
    expect(html).toContain("unsettled");
    expect(html).not.toContain("not checked");
    expect(html).toContain("1 of 1 connection checked");
  });

  it("marks a port something connected to apart from one only configured", () => {
    const configured = states(
      { kind: "door", id: "ssh" },
      { at: AT, title: "SSH", facts: [fact("port", "22")] },
    );
    const story = read([openDoor, configured]);
    const ways = story.doors.filter((one) => one.id !== "rest");
    const checked = ways.find((one) => one.port === "443")!;
    const unchecked = ways.find((one) => one.port === "22")!;
    expect(probed(checked)).toBe(true);
    expect(probed(unchecked)).toBe(false);
    expect(basisOf(checked)).not.toBe(basisOf(unchecked));
  });

  it("counts what has been checked without calling any of it a verdict", () => {
    const html = draw([openDoor, refusedDoor()]);
    expect(html).toContain("connection checked");
    expect(html).toContain("Answers the internet");
    // Exposure is stated, never graded: a public site needs a port open.
    expect(html).not.toMatch(/\b(secure|insecure|safe|at risk|vulnerable)\b/i);
  });
});
