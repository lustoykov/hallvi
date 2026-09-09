"use client";

import {
  Facts,
  LinkButton,
  Planned,
  Possible,
  TextLink,
  When,
  stateText,
  verifiedText,
  type ViewProps,
} from "./bits";
import { LocalTime } from "../local-time";

/**
 * The database as recorded, then what was measured on the host when a
 * measurement exists. Measurements never come from the plan.
 */
export function DatabaseView(props: ViewProps) {
  const { stack, facts, deployment, now, onAction, busy } = props;
  const verified = verifiedText(deployment);
  const measured = facts.database;
  const backupsLink = (
    <TextLink onClick={() => props.onOpenDestination("backups")}>
      Backups
    </TextLink>
  );
  const coverage = facts.protection?.coverage.find((item) =>
    item.key.startsWith("database:"),
  );
  const protectionText = coverage ? (
    coverage.state === "protected" ? (
      coverage.lastSuccessfulAt ? (
        <>
          Backed up · last copy{" "}
          <LocalTime value={coverage.lastSuccessfulAt} variant="compact" />
        </>
      ) : (
        "Backed up"
      )
    ) : coverage.state === "behind" ? (
      "Behind policy"
    ) : coverage.state === "failed" ? (
      "Last backup failed"
    ) : (
      "Not backed up"
    )
  ) : (
    "Not configured"
  );
  return (
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
                          Persistent volume <code>database</code> ·{" "}
                          {measured ? (
                            <>
                              <strong>{measured.sizeGb.toFixed(1)} GB</strong>{" "}
                              <span className="sg-op-muted">
                                measured{" "}
                                <When at={measured.measuredAt} now={now} />
                              </span>
                            </>
                          ) : (
                            "not measured"
                          )}{" "}
                          ·{" "}
                          <TextLink
                            onClick={() => props.onOpenDestination("storage")}
                          >
                            Storage
                          </TextLink>
                        </>,
                      ],
                      ...(measured
                        ? ([
                            [
                              "Connections",
                              `${measured.connections} open at the last sample`,
                            ],
                            [
                              "Growth",
                              measured.growthMbPerWeek != null
                                ? `About ${measured.growthMbPerWeek} MB a week`
                                : "Not enough samples yet",
                            ],
                          ] as Array<[string, React.ReactNode]>)
                        : []),
                      ...(measured?.scratch
                        ? ([
                            [
                              "Scratch copy",
                              <>
                                <code>{measured.scratch.name}</code> ·{" "}
                                {measured.scratch.rows.toLocaleString()} rows ·
                                restored from the backup of{" "}
                                <LocalTime
                                  value={measured.scratch.from}
                                  variant="compact"
                                />{" "}
                                · read-only · removed{" "}
                                <LocalTime
                                  value={measured.scratch.until}
                                  variant="compact"
                                />
                              </>,
                            ],
                          ] as Array<[string, React.ReactNode]>)
                        : []),
                      [
                        "Backups",
                        <>
                          {protectionText} · {backupsLink}
                        </>,
                      ],
                    ]
                  : [
                      ["State", stateText(database.state, verified)],
                      ["File", <code key="file">{database.location}</code>],
                      [
                        "Size",
                        measured
                          ? `${Math.round(measured.sizeGb * 1024)} MB`
                          : "Not measured",
                      ],
                      [
                        "Protection",
                        <>
                          {coverage
                            ? protectionText
                            : "Backed up with the application’s files as a consistent copy, not a live file copy"}{" "}
                          · {backupsLink}
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
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          When the deployment plan includes PostgreSQL, Server Guy runs it
          privately beside the application with a persistent volume and shows it
          here; an embedded SQLite file is treated as part of the application’s
          files. An application does not need a database to deploy.
        </Possible>
      )}
      {stack.databases.length > 0 && onAction && (
        <div className="sg-op-links">
          <LinkButton
            disabled={busy === "measure-database"}
            onClick={() => onAction({ type: "measure-database" })}
          >
            Measure storage now
          </LinkButton>
        </div>
      )}
      {stack.databases.length > 0 && !onAction && (
        <Planned title="Database operations">
          Connection management, database-specific logs, storage measurements
          and restore controls will live here. This view currently shows
          deployment facts only.
        </Planned>
      )}
    </>
  );
}
