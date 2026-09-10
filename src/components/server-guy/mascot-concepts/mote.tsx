import { BlankCard, Brow, EyeSolid, INK, Mouth, Zzz, type ArtProps, type CharacterDef } from "./parts";

const BODY = "#9ec3e6";
const BODY_L = "#dcecfb";

const SHAPE =
  "M120 44 C170 44 202 90 204 142 C206 193 170 222 120 222 C70 222 34 193 36 142 C38 90 70 44 120 44Z";
const SMALL =
  "M120 128 C148 128 166 152 167 178 C168 206 148 222 120 222 C92 222 72 206 73 178 C74 152 92 128 120 128Z";

function Twin({ grad, side }: { grad: string; side: "l" | "r" }) {
  return (
    <g className={`mc-mote-twin mc-mote-twin-${side}`}>
      <path className="mc-ol" d={SMALL} fill={`url(#${grad})`} />
      {[106, 134].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={180} rx={8} ry={9} fill={INK} />
          <circle cx={x - 2.8} cy={176.5} r={3} fill="#fff" />
        </g>
      ))}
      <path d="M114 196 Q120 201 126 196" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Mote, the pebble sprite: no limbs, all acting is squash, stretch and shape. */
function MoteArt({ uid }: ArtProps) {
  const grad = `${uid}-mote-grad`;
  return (
    <g className="mc-mote">
      <radialGradient id={grad} cx="36%" cy="24%" r="85%">
        <stop offset="0" stopColor={BODY_L} />
        <stop offset="0.62" stopColor={BODY} />
      </radialGradient>
      <g className="mc-mote-core" style={{ transformOrigin: "120px 222px" }}>
        <path className="mc-ol" d={SHAPE} fill={`url(#${grad})`} />
        <ellipse className="mc-detail" cx={86} cy={86} rx={17} ry={9} fill="#fff" opacity={0.6} transform="rotate(-32 86 86)" />
        <path className="mc-detail" d="M176 196 Q194 172 193 140" stroke="#f1f8fe" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.85} />
        <g className="mc-face">
          <EyeSolid cx={93} cy={147} r={16} side="l" />
          <EyeSolid cx={147} cy={147} r={16} side="r" />
          <Brow cx={93} cy={119} len={20} side="l" />
          <Brow cx={147} cy={119} len={20} side="r" />
          <Mouth cx={120} cy={175} w={19} />
        </g>
      </g>
      <g className="mc-mote-twins">
        <Twin grad={grad} side="l" />
        <Twin grad={grad} side="r" />
      </g>
      <BlankCard x={206} y={106} rot={12} />
      <Zzz x={172} y={50} />
    </g>
  );
}

export const mote: CharacterDef = {
  Art: MoteArt,
  shadowRx: 70,
  sparkleAt: [120, 124],
  glyphAt: [192, 52],
  extras: {
    calm: { stretch: 1 },
    checking: { stretch: 1.12 },
    working: { stretch: 1 },
    waiting: { stretch: 1.05 },
    failed: { stretch: 0.9 },
    stale: { stretch: 0.8 },
    verified: { stretch: 1 },
  },
};
