"use client";

import {
  Condition,
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
import { lastVerifiedProof } from "../fact-status";
import { LocalTime } from "../local-time";
import { Meter } from "./visuals";

/**
 * The database as recorded, then what was measured on the host when a
 * measurement exists. Measurements never come from the plan; a size with
 * no measurement behind it is shown as not measured, never as zero.
 */
export function DatabaseView(props: ViewProps) {
  const { stack, facts, deployment, now, onAction, busy } = props;
  const verified = verifiedText(deployment);
  const measured = facts.database;
  const disk = facts.storage?.hostDisk;
  const backupsLink = (
    <TextLink onClick={() => props.onOpenDestination("backups")}>
      Backups
    </TextLink>
  );
  const coverage = facts.protection?.coverage.find((item) =>
    item.key.startsWith("database:"),
  );
  // A verified operator proof restored this data at least once, so this view
  // may not say no copy exists. It stays amber: nothing runs on a schedule.
  const proved = facts.backupEvidence
    ? lastVerifiedProof(facts.backupEvidence)
    : null;
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
  ) : proved ? (
    <>
      Restore proved
      {proved.finishedAt ? (
        <>
          {" "}
          <LocalTime value={proved.finishedAt} variant="compact" />
        </>
      ) : (
        ""
      )}{" "}
      · not scheduled
    </>
  ) : (
    "Not configured"
  );
  const primary = stack.databases[0];
  // Weeks of headroom, when both a size and a growth rate were measured.
  const weeksLeft =
    measured && disk && measured.growthMbPerWeek
      ? Math.round(
          ((disk.totalGb - disk.usedGb) * 1024) / measured.growthMbPerWeek,
        )
      : null;
  return (
    <>
      {primary && (
        <Condition
          tone={
            coverage?.state === "failed"
              ? "bad"
              : coverage?.state === "protected"
                ? "ok"
                : "warn"
          }
          title={
            primary.kind === "postgres"
              ? `PostgreSQL ${primary.version}${measured ? ` · ${measured.sizeGb.toFixed(1)} GB` : ""}`
              : `Embedded SQLite${measured ? ` · ${Math.round(measured.sizeGb * 1024)} MB` : ""}`
          }
        >
          {primary.kind === "postgres"
            ? "Running privately beside the application on the same instance, on a persistent volume."
            : "A file inside the application’s own storage, backed up with its files as a consistent copy."}{" "}
          {coverage
            ? coverage.state === "protected"
              ? "It has an off-host copy."
              : "It has no current off-host copy."
            : proved
              ? "An operator proved once that an off-host copy of this data restores. Scheduled backups are not configured."
              : "Off-host protection is not configured."}
        </Condition>
      )}
      {measured && disk && (
        <div className="sg-band">
          <h2>Storage used</h2>
          <Meter
            label="Database on the instance disk"
            percent={(measured.sizeGb / disk.totalGb) * 100}
            detail={`${measured.sizeGb.toFixed(1)} of ${disk.totalGb} GB`}
            note={
              <>
                Measured <When at={measured.measuredAt} now={now} />
                {measured.growthMbPerWeek != null
                  ? ` · growing about ${measured.growthMbPerWeek} MB a week`
                  : " · not enough samples for a growth rate yet"}
                {weeksLeft != null && weeksLeft < 520
                  ? ` · roughly ${weeksLeft} weeks of free disk at that rate`
                  : ""}
              </>
            }
          />
        </div>
      )}
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
                          {coverage || proved
                            ? protectionText
                            : "Not backed up. SQLite requires a consistent snapshot; a live file copy is not a verified backup."}{" "}
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
          deployment and restore facts.
        </Planned>
      )}
    </>
  );
}
