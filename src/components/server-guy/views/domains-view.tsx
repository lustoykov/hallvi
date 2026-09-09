"use client";

import {
  Condition,
  Facts,
  Pill,
  LinkButton,
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
        <SubHeading>Domain & HTTPS</SubHeading>
        <Facts
          rows={[
            [
              "Current address",
              deployment?.url ?? "No public address recorded",
            ],
            ["Custom domain", "Not connected"],
            ["HTTPS", "Not configured"],
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
        <CdnSection {...props} />
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
      <SubHeading>Domain & HTTPS</SubHeading>
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
        reachable from outside.
      </p>
      <CdnSection {...props} />
    </>
  );
}

function CdnSection({ facts, onAsk }: ViewProps) {
  const cdn = facts.domains?.cdn;
  const configured = cdn?.state === "active" || cdn?.state === "partial";
  return (
    <section aria-label="CDN">
      <SubHeading>CDN</SubHeading>
      <p className="sg-section-note">
        An optional layer that serves cached copies of eligible files closer to
        visitors. Your domain and HTTPS work independently of it.
      </p>
      <Facts
        rows={[
          [
            "Status",
            <Pill
              key="state"
              tone={
                cdn?.state === "active"
                  ? "ok"
                  : cdn?.state === "partial"
                    ? "warn"
                    : "muted"
              }
            >
              {cdn?.state === "active"
                ? "Active"
                : cdn?.state === "partial"
                  ? "Partially configured"
                  : "Not enabled"}
            </Pill>,
          ],
          ...(configured
            ? [["Provider", cdn.provider ?? "Not recorded"] as [string, string]]
            : []),
          [
            configured ? "Caching" : "Recommendation",
            cdn?.state === "not-configured" || !cdn
              ? "No CDN configured. Server Guy can help assess whether this application would benefit."
              : cdn.detail,
          ],
        ]}
      />
      <LinkButton
        onClick={() =>
          onAsk(
            null,
            configured
              ? "I want to clear the CDN cache for this application. Show me the scope and impact before doing anything."
              : "Would a CDN help this application? Explain what should be cached and recommend a setup if it makes sense.",
          )
        }
      >
        {configured ? "Ask to clear cache" : "Discuss CDN setup"}
      </LinkButton>
      {!facts.domains && (
        <p className="sg-section-note">
          CDN setup and cache clearing are not implemented yet.
        </p>
      )}
    </section>
  );
}
