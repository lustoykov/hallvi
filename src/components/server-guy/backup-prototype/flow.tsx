"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Storage.
// Flow: where the data goes, drawn as it travels. The server on the left
// holds each volume, piece by piece. A wire carries every piece the backup
// plan copies into the daily copy and off the server; a piece the plan
// leaves out ends at a wall. From the copies a line drops to the restore
// that was tested, and the way back into production is dashed, because
// nobody has tried it. Pointing at a part sends light along its wires; any
// part opens its facts below. Nothing moves on arrival.

import {
  Archive,
  ArrowCounterClockwise,
  CalendarCheck,
  ChatCircleText,
  Database,
  FolderSimple,
  Minus,
} from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { ago, countWord, when } from "../stack-prototype/stack-model";
import type { ProtectProps } from "./protect-story";
import { lasting, listed, soft, type Piece } from "./model";
import "./flow.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
// A volume of 8 KiB rounded to "0 MB", which says empty when it means small.
// Below a megabyte the recorded measurement is shown as it was written.
const size = (gb: number, text?: string | null) =>
  gb < 1 / 1024
    ? (text ?? "under 1 MB")
    : gb < 1
      ? `${Math.round(gb * 1024)} MB`
      : `${gb.toFixed(1)} GB`;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geo {
  width: number;
  height: number;
  boxes: Record<string, Box>;
}

