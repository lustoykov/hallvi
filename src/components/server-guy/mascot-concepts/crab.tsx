import { BlankCard, Brow, EyeBall, INK, Mouth, Zzz, type ArtProps, type CharacterDef } from "./parts";

const CRAB = "#d4694b";
const CRAB_L = "#eea486";
const CRAB_D = "#b3513a";
const RACK = "#cdd4de";
const PLATE = "#8f9bb0";
const UNIT = "#e9edf3";
const LED = "#fff1bd";

/** A stroke with an ink outline: draws the path twice. */
function Limb({ d, w = 7 }: { d: string; w?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 5} strokeLinecap="round" />
      <path d={d} fill="none" stroke={CRAB} strokeWidth={w} strokeLinecap="round" />
    </>
  );
}

/** Nook, the hermit crab: a tiny server rack for a shell; the eye-stalks act. */
function CrabArt({ uid }: ArtProps) {
  return (
    <g className="mc-crab">
      <Limb d="M58 196 Q42 199 36 214" />
      <Limb d="M70 204 Q58 211 54 224" />
      <Limb d="M130 202 Q140 212 137 226" />
      <Limb d="M160 202 Q172 211 174 225" />

      <g className="mc-crab-body" style={{ transformOrigin: "150px 200px" }}>
        <path
          className="mc-ol"
          fill={CRAB}
          d="M39 172 C39 147 60 134 86 134 C112 134 133 147 133 172 C133 196 112 210 86 210 C60 210 39 196 39 172Z"
        />
        <ellipse cx={86} cy={194} rx={30} ry={11} fill={CRAB_L} />
        <g className="mc-detail" fill={CRAB_D} opacity={0.5}>
          <circle cx={60} cy={163} r={2} />
          <circle cx={66} cy={169} r={1.6} />
          <circle cx={110} cy={161} r={2} />
          <circle cx={115} cy={168} r={1.6} />
        </g>
        <Mouth cx={86} cy={179} w={16} />
        <g className="mc-crab-claw-r" style={{ transformOrigin: "96px 198px" }}>
          <Limb d="M94 198 Q100 206 104 207" w={6} />
          <circle className="mc-ol" cx={107} cy={208} r={8.5} fill={CRAB} />
          <ellipse className="mc-ol" cx={113} cy={199} rx={6} ry={4} fill={CRAB} transform="rotate(-28 113 199)" />
        </g>
        <g className="mc-crab-claw-l" style={{ transformOrigin: "58px 184px" }}>
          <Limb d="M62 186 Q50 189 42 181" />
          <circle className="mc-ol" cx={33} cy={172} r={15.5} fill={CRAB} />
          <ellipse className="mc-ol" cx={42} cy={152} rx={10.5} ry={6.8} fill={CRAB} transform="rotate(-28 42 152)" />
          <ellipse className="mc-detail" cx={28} cy={167} rx={4.5} ry={3} fill={CRAB_L} />
        </g>
      </g>

      <g className="mc-crab-rack">
        <path
          className="mc-ol"
          fill={RACK}
          d="M112 118 C112 92 130 78 161 78 C192 78 210 92 210 118 L210 190 C210 198 204 204 196 204 L126 204 C118 204 112 198 112 190Z"
        />
        <path className="mc-detail" d="M152 96 C156 88 168 88 170 96 C171 102 164 105 160 101" fill="none" stroke={PLATE} strokeWidth={2.6} strokeLinecap="round" />
        <rect x={122} y={106} width={78} height={88} rx={8} fill={PLATE} />
        {[112, 139, 166].map((y, i) => (
          <g key={y}>
            <rect x={128} y={y} width={66} height={21} rx={4} fill={UNIT} />
            <g className="mc-detail" stroke="#b3bccb" strokeWidth={2} strokeLinecap="round">
              <path d={`M136 ${y + 6} v9 M142 ${y + 6} v9 M148 ${y + 6} v9`} />
            </g>
            <circle className={`mc-crab-led mc-crab-led-${i}`} cx={185} cy={y + 10.5} r={3.4} fill={LED} stroke={INK} strokeWidth={1.4} />
          </g>
        ))}
      </g>

      <g className="mc-crab-eyes" style={{ transformOrigin: "150px 200px" }}>
        <g className="mc-crab-stalk mc-crab-stalk-l" style={{ transformOrigin: "80px 142px" }}>
          <Limb d="M80 142 Q74 114 68 88" />
          <g className="mc-crab-eyecap" style={{ transformOrigin: "66px 74px" }}>
            <EyeBall cx={66} cy={74} r={18} side="l" lid={CRAB} uid={uid} />
            <Brow cx={66} cy={49} len={15} side="l" />
          </g>
        </g>
        <g className="mc-crab-stalk mc-crab-stalk-r" style={{ transformOrigin: "104px 138px" }}>
          <Limb d="M104 138 Q108 110 114 84" />
          <g className="mc-crab-eyecap" style={{ transformOrigin: "116px 70px" }}>
            <EyeBall cx={116} cy={70} r={18} side="r" lid={CRAB} uid={uid} />
            <Brow cx={116} cy={45} len={15} side="r" />
          </g>
        </g>
      </g>

      <g className="mc-crab-cloud">
        <path
          className="mc-ol"
          fill="#fff"
          d="M116 196 C98 196 96 170 116 168 C112 142 142 132 154 150 C160 128 196 128 198 154 C218 152 222 190 202 196Z"
        />
      </g>
      <BlankCard x={36} y={126} rot={-10} />
      <Zzz x={146} y={52} />
    </g>
  );
}

export const crab: CharacterDef = {
  Art: CrabArt,
  shadowRx: 78,
  sparkleAt: [104, 100],
  glyphAt: [158, 40],
  extras: {
    calm: { stalkL: -4, stalkR: 5, stalkLen: 1, retreat: 0 },
    checking: { stalkL: -14, stalkR: 12, stalkLen: 1.06, retreat: 0 },
    working: { stalkL: 12, stalkR: 16, stalkLen: 0.98, retreat: 0 },
    waiting: { stalkL: -2, stalkR: 2, stalkLen: 1.08, retreat: 0 },
    failed: { stalkL: -16, stalkR: 18, stalkLen: 0.88, retreat: 0.32 },
    stale: { stalkL: -26, stalkR: 28, stalkLen: 0.82, retreat: 0.12 },
    verified: { stalkL: -9, stalkR: 9, stalkLen: 1.1, retreat: -0.15 },
  },
};
