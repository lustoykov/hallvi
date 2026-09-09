"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowClockwise,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { ApplicationOperation } from "@/server/operation-record";
import {
  persistentState,
  type ApplicationStack,
  type StackProcess,
} from "@/server/application-stack";
import type { OperatorView } from "@/server/types";
import type { DeploymentRecord } from "@/server/deployment-types";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import { ApplicationOverview } from "./application-overview";
import { ArchitectureCanvas } from "./architecture-canvas";
import { DestinationActivity } from "./destination-activity";
import { LocalTime } from "./local-time";

const descriptions: Record<ApplicationSection, string> = {
  overview:
    "What is running, what needs you, what changed, and how fresh the evidence is.",
  architecture: "How your source, application, host and data fit together.",
  deployment:
    "Prepare the application, review the plan and follow its deployment.",
  processes:
    "The web and worker processes that make up your application on its instance.",
  database:
    "The database your application depends on, and where its data lives.",
  cache:
    "The cache or broker your application relies on, and the queue its workers consume.",
  jobs: "Scheduled commands and queued work, and the processes that run them.",
  storage: "Volumes and files that must survive container replacement.",
  backups: "Off-host copies of your data, with a restore you can trust.",
  logs: "Inspect the latest collected output from your application host.",
  monitoring:
    "Health, issues and resource usage, and how you hear about problems.",
  domains: "Public addresses, HTTPS and delivery for your application.",
  variables: "Configuration your application needs to build and run.",
};
function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="sg-section-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Planned({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sg-planned-section">
      <span className="sg-availability">Not implemented yet</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
/**
 * A stack destination the application does not use yet: what would appear
 * here, whether Server Guy can record it today, and the way to start in
 * conversation. No controls, because there is nothing to control.
 */
function Possible({
  title,
  available,
  children,
  draft,
  onAsk,
}: {
  title: string;
  available: boolean;
  children: ReactNode;
  draft: string;
  onAsk: (draft: string) => void;
}) {
  return (
    <div className="sg-section-empty sg-possible">
      <h2>{title}</h2>
      <p>{children}</p>
      <div className="sg-op-links">
        <button
          type="button"
          className="sg-op-link"
          onClick={() => onAsk(draft)}
        >
          Ask in the conversation <ArrowRight aria-hidden="true" />
        </button>
        {!available && (
          <span className="sg-availability">Not available yet</span>
        )}
      </div>
    </div>
  );
}
function TextLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="sg-op-text-link" onClick={onClick}>
      {children}
    </button>
  );
}
/** The recorded service a queue runs on, by its own name. */
function brokerName(stack: ApplicationStack, backend: "postgres" | "redis") {
  if (backend === "postgres") return "PostgreSQL";
  return stack.services[0]?.kind === "valkey" ? "Valkey" : "Redis";
}
const stateText = (state: "running" | "planned", verified: string) =>
  state === "running"
    ? `Running · verified ${verified}`
    : "Planned · not deployed yet";

function Process({
  process,
  verified,
  stack,
}: {
  process: StackProcess;
  verified: string;
  stack: ApplicationStack;
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
      </h2>
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
                    (queue
                      ? `${queue.library} queue on ${brokerName(stack, queue.backend)}`
                      : "Not recorded"),
                ],
              ] as Array<[string, ReactNode]>)),
        ]}
      />
    </section>
  );
}

