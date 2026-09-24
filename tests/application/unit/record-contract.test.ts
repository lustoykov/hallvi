// The save-time contract. Each case is something that parses cleanly and
// would still produce a page that lies or renders nothing, and each message
// has to tell Pi what to write instead.

import { expect, it, describe } from "vitest";

import { informationInputSchema } from "@/server/operator-data";
import { reviewRecord } from "@/server/record-contract";

function review(record: unknown) {
  return reviewRecord(informationInputSchema.parse(record));
}

const host = { kind: "host", id: "hetzner-165600952" } as const;

const good = {
  title: "The host answers and carries nothing yet",
  body: "It is ready to take the application.",
  establishedAt: "2026-09-12T15:48:00.000Z",
  presentation: {
    about: [host],
    states: { ref: host, presence: "present" },
    views: ["deployment"],
    role: "outcome",
    status: "verified",
    checks: [
      {
        key: "ssh",
        label: "SSH connected",
        status: "passed",
        claim: "reachability",
        basis: "observed",
        about: host,
      },
    ],
    facts: [
      {
        key: "region",
        label: "Location",
        value: "Helsinki",
        claim: "configuration",
        basis: "reported",
      },
    ],
  },
};

describe("a record that can be drawn", () => {
  it("passes without comment", () => {
    expect(review(good)).toEqual([]);
  });

  it("says nothing about working knowledge, which no view draws", () => {
    expect(
      review({
        title: "A preference",
        body: "Keep it private.",
        presentation: null,
      }),
    ).toEqual([]);
  });
});

describe("what would make a record unreadable", () => {
  it("asks for the key, claim and basis a check is missing, and suggests one", () => {
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        checks: [{ label: "Server is running", status: "passed" }],
      },
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Check 1 ("Server is running")');
    expect(found[0]).toContain("missing key, claim, basis");
    expect(found[0]).toContain('"server-is-running"');
    expect(found[0]).toContain("reachability");
  });

  it("refuses two checks sharing a key, because one would erase the other", () => {
    const check = good.presentation.checks[0];
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        checks: [check, { ...check, label: "Also SSH" }],
      },
    });
    expect(found.some((item) => item.includes('share the key "ssh"'))).toBe(
      true,
    );
  });

  it("replaces the authored lane with the thing that was checked", () => {
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        checks: [{ ...good.presentation.checks[0], subject: "server" }],
      },
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("subject, which is no longer read");
    expect(found[0]).toContain("about: {kind, id}");
  });

  it("will not let facts float free of the thing they describe", () => {
    const { states, about, ...rest } = good.presentation;
    const found = review({ ...good, presentation: rest });
    expect(found.some((item) => item.includes("does not say what"))).toBe(true);
  });

  it("will not let a check float free either", () => {
    const { states, ...rest } = good.presentation;
    const found = review({
      ...good,
      presentation: {
        ...rest,
        facts: undefined,
        checks: [{ ...good.presentation.checks[0], about: undefined }],
      },
    });
    expect(found.some((item) => item.includes("nothing to attach to"))).toBe(
      true,
    );
  });

  it("accepts a check that names what it checked on a record stating nothing", () => {
    const { states, ...rest } = good.presentation;
    expect(
      review({ ...good, presentation: { ...rest, facts: undefined } }),
    ).toEqual([]);
  });

  it("will not let a record claim verified with no time behind it", () => {
    const found = review({ ...good, establishedAt: null });
    expect(
      found.some((item) => item.includes("establishedAt is missing")),
    ).toBe(true);
  });

  it("will not let an absence describe the thing it says is gone", () => {
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        states: { ref: host, presence: "absent" },
        checks: [],
      },
    });
    expect(
      found.some((item) => item.includes("is absent and then carries facts")),
    ).toBe(true);
  });

  it("will not let a planned check report an outcome", () => {
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        checks: [{ ...good.presentation.checks[0], basis: "planned" }],
      },
    });
    expect(
      found.some((item) =>
        item.includes("is planned, so it cannot have passed"),
      ),
    ).toBe(true);
  });
});

describe("the map", () => {
  const topology = {
    kind: "topology",
    from: "observed",
    parts: [
      {
        id: "host",
        kind: "host",
        name: "The server",
        role: "Runs the container",
        plain: "The machine your app runs on",
      },
      {
        id: "web",
        kind: "web",
        name: "The app",
        role: "Serves requests",
        plain: "Your application itself",
      },
    ],
    edges: [{ from: "host", to: "web", network: "loopback" }],
  };

  it("accepts a map on the record that speaks for the application", () => {
    expect(
      review({
        ...good,
        presentation: {
          ...good.presentation,
          states: {
            ref: { kind: "application", id: "app-1" },
            presence: "present",
          },
          content: topology,
        },
      }),
    ).toEqual([]);
  });

  it("refuses a map on a record that does not state the application", () => {
    const found = review({
      ...good,
      presentation: { ...good.presentation, content: topology },
    });
    expect(found.some((item) => item.includes("has to speak for it"))).toBe(
      true,
    );
  });

  it("refuses an edge that joins something the map never draws", () => {
    const found = review({
      ...good,
      presentation: {
        ...good.presentation,
        states: {
          ref: { kind: "application", id: "app-1" },
          presence: "present",
        },
        content: {
          ...topology,
          edges: [{ from: "host", to: "database", network: "private" }],
        },
      },
    });
    expect(found.some((item) => item.includes('names "database"'))).toBe(true);
  });
});

