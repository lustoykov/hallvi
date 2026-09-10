import type { ReactNode } from "react";

import type { StateId } from "./model";

/**
 * Shared SVG parts for every character, drawn in a 240 × 240 box. Faces are
 * parametric: CSS custom properties and data attributes on the character's
 * root drive openness, gaze, brows and mouth, so every change transitions.
 */

export const INK = "#26324a";

export type ArtProps = { uid: string };

export type CharacterDef = {
  Art: (props: ArtProps) => ReactNode;
  /** Ground shadow half-width. */
  shadowRx: number;
  /** Where sparkles burst from, and where the static sparkle glyph sits. */
  sparkleAt: [number, number];
  glyphAt: [number, number];
  /** Per-character extras written as --mc-x-<name> for each state. */
  extras: Record<StateId, Record<string, number>>;
};

/** A pinched four-point sparkle. */
export function star(cx: number, cy: number, r: number) {
  return `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

const origin = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px` });

/** Solid ink eye with a specular highlight; the default eye for most characters. */
export function EyeSolid({ cx, cy, r, side }: { cx: number; cy: number; r: number; side: "l" | "r" }) {
  return (
    <g className={`mc-eye mc-eye-${side}`} style={origin(cx, cy)}>
      <g className="mc-eye-open" style={origin(cx, cy)}>
        <g className="mc-pupil">
          <g className="mc-look">
            <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={INK} />
            <circle className="mc-hl" cx={cx - r * 0.34} cy={cy - r * 0.42} r={r * 0.37} fill="#fff" />
            <circle className="mc-hl mc-detail" cx={cx + r * 0.36} cy={cy + r * 0.38} r={r * 0.15} fill="#fff" opacity={0.85} />
            <path className="mc-hl-star" d={star(cx - r * 0.2, cy - r * 0.28, r * 0.62)} fill="#fff" />
          </g>
        </g>
      </g>
      <path className="mc-eye-arc mc-eye-happy" d={`M${cx - r} ${cy + r * 0.4} Q${cx} ${cy - r * 1.05} ${cx + r} ${cy + r * 0.4}`} />
      <path className="mc-eye-arc mc-eye-closed" d={`M${cx - r} ${cy} Q${cx} ${cy + r * 0.8} ${cx + r} ${cy}`} />
      <path className="mc-eye-arc mc-eye-lid" d={`M${cx - r * 1.08} ${cy + r * 0.14} Q${cx} ${cy - r * 0.98} ${cx + r * 1.08} ${cy + r * 0.14}`} />
    </g>
  );
}

/** White eyeball with a pupil and lids in the body colour; for eyes on stalks. */
export function EyeBall({
  cx, cy, r, side, lid, uid,
}: { cx: number; cy: number; r: number; side: "l" | "r"; lid: string; uid: string }) {
  const clip = `${uid}-ball-${side}`;
  return (
    <g className={`mc-eye mc-eye-${side} mc-eye--ball`} style={origin(cx, cy)}>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill="#fff" />
      <g clipPath={`url(#${clip})`}>
        <g className="mc-pupil">
          <g className="mc-look">
            <g className="mc-ball-pupil" style={origin(cx, cy)}>
              <circle cx={cx} cy={cy + 1} r={r * 0.56} fill={INK} />
              <circle className="mc-hl" cx={cx - r * 0.2} cy={cy - r * 0.2} r={r * 0.2} fill="#fff" />
              <path className="mc-hl-star" d={star(cx - r * 0.1, cy - r * 0.12, r * 0.4)} fill="#fff" />
            </g>
          </g>
        </g>
        <rect className="mc-lid-top" x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={lid} style={origin(cx, cy - r)} />
        <rect className="mc-lid-bot" x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={lid} style={origin(cx, cy + r)} />
      </g>
      <circle className="mc-ol" cx={cx} cy={cy} r={r} fill="none" />
    </g>
  );
}

export function Brow({ cx, cy, len, side }: { cx: number; cy: number; len: number; side: "l" | "r" }) {
  return (
    <g className={`mc-brow-lift mc-brow-lift-${side}`}>
      <path
        className={`mc-brow mc-brow-${side}`}
        d={`M${cx - len / 2} ${cy + 2} Q${cx} ${cy - 3} ${cx + len / 2} ${cy + 2}`}
        style={origin(cx, cy)}
      />
    </g>
  );
}