function Logs({
  deployment,
  applicationId,
  onRefresh,
}: {
  deployment: DeploymentRecord | null;
  applicationId: string;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The existing deployment record appends each collected Compose snapshot.
  // Keep build output and older snapshots in Deployment, not runtime Logs.
  const logMarker = "--- Application logs ---\n";
  const logStart = deployment?.logs.lastIndexOf(logMarker) ?? -1;
  const snapshot =
    logStart >= 0 ? deployment!.logs.slice(logStart + logMarker.length) : "";
  const lines = snapshot
    ? snapshot
        .split("\n")
        .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
    : [];
  const collectedAt = deployment?.logsCollectedAt
    ? new Date(deployment.logsCollectedAt).toLocaleTimeString()
    : null;
  async function refresh() {
    if (!deployment || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/deployment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logs", deploymentId: deployment.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not collect logs.");
      await onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not collect logs. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="sg-log-toolbar">
        <label>
          <MagnifyingGlass aria-hidden="true" />
          <input
            aria-label="Filter log lines"
            placeholder="Filter collected logs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          disabled={busy || deployment?.status !== "live"}
          onClick={() => void refresh()}
        >
          <ArrowClockwise />
          {busy ? "Collecting…" : "Refresh logs"}
        </button>
      </div>
      {error && (
        <p role="alert" className="sg-deployment-error">
          {error}
        </p>
      )}
      <div className="sg-log-context">
        <span>Application host · collected snapshot · read-only</span>
        <span>
          {collectedAt ? `Collected at ${collectedAt}` : "No live stream"}
        </span>
      </div>
      <pre
        className="sg-logs-output"
        tabIndex={0}
        aria-label="Collected application logs"
      >
        {lines.length
          ? lines.join("\n")
          : snapshot
            ? "No lines match your filter."
            : "No logs collected yet. After a verified deployment, refresh to collect the latest host output."}
      </pre>
      <p className="sg-section-note">
        Build progress stays in Deployment. Continuous log collection, job and
        worker log filters and long-term retention are not implemented yet.
      </p>
    </>
  );
}
/**
 * One stable destination, full width. Live activity that touches it comes
 * first, above facts that only change once work is verified. Stack
 * destinations read the recorded stack; a resource the application does not
 * have never gets an empty control.
 */
export function ApplicationSectionView({
  section,
  view,
  deployment,
  stack,
  operations,
  now,
  onRefresh,
  onOpenDestination,
  onOpenConversation,
  onAsk,
  onRevealStack,
  bar,
  children,
}: {
  section: ApplicationSection;
  view: OperatorView;
  deployment: DeploymentRecord | null;
  stack: ApplicationStack;
  operations: ApplicationOperation[];
  now: number;
  onRefresh: () => Promise<void>;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message; null asks in the current conversation. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** Shows the hidden stack destinations in navigation. */
  onRevealStack?: () => void;
  /** The bar above the header: the way back to the conversation. */
  bar?: ReactNode;
  children?: ReactNode;
}) {
  const app = view.application;
  if (!app) return null;
  const live = deployment?.status === "live";
  const postgres = stack.databases.find((item) => item.kind === "postgres");
  const verified = deployment?.verifiedAt
    ? new Date(deployment.verifiedAt).toLocaleString()
    : "Not verified";
  const variables = [
    ...new Set([
      ...(deployment?.plan?.environment.map((item) => item.name) ?? []),
      ...(deployment?.plan?.missingInputs.map((item) => item.name) ?? []),
      ...(deployment?.plan?.postgres
        ? [deployment.plan.postgres.variable]
        : []),
    ]),
  ];
  const protectable = persistentState(stack);
  const workers = stack.processes.filter((item) => item.role === "worker");
  const activity = section !== "overview" && (
    <DestinationActivity
      section={section}
      operations={operations}
      chats={view.chats}
      now={now}
      onOpenConversation={onOpenConversation}
      onAsk={(draft) => onAsk(null, draft)}
    />
  );
  const backupsLink = (
    <TextLink onClick={() => onOpenDestination("backups")}>Backups</TextLink>
  );
  return (
    <div className={`sg-section-page sg-section-${section}`}>
      {bar}
      <header className="sg-section-header">
        <div>
          <h1>
            {applicationSections.find((item) => item.id === section)?.label}
          </h1>
          <p>{descriptions[section]}</p>
        </div>
        {live && deployment.url && (
          <a
            className="sg-section-open-app"
            href={deployment.url}
            target="_blank"
            rel="noreferrer"
          >
            Open application <ArrowSquareOut />
          </a>
        )}
      </header>
      {section === "architecture" ? (
        <>
          {activity && <div className="sg-section-activity">{activity}</div>}
          <ArchitectureCanvas
            application={app}
            deployment={deployment}
            stack={stack}
          />
        </>
      ) : (
        <div className="sg-section-content">
          {activity}
          {section === "overview" && (
            <ApplicationOverview
              view={view}
              deployment={deployment}
              stack={stack}
              operations={operations}
              now={now}
              onOpenDestination={onOpenDestination}
              onOpenConversation={onOpenConversation}
              onAsk={onAsk}
              onRevealStack={onRevealStack}
            />
          )}
          {section === "deployment" && (
            <>
              {children}
              <p className="sg-section-note">
                This version supports the initial deployment. Routine releases,
                rollback and automatic deployment on push are not implemented
                yet.
              </p>
            </>
          )}
          {section === "processes" && (
            <>
              {stack.recorded ? (
                stack.processes.map((process) => (
                  <Process
                    key={process.name}
                    process={process}
                    verified={verified}
                    stack={stack}
                  />
                ))
              ) : (
                <Possible
                  title="No processes recorded yet"
                  available
                  draft="What processes does this application run, and what would a first deployment need?"
                  onAsk={(draft) => onAsk(null, draft)}
                >
                  Once a deployment records what the application runs, each web
                  and worker process appears here with its command, image,
                  ports, health check and verification state.
                </Possible>
              )}
              {stack.recorded && !workers.length && (
                <p className="sg-section-note">
                  No worker processes are recorded for this application. Server
                  Guy adds them when the application declares background work.
                </p>
              )}
              <Planned title="Process health and restarts">
                Restart counts, resource use per process and controlled restarts
                will live here. Only the deployment verification is recorded
                today.
              </Planned>
            </>
          )}
          {section === "database" && (
            <>
              {stack.databases.length ? (
                stack.databases.map((database) => (
                  <section
                    className="sg-stack-item"
                    key={database.name}
                    aria-label={`Database ${database.name}`}
                  >
                    <h2>
                      {database.kind === "postgres"
                        ? `PostgreSQL ${database.version}`
                        : "Embedded SQLite"}
                      <span className="sg-role">
                        {database.kind === "postgres"
                          ? "Managed service"
                          : "Application file"}
                      </span>
                    </h2>
                    <Facts
                      rows={
                        database.kind === "postgres"
                          ? [
                              ["State", stateText(database.state, verified)],
                              ["Placement", "Same instance as the application"],
                              [
                                "Network",
                                "Private Compose network · no public database port",
                              ],
                              [
                                "Storage",
                                <>
                                  Persistent volume <code>database</code> · not
                                  measured ·{" "}
                                  <TextLink
                                    onClick={() => onOpenDestination("storage")}
                                  >
                                    Storage
                                  </TextLink>
                                </>,
                              ],
                              ["Backups", <>Not configured · {backupsLink}</>],
                            ]
                          : [
                              ["State", stateText(database.state, verified)],
                              [
                                "File",
                                <code key="file">{database.location}</code>,
                              ],
                              [
                                "Protection",
                                <>
                                  Backed up with the application’s files as a
                                  consistent copy, not a live file copy ·{" "}
                                  {backupsLink}
                                </>,
                              ],
                            ]
                      }
                    />
                  </section>
                ))
              ) : (
                <Possible
                  title="No database recorded"
                  available
                  draft="Does this application use a database, and how is its data stored?"
                  onAsk={(draft) => onAsk(null, draft)}
                >
                  When the deployment plan includes PostgreSQL, Server Guy runs
                  it privately beside the application with a persistent volume
                  and shows it here; an embedded SQLite file is treated as part
                  of the application’s files. An application does not need a
                  database to deploy.
                </Possible>
              )}
              <Planned title="Database operations">
                Connection management, database-specific logs, storage
                measurements and restore controls will live here. This view
                currently shows deployment facts only.
              </Planned>
            </>
          )}
          {section === "cache" && (
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
              {stack.queues.map((queue) => (
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
                              onClick={() => onOpenDestination("processes")}
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
                        "Not measured · needs a supported queue integration",
                      ],
                    ]}
                  />
                </section>
              ))}
              {!stack.services.length && !stack.queues.length && (
                <Possible
                  title="No cache or queue recorded"
                  available={false}
                  draft="Does this application need a cache or a queue broker, and which library and workers would consume it?"
                  onAsk={(draft) => onAsk(null, draft)}
                >
                  When the application needs one, Server Guy runs a private
                  Redis or Valkey service beside it, keeps its persistence
                  honest about queued work, and shows the application’s own
                  queue library with the workers that consume it. Nothing
                  records this yet.
                </Possible>
              )}
              <Planned title="Backlog and worker health">
                Queue depth, the oldest waiting job and failure counts appear
                only through a supported integration. Server Guy never invents
                an empty backlog.
              </Planned>
            </>
          )}
          {section === "jobs" && (
            <>
              {stack.jobs.length ? (
                <div className="sg-job-list">
                  <div className="sg-job-row sg-table-head">
                    <span>Job</span>
                    <span>Schedule</span>
                    <span>Next run</span>
                    <span>Last result</span>
                  </div>
                  {stack.jobs.map((job) => (
                    <div className="sg-job-row" key={job.name}>
                      <span>
                        <strong>{job.name}</strong>
                        <small>
                          <code>{job.command}</code> · runs in{" "}
                          <code>{job.runsIn}</code>
                        </small>
                      </span>
                      <span>
                        {job.schedule}
                        <small>{job.timezone}</small>
                        {job.paused && <small>Paused</small>}
                      </span>
                      <span>
                        {job.paused ? (
                          "Paused"
                        ) : job.nextRunAt ? (
                          <LocalTime value={job.nextRunAt} variant="compact" />
                        ) : (
                          "Not scheduled"
                        )}
                      </span>
                      <span
                        className={
                          job.lastRun?.outcome === "succeeded"
                            ? "sg-outcome-ok"
                            : job.lastRun
                              ? "sg-outcome-bad"
                              : undefined
                        }
                      >
                        {job.lastRun ? (
                          <>
                            {job.lastRun.outcome === "succeeded"
                              ? "Succeeded"
                              : job.lastRun.outcome === "failed"
                                ? "Failed"
                                : job.lastRun.outcome === "timed-out"
                                  ? "Timed out"
                                  : job.lastRun.outcome === "missed"
                                    ? "Missed"
                                    : "Unknown"}
                            <small>
                              <LocalTime
                                value={job.lastRun.at}
                                variant="compact"
                              />
                              {job.lastRun.durationSeconds != null &&
                                ` · ${job.lastRun.durationSeconds}s`}
                            </small>
                          </>
                        ) : (
                          "No run yet"
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Possible
                  title="No scheduled commands"
                  available={false}
                  draft="Which of this application’s existing commands could run on a schedule, and what would it take to set one up?"
                  onAsk={(draft) => onAsk(null, draft)}
                >
                  Server Guy can run one of the application’s existing commands
                  on a host-side schedule, reusing a schedule the application
                  already owns rather than adding a second trigger. Each job
                  would show its schedule, next run, last result and the
                  conversation that set it up. Scheduled execution is not
                  available yet.
                </Possible>
              )}
              {(stack.queues.length > 0 || workers.length > 0) && (
                <>
                  <h2>Queued work</h2>
                  <Facts
                    rows={[
                      [
                        "Queue",
                        stack.queues.length ? (
                          <>
                            {stack.queues
                              .map(
                                (queue) =>
                                  `${queue.library} on ${brokerName(stack, queue.backend)}`,
                              )
                              .join(" · ")}{" "}
                            ·{" "}
                            <TextLink
                              onClick={() => onOpenDestination("cache")}
                            >
                              Cache & queue
                            </TextLink>
                          </>
                        ) : (
                          "Not recorded"
                        ),
                      ],
                      [
                        "Workers",
                        workers.length ? (
                          <>
                            {workers.map((worker) => (
                              <code key={worker.name}>{worker.name}</code>
                            ))}{" "}
                            ·{" "}
                            <TextLink
                              onClick={() => onOpenDestination("processes")}
                            >
                              Processes
                            </TextLink>
                          </>
                        ) : (
                          "None recorded"
                        ),
                      ],
                      ["Pending work", "Not measured"],
                    ]}
                  />
                </>
              )}
              <Planned title="Run now, pause and run history">
                Scheduled commands run on the host without the controller. Run
                now, pause and resume, retained run logs and missed-run
                detection are not implemented yet; change a schedule in
                conversation.
              </Planned>
            </>
          )}
          {section === "storage" && (
            <>
              {stack.volumes.length ? (
                <div className="sg-volume-list">
                  <div className="sg-volume-row sg-table-head">
                    <span>Volume</span>
                    <span>Holds</span>
                    <span>Size</span>
                    <span>Protection</span>
                  </div>
                  {stack.volumes.map((volume) => (
                    <div className="sg-volume-row" key={volume.name}>
                      <span>
                        <code>{volume.name}</code>
                        <small>{volume.mount}</small>
                      </span>
                      <span>
                        {volume.kind === "database"
                          ? `${volume.usedBy} data`
                          : `Application files · ${volume.usedBy}`}
                      </span>
                      <span>Not measured</span>
                      <span className="sg-outcome-warn">
                        Not backed up · {backupsLink}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Possible
                  title="No persistent storage recorded"
                  available
                  draft="Which files or volumes does this application need to keep across container replacement?"
                  onAsk={(draft) => onAsk(null, draft)}
                >
                  Volumes appear here when the deployment records data the
                  application must keep across container replacement: database
                  data, uploads, documents or configuration, each with its
                  protection state.
                </Possible>
              )}
              <p className="sg-section-note">
                A persistent volume survives container replacement on this
                instance. It does not survive losing the host; off-host backups
                do that.
              </p>
              <Planned title="Disk usage and growth">
                Measured usage per volume, host disk pressure and targeted
                cleanup will live here.
              </Planned>
            </>
          )}
          {section === "backups" && (
            <>
              <div className="sg-section-empty">
                <h2>
                  {protectable.length
                    ? protectable.length === 1
                      ? `${protectable[0].label} is not backed up`
                      : "Your data is not backed up"
                    : stack.recorded
                      ? "Nothing persistent recorded to protect"
                      : "No protection plan configured"}
                </h2>
                <p>
                  {stack.recorded && !protectable.length
                    ? "This application records no database or file volume. Protection becomes relevant when it keeps state on its instance."
                    : "A persistent volume survives container replacement. It does not protect against losing the host."}
                </p>
              </div>
              {protectable.length > 0 && (
                <>
                  <h2>What needs protection</h2>
                  <Facts
                    rows={protectable.map((item) => [
                      item.label,
                      <Fragment key={item.key}>
                        {item.detail} · <em>{item.method}</em> ·{" "}
                        <span className="sg-outcome-warn">not backed up</span>
                      </Fragment>,
                    ])}
                  />
                </>
              )}
              <Facts
                rows={[
                  ["Backup destination", "Not connected"],
                  ["Schedule", "Not configured"],
                  ["Last successful backup", "No backup recorded"],
                  ["Restore verification", "Not tested"],
                ]}
              />
              <Planned title="Connect storage. Let Server Guy handle the rest.">
                The planned flow recommends Cloudflare R2 or AWS S3, asks for
                scoped access, configures a schedule and retention per kind of
                state, and verifies an isolated restore. Backup execution is not
                available yet.
              </Planned>
            </>
          )}
          {section === "logs" && (
            <Logs
              deployment={deployment}
              applicationId={app.id}
              onRefresh={onRefresh}
            />
          )}
          {section === "monitoring" && (
            <>
              <Facts
                rows={[
                  ["Last application verification", verified],
                  ["Continuous monitoring", "Not running"],
                  [
                    "Watched",
                    stack.recorded
                      ? `${stack.processes.length} process${stack.processes.length === 1 ? "" : "es"}${stack.databases.length ? `, ${stack.databases.length} database${stack.databases.length === 1 ? "" : "s"}` : ""}${stack.jobs.length ? `, ${stack.jobs.length} scheduled job${stack.jobs.length === 1 ? "" : "s"}` : ""} · no checks configured`
                      : "Nothing recorded yet",
                  ],
                  ["Issues", "No in-app issues recorded"],
                  ["Notifications", "In-app only · no external provider"],
                  ["CPU, memory and disk", "Not measured"],
                ]}
              />
              <Planned title="Know when your application needs you">
                Health, errors, job results and host resources will be collected
                over time, independently of an open dashboard. Server Guy will
                record issues here and in-app, with evidence and a next action.
                External notification providers are not selected yet.
              </Planned>
            </>
          )}
          {section === "domains" && (
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
              <Planned title="A domain, HTTPS and delivery that fit your app">
                Server Guy will connect your existing DNS provider, configure
                routing and certificates, and recommend CDN caching when useful.
                Cloudflare access will be requested only when it is needed.
              </Planned>
            </>
          )}
          {section === "variables" && (
            <>
              {variables.length ? (
                <div className="sg-variable-list">
                  <div className="sg-variable-row sg-table-head">
                    <span>Name</span>
                    <span>Value</span>
                  </div>
                  {variables.map((name) => (
                    <div className="sg-variable-row" key={name}>
                      <code>{name}</code>
                      <span>Hidden</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sg-section-empty">
                  <h2>No variables recorded</h2>
                  <p>
                    Required configuration will appear after repository
                    inspection.
                  </p>
                </div>
              )}
              <p className="sg-section-note">
                Names come from the deployment plan. Secret values are never
                exposed in this view.
              </p>
              <Planned title="Configuration with a clear impact">
                Editing, rotating secrets, and distinguishing build-time from
                runtime values will live here. Missing deployment inputs are
                provided in the deployment approval inside the conversation.
              </Planned>
            </>
          )}
        </div>
      )}
    </div>
  );
}
