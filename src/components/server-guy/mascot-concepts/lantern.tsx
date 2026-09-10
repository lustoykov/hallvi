import { BlankCard, Brow, EyeSolid, INK, Mouth, Zzz, type ArtProps, type CharacterDef } from "./parts";

const FRAME = "#4b5a76";
const GLASS = "#e6ebf2";
const FLAME = "#ffb547";
const CORE = "#fff3cf";

const GLASS_PATH =
  "M68 78 C68 70 74 66 82 66 L158 66 C166 66 172 70 172 78 C179 110 179 150 172 182 C171 188 166 192 158 192 L82 192 C74 192 69 188 68 182 C61 150 61 110 68 78Z";

/** Wick, the lantern keeper: the face lives in the glass, the flame is its heart. */
function LanternArt({ uid }: ArtProps) {
  const glow = `${uid}-wick-glow`;
  const halo = `${uid}-wick-halo`;
  return (
    <g className="mc-wick">
      <radialGradient id={glow} cx="50%" cy="72%" r="70%">
        <stop offset="0" stopColor="#ffe08f" />
        <stop offset="0.55" stopColor="#fff0c6" stopOpacity={0.9} />
        <stop offset="1" stopColor="#fff6e0" stopOpacity={0.55} />
      </radialGradient>
      <radialGradient id={halo}>
        <stop offset="0" stopColor="#ffd46e" stopOpacity={0.55} />
        <stop offset="1" stopColor="#ffd46e" stopOpacity={0} />
      </radialGradient>
      <circle className="mc-wick-halo" cx={120} cy={146} r={116} fill={`url(#${halo})`} />

      <g className="mc-wick-arm-l" style={{ transformOrigin: "66px 150px" }}>
        <circle className="mc-ol" cx={56} cy={152} r={9.5} fill={FRAME} />
      </g>
      <g className="mc-wick-foot-l" style={{ transformOrigin: "100px 216px" }}>
        <ellipse className="mc-ol" cx={100} cy={222} rx={13} ry={7} fill={FRAME} />
      </g>
      <g className="mc-wick-foot-r" style={{ transformOrigin: "132px 216px" }}>
        <ellipse className="mc-ol" cx={140} cy={222} rx={13} ry={7} fill={FRAME} />
      </g>
      <path
        className="mc-ol"
        fill={FRAME}
        d="M70 190 L170 190 C177 190 181 196 178 202 L172 212 C170 216 166 218 161 218 L79 218 C74 218 70 216 68 212 L62 202 C59 196 63 190 70 190Z"
      />

      <path d={GLASS_PATH} fill={GLASS} />
      <g className="mc-wick-flicker">
        <path className="mc-wick-glow" d={GLASS_PATH} fill={`url(#${glow})`} />
      </g>
      <path className="mc-detail" d="M80 88 Q75 128 80 168" stroke="#fff" strokeOpacity={0.75} strokeWidth={5} strokeLinecap="round" fill="none" />
      <g className="mc-wick-flame" style={{ transformOrigin: "120px 178px" }}>
        <rect x={117.5} y={168} width={5} height={14} rx={2} fill={INK} />
        <g className="mc-wick-flame-in" style={{ transformOrigin: "120px 172px" }}>
          <path d="M120 144 C127 153 132 160 130 166 C128 173 112 173 110 166 C108 160 113 153 120 144Z" fill={FLAME} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M120 154 C124 158 125 162 124 166 C123 169 117 169 116 166 C115 162 116 158 120 154Z" fill={CORE} />
        </g>
      </g>
      <g className="mc-face">
        <EyeSolid cx={97} cy={108} r={12.5} side="l" />
        <EyeSolid cx={143} cy={108} r={12.5} side="r" />
        <Brow cx={97} cy={88} len={16} side="l" />
        <Brow cx={143} cy={88} len={16} side="r" />
        <Mouth cx={120} cy={129} w={17} />
      </g>
      <path className="mc-ol" d={GLASS_PATH} fill="none" />

      <rect className="mc-ol" x={64} y={184} width={112} height={12} rx={5} fill={FRAME} />
      <rect className="mc-ol" x={62} y={56} width={116} height={14} rx={6} fill={FRAME} />
      <path className="mc-ol" fill={FRAME} d="M72 58 C76 36 100 25 120 25 C140 25 164 36 168 58Z" />
      <path className="mc-detail" d="M92 44 Q104 34 118 32" stroke="#fff" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" fill="none" />
      <circle className="mc-ol" cx={120} cy={22} r={6} fill={FRAME} />
      <circle cx={120} cy={10} r={8} fill="none" stroke={INK} strokeWidth={7} />
      <circle cx={120} cy={10} r={8} fill="none" stroke={FRAME} strokeWidth={3} />

      <BlankCard x={198} y={124} rot={10} />
      <g className="mc-wick-arm-r" style={{ transformOrigin: "174px 150px" }}>
        <circle className="mc-ol" cx={184} cy={152} r={9.5} fill={FRAME} />
      </g>
      <Zzz x={164} y={44} />
    </g>
  );
}

export const lantern: CharacterDef = {
  Art: LanternArt,
  shadowRx: 62,
  sparkleAt: [120, 96],
  glyphAt: [188, 40],
  extras: {
    calm: { glow: 0.75, halo: 0.32, flame: 1 },
    checking: { glow: 1, halo: 0.6, flame: 1.14 },
    working: { glow: 0.92, halo: 0.45, flame: 1.18 },
    waiting: { glow: 0.82, halo: 0.38, flame: 1 },
    failed: { glow: 0.5, halo: 0.16, flame: 0.78 },
    stale: { glow: 0.2, halo: 0.04, flame: 0.58 },
    verified: { glow: 1, halo: 0.95, flame: 1.35 },
  },
};
