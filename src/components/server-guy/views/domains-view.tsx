"use client";

import {
  Condition,
  Facts,
  Pill,
  Planned,
  Possible,
  SubHeading,
  When,
  type ViewProps,
} from "./bits";

/**
 * Delivery is four separate facts: the address that answers, the domain
 * and who resolves it, the certificate and its renewal, and whether a CDN is
 * actually caching. Each can be pending, failed or not configured on its own.
 */
export function DomainsView(props: ViewProps) {
  const { stack, facts, deployment, now } = props;
  const domains = facts.domains;
  const postgres = stack.databases.some((item) => item.kind === "postgres");
  if (!domains)
    return (
      <>
        <Facts
          rows={[
            [
              "Current address",
              deployment?.url ?? "No public address recorded",
            ],
            ["Custom domain", "Not connected"],
            ["HTTPS", "Not configured"],
            ["CDN", "Not configured"],
            [
              "Private services",
              postgres || stack.services.length
                ? "Reachable only inside the Compose network"
                : "None recorded",
            ],
          ]}
        />
        <Possible
          title="No domain connected"
          available={false}
          draft="Which domain should this application answer on, and do I already have DNS for it?"
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          Server Guy connects your existing DNS, routes the hostname to the
          right service, issues and renews the certificate, and recommends a CDN
          only when it helps. You do the one step only you can: pointing the
          domain. Domain setup is not available yet.
        </Possible>
        <Planned title="A domain, HTTPS and delivery that fit your app">
          Routing, certificates and CDN caching will be configured and verified
          here. Cloudflare access will be requested only when it is needed.
        </Planned>
      </>
    );
  const domain = domains.domain;
  const tone =
    domain?.state === "failed" || domains.tls.state === "failed"
      ? "bad"
      : domain?.state === "pending-dns" || domains.tls.state === "pending"
        ? "warn"
        : domain && domains.tls.state === "valid"
          ? "ok"
          : "muted";
  return (
    <>
      <Condition
        tone={tone}
        title={
          !domain
            ? `Answering on ${domains.address ?? "no address"} · HTTP only`
            : domain.state === "pending-dns"
              ? `Waiting for ${domain.name} to point here`
              : domain.state === "failed"
                ? `${domain.name} is not reaching this application`
                : domains.tls.state === "valid"
                  ? `https://${domain.name} · certificate valid`
                  : domains.tls.state === "pending"
                    ? `${domain.name} resolves · certificate pending`
                    : `${domain.name} resolves · HTTPS not configured`
        }
      >
        {domain?.detail ??
          "No custom domain yet; the instance address answers over HTTP."}
      </Condition>
      {domain?.userStep && (
        <div className="sg-user-step">
          <strong>One step only you can do</strong>
          <p>{domain.userStep}</p>
        </div>
      )}
      <Facts
        rows={[
          ["Address", domains.address ?? "No public address recorded"],
          [
            "Domain",
            domain ? (
              <>
                {domain.name} ·{" "}
                {domain.provider === "cloudflare"
                  ? "DNS at Cloudflare"
                  : "DNS at your provider"}{" "}
                ·{" "}
                <Pill
                  tone={
                    domain.state === "resolving"
                      ? "ok"
                      : domain.state === "failed"
                        ? "bad"
                        : "warn"
                  }
                >
                  {domain.state === "resolving"
                    ? "Resolving here"
                    : domain.state === "failed"
                      ? "Not resolving"
                      : "Pending DNS"}
                </Pill>
              </>
            ) : (
              "Not connected"
            ),
          ],
          [
            "HTTPS",
            domains.tls.state === "valid" ? (
              <>
                <Pill tone="ok">Valid</Pill> {domains.tls.issuer}
                {domains.tls.expiresAt && (
                  <>
                    {" "}
                    · expires <When at={domains.tls.expiresAt} now={now} />
                  </>
                )}
                {domains.tls.renewal && (
                  <small className="sg-fact-note">{domains.tls.renewal}</small>
                )}
              </>
            ) : domains.tls.state === "pending" ? (
              <>
                <Pill tone="warn">Pending</Pill> {domains.tls.detail}
              </>
            ) : domains.tls.state === "failed" ? (
              <>
                <Pill tone="bad">Failed</Pill> {domains.tls.detail}
              </>
            ) : (
              "Not configured"
            ),
          ],
          [
            "CDN",
            domains.cdn.state === "active" ? (
              <>
                <Pill tone="ok">Active</Pill> {domains.cdn.provider} ·{" "}
                {domains.cdn.detail}
              </>
            ) : domains.cdn.state === "partial" ? (
              <>
                <Pill tone="warn">Partial</Pill> {domains.cdn.detail}
              </>
            ) : (
              domains.cdn.detail
            ),
          ],
        ]}
      />
      <SubHeading>Routes</SubHeading>
      <div className="sg-routes">
        <div className="sg-route-row sg-table-head">
          <span>Host</span>
          <span>Service</span>
          <span>Protocol</span>
        </div>
        {domains.routes.map((route) => (
          <div className="sg-route-row" key={`${route.host}-${route.port}`}>
            <span>
              <code>{route.host}</code>
            </span>
            <span>
              <code>{route.service}</code> · port {route.port}
            </span>
            <span>{route.protocol}</span>
          </div>
        ))}
      </div>
      <p className="sg-section-note">
        Private services stay inside the Compose network; only listed routes are
        reachable from outside. A CDN counts as active only when eligible
        content is observed cached.
      </p>
    </>
  );
}
