import type { ConceptId, Expression } from "./model";

/**
 * Reactions: short choreographies played with the Web Animations API on
 * parts of one character, plus timed expression overrides. Under reduced
 * motion `play` does nothing, so only the expression changes remain.
 */

export type Override = {
  expr?: Partial<Expression>;
  extras?: Record<string, number>;
  /** Written to data-react, for CSS that shows props such as the z's. */
  react?: string;
};

export type ReactCtx = {
  root: SVGSVGElement;
  reduced: boolean;
  set: (o: Override | null) => void;
  later: (ms: number, fn: () => void) => void;
};

export type ReactionKind = "poke" | "surprise" | "idle" | "celebrate" | "fail";
type Reaction = (ctx: ReactCtx) => number;

function play(c: ReactCtx, sel: string, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  if (c.reduced) return;
  c.root.querySelectorAll(sel).forEach((el) => el.animate(frames, opts));
}

function seq(c: ReactCtx, steps: Array<[number, Override | null]>) {
  for (const [at, o] of steps) c.later(at, () => c.set(o));
}

function hop(c: ReactCtx, h = 22, duration = 760, delay = 0) {
  play(
    c,
    ".mc-react",
    [
      { transform: "translateY(0px) scale(1, 1)" },
      { offset: 0.16, transform: "translateY(0px) scale(1.1, 0.88)" },
      { offset: 0.46, transform: `translateY(${-h}px) scale(0.94, 1.08)` },
      { offset: 0.78, transform: "translateY(0px) scale(1.08, 0.92)" },
      { transform: "translateY(0px) scale(1, 1)" },
    ],
    { duration, delay, easing: "ease-in-out" },
  );
  play(c, ".mc-shadow", [{ transform: "scale(1)" }, { offset: 0.46, transform: "scale(0.72)" }, { transform: "scale(1)" }], {
    duration,
    delay,
    easing: "ease-in-out",
  });
}

