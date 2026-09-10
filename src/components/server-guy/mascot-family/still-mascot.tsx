"use client";

import { useEffect, useState } from "react";

import type { Mood } from "./pose";
import type { FamilyId } from "./roster";
import { snapshots, type Framing } from "./stage";

import "./mascot-family.css";

/**
 * A pose rendered once by the shared offscreen renderer and shown as an
 * image, so no WebGL context stays alive for it.
 */
export function StillMascot({
  id,
  mood,
  width,
  height = width,
  framing = "icon",
  className = "",
}: {
  id: FamilyId;
  mood: Mood;
  width: number;
  height?: number;
  framing?: Framing;
  className?: string;
}) {
  const [shot, setShot] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    snapshots()
      .request({ id, mood, width, height, framing })
      .then((url) => {
        if (live && url) setShot(url);
      });
    return () => {
      live = false;
    };
  }, [id, mood, width, height, framing]);
  // A cached pose shows at once; otherwise the previous image stays until
  // the new one lands.
  const cached =
    typeof window === "undefined"
      ? null
      : snapshots().peek({ id, mood, width, height, framing });
  const src = cached ?? shot;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`mf-still ${className}`}
      src={src}
      width={width}
      height={height}
      alt=""
      draggable={false}
    />
  ) : (
    <span
      className={`mf-still mf-still--wait ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
