"use client";

import {
  Condition,
  Facts,
  LinkButton,
  Pill,
  Planned,
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
          Server Guy creates a host firewall during deployment and opens only
          the ports the application needs. Nothing reads those rules back yet,
          so this view will not tell you what is currently reachable.
        </Condition>
        <div className="sg-band">
          <SubHeading>What the deployment asked for</SubHeading>
          <Facts
            wide
            rows={[
              [
                "Public port",
                deployment?.plan?.port
                  ? `Port 80 → ${deployment.plan.port} · HTTP`
                  : "Not recorded",
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
        <Planned title="Read the firewall back from the host">
          Firewall state, the exact inbound rules with their sources, who holds
          an SSH key, and the time each was last checked will appear here. Until
          then the deployment conversation is the only record of what was
          configured.
        </Planned>
      </>
    );
  const open = security.rules.filter((rule) => rule.reach === "internet");
  const restricted = security.rules.filter((rule) => rule.reach !== "internet");
  // A public web application needs port 80 open; administrative access
  // reachable from anywhere is the exposure worth naming.
  const web = open.filter((rule) => rule.port !== "22");
  const sshOpen = open.some((rule) => rule.port === "22");
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
          security.firewall.state !== "active"
            ? "No firewall is protecting this instance"
            : sshOpen
              ? "Administrative access is reachable from any network"
              : web.length
                ? `Public on port ${web.map((rule) => rule.port).join(" and ")} · everything else restricted`
                : `Reachable only from ${restricted.length} named source${restricted.length === 1 ? "" : "s"}`
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
        {sshOpen
          ? "Anyone who reaches port 22 can attempt to sign in; only a key will let them. Narrowing it to the networks you administer from is the usual next step. "
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
          <h2>What can reach it</h2>
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
            <span>Reachable from</span>
            <span>Exposure</span>
          </div>
          {[...open, ...restricted].map((rule) => (
            <div
              className={`sg-rule-row${rule.reach === "internet" && rule.port === "22" ? " sg-row-warn" : ""}`}
              key={rule.id}
            >
              <span>
                <strong>
                  {rule.port} <code>{rule.protocol}</code>
                </strong>
              </span>
              <span data-label="Serves">{rule.serves ?? "Not recorded"}</span>
              <span data-label="Reachable from">
                {rule.sources.map((source) => (
                  <code key={source}>{source}</code>
                ))}
              </span>
              <span data-label="Exposure">
                <Pill
                  tone={
                    rule.reach !== "internet"
                      ? "ok"
                      : rule.port === "22"
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
            The provider reports no inbound rules. Nothing should be reachable
            from outside the instance.
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
              security.privateServices.length
                ? `${security.privateServices.join(", ")} · no published port`
                : privateServices.length
                  ? `${privateServices.join(", ")} · no published port`
                  : "None recorded",
            ],
          ]}
        />
      </section>
      <p className="sg-section-note">
        A rule open to any network is not automatically wrong; a public web
        application needs one. It is marked so that the choice stays visible,
        and so a port opened for a moment does not quietly stay open.
      </p>
    </>
  );
}
