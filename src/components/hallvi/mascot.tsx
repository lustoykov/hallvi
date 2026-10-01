"use client";

// Little Server, drawn flat.
//
// The drawing hallvi.com and the banners use: a periwinkle box with a navy
// screen, two antennas, </> on his mug and one mitten raised. Waving, he is
// that drawing exactly; every other mood poses the same parts. Until
// 1 October 2026 he was a three.js scene, so the page and the product showed
// two different characters and every caretaker cost a WebGL context.
//
// This file says which parts are on screen; `mascot.css` poses and moves
// them. Native controls outside the drawing set its state.

import { useEffect, useId, useState } from "react";

import { useReducedMotion } from "./architecture-prototype/motion";
import "./mascot.css";

export type MascotMood =
  | "ready"
  | "checking"
  | "working"
  | "attention"
  | "waving"
  | "pointing"
  | "resting";
export type MascotDance =
  "shuffle" | "robot" | "floss" | "backflip" | "cartwheel";
type Expression = MascotMood | "dancing";

const DARK = "#3e4a60";
const FACE = "#eef3fb";
const MITTEN = "#f3f6fc";
const LINE = "#c3cee2";
const ACCENT = "#2f5fd8";
const PAPER = "#fbfcfe";

/** Hallvi's own periwinkle, as the banners paint it. */
const HALLVI = {
  top: "#9ab3e4",
  bottom: "#7a97d2",
  sleeveTop: "#8ea8dc",
  sleeveBottom: "#7390cb",
  vent: "#5a71a6",
  cap: "#c3d1ec",
};

