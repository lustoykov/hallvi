"use client";

import { currentFacts, primaryHttp } from "@/server/release-facts";
import {
  Condition,
  Facts,
  LinkButton,
  Pill,
  SubHeading,
  When,
  type ViewProps,
} from "./bits";
import { Tally } from "./visuals";

const sshWord = {
  "key-only": "Key only",
  password: "Password allowed",
  closed: "Closed",
  unknown: "Not recorded",
} as const;

/**
 * What can reach this application. The question a firewall answers is not
 * "is it on" but "who can open port 80", so the rules are stated as reach
 * rather than as a switch, and a rule open to every network is marked even
 * when the firewall itself is working exactly as configured.
 */
export function SecurityView(props: ViewProps) {
  const { facts, stack, deployment, now, onAction, busy } = props;
  const primary = primaryHttp(currentFacts(deployment ?? null));
  const security = facts.security;
  const privateServices = [
    ...stack.databases.map((item) =>
      item.kind === "postgres" ? `PostgreSQL ${item.version}` : "SQLite file",
    ),
    ...stack.services.map(
      (item) => `${item.kind === "valkey" ? "Valkey" : "Redis"} ${item.name}`,
    ),
  ];
  if (!security)
    return (
      <>
        <Condition tone="muted" title="Exposure has not been read back">
          {deployment?.serverId
            ? "Check Hetzner to read the attached firewall rules. The deployment plan below does not establish what is currently allowed."
            : "Firewall read-back is available after a Hetzner instance is deployed."}
          {onAction && (
            <LinkButton
              disabled={busy === "check-firewall"}
              onClick={() => onAction({ type: "check-firewall" })}
            >
              Check now
            </LinkButton>
          )}
        </Condition>
        <div className="sg-band">
          <SubHeading>What the deployment asked for</SubHeading>
          <Facts
            wide
            rows={[
              [
                "Public port",
                primary ? `Port 80 → ${primary.target} · HTTP` : "Not recorded",
              ],
              ["Administrative access", "SSH on port 22, key only"],
              [
                "Private services",
                privateServices.length
                  ? `${privateServices.join(", ")} · reachable only inside the Compose network`
                  : "None recorded",
              ],
            ]}
          />
          <p className="sg-section-note">
            These come from the plan the executor ran, not from the host. A plan
            is what was asked for; it is not evidence of what is open now.
          </p>
        </div>
      </>
    );
  const open = security.rules.filter((rule) => rule.reach === "internet");
  const restricted = security.rules.filter((rule) => rule.reach !== "internet");
  // A public web application needs port 80 open; administrative access
  // reachable from anywhere is the exposure worth naming.
  const allowsSsh = (rule: (typeof security.rules)[number]) => {
    if (rule.protocol !== "tcp") return false;
    if (rule.port === "any" || rule.port === "all") return true;
    const range = /^(\d+)(?:-(\d+))?$/.exec(rule.port);
    return Boolean(
      range && Number(range[1]) <= 22 && Number(range[2] ?? range[1]) >= 22,
    );
  };
  const sshOpen = open.some(allowsSsh);
  const tone =
    security.firewall.state !== "active"
      ? "bad"
      : sshOpen || security.ssh.state === "password"
        ? "warn"
        : "ok";
  return (
    <>
      <Condition
        tone={tone}
        title={
          security.firewall.state === "not-configured"
            ? "No Hetzner firewall is attached"
            : security.firewall.state === "unknown"
              ? "Firewall rules are not confirmed as applied"
              : sshOpen
                ? "Firewall allows SSH from any network"
                : open.length
                  ? "Firewall allows public incoming traffic"
                  : security.rules.length
                    ? "Firewall rules restrict incoming traffic to listed sources"
                    : "Firewall allows no incoming traffic"
        }
        aside={
          onAction && (
            <LinkButton
              disabled={busy === "check-firewall"}
              onClick={() => onAction({ type: "check-firewall" })}
            >
              Check now
            </LinkButton>
          )
        }
      >
        {sshOpen && security.firewall.state === "active"
          ? `The firewall allows connections to port 22. ${security.ssh.state === "key-only" ? "SSH was recorded as key-only. " : "SSH authentication settings must be checked separately. "}`
          : ""}
        {security.firewall.detail}
        {security.firewall.lastCheckedAt && (
          <>
            {" "}
            · checked <When at={security.firewall.lastCheckedAt} now={now} />
          </>
        )}
      </Condition>
      <section className="sg-band" aria-label="Inbound rules">
        <div className="sg-band-head">
          <h2>Reported incoming rules</h2>
          <span className="sg-visual-caption">
            {security.firewall.provider}
            {security.firewall.name ? ` · ${security.firewall.name}` : ""}
          </span>
        </div>
        <Tally
          label="Inbound rules by reach"
          items={[
            {
              label: "open to any network",
              count: open.length,
              tone: sshOpen ? "warn" : "muted",
            },
            { label: "restricted", count: restricted.length, tone: "ok" },
          ]}
        />
        <div className="sg-rules">
          <div className="sg-rule-row sg-table-head">
            <span>Port</span>
            <span>Serves</span>
            <span>Allowed sources</span>
            <span>Exposure</span>
          </div>
          {[...open, ...restricted].map((rule) => (
            <div
              className={`sg-rule-row${rule.reach === "internet" && allowsSsh(rule) ? " sg-row-warn" : ""}`}
              key={rule.id}
            >
              <span>
                <strong>
                  {rule.port} <code>{rule.protocol}</code>
                </strong>
              </span>
              <span data-label="Serves">{rule.serves ?? "Not recorded"}</span>
              <span data-label="Allowed sources">
                {rule.sources.map((source) => (
                  <code key={source}>{source}</code>
                ))}
              </span>
              <span data-label="Exposure">
                <Pill
                  tone={
                    rule.reach !== "internet"
                      ? "ok"
                      : allowsSsh(rule)
                        ? "warn"
                        : "muted"
                  }
                >
                  {rule.reach === "internet" ? "Any network" : "Restricted"}
                </Pill>
              </span>
            </div>
          ))}
        </div>
        {!security.rules.length && (
          <p className="sg-section-note">
            {security.firewall.state === "active"
              ? "The attached firewalls report no incoming allow rules. They block incoming connections."
              : security.firewall.state === "not-configured"
                ? "No attached firewall restricts incoming traffic. Reachability depends on host networking and listening services."
                : "No incoming rules were reported; their effective state is not confirmed."}
          </p>
        )}
      </section>
      <section className="sg-band" aria-label="Administrative access">
        <SubHeading>Administrative access</SubHeading>
        <Facts
          wide
          rows={[
            [
              "SSH",
              <>
                <Pill
                  tone={
                    security.ssh.state === "key-only"
                      ? "ok"
                      : security.ssh.state === "password"
                        ? "bad"
                        : "muted"
                  }
                >
                  {sshWord[security.ssh.state]}
                </Pill>{" "}
                {security.ssh.detail}
              </>,
            ],
            ...(security.ssh.holders
              ? ([["Key holders", security.ssh.holders]] as Array<
                  [string, string]
                >)
              : []),
            [
              "Private services",
              security.privateServicesDetail ??
                (security.privateServices.length
                  ? `${security.privateServices.join(", ")} · no published port`
                  : privateServices.length
                    ? `${privateServices.join(", ")} · no published port`
                    : "None recorded"),
            ],
          ]}
        />
      </section>
      <p className="sg-section-note">
        These are provider firewall rules for the instance, shared by its
        applications. This check does not test reachability or inspect the host
        firewall. An allowed port still needs a running service; an allowed IP
        may be shared by several devices.
      </p>
    </>
  );
}