describe("a variable never carries its value", () => {
  const variable = {
    kind: "variable",
    id: "GF_SECURITY_ADMIN_PASSWORD",
  } as const;
  const record = (facts: object[]) =>
    review({
      title: "Grafana has an admin password",
      body: "",
      establishedAt: "2026-09-13T07:00:00.000Z",
      presentation: {
        states: { ref: variable, presence: "present" },
        views: ["variables"],
        role: "status",
        status: "verified",
        checks: [],
        facts,
      },
    });

  it("refuses a value key", () => {
    const found = record([
      {
        key: "value",
        label: "Value",
        value: "hunter2",
        claim: "configuration",
        basis: "reported",
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("never the value itself");
    expect(found[0]).toContain("request_secret");
  });

  it("accepts where it came from", () => {
    expect(
      record([
        {
          key: "source",
          label: "Source",
          value: "Supplied by you",
          claim: "configuration",
          basis: "reported",
        },
        {
          key: "established",
          label: "Established",
          value: "Yes",
          claim: "configuration",
          basis: "observed",
        },
      ]),
    ).toEqual([]);
  });

  it("catches a credential pasted into any fact, on any subject", () => {
    const found = review({
      title: "Connected",
      body: "",
      establishedAt: "2026-09-13T07:00:00.000Z",
      presentation: {
        states: { ref: host, presence: "present" },
        views: ["deployment"],
        role: "status",
        status: "verified",
        checks: [],
        facts: [
          {
            key: "token",
            label: "Token",
            value: `ghp_${"a".repeat(36)}`,
            claim: "identity",
            basis: "reported",
          },
        ],
      },
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("credential-shaped");
  });
});

// A public entry point is a different claim from a private one, and the two
// mistakes worth refusing at the write are the ones that read as success: a
// public record still carrying the tunnel that publishing was meant to
// remove, and a public record whose address is this PC.
describe("the record that says how the application is reached", () => {
  const app = { kind: "application", id: "app-1" } as const;
  const access = (
    content: Record<string, unknown>,
    url = "https://paper.example.com",
  ) =>
    informationInputSchema.safeParse({
      title: "Paper answers at its own name",
      body: "",
      establishedAt: "2026-09-15T09:00:00.000Z",
      presentation: {
        states: { ref: app, presence: "present" },
        views: ["access"],
        role: "status",
        status: "verified",
        checks: [],
        url,
        content: { kind: "application-access", server: "host-1", ...content },
      },
    });

  it("accepts a published address", () => {
    expect(access({ mode: "public" }).success).toBe(true);
  });

  it("refuses a public record that still carries the tunnel", () => {
    const result = access({ mode: "public", localPort: 8080, remotePort: 80 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "not reached through a tunnel",
    );
  });

  it("refuses a public address that is this controller", () => {
    const result = access({ mode: "public" }, "http://127.0.0.1:8080");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "not a public address",
    );
  });

  it("still requires the tunnel's two ends on a private record", () => {
    const result = access({ mode: "private" }, "http://127.0.0.1:8080");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "localPort and remotePort",
    );
  });
});

// Withdrawing something is an event. Writing it as a passing check on the
// record that says the thing is gone leaves every reader of that subject
// holding a check that says it works.
describe("a record that says a thing is not there", () => {
  const domain = { kind: "domain", id: "shop-example-com" } as const;
  const absence = (checks: object[]) =>
    review({
      title: "The name was withdrawn",
      body: "",
      establishedAt: "2026-09-15T12:55:00.000Z",
      presentation: {
        states: { ref: domain, presence: "absent" },
        views: ["access"],
        role: "outcome",
        status: "verified",
        checks,
      },
    });

  it("refuses a passing check about the absent subject", () => {
    const found = absence([
      {
        key: "resolves",
        label: "The name resolves",
        status: "passed",
        claim: "reachability",
        basis: "observed",
        about: domain,
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("nothing works about a thing that is absent");
  });

  it("refuses it just as firmly when the check names nothing", () => {
    expect(
      absence([
        {
          key: "resolves",
          label: "The name resolves",
          status: "passed",
          claim: "reachability",
          basis: "observed",
        },
      ]),
    ).toHaveLength(1);
  });

  it("allows an informational note about the withdrawal itself", () => {
    expect(
      absence([
        {
          key: "withdrawn",
          label: "The record was removed at the provider",
          status: "info",
          claim: "configuration",
          basis: "observed",
          about: domain,
        },
      ]),
    ).toEqual([]);
  });

  it("leaves a passing check about something else alone", () => {
    expect(
      absence([
        {
          key: "private",
          label: "The tunnel answers",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "access", id: "tunnel" },
        },
      ]),
    ).toEqual([]);
  });
});
