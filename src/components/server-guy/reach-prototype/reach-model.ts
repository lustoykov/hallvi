// PROTOTYPE · opus-ui-improvements · chosen for Domains and Security.
// What both pages read: what a visitor meets when they knock — the address,
// the name and certificate in front of it, and what the record says each
// kind of caller would get — and every way in the record can account for:
// the ports the deployment asked the provider to open, who they were opened
// to, what listens behind them and what protects the server without being a
// way in. Built on the story the Processes page reads (stack-model.ts).
// Nothing here contacts a host: the firewall read-back is the one the
// shipped Security view makes, and the scenarios that invent one say so.

import type {
  ApplicationFacts,
  DomainFacts,
  SecurityFacts,
} from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts, primaryHttp } from "@/server/release-facts";

import { ago, FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import {
  buildStackStory,
  when,
  type ProcessCard,
  type StackStory,
} from "../stack-prototype/stack-model";

export { when };

/** How far a way in reaches. */
// The five the Callers and Rings designs draw are shared with the records
// path, so they live beside those designs rather than inside this builder.
export type { Caller, Door, Guard, Hole, Reach, Told } from "./reach-story";
import type { Caller, Door, Guard, Hole, Reach, Told } from "./reach-story";

export interface ReachStory extends StackStory {
  address: string | null;
  domain: DomainFacts["domain"];
  tls: DomainFacts["tls"];
  /** Who the deployment opened HTTP to. */
  audience: "public" | "controller";
  controllerIp: string | null;
  callers: Caller[];
  doors: Door[];
  ssh: { word: string; tone: Tone; detail: string; told: Told };
  firewall: {
    state: "read" | "asked" | "none";
    provider: string;
    name: string | null;
    at: string | null;
    detail: string;
  };
  guards: Guard[];
  holes: Hole[];
  /** The scenario that invented part of this, in words. */
  invented: string | null;
}

/** The web process, which is what a visitor reaches. */
const webOf = (processes: ProcessCard[]) =>
  processes.find((item) => item.role === "web") ?? null;

/** An invented domain, so the connected page can be seen at all. */
function inventDomain(host: string | null, now: number): DomainFacts {
  const day = 86_400_000;
  return {
    address: host ? `http://${host}` : null,
    domain: {
      name: "grafana.example.com",
      provider: "cloudflare",
      state: "resolving",
      detail: `The name points at ${host ?? "this server"}, and this server answers for it.`,
    },
    tls: {
      state: "valid",
      issuer: "Let’s Encrypt",
      expiresAt: new Date(now + 76 * day).toISOString(),
      renewal: "Renewed automatically 30 days before it expires.",
    },
    cdn: {
      state: "not-useful",
      detail:
        "A dashboard serves almost nothing cacheable, so a CDN would add a hop without saving one.",
    },
    routes: [],
  };
}

/** An invented provider read, shaped exactly as firewallFacts() shapes one. */
function inventRead(
  record: DeploymentRecord | null,
  controllerIp: string | null,
  now: number,
): SecurityFacts {
  const name = record ? `sg-${record.id.slice(0, 8)}` : "sg-firewall";
  return {
    firewall: {
      state: "active",
      provider: "Hetzner Cloud",
      name,
      lastCheckedAt: new Date(now).toISOString(),
      detail: "1 attached firewall applied.",
    },
    rules: [
      {
        id: "inv:22",
        port: "22",
        protocol: "tcp",
        sources: ["0.0.0.0/0", "::/0"],
        reach: "internet",
      },
      {
        id: "inv:80",
        port: "80",
        protocol: "tcp",
        sources: [`${controllerIp ?? "203.0.113.4"}/32`],
        reach: "restricted",
      },
      {
        id: "inv:9090",
        port: "9090",
        protocol: "tcp",
        sources: ["0.0.0.0/0", "::/0"],
        reach: "internet",
      },
    ],
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

export function buildReachStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  /** "domain" invents a connected name; "checked" invents a read-back. */
  invent: "domain" | "checked" | null;
}): ReachStory {
  const { record, now, invent } = input;
  const base = buildStackStory({ ...input, now });
  const release = currentFacts(record);
  const events = record?.events ?? [];
  const said = (text: string) =>
    events.findLast((event) => event.message === text)?.at ?? null;

  const facts: ApplicationFacts =
    invent === "domain"
      ? {
          ...input.facts,
          domains: inventDomain(record?.address ?? null, now),
        }
      : input.facts;
  const controllerIp = record?.httpSourceIp ?? null;
  // A connected name means the application answers the internet; the record
  // here has HTTP held to the controller's network while it is being set up.
  const audience: ReachStory["audience"] =
    invent === "domain" || release?.httpAccess !== "controller"
      ? "public"
      : "controller";
  const security =
    invent === "checked"
      ? inventRead(record, controllerIp, now)
      : (facts.security ?? null);

  // ---- The address, taken apart so a page can set the parts separately.
  const domains = facts.domains ?? null;
  const address = domains?.address ?? record?.url ?? null;
  const parsed = (() => {
    try {
      return address ? new URL(address) : null;
    } catch {
      return null;
    }
  })();
  const tls = domains?.tls ?? { state: "not-configured" as const };
  const secure = tls.state === "valid";
  const hostName = domains?.domain?.name ?? parsed?.hostname ?? null;

  // ---- What is in front of the application.
  const web = webOf(base.processes);
  const exposed = primaryHttp(release);
  const domain = domains?.domain ?? null;
  // ---- The checks the deployment ran, which are the only proof of reach.
  const probes = base.processes.flatMap((process) =>
    process.probes.map((probe) => ({ ...probe, process })),
  );
  const newest = <T extends { at: string | null }>(list: T[]) =>
    list
      .filter((item) => item.at)
      .toSorted((a, b) => b.at!.localeCompare(a.at!))[0] ?? null;
  const fromOutside = newest(probes.filter((probe) => !probe.inside));
  const fromInside = newest(probes.filter((probe) => probe.inside));

  // ---- Every way in the record can account for.
  const preparedAt = said(
    "Preparing SSH access and a firewall for SSH and HTTP",
  );
  const restrictedAt = said(
    "HTTP restricted to this controller's network during application setup",
  );
  const guardedAt = said(
    "Metadata access restricted before running application code",
  );
  const publicPort = exposed?.published || "80";
  const httpReach: Reach =
    audience === "controller" ? "restricted" : "internet";
  const privatePort = (name: string) =>
    release?.criterion?.services.find((service) => service.name === name)
      ?.port ?? null;
  const planDoors: Door[] = [
    {
      id: "http",
      port: publicPort,
      title: web?.product ?? "The web application",
      serves: exposed ? `${exposed.service} · port ${exposed.target}` : null,
      reach: httpReach,
      sources:
        audience === "controller"
          ? [`${controllerIp ?? "your network"}/32`]
          : ["0.0.0.0/0", "::/0"],
      concern:
        audience === "controller"
          ? null
          : "Anyone on the internet can open this. That is what a public web application is for.",
      detail:
        audience === "controller"
          ? "HTTP was held to the controller’s network while the application was set up. Nobody else reaches it, and no certificate is needed yet."
          : "Port 80 carries HTTP. Without a certificate the traffic is readable on the way.",
    },
    {
      id: "ssh",
      port: "22",
      title: "Administration",
      serves: "SSH on the host",
      reach: "internet",
      sources: ["0.0.0.0/0", "::/0"],
      concern:
        "Open to every network. Only a key opens it: the host was created with password sign-in switched off.",
      detail:
        "Server Guy reaches the server this way, with a key it made for this deployment alone. The port answers from anywhere; a stranger without the key gets no further.",
    },
  ];
  const privateDoors: Door[] = base.processes
    .filter((process) => process.role === "private")
    .map((process) => ({
      id: `private:${process.name}`,
      port: String(process.port ?? privatePort(process.name) ?? ""),
      protocol: "tcp",
      title: process.product,
      serves: `${process.name} · inside the server`,
      reach: "private" as const,
      sources: [],
      concern: null,
      detail:
        "No port is published for it, so nothing outside the server can open it at all.",
    }));

  const ruleDoors: Door[] = (security?.rules ?? []).map((rule) => {
    const listener = base.processes.find(
      (process) =>
        String(process.port ?? privatePort(process.name)) === rule.port ||
        (rule.port === publicPort && process.role === "web"),
    );
    const asked =
      rule.port === "22" ||
      rule.port === publicPort ||
      planDoors.some((door) => door.port === rule.port);
    const privately = listener?.role === "private";
    return {
      id: rule.id,
      port: rule.port,
      title:
        rule.port === "22"
          ? "Administration"
          : (rule.serves ?? listener?.product ?? "Nothing recorded listens"),
      serves:
        rule.port === "22"
          ? "SSH on the host"
          : listener
            ? `${listener.name} · port ${listener.port ?? rule.port}`
            : null,
      reach: rule.reach,
      sources: rule.sources,
      concern: !asked
        ? `This deployment never asked for port ${rule.port} to be open. Someone opened it on the provider, or another application on this instance did.`
        : rule.port === "22" && rule.reach === "internet"
          ? "Open to every network. Only a key opens it: the host was created with password sign-in switched off."
          : rule.reach === "internet" && privately
            ? `${listener?.product ?? "This service"} was meant to stay inside the server.`
            : null,
      detail:
        rule.port === "22"
          ? "Server Guy reaches the server this way, with a key it made for this deployment alone."
          : listener
            ? `${listener.product} listens behind it.`
            : "Nothing in the recorded release listens on this port; an open port with nothing behind it refuses connections.",
      unasked: !asked,
    };
  });

  const unguarded = security?.firewall.state === "not-configured";
  const doors = [
    ...(security ? ruleDoors : planDoors),
    ...privateDoors,
    {
      id: "rest",
      port: "Everything else",
      protocol: "",
      title: unguarded ? "Nothing stops it" : "No way in",
      serves: null,
      reach: unguarded ? ("internet" as const) : ("closed" as const),
      reachWords: unguarded
        ? "Whatever the host happens to answer"
        : "Refused before it reaches the server",
      sources: [],
      told: security ? ("provider" as const) : ("plan" as const),
      toldWords: security
        ? "No other inbound rule is reported"
        : "The deployment asked for no other port",
      at: security?.firewall.lastCheckedAt ?? preparedAt,
      proof: null,
      concern: unguarded
        ? "No attached firewall restricts incoming traffic. Whether a port answers is left to the host and whatever listens on it."
        : null,
      detail: unguarded
        ? "No attached firewall restricts incoming traffic. Reachability depends on host networking and listening services."
        : "The provider’s firewall drops what no rule allows, before it reaches the host.",
    },
  ];

  // ---- What protects the server without being a way in. Rings names
  // these under the rings; the record's own times are what date them.
  const guards: Guard[] = [
    {
      id: "password",
      title: "Password sign-in is off on the host",
      at: preparedAt,
    },
    ...(guardedAt
      ? [
          {
            id: "metadata",
            title: "Containers cannot read the server’s cloud credentials",
            at: guardedAt,
          },
        ]
      : []),
    ...(privateDoors.length
      ? [
          {
            id: "private",
            title: `${privateDoors.map((door) => door.title).join(", ")} publish no port`,
            at: fromInside?.at ?? null,
          },
        ]
      : []),
  ];

  const holes: Hole[] = [
    ...(security?.privateServicesDetail
      ? [
          {
            id: "inspection",
            title: "The read did not look inside the server",
            detail: security.privateServicesDetail,
          },
        ]
      : []),
    ...(security
      ? []
      : [
          {
            id: "readback",
            title: "The firewall has not been read back",
            detail:
              "What you see is what the deployment asked the provider for. Nothing has confirmed the rules are still that, and a rule changed on the provider would not show here.",
          },
        ]),
    {
      id: "listeners",
      title: "Nothing tests what actually answers",
      detail:
        "An allowed port still needs a running service, and a service can listen on the host outside Compose. Neither the plan nor a provider read looks at that.",
    },
    ...(tls.state === "valid"
      ? []
      : [
          {
            id: "https",
            title: "Traffic is not encrypted",
            detail:
              "Without a certificate everything between a visitor and the server travels as plain HTTP, including the sign-in.",
          },
        ]),
    {
      id: "keys",
      title: "Who else holds a key is not recorded",
      detail:
        "Server Guy knows the key it made. A key added to the server by hand, or a key held by whoever made the provider account, would not appear anywhere in this record.",
    },
  ];

  // ---- What a visitor meets, from the record alone.
  const proofAt = fromOutside?.at ?? null;
  const callers: Caller[] = [
    {
      id: "you",
      who: "You, or anyone on your network",
      from: controllerIp ?? "your network",
      typed: address ?? "the server’s address",
      outcome: "loads",
      // The server's own address is plain HTTP whatever the name has.
      secure: false,
      headline: `${base.name} answers`,
      detail: fromOutside
        ? `A check run from outside the server passed “${fromOutside.name}”, so something answered on port ${publicPort}.`
        : "The deployment opened this port; no check has confirmed it answers.",
      sure: fromOutside ? "proved" : "asked",
      at: proofAt,
    },
    {
      id: "stranger",
      who: "Anyone else on the internet",
      from: "any other network",
      typed: address ?? "the server’s address",
      outcome: audience === "controller" ? "refused" : "loads",
      secure: false,
      headline:
        audience === "controller"
          ? "The connection is refused"
          : `${base.name} answers`,
      detail:
        audience === "controller"
          ? "HTTP is held to the controller’s network while the application is being set up. The firewall drops the connection before the server sees it. Nothing has tested this from another network."
          : "Port 80 is open to every network, which is what a public web application is for.",
      sure: "asked",
      at: restrictedAt,
    },
    {
      id: "name",
      who: "Someone typing a name",
      from: "anywhere",
      typed: `${secure ? "https" : "http"}://${domain?.name ?? "app.yourdomain.com"}`,
      outcome: domain ? (secure ? "loads" : "insecure") : "no-name",
      secure,
      headline: domain
        ? secure
          ? "The name resolves and the certificate is valid"
          : "The name resolves, over plain HTTP"
        : "The name does not exist",
      detail: domain
        ? (domain.detail ?? "The name points at this server.")
        : "No domain is connected, so there is no name to type. Visitors need the server’s address.",
      sure: domain ? "asked" : "absent",
      at: null,
    },
    {
      id: "secure",
      who: "A browser asking for https",
      from: "anywhere",
      typed: `https://${hostName ?? "this server"}`,
      outcome: secure ? "loads" : "insecure",
      secure,
      headline: secure
        ? "Encrypted, certificate valid"
        : "Nothing answers on the secure port",
      detail: secure
        ? `${tls.issuer ?? "Issued"}${tls.expiresAt ? `, valid until ${when(tls.expiresAt)}` : ""}. ${tls.renewal ?? ""}`.trim()
        : "No certificate has been requested, and port 443 was never opened. A browser sent there gets no answer at all.",
      sure: secure ? "asked" : "absent",
      at: null,
    },
  ];

  const sshTold: Told = security ? "provider" : "plan";
  return {
    ...base,
    address,
    domain,
    tls,
    audience,
    controllerIp,
    callers,
    doors,
    ssh: security
      ? {
          word: "Not verified by the read",
          tone: "planned",
          detail: security.ssh.detail,
          told: "provider",
        }
      : {
          word: "Key only",
          tone:
            preparedAt && now - Date.parse(preparedAt) < FRESH_MS
              ? "verified"
              : "stale",
          detail:
            "The host was created with password authentication off. The key was made for this deployment and is held by Server Guy.",
          told: sshTold,
        },
    firewall: security
      ? {
          state: unguarded ? "none" : "read",
          provider: security.firewall.provider,
          name: security.firewall.name ?? null,
          at: security.firewall.lastCheckedAt ?? null,
          detail: security.firewall.detail,
        }
      : {
          state: record?.serverId ? "asked" : "none",
          provider: "Hetzner Cloud",
          name: record ? `sg-${record.id.slice(0, 8)}` : null,
          at: restrictedAt ?? preparedAt,
          detail: record?.serverId
            ? "A firewall was created with the deployment and set to these rules. It has not been read back since."
            : "No instance is deployed, so no firewall exists yet.",
        },
    guards,
    holes,
    invented:
      invent === "domain"
        ? "The domain, its certificate and the public reach are invented, so the connected page can be seen."
        : invent === "checked"
          ? "The provider read is invented, including a rule this deployment never asked for."
          : null,
  };
}

/** "3 days ago", as the other pages say it. */
export { ago };
