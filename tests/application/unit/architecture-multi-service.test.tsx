// A stack with more than one backing service, drawn.
//
// Paperless-ngx runs PostgreSQL and Valkey and keeps three volumes; the map
// placed the first service and at most two volumes and silently dropped the
// rest, so the page showed a two-service application where a three-service
// one had been recorded — and the volume it left out was the one holding the
// owner's documents.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/server-guy/architecture-records";
import { JourneyDirection } from "@/components/server-guy/architecture-prototype/journey-v2";
import type { Recheck } from "@/components/server-guy/architecture-prototype/use-recheck";
import type { SavedInformation } from "@/server/operator-data";

const APPLICATION = "26820a4b-a4c2-49f8-8002-678503aeb385";
const NOW = Date.parse("2026-09-13T18:00:00.000Z");
const AT = "2026-09-13T17:55:00.000Z";

const idle: Recheck = {
  phase: "idle",
  marks: {},
  active: null,
  run: () => undefined,
  reset: () => undefined,
};

const part = (id: string, kind: string, name: string, role = "", plain = "") =>
  ({ id, kind, name, role, plain }) as never;

const map: SavedInformation = {
  id: "rec-map",
  applicationId: APPLICATION,
  title: "Paper uses a private three-service topology",
  body: "",
  evidence: [],
  establishedAt: AT,
  presentation: {
    states: {
      ref: { kind: "application", id: APPLICATION },
      presence: "present",
    },
    views: ["architecture"],
    role: "outcome",
    status: "verified",
    checks: [],
    content: {
      kind: "topology",
      from: "observed",
      parts: [
        part("controller", "controller", "Server Guy controller"),
        part("paper-host", "host", "paper-26820a4b"),
        part("paperless-web", "web", "Paperless-ngx"),
        part("paperless-db-process", "private", "PostgreSQL"),
        part("paperless-cache-process", "private", "Valkey"),
        part("paperless-data-volume", "volume", "Application data"),
        part("paperless-media-volume", "volume", "Document media"),
        part("paperless-pgdata-volume", "volume", "Database data"),
      ],
      edges: [
        {
          from: "paper-host",
          to: "paperless-web",
          network: "loopback",
        },
        {
          from: "paperless-web",
          to: "paperless-db-process",
          network: "private",
        },
        {
          from: "paperless-web",
          to: "paperless-cache-process",
          network: "private",
        },
        {
          from: "paperless-web",
          to: "paperless-data-volume",
          network: "disk",
        },
        {
          from: "paperless-web",
          to: "paperless-media-volume",
          network: "disk",
        },
        {
          from: "paperless-db-process",
          to: "paperless-pgdata-volume",
          network: "disk",
        },
      ],
    } as never,
  },
  createdAt: AT,
  updatedAt: AT,
  retiredAt: null,
};

const model = architectureFromRecords({
  records: [map],
  applicationId: APPLICATION,
  applicationName: "Paper",
  now: NOW,
})!;

describe("a map with two backing services and three volumes", () => {
  it("gives every part its own place", () => {
    expect(
      model.parts.filter((item) => !item.id.startsWith("gap:")).length,
    ).toBe(8);
    const html = renderToStaticMarkup(
      <JourneyDirection
        model={model}
        recheck={idle}
        onOpenDestination={() => undefined}
        onAsk={() => undefined}
      />,
    );
    for (const name of [
      "Paperless-ngx",
      "PostgreSQL",
      "Valkey",
      "Application data",
      "Document media",
      "Database data",
    ])
      expect(html, `${name} is on record and must be drawn`).toContain(name);
  });

  it("still draws an application with one service exactly where it did", () => {
    const single = architectureFromRecords({
      records: [
        {
          ...map,
          presentation: {
            ...map.presentation!,
            content: {
              ...(map.presentation!.content as never as {
                parts: unknown[];
                edges: unknown[];
              }),
              parts: (
                map.presentation!.content as never as {
                  parts: { id: string }[];
                }
              ).parts.filter(
                (item) =>
                  ![
                    "paperless-cache-process",
                    "paperless-media-volume",
                  ].includes(item.id),
              ),
            } as never,
          },
        },
      ],
      applicationId: APPLICATION,
      applicationName: "Paper",
      now: NOW,
    })!;
    const html = renderToStaticMarkup(
      <JourneyDirection
        model={single}
        recheck={idle}
        onOpenDestination={() => undefined}
        onAsk={() => undefined}
      />,
    );
    // The design's own coordinates for the one-service case, untouched:
    // the service at 612/1120 across, the two volumes in their own slots,
    // and the original straight disk wires.
    expect(html).toContain("left:54.64285714285714%;top:40.400000000000006%");
    expect(html).toContain('d="M430 338V434"');
    expect(html).toContain('d="M710 338V434"');
    expect(html).toContain("Application data");
    expect(html).not.toContain("Valkey");
  });
});
