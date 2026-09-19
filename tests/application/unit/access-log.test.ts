// The live access log. What matters here: the command the controller runs is
// its own and cannot be steered by a record, and what reaches the browser
// carries no address and no query string.

import { describe, expect, it } from "vitest";

import { followCommand, parseCaddyLine } from "@/server/access-log";
import { informationInputSchema } from "@/server/operator-data";
import { reviewRecord } from "@/server/record-contract";

// A line Caddy 2 actually wrote, shortened only in its headers.
const line =
  '{"level":"error","ts":1789817074.446724,"logger":"http.log.access.log0","msg":"handled request","request":{"remote_ip":"172.17.0.1","remote_port":"65028","client_ip":"203.0.113.9","proto":"HTTP/1.1","method":"POST","host":"shop.example","uri":"/checkout/pay?token=secret#x","headers":{}},"duration":0.0421,"size":4,"status":500}';

const record = (source: unknown) => ({
  title: "Caddy access log",
  body: "Caddy writes one JSON line per request.",
  establishedAt: "2026-09-19T10:00:00.000Z",
  presentation: {
    views: ["overview"],
    role: "status",
    status: "info",
    checks: [],
    facts: [],
    content: {
      kind: "access-log",
      proxy: "Caddy",
      format: "caddy-json",
      source,
    },
  },
});

describe("the access log", () => {
  it("reads a request and leaves the person out of it", () => {
    const parsed = parseCaddyLine(`caddy-1  | ${line}`);
    expect(parsed).toMatchObject({
      method: "POST",
      path: "/checkout/pay",
      status: 500,
      ms: 42,
      at: 1789817074447,
    });
    expect(JSON.stringify(parsed)).not.toMatch(/203\.0\.113\.9|secret/);
    // Two requests from one address are one visitor.
    expect(parseCaddyLine(line)?.visitor).toBe(parsed?.visitor);
  });

  it("ignores everything that is not a request", () => {
    expect(parseCaddyLine("hallvi-following")).toBeNull();
    expect(parseCaddyLine('{"level":"info","msg":"serving"}')).toBeNull();
    expect(parseCaddyLine("{not json")).toBeNull();
  });

  it("accepts a record that says where the log is", () => {
    for (const source of [
      { type: "container", name: "shop-caddy-1" },
      { type: "file", path: "/var/log/caddy/access.log" },
    ]) {
      const parsed = informationInputSchema.parse(record(source));
      expect(reviewRecord(parsed)).toEqual([]);
    }
  });

  it("refuses a location that could carry a command", () => {
    for (const source of [
      { type: "container", name: "caddy; rm -rf /" },
      { type: "container", name: "$(reboot)" },
      { type: "file", path: "/var/log/x'; reboot #" },
      { type: "file", path: "/var/log/../../etc/shadow" },
      { type: "file", path: "relative.log" },
    ])
      expect(informationInputSchema.safeParse(record(source)).success).toBe(
        false,
      );
  });

  it("only ever reads", () => {
    expect(
      followCommand({ type: "file", path: "/var/log/caddy/access.log" }),
    ).toBe(
      "echo hallvi-following; exec tail -n 400 -F '/var/log/caddy/access.log'",
    );
    expect(
      followCommand({ type: "container", name: "shop-caddy-1" }),
    ).toContain("docker logs --since 5m --follow 'shop-caddy-1'");
  });
});
