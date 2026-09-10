import { BlankCard, Brow, EyeSolid, INK, Magnifier, Mouth, star, type ArtProps, type CharacterDef } from "./parts";

const FUR = "#7d5238";
const FUR_D = "#5c3b27";
const FACE = "#f1dfc6";
const SNOUT = "#fbf1e3";
const BELLY = "#c69a72";
const PEBBLE = "#9dafc4";
const PEBBLE_L = "#d6dfea";

const HEAD =
  "M120 40 C170 40 196 72 196 104 C196 138 164 157 120 157 C76 157 44 138 44 104 C44 72 70 40 120 40Z";

/** Tuck, the sea otter: pale masked face, cocoa body, a pebble held to the chest. */
function OtterArt({ uid }: ArtProps) {
  const clip = `${uid}-otter-head`;
  return (
    <g className="mc-otter">
      <g className="mc-otter-tail" style={{ transformOrigin: "154px 206px" }}>
        <path
          className="mc-ol"
          fill={FUR}
          d="M148 214 C184 226 216 208 213 182 C212 171 199 168 195 179 C191 193 176 200 148 197Z"
        />
      </g>
      <path
        className="mc-ol"
        fill={FUR}
        d="M72 196 C70 164 90 146 120 146 C150 146 170 164 168 196 C167 216 150 226 120 226 C90 226 73 216 72 196Z"
      />
      <ellipse cx={120} cy={198} rx={31} ry={23} fill={BELLY} />
      <ellipse className="mc-ol" cx={97} cy={224} rx={15} ry={7} fill={FUR_D} />
      <ellipse className="mc-ol" cx={143} cy={224} rx={15} ry={7} fill={FUR_D} />

      <g className="mc-head">
        <circle className="mc-ol" cx={69} cy={63} r={14} fill={FUR} />
        <circle cx={69} cy={64} r={6.5} fill={FUR_D} />
        <circle className="mc-ol" cx={171} cy={63} r={14} fill={FUR} />
        <circle cx={171} cy={64} r={6.5} fill={FUR_D} />
        <clipPath id={clip}>
          <path d={HEAD} />
        </clipPath>
        <path d={HEAD} fill={FUR} />
        <g clipPath={`url(#${clip})`}>
          <path
            fill={FACE}
            d="M36 126 C40 101 58 86 80 86 C98 86 110 93 120 103 C130 93 142 86 160 86 C182 86 200 101 204 126 L204 170 L36 170Z"
          />
          <ellipse cx={120} cy={129} rx={24} ry={16} fill={SNOUT} />
        </g>
        <path className="mc-ol" d={HEAD} fill="none" />
        <g className="mc-face">
          <g className="mc-detail" fill={FUR_D} opacity={0.45}>
            <circle cx={101} cy={127} r={1.7} />
            <circle cx={98} cy={133} r={1.7} />
            <circle cx={104} cy={135} r={1.7} />
            <circle cx={139} cy={127} r={1.7} />
            <circle cx={142} cy={133} r={1.7} />
            <circle cx={136} cy={135} r={1.7} />
          </g>
          <EyeSolid cx={84} cy={110} r={13} side="l" />
          <EyeSolid cx={156} cy={110} r={13} side="r" />
          <Brow cx={84} cy={89} len={17} side="l" />
          <Brow cx={156} cy={89} len={17} side="r" />
          <path fill={INK} d="M110 118 C110 113 130 113 130 118 C130 123 124 126 120 126 C116 126 110 123 110 118Z" />
          <ellipse className="mc-detail" cx={116} cy={117} rx={3} ry={1.5} fill="#fff" opacity={0.7} />
          <Mouth cx={120} cy={132} w={20} shape="w" />
        </g>
      </g>

      {/* After the head, so a tossed pebble passes in front of the face. */}
      <g className="mc-otter-hands">
        <g className="mc-otter-pebble" style={{ transformOrigin: "120px 180px" }}>
          <ellipse className="mc-ol" cx={120} cy={180} rx={16} ry={12.5} fill={PEBBLE} />
          <ellipse cx={114} cy={175.5} rx={5.5} ry={3.2} fill={PEBBLE_L} />
          <path className="mc-otter-glint" d={star(129, 173, 7)} fill="#fff" stroke={INK} strokeWidth={1.4} />
        </g>
        <ellipse className="mc-ol mc-otter-paw-l" cx={102} cy={183} rx={10} ry={9} fill={FUR} />
      </g>
      <Magnifier cx={156} cy={110} r={19} />
      <BlankCard x={187} y={146} rot={10} />
      <ellipse className="mc-ol mc-otter-paw-r" cx={138} cy={183} rx={10} ry={9} fill={FUR} />
    </g>
  );
}

const none = {};

export const otter: CharacterDef = {
  Art: OtterArt,
  shadowRx: 60,
  sparkleAt: [120, 112],
  glyphAt: [190, 48],
  extras: { calm: none, checking: none, working: none, waiting: none, failed: none, stale: none, verified: none },
};
