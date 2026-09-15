"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Backups.
// Calendar: one column a day, from the day before the first thing on record
// to a week ahead. A row for the copies taken, a row for each piece
// of data saying whether each copy holds it, and a row for restore tests. A
// day the schedule should have copied but the record doesn't show is dashed,
// never green. Little Server stands over today; a day opens what is on
// record for it.

import {
  Archive,
  ArrowCounterClockwise,
  ChatCircleText,
  Check,
  Database,
  FolderSimple,
  HardDrives,
  Minus,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { useDismiss } from "../overview-prototype/shared";
import { clock, countWord, when } from "../stack-prototype/stack-model";
import type { ProtectProps } from "./protect-story";
import { ago } from "../architecture-prototype/model";
import { controllerSentence, controllerWord } from "../controller-protection";
import { dayOf, listed } from "./model";
import "./calendar.css";

type State =
  "none" | "copy" | "held" | "unknown" | "planned" | "out" | "passed";
interface Cell {
  state: State;
  mark?: ReactNode;
  title: string;
  lines: string[];
}
interface Row {
  id: string;
  icon: ReactNode;
  name: ReactNode;
  status: string;
  c: "verified" | "stale" | "gap" | "absent" | "fact";
  cells: Cell[];
}

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const empty: Cell = { state: "none", title: "", lines: [] };
const startOf = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
const weekday = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { weekday: "short" });
const month = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { month: "long" });

const legend: [State, string][] = [
  ["copy", "Copy on record"],
  ["held", "In that copy, per the plan"],
  ["unknown", "Scheduled, not on record here"],
  ["planned", "Scheduled"],
  ["out", "Left out of the plan"],
  ["passed", "Restore test passed"],
];

