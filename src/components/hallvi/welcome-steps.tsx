// What Hallvi does, in three drawings, for someone who has never used it.
//
// Drawn rather than described because the person reading has a repository in
// their clipboard and thirty seconds of patience: read it, choose where it
// runs, open it. Each picture is decorative and says nothing the sentence
// beside it does not; the sentences are the content.

import s from "./welcome.module.css";

const line = "#c3cddd";
const soft = "#eef2f9";
const blue = "#285ad8";
const blueSoft = "#e6edfc";
const green = "#14945f";
const greenSoft = "#e4f5ec";
const ink = "#3e4a60";

/** A repository being read: what it is made of, found rather than asked. */
function Reads() {
  return (
    <svg viewBox="0 0 220 124" aria-hidden="true">
      <rect
        x="14"
        y="14"
        width="112"
        height="96"
        rx="9"
        fill="#fff"
        stroke={line}
      />
      <rect x="14" y="14" width="112" height="20" rx="9" fill={soft} />
      <circle cx="26" cy="24" r="3" fill={line} />
      <rect x="34" y="21" width="46" height="6" rx="3" fill={line} />
      {[44, 56, 68, 80, 92].map((y, index) => (
        <rect
          key={y}
          className={s.codeLine}
          style={{ animationDelay: `${index * 180}ms` }}
          x={26 + (index % 2) * 10}
          y={y}
          width={[64, 48, 72, 40, 56][index]}
          height="5"
          rx="2.5"
          fill={index === 2 ? blue : line}
        />
      ))}
      <g className={s.lens}>
        <circle
          cx="112"
          cy="74"
          r="17"
          fill={blueSoft}
          fillOpacity="0.7"
          stroke={blue}
          strokeWidth="2.5"
        />
        <path
          d="M124 87l12 13"
          stroke={blue}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      {[
        ["1 container", 30],
        ["a small disk", 58],
        ["port 3001", 86],
      ].map(([label, y]) => (
        <g key={label}>
          <rect
            x="146"
            y={y as number}
            width="64"
            height="20"
            rx="10"
            fill={greenSoft}
          />
          <circle cx="157" cy={(y as number) + 10} r="3" fill={green} />
          <text x="165" y={(y as number) + 13.5} fontSize="8.5" fill={ink}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Two places it can run, side by side, and Hallvi signing in to either. */
function Places() {
  return (
    <svg viewBox="0 0 220 124" aria-hidden="true">
      <path
        d="M110 30v16M110 46H58v14M110 46h52v14"
        stroke={line}
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="3 3"
      />
      <rect x="96" y="8" width="28" height="24" rx="7" fill="#2f3a4d" />
      <text
        x="110"
        y="24.5"
        fontSize="11"
        fontWeight="700"
        fill="#fff"
        textAnchor="middle"
      >
        H
      </text>
      <rect
        x="14"
        y="60"
        width="88"
        height="54"
        rx="9"
        fill="#fff"
        stroke={blue}
        strokeWidth="1.5"
      />
      {[70, 84].map((y) => (
        <g key={y}>
          <rect x="30" y={y} width="56" height="10" rx="3" fill={blueSoft} />
          <circle className={s.blink} cx="37" cy={y + 5} r="2" fill={blue} />
          <rect
            x="44"
            y={y + 3.5}
            width="22"
            height="3"
            rx="1.5"
            fill="#b9c8ee"
          />
        </g>
      ))}
      <text x="58" y="107" fontSize="8.5" fill={ink} textAnchor="middle">
        a rented server
      </text>
      <rect
        x="118"
        y="60"
        width="88"
        height="54"
        rx="9"
        fill="#fff"
        stroke={line}
      />
      <rect
        x="142"
        y="68"
        width="40"
        height="24"
        rx="3"
        fill={soft}
        stroke={line}
      />
      <path
        d="M136 96h52"
        stroke={line}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="162" cy="80" r="2" fill={green} />
      <text x="162" y="107" fontSize="8.5" fill={ink} textAnchor="middle">
        a machine you have
      </text>
    </svg>
  );
}

/** Who can open it: this computer, then the address, then your own name. */
function Opens() {
  return (
    <svg viewBox="0 0 220 124" aria-hidden="true">
      <path
        d="M28 96V72h62V46h62V28"
        stroke={line}
        strokeWidth="1.5"
        fill="none"
      />
      {[
        { x: 28, y: 96, label: "this computer", on: true },
        { x: 90, y: 72, label: "a public address", on: false },
        { x: 152, y: 46, label: "your domain", on: false },
      ].map((rung, index) => (
        <g
          key={rung.label}
          className={s.rung}
          style={{ animationDelay: `${index * 500}ms` }}
        >
          <circle
            cx={rung.x}
            cy={rung.y}
            r="9"
            fill={rung.on ? greenSoft : "#fff"}
            stroke={rung.on ? green : line}
            strokeWidth="1.5"
          />
          {rung.on && (
            <path
              d={`M${rung.x - 4} ${rung.y}l3 3 5-6`}
              stroke={green}
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <text x={rung.x + 14} y={rung.y + 17} fontSize="8.5" fill={ink}>
            {rung.label}
          </text>
        </g>
      ))}
      <rect x="112" y="10" width="98" height="18" rx="9" fill={blueSoft} />
      <path d="M123 17.5a2.5 2.5 0 015 0v2h-5z M122 19.5h7v5h-7z" fill={blue} />
      <text x="134" y="22.5" fontSize="8.5" fill={blue} fontWeight="600">
        app.example.com
      </text>
    </svg>
  );
}

export function WelcomeSteps() {
  return (
    <ol className={s.steps} aria-label="How Hallvi works">
      <li>
        <Reads />
        <strong>I read the repository</strong>
        <p>
          Its Dockerfile, compose file and README tell me what it needs: which
          services, what data to keep, how much server. You are not asked to
          fill that in.
        </p>
      </li>
      <li>
        <Places />
        <strong>You choose where it runs</strong>
        <p>
          A small server I rent for you at Hetzner, billed by the hour, or a
          machine you already have. Either way I walk you through the access I
          need, and say exactly what it lets me do.
        </p>
      </li>
      <li>
        <Opens />
        <strong>You open it, working</strong>
        <p>
          First privately, on this computer, so you can look before anyone else
          can. A public address or your own domain is one step further, when you
          want it.
        </p>
      </li>
    </ol>
  );
}
