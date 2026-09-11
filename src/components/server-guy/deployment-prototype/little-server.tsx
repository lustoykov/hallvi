"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Little Server, sized by the element around him, for the pages that only
// need him present: no speech, no clicks. Still with reduced motion.

import dynamic from "next/dynamic";

import type { MascotMood } from "../home/mascot-scene";
import { useReducedMotion } from "../architecture-prototype/motion";
import "./little-server.css";

const Scene = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

export function LittleServer({
  mood,
  gesture = 0,
  className,
}: {
  mood: MascotMood;
  gesture?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`axls${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <Scene color={3} mood={mood} gesture={gesture} paused={reduced} />
    </div>
  );
}
