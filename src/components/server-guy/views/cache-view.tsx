"use client";

import {
  Facts,
  Planned,
  Possible,
  TextLink,
  When,
  stateText,
  verifiedText,
  type ViewProps,
} from "./bits";

/** The cache or broker, and the application's own queue on it. */
export function CacheView(props: ViewProps) {
  const { stack, facts, deployment, now } = props;
  const verified = verifiedText(deployment);
  const observed = facts.jobs?.queues ?? [];
  return (
    <>
      {stack.services.map((service) => (
        <section
          className="sg-stack-item"
          key={service.name}
          aria-label={`Service ${service.name}`}
        >
          <h2>
            {service.kind === "valkey" ? "Valkey" : "Redis"}
            {service.version ? ` ${service.version}` : ""}
            <span className="sg-role">
              {service.role === "broker"
                ? "Queue broker"
                : service.role === "cache"
                  ? "Cache"
                  : "Cache and broker"}
            </span>
          </h2>
          <Facts
            rows={[
              ["State", stateText(service.state, verified)],
              ["Network", "Private Compose network · not exposed"],
              [
                "Persistence",
                service.persistence ??
                  "Not recorded · queued work may not survive a restart",
              ],
              [
                "Protection",
                service.role === "cache"
                  ? "Disposable cache · nothing to back up"
                  : "Pending work is not covered by database backups",
              ],
            ]}
          />
        </section>
      ))}
      {stack.queues.map((queue) => {
        const seen = observed.find((item) => item.library === queue.library);
        return (
          <section
            className="sg-stack-item"
            key={queue.library}
            aria-label={`Queue ${queue.library}`}
          >
            <h2>
              {queue.library}
              <span className="sg-role">Application queue</span>
            </h2>
            <Facts
              rows={[
                [
                  "Backed by",
                  queue.backend === "redis"
                    ? "The Redis-compatible service above"
                    : "PostgreSQL · the application’s database",
                ],
                [
                  "Workers",
                  queue.workers.length ? (
                    <>
                      {queue.workers.map((name) => (
                        <code key={name}>{name}</code>
                      ))}{" "}
                      ·{" "}
                      <TextLink
                        onClick={() => props.onOpenDestination("processes")}
                      >
                        Processes
                      </TextLink>
                    </>
                  ) : (
                    "No worker recorded"
                  ),
                ],
                [
                  "Pending work",
                  seen?.observedAt ? (
                    <>
                      {seen.backlog ?? "?"} waiting
                      {seen.oldestWaitingSeconds != null &&
                        ` · oldest ${Math.round(seen.oldestWaitingSeconds / 60)} min`}
                      {seen.failedLastHour != null &&
                        ` · ${seen.failedLastHour} failed in the last hour`}
                      <small className="sg-fact-note">
                        Observed <When at={seen.observedAt} now={now} /> ·{" "}
                        <TextLink
                          onClick={() => props.onOpenDestination("jobs")}
                        >
                          Jobs
                        </TextLink>
                      </small>
                    </>
                  ) : (
                    "Not measured · needs a supported queue integration"
                  ),
                ],
              ]}
            />
          </section>
        );
      })}
      {!stack.services.length && !stack.queues.length && (
        <Possible
          title="No cache or queue recorded"
          available={false}
          draft="Does this application need a cache or a queue broker, and which library and workers would consume it?"
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          When the application needs one, Server Guy runs a private Redis or
          Valkey service beside it, keeps its persistence honest about queued
          work, and shows the application’s own queue library with the workers
          that consume it. Nothing records this yet.
        </Possible>
      )}
      {!observed.length &&
        (stack.services.length > 0 || stack.queues.length > 0) && (
          <Planned title="Backlog and worker health">
            Queue depth, the oldest waiting job and failure counts appear only
            through a supported integration. Server Guy never invents an empty
            backlog.
          </Planned>
        )}
    </>
  );
}
