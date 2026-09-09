"use client";

import {
  Condition,
  Planned,
  Possible,
  TextLink,
  When,
  type ViewProps,
} from "./bits";
import { Composition } from "./visuals";

const size = (gb: number) =>
  gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`;

/**
 * Volumes and files that must survive container replacement. Where the
 * host disk has been measured, the volumes are drawn against it: which one
 * is actually large, and how much headroom is left, are the two questions
 * a list of five equal rows answers slowly.
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
  const protectionOf = (name: string, kind: string) =>
    coverage.get(`volume:${name}`) ??
    (kind === "database"
      ? [...coverage.values()].find((item) => item.key.startsWith("database:"))
      : undefined);
  const measured = stack.volumes
    .map((volume) => ({ volume, size: sizes.get(volume.name) }))
    .filter((item) => item.size);
  const unknown = stack.volumes.filter(
    (volume) => protectionOf(volume.name, volume.kind)?.state === "unknown",
  );
  const unprotected = stack.volumes.filter((volume) => {
    const state = protectionOf(volume.name, volume.kind)?.state;
    return state !== "protected" && state !== "unknown";
  });
  const total = measured.reduce((sum, item) => sum + item.size!.sizeGb, 0);
  return (
    <>
      {stack.volumes.length > 0 && (
        <Condition
          tone={
            unprotected.length
              ? "warn"
              : unknown.length
                ? "muted"
                : disk
                  ? "ok"
                  : "muted"
          }
          title={
            `${stack.volumes.length} persistent volume${stack.volumes.length === 1 ? "" : "s"}` +
            (measured.length === stack.volumes.length
              ? ` · ${size(total)} on the instance`
              : "")
          }
        >
          {unknown.length > 0 && (
            <>
              Current off-host protection is unknown for {unknown.length} volume
              {unknown.length === 1 ? "" : "s"}. Check {backupsLink} for the
              last recorded copies.{" "}
            </>
          )}
          {unprotected.length
            ? `${unprotected.length} of them ${unprotected.length === 1 ? "is" : "are"} not backed up off the host. A volume survives container replacement; it does not survive losing the instance.`
            : unknown.length
              ? "A volume survives container replacement; it does not survive losing the instance."
              : "Every volume has an off-host copy. A volume survives container replacement; the off-host copy survives losing the instance."}
        </Condition>
      )}
      {disk && measured.length > 0 && (
        <div className="sg-band">
          <h2>Instance disk</h2>
          <Composition
            segments={measured.map((item) => ({
              label: item.volume.name,
              value: item.size!.sizeGb,
            }))}
            total={disk.totalGb}
            unit={size}
            remainderLabel="Free and system"
            caption={
              <>
                {disk.usedGb} of {disk.totalGb} GB used, measured{" "}
                <When at={disk.measuredAt} now={now} />. The remainder covers
                the operating system, images and free space.
              </>
            }
          />
        </div>
      )}
      {stack.volumes.length ? (
        <div className="sg-band">
          <h2>Volumes</h2>
          <div className="sg-volume-list">
            <div className="sg-volume-row sg-table-head">
              <span>Volume</span>
              <span>Holds</span>
              <span>Size</span>
              <span>Protection</span>
            </div>
            {stack.volumes.map((volume) => {
              const measurement = sizes.get(volume.name);
              const protection = protectionOf(volume.name, volume.kind);
              const bad = protection?.state === "failed";
              const warn =
                !bad &&
                protection?.state !== "protected" &&
                protection?.state !== "unknown";
              return (
                <div
                  className={`sg-volume-row${bad ? " sg-row-bad" : warn ? " sg-row-warn" : ""}`}
                  key={volume.name}
                >
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
                    {measurement ? (
                      <>
                        {size(measurement.sizeGb)}
                        <small>
                          measured{" "}
                          <When at={measurement.measuredAt} now={now} />
                        </small>
                      </>
                    ) : (
                      "Not measured"
                    )}
                  </span>
                  <span
                    data-label="Protection"
                    className={
                      protection?.state === "unknown"
                        ? undefined
                        : protection?.state === "protected"
                          ? "sg-outcome-ok"
                          : "sg-outcome-warn"
                    }
                  >
                    {protection?.state === "protected"
                      ? "Backed up"
                      : protection?.state === "unknown"
                        ? "Unknown"
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
      {!facts.storage && (
        <Planned title="Disk usage and growth">
          Measured usage per volume, host disk pressure and targeted cleanup
          will live here.
        </Planned>
      )}
    </>
  );
}
