"use client";

import { Planned, Possible, TextLink, When, type ViewProps } from "./bits";

/**
 * Volumes and files that must survive container replacement, with their
 * measured size when a collector has one and their protection state.
 */
export function StorageView(props: ViewProps) {
  const { stack, facts, now } = props;
  const sizes = new Map(
    (facts.storage?.volumes ?? []).map((volume) => [volume.name, volume]),
  );
  const coverage = new Map(
    (facts.protection?.coverage ?? []).map((item) => [item.key, item]),
  );
  const backupsLink = (
    <TextLink onClick={() => props.onOpenDestination("backups")}>
      Backups
    </TextLink>
  );
  const disk = facts.storage?.hostDisk;
  return (
    <>
      {stack.volumes.length ? (
        <div className="sg-volume-list">
          <div className="sg-volume-row sg-table-head">
            <span>Volume</span>
            <span>Holds</span>
            <span>Size</span>
            <span>Protection</span>
          </div>
          {stack.volumes.map((volume) => {
            const size = sizes.get(volume.name);
            const protection =
              coverage.get(`volume:${volume.name}`) ??
              (volume.kind === "database"
                ? [...coverage.values()].find((item) =>
                    item.key.startsWith("database:"),
                  )
                : undefined);
            return (
              <div className="sg-volume-row" key={volume.name}>
                <span>
                  <code>{volume.name}</code>
                  <small>{volume.mount}</small>
                </span>
                <span data-label="Holds">
                  {volume.kind === "database"
                    ? `${volume.usedBy} data`
                    : `Application files · ${volume.usedBy}`}
                </span>
                <span data-label="Size">
                  {size ? (
                    <>
                      {size.sizeGb < 1
                        ? `${Math.round(size.sizeGb * 1024)} MB`
                        : `${size.sizeGb.toFixed(1)} GB`}
                      <small>
                        measured <When at={size.measuredAt} now={now} />
                      </small>
                    </>
                  ) : (
                    "Not measured"
                  )}
                </span>
                <span
                  data-label="Protection"
                  className={
                    protection?.state === "protected"
                      ? "sg-outcome-ok"
                      : "sg-outcome-warn"
                  }
                >
                  {protection?.state === "protected"
                    ? "Backed up"
                    : protection?.state === "behind"
                      ? "Behind policy"
                      : protection?.state === "failed"
                        ? "Last backup failed"
                        : "Not backed up"}{" "}
                  · {backupsLink}
                  {protection?.lastSuccessfulAt && (
                    <small>
                      last copy{" "}
                      <When at={protection.lastSuccessfulAt} now={now} />
                    </small>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <Possible
          title="No persistent storage recorded"
          available
          draft="Which files or volumes does this application need to keep across container replacement?"
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          Volumes appear here when the deployment records data the application
          must keep across container replacement: database data, uploads,
          documents or configuration, each with its protection state.
        </Possible>
      )}
      {disk && (
        <div className="sg-resource sg-resource-single">
          <div className="sg-resource-head">
            <strong>Instance disk</strong>
            <span
              className={
                disk.usedGb / disk.totalGb >= 0.9
                  ? "sg-outcome-bad"
                  : disk.usedGb / disk.totalGb >= 0.75
                    ? "sg-outcome-warn"
                    : undefined
              }
            >
              {disk.usedGb} of {disk.totalGb} GB used ·{" "}
              <When at={disk.measuredAt} now={now} />
            </span>
          </div>
          <div className="sg-meter" aria-hidden="true">
            <span
              className={
                disk.usedGb / disk.totalGb >= 0.9
                  ? "bad"
                  : disk.usedGb / disk.totalGb >= 0.75
                    ? "warn"
                    : ""
              }
              style={{
                width: `${Math.round((disk.usedGb / disk.totalGb) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      <p className="sg-section-note">
        A persistent volume survives container replacement on this instance. It
        does not survive losing the host; off-host backups do that.
      </p>
      {!facts.storage && (
        <Planned title="Disk usage and growth">
          Measured usage per volume, host disk pressure and targeted cleanup
          will live here.
        </Planned>
      )}
    </>
  );
}