export function CalendarDirection({
  story,
  now,
  head,
  activity,
  controller,
  controllerBand,
  onAsk,
}: ProtectProps) {
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axbc-pop, .axbc-cell", close);
  const scroller = useRef<HTMLDivElement>(null);

  // ---------- The days ----------
  const today = startOf(now);
  const firsts = [
    story.createdAt,
    story.schedules.at(-1)?.at,
    story.copies.at(-1)?.at,
  ]
    .filter((at): at is string => Boolean(at))
    .map((at) => startOf(Date.parse(at)));
  const cursor = new Date(firsts.length ? Math.min(...firsts) : today);
  cursor.setDate(cursor.getDate() - 1);
  const floor = new Date(today);
  floor.setDate(floor.getDate() - 14);
  if (cursor.getTime() < floor.getTime()) cursor.setTime(floor.getTime());
  const end = new Date(today);
  end.setDate(end.getDate() + 6);
  const days: number[] = [];
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  const todayIndex = days.indexOf(today);

  // ---------- What each day holds ----------
  const copy = story.copies[0] ?? null;
  const restore = story.restores[0] ?? null;
  const keep = story.protection.keep;
  const fresh = Boolean(copy) && now - Date.parse(copy!.at) < FRESH_MS;
  const scheduleDay = story.schedules.length
    ? startOf(Date.parse(story.schedules.at(-1)!.at))
    : null;
  const copiesOn = (day: number) =>
    story.copies.filter((item) => startOf(Date.parse(item.at)) === day);
  const restoresOn = (day: number) =>
    story.restores.filter((item) => startOf(Date.parse(item.at)) === day);
  const copyState = (day: number) =>
    copiesOn(day).length
      ? "copy"
      : scheduleDay === null || day <= scheduleDay
        ? "none"
        : day <= today
          ? "unknown"
          : "planned";

  const copiesRow: Row = {
    id: "copies",
    icon: <Archive weight="bold" />,
    name: "Copies taken",
    status: `${story.copies.length} on record${keep ? ` · keeps ${keep}` : ""}`,
    c: copy ? (fresh ? "verified" : "stale") : "absent",
    cells: days.map((day): Cell => {
      const state = copyState(day);
      const list = copiesOn(day);
      if (state === "copy")
        return {
          state,
          mark:
            list.length > 1 ? <b>{list.length}</b> : <Check weight="bold" />,
          title:
            list.length === 1
              ? "A copy was taken"
              : `${countWord(list.length)} copies were taken`,
          lines: list.map((item) => `${clock(item.at)} · ${item.detail}`),
        };
      if (state === "unknown")
        return {
          state,
          title: "Scheduled, not on record here",
          lines: [
            "The daily backup should have run. Any copy it made isn't on record here.",
          ],
        };
      if (state === "planned")
        return {
          state,
          title: "Scheduled",
          lines: [
            `The daily backup is set to run${keep ? `, and the latest ${keep} copies are kept` : ""}.`,
          ],
        };
      return empty;
    }),
  };

  const pieceRows: Row[] = story.pieces.map((piece) => ({
    id: piece.key,
    icon: !piece.method ? (
      <Minus weight="bold" />
    ) : piece.key.endsWith(":db") ? (
      <Database weight="bold" />
    ) : (
      <FolderSimple weight="bold" />
    ),
    name: piece.label,
    status: piece.method ? "In the daily copy" : "Not in the backup plan",
    c: piece.method ? "fact" : "gap",
    cells: days.map((day): Cell => {
      const state = copyState(day);
      if (state === "none") return empty;
      if (!piece.method)
        return {
          state: "out",
          title: "Not in the backup plan",
          lines: [`The plan doesn't copy ${piece.label}, so no copy holds it.`],
        };
      if (state === "copy")
        return {
          state: "held",
          title: "In this copy, per the plan",
          lines: [
            `The record doesn't list what each copy holds; the plan copies ${piece.label} as a ${piece.method}.`,
          ],
        };
      if (state === "unknown")
        return {
          state: "unknown",
          title: "Scheduled, not on record here",
          lines: [`A copy that day would hold it as a ${piece.method}.`],
        };
      return {
        state: "planned",
        title: "Scheduled",
        lines: [`The next copies will hold it as a ${piece.method}.`],
      };
    }),
  }));

  const restoreRow: Row = {
    id: "restores",
    icon: <ArrowCounterClockwise weight="bold" />,
    name: "Restore tests",
    status: restore ? `Passed ${when(restore.at)}` : "Not run yet",
    c: restore ? "fact" : "absent",
    cells: days.map((day): Cell => {
      const list = restoresOn(day);
      return list.length
        ? {
            state: "passed",
            mark: <Check weight="bold" />,
            title: "Restore test passed",
            lines: list.map((item) => `${clock(item.at)} · ${item.detail}`),
          }
        : empty;
    }),
  };

  // Server Guy's own copies, on the same days as the application's. A cell is
  // drawn only where a copy actually reached storage; a failure or a skip is
  // said in the row's status and under the board, never as a green mark.
  const controllerRow: Row | null = controller
    ? {
        id: "controller",
        icon: <HardDrives weight="bold" />,
        name: "Server Guy itself",
        status:
          controllerWord[controller.state] +
          (controller.lastCopyAt
            ? ` · last ${ago(controller.lastCopyAt, now)}`
            : ""),
        c:
          controller.state === "recoverable"
            ? "verified"
            : controller.state === "failing"
              ? "gap"
              : controller.state === "copied"
                ? "stale"
                : "absent",
        cells: days.map((day): Cell => {
          const list = controller.copies.filter(
            (item) =>
              item.outcome === "succeeded" &&
              startOf(Date.parse(item.at)) === day,
          );
          if (!list.length)
            return day > today && controller.connected
              ? {
                  state: "planned",
                  title: "Scheduled",
                  lines: [
                    `Server Guy copies its own records after each piece of work and once a day; the last ${controller.keep} copies are kept.`,
                  ],
                }
              : empty;
          return {
            state: "copy",
            mark:
              list.length > 1 ? <b>{list.length}</b> : <Check weight="bold" />,
            title:
              list.length === 1
                ? "A copy of Server Guy's own records"
                : `${countWord(list.length)} copies of Server Guy's own records`,
            lines: list.map(
              (item) =>
                `${clock(item.at)} · encrypted copy of Server Guy's records and keys${item.size ? `, ${item.size}` : ""}`,
            ),
          };
        }),
      }
    : null;

  const rows = [
    copiesRow,
    ...pieceRows,
    restoreRow,
    ...(controllerRow ? [controllerRow] : []),
  ];

  // ---------- What it says ----------
  const unknownDays = days.filter((day) => copyState(day) === "unknown");
  const say = copy
    ? `${story.copies.length === 1 ? "One copy" : `${countWord(story.copies.length)} copies`} ${story.copies.length === 1 ? "is" : "are"} on record${keep ? `; the schedule keeps ${keep}` : ""}.`
    : "No copy off the server is on record.";
  const sub = [
    unknownDays.length > 0 &&
      `The scheduled ${unknownDays.length === 1 ? "copy" : "copies"} for ${listed(unknownDays.map(dayOf))} ${unknownDays.length === 1 ? "isn't" : "aren't"} on record here.`,
    restore && `A restore test passed ${when(restore.at)}.`,
    controller && controllerSentence(controller, now),
  ]
    .filter(Boolean)
    .join(" ");

  // A phone cannot hold three weeks of day columns, so the board scrolls
  // sideways there. Opening it at the oldest day would show a reader the one
  // part of it nothing has happened in: start where today is.
  useEffect(() => {
    const box = scroller.current;
    const today = box?.querySelector<HTMLElement>(".axbc-day[data-today]");
    if (!box || !today || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = Math.max(
      0,
      today.offsetLeft + today.offsetWidth / 2 - box.clientWidth / 2,
    );
  }, [days.length, todayIndex]);

  return (
    <section className="axbc" aria-label="Backups">
      {head}
      {activity}
      <div className="axbc-lede">
        <div>
          <h2 className="axbc-say">{say}</h2>
          {sub && <p className="axbc-sub">{sub}</p>}
        </div>
        <button
          type="button"
          className="ax-button axbc-ask"
          onClick={() =>
            onAsk(
              "List the backup copies kept off the server, with their dates and sizes.",
            )
          }
        >
          <ChatCircleText weight="bold" />
          Ask Server Guy to list the copies
        </button>
      </div>

      <div className="axbc-board">
        <div className="axbc-scroll" ref={scroller}>
          <div
            className="axbc-grid"
            style={
              {
                "--cols": days.length,
                gridTemplateRows: `auto repeat(${rows.length}, 52px)`,
              } as CSSProperties
            }
          >
            <span className="axbc-corner">{month(days[0])}</span>
            {todayIndex >= 0 && (
              <span
                className="axbc-today"
                style={{ gridColumn: todayIndex + 2 }}
                aria-hidden="true"
              />
            )}
            {days.map((day, index) => (
              <span
                key={day}
                className="axbc-day"
                data-today={day === today || undefined}
                style={{ gridColumn: index + 2, gridRow: 1 }}
              >
                {day === today && (
                  <LittleServer
                    mood={
                      moodOf[copy ? (fresh ? "verified" : "stale") : "failed"]
                    }
                    className="axbc-guy"
                  />
                )}
                <small>{day === today ? "Today" : weekday(day)}</small>
                <b>{new Date(day).getDate()}</b>
              </span>
            ))}
            {rows.map((row, rowIndex) => (
              <Fragment key={row.id}>
                <div
                  className="axbc-head"
                  data-c={row.c}
                  style={{ gridRow: rowIndex + 2, gridColumn: 1 }}
                >
                  <span className="axbc-head-icon" aria-hidden="true">
                    {row.icon}
                  </span>
                  <span className="axbc-head-text">
                    <b>{row.name}</b>
                    <small>
                      <i aria-hidden="true" />
                      {row.status}
                    </small>
                  </span>
                </div>
                {row.cells.map((cell, index) => {
                  const id = `${row.id}@${days[index]}`;
                  return (
                    <div
                      key={id}
                      className="axbc-slot"
                      style={{ gridRow: rowIndex + 2, gridColumn: index + 2 }}
                    >
                      {cell.state !== "none" && (
                        <button
                          type="button"
                          className="axbc-cell"
                          data-state={cell.state}
                          aria-label={`${dayOf(days[index])}: ${cell.title}`}
                          aria-expanded={open === id}
                          onClick={() =>
                            setOpen((value) => (value === id ? null : id))
                          }
                        >
                          {cell.mark}
                        </button>
                      )}
                      {open === id && (
                        <div
                          className="axbc-pop"
                          role="dialog"
                          aria-label={`${dayOf(days[index])}: ${cell.title}`}
                          data-align={index > days.length - 5 ? "end" : "start"}
                        >
                          <header>
                            <div>
                              <b>{dayOf(days[index])}</b>
                              <small>{cell.title}</small>
                            </div>
                            <button
                              type="button"
                              onClick={close}
                              aria-label="Close"
                            >
                              <X weight="bold" />
                            </button>
                          </header>
                          {cell.lines.map((line, lineIndex) => (
                            <p key={lineIndex}>{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <ul className="axbc-legend">
          {legend.map(([state, words]) => (
            <li key={state}>
              <i className="axbc-swatch" data-state={state} />
              {words}
            </li>
          ))}
        </ul>
      </div>
      {controllerBand}
    </section>
  );
}