function burst(c: ReactCtx, delay = 0, dy = 0, spread = 1) {
  if (c.reduced) return;
  c.root.querySelectorAll(".mc-spark").forEach((el, i) => {
    const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.35 : 0) - Math.PI / 2;
    const d = (i % 2 ? 92 : 118) * spread;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.88;
    el.animate(
      [
        { transform: `translate(0px, ${dy}px) scale(0) rotate(0deg)`, opacity: 1 },
        { offset: 0.55, transform: `translate(${x * 0.86}px, ${dy + y * 0.86}px) scale(1) rotate(80deg)`, opacity: 1 },
        { transform: `translate(${x}px, ${dy + y}px) scale(0.2) rotate(140deg)`, opacity: 0 },
      ],
      { duration: 900, delay: delay + (i % 3) * 30, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  });
}

function wander(c: ReactCtx, d = 34, duration = 3600, flip = true, bob = 5, step = 320) {
  const f = (s: number) => (flip ? ` scaleX(${s})` : "");
  play(
    c,
    ".mc-react",
    [
      { transform: `translateX(0px)${f(1)}` },
      { offset: 0.3, transform: `translateX(${d}px)${f(1)}` },
      { offset: 0.36, transform: `translateX(${d}px)${f(-1)}` },
      { offset: 0.72, transform: `translateX(${-d * 0.6}px)${f(-1)}` },
      { offset: 0.78, transform: `translateX(${-d * 0.6}px)${f(1)}` },
      { transform: `translateX(0px)${f(1)}` },
    ],
    { duration, easing: "ease-in-out" },
  );
  play(c, ".mc-press", [{ transform: "translateY(0px)" }, { transform: `translateY(${-bob}px)` }, { transform: "translateY(0px)" }], {
    duration: step,
    iterations: Math.floor(duration / step),
    easing: "ease-in-out",
  });
}

const toss = (h: number, n: number): Keyframe[] => {
  const frames: Keyframe[] = [{ offset: 0, transform: "translateY(0px) rotate(0deg)", easing: "ease-out" }];
  for (let i = 0; i < n; i++) {
    frames.push({ offset: (i + 0.5) / n, transform: `translateY(${-h}px) rotate(${180 * (2 * i + 1)}deg)`, easing: "ease-in" });
    frames.push({ offset: (i + 1) / n, transform: `translateY(0px) rotate(${360 * (i + 1)}deg)`, easing: "ease-out" });
  }
  return frames;
};

const fail: Reaction = (c) => {
  play(c, ".mc-press", [0, 3, -3, 2, -1, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380 });
  seq(c, [
    [0, { expr: { eyes: "wide", mouth: "wobbly", brow: 18, browOpacity: 1 } }],
    [950, null],
  ]);
  return 1000;
};

const HAPPY: Override = { expr: { eyes: "happy", mouth: "open" } };
const at = (origin: string, frames: Keyframe[]) => frames.map((f) => ({ ...f, transformOrigin: origin }));

export const REACTIONS: Record<ConceptId, Record<ReactionKind, Reaction>> = {
  otter: {
    poke: (c) => {
      play(
        c,
        ".mc-react",
        at("120px 140px", [
          { transform: "translateY(0px) rotate(0deg)" },
          { offset: 0.5, transform: "translateY(-16px) rotate(190deg)" },
          { transform: "translateY(0px) rotate(360deg)" },
        ]),
        { duration: 760, easing: "cubic-bezier(.45,0,.3,1)" },
      );
      seq(c, [[0, HAPPY], [900, null]]);
      return 900;
    },
    surprise: (c) => {
      play(c, ".mc-otter-pebble", toss(104, 3), { duration: 2100 });
      play(
        c,
        ".mc-look",
        [0, -4, 0, -4, 0, -4, 0].map((y) => ({ transform: `translateY(${y}px)` })),
        { duration: 2100, easing: "ease-in-out" },
      );
      seq(c, [
        [0, { expr: { eyes: "wide", mouth: "o", browOpacity: 1, browLift: 5 } }],
        [2100, { expr: { eyes: "happy", mouth: "grin" } }],
        [2900, null],
      ]);
      burst(c, 2050);
      return 2900;
    },
    idle: (c) => {
      wander(c);
      return 3700;
    },
    celebrate: (c) => {
      hop(c);
      play(c, ".mc-otter-pebble", toss(60, 1), { duration: 760, delay: 80 });
      burst(c, 120);
      return 1000;
    },
    fail,
  },

  crab: {
    poke: (c) => {
      const ease = "cubic-bezier(.3,0,.2,1)";
      play(
        c,
        ".mc-crab-body",
        [
          { transform: "translate(0px, 0px) scale(1)" },
          { offset: 0.16, transform: "translate(34px, 10px) scale(0.7)" },
          { offset: 0.62, transform: "translate(34px, 10px) scale(0.7)" },
          { transform: "translate(0px, 0px) scale(1)" },
        ],
        { duration: 1500, easing: ease },
      );
      play(
        c,
        ".mc-crab-eyes",
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { offset: 0.16, transform: "translate(18px, 60px) scale(0.5)", opacity: 0 },
          { offset: 0.42, transform: "translate(18px, 60px) scale(0.5)", opacity: 0 },
          { offset: 0.56, transform: "translate(12px, 26px) scale(0.86)", opacity: 1 },
          { offset: 0.76, transform: "translate(12px, 26px) scale(0.86)", opacity: 1 },
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        ],
        { duration: 1500, easing: ease },
      );
      seq(c, [
        [0, { expr: { eyes: "closed", mouth: "o" } }],
        [620, { expr: { eyes: "wide", mouth: "o", gazeX: -5 } }],
        [1150, { expr: { eyes: "happy", mouth: "smile" } }],
        [1600, null],
      ]);
      return 1600;
    },
    surprise: (c) => {
      play(
        c,
        ".mc-crab-rack",
        [
          { transform: "translate(0px, 0px) rotate(0deg)" },
          { offset: 0.14, transform: "translate(8px, -80px) rotate(-10deg)" },
          { offset: 0.66, transform: "translate(8px, -80px) rotate(-7deg)" },
          { offset: 0.8, transform: "translate(0px, 4px) rotate(0deg)" },
          { offset: 0.88, transform: "translate(0px, -8px) rotate(0deg)" },
          { transform: "translate(0px, 0px) rotate(0deg)" },
        ],
        { duration: 2800, easing: "ease-in-out" },
      );
      play(
        c,
        ".mc-crab-cloud",
        [
          { opacity: 0, transform: "scale(0.5)" },
          { offset: 0.14, opacity: 0, transform: "scale(0.5)" },
          { offset: 0.22, opacity: 1, transform: "scale(1.06)" },
          { offset: 0.28, opacity: 1, transform: "scale(1)" },
          { offset: 0.58, opacity: 1, transform: "scale(1)" },
          { offset: 0.66, opacity: 0, transform: "scale(1.35)" },
          { opacity: 0, transform: "scale(1)" },
        ],
        { duration: 2800 },
      );
      seq(c, [
        [0, { expr: { eyes: "wide", mouth: "o", gazeY: -4 } }],
        [700, { expr: { eyes: "happy", mouth: "smile" } }],
        [1650, { expr: { eyes: "wide", mouth: "wobbly" } }],
        [2250, { expr: { eyes: "happy", mouth: "grin" } }],
        [2900, null],
      ]);
      burst(c, 2250);
      return 2900;
    },
    idle: (c) => {
      wander(c, 40, 3200, false, 3, 200);
      return 3300;
    },
    celebrate: (c) => {
      hop(c, 16);
      const wave = (a: number) => [0, a, -a * 0.2, a, 0].map((r) => ({ transform: `rotate(${r}deg)` }));
      play(c, ".mc-crab-claw-l", wave(30), { duration: 1000, easing: "ease-in-out" });
      play(c, ".mc-crab-claw-r", wave(-34), { duration: 1000, easing: "ease-in-out" });
      burst(c, 120);
      return 1000;
    },
    fail,
  },

  tardigrade: {
    poke: (c) => {
      seq(c, [
        [0, { expr: { eyes: "closed", mouth: "o", browOpacity: 0 }, extras: { tun: 1 } }],
        [700, { expr: { eyes: "wide", mouth: "o" } }],
        [1150, null],
      ]);
      return 1200;
    },
    surprise: (c) => {
      play(
        c,
        ".mc-tg-helmet",
        [
          { opacity: 0, transform: "scale(0.85)" },
          { offset: 0.12, opacity: 1, transform: "scale(1)" },
          { offset: 0.86, opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.05)" },
        ],
        { duration: 3000 },
      );
      play(
        c,
        ".mc-react",
        at("120px 130px", [
          { transform: "translateY(0px) rotate(0deg)" },
          { offset: 0.25, transform: "translateY(-30px) rotate(-12deg)" },
          { offset: 0.55, transform: "translateY(-40px) rotate(10deg)" },
          { offset: 0.8, transform: "translateY(-24px) rotate(-5deg)" },
          { transform: "translateY(0px) rotate(0deg)" },
        ]),
        { duration: 3000, easing: "ease-in-out" },
      );
      play(c, ".mc-tg-stars", [{ opacity: 0 }, { offset: 0.2, opacity: 1 }, { offset: 0.8, opacity: 1 }, { opacity: 0 }], {
        duration: 3000,
      });
      seq(c, [
        [0, { expr: { eyes: "sparkle", mouth: "o" }, extras: { tun: -0.15 } }],
        [1500, { expr: { eyes: "happy", mouth: "grin" }, extras: { tun: -0.15 } }],
        [2950, null],
      ]);
      return 3000;
    },
    idle: (c) => {
      seq(c, [
        [0, { expr: { eyes: "closed", mouth: "o", squash: 0.96, loop: "doze", browOpacity: 0 }, react: "nap" }],
        [4200, null],
      ]);
      return 4300;
    },
    celebrate: (c) => {
      hop(c);
      burst(c, 120);
      seq(c, [
        [0, { extras: { tun: -0.14 } }],
        [800, null],
      ]);
      return 1000;
    },
    fail,
  },

  lantern: {
    poke: (c) => {
      hop(c, 8, 520);
      seq(c, [
        [0, { expr: { eyes: "wide", mouth: "o" }, extras: { glow: 1, halo: 1, flame: 1.7 } }],
        [650, null],
      ]);
      return 800;
    },
    surprise: (c) => {
      play(
        c,
        ".mc-react",
        [
          { transform: "translateY(0px) scale(1, 1)" },
          { offset: 0.25, transform: "translateY(0px) scale(1.06, 0.9)" },
          { offset: 0.45, transform: "translateY(-8px) scale(0.97, 1.04)" },
          { transform: "translateY(0px) scale(1, 1)" },
        ],
        { duration: 700, easing: "ease-out" },
      );
      play(
        c,
        ".mc-spark:first-child",
        [
          { transform: "translate(0px, -12px) scale(0.6)", opacity: 1 },
          { transform: "translate(0px, -52px) scale(0.9)", opacity: 1 },
        ],
        { duration: 420, delay: 160, easing: "ease-out" },
      );
      burst(c, 580, -52, 0.7);
      seq(c, [
        [0, { expr: { eyes: "wide", mouth: "o", gazeY: -4 }, extras: { glow: 1, halo: 0.9, flame: 1.8 } }],
        [600, { expr: { eyes: "sparkle", mouth: "grin", gazeY: -4 }, extras: { glow: 1, halo: 1, flame: 1.25 } }],
        [1900, null],
      ]);
      return 2000;
    },
    idle: (c) => {
      seq(c, [
        [0, { expr: { eyes: "closed", mouth: "flat", browOpacity: 0, loop: "doze" }, extras: { glow: 0.22, halo: 0.03, flame: 0.6 }, react: "nap" }],
        [2800, { expr: { eyes: "wide", mouth: "o" }, extras: { glow: 1, halo: 0.9, flame: 1.5 } }],
        [3400, null],
      ]);
      hop(c, 10, 520, 2800);
      return 3500;
    },
    celebrate: (c) => {
      hop(c);
      burst(c, 120);
      return 1000;
    },
    fail,
  },

  beaver: {
    poke: (c) => {
      tailSlap(c);
      seq(c, [
        [0, { expr: { eyes: "wide", mouth: "o", browLift: 5, browOpacity: 1 } }],
        [800, null],
      ]);
      return 850;
    },
    surprise: (c) => {
      for (let i = 0; i < 4; i++) {
        const s = 0.08 + i * 0.1;
        play(
          c,
          `.mc-log-${i}`,
          [
            { offset: 0, opacity: 0, transform: "translateY(-80px)" },
            { offset: s, opacity: 0, transform: "translateY(-80px)", easing: "ease-in" },
            { offset: s + 0.08, opacity: 1, transform: "translateY(0px)", easing: "ease-out" },
            { offset: s + 0.11, opacity: 1, transform: "translateY(-5px)", easing: "ease-in" },
            { offset: s + 0.14, opacity: 1, transform: "translateY(0px)" },
            { offset: 0.86, opacity: 1, transform: "translateY(0px)" },
            { offset: 1, opacity: 0, transform: "translateY(0px)" },
          ],
          { duration: 3000 },
        );
      }
      play(c, ".mc-beaver-paw-l, .mc-beaver-paw-r", [0, -6, 0, -6, 0].map((y) => ({ transform: `translateY(${y}px)` })), {
        duration: 900,
        delay: 1500,
      });
      seq(c, [
        [0, { expr: { eyes: "open", mouth: "flat", gazeY: 4, brow: -8, browOpacity: 1 } }],
        [1500, { expr: { eyes: "happy", mouth: "grin" } }],
        [2900, null],
      ]);
      burst(c, 1550, 90, 0.8);
      return 3000;
    },
    idle: (c) => {
      seq(c, [
        [0, { expr: { gazeX: -5, browAsym: 4, browOpacity: 1 } }],
        [1000, { expr: { gazeX: 5, browAsym: 4, browOpacity: 1 } }],
        [2000, { expr: { eyes: "happy" } }],
        [2700, null],
      ]);
      play(c, ".mc-beaver-tail", [0, -10, 4, -10, 4, 0].map((r) => ({ transform: `rotate(${r}deg)` })), {
        duration: 900,
        delay: 1900,
      });
      return 2800;
    },
    celebrate: (c) => {
      hop(c);
      play(c, ".mc-beaver-tail", [0, -18, 6, -18, 0].map((r) => ({ transform: `rotate(${r}deg)` })), { duration: 900 });
      burst(c, 120);
      return 1000;
    },
    fail: (c) => {
      tailSlap(c);
      return fail(c);
    },
  },

  mote: {
    poke: (c) => {
      play(
        c,
        ".mc-react",
        [
          { transform: "scale(1, 1)" },
          { offset: 0.2, transform: "scale(1.32, 0.64)" },
          { offset: 0.45, transform: "scale(0.86, 1.16)" },
          { offset: 0.65, transform: "scale(1.07, 0.94)" },
          { offset: 0.82, transform: "scale(0.98, 1.02)" },
          { transform: "scale(1, 1)" },
        ],
        { duration: 700, easing: "ease-out" },
      );
      seq(c, [
        [0, { expr: { eyes: "closed", mouth: "o" } }],
        [260, { expr: { eyes: "happy", mouth: "smile" } }],
        [900, null],
      ]);
      return 900;
    },
    surprise: (c) => {
      play(
        c,
        ".mc-mote-core",
        [
          { opacity: 1, transform: "scale(1, 1)" },
          { offset: 0.1, opacity: 1, transform: "scale(1.25, 0.8)" },
          { offset: 0.14, opacity: 0, transform: "scale(1.25, 0.8)" },
          { offset: 0.8, opacity: 0, transform: "scale(1.2, 0.85)" },
          { offset: 0.84, opacity: 1, transform: "scale(1.2, 0.85)" },
          { offset: 0.92, opacity: 1, transform: "scale(0.94, 1.06)" },
          { opacity: 1, transform: "scale(1, 1)" },
        ],
        { duration: 2400 },
      );
      play(c, ".mc-mote-twins", [{ opacity: 0 }, { offset: 0.12, opacity: 0 }, { offset: 0.14, opacity: 1 }, { offset: 0.82, opacity: 1 }, { offset: 0.84, opacity: 0 }, { opacity: 0 }], {
        duration: 2400,
      });
      for (const [side, dir] of [["l", -1], ["r", 1]] as const) {
        play(
          c,
          `.mc-mote-twin-${side}`,
          [
            { offset: 0, transform: "translateX(0px) translateY(0px)" },
            { offset: 0.14, transform: "translateX(0px) translateY(0px)", easing: "ease-out" },
            { offset: 0.34, transform: `translateX(${dir * 52}px) translateY(0px)` },
            { offset: 0.44, transform: `translateX(${dir * 52}px) translateY(-14px)` },
            { offset: 0.54, transform: `translateX(${dir * 52}px) translateY(0px)`, easing: "ease-in" },
            { offset: 0.8, transform: "translateX(0px) translateY(0px)" },
            { offset: 1, transform: "translateX(0px) translateY(0px)" },
          ],
          { duration: 2400 },
        );
      }
      seq(c, [
        [2000, { expr: { eyes: "happy", mouth: "grin" } }],
        [2700, null],
      ]);
      burst(c, 1950);
      return 2700;
    },
    idle: (c) => {
      const hopTo = (x0: number, x1: number, o0: number, o1: number): Keyframe[] => [
        { offset: o0, transform: `translate(${x0}px, 0px) scale(1.08, 0.92)` },
        { offset: (o0 + o1) / 2, transform: `translate(${(x0 + x1) / 2}px, -18px) scale(0.95, 1.06)` },
        { offset: o1, transform: `translate(${x1}px, 0px) scale(1.08, 0.92)` },
      ];
      play(
        c,
        ".mc-react",
        [
          { offset: 0, transform: "translate(0px, 0px) scale(1, 1)" },
          ...hopTo(0, 22, 0.05, 0.17),
          ...hopTo(22, 44, 0.2, 0.32),
          { offset: 0.5, transform: "translate(44px, 0px) scale(1, 1)" },
          ...hopTo(44, 22, 0.55, 0.67),
          ...hopTo(22, 0, 0.7, 0.82),
          { offset: 1, transform: "translate(0px, 0px) scale(1, 1)" },
        ],
        { duration: 3000, easing: "ease-in-out" },
      );
      seq(c, [
        [0, { expr: { gazeX: 5 } }],
        [1600, { expr: { gazeX: -5 } }],
        [3000, null],
      ]);
      return 3100;
    },
    celebrate: (c) => {
      play(
        c,
        ".mc-react",
        [
          { transform: "translateY(0px) scale(1, 1)" },
          { offset: 0.15, transform: "translateY(0px) scale(1.12, 0.86)" },
          { offset: 0.4, transform: "translateY(-30px) scale(-1, 1.06)" },
          { offset: 0.6, transform: "translateY(-30px) scale(1, 1.06)" },
          { offset: 0.82, transform: "translateY(0px) scale(1.1, 0.9)" },
          { transform: "translateY(0px) scale(1, 1)" },
        ],
        { duration: 950, easing: "ease-in-out" },
      );
      burst(c, 160);
      return 1000;
    },
    fail,
  },
};

function tailSlap(c: ReactCtx) {
  play(
    c,
    ".mc-beaver-tail",
    [
      { transform: "rotate(0deg)" },
      { offset: 0.4, transform: "rotate(-58deg)", easing: "cubic-bezier(.5,0,.9,.4)" },
      { offset: 0.55, transform: "rotate(8deg)" },
      { offset: 0.7, transform: "rotate(-4deg)" },
      { transform: "rotate(0deg)" },
    ],
    { duration: 760 },
  );
  play(
    c,
    ".mc-beaver-puff",
    [
      { opacity: 0, transform: "scale(0.6)" },
      { offset: 0.5, opacity: 0, transform: "scale(0.6)" },
      { offset: 0.6, opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.3)" },
    ],
    { duration: 760 },
  );
  play(c, ".mc-react", [{ transform: "translateY(0px)" }, { offset: 0.55, transform: "translateY(0px)" }, { offset: 0.62, transform: "translateY(-6px)" }, { transform: "translateY(0px)" }], {
    duration: 760,
  });
}