/** Six mouth shapes that crossfade; "w" is the small animal mouth. */
export function Mouth({
  cx, cy, w, shape = "u", tongue = "#d8795f",
}: { cx: number; cy: number; w: number; shape?: "u" | "w"; tongue?: string }) {
  const smile =
    shape === "w"
      ? `M${-w / 2} -2 Q${-w / 4} ${w * 0.44} 0 -1 Q${w / 4} ${w * 0.44} ${w / 2} -2`
      : `M${-w / 2} -1 Q0 ${w * 0.52} ${w / 2} -1`;
  return (
    <g className="mc-mouth" transform={`translate(${cx} ${cy})`}>
      <path className="mc-m mc-m-line mc-m-smile" d={smile} />
      <path className="mc-m mc-m-line mc-m-flat" d={`M${-w * 0.3} 2 Q0 0.5 ${w * 0.3} 2`} />
      <path
        className="mc-m mc-m-line mc-m-wobbly"
        d={`M${-w / 2} 2 Q${(-3 * w) / 8} -2 ${-w / 4} 2 T0 2 T${w / 4} 2 T${w / 2} 2`}
      />
      <g className="mc-m mc-m-o">
        <ellipse cx={0} cy={w * 0.12} rx={w * 0.17} ry={w * 0.22} fill={INK} />
      </g>
      <g className="mc-m mc-m-open">
        <path d={`M${-w * 0.42} -2 Q0 ${w * 0.95} ${w * 0.42} -2Z`} fill={INK} />
        <ellipse cx={0} cy={w * 0.3} rx={w * 0.19} ry={w * 0.1} fill={tongue} />
      </g>
      <g className="mc-m mc-m-grin">
        <path d={`M${-w * 0.56} -3 Q0 ${w * 1.12} ${w * 0.56} -3Z`} fill={INK} />
        <ellipse cx={0} cy={w * 0.38} rx={w * 0.25} ry={w * 0.12} fill={tongue} />
      </g>
    </g>
  );
}

const SPARK_FILL = ["#ffc94d", "#ffffff", "#8fb3ff", "#ffffff"];

/** Eight sparkles hidden at a point; the celebration bursts them outward. */
export function Sparkles({ at }: { at: [number, number] }) {
  return (
    <g className="mc-sparkles" transform={`translate(${at[0]} ${at[1]})`}>
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          className="mc-spark"
          d={star(0, 0, i % 2 ? 7 : 11)}
          fill={SPARK_FILL[i % 4]}
          stroke={INK}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** The still sparkle used under reduced motion and on held poses. */
export function Glyph({ at }: { at: [number, number] }) {
  return (
    <g className="mc-glyph">
      <path d={star(at[0], at[1], 13)} fill="#ffc94d" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d={star(at[0] + 15, at[1] + 14, 6)} fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );
}

/** A small blank card held up while waiting for a decision. Dashed like the approval card. */
export function BlankCard({ x, y, rot = 8 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <g className="mc-blank">
        <rect className="mc-ol" x={-16} y={-20} width={32} height={40} rx={5} fill="#fff" />
        <rect x={-10} y={-14} width={20} height={28} rx={3} fill="none" stroke="#c3c9d4" strokeWidth={1.6} strokeDasharray="3 3" />
      </g>
    </g>
  );
}

export function Magnifier({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const hx = cx + r * 0.72;
  const hy = cy + r * 0.72;
  return (
    <g className="mc-magnifier" style={origin(cx + r * 1.6, cy + r * 1.6)}>
      <path d={`M${hx} ${hy} L${cx + r * 1.55} ${cy + r * 1.55}`} stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <path d={`M${hx + 2} ${hy + 2} L${cx + r * 1.5} ${cy + r * 1.5}`} stroke="#b98a5a" strokeWidth={4.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="#eaf2fb" fillOpacity={0.28} stroke={INK} strokeWidth={3.2} />
      <circle cx={cx} cy={cy} r={r - 3} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2} />
      <path d={`M${cx - r * 0.55} ${cy - r * 0.2} Q${cx - r * 0.45} ${cy - r * 0.5} ${cx - r * 0.15} ${cy - r * 0.6}`} stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Two little z's that drift up while dozing. */
export function Zzz({ x, y }: { x: number; y: number }) {
  return (
    <g className="mc-zzz" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontWeight={700} fill={INK}>
      <text className="mc-z1" x={x} y={y} fontSize={15}>z</text>
      <text className="mc-z2" x={x + 11} y={y - 13} fontSize={11}>z</text>
    </g>
  );
}
