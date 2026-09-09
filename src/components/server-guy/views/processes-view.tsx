"use client";

import type { ReactNode } from "react";

import type { StackProcess } from "@/server/application-stack";

import {
  Condition,
  Facts,
  Pill,
  Planned,
  Possible,
  TextLink,
  stateText,
  verifiedText,
  type ViewProps,
} from "./bits";

function brokerName(stack: ViewProps["stack"], backend: "postgres" | "redis") {
  if (backend === "postgres") return "PostgreSQL";
  return stack.services[0]?.kind === "valkey" ? "Valkey" : "Redis";
}

type Check = { state: "passing" | "failing" | "unknown"; detail: string };

function Process({
  process,
  verified,
  stack,
  check,
  onOpenDestination,
}: {
  process: StackProcess;
  verified: ReactNode;
  stack: ViewProps["stack"];
  check?: Check | null;
  onOpenDestination: ViewProps["onOpenDestination"];
}) {
  const queue = stack.queues.find((item) =>
    item.workers.includes(process.name),
  );
  const unhealthy = check?.state === "failing";
  return (
    <section
      className={`sg-stack-item${unhealthy ? " sg-stack-item-bad" : ""}`}
      aria-label={`Process ${process.name}`}
    >
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
      {check && (
        <p className={unhealthy ? "sg-op-next" : "sg-visual-caption"}>
          {check.detail}
        </p>
      )}
      <Facts
        rows={[
          ["State", stateText(process.state, verified)],
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
              ] as Array<[string, ReactNode]>)
            : ([
                [
                  "Consumes",
                  process.consumes ??
                    (queue ? (
                      <>
                        {queue.library} queue on{" "}
                        {brokerName(stack, queue.backend)} ·{" "}
                        <TextLink onClick={() => onOpenDestination("cache")}>
                          Cache &amp; queue
                        </TextLink>
                      </>
                    ) : (
                      "Not recorded"
                    )),
                ],
              ] as Array<[string, ReactNode]>)),
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
  const web = stack.processes.filter((item) => item.role === "web");
  const checks = facts.monitoring?.checks ?? [];
  const checkFor = (name: string) =>
    checks.find((check) => check.kind === "process" && check.target === name) ??
    null;
  const unhealthy = stack.processes.filter(
    (process) => checkFor(process.name)?.state === "failing",
  );
  // Something failing is read first, so it is ordered first.
  const ordered = [...stack.processes].sort(
    (a, b) =>
      Number(checkFor(b.name)?.state === "failing") -
      Number(checkFor(a.name)?.state === "failing"),
  );
  if (!stack.recorded)
    return (
      <>
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
        <Planned title="Process health and restarts">
          Restart counts, resource use per process and controlled restarts will
          live here. Only the deployment verification is recorded today.
        </Planned>
      </>
    );
  return (
    <>
      {checks.length > 0 && (
        <Condition
          tone={unhealthy.length ? "bad" : "ok"}
          title={
            unhealthy.length
              ? `${unhealthy.map((item) => item.name).join(", ")} ${unhealthy.length === 1 ? "is" : "are"} unhealthy`
              : `${stack.processes.length} process${stack.processes.length === 1 ? "" : "es"} healthy`
          }
        >
          {web.length} web process{web.length === 1 ? "" : "es"}
          {workers.length
            ? ` and ${workers.length} worker${workers.length === 1 ? "" : "s"}`
            : " and no workers"}{" "}
          on one instance, checked on the host.
        </Condition>
      )}
      {ordered.map((process) => (
        <Process
          key={process.name}
          process={process}
          verified={verified}
          stack={stack}
          check={checkFor(process.name)}
          onOpenDestination={props.onOpenDestination}
        />
      ))}
      {!workers.length && (
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
