"use client";

import type { ReactNode } from "react";

/**
 * The small visual vocabulary the stable views share. Every element here
 * explains a quantity, a proportion, a sequence or a set of states that
 * words alone make slow to read. Nothing is decorative: a component with
 * one item, no measurement or no series renders nothing at all, so a
 * simple application stays a simple page.
 */

export type Tone = "ok" | "warn" | "bad" | "muted" | "working";

/** The headline for a view: one number, its unit and a short qualifier. */
export function Stat({
  value,
  label,
  detail,
  tone,
  onClick,
}: {
  value: ReactNode;
  label: string;
  detail?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const body = (
    <>
      <strong className={tone ? `sg-stat-${tone}` : undefined}>{value}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </>
  );
  return onClick ? (
    <button type="button" className="sg-stat sg-stat-button" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="sg-stat">{body}</div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="sg-stats">{children}</div>;
}

/**
 * A set of states as one bar plus its counts: how many pass, how many do
 * not. Below three items the counts alone are faster, so nothing renders.
 */
export function Tally({
  items,
  label,
}: {
  items: { label: string; count: number; tone: Tone }[];
  label: string;
}) {
  const shown = items.filter((item) => item.count > 0);
  const total = shown.reduce((sum, item) => sum + item.count, 0);
  if (total < 3 || shown.length < 2) return null;
  return (
    <div className="sg-tally" aria-label={label}>
      <div className="sg-tally-bar" aria-hidden="true">
        {shown.map((item) => (
          <span
            key={item.label}
            className={`sg-fill-${item.tone}`}
            style={{ flexGrow: item.count }}
          />
        ))}
      </div>
      <ul className="sg-tally-keys">
        {shown.map((item) => (
          <li key={item.label}>
            <i className={`sg-dot sg-fill-${item.tone}`} aria-hidden="true" />
            <strong>{item.count}</strong> {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How a measured whole divides up, with the unclaimed remainder shown as
 * headroom. Used where the remainder is the point: disk against volumes.
 */
export function Composition({
  segments,
  total,
  unit,
  remainderLabel = "Free",
  caption,
}: {
  segments: { label: string; value: number; tone?: Tone }[];
  total: number;
  unit: (value: number) => string;
  remainderLabel?: string;
  caption?: ReactNode;
}) {
  const used = segments.reduce((sum, item) => sum + item.value, 0);
  if (!total || used > total * 1.05) return null;
  const remainder = Math.max(0, total - used);
  const share = (value: number) => (value / total) * 100;
  const pressure = used / total;
  return (
    <div className="sg-composition">
      <div
        className={`sg-composition-bar${pressure >= 0.9 ? " bad" : pressure >= 0.75 ? " warn" : ""}`}
        aria-hidden="true"
      >
        {segments.map((item, index) => (
          <span
            key={item.label}
            className={
              item.tone ? `sg-fill-${item.tone}` : `sg-shade-${index % 6}`
            }
            style={{ width: `${share(item.value)}%` }}
            title={`${item.label} · ${unit(item.value)}`}
          />
        ))}
        <span
          className="sg-composition-free"
          style={{ width: `${share(remainder)}%` }}
        />
      </div>
      <ul className="sg-composition-keys">
        {segments.map((item, index) => (
          <li key={item.label}>
            <i
              className={`sg-dot ${item.tone ? `sg-fill-${item.tone}` : `sg-shade-${index % 6}`}`}
              aria-hidden="true"
            />
            {item.label}
            <strong>{unit(item.value)}</strong>
          </li>
        ))}
        <li className="sg-composition-remainder">
          <i className="sg-dot sg-composition-free" aria-hidden="true" />
          {remainderLabel}
          <strong>{unit(remainder)}</strong>
        </li>
      </ul>
      {caption && <p className="sg-visual-caption">{caption}</p>}
    </div>
  );
}

function meterTone(percent: number): "" | "warn" | "bad" {
  return percent >= 90 ? "bad" : percent >= 75 ? "warn" : "";
}

/** One measured level against its capacity, with the pressure marked. */
export function Meter({
  label,
  percent,
  detail,
  note,
}: {
  label: ReactNode;
  percent: number;
  detail: ReactNode;
  note?: ReactNode;
}) {
  const tone = meterTone(percent);
  const width = Math.max(1.5, Math.min(100, percent));
  return (
    <div className="sg-gauge">
      <div className="sg-gauge-head">
        <strong>{label}</strong>
        <span
          className={
            tone ? `sg-outcome-${tone === "bad" ? "bad" : "warn"}` : undefined
          }
        >
          {detail}
        </span>
      </div>
      <div
        className="sg-gauge-track"
        role="img"
        aria-label={`${typeof label === "string" ? label : "level"}: ${Math.round(percent)}%`}
      >
        <span
          className={`sg-gauge-fill ${tone}`}
          style={{ width: `${width}%` }}
        />
        <i
          className="sg-gauge-tick"
          style={{ left: "75%" }}
          aria-hidden="true"
        />
        <i
          className="sg-gauge-tick"
          style={{ left: "90%" }}
          aria-hidden="true"
        />
      </div>
      {note && <small className="sg-gauge-note">{note}</small>}
    </div>
  );
}

export interface FlowStage {
  key: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  state: "ok" | "pending" | "failed" | "absent" | "skipped";
  note?: ReactNode;
  /** The heading above the note; defaults to the stage label. */
  noteLabel?: string;
}

const flowWord: Record<FlowStage["state"], string> = {
  ok: "working",
  pending: "waiting",
  failed: "not working",
  absent: "not configured",
  skipped: "not in use",
};

/**
 * The path a request takes, stage by stage, each carrying its own state.
 * It is the one place where "the domain resolves but the certificate is
 * still pending" is legible without reading three separate rows.
 */
export function Flow({
  stages,
  caption,
}: {
  stages: FlowStage[];
  caption?: ReactNode;
}) {
  return (
    <div className="sg-flow">
      <ol className="sg-flow-track">
        {stages.map((stage) => (
          <li
            key={stage.key}
            className={`sg-flow-stage sg-flow-${stage.state}`}
          >
            <span className="sg-flow-mark" aria-hidden="true" />
            <span className="sg-flow-label">{stage.label}</span>
            <strong className="sg-flow-value">{stage.value}</strong>
            {stage.detail && (
              <span className="sg-flow-detail">{stage.detail}</span>
            )}
            <span className="sg-visually-hidden">{flowWord[stage.state]}</span>
          </li>
        ))}
      </ol>
      {stages.some((stage) => stage.note) && (
        <ul className="sg-flow-notes">
          {stages
            .filter((stage) => stage.note)
            .map((stage) => (
              <li key={stage.key} className={`sg-flow-${stage.state}`}>
                <strong>{stage.noteLabel ?? stage.label}</strong>
                {stage.note}
              </li>
            ))}
        </ul>
      )}
      {caption && <p className="sg-visual-caption">{caption}</p>}
    </div>
  );
}

export interface TimelinePoint {
  id: string;
  at: string;
  tone: Tone;
  label: string;
  detail?: string;
}

/**
 * Recorded moments on a real time axis: where the copies are, where the
 * gaps are, and how far back the retention actually reaches. A single
 * point has no shape worth drawing, so two are the minimum.
 */
export function Timeline({
  points,
  from,
  to,
  startLabel,
  endLabel,
  caption,
}: {
  points: TimelinePoint[];
  from: number;
  to: number;
  startLabel: ReactNode;
  endLabel: ReactNode;
  caption?: ReactNode;
}) {
  const span = to - from;
  if (points.length < 2 || span <= 0) return null;
  const at = (iso: string) =>
    Math.max(0, Math.min(100, ((Date.parse(iso) - from) / span) * 100));
  return (
    <div className="sg-timeline">
      <div className="sg-timeline-track">
        {points.map((point) => (
          <span
            key={point.id}
            className={`sg-timeline-point sg-fill-${point.tone}`}
            style={{ left: `${at(point.at)}%` }}
            title={`${point.label}${point.detail ? ` · ${point.detail}` : ""}`}
          />
        ))}
      </div>
      <div className="sg-timeline-scale">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      {caption && <p className="sg-visual-caption">{caption}</p>}
    </div>
  );
}

/**
 * The last handful of outcomes as one strip, newest on the right. Reads
 * as a rhythm: a run of green with one red is a different story from
 * alternating red, and neither needs a sentence.
 */
export function OutcomeStrip({
  outcomes,
  label,
}: {
  outcomes: { id: string; tone: Tone; title: string }[];
  label: string;
}) {
  if (outcomes.length < 3) return null;
  return (
    <span className="sg-outcome-strip" aria-label={label}>
      {outcomes.map((item) => (
        <i
          key={item.id}
          className={`sg-fill-${item.tone}`}
          title={item.title}
        />
      ))}
    </span>
  );
}

/** A proportional row list: comparable magnitudes without a whole. */
export function Bars({
  rows,
}: {
  rows: {
    key: string;
    label: ReactNode;
    value: number;
    text: ReactNode;
    tone?: Tone;
  }[];
}) {
  const peak = Math.max(...rows.map((row) => row.value), 0);
  if (!peak) return null;
  return (
    <ul className="sg-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="sg-bars-label">{row.label}</span>
          <span className="sg-bars-track" aria-hidden="true">
            <span
              className={row.tone ? `sg-fill-${row.tone}` : "sg-shade-0"}
              style={{ width: `${Math.max(1, (row.value / peak) * 100)}%` }}
            />
          </span>
          <span className="sg-bars-value">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The shape of a view while its facts are still being read. */
export function Loading({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="sg-loading" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="sg-loading-row" />
      ))}
    </div>
  );
}