/** A wire between two points, easing out of one and into the other. */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const half = (x2 - x1) / 2;
  const dx = Math.abs(half) < 24 ? 24 * Math.sign(half || 1) : half;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function FlowDirection({
  story,
  now,
  head,
  activity,
  server,
  onAsk,
}: ProtectProps) {
  const board = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [selected, setSelected] = useState(story.pieces[0]?.key ?? "copy");
  const [hot, setHot] = useState<string | null>(null);

  // Wires are drawn between the parts where the layout put them (each part
  // carries data-part), and again whenever the board changes size.
  const keys = story.pieces.map((piece) => piece.key).join("|");
  useLayoutEffect(() => {
    const element = board.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const boxes: Record<string, Box> = {};
      element.querySelectorAll<HTMLElement>("[data-part]").forEach((part) => {
        const rect = part.getBoundingClientRect();
        boxes[part.dataset.part!] = {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          w: rect.width,
          h: rect.height,
        };
      });
      setGeo({ width: origin.width, height: origin.height, boxes });
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [keys]);

  const copy = story.copies[0] ?? null;
  const restore = story.restores[0] ?? null;
  const guard = story.protection;
  const keep = guard.keep;
  const toneOf = (at: string): Tone =>
    now - Date.parse(at) < FRESH_MS ? "verified" : "stale";
  const covered = story.pieces.filter((piece) => piece.method);
  const left = story.pieces.filter((piece) => !piece.method);
  const n = story.volumes.length;

  // What lights up: a piece lights its own wire and the way off the server;
  // the copy or the copies light every wire; the restore lights its drop.
  const hotPiece = story.pieces.find((piece) => piece.key === hot) ?? null;
  const every = hot === "copy" || hot === "vault";
  const lit = (piece: Piece) =>
    hot === piece.key || (every && Boolean(piece.method));
  const trunk = every || Boolean(hotPiece?.method);
  const back = hot === "restore";
  const point = (key: string) => ({
    onPointerEnter: () => setHot(key),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(key),
    onBlur: () => setHot(null),
  });

  const [cadence, keeping] = (guard.schedule?.words ?? "").split(", ");
  const say = `${countWord(n)} ${n === 1 ? "volume holds" : "volumes hold"} the application's data on the server.`;
  const sub = [
    story.lostAt
      ? `${n === 1 ? "It did" : "They did"} not come through a container replacement ${when(story.lostAt)}.`
      : story.keptAt
        ? `${n === 1 ? "It" : n === 2 ? "Both" : "All"} came through a container replacement ${when(story.keptAt)}.`
        : "Nobody has tested whether it survives a container replacement.",
    covered.length
      ? `${guard.schedule ? "The daily backup" : "A backup"} copies ${listed(covered.map((piece) => soft(piece.label)))}${left.length ? `; it leaves out ${listed(left.map((piece) => soft(piece.label)))}` : ""}.`
      : "Nothing on the server is in a backup plan.",
  ]
    .filter(Boolean)
    .join(" ");

  // ---------- The facts of the part that is open ----------
  const rows: { label: string; value: string; mono?: boolean }[] = [];
  let title: ReactNode = null;
  let lines: { tone: "pass" | "untested" | "info"; text: string }[] = [];
  let note: string | null = null;
  const piece = story.pieces.find((item) => item.key === selected);
  const volume = piece
    ? story.volumes.find((item) => item.name === piece.volume)
    : undefined;
  if (piece && volume) {
    title = (
      <>
        {piece.label}{" "}
        <small>
          in <code>{volume.name}</code>
        </small>
      </>
    );
    rows.push(
      {
        label: "Volume",
        value: `${volume.name}${volume.docker ? ` (${volume.docker})` : ""}`,
        mono: true,
      },
      { label: "Mounted at", value: volume.mount, mono: true },
      { label: "Used by", value: `${volume.owner} (${volume.ownerName})` },
      {
        label: "Size",
        value:
          volume.sizeGb != null
            ? `${size(volume.sizeGb, volume.sizeText)}, measured ${ago(volume.measuredAt!, now)}`
            : "Not measured",
      },
      {
        label: "Backup plan",
        value: piece.method
          ? `Copied as a ${piece.method}`
          : "Not in the backup plan",
      },
      {
        label: "Containers replaced",
        // "Volumes stay when containers are replaced" is true of a named
        // volume and false of a bind mount to a temporary path, and this
        // page cannot tell which without a test that has run.
        value: story.lostAt
          ? `The data was lost, ${when(story.lostAt)}`
          : story.keptAt
            ? `Kept, as it was ${when(story.keptAt)}`
            : "Not tested",
      },
      {
        label: "Server lost",
        value: piece.method
          ? copy
            ? `Comes back from the copy of ${when(copy.at)}`
            : "No copy on record to bring it back"
          : "Lost with the server",
      },
    );
  } else if (selected === "copy") {
    title = "The daily copy";
    rows.push(
      {
        label: "Schedule",
        value: guard.schedule
          ? `${guard.schedule.words}; set up ${when(guard.schedule.at)}`
          : "Not set up",
      },
      {
        label: "What it copies",
        value: covered.length
          ? listed(covered.map((item) => `${item.label} (${item.method})`))
          : "Nothing",
      },
      {
        label: "What it leaves",
        value: left.length ? listed(left.map((item) => item.label)) : "Nothing",
      },
    );
    lines = story.schedules.toReversed().map((item) => ({
      tone: "info",
      text: `${when(item.at)} · ${item.detail}`,
    }));
    note = copy
      ? `The newest copy on record is from ${when(copy.at)}, ${lasting(now - Date.parse(copy.at))} ago. Scheduled copies since then aren't on record here.`
      : null;
  } else if (selected === "vault") {
    title = "Off the server";
    rows.push(
      {
        label: "Where",
        value: "Off-host storage; its location isn't in this record",
      },
      {
        label: "On record",
        value: `${story.copies.length} ${story.copies.length === 1 ? "copy" : "copies"}${keep ? ` of the ${keep} the schedule keeps` : ""}`,
      },
    );
    lines = story.copies.map((item) => ({
      tone: "pass",
      text: `${when(item.at)} · ${item.detail}`,
    }));
  } else {
    title = "The restore test";
    rows.push({
      label: "Tested",
      value: restore ? when(restore.at) : "Not yet",
    });
    lines = story.checks.map((check) => ({
      tone: check.state,
      text: check.state === "pass" ? check.label : `${check.label}: not tested`,
    }));
    note = restore?.detail ?? null;
  }

  const drawn = (key: string) => geo?.boxes[key];
  const wires = (() => {
    const s = drawn("server");
    const c = drawn("copy");
    const v = drawn("vault");
    const r = drawn("restore");
    if (!geo || !s || !c || !v || !r) return null;
    const cy = c.y + c.h / 2;
    const edge = s.x + s.w;
    const trunkPath = curve(c.x + c.w, cy, v.x, v.y + v.h / 2);
    const drop = `M ${v.x + v.w / 2} ${v.y + v.h} V ${r.y}`;
    const home = { x: edge + 34, y: s.y + s.h - 30 };
    return (
      <svg
        className="axbf-wires"
        width={geo.width}
        height={geo.height}
        aria-hidden="true"
      >
        {story.pieces.map((item) => {
          const p = drawn(item.key);
          if (!p) return null;
          const y = p.y + p.h / 2;
          if (!item.method) {
            // A long volume name widens the server box, which used to push
            // this label off the right of the board and clip it mid-word.
            const wall = Math.min(edge + 26, geo.width - 96);
            return (
              <g
                key={item.key}
                className="axbf-out"
                data-lit={lit(item) || undefined}
              >
                <path d={`M ${p.x + p.w} ${y} H ${wall}`} />
                <path
                  className="axbf-wall"
                  d={`M ${wall} ${y - 10} V ${y + 10}`}
                />
                <text x={wall + 10} y={y + 4}>
                  stays behind
                </text>
              </g>
            );
          }
          const path = curve(p.x + p.w, y, c.x, cy);
          return (
            <g
              key={item.key}
              className="axbf-in"
              data-lit={lit(item) || undefined}
            >
              <path d={path} />
              {lit(item) && <path className="axbf-light" d={path} />}
            </g>
          );
        })}
        <g className="axbf-in" data-lit={trunk || undefined}>
          <path d={trunkPath} />
          {trunk && <path className="axbf-light" d={trunkPath} />}
        </g>
        {restore && (
          <>
            <g className="axbf-in" data-lit={back || undefined}>
              <path d={drop} />
              {back && <path className="axbf-light" d={drop} />}
            </g>
            <g className="axbf-untested" data-lit={back || undefined}>
              <path d={curve(r.x, r.y + r.h / 2, home.x, home.y)} />
              <circle cx={home.x} cy={home.y} r={5} />
              <text x={home.x - 5} y={home.y + 22}>
                back into production · not tested
              </text>
            </g>
          </>
        )}
      </svg>
    );
  })();

  return (
    <section className="axbf" aria-label="Storage">
      {head}
      {activity}
      <div className="axbf-lede">
        <div>
          <h2 className="axbf-say">{say}</h2>
          <p className="axbf-sure">
            <Tag
              tone={
                story.lostAt
                  ? "failed"
                  : story.keptAt
                    ? toneOf(story.keptAt)
                    : "planned"
              }
            >
              {story.lostAt
                ? `Did not survive a replacement ${ago(story.lostAt, now)}`
                : story.keptAt
                  ? `Kept through a replacement ${ago(story.keptAt, now)}`
                  : "Never tested"}
            </Tag>
            <span>{sub}</span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axbf-ask"
          onClick={() =>
            onAsk(
              "Measure how much space each volume and the server's disk use.",
            )
          }
        >
          <ChatCircleText weight="bold" />
          Ask Server Guy to measure them
        </button>
      </div>

      <div className="axbf-board" ref={board}>
        {wires}
        <div className="axbf-server" data-part="server">
          <header>
            {server
              ? `${server.label}${server.city ? ` · ${server.city}` : ""}`
              : "The server"}
          </header>
          {story.volumes.map((item) => (
            <div key={item.name} className="axbf-vol">
              <div className="axbf-vol-head">
                <code>{item.name}</code>
                {/* A container path is long and truncating it is right in
                    this column; losing it is not. */}
                <small title={`${item.owner} · ${item.mount}`}>
                  {item.owner} · {item.mount}
                </small>
              </div>
              {item.pieces.map((entry) => (
                <button
                  key={entry.key}
                  data-part={entry.key}
                  type="button"
                  className="axbf-piece"
                  data-covered={Boolean(entry.method) || undefined}
                  data-hot={hot === entry.key || undefined}
                  aria-pressed={selected === entry.key}
                  onClick={() => setSelected(entry.key)}
                  {...point(entry.key)}
                >
                  {entry.method ? (
                    entry.key.endsWith(":db") ? (
                      <Database weight="bold" />
                    ) : (
                      <FolderSimple weight="bold" />
                    )
                  ) : (
                    <Minus weight="bold" />
                  )}
                  <b>{entry.label}</b>
                  <small>
                    {entry.method
                      ? `copied daily as a ${entry.method}`
                      : "not in the backup plan"}
                  </small>
                </button>
              ))}
              <p className="axbf-vol-foot">
                {item.sizeGb != null
                  ? size(item.sizeGb, item.sizeText)
                  : "Size not measured"}
                {item.note ? ` · ${item.note}` : ""}
                {story.lostAt
                  ? ` · lost ${when(story.lostAt)}`
                  : story.keptAt
                    ? ` · kept ${when(story.keptAt)}`
                    : ""}
              </p>
            </div>
          ))}
          <p className="axbf-disk">
            <span aria-hidden="true" />
            {story.disk
              ? `Disk: ${story.disk.usedGb} of ${story.disk.totalGb} GB used`
              : "The server's disk isn't measured yet"}
          </p>
        </div>

        <button
          data-part="copy"
          type="button"
          className="axbf-copy"
          data-hot={hot === "copy" || undefined}
          aria-pressed={selected === "copy"}
          onClick={() => setSelected("copy")}
          {...point("copy")}
        >
          <CalendarCheck weight="bold" />
          <b>{cadence || "No schedule"}</b>
          {keeping && <small>{keeping}</small>}
        </button>

        <div className="axbf-right">
          <button
            data-part="vault"
            type="button"
            className="axbf-vault"
            data-hot={hot === "vault" || undefined}
            aria-pressed={selected === "vault"}
            onClick={() => setSelected("vault")}
            {...point("vault")}
          >
            <LittleServer
              mood={moodOf[copy ? toneOf(copy.at) : "failed"]}
              className="axbf-guy"
            />
            <span className="axbf-vault-head">
              <Archive weight="bold" />
              <b>Off the server</b>
            </span>
            <span>
              {copy ? `Newest copy ${when(copy.at)}` : "No copy on record"}
            </span>
            {keep && (
              <span
                className="axbf-tiles"
                aria-label={`${story.copies.length} of ${keep} kept copies on record`}
              >
                {Array.from({ length: keep }, (_, index) => (
                  <i
                    key={index}
                    data-on={index < story.copies.length || undefined}
                  />
                ))}
              </span>
            )}
            <small>
              {story.copies.length} on record
              {keep ? ` · keeps ${keep}` : ""}
            </small>
          </button>
          <button
            data-part="restore"
            type="button"
            className="axbf-restore"
            data-hot={hot === "restore" || undefined}
            data-none={!restore || undefined}
            aria-pressed={selected === "restore"}
            onClick={() => setSelected("restore")}
            {...point("restore")}
          >
            <span className="axbf-vault-head">
              <ArrowCounterClockwise weight="bold" />
              <b>{restore ? "Restore tested" : "No restore tested"}</b>
            </span>
            {restore && <span>{when(restore.at)}</span>}
          </button>
        </div>
      </div>

      <section className="axbf-details" aria-label="Details">
        <header>
          <b>{title}</b>
        </header>
        {rows.length > 0 && (
          <dl>
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd className={row.mono ? "ax-mono" : undefined}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {lines.length > 0 && (
          <div className="axbf-lines" role="log">
            {lines.map((line, index) => (
              <div key={index} data-tone={line.tone}>
                <b aria-hidden="true">
                  {line.tone === "pass"
                    ? "✓"
                    : line.tone === "untested"
                      ? "–"
                      : "·"}
                </b>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        )}
        {note && <p className="axbf-note">{note}</p>}
      </section>
    </section>
  );
}
