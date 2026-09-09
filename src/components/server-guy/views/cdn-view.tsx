"use client";

import {
  Condition,
  Facts,
  LinkButton,
  Possible,
  SubHeading,
  TextLink,
  type ViewProps,
} from "./bits";
import { Flow, type FlowStage } from "./visuals";

/**
 * An optional layer in front of the application. It is its own destination
 * because caching has its own failure mode: a stale copy served long after
 * the origin changed. The domain and its certificate work without it, so
 * this view never implies that a missing CDN is a missing capability.
 */
export function CdnView(props: ViewProps) {
  const { facts, deployment, onAction, busy } = props;
  const cdn = facts.domains?.cdn;
  const configured = cdn?.state === "active" || cdn?.state === "partial";
  const origin =
    facts.domains?.domain?.name ?? facts.domains?.address ?? deployment?.url;
  const stages: FlowStage[] = [
    {
      key: "visitor",
      label: "Visitor",
      value: "Any network",
      detail: "Requests arrive from wherever your users are",
      state: "ok",
    },
    {
      key: "cdn",
      label: "Cache",
      value: configured ? (cdn?.provider ?? "Configured") : "No cache",
      detail: configured
        ? cdn?.detail
        : "Every request travels to the instance",
      state: configured
        ? cdn?.state === "partial"
          ? "pending"
          : "ok"
        : "absent",
    },
    {
      key: "origin",
      label: "Origin",
      value: origin ?? "No public address",
      detail: "The single instance that answers",
      state: origin ? "ok" : "absent",
    },
  ];
  if (!configured)
    return (
      <>
        <Condition
          tone="muted"
          title={
            cdn?.state === "not-useful"
              ? "A CDN would not help this application"
              : "No CDN in front of this application"
          }
        >
          {cdn?.state === "not-useful"
            ? cdn.detail
            : "Every request reaches the instance directly. That is the right answer for most applications; a CDN pays for itself when the same large files are served repeatedly to visitors far from the host."}
        </Condition>
        <Flow
          stages={stages}
          caption="Your domain and its certificate work independently of this layer."
        />
        <Possible
          title="Server Guy can assess whether caching would help"
          available={false}
          draft="Would a CDN help this application? Explain what should be cached, what it would cost, and recommend a setup only if it makes sense."
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          The assessment looks at what this application actually serves, how
          large those responses are, and whether they are the same for every
          visitor. If it helps, Server Guy configures the provider, states what
          is cached and for how long, and gives you one place to clear it. CDN
          setup is not implemented yet.
        </Possible>
      </>
    );
  return (
    <>
      <Condition
        tone={cdn?.state === "partial" ? "warn" : "ok"}
        title={
          cdn?.state === "partial"
            ? "Caching is only partly configured"
            : `Caching through ${cdn?.provider ?? "the configured provider"}`
        }
      >
        {cdn?.detail}
      </Condition>
      <Flow
        stages={stages}
        caption="Your domain and its certificate work independently of this layer."
      />
      <div className="sg-band">
        <SubHeading>What is cached</SubHeading>
        <Facts
          wide
          rows={[
            ["Provider", cdn?.provider ?? "Not recorded"],
            ["Caching", cdn?.detail ?? "Not recorded"],
            [
              "Origin",
              origin ? (
                <>
                  {origin} ·{" "}
                  <TextLink onClick={() => props.onOpenDestination("domains")}>
                    Domains
                  </TextLink>
                </>
              ) : (
                "No public address recorded"
              ),
            ],
          ]}
        />
      </div>
      <div className="sg-op-links">
        <LinkButton
          disabled={busy === "clear-cdn-cache"}
          onClick={() =>
            onAction
              ? onAction({ type: "clear-cdn-cache" })
              : props.onAsk(
                  null,
                  "I want to clear the CDN cache for this application. Show me the scope and impact before doing anything.",
                )
          }
        >
          Clear the cache
        </LinkButton>
      </div>
      <p className="sg-section-note">
        Clearing the cache makes the next request for every affected file travel
        to the instance. Server Guy states the scope before it does anything,
        and a clear is recorded like any other change.
      </p>
    </>
  );
}
