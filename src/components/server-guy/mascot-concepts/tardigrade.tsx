import { BlankCard, Brow, EyeSolid, INK, Mouth, star, Zzz, type ArtProps, type CharacterDef } from "./parts";

const BODY = "#e4cba0";
const BODY_L = "#f4e5c8";
const SHADE = "#c9aa7c";
const SNOUT = "#f7ecd8";

const SHAPE =
  "M120 46 C174 46 200 86 200 130 C200 180 172 212 120 212 C68 212 40 180 40 130 C40 86 66 46 120 46Z";

/** Eight stubby legs: attachment point, leg centre, rotation, claw side. */
const LEGS: Array<{ ax: number; ay: number; cx: number; cy: number; rot: number; dir: -1 | 1 | 0 }> = [
  { ax: 52, ay: 142, cx: 37, cy: 146, rot: -15, dir: -1 },
  { ax: 48, ay: 170, cx: 32, cy: 173, rot: 0, dir: -1 },
  { ax: 58, ay: 194, cx: 43, cy: 201, rot: 18, dir: -1 },
  { ax: 188, ay: 142, cx: 203, cy: 146, rot: 15, dir: 1 },
  { ax: 192, ay: 170, cx: 208, cy: 173, rot: 0, dir: 1 },
  { ax: 182, ay: 194, cx: 197, cy: 201, rot: -18, dir: 1 },
  { ax: 100, ay: 206, cx: 97, cy: 216, rot: 0, dir: 0 },
  { ax: 140, ay: 206, cx: 143, cy: 216, rot: 0, dir: 0 },
];

function Claws({ x, y, dir }: { x: number; y: number; dir: -1 | 1 | 0 }) {
  const d =
    dir === 0
      ? `M${x - 5} ${y + 9} l-1 5 M${x} ${y + 10} v5 M${x + 5} ${y + 9} l1 5`
      : `M${x + dir * 14} ${y - 5} l${dir * 5} -2 M${x + dir * 15} ${y} h${dir * 6} M${x + dir * 14} ${y + 5} l${dir * 5} 2`;
  return <path className="mc-detail" d={d} stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />;
}

/** Moss, the tardigrade: chubby, eight stubby legs, a round snout. Curls into a tun under stress. */
function TardigradeArt({ uid }: ArtProps) {
  const grad = `${uid}-tg-grad`;
  return (
    <g className="mc-tg">
      <radialGradient id={grad} cx="38%" cy="28%" r="80%">
        <stop offset="0" stopColor={BODY_L} />
        <stop offset="0.7" stopColor={BODY} />
      </radialGradient>
      <g className="mc-tg-helmet">
        <circle cx={120} cy={128} r={106} fill="#e3f0ff" fillOpacity={0.35} stroke={INK} strokeWidth={2.5} />
        <path d="M50 96 Q68 46 124 34" stroke="#fff" strokeWidth={6} strokeLinecap="round" fill="none" />
      </g>
      <g className="mc-tg-core" style={{ transformOrigin: "120px 212px" }}>
        {LEGS.map((l, i) => (
          <g key={i} className={`mc-tg-leg mc-tg-leg-${i}`} style={{ transformOrigin: `${l.ax}px ${l.ay}px` }}>
            <ellipse
              className="mc-ol"
              cx={l.cx}
              cy={l.cy}
              rx={l.dir === 0 ? 14 : 16.5}
              ry={l.dir === 0 ? 11 : 11.5}
              fill={BODY}
              transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
            />
            <Claws x={l.cx} y={l.cy} dir={l.dir} />
          </g>
        ))}
        <path className="mc-ol" d={SHAPE} fill={`url(#${grad})`} />
        <g className="mc-detail" fill="none" stroke={SHADE} strokeWidth={3} strokeLinecap="round">
          <path d="M58 162 Q120 180 182 162" />
          <path d="M70 191 Q120 205 170 191" />
        </g>
        <g className="mc-detail" fill={SHADE}>
          <circle cx={103} cy={60} r={2.6} />
          <circle cx={120} cy={56} r={2.6} />
          <circle cx={137} cy={60} r={2.6} />
        </g>
        <g className="mc-face">
          <EyeSolid cx={86} cy={117} r={13.5} side="l" />
          <EyeSolid cx={154} cy={117} r={13.5} side="r" />
          <Brow cx={86} cy={95} len={17} side="l" />
          <Brow cx={154} cy={95} len={17} side="r" />
          <g className="mc-tg-snout" style={{ transformOrigin: "120px 144px" }}>
            <circle className="mc-ol" cx={120} cy={144} r={18} fill={SNOUT} />
            <Mouth cx={120} cy={142} w={16} />
          </g>
        </g>
      </g>
      <g className="mc-tg-stars" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round">
        <path d={star(30, 62, 8)} />
        <path d={star(210, 86, 6)} />
        <path d={star(198, 32, 9)} />
      </g>
      <BlankCard x={30} y={116} rot={-9} />
      <Zzz x={180} y={58} />
    </g>
  );
}

export const tardigrade: CharacterDef = {
  Art: TardigradeArt,
  shadowRx: 72,
  sparkleAt: [120, 120],
  glyphAt: [192, 50],
  extras: {
    calm: { tun: 0 },
    checking: { tun: 0 },
    working: { tun: 0 },
    waiting: { tun: 0 },
    failed: { tun: 0.3 },
    stale: { tun: 0.12 },
    verified: { tun: 0 },
  },
};