function mix(from: string, to: string, amount: number) {
  const channel = (hex: string, at: number) =>
    parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5]
    .map((at) =>
      Math.round(
        channel(from, at) + (channel(to, at) - channel(from, at)) * amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** An application's colour, shaded the way the banners shade Hallvi's. */
function paintOf(color: string | undefined) {
  if (!color) return HALLVI;
  return {
    top: mix(color, "#ffffff", 0.3),
    bottom: color,
    sleeveTop: mix(color, "#ffffff", 0.16),
    sleeveBottom: mix(color, "#1b2740", 0.08),
    vent: mix(color, "#1b2740", 0.36),
    cap: mix(color, "#ffffff", 0.58),
  };
}

// One short gesture per nine-second slot, so caretakers take turns.
const CYCLE = 27000;
const GESTURE = 2600;

const MOUTH = {
  smile: "M184 181q16 11 32 0",
  joy: "M181 180q19 17 38 0",
  flat: "M188 185h24",
  concern: "M186 189q14-10 28 0",
};

function mouthOf(expression: Expression) {
  if (expression === "waving" || expression === "dancing") return MOUTH.joy;
  if (expression === "attention") return MOUTH.concern;
  if (expression === "working" || expression === "resting") return MOUTH.flat;
  return MOUTH.smile;
}

export function Mascot({
  color,
  mood = "ready",
  paused = false,
  gesture = 0,
  ambient = false,
  slot = 0,
  dance = "shuffle",
  danceRequest = 0,
  className,
}: {
  /** An application's colour, #rrggbb. Hallvi's own periwinkle without one. */
  color?: string;
  mood?: MascotMood;
  paused?: boolean;
  /** A new number greets again. */
  gesture?: number;
  /** Stands ready and, on his turn, waves or dances a little. */
  ambient?: boolean;
  slot?: number;
  dance?: MascotDance;
  /** A new number above zero dances. */
  danceRequest?: number;
  className?: string;
}) {
  const id = useId();
  const still = useReducedMotion() || paused;
  const special = dance === "backflip" || dance === "cartwheel";

  // A dance that was asked for plays once.
  const [danced, setDanced] = useState(0);
  useEffect(() => {
    if (!danceRequest) return;
    const timer = window.setTimeout(
      () => setDanced(danceRequest),
      special ? GESTURE : GESTURE * 2,
    );
    return () => window.clearTimeout(timer);
  }, [danceRequest, special]);
  const requested = !still && danceRequest > 0 && danced !== danceRequest;

  // A wave is a greeting first, even from a caretaker who then stands ready.
  const [greeted, setGreeted] = useState(false);
  useEffect(() => {
    if (mood !== "waving") return;
    const timer = window.setTimeout(() => setGreeted(true), GESTURE);
    return () => {
      window.clearTimeout(timer);
      setGreeted(false);
    };
  }, [mood, gesture]);

  const [turn, setTurn] = useState<"waving" | "dancing" | null>(null);
  useEffect(() => {
    if (!ambient || still) return;
    let timer = 0;
    const rest = () => {
      const phase = (performance.now() - slot * 9000 + CYCLE) % CYCLE;
      timer = window.setTimeout(move, phase < GESTURE ? 0 : CYCLE - phase);
    };
    const move = () => {
      setTurn(Math.floor(performance.now() / CYCLE) % 2 ? "dancing" : "waving");
      timer = window.setTimeout(() => {
        setTurn(null);
        rest();
      }, GESTURE);
    };
    rest();
    return () => {
      window.clearTimeout(timer);
      setTurn(null);
    };
  }, [ambient, slot, still]);

  let expression: Expression = mood;
  if (ambient && (still || greeted || mood !== "waving"))
    expression = still ? "ready" : (turn ?? "ready");
  if (requested) expression = "dancing";
  // A flip is for when it was asked for; on his own he only shuffles.
  const routine = special && !requested ? "shuffle" : dance;

  const happy = expression === "waving" || expression === "dancing";
  const brows =
    expression === "checking" ||
    expression === "attention" ||
    expression === "pointing";
  const mug =
    expression === "ready" ||
    expression === "waving" ||
    expression === "resting";
  const paint = paintOf(color);
  const body = `${id}-body`;
  const sleeve = `${id}-sleeve`;

  return (
    <span
      className={`hv-mascot${className ? ` ${className}` : ""}`}
      data-expression={expression}
      data-dance={expression === "dancing" ? routine : undefined}
      data-still={still ? "" : undefined}
      aria-hidden="true"
    >
      <svg viewBox="14 6 326 326" focusable="false">
        <defs>
          <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={paint.top} />
            <stop offset="1" stopColor={paint.bottom} />
          </linearGradient>
          <linearGradient id={sleeve} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={paint.sleeveTop} />
            <stop offset="1" stopColor={paint.sleeveBottom} />
          </linearGradient>
        </defs>
        <ellipse
          className="hv-ms-shadow"
          cx="206"
          cy="318"
          rx="112"
          ry="9"
          fill="#0f1520"
          opacity=".08"
        />
        <g className="hv-ms-figure" key={danceRequest}>
          {(
            [
              ["l", "M152 88L147 24", 147],
              ["r", "M248 88L253 24", 253],
            ] as const
          ).map(([side, stalk, x]) => (
            <g className="hv-ms-antenna" data-side={side} key={side}>
              <g className="hv-ms-sway">
                <path
                  d={stalk}
                  stroke={DARK}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <circle className="hv-ms-tip" cx={x} cy="19" r="8" />
              </g>
            </g>
          ))}
          <rect x="138" y="82" width="26" height="10" rx="3.5" fill={DARK} />
          <rect x="236" y="82" width="26" height="10" rx="3.5" fill={DARK} />
          <g className="hv-ms-feet" fill="#2e3950">
            <rect x="124" y="300" width="42" height="16" rx="6" />
            <rect x="234" y="300" width="42" height="16" rx="6" />
          </g>

          {/* The raised arm, behind the body. Tools stand in its mitten. */}
          <g className="hv-ms-arm" data-side="r">
            <g className="hv-ms-swing" key={gesture}>
              <path
                d="M298 204L318 180"
                stroke={`url(#${sleeve})`}
                strokeWidth="20"
                strokeLinecap="round"
              />
              <g className="hv-ms-hand" data-side="r">
                <g transform="rotate(18 326 164)">
                  {expression === "working" && (
                    <g stroke={DARK} strokeLinecap="round" fill="none">
                      <path d="M326 168V112" strokeWidth="10" />
                      <path
                        d="M334 86.5A14 14 0 1 1 318 86.5"
                        strokeWidth="10"
                      />
                    </g>
                  )}
                  {expression === "attention" && (
                    <g stroke={DARK} strokeLinecap="round">
                      <path d="M326 168V127" strokeWidth="9" />
                      <circle
                        cx="326"
                        cy="108"
                        r="16"
                        fill="#dfe8fb"
                        fillOpacity=".75"
                        strokeWidth="6.5"
                      />
                      <path
                        d="M317 105a10 10 0 0 1 6.5-6.5"
                        stroke="#fff"
                        strokeWidth="2.6"
                        fill="none"
                      />
                    </g>
                  )}
                  {expression === "pointing" && (
                    <rect
                      x="321.5"
                      y="133"
                      width="9"
                      height="24"
                      rx="4.5"
                      fill={MITTEN}
                      stroke={LINE}
                      strokeWidth="1.6"
                    />
                  )}
                  <g fill={MITTEN} stroke={LINE} strokeWidth="1.6">
                    <ellipse
                      className="hv-ms-thumb"
                      cx="313"
                      cy="168"
                      rx="5.5"
                      ry="7.5"
                    />
                    <rect x="314" y="149" width="24" height="30" rx="10" />
                  </g>
                </g>
              </g>
            </g>
          </g>

          <rect
            x="100"
            y="90"
            width="200"
            height="218"
            rx="22"
            fill={`url(#${body})`}
          />
          <rect x="176" y="86" width="48" height="7" rx="3" fill={paint.cap} />
          <path
            d="M124 94h152"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".35"
          />
          <rect
            x="286"
            y="104"
            width="9"
            height="190"
            rx="4.5"
            fill="#0f1a33"
            opacity=".06"
          />
          <rect
            x="110"
            y="118"
            width="180"
            height="94"
            rx="11"
            fill="#101828"
          />
          <path d="M118 122h34l-22 86h-12z" fill="#fff" opacity=".04" />
          <g
            className="hv-ms-face"
            stroke={FACE}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            {happy ? (
              <path d="M153 163l12-12 12 12M223 163l12-12 12 12" />
            ) : (
              <g className="hv-ms-gaze">
                <g className="hv-ms-blink" fill={FACE} stroke="none">
                  <rect
                    className="hv-ms-eye"
                    data-side="l"
                    x="159.5"
                    y="145"
                    width="11"
                    height="24"
                    rx="5.5"
                  />
                  <rect
                    className="hv-ms-eye"
                    data-side="r"
                    x="229.5"
                    y="145"
                    width="11"
                    height="24"
                    rx="5.5"
                  />
                </g>
                {brows && (
                  <g strokeWidth="4">
                    <path
                      className="hv-ms-brow"
                      data-side="l"
                      d="M155 133h20"
                    />
                    <path
                      className="hv-ms-brow"
                      data-side="r"
                      d="M225 133h20"
                    />
                  </g>
                )}
              </g>
            )}
            <path d={mouthOf(expression)} />
          </g>
          <path
            d="M158 244v36M174.8 244v36M191.6 244v36M208.4 244v36M225.2 244v36M242 244v36"
            stroke={paint.vent}
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* The arm that holds things, in front of the body. */}
          <g className="hv-ms-arm" data-side="l">
            <g className="hv-ms-swing">
              <rect
                x="84"
                y="186"
                width="20"
                height="36"
                rx="9"
                fill={`url(#${sleeve})`}
                transform="rotate(28 100 190)"
              />
              <g className="hv-ms-hand" data-side="l">
                {mug && (
                  <>
                    <path
                      d="M36 222q-13 0-13 11.5t13 11.5"
                      stroke={LINE}
                      strokeWidth="7.5"
                      fill="none"
                    />
                    <path
                      d="M36 222q-13 0-13 11.5t13 11.5"
                      stroke={PAPER}
                      strokeWidth="4"
                      fill="none"
                    />
                    <rect
                      x="36"
                      y="212"
                      width="38"
                      height="42"
                      rx="7"
                      fill={PAPER}
                      stroke={LINE}
                      strokeWidth="1.6"
                    />
                    <path
                      d="M49 226l-5 5 5 5M61 226l5 5-5 5M57.5 223.5l-5 15"
                      stroke={ACCENT}
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <ellipse
                      cx="55"
                      cy="213.5"
                      rx="19"
                      ry="5.2"
                      fill={PAPER}
                      stroke={LINE}
                      strokeWidth="1.4"
                    />
                    <ellipse
                      cx="55"
                      cy="214.2"
                      rx="15"
                      ry="3.4"
                      fill="#5a3a22"
                    />
                  </>
                )}
                {expression === "checking" && (
                  <g transform="rotate(-7 50 219) translate(3 0)">
                    <rect
                      x="20"
                      y="184"
                      width="54"
                      height="70"
                      rx="7"
                      fill={DARK}
                    />
                    <rect
                      x="25"
                      y="192"
                      width="44"
                      height="56"
                      rx="3.5"
                      fill={PAPER}
                    />
                    <rect
                      x="37"
                      y="180"
                      width="20"
                      height="10"
                      rx="3.5"
                      fill="#8c9fb9"
                    />
                    <path
                      d="M31 205h6M31 219h6M31 233h6"
                      stroke={ACCENT}
                      strokeWidth="6"
                    />
                    <path
                      d="M43 205h20M43 219h20M43 233h20"
                      stroke={LINE}
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </g>
                )}
                <rect
                  x="66"
                  y="216"
                  width="24"
                  height="28"
                  rx="10"
                  fill={MITTEN}
                  stroke={LINE}
                  strokeWidth="1.6"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
