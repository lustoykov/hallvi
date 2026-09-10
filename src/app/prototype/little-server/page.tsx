"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Little Server in every mood, to review the antennas (after Ping) and the
// redesigned wrench. Route: /prototype/little-server

import { useState } from "react";

import {
  MascotScene,
  type MascotMood,
} from "../../../components/server-guy/home/mascot-scene";

const moods: { mood: MascotMood; note: string }[] = [
  { mood: "ready", note: "Antennas sway a little" },
  { mood: "checking", note: "One antenna listens" },
  { mood: "working", note: "Wrench held up and out" },
  { mood: "attention", note: "Antennas stiffen, amber tips" },
  { mood: "celebrating", note: "Antennas wiggle" },
  { mood: "waving", note: "A hello" },
  { mood: "resting", note: "Antennas droop, tips dim" },
  { mood: "dancing", note: "Antennas flop with the beat" },
];

export default function LittleServerPage() {
  const [gesture, setGesture] = useState(0);
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 28px",
        background: "#f7f8fa",
        color: "#202838",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}
    >
      <style>{`
        .ls-card .mascot-scene { position: relative; width: 100%; height: 100%; }
        .ls-card .mascot-scene canvas { display: block; width: 100% !important; height: 100% !important; }
        .ls-card .mascot-fallback { display: none; }
      `}</style>
      <header style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>Little Server</strong>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#fff8f0",
            border: "1px solid #f0dcc4",
            color: "#9a4b10",
          }}
        >
          Prototype
        </span>
        <span style={{ fontSize: 13, color: "#5b6477" }}>
          Two antennas after Ping, and a clearer wrench.
        </span>
        <button
          type="button"
          onClick={() => setGesture((value) => value + 1)}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #d8dee8",
            background: "#fff",
            font: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Play the gestures again
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
          <figure
            key={mood}
            className="ls-card"
            style={{
              margin: 0,
              padding: "10px 10px 14px",
              borderRadius: 16,
              border: "1px solid #e7e9ee",
              background: "#fff",
            }}
          >
            <div style={{ height: 230 }}>
              <MascotScene
                color={3}
                mood={mood}
                gesture={gesture}
                danceRequest={mood === "dancing" ? gesture + 1 : 0}
              />
            </div>
            <figcaption style={{ padding: "6px 6px 0", fontSize: 13 }}>
              <b style={{ fontWeight: 600 }}>{mood}</b>
              <span style={{ color: "#5b6477" }}> · {note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
