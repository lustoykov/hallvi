// What an empty page will look like once something has been read.
//
// An empty destination used to be a heading, a paragraph and a button on a
// white page. A sketch of the picture that belongs there says what the page
// is for before anyone has read a word, and makes asking for it inviting.
// It is drawn as a sketch on purpose: grey, dashed, no numbers, no state
// colour and a caption saying so, because "empty means unassessed, never
// healthy" and a sketch that could be mistaken for a reading would be a lie.

import "./empty-sketch.css";

export type SketchKind =
  "bars" | "lines" | "timeline" | "calendar" | "flow" | "rings" | "list";

// A seeded day, so the bars look like traffic and not like a test pattern.
const day = Array.from({ length: 36 }, (_, index) => {
  const wave = Math.max(0, Math.sin((Math.PI * (index - 4)) / 30));
  return 10 + 78 * wave ** 1.5 + ((index * 37) % 11);
});
const wander = (seed: number, base: number, swing: number) =>
  Array.from({ length: 25 }, (_, index) => {
    const x = (index / 24) * 300 + 10;
    const y =
      base +
      Math.sin(index / 2.2 + seed) * swing +
      Math.sin(index / 0.9 + seed * 3) * (swing / 3);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

const sketches: Record<SketchKind, React.ReactNode> = {
  bars: (
    <>
      <line x1="10" y1="150" x2="310" y2="150" className="sgk-axis" />
      {day.map((value, index) => (
        <rect
          key={index}
          x={10 + index * 8.35}
          y={150 - value}
          width="6"
          height={value}
          rx="2"
          className="sgk-fill"
        />
      ))}
    </>
  ),
  lines: (
    <>
      <line x1="10" y1="150" x2="310" y2="150" className="sgk-axis" />
      <line x1="10" y1="80" x2="310" y2="80" className="sgk-grid" />
      <polyline points={wander(1, 70, 10)} className="sgk-line sgk-soft" />
      <polyline points={wander(4, 118, 18)} className="sgk-line" />
    </>
  ),
  timeline: (
    <>
      {[40, 85, 130].map((y, lane) => (
        <g key={y}>
          <rect
            x="10"
            y={y - 9}
            width="300"
            height="18"
            rx="9"
            className="sgk-track"
          />
          {[0.12, 0.34, 0.5, 0.71, 0.9]
            .slice(lane, lane + 3 + (lane % 2))
            .map((share) => (
              <circle
                key={share}
                cx={10 + share * 300}
                cy={y}
                r="5"
                className="sgk-dot"
              />
            ))}
        </g>
      ))}
    </>
  ),
  calendar: (
    <>
      {Array.from({ length: 28 }, (_, index) => (
        <rect
          key={index}
          x={24 + (index % 7) * 40}
          y={18 + Math.floor(index / 7) * 38}
          width="32"
          height="30"
          rx="7"
          className={
            index % 7 === 2 || index % 7 === 5 ? "sgk-fill" : "sgk-track"
          }
        />
      ))}
    </>
  ),
  flow: (
    <>
      <path d="M78 85 H122 M198 85 H242" className="sgk-wire" />
      {[10, 126, 242].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y="52"
            width="68"
            height="66"
            rx="12"
            className="sgk-card"
          />
          <rect
            x={x + 12}
            y="66"
            width="20"
            height="20"
            rx="6"
            className="sgk-fill"
          />
          <rect
            x={x + 12}
            y="96"
            width="44"
            height="6"
            rx="3"
            className="sgk-track"
          />
        </g>
      ))}
    </>
  ),
  rings: (
    <>
      {[72, 50, 28].map((r) => (
        <circle key={r} cx="160" cy="88" r={r} className="sgk-ring" />
      ))}
      <circle cx="160" cy="88" r="10" className="sgk-fill" />
      {[
        [160, 16],
        [222, 124],
        [110, 88],
      ].map(([cx, cy]) => (
        <circle key={`${cx}`} cx={cx} cy={cy} r="5" className="sgk-dot" />
      ))}
    </>
  ),
  list: (
    <>
      {[30, 62, 94, 126].map((y, index) => (
        <g key={y}>
          <rect
            x="10"
            y={y}
            width={90 + ((index * 23) % 50)}
            height="10"
            rx="5"
            className="sgk-fill"
          />
          <rect
            x="180"
            y={y}
            width="130"
            height="10"
            rx="5"
            className="sgk-track"
          />
        </g>
      ))}
    </>
  ),
};

export function EmptySketch({
  kind,
  caption = "A sketch of what goes here. Not your data.",
}: {
  kind: SketchKind;
  caption?: string | null;
}) {
  return (
    <figure className="sgk" aria-hidden="true">
      <svg
        viewBox="0 0 320 170"
        // Bars and lines fill whatever width they are given; shapes with
        // circles in them keep their proportions.
        preserveAspectRatio={
          kind === "bars" || kind === "lines" ? "none" : undefined
        }
      >
        {sketches[kind]}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
