"use client";

// Requests, drawn as they arrive.
//
// A lane is a bundle of hairlines fanning out of the application toward one
// group of paths, as wide as that group's share of the last few minutes. A
// request is a short streak of light along one thread, started by a real
// line in the access log and by nothing else: when nobody asks for anything,
// nothing moves. A request the application failed runs out part way along
// its thread and leaves one small ring.

import { useEffect, useMemo, useRef } from "react";

import type { Lane, Traffic } from "./use-traffic";

const W = 1100;
const H = 500;
const MID = H / 2;
const FROM = 250;
const TO = 900;
const STEPS = 140;
const BLUE = "40, 90, 216";
const RED = "200, 55, 47";

type Point = readonly [number, number];

function thread(yFrom: number, yTo: number): Point[] {
  const c = [FROM, yFrom, FROM + 210, yFrom, TO - 260, yTo, TO, yTo];
  return Array.from({ length: STEPS + 1 }, (_, index) => {
    const t = index / STEPS;
    const u = 1 - t;
    const mix = (a: number, b: number, d: number, e: number) =>
      u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * e;
    return [mix(c[0], c[2], c[4], c[6]), mix(c[1], c[3], c[5], c[7])] as const;
  });
}

interface Drawn {
  lane: Lane;
  share: number;
  y: number;
  threads: Point[][];
}

/** Lanes down the right edge, each with room in proportion to its share. */
function layout(lanes: Lane[]): Drawn[] {
  const total = lanes.reduce((sum, lane) => sum + lane.requests, 0) || 1;
  // A lane that exists is visible, however small its share.
  const shares = lanes.map((lane) => Math.max(lane.requests / total, 0.1));
  const scale = shares.reduce((a, b) => a + b, 0);
  const counts = shares.map((share) => Math.round(3 + (share / scale) * 18));
  const threads = counts.reduce((a, b) => a + b, 0);
  let cursor = 50;
  let leaving = 0;
  return lanes.map((lane, index) => {
    const share = shares[index] / scale;
    const room = share * (H - 100);
    const y = cursor + room / 2;
    cursor += room;
    const band = Math.min(8 + share * 90, room - 10);
    const n = counts[index];
    return {
      lane,
      share,
      y,
      threads: Array.from({ length: n }, (_, k) =>
        thread(
          MID + (leaving++ - (threads - 1) / 2) * 1.9,
          y + (n > 1 ? k / (n - 1) - 0.5 : 0) * band,
        ),
      ),
    };
  });
}

interface Streak {
  lane: string;
  thread: number;
  t: number;
  speed: number;
  failed: boolean;
}

export function RequestFlow({
  traffic,
  name,
}: {
  traffic: Traffic;
  name: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Geometry follows which lanes exist and roughly how big they are, not
  // every single request, so the picture does not shiver.
  const key = traffic.lanes
    .map((lane) => `${lane.name}:${Math.round(Math.log2(lane.requests + 1))}`)
    .join("|");
  const drawn = useMemo(
    () => layout(traffic.lanes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const live = useRef(drawn);
  useEffect(() => {
    live.current = drawn;
  }, [drawn]);
  const { onArrival } = traffic;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ratio = window.devicePixelRatio || 1;
    element.width = W * ratio;
    element.height = H * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    let streaks: Streak[] = [];
    const rings: { x: number; y: number; age: number }[] = [];
    const stop = onArrival((line, lane) => {
      if (still || streaks.length > 160) return;
      const target = live.current.find((item) => item.lane.name === lane);
      if (!target) return;
      streaks.push({
        lane,
        thread: Math.floor(Math.random() * target.threads.length),
        t: 0,
        speed: 0.006 + Math.random() * 0.003,
        failed: line.status >= 500,
      });
    });

    let frame = 0;
    const draw = () => {
      context.clearRect(0, 0, W, H);
      for (const item of live.current) {
        const failing = item.lane.failed > 0;
        context.strokeStyle = `rgba(${failing ? RED : BLUE}, ${failing ? 0.24 : 0.18})`;
        context.lineWidth = 0.8;
        for (const points of item.threads) {
          context.beginPath();
          points.forEach(([x, y], index) =>
            index ? context.lineTo(x, y) : context.moveTo(x, y),
          );
          context.stroke();
        }
      }
      streaks = streaks.filter((streak) => streak.t < 1);
      for (const streak of streaks) {
        const item = live.current.find((one) => one.lane.name === streak.lane);
        const points =
          item?.threads[streak.thread % (item.threads.length || 1)];
        streak.t += streak.speed;
        if (!points) continue;
        const life = streak.failed
          ? Math.max(1 - (streak.t - 0.4) / 0.3, 0)
          : 1;
        const head = Math.floor(Math.min(streak.t, 1) * STEPS);
        const tint = streak.failed ? RED : BLUE;
        for (let k = 0; k < 18; k++) {
          const i = head - k;
          if (i < 1) break;
          const fade = (1 - k / 18) ** 2;
          context.strokeStyle = `rgba(${tint}, ${0.85 * fade * life})`;
          context.lineWidth = 0.6 + 1.1 * fade;
          context.beginPath();
          context.moveTo(points[i - 1][0], points[i - 1][1]);
          context.lineTo(points[i][0], points[i][1]);
          context.stroke();
        }
        if (streak.failed && life === 0) {
          rings.push({ x: points[head][0], y: points[head][1], age: 0 });
          streak.t = 1;
        }
      }
      for (const ring of rings) {
        ring.age++;
        context.strokeStyle = `rgba(${RED}, ${Math.max(1 - ring.age / 44, 0) * 0.8})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(ring.x, ring.y, 2 + ring.age * 0.28, 0, Math.PI * 2);
        context.stroke();
      }
      while (rings.length && rings[0].age > 44) rings.shift();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
    // `onArrival` is stable for the life of the hook that made it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ovl-flow" role="img" aria-label="Requests by path">
      <canvas ref={canvas} />
      <p className="ovl-flow-app" data-failing={traffic.failed > 0}>
        <i />
        {name}
      </p>
      {drawn.map((item) => (
        <p
          key={item.lane.name}
          className="ovl-flow-end"
          data-failing={item.lane.failed > 0}
          style={{ top: `${(item.y / H) * 100}%` }}
        >
          <b>{item.lane.name}</b>
          <span>
            {item.lane.failed > 0
              ? `${item.lane.failed} of ${item.lane.requests} failed`
              : item.lane.requests.toLocaleString("en-US")}
          </span>
        </p>
      ))}
    </div>
  );
}
