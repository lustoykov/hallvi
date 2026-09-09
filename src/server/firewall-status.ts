import { z } from "zod";
import { hetzner } from "./hetzner";
import type { SecurityFacts } from "./application-facts";

const ruleSchema = z.object({
  direction: z.enum(["in", "out"]),
  protocol: z.enum(["tcp", "udp", "icmp", "esp", "gre"]),
  port: z.string().nullable().optional(),
  source_ips: z.array(z.string()).optional(),
});
type Rule = z.infer<typeof ruleSchema>;
export type FirewallStatus = {
  serverId: number;
  checkedAt: string;
  state: "applied" | "pending" | "none";
  firewalls: { id: number; name: string; status: string; rules: Rule[] }[];
  access: { port: number; sources: string[] }[];
};

/** Include traffic allowed by every attached firewall. */
export function tcpSources(rules: Rule[], port: number): string[] {
  return [
    ...new Set(
      rules.flatMap((rule) => {
        if (rule.direction !== "in" || rule.protocol !== "tcp") return [];
        const range = /^(\d+)(?:-(\d+))?$/.exec(rule.port ?? "");
        const matches =
          rule.port === "any" ||
          (range &&
            port >= Number(range[1]) &&
            port <= Number(range[2] ?? range[1]));
        return matches ? (rule.source_ips ?? []) : [];
      }),
    ),
  ];
}

export async function readFirewallStatus(
  serverId: number,
): Promise<FirewallStatus> {
  const { server } = z
    .object({
      server: z.object({
        id: z.number(),
        public_net: z.object({
          firewalls: z.array(z.object({ id: z.number(), status: z.string() })),
        }),
      }),
    })
    .parse(await hetzner(`/servers/${serverId}`));
  if (server.id !== serverId) throw new Error("Unexpected server response.");
  const firewalls = await Promise.all(
    server.public_net.firewalls.map(async (attached) => {
      const { firewall } = z
        .object({
          firewall: z.object({
            id: z.number(),
            name: z.string(),
            rules: z.array(ruleSchema),
          }),
        })
        .parse(await hetzner(`/firewalls/${attached.id}`));
      if (firewall.id !== attached.id)
        throw new Error("Unexpected firewall response.");
      return { ...firewall, status: attached.status };
    }),
  );
  return {
    serverId,
    checkedAt: new Date().toISOString(),
    state: !firewalls.length
      ? "none"
      : firewalls.every((item) => item.status === "applied")
        ? "applied"
        : "pending",
    firewalls,
    access: [80, 443, 22].map((port) => ({
      port,
      sources: tcpSources(
        firewalls.flatMap((item) => item.rules),
        port,
      ),
    })),
  };
}

/** Map provider evidence without inferring authentication or listeners. */
export function firewallFacts(status: FirewallStatus): SecurityFacts {
  return {
    firewall: {
      state:
        status.state === "applied"
          ? "active"
          : status.state === "none"
            ? "not-configured"
            : "unknown",
      provider: "Hetzner Cloud",
      name: status.firewalls.map((item) => item.name).join(", ") || null,
      lastCheckedAt: status.checkedAt,
      detail:
        status.state === "none"
          ? "No Hetzner firewall is attached. Incoming traffic is not restricted by a Hetzner firewall."
          : status.state === "pending"
            ? "Firewall changes are pending. The listed rules are not confirmed as applied."
            : `${status.firewalls.length} attached firewall${status.firewalls.length === 1 ? "" : "s"} applied.`,
    },
    rules: status.firewalls.flatMap((firewall) =>
      firewall.rules.flatMap((rule, index) =>
        rule.direction !== "in"
          ? []
          : [
              {
                id: `${firewall.id}:${index}`,
                port: rule.port ?? "all",
                protocol: rule.protocol,
                sources: rule.source_ips ?? [],
                reach: (rule.source_ips ?? []).some(
                  (source) => source === "0.0.0.0/0" || source === "::/0",
                )
                  ? ("internet" as const)
                  : ("restricted" as const),
              },
            ],
      ),
    ),
    ssh: {
      state: "unknown",
      detail:
        "Firewall rules do not verify SSH authentication settings or who holds a key.",
    },
    privateServices: [],
    privateServicesDetail:
      "Listening services and host networking were not inspected by this provider check.",
  };
}
