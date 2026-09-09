"use client";

import type { ReactNode } from "react";

import type { StackProcess } from "@/server/application-stack";

import {
  Facts,
  Pill,
  Planned,
  Possible,
  stateText,
  verifiedText,
  type ViewProps,
} from "./bits";

function brokerName(stack: ViewProps["stack"], backend: "postgres" | "redis") {
  if (backend === "postgres") return "PostgreSQL";
  return stack.services[0]?.kind === "valkey" ? "Valkey" : "Redis";
}

function Process({
  process,
  verified,
  stack,
  check,
}: {
  process: StackProcess;
  verified: ReactNode;
  stack: ViewProps["stack"];
  check?: { state: "passing" | "failing" | "unknown"; detail: string } | null;
}) {
  const queue = stack.queues.find((item) =>
    item.workers.includes(process.name),
  );
  return (
    <section className="sg-stack-item" aria-label={`Process ${process.name}`}>
      <h2>
        <code>{process.name}</code>
        <span className="sg-role">
          {process.role === "web" ? "Web process" : "Worker"}
        </span>
        {check && (
          <Pill
            tone={
              check.state === "passing"
                ? "ok"
                : check.state === "failing"
                  ? "bad"
                  : "muted"
            }
          >
            {check.state === "passing"
              ? "Healthy"
              : check.state === "failing"
                ? "Unhealthy"
                : "Unknown"}
          </Pill>
        )}
      </h2>
      <Facts
        rows={[
          [
            "State",
            check ? (
              <>
                {stateText(process.state, verified)} · {check.detail}
              </>
            ) : (
              stateText(process.state, verified)
            ),
          ],
          [
            "Command",
            process.command ? <code>{process.command}</code> : "Image default",
          ],
          [
            "Image",
            process.image ? (
              <code>{process.image}</code>
            ) : (
              "Built at deployment"
            ),
          ],
          ...(process.role === "web"
            ? ([
                ["Listens", `Port 80 → ${process.port ?? "?"} · HTTP`],
                [
                  "Health",
                  process.healthPath ? (
                    <code>GET {process.healthPath}</code>
                  ) : (
                    "No health path recorded"
                  ),
                ],
              ] as Array<[string, React.ReactNode]>)
            : ([
                [
                  "Consumes",
                  process.consumes ??
                    (queue
                      ? `${queue.library} queue on ${brokerName(stack, queue.backend)}`
                      : "Not recorded"),
                ],
              ] as Array<[string, React.ReactNode]>)),
        ]}
      />
    </section>
  );
}

/** The web and worker processes, each with its recorded facts and health. */
export function ProcessesView(props: ViewProps) {
  const { stack, facts, deployment } = props;
  const verified = verifiedText(deployment);
  const workers = stack.processes.filter((item) => item.role === "worker");
  const checks = facts.monitoring?.checks ?? [];
  return (
    <>
      {stack.recorded ? (
        stack.processes.map((process) => (
          <Process
            key={process.name}
            process={process}
            verified={verified}
            stack={stack}
            check={
              checks.find(
                (check) =>
                  check.kind === "process" && check.target === process.name,
              ) ?? null
            }
          />
        ))
      ) : (
        <Possible
          title="No processes recorded yet"
          available
          draft="What processes does this application run, and what would a first deployment need?"
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          Once a deployment records what the application runs, each web and
          worker process appears here with its command, image, ports, health
          check and verification state.
        </Possible>
      )}
      {stack.recorded && !workers.length && (
        <p className="sg-section-note">
          No worker processes are recorded for this application. Server Guy adds
          them when the application declares background work.
        </p>
      )}
      {!facts.monitoring && (
        <Planned title="Process health and restarts">
          Restart counts, resource use per process and controlled restarts will
          live here. Only the deployment verification is recorded today.
        </Planned>
      )}
    </>
  );
}
