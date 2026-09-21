"use client";

// The register: the shared vocabulary of the inventory pages.
//
// Deployment, Processes, Database, Monitoring and Security are each an
// inventory of one subject: a strip that states the totals, a table with the
// columns that subject deserves, and rows that open in place. Nothing opens
// beside the table. What a row has to say sits directly under it, and the
// questions worth taking back to the conversation close the opened row.
//
// A cell never invents a value. A fact nobody recorded is drawn by `None`,
// which is grey and says so.

import { Fragment, useMemo, useState, type ReactNode } from "react";

import "./register.css";

export type Tone = "plain" | "good" | "warn" | "bad" | "working" | "idle";

/** "3 h ago", from the page's own clock so server and browser agree. */
export function ago(at: string | null | undefined, now: number) {
  const ms = at ? now - Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return "not recorded";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/* ------------------------------------------------------------- page frame */

/** What the register counts, and one sentence about the subject. */
export function Lede({
  holds,
  children,
}: {
  holds?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hv-rg-lede">
      {holds ? <span className="hv-rg-holds">{holds}</span> : null}
      <p>{children}</p>
    </div>
  );
}

export function Strip({ children }: { children: ReactNode }) {
  return <div className="hv-rg-strip">{children}</div>;
}

export function Figure({
  label,
  value,
  note,
  tone = "plain",
  bar,
  children,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  bar?: { value: number; max: number };
  children?: ReactNode;
}) {
  return (
    <div className="hv-rg-figure" data-tone={tone}>
      <span className="hv-rg-label">{label}</span>
      <strong className="hv-rg-value">{value}</strong>
      {bar ? <Bar value={bar.value} max={bar.max} tone={tone} /> : null}
      {note ? <small>{note}</small> : null}
      {children}
    </div>
  );
}

export function Board({
  title,
  note,
  tools,
  children,
}: {
  title: string;
  note?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="hv-rg-board">
      <div className="hv-rg-board-head">
        <h2>{title}</h2>
        {note ? <small>{note}</small> : null}
        {tools ? <div className="hv-rg-board-tools">{tools}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Foot({ children }: { children: ReactNode }) {
  return <div className="hv-rg-foot">{children}</div>;
}

/* -------------------------------------------------------------- controls */

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="hv-rg-chips">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="hv-rg-chip"
          data-on={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count === undefined ? null : <em>{option.count}</em>}
        </button>
      ))}
    </div>
  );
}

/** A question handed to the conversation. The title is the whole question. */
export function Ask({
  onAsk,
  prompt,
  children,
  tone = "plain",
}: {
  onAsk: (draft: string) => void;
  prompt: string;
  children?: ReactNode;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      className="hv-rg-ask"
      data-tone={tone}
      onClick={() => onAsk(prompt)}
      title={prompt}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M6 3 2.5 6.5 6 10M2.5 6.5H10a3.5 3.5 0 0 1 3.5 3.5v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{children ?? prompt}</span>
    </button>
  );
}

