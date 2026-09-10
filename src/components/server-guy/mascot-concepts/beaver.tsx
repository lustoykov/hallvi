import { BlankCard, Brow, EyeSolid, INK, Magnifier, Mouth, Zzz, type ArtProps, type CharacterDef } from "./parts";

const FUR = "#a8683f";
const FUR_D = "#6b4630";
const BELLY = "#d8a877";
const MUZZLE = "#eed4ad";
const TAIL = "#5d4636";
const WOOD = "#c9965f";

/** Birch, the beaver: builder and maintainer, pencil behind the ear. */
function BeaverArt({ uid }: ArtProps) {
  const tailClip = `${uid}-beaver-tail`;
  return (
    <g className="mc-beaver">
      <g className="mc-beaver-tail" style={{ transformOrigin: "160px 212px" }}>
        <clipPath id={tailClip}>
          <ellipse cx={190} cy={206} rx={34} ry={15} transform="rotate(-16 190 206)" />
        </clipPath>
        <ellipse className="mc-ol" cx={190} cy={206} rx={34} ry={15} fill={TAIL} transform="rotate(-16 190 206)" />
        <g className="mc-detail" clipPath={`url(#${tailClip})`} stroke="#7d6553" strokeWidth={2}>
          <path d="M160 190 l40 40 M172 184 l40 40 M184 178 l40 40 M196 172 l40 40" />
          <path d="M160 226 l40 -40 M172 232 l40 -40 M184 238 l40 -40" />
        </g>
      </g>
      <g className="mc-beaver-puff" stroke={INK} strokeWidth={2.6} strokeLinecap="round">
        <path d="M222 222 l8 4 M218 230 l5 7 M226 212 l9 -1" />
      </g>

      <path
        className="mc-ol"
        fill={FUR}
        d="M74 194 C72 163 92 145 120 145 C148 145 168 163 166 194 C165 216 148 226 120 226 C92 226 75 216 74 194Z"
      />
      <ellipse cx={120} cy={197} rx={30} ry={22} fill={BELLY} />
      <ellipse className="mc-ol" cx={97} cy={224} rx={16} ry={7} fill={FUR_D} />
      <ellipse className="mc-ol" cx={143} cy={224} rx={16} ry={7} fill={FUR_D} />

      <g className="mc-head">
        <g className="mc-detail" transform="rotate(-24 178 50)">
          <rect className="mc-ol" x={150} y={46} width={46} height={8} rx={2} fill="#e9c48d" />
          <path d="M196 46 L206 50 L196 54Z" fill="#f4dfbd" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M202.5 48.4 L206 50 L202.5 51.6Z" fill={INK} />
        </g>
        <circle className="mc-ol" cx={72} cy={62} r={13} fill={FUR} />
        <circle cx={72} cy={63} r={6} fill={FUR_D} />
        <circle className="mc-ol" cx={168} cy={62} r={13} fill={FUR} />
        <circle cx={168} cy={63} r={6} fill={FUR_D} />
        <path
          className="mc-ol"
          fill={FUR}
          d="M120 42 C168 42 192 72 192 104 C192 138 162 156 120 156 C78 156 48 138 48 104 C48 72 72 42 120 42Z"
        />
        <g className="mc-face">
          <EyeSolid cx={84} cy={102} r={12.5} side="l" />
          <EyeSolid cx={156} cy={102} r={12.5} side="r" />
          <Brow cx={84} cy={82} len={17} side="l" />
          <Brow cx={156} cy={82} len={17} side="r" />
          <Mouth cx={120} cy={150} w={22} />
          <g className="mc-beaver-teeth">
            <rect className="mc-ol" x={110.5} y={137} width={9} height={17} rx={2.5} fill="#fff7e6" />
            <rect className="mc-ol" x={120.5} y={137} width={9} height={17} rx={2.5} fill="#fff7e6" />
          </g>
          <ellipse className="mc-ol" cx={107} cy={129} rx={19} ry={15.5} fill={MUZZLE} />
          <ellipse className="mc-ol" cx={133} cy={129} rx={19} ry={15.5} fill={MUZZLE} />
          <ellipse cx={120} cy={127} rx={10} ry={12} fill={MUZZLE} />
          <path fill={INK} d="M109 115 C109 109 131 109 131 115 C131 121 125 124 120 124 C115 124 109 121 109 115Z" />
          <ellipse className="mc-detail" cx={115} cy={114} rx={3} ry={1.5} fill="#fff" opacity={0.7} />
        </g>
      </g>

      <g className="mc-beaver-stick">
        <rect className="mc-ol" x={76} y={140} width={88} height={12} rx={6} fill={WOOD} />
        <ellipse cx={82} cy={146} rx={3.5} ry={5} fill="#ecd0a4" stroke={INK} strokeWidth={1.5} />
        <path className="mc-detail" d="M100 143 h14 M126 149 h16" stroke="#9f7043" strokeWidth={2} strokeLinecap="round" />
      </g>
      <g className="mc-beaver-chips" fill={WOOD} stroke={INK} strokeWidth={1.2}>
        <rect className="mc-woodchip mc-woodchip-0" x={108} y={150} width={6} height={4} rx={1.5} />
        <rect className="mc-woodchip mc-woodchip-1" x={124} y={151} width={5} height={4} rx={1.5} />
        <rect className="mc-woodchip mc-woodchip-2" x={116} y={152} width={5} height={3.5} rx={1.5} />
      </g>
      <g className="mc-beaver-dam">
        {[
          [70, 214, 44],
          [118, 214, 48],
          [92, 204, 46],
          [140, 204, 34],
        ].map(([x, y, w], i) => (
          <g key={i} className={`mc-log mc-log-${i}`}>
            <rect className="mc-ol" x={x} y={y} width={w} height={11} rx={5.5} fill={WOOD} />
            <ellipse cx={x + 5} cy={y + 5.5} rx={3} ry={4} fill="#ecd0a4" stroke={INK} strokeWidth={1.4} />
          </g>
        ))}
      </g>
      <ellipse className="mc-ol mc-beaver-paw-l" cx={104} cy={179} rx={10} ry={9} fill={FUR} />
      <ellipse className="mc-ol mc-beaver-paw-r" cx={136} cy={179} rx={10} ry={9} fill={FUR} />
      <Magnifier cx={156} cy={102} r={19} />
      <BlankCard x={186} y={140} rot={10} />
      <Zzz x={176} y={36} />
    </g>
  );
}

export const beaver: CharacterDef = {
  Art: BeaverArt,
  shadowRx: 64,
  sparkleAt: [120, 108],
  glyphAt: [60, 40],
  extras: {
    calm: { tail: 0 },
    checking: { tail: -4 },
    working: { tail: -8 },
    waiting: { tail: 0 },
    failed: { tail: 6 },
    stale: { tail: 10 },
    verified: { tail: -14 },
  },
};
