"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction A, Cutaway: the server opened up. Its processes sit above the
// disk, each with a mount line down into the volume it writes; the database
// file sits inside its volume, and the copy that survives losing the server
// sits outside it. The Database page brings the database forward; Storage
// shows every volume and what survives what. Pointing at a process lights
// its mount; a part opens its facts below. Nothing moves on arrival.

import {
  Archive,
  ChatCircleText,
  Check,
  Database,
  X,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { ago, countWord, when } from "../stack-prototype/stack-model";
import type { DataDirectionProps } from "./index";
import "./cutaway.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const size = (gb: number) =>
  gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`;

export function CutawayDirection({
  page,
  story,
  now,
  head,
  activity,
  server,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: DataDirectionProps) {
  const store = story.database;
  const guard = story.protection;
  const [selected, setSelected] = useState<string>(
    page === "database" ? "database" : (story.volumes[0]?.name ?? "copy"),
  );
  const [hot, setHot] = useState<string | null>(null);
  const checked = store?.probe?.at ?? null;
  const fresh = Boolean(checked) && now - Date.parse(checked!) < FRESH_MS;
  const copyAt = story.newestCopyAt;
  const copyFresh = Boolean(copyAt) && now - Date.parse(copyAt!) < FRESH_MS;
  const n = story.volumes.length;

  const say =
    page === "database"
      ? `${store?.owner ?? "The application"} keeps its data in ${store?.kind === "sqlite" ? "one SQLite file" : (store?.label ?? "a database")}.`
      : `${countWord(n)} ${n === 1 ? "volume keeps" : "volumes keep"} the application's data.`;
  const ask =
    page === "database"
      ? {
          label: "Ask Server Guy to back it up now",
          draft: `Back up ${store?.owner ?? "the application"}'s database now and verify the copy.`,
        }
      : {
          label: "Ask Server Guy to measure them",
          draft:
            "Measure how much space each volume and the server's disk use.",
        };

  // ---------- The facts of the part that is open ----------
  const rows: { label: string; value: string; mono?: boolean }[] = [];
  let title: ReactNode = null;
  let lines: { at: string; tone: string; text: string }[] = [];
  let note: string | null = null;
  const volume = story.volumes.find((item) => item.name === selected);
  if (selected === "database" && store) {
    const home = story.volumes.find((item) => item.database);
    title = (
      <>
        {store.file?.split("/").at(-1) ?? store.label}{" "}
        <small>{store.label}</small>
      </>
    );
    if (store.file) rows.push({ label: "Path", value: store.file, mono: true });
    if (home)
      rows.push({
        label: "Volume",
        value: `${home.name}${home.docker ? ` (${home.docker})` : ""}`,
        mono: true,
      });
    rows.push(
      { label: "Used by", value: `${store.owner} (${store.ownerName})` },
      { label: "Size", value: "Not measured" },
    );
    lines = story.marks
      .filter((mark) => mark.lane === "health")
      .map((mark) => ({
        at: mark.at,
        tone: mark.tone,
        text: `${mark.title} · ${mark.detail}`,
      }));
  } else if (volume) {
    title = (
      <>
        <code>{volume.name}</code>{" "}
        <small>{volume.kind === "database" ? "Data" : "Files"}</small>
      </>
    );
    rows.push(
      { label: "Holds", value: volume.holds },
      { label: "Mounted at", value: volume.mount, mono: true },
      ...(volume.docker
        ? [{ label: "Docker name", value: volume.docker, mono: true }]
        : []),
      { label: "Used by", value: `${volume.owner} (${volume.ownerName})` },
      {
        label: "Size",
        value:
          volume.sizeGb != null
            ? `${size(volume.sizeGb)}, measured ${ago(volume.measuredAt!, now)}`
            : "Not measured",
      },
      ...(volume.note ? [{ label: "Keeps", value: volume.note }] : []),
      {
        label: "Backup plan",
        value: volume.plan
          ? `Copies ${volume.plan.whole ? "the whole volume" : `${volume.database ?? "the database"} only`}, as a ${volume.plan.method}`
          : "Not in the plan",
      },
    );
    lines = story.marks
      .filter((mark) => mark.lane === `volume:${volume.name}`)
      .map((mark) => ({ at: mark.at, tone: mark.tone, text: mark.title }));
    note = copyAt
      ? `The newest copy off the server on record is from ${when(copyAt)}. The record doesn't list what each copy holds.`
      : "No copy off the server is on record.";
  } else {
    title = "Off the server";
    rows.push(
      ...(guard.schedule
        ? [
            {
              label: "Schedule",
              value: `${guard.schedule.words}, set up ${when(guard.schedule.at)}`,
            },
          ]
        : [{ label: "Schedule", value: "Not set up" }]),
      ...(guard.backup
        ? [
            {
              label: "Newest copy",
              value: `${when(guard.backup.at)}: ${guard.backup.detail}`,
            },
          ]
        : [{ label: "Newest copy", value: "None on record" }]),
      ...(guard.restore
        ? [
            {
              label: "Restore test",
              value: `${when(guard.restore.at)}: ${guard.restore.detail}`,
            },
          ]
        : [{ label: "Restore test", value: "Not run yet" }]),
    );
    note = guard.schedule
      ? "Scheduled backups may have run since; nothing newer is on record here."
      : null;
  }

  const cols = [
    ...story.volumes.map((item) =>
      item.sizeGb != null ? `${Math.max(item.sizeGb, 0.5)}fr` : "1fr",
    ),
    "0.7fr",
  ].join(" ");
  const hotOn = (name: string) => hot === name || undefined;
  const dimOn = (kind: string) =>
    (page === "database" && kind !== "database") || undefined;

  return (
    <section
      className="axcw"
      aria-label={page === "database" ? "Database" : "Storage"}
    >
      {head}
      {activity}
      <div className="axcw-lede">
        <div>
          <h2 className="axcw-say">{say}</h2>
          <p className="axcw-sure">
            {page === "database" ? (
              <Tag tone={checked ? (fresh ? "verified" : "stale") : "planned"}>
                {checked ? `Healthy ${ago(checked, now)}` : "Not checked"}
              </Tag>
            ) : (
              <Tag
                tone={copyAt ? (copyFresh ? "verified" : "stale") : "planned"}
              >
                {copyAt
                  ? `Newest copy ${ago(copyAt, now)}`
                  : "No copy on record"}
              </Tag>
            )}
            <span>
              {page === "database"
                ? "A recorded check, not continuous monitoring."
                : "A volume survives a container replacement; only the copy off the server survives losing it."}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axcw-ask"
          onClick={() => onAsk(ask.draft)}
        >
          <ChatCircleText weight="bold" />
          {ask.label}
        </button>
      </div>

      <figure className="axcw-figure" data-page={page}>
        <LittleServer mood={moodOf[story.tone]} className="axcw-guy" />
        <div className="axcw-server">
          <header className="axcw-server-head">
            <span>
              {server
                ? `${server.label}${server.city ? ` · ${server.city}` : ""}`
                : "The server"}
            </span>
            <small>Opened up, as recorded</small>
          </header>
          <div className="axcw-grid" style={{ gridTemplateColumns: cols }}>
            <span className="axcw-slab" aria-hidden="true" />
            {story.volumes.map((item, index) => (
              <button
                key={`proc:${item.name}`}
                type="button"
                className="axcw-proc"
                style={{ gridRow: 1, gridColumn: index + 1 }}
                data-hot={hotOn(item.name)}
                data-dim={dimOn(item.kind)}
                onPointerEnter={() => setHot(item.name)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(item.name)}
                onBlur={() => setHot(null)}
                onClick={() => onOpenDestination("processes")}
                aria-label={`${item.owner}, the ${item.ownerName} process. Open Processes`}
              >
                <b>{item.owner}</b>
                <code>{item.ownerName}</code>
              </button>
            ))}
            {story.volumes.map((item, index) => (
              <span
                key={`mount:${item.name}`}
                className="axcw-mount"
                style={{ gridRow: 2, gridColumn: index + 1 }}
                data-hot={hotOn(item.name)}
                data-dim={dimOn(item.kind)}
                aria-hidden="true"
              >
                <small>{item.mount}</small>
              </span>
            ))}
            {story.volumes.map((item, index) => (
              <button
                key={`vol:${item.name}`}
                type="button"
                className="axcw-vol"
                style={{ gridRow: 3, gridColumn: index + 1 }}
                data-kind={item.kind}
                data-hot={hotOn(item.name)}
                data-dim={dimOn(item.kind)}
                aria-pressed={
                  selected === item.name ||
                  (selected === "database" && Boolean(item.database))
                }
                onClick={() =>
                  setSelected(
                    page === "database" && item.database
                      ? "database"
                      : item.name,
                  )
                }
              >
                <span className="axcw-vol-name">
                  <code>{item.name}</code>
                  <small>{item.kind === "database" ? "Data" : "Files"}</small>
                </span>
                {item.database && (
                  <span
                    className="axcw-file"
                    data-focus={page === "database" || undefined}
                  >
                    <Database weight="bold" />
                    <b>{item.database}</b>
                    <small>{store?.label ?? "Database"}</small>
                    {page === "database" && checked && (
                      <em data-fresh={fresh || undefined}>
                        ok {ago(checked, now)}
                      </em>
                    )}
                  </span>
                )}
                <span className="axcw-size">
                  {item.sizeGb != null
                    ? size(item.sizeGb)
                    : "Size not measured"}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
              </button>
            ))}
            <span
              className="axcw-rest"
              style={{ gridRow: 3, gridColumn: story.volumes.length + 1 }}
            >
              System, images and free space
              <small>
                {story.disk
                  ? `${story.disk.usedGb} of ${story.disk.totalGb} GB used`
                  : "Not measured"}
              </small>
            </span>
          </div>
          <p className="axcw-disk">
            The server&apos;s disk
            {story.disk
              ? `, measured ${ago(story.disk.measuredAt, now)}`
              : ". Its size and free space aren't measured yet."}
          </p>
        </div>
        <span
          className="axcw-link"
          data-state={copyAt ? "copied" : "none"}
          aria-hidden="true"
        >
          <small>
            {copyAt ? (
              <>
                copied off
                <br />
                {when(copyAt)}
              </>
            ) : (
              "no copy on record"
            )}
          </small>
        </span>
        <button
          type="button"
          className="axcw-vault"
          aria-pressed={selected === "copy"}
          onClick={() => setSelected("copy")}
        >
          <Archive weight="bold" />
          <b>Off the server</b>
          {copyAt ? (
            <>
              <span>Newest copy {when(copyAt)}</span>
              {guard.schedule && <small>{guard.schedule.words}</small>}
              {guard.restore && (
                <small className="is-pass">
                  <Check weight="bold" /> Restore tested{" "}
                  {when(guard.restore.at)}
                </small>
              )}
            </>
          ) : (
            <span>No copy on record</span>
          )}
        </button>
      </figure>

      {page === "storage" && (
        <ul className="axcw-survives" aria-label="What survives what">
          <li data-ok={Boolean(story.keptAt) || undefined}>
            <Check weight="bold" />
            <span>
              <b>A container replacement:</b>{" "}
              {story.keptAt
                ? `${n === 2 ? "both volumes were" : "the volumes were"} kept when the containers were recreated, ${when(story.keptAt)}.`
                : "the volumes are kept; no replacement is on record yet."}
            </span>
          </li>
          <li data-ok={Boolean(copyAt) || undefined}>
            <Archive weight="bold" />
            <span>
              <b>Losing the server:</b> only the copy off the server survives
              {copyAt
                ? `; the newest on record is from ${when(copyAt)}.`
                : ", and none is on record."}
            </span>
          </li>
        </ul>
      )}

      <section className="axcw-details" aria-label="Details">
        <header>
          <b>{title}</b>
          {selected !==
            (page === "database" ? "database" : story.volumes[0]?.name) && (
            <button
              type="button"
              className="axcw-close"
              aria-label="Back to the first part"
              onClick={() =>
                setSelected(
                  page === "database"
                    ? "database"
                    : (story.volumes[0]?.name ?? "copy"),
                )
              }
            >
              <X weight="bold" />
            </button>
          )}
        </header>
        <dl>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.mono ? "ax-mono" : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {lines.length > 0 && (
          <div className="axcw-lines" role="log">
            {lines.map((line, index) => (
              <div key={index} data-tone={line.tone}>
                <time>{when(line.at)}</time>
                <b aria-hidden="true">
                  {line.tone === "fail"
                    ? "✗"
                    : line.tone === "pass"
                      ? "✓"
                      : "·"}
                </b>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        )}
        {note && <p className="axcw-note">{note}</p>}
      </section>

      {story.dataChanges.length > 0 && (
        <section className="axcw-changes" aria-label="Recent changes">
          <h3>Recent changes</h3>
          <ul>
            {story.dataChanges.map((change) => (
              <li key={change.id} data-state={change.state}>
                <button
                  type="button"
                  onClick={() =>
                    change.origin
                      ? onOpenConversation(
                          change.origin.chatId,
                          change.origin.messageId,
                        )
                      : onOpenDestination("history")
                  }
                >
                  {change.title}
                </button>
                <small>{when(change.at)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
