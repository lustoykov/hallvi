"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// A placeholder caretaker, so the directions can show where a character
// would act (walk to a part, check it, celebrate, worry). The real mascot
// is explored separately at /prototype/mascots and would replace this.

import { useEffect, useId, useState } from "react";

export type CaretakerPose =
  | "idle"
  | "walk"
  | "check"
  | "cheer"
  | "worry"
  | "sleep";

export function Caretaker({
  pose = "idle",
  facing = 1,
  size = 40,
  gaze = 0,
  className,
  onPoke,
  label = "Caretaker (placeholder character). Poke it.",
}: {
  pose?: CaretakerPose;
  facing?: 1 | -1;
  size?: number;
  /** -1 (looking left) … 1 (looking right). */
  gaze?: number;
  className?: string;
  onPoke?: () => void;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [blink, setBlink] = useState(false);
  const [poked, setPoked] = useState(0);
  useEffect(() => {
    let timer = 0;
    let open = 0;
    const loop = () => {
      timer = window.setTimeout(
        () => {
          setBlink(true);
          open = window.setTimeout(() => setBlink(false), 130);
          loop();
        },
        2400 + Math.random() * 3800,
      );
    };
    loop();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(open);
    };
  }, []);
  const look = Math.max(-1, Math.min(1, gaze)) * 1.7;
  return (
    <button
      type="button"
      className={`ax-ct ax-ct-${pose}${blink ? " is-blinking" : ""}${poked ? " is-poked" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size * 1.08 }}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        setPoked((value) => value + 1);
        window.setTimeout(() => setPoked(0), 560);
        onPoke?.();
      }}
    >
      <svg
        viewBox="0 0 48 52"
        aria-hidden="true"
        style={{ transform: `scaleX(${facing})` }}
      >
        <defs>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7189c4" />
            <stop offset="1" stopColor="#40548a" />
          </linearGradient>
        </defs>
        <ellipse className="ax-ct-shadow" cx="24" cy="49.6" rx="12" ry="2.3" />
        <g className="ax-ct-rig">
          <g className="ax-ct-feet">
            <ellipse className="ax-ct-foot ax-ct-foot-l" cx="17" cy="45.2" rx="5" ry="3.1" />
            <ellipse className="ax-ct-foot ax-ct-foot-r" cx="31" cy="45.2" rx="5" ry="3.1" />
          </g>
          <g className="ax-ct-body">
            <path
              className="ax-ct-antenna"
              d="M24 7.5C24 4.8 25.2 3.2 27.4 2.4"
            />
            <circle className="ax-ct-bulb" cx="28.2" cy="2.3" r="2.3" />
            <path
              d="M24 7C35.6 7 42 15.6 42 27.2 42 38.6 34.6 45 24 45 13.4 45 6 38.6 6 27.2 6 15.6 12.4 7 24 7Z"
              fill={`url(#${id}-body)`}
            />
            <ellipse cx="24" cy="35.5" rx="10.5" ry="7" fill="#ffffff" opacity="0.14" />
            <ellipse cx="17.5" cy="13.5" rx="5" ry="2.6" fill="#ffffff" opacity="0.18" transform="rotate(-24 17.5 13.5)" />
            <g className="ax-ct-brows">
              <path d="M13.6 17.6L20.4 16.2" />
              <path d="M34.4 17.6L27.6 16.2" />
            </g>
            <g className="ax-ct-eyes-open">
              <g className="ax-ct-eye">
                <ellipse cx="18" cy="25.2" rx="5" ry="5.8" fill="#ffffff" />
                <circle className="ax-ct-pupil" cx={18.6 + look} cy="26" r="3" />
                <circle cx={19.7 + look} cy="24.3" r="1.1" fill="#ffffff" />
              </g>
              <g className="ax-ct-eye">
                <ellipse cx="30" cy="25.2" rx="5" ry="5.8" fill="#ffffff" />
                <circle className="ax-ct-pupil" cx={30.6 + look} cy="26" r="3" />
                <circle cx={31.7 + look} cy="24.3" r="1.1" fill="#ffffff" />
              </g>
            </g>
            <g className="ax-ct-eyes-happy">
              <path d="M13.8 26.4Q18 20.8 22.2 26.4" />
              <path d="M25.8 26.4Q30 20.8 34.2 26.4" />
            </g>
            <g className="ax-ct-eyes-closed">
              <path d="M13.8 25.4Q18 28.6 22.2 25.4" />
              <path d="M25.8 25.4Q30 28.6 34.2 25.4" />
            </g>
            <path className="ax-ct-mouth ax-ct-mouth-smile" d="M20.4 33.2Q24 36.6 27.6 33.2" />
            <path className="ax-ct-mouth ax-ct-mouth-open" d="M19.6 32.4Q24 39 28.4 32.4Z" />
            <path className="ax-ct-mouth ax-ct-mouth-wobble" d="M19.4 34Q21.7 32.2 24 34 26.3 35.8 28.6 34" />
            <ellipse className="ax-ct-mouth ax-ct-mouth-o" cx="24" cy="34" rx="1.9" ry="2.3" />
          </g>
          <g className="ax-ct-scan">
            <path d="M24 -3.5a6 6 0 1 1 -6 6" />
          </g>
          <g className="ax-ct-zs">
            <path d="M38 8h4l-4 4h4" />
            <path d="M43 1h3l-3 3h3" />
          </g>
        </g>
      </svg>
    </button>
  );
}
