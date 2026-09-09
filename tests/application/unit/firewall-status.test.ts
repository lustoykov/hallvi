import { expect, it, vi } from "vitest";
vi.mock("../../../src/server/hetzner", () => ({ hetzner: vi.fn() }));
import { hetzner } from "../../../src/server/hetzner";
import {
  firewallFacts,
  readFirewallStatus,
  tcpSources,
} from "../../../src/server/firewall-status";

it("combines manual and managed firewalls rather than claiming restricted HTTP", async () => {
  vi.mocked(hetzner).mockImplementation(async (path) =>
    path === "/servers/1"
      ? {
          server: {
            id: 1,
            public_net: {
              firewalls: [
                { id: 2, status: "applied" },
                { id: 3, status: "applied" },
              ],
            },
          },
        }
      : {
          firewall: {
            id: Number(path.split("/").pop()),
            name: "test",
            rules: [
              {
                direction: "in",
                protocol: "tcp",
                port: "80",
                source_ips:
                  path === "/firewalls/2" ? ["192.0.2.4/32"] : ["0.0.0.0/0"],
              },
            ],
          },
        },
  );
  const status = await readFirewallStatus(1);
  expect(status.state).toBe("applied");
  expect(status.access.find((item) => item.port === 80)?.sources).toEqual([
    "192.0.2.4/32",
    "0.0.0.0/0",
  ]);
});

it("matches TCP ranges and any ports, excluding outbound and UDP rules", () => {
  expect(
    tcpSources(
      [
        {
          direction: "in",
          protocol: "tcp",
          port: "70-90",
          source_ips: ["192.0.2.4/32"],
        },
        { direction: "in", protocol: "tcp", port: "any", source_ips: ["::/0"] },
        {
          direction: "in",
          protocol: "udp",
          port: "80",
          source_ips: ["0.0.0.0/0"],
        },
        {
          direction: "out",
          protocol: "tcp",
          port: "80",
          source_ips: ["0.0.0.0/0"],
        },
      ],
      80,
    ),
  ).toEqual(["192.0.2.4/32", "::/0"]);
});

it("does not report enabled when no firewall is attached", async () => {
  vi.mocked(hetzner).mockResolvedValue({
    server: { id: 1, public_net: { firewalls: [] } },
  });
  expect((await readFirewallStatus(1)).state).toBe("none");
});

it("does not report enabled while a firewall is being applied", async () => {
  vi.mocked(hetzner).mockImplementation(async (path) =>
    path === "/servers/1"
      ? {
          server: {
            id: 1,
            public_net: { firewalls: [{ id: 2, status: "pending" }] },
          },
        }
      : { firewall: { id: 2, name: "test", rules: [] } },
  );
  expect((await readFirewallStatus(1)).state).toBe("pending");
});

it("maps only provider observations into Security facts", () => {
  const facts = firewallFacts({
    serverId: 1,
    checkedAt: "2026-09-09T14:00:00Z",
    state: "applied",
    access: [],
    firewalls: [
      {
        id: 7,
        name: "manual",
        status: "applied",
        rules: [
          {
            direction: "in",
            protocol: "tcp",
            port: "1-100",
            source_ips: ["0.0.0.0/0", "::/0"],
          },
          { direction: "in", protocol: "icmp", source_ips: ["192.0.2.0/24"] },
          { direction: "out", protocol: "tcp", port: "443" },
        ],
      },
    ],
  });
  expect(facts.firewall.state).toBe("active");
  expect(facts.rules).toEqual([
    {
      id: "7:0",
      port: "1-100",
      protocol: "tcp",
      sources: ["0.0.0.0/0", "::/0"],
      reach: "internet",
    },
    {
      id: "7:1",
      port: "all",
      protocol: "icmp",
      sources: ["192.0.2.0/24"],
      reach: "restricted",
    },
  ]);
  expect(facts.ssh.state).toBe("unknown");
  expect(facts.privateServices).toEqual([]);
  expect(facts.privateServicesDetail).toContain("not inspected");
});

it.each([
  ["none", "not-configured"],
  ["pending", "unknown"],
] as const)(
  "keeps %s firewall status distinct from confirmed protection",
  (state, expected) => {
    expect(
      firewallFacts({
        serverId: 1,
        checkedAt: "2026-09-09",
        state,
        firewalls: [],
        access: [],
      }).firewall.state,
    ).toBe(expected);
  },
);
