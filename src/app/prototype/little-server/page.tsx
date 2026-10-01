"use client";

// Little Server in every mood, which no record produces: the flat drawing at
// the sizes the product uses, in an application's colours, and dancing.
// Route: /prototype/little-server

import { useState } from "react";

import { APPLICATION_COLORS } from "../../../components/hallvi/home/application-kind";
import {
  Mascot,
  type MascotDance,
  type MascotMood,
} from "../../../components/hallvi/mascot";
import { WorkingMascot } from "../../../components/hallvi/working-mascot";

const moods: { mood: MascotMood; note: string }[] = [
  { mood: "ready", note: "A mug and a smile" },
  { mood: "waving", note: "The drawing on hallvi.com" },
  { mood: "checking", note: "A clipboard, one antenna listens" },
  { mood: "working", note: "A wrench, held up" },
  { mood: "attention", note: "A magnifier, amber tips" },
  { mood: "pointing", note: "Reaches out, taps down toward the log" },
  { mood: "resting", note: "Antennas droop, tips dim" },
];
const dances: MascotDance[] = [
  "shuffle",
  "robot",
  "floss",
  "cartwheel",
  "backflip",
];

const card = {
  margin: 0,
  padding: "10px 10px 14px",
  borderRadius: 16,
  border: "1px solid #e7e9ee",
  background: "#fff",
} as const;
const button = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid #d8dee8",
  background: "#fff",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
} as const;

export default function LittleServerPage() {
  const [gesture, setGesture] = useState(0);
  const [paused, setPaused] = useState(false);
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 28px 60px",
        background: "#f7f8fa",
        color: "#202838",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <header style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>Little Server</strong>
        <span style={{ fontSize: 13, color: "#5b6477" }}>
          The flat drawing from hallvi.com, in every mood.
        </span>
        <button
          type="button"
          onClick={() => setGesture((value) => value + 1)}
          style={{ ...button, marginLeft: "auto" }}
        >
          Play the gestures again
        </button>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          style={button}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {moods.map(({ mood, note }) => (
          <figure key={mood} style={card}>
            <div style={{ height: 230 }}>
              <Mascot mood={mood} gesture={gesture} paused={paused} />
            </div>
            <figcaption style={{ padding: "6px 6px 0", fontSize: 13 }}>
              <b style={{ fontWeight: 600 }}>{mood}</b>
              <span style={{ color: "#5b6477" }}> · {note}</span>
            </figcaption>
          </figure>
        ))}
        {dances.map((dance) => (
          <figure key={dance} style={card}>
            <div style={{ height: 230 }}>
              <Mascot
                dance={dance}
                danceRequest={gesture + 1}
                paused={paused}
              />
            </div>
            <figcaption style={{ padding: "6px 6px 0", fontSize: 13 }}>
              <b style={{ fontWeight: 600 }}>{dance}</b>
              <span style={{ color: "#5b6477" }}> · a dance</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <h2 style={{ margin: "28px 0 10px", fontSize: 15 }}>
        At the product&apos;s sizes
      </h2>
      <div
        style={{ ...card, display: "flex", alignItems: "flex-end", gap: 22 }}
      >
        {[230, 160, 128, 84, 56, 46].flatMap((size) =>
          (["waving", "attention"] as const).map((mood) => (
            <div key={`${size}${mood}`} style={{ width: size, height: size }}>
              <Mascot mood={mood} gesture={gesture} paused={paused} />
            </div>
          )),
        )}
      </div>
      <h2 style={{ margin: "28px 0 10px", fontSize: 15 }}>
        In an application&apos;s colours
      </h2>
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 14 }}>
        {APPLICATION_COLORS.map((color, index) => (
          <div
            key={color}
            style={{
              width: 128,
              height: 144,
              borderRadius: 12,
              background: `color-mix(in srgb, ${color} 23%, white)`,
            }}
          >
            <Mascot
              color={color}
              mood={moods[index % moods.length]!.mood}
              gesture={gesture}
              paused={paused}
            />
          </div>
        ))}
      </div>
      <h2 style={{ margin: "28px 0 10px", fontSize: 15 }}>
        Small: the working line, and the browser tab
      </h2>
      {/* He only rises while Hallvi works; here he stands still. */}
      <style>{`
        .ls-small .hv-wm-peek { overflow: visible; margin: 0; }
        .ls-small .hv-wm-peek, .ls-small .hv-wm { animation: none; }
        .ls-small .hv-wm-peek { width: auto; height: auto; }
      `}</style>
      <div
        className="ls-small"
        style={{ ...card, display: "flex", alignItems: "flex-end", gap: 28 }}
      >
        <WorkingMascot />
        <span style={{ zoom: 4 }}>
          <WorkingMascot />
        </span>
        {[16, 32, 96].map((size) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={size} src="/icon.svg" alt="" width={size} height={size} />
        ))}
      </div>
    </main>
  );
}
