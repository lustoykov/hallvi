// Little Server, flat and small enough to sit in a line of text: the same
// body, navy face, antennas and wrench as the 3D one on the applications
// home, drawn from the front. While Hallvi works he rises from behind the end
// of the live line every so often, tightens something, and goes. His slot is
// always there, so the words never move. All motion is in the stylesheet.

import "./working-mascot.css";

export function WorkingMascot() {
  return (
    <span className="hv-wm-peek" aria-hidden="true">
      <svg className="hv-wm" width="30" height="27" viewBox="0 0 40 36">
        <g className="hv-wm-body">
          {[13, 23].map((x, index) => (
            <g className="hv-wm-antenna" data-side={index} key={x}>
              <path d={`M${x} 9V3.5`} stroke="#3e4a60" strokeWidth="1.4" />
              <circle className="hv-wm-tip" cx={x} cy="2.6" r="1.9" />
            </g>
          ))}
          <rect x="5" y="8" width="26" height="24" rx="5.5" fill="#7a8bd6" />
          <rect x="7.5" y="11" width="21" height="11" rx="3.5" fill="#192338" />
          <g className="hv-wm-eyes" fill="#edf3ff">
            <rect x="13" y="14" width="2.2" height="4.4" rx="1.1" />
            <rect x="20.8" y="14" width="2.2" height="4.4" rx="1.1" />
          </g>
          <path
            d="M16 19.6q2 1.5 4 0"
            stroke="#d6e5ff"
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M12 26v3M15 26v3M18 26v3M21 26v3M24 26v3"
            stroke="#5b6bb5"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path d="M9 32h7v2.5H9zM20 32h7v2.5h-7z" fill="#3e4a60" />
          {/* The wrench arm: shoulder at the body's right edge. */}
          <g className="hv-wm-arm">
            <path
              d="M30 22l4.5-5"
              stroke="#d6e0f0"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <g className="hv-wm-wrench" stroke="#3e4a60" fill="none">
              <path
                d="M34.5 17l2.2-6"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M35 10.6a2.4 2.4 0 1 1 3.6 1.3"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