/** The way one register sends you to another. */
export function Go({
  onGo,
  children,
}: {
  onGo: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="hv-rg-ask" onClick={onGo}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 8h9m-3.5-3.5L12.5 8 8.5 11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------- cell parts */

export function Bar({
  value,
  max,
  tone = "plain",
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: ReactNode;
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="hv-rg-bar" data-tone={tone}>
      <span className="hv-rg-bar-track">
        <span
          className="hv-rg-bar-fill"
          style={{ width: `${width.toFixed(2)}%` }}
        />
      </span>
      {label === undefined ? null : <em>{label}</em>}
    </span>
  );
}

export function Pips({
  items,
  empty,
}: {
  items: { id: string; tone: Tone; title: string }[];
  empty: string;
}) {
  if (!items.length) return <None>{empty}</None>;
  return (
    <span className="hv-rg-pips">
      {items.map((item) => (
        <i key={item.id} data-tone={item.tone} title={item.title} />
      ))}
    </span>
  );
}

export function Tag({
  tone = "plain",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className="hv-rg-tag" data-tone={tone}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className="hv-rg-dot" data-tone={tone} aria-hidden="true" />;
}

/** Two lines in one cell: the name, and what qualifies it. */
export function Name({
  title,
  note,
  mono,
}: {
  title: ReactNode;
  note?: ReactNode;
  mono?: boolean;
}) {
  return (
    <span className="hv-rg-name">
      <strong className={mono ? "hv-rg-mono" : undefined}>{title}</strong>
      {note ? <span className="hv-rg-sub-note">{note}</span> : null}
    </span>
  );
}

export function Clip({ text, mono }: { text: string; mono?: boolean }) {
  return (
    <span className={`hv-rg-clip${mono ? " hv-rg-mono" : ""}`} title={text}>
      {text}
    </span>
  );
}

export function Num({ children }: { children: ReactNode }) {
  return <span className="hv-rg-num">{children}</span>;
}

/** A value nobody recorded. Never a zero, never a dash that reads as "none". */
export function None({ children = "not recorded" }: { children?: ReactNode }) {
  return <span className="hv-rg-none">{children}</span>;
}

/* ----------------------------------------------------------- opened rows */

/** The inside of an opened row. `asks` closes it, as a row of questions. */
export function Opened({
  children,
  asks,
}: {
  children: ReactNode;
  asks?: ReactNode;
}) {
  return (
    <div className="hv-rg-opened">
      {children}
      {asks ? <div className="hv-rg-asks">{asks}</div> : null}
    </div>
  );
}

export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="hv-rg-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="hv-rg-note">{children}</p>;
}

/** A second, quieter table inside an opened row. */
export function Sub({
  heads,
  rows,
  picked,
  onPick,
}: {
  heads: string[];
  rows: { id: string; tone?: Tone; cells: ReactNode[] }[];
  picked?: string | null;
  /** Given, a row is a control: picking it shows what belongs to it. */
  onPick?: (id: string) => void;
}) {
  return (
    <table className="hv-rg-sub">
      <thead>
        <tr>
          {heads.map((head) => (
            <th key={head}>{head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            data-tone={row.tone ?? "plain"}
            data-picked={picked === row.id || undefined}
            data-click={onPick ? true : undefined}
            onClick={onPick ? () => onPick(row.id) : undefined}
          >
            {row.cells.map((cell, index) => (
              <td key={`${row.id}-${index}`}>
                {index === 0 && onPick ? (
                  <button
                    type="button"
                    className="hv-rg-sub-pick"
                    aria-pressed={picked === row.id}
                  >
                    {cell}
                  </button>
                ) : (
                  cell
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------- register */

export interface Column<R> {
  key: string;
  head: string;
  /** Pixels; columns without one share the remainder. */
  width?: number;
  align?: "end";
  /** Given, the head becomes a sort control. */
  sort?: (row: R) => number | string;
  cell: (row: R) => ReactNode;
}

type Dir = "asc" | "desc";

export function Register<R extends { id: string }>({
  columns,
  rows,
  defaultSort,
  group,
  tone,
  detail,
  defaultOpen = null,
  empty,
}: {
  columns: Column<R>[];
  rows: R[];
  defaultSort?: { key: string; dir: Dir };
  /** Return a heading for a row, and the register breaks into blocks. */
  group?: (row: R) => string;
  tone?: (row: R) => Tone | undefined;
  /** Given, rows open in place. */
  detail?: (row: R) => ReactNode;
  /** The row that starts open: the one the reader most likely came for. */
  defaultOpen?: string | null;
  empty?: ReactNode;
}) {
  const [sortKey, setSortKey] = useState<string | null>(
    defaultSort?.key ?? null,
  );
  const [dir, setDir] = useState<Dir>(defaultSort?.dir ?? "desc");
  const [open, setOpen] = useState<string | null>(defaultOpen);

  const sorted = useMemo(() => {
    const read = columns.find((c) => c.key === sortKey)?.sort;
    if (!read) return rows;
    const out = [...rows].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      if (typeof left === "number" && typeof right === "number")
        return left - right;
      return String(left).localeCompare(String(right));
    });
    return dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sortKey, dir]);

  const blocks = useMemo(() => {
    if (!group) return [{ label: null as string | null, rows: sorted }];
    const map = new Map<string, R[]>();
    for (const row of sorted)
      map.set(group(row), [...(map.get(group(row)) ?? []), row]);
    return [...map].map(([label, list]) => ({
      label: label as string | null,
      rows: list,
    }));
  }, [sorted, group]);

  const span = columns.length + (detail ? 1 : 0);

  return (
    <div className="hv-rg-panel">
      <table className="hv-rg-table">
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
          {detail ? <col style={{ width: 30 }} /> : null}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.align === "end" ? "hv-rg-end" : undefined}
              >
                {column.sort ? (
                  <button
                    type="button"
                    className="hv-rg-sort"
                    data-on={sortKey === column.key}
                    onClick={() => {
                      if (sortKey === column.key)
                        setDir(dir === "desc" ? "asc" : "desc");
                      else {
                        setSortKey(column.key);
                        setDir("desc");
                      }
                    }}
                  >
                    {column.head}
                    <svg viewBox="0 0 10 10" aria-hidden="true">
                      <path
                        d={
                          sortKey === column.key && dir === "asc"
                            ? "M2 6.5 5 3.5l3 3"
                            : "M2 3.5 5 6.5l3-3"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  column.head
                )}
              </th>
            ))}
            {detail ? <th className="hv-rg-open" /> : null}
          </tr>
        </thead>

        {rows.length === 0 ? (
          <tbody>
            <tr className="hv-rg-blank">
              <td colSpan={span}>{empty ?? "Nothing here yet."}</td>
            </tr>
          </tbody>
        ) : (
          blocks.map((block, blockIndex) => (
            <tbody key={block.label ?? `block-${blockIndex}`}>
              {block.label ? (
                <tr className="hv-rg-group">
                  <td colSpan={span}>
                    {block.label}
                    <em>{block.rows.length}</em>
                  </td>
                </tr>
              ) : null}
              {block.rows.map((row) => {
                const isOpen = open === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="hv-rg-row"
                      data-tone={tone?.(row) ?? "plain"}
                      data-open={isOpen}
                      data-click={Boolean(detail)}
                      onClick={
                        detail
                          ? () => setOpen(isOpen ? null : row.id)
                          : undefined
                      }
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={
                            column.align === "end" ? "hv-rg-end" : undefined
                          }
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {detail ? (
                        <td className="hv-rg-open">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Close" : "Open"}
                          >
                            <svg viewBox="0 0 10 10" aria-hidden="true">
                              <path
                                d={
                                  isOpen
                                    ? "M2 6.5 5 3.5l3 3"
                                    : "M3.5 2 6.5 5l-3 3"
                                }
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {isOpen && detail ? (
                      <tr className="hv-rg-detail">
                        <td colSpan={span}>{detail(row)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          ))
        )}
      </table>
    </div>
  );
}
