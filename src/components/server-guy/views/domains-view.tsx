"use client";

import {
  Condition,
  Facts,
  Pill,
  Possible,
  SubHeading,
  TextLink,
  When,
  type ViewProps,
} from "./bits";
import { Flow, type FlowStage } from "./visuals";

/**
 * The name this application answers on, and the certificate behind it.
 * Delivery is a path whose stages each carry their own state: the name can
 * resolve while the certificate is still pending. The path is drawn once at
 * the top so the gap is obvious; caching is its own destination, because a
 * stale cached copy is a different failure from a name that will not resolve.
 */
export function DomainsView(props: ViewProps) {
  const { stack, facts, deployment, now } = props;
  const domains = facts.domains;
  const postgres = stack.databases.some((item) => item.kind === "postgres");
  const address = domains?.address ?? deployment?.url ?? null;
  const domain = domains?.domain ?? null;
  const tls = domains?.tls;
  const cdn = domains?.cdn;
  const configured = cdn?.state === "active" || cdn?.state === "partial";
  const serviceStage = domains?.routes[0]
    ? `${domains.routes[0].service} · port ${domains.routes[0].port}`
    : deployment?.plan?.port
      ? `app · port ${deployment.plan.port}`
      : "the application";

  const stages: FlowStage[] = [
    {
      key: "domain",
      label: "Name",
      value: domain ? domain.name : "No custom domain",
      detail: domain
        ? domain.provider === "cloudflare"
          ? "DNS at Cloudflare"
          : "DNS at your provider"
        : "Visitors use the instance address",
      state: !domain
        ? "absent"
        : domain.state === "resolving"
          ? "ok"
          : domain.state === "failed"
            ? "failed"
            : "pending",
      note: domain?.userStep ?? null,
      noteLabel: "One step only you can do",
    },
    {
      key: "cdn",
      label: "CDN",
      value: configured
        ? (cdn?.provider ?? "Configured")
        : cdn?.state === "not-useful"
          ? "Not useful here"
          : "Not enabled",
      detail: configured ? cdn?.detail : "Requests reach the host directly",
      state: configured
        ? cdn?.state === "partial"
          ? "pending"
          : "ok"
        : cdn?.state === "not-useful"
          ? "skipped"
          : "absent",
      note: (
        <>
          Caching, delivery and clearing the cache live in{" "}
          <TextLink onClick={() => props.onOpenDestination("cdn")}>
            CDN
          </TextLink>
          .
        </>
      ),
      noteLabel: "CDN",
    },
    {
      key: "tls",
      label: "HTTPS",
      value:
        tls?.state === "valid"
          ? "Certificate valid"
          : tls?.state === "pending"
            ? "Certificate pending"
            : tls?.state === "failed"
              ? "Certificate failed"
              : "HTTP only",
      detail:
        tls?.state === "valid"
          ? (tls.issuer ?? "Issued")
          : (tls?.detail ?? "No certificate requested"),
      state:
        tls?.state === "valid"
          ? "ok"
          : tls?.state === "pending"
            ? "pending"
            : tls?.state === "failed"
              ? "failed"
              : "absent",
    },
    {
      key: "service",
      label: "Serves",
      value: serviceStage,
      detail: address ?? "No public address recorded",
      state: deployment?.status === "live" || domains ? "ok" : "absent",
    },
  ];

  if (!domains)
    return (
      <>
        <Flow
          stages={stages}
          caption="Recorded delivery today. Nothing between the visitor and the application is configured yet."
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
          domain. Domain setup is not implemented yet.
        </Possible>
        <div className="sg-band">
          <SubHeading>Domain &amp; HTTPS</SubHeading>
          <Facts
            rows={[
              ["Current address", address ?? "No public address recorded"],
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
        </div>
      </>
    );
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
      <Flow
        stages={stages}
        caption="Each stage is recorded separately: a resolving name does not imply a valid certificate, and a valid certificate does not imply a CDN."
      />
      <div className="sg-band">
        <SubHeading>Domain &amp; HTTPS</SubHeading>
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
                    <small className="sg-fact-note">
                      {domains.tls.renewal}
                    </small>
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
      </div>
      <div className="sg-band">
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
          Private services stay inside the Compose network; only listed routes
          are reachable from outside.
        </p>
      </div>
    </>
  );
}
