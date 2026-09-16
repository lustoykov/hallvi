// Interface miniatures: what each application's own screen looks like, drawn
// by hand as SVG on a 320×200 stage and shipped as code. Not screenshots and
// not icons. Every one is the application's actual layout, reduced to its
// shapes: Paperless is a document grid with tags, Grafana is a dark
// dashboard with a green line, Immich is a photo timeline, Ghost is the
// editor with its Publish button. Text lines are rounded bars; the few
// numbers are real text because a dashboard without a number is not one.
//
// One family: the same chrome greys, the same bar radius, one accent colour
// per application taken from the software itself. Elements tagged
// data-anim move a little when the card is hovered (see home.module.css).
// Software this file does not know gets the generic screen.

import type { ApplicationKind } from "./application-kind";

const chrome = "#f3f5f9";
const line = "#e3e8f0";
const bar = "#cbd4e1";
const dark = "#3e4a60";
const white = "#ffffff";

/** A line of text, as a bar. */
function L({
  x,
  y,
  w,
  h = 5,
  c = bar,
  o,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  c?: string;
  o?: number;
}) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={c} opacity={o} />
  );
}

function Sun({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return <circle cx={x} cy={y} r={r} fill={c} />;
}

export const PREVIEWS: Record<ApplicationKind, () => React.ReactNode> = {
  documents: () => {
    const tags = [
      "#5b7fd6",
      "#3aa876",
      "#e08a3c",
      "#5b7fd6",
      "#8a6bd6",
      "#3aa876",
    ];
    return (
      <>
        <rect width="320" height="200" fill={white} />
        <rect width="56" height="200" fill={chrome} />
        {[14, 40, 66, 92, 118].map((y, i) => (
          <rect
            key={y}
            x="18"
            y={y}
            width="20"
            height="14"
            rx="4"
            fill={i === 0 ? "#5b7fd6" : bar}
            opacity={i === 0 ? 1 : 0.7}
          />
        ))}
        <rect x="68" y="10" width="160" height="16" rx="8" fill={chrome} />
        <L x={80} y={16} w={60} h={4} />
        <rect x="262" y="10" width="46" height="16" rx="8" fill="#5b7fd6" />
        <L x={70} y={36} w={54} h={7} c={dark} />
        <L x={132} y={38} w={40} h={4} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const x = 68 + (i % 3) * 86;
          const y = 52 + Math.floor(i / 3) * 72;
          return (
            <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
              <rect
                x={x}
                y={y}
                width="72"
                height="64"
                rx="4"
                fill={white}
                stroke={line}
              />
              <rect
                x={x + 10}
                y={y + 7}
                width="52"
                height="36"
                rx="2"
                fill="#fbfcfe"
                stroke={line}
              />
              <L x={x + 16} y={y + 14} w={28} h={3} />
              <L x={x + 16} y={y + 21} w={38} h={3} />
              <L x={x + 16} y={y + 28} w={32} h={3} />
              <L x={x + 16} y={y + 35} w={22} h={3} />
              <rect
                x={x + 8}
                y={y + 49}
                width="28"
                height="8"
                rx="4"
                fill={tags[i]}
                opacity="0.85"
              />
              <L x={x + 42} y={y + 51} w={20} h={4} />
            </g>
          );
        })}
      </>
    );
  },
  publishing: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="88" height="200" fill={chrome} />
      <L x={14} y={16} w={40} h={6} c={dark} />
      {[38, 56, 74, 92, 110, 128].map((y, i) => (
        <g key={y}>
          <L
            x={14}
            y={y}
            w={i === 1 ? 58 : 48}
            h={4}
            c={i === 1 ? dark : bar}
            o={i === 1 ? 0.8 : 1}
          />
          <L x={14} y={y + 7} w={30} h={3} o={0.7} />
        </g>
      ))}
      <rect
        x="252"
        y="12"
        width="54"
        height="18"
        rx="9"
        fill="#15171a"
        data-anim="pulse"
      />
      <L x={266} y={19} w={26} h={4} c={white} />
      <g data-anim="rise" style={{ ["--i" as string]: 0 }}>
        <L x={108} y={44} w={150} h={11} c="#15171a" />
        <L x={108} y={60} w={96} h={11} c="#15171a" />
      </g>
      <g data-anim="rise" style={{ ["--i" as string]: 1 }}>
        <L x={108} y={84} w={196} h={4} />
        <L x={108} y={94} w={204} h={4} />
        <L x={108} y={104} w={176} h={4} />
        <L x={108} y={114} w={192} h={4} />
      </g>
      <g data-anim="rise" style={{ ["--i" as string]: 2 }}>
        <rect x="108" y="130" width="204" height="56" rx="4" fill="#f6e3ea" />
        <path
          d="M118 182l40-32 26 20 18-12 44 24z"
          fill="#c26a8a"
          opacity="0.55"
        />
        <Sun x={284} y={148} r={8} c="#e0a24a" />
      </g>
    </>
  ),
  photos: () => {
    const fills = [
      "#cfe0f5",
      "#f7d9b6",
      "#d5e8d0",
      "#e6e1f2",
      "#f5cfc4",
      "#cfe0f5",
      "#d9dee7",
      "#f7d9b6",
      "#d5e8d0",
      "#cfe0f5",
      "#e6e1f2",
      "#f5cfc4",
      "#d9dee7",
      "#cfe0f5",
      "#f7d9b6",
    ];
    return (
      <>
        <rect width="320" height="200" fill={white} />
        <rect width="320" height="26" fill={white} />
        <line x1="0" y1="26" x2="320" y2="26" stroke={line} />
        <rect x="44" y="7" width="130" height="12" rx="6" fill={chrome} />
        <circle cx="304" cy="13" r="6" fill="#e0a24a" />
        <rect x="0" y="26" width="44" height="174" fill={chrome} />
        {[42, 66, 90, 114, 138].map((y, i) => (
          <rect
            key={y}
            x="14"
            y={y}
            width="16"
            height="12"
            rx="3"
            fill={i === 0 ? "#e0a24a" : bar}
          />
        ))}
        <L x={56} y={36} w={62} h={5} c={dark} />
        {fills.map((f, i) => {
          const x = 56 + (i % 5) * 51;
          const y = 48 + Math.floor(i / 5) * 46;
          return (
            <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
              <rect x={x} y={y} width="45" height="40" rx="2" fill={f} />
              {i % 4 === 0 && <Sun x={x + 32} y={y + 12} r={5} c="#e0a24a" />}
              {i % 3 === 0 && (
                <path
                  d={`M${x} ${y + 40}l14-16 9 10 6-6 16 12z`}
                  fill="#8c9fb9"
                  opacity="0.7"
                />
              )}
              {i % 5 === 2 && (
                <circle
                  cx={x + 22}
                  cy={y + 20}
                  r="9"
                  fill={white}
                  opacity="0.7"
                />
              )}
            </g>
          );
        })}
        <rect x="311" y="48" width="3" height="132" rx="1.5" fill={line} />
        <rect x="311" y="60" width="3" height="18" rx="1.5" fill="#e0a24a" />
      </>
    );
  },
  metrics: () => (
    <>
      <rect width="320" height="200" fill="#181b1f" />
      <rect width="320" height="24" fill="#22252b" />
      <rect x="0" y="24" width="40" height="176" fill="#1f2228" />
      {[38, 62, 86, 110].map((y, i) => (
        <rect
          key={y}
          x="12"
          y={y}
          width="16"
          height="12"
          rx="3"
          fill={i === 0 ? "#f46800" : "#3d4451"}
        />
      ))}
      <L x={50} y={9} w={72} h={5} c="#c7d0d9" o={0.8} />
      <rect x="240" y="6" width="68" height="12" rx="3" fill="#2b3038" />
      <L x={248} y={10} w={40} h={4} c="#8a94a3" />
      {/* time series */}
      <rect x="50" y="32" width="176" height="92" rx="3" fill="#22252b" />
      <L x={58} y={38} w={50} h={4} c="#8a94a3" />
      {[58, 78, 98, 118].map((y) => (
        <line key={y} x1="58" y1={y} x2="220" y2={y} stroke="#2f343d" />
      ))}
      <path
        data-anim="draw"
        d="M58 108 L72 96 84 100 96 84 110 90 124 70 138 78 152 62 166 72 180 56 194 66 208 50 220 58"
        fill="none"
        stroke="#73bf69"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M58 108 L72 96 84 100 96 84 110 90 124 70 138 78 152 62 166 72 180 56 194 66 208 50 220 58 V118 H58Z"
        fill="#73bf69"
        opacity="0.12"
      />
      {/* stat */}
      <rect x="234" y="32" width="76" height="42" rx="3" fill="#22252b" />
      <L x={242} y={38} w={36} h={4} c="#8a94a3" />
      <text
        x="242"
        y="66"
        fontSize="18"
        fontWeight="700"
        fill="#73bf69"
        fontFamily="inherit"
      >
        99.8%
      </text>
      {/* gauge */}
      <rect x="234" y="82" width="76" height="42" rx="3" fill="#22252b" />
      <path
        d="M252 116a20 20 0 0 1 40 0"
        fill="none"
        stroke="#2f343d"
        strokeWidth="6"
      />
      <path
        d="M252 116a20 20 0 0 1 30-17"
        fill="none"
        stroke="#f46800"
        strokeWidth="6"
        data-anim="draw"
      />
      <text
        x="262"
        y="114"
        fontSize="9"
        fontWeight="600"
        fill="#c7d0d9"
        fontFamily="inherit"
      >
        71%
      </text>
      {/* bars */}
      <rect x="50" y="132" width="260" height="58" rx="3" fill="#22252b" />
      <L x={58} y={138} w={44} h={4} c="#8a94a3" />
      {[22, 30, 18, 34, 26, 38, 20, 30, 24, 36, 28, 32].map((h, i) => (
        <rect
          key={i}
          data-anim="grow"
          style={{ ["--i" as string]: i }}
          x={62 + i * 20}
          y={182 - h}
          width="12"
          height={h}
          rx="1.5"
          fill={i % 3 === 2 ? "#f2cc0c" : "#5794f2"}
        />
      ))}
    </>
  ),
  files: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="22" fill="#0082c9" />
      {[10, 30, 50, 70].map((x) => (
        <rect
          key={x}
          x={x}
          y="6"
          width="12"
          height="10"
          rx="2"
          fill={white}
          opacity={x === 10 ? 1 : 0.5}
        />
      ))}
      <circle cx="306" cy="11" r="6" fill={white} opacity="0.85" />
      <rect x="0" y="22" width="72" height="178" fill={chrome} />
      {[36, 54, 72, 90, 108].map((y, i) => (
        <g key={y}>
          <rect
            x="10"
            y={y}
            width="10"
            height="8"
            rx="2"
            fill={i === 0 ? "#0082c9" : bar}
          />
          <L x={26} y={y + 2} w={36} h={4} c={i === 0 ? dark : bar} />
        </g>
      ))}
      <L x={84} y={32} w={40} h={5} c={dark} />
      <L x={128} y={33} w={24} h={4} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const y = 50 + i * 24;
        const folder = i < 3;
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            <line x1="84" y1={y + 20} x2="312" y2={y + 20} stroke={line} />
            {folder ? (
              <path
                d={`M86 ${y + 3}h8l3 3h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H86a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z`}
                fill="#0082c9"
                opacity="0.85"
              />
            ) : (
              <rect
                x="86"
                y={y + 2}
                width="14"
                height="16"
                rx="2"
                fill={white}
                stroke={bar}
              />
            )}
            <L x={112} y={y + 6} w={folder ? 60 : 80} h={5} c={dark} o={0.8} />
            <L x={236} y={y + 7} w={26} h={4} />
            <L x={274} y={y + 7} w={34} h={4} />
          </g>
        );
      })}
    </>
  ),
  home: () => (
    <>
      <rect width="320" height="200" fill="#f5f7fb" />
      <rect width="48" height="200" fill={white} />
      <line x1="48" y1="0" x2="48" y2="200" stroke={line} />
      {[14, 40, 66, 92, 118].map((y, i) => (
        <rect
          key={y}
          x="16"
          y={y}
          width="16"
          height="14"
          rx="4"
          fill={i === 0 ? "#03a9f4" : bar}
          opacity={i === 0 ? 1 : 0.7}
        />
      ))}
      <L x={60} y={12} w={70} h={6} c={dark} />
      {/* weather */}
      <g data-anim="rise" style={{ ["--i" as string]: 0 }}>
        <rect
          x="60"
          y="28"
          width="118"
          height="60"
          rx="8"
          fill={white}
          stroke={line}
        />
        <Sun x={84} y={52} r={12} c="#f9b233" />
        <text
          x="106"
          y="58"
          fontSize="18"
          fontWeight="700"
          fill={dark}
          fontFamily="inherit"
        >
          21°
        </text>
        <L x={106} y={66} w={50} h={4} />
        <L x={106} y={75} w={30} h={4} />
      </g>
      {/* thermostat */}
      <g data-anim="rise" style={{ ["--i" as string]: 1 }}>
        <rect
          x="186"
          y="28"
          width="124"
          height="60"
          rx="8"
          fill={white}
          stroke={line}
        />
        <path
          d="M230 76a20 20 0 1 1 36 0"
          fill="none"
          stroke={line}
          strokeWidth="6"
        />
        <path
          d="M230 76a20 20 0 0 1 8-30"
          fill="none"
          stroke="#f9b233"
          strokeWidth="6"
          data-anim="draw"
        />
        <text
          x="236"
          y="70"
          fontSize="11"
          fontWeight="700"
          fill={dark}
          fontFamily="inherit"
        >
          21.5°
        </text>
        <L x={276} y={40} w={26} h={4} />
        <L x={276} y={50} w={20} h={4} />
      </g>
      {/* lights */}
      {[0, 1, 2].map((i) => (
        <g key={i} data-anim="rise" style={{ ["--i" as string]: 2 + i }}>
          <rect
            x={60 + i * 62}
            y="98"
            width="56"
            height="42"
            rx="8"
            fill={white}
            stroke={line}
          />
          <circle
            cx={76 + i * 62}
            cy="114"
            r="7"
            fill={i === 1 ? "#f9b233" : bar}
            data-anim={i === 1 ? "glow" : undefined}
          />
          <L x={68 + i * 62} y={128} w={38} h={4} />
        </g>
      ))}
      <g data-anim="rise" style={{ ["--i" as string]: 5 }}>
        <rect x="248" y="98" width="62" height="92" rx="8" fill="#1c2333" />
        <rect x="256" y="106" width="46" height="46" rx="4" fill="#33405a" />
        <path d="M274 122v14l12-7z" fill={white} />
        <L x={256} y={160} w={40} h={4} c="#8a94a3" />
        <L x={256} y={172} w={46} h={3} c="#03a9f4" />
      </g>
      <g data-anim="rise" style={{ ["--i" as string]: 6 }}>
        <rect
          x="60"
          y="150"
          width="180"
          height="40"
          rx="8"
          fill={white}
          stroke={line}
        />
        <path
          data-anim="draw"
          d="M70 180 L88 172 104 176 122 164 140 170 158 158 176 166 194 156 212 162 230 152"
          fill="none"
          stroke="#03a9f4"
          strokeWidth="2"
        />
      </g>
    </>
  ),
  feeds: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="30" fill="#2d3748" />
      <L x={14} y={12} w={44} h={6} c={white} o={0.9} />
      {[80, 118, 150, 186].map((x, i) => (
        <L
          key={x}
          x={x}
          y={13}
          w={26}
          h={4}
          c={white}
          o={i === 0 ? 0.9 : 0.5}
        />
      ))}
      <rect x="284" y="9" width="22" height="12" rx="6" fill="#e08a3c" />
      <L x={14} y={42} w={60} h={6} c={dark} />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 58 + i * 28;
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            <L
              x={14}
              y={y}
              w={[210, 170, 236, 150, 200][i]}
              h={6}
              c={dark}
              o={i < 3 ? 0.9 : 0.5}
            />
            <L x={14} y={y + 11} w={40} h={3} c="#e08a3c" o={0.8} />
            <L x={60} y={y + 11} w={70} h={3} />
            <line x1="14" y1={y + 21} x2="306" y2={y + 21} stroke={line} />
          </g>
        );
      })}
    </>
  ),
  passwords: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="26" fill="#175ddc" />
      <rect x="12" y="7" width="12" height="12" rx="3" fill={white} />
      <L x={30} y={11} w={40} h={5} c={white} />
      <rect
        x="120"
        y="7"
        width="120"
        height="12"
        rx="6"
        fill={white}
        opacity="0.25"
      />
      <rect x="0" y="26" width="92" height="174" fill={chrome} />
      <L x={12} y={38} w={40} h={5} c={dark} />
      {[52, 66, 80, 94, 108].map((y, i) => (
        <g key={y}>
          <rect
            x="12"
            y={y}
            width="8"
            height="8"
            rx="2"
            fill={i === 0 ? "#175ddc" : bar}
          />
          <L x={26} y={y + 2} w={48} h={4} c={i === 0 ? dark : bar} />
        </g>
      ))}
      <L x={104} y={36} w={40} h={6} c={dark} />
      <L x={150} y={38} w={30} h={4} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const y = 52 + i * 24;
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            <circle
              cx="114"
              cy={y + 9}
              r="8"
              fill={
                [
                  "#175ddc",
                  "#3aa876",
                  "#e08a3c",
                  "#8a6bd6",
                  "#175ddc",
                  "#c26a8a",
                ][i]
              }
              opacity="0.8"
            />
            <rect x="110" y={y + 7} width="8" height="6" rx="1" fill={white} />
            <L
              x={130}
              y={y + 3}
              w={[70, 54, 84, 62, 48, 76][i]}
              h={5}
              c={dark}
              o={0.85}
            />
            <L x={130} y={y + 12} w={44} h={3} />
            <rect x="280" y={y + 4} width="10" height="10" rx="2" fill={bar} />
            <rect x="296" y={y + 4} width="10" height="10" rx="2" fill={bar} />
            <line x1="104" y1={y + 22} x2="312" y2={y + 22} stroke={line} />
          </g>
        );
      })}
    </>
  ),
  media: () => (
    <>
      <rect width="320" height="200" fill="#101418" />
      <rect width="320" height="24" fill="#151a20" />
      <circle cx="16" cy="12" r="7" fill="#aa5cc3" />
      {[34, 72, 104].map((x, i) => (
        <L
          key={x}
          x={x}
          y={10}
          w={28}
          h={4}
          c={white}
          o={i === 0 ? 0.9 : 0.4}
        />
      ))}
      <L x={12} y={34} w={80} h={5} c={white} o={0.85} />
      {[0, 1, 2].map((i) => (
        <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
          <rect
            x={12 + i * 102}
            y="44"
            width="94"
            height="52"
            rx="4"
            fill={["#2b3a4f", "#4a2f3d", "#2f4a3a"][i]}
          />
          <rect
            x={12 + i * 102}
            y="92"
            width={[60, 30, 78][i]}
            height="4"
            fill="#aa5cc3"
          />
          <L x={14 + i * 102} y={102} w={56} h={4} c={white} o={0.7} />
        </g>
      ))}
      <L x={12} y={118} w={60} h={5} c={white} o={0.85} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} data-anim="rise" style={{ ["--i" as string]: 3 + i }}>
          <rect
            x={12 + i * 51}
            y="128"
            width="44"
            height="62"
            rx="3"
            fill={
              [
                "#3b3157",
                "#1f3d4a",
                "#4a2a2a",
                "#2c3c2c",
                "#33334d",
                "#4a3a20",
              ][i]
            }
          />
          <L x={16 + i * 51} y={174} w={30} h={4} c={white} o={0.5} />
        </g>
      ))}
    </>
  ),
  code: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="24" fill="#24292f" />
      <rect x="12" y="6" width="12" height="12" rx="6" fill="#609926" />
      {[36, 70, 104].map((x, i) => (
        <L
          key={x}
          x={x}
          y={10}
          w={26}
          h={4}
          c={white}
          o={i === 0 ? 0.9 : 0.45}
        />
      ))}
      <L x={14} y={36} w={40} h={6} c={dark} />
      <L x={58} y={37} w={6} h={5} c={bar} />
      <L x={68} y={36} w={70} h={6} c="#609926" />
      <rect x="252" y="32" width="56" height="16" rx="4" fill="#609926" />
      <L x={266} y={38} w={28} h={4} c={white} />
      {[14, 54, 92, 132].map((x, i) => (
        <L key={x} x={x} y={54} w={30} h={4} c={i === 0 ? dark : bar} />
      ))}
      <line x1="14" y1="62" x2="306" y2="62" stroke={line} />
      <rect x="14" y="70" width="292" height="18" rx="4" fill="#f0f6e8" />
      <circle cx="26" cy="79" r="5" fill="#609926" />
      <L x={38} y={77} w={120} h={4} c={dark} o={0.7} />
      <L x={250} y={77} w={44} h={4} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const y = 96 + i * 17;
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            {i < 3 ? (
              <path
                d={`M16 ${y + 2}h6l2 2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z`}
                fill="#609926"
                opacity="0.7"
              />
            ) : (
              <rect
                x="16"
                y={y + 1}
                width="12"
                height="13"
                rx="2"
                fill={white}
                stroke={bar}
              />
            )}
            <L
              x={40}
              y={y + 5}
              w={[46, 60, 38, 54, 44, 70][i]}
              h={4}
              c={dark}
              o={0.8}
            />
            <L x={130} y={y + 5} w={[100, 80, 120, 90, 110, 60][i]} h={4} />
            <L x={270} y={y + 5} w={36} h={4} />
            <line x1="14" y1={y + 15} x2="306" y2={y + 15} stroke={line} />
          </g>
        );
      })}
    </>
  ),
  uptime: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="24" fill={chrome} />
      <line x1="0" y1="24" x2="320" y2="24" stroke={line} />
      <circle cx="16" cy="12" r="6" fill="#5cdd8b" />
      <L x={28} y={9} w={50} h={5} c={dark} />
      <rect x="0" y="24" width="124" height="176" fill={white} />
      <line x1="124" y1="24" x2="124" y2="200" stroke={line} />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 34 + i * 32;
        const down = i === 3;
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            <rect
              x="10"
              y={y}
              width="30"
              height="10"
              rx="5"
              fill={down ? "#dc3545" : "#5cdd8b"}
            />
            <L
              x={46}
              y={y + 3}
              w={[50, 40, 60, 44, 52][i]}
              h={4}
              c={dark}
              o={0.8}
            />
            {Array.from({ length: 14 }, (_, k) => (
              <rect
                key={k}
                x={10 + k * 7.5}
                y={y + 15}
                width="5"
                height="10"
                rx="1"
                fill={down && k > 9 ? "#dc3545" : "#5cdd8b"}
                data-anim="beat"
                style={{ ["--i" as string]: k }}
              />
            ))}
          </g>
        );
      })}
      <L x={138} y={36} w={60} h={6} c={dark} />
      <rect x="138" y="48" width="36" height="12" rx="6" fill="#5cdd8b" />
      <L x={182} y={51} w={70} h={4} />
      <rect x="138" y="70" width="170" height="64" rx="4" fill={chrome} />
      <path
        data-anim="draw"
        d="M146 118 L160 114 174 116 188 108 202 112 216 100 230 106 244 96 258 104 272 94 286 100 300 92"
        fill="none"
        stroke="#5cdd8b"
        strokeWidth="2"
      />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={138 + i * 58}
            y="144"
            width="52"
            height="44"
            rx="4"
            fill={white}
            stroke={line}
          />
          <L x={146 + i * 58} y={152} w={30} h={3} />
          <text
            x={146 + i * 58}
            y="178"
            fontSize="12"
            fontWeight="700"
            fill={dark}
            fontFamily="inherit"
          >
            {["99.9%", "212ms", "30d"][i]}
          </text>
        </g>
      ))}
    </>
  ),
  music: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="22" fill={chrome} />
      <line x1="0" y1="22" x2="320" y2="22" stroke={line} />
      <L x={12} y={9} w={52} h={5} c={dark} />
      <rect
        x="220"
        y="5"
        width="88"
        height="12"
        rx="6"
        fill={white}
        stroke={line}
      />
      <rect x="0" y="22" width="60" height="150" fill={chrome} />
      {[36, 54, 72, 90, 108].map((y, i) => (
        <L key={y} x={10} y={y} w={40} h={4} c={i === 1 ? "#4361ee" : bar} />
      ))}
      <L x={72} y={34} w={48} h={6} c={dark} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const x = 72 + (i % 4) * 60;
        const y = 48 + Math.floor(i / 4) * 62;
        const f = [
          "#4361ee",
          "#e0a24a",
          "#3aa876",
          "#c26a8a",
          "#8a6bd6",
          "#1c2333",
          "#e08a3c",
          "#5b7fd6",
        ][i];
        return (
          <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
            <rect
              x={x}
              y={y}
              width="48"
              height="48"
              rx="3"
              fill={f}
              opacity="0.8"
            />
            <circle
              cx={x + 24}
              cy={y + 24}
              r="12"
              fill="#1c2333"
              opacity="0.35"
            />
            <circle cx={x + 24} cy={y + 24} r="3" fill={white} opacity="0.8" />
            <L x={x} y={y + 52} w={34} h={3} c={dark} o={0.7} />
          </g>
        );
      })}
      <rect x="0" y="172" width="320" height="28" fill="#1c2333" />
      <rect x="10" y="178" width="16" height="16" rx="2" fill="#4361ee" />
      <L x={34} y={181} w={50} h={4} c={white} o={0.9} />
      <L x={34} y={189} w={30} h={3} c={white} o={0.5} />
      <path d="M150 180v12l10-6z" fill={white} />
      <rect x="176" y="185" width="120" height="3" rx="1.5" fill="#33405a" />
      <rect
        x="176"
        y="185"
        width="44"
        height="3"
        rx="1.5"
        fill="#4361ee"
        data-anim="play"
      />
    </>
  ),
  generic: () => (
    <>
      <rect width="320" height="200" fill={white} />
      <rect width="320" height="24" fill={chrome} />
      <line x1="0" y1="24" x2="320" y2="24" stroke={line} />
      <rect x="12" y="7" width="10" height="10" rx="3" fill="#7198db" />
      {[30, 66, 102].map((x, i) => (
        <L key={x} x={x} y={10} w={28} h={4} c={i === 0 ? dark : bar} />
      ))}
      <rect x="252" y="6" width="56" height="12" rx="6" fill="#7198db" />
      <rect x="0" y="24" width="64" height="176" fill={chrome} />
      {[38, 56, 74, 92, 110].map((y, i) => (
        <L key={y} x={12} y={y} w={40} h={4} c={i === 0 ? "#7198db" : bar} />
      ))}
      <L x={78} y={38} w={90} h={7} c={dark} />
      <L x={78} y={52} w={150} h={4} />
      {[0, 1, 2].map((i) => (
        <g key={i} data-anim="rise" style={{ ["--i" as string]: i }}>
          <rect
            x={78 + i * 78}
            y="66"
            width="70"
            height="50"
            rx="4"
            fill={white}
            stroke={line}
          />
          <L x={86 + i * 78} y={74} w={30} h={4} />
          <L x={86 + i * 78} y={86} w={50} h={8} c={dark} o={0.8} />
          <L x={86 + i * 78} y={102} w={40} h={3} />
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} data-anim="rise" style={{ ["--i" as string]: 3 + i }}>
          <L
            x={78}
            y={130 + i * 16}
            w={[200, 160, 220, 140][i]}
            h={5}
            c={i === 0 ? dark : bar}
            o={i === 0 ? 0.7 : 1}
          />
        </g>
      ))}
    </>
  ),
};
