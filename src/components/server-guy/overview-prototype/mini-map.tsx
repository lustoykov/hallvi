"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// The Architecture map as a thumbnail, for Overview: the same shape and the
// same honest states, with light flowing along the way a visit takes. Quiet
// while all is well. When something is wrong its part pings, and whatever
// you point at under "needs you" lights up here. Clicking a part opens
// Architecture with that part's details already open.

import { ArrowRight } from "@phosphor-icons/react";
import { useMemo } from "react";

import {
  BOX,
  layoutFor,
  MAP_H,
  MAP_TOP,
  MAP_W,
} from "../architecture-prototype/journey-v2";
import type {
  ArchitectureModel,
  Certainty,
} from "../architecture-prototype/model";

const tint: Record<Certainty, string> = {
  verified: "#14945f",
  stale: "#c2691f",
  failed: "#a6312b",
  planned: "#8b95a5",
  unknown: "#8b95a5",
  absent: "#b9c2d0",
};

/** Short enough to read at thumbnail size. */
function thumbName(id: string, name: string) {
  if (id === "offsite") return "Off-site";
  return name.split("/").pop() ?? name;
}

export function MiniMap({
  model,
  reduced,
  highlight,
  onOpen,
}: {
  model: ArchitectureModel;
  reduced: boolean;
  /** A part to light up, from what you point at elsewhere on the page. */
  highlight?: string | null;
  /** Opens Architecture, with a part's details open when one was clicked. */
  onOpen: (partId?: string) => void;
}) {
  const layout = useMemo(() => layoutFor(model), [model]);
  const planned = model.status !== "live";
  const service = model.parts.find((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const stops = [
    "source",
    "controller",
    "app",
    service?.id,
    ...volumes.map((volume) => volume.id),
    "offsite",
  ].filter((id): id is string => Boolean(id));
  const visit = layout.legs.visit.flat();
  const host = model.byId.host;
  const header = BOX.header.y + BOX.header.h;
  return (
    <button
      type="button"
      className={`axo-map${planned ? " is-planned" : ""}`}
      data-host={host?.evidence.certainty}
      onClick={(event) => {
        const part = (event.target as Element)
          .closest("[data-part]")
          ?.getAttribute("data-part");
        onOpen(part ?? undefined);
      }}
    >
      <svg viewBox={`0 ${MAP_TOP} ${MAP_W} ${MAP_H}`} aria-hidden="true">
        <rect
          className="axo-map-server"
          x={BOX.server.x}
          y={BOX.server.y}
          width={BOX.server.w}
          height={BOX.server.h}
          rx="26"
        />
        <line
          className="axo-map-rule"
          x1={BOX.server.x}
          x2={BOX.server.x + BOX.server.w}
          y1={header}
          y2={header}
        />
        <g data-part="host" className="axo-map-head">
          <rect
            x={BOX.header.x}
            y={BOX.header.y}
            width={BOX.header.w}
            height={BOX.header.h}
            fill="transparent"
          />
          <circle
            cx={BOX.server.x + 30}
            cy={BOX.header.y + 27}
            r="8"
            fill={tint[host?.evidence.certainty ?? "unknown"]}
          />
          <text className="axo-map-title" x={BOX.server.x + 50} y={BOX.header.y + 36}>
            {host?.name ?? "Your server"}
          </text>
        </g>
        {service && (
          <rect
            className="axo-map-private"
            x={BOX.private.x}
            y={BOX.private.y}
            width={BOX.private.w}
            height={BOX.private.h}
            rx="18"
          />
        )}
        {volumes.length > 0 && (
          <rect
            className="axo-map-shelf"
            x={BOX.shelf.x}
            y={BOX.shelf.y}
            width={BOX.shelf.w}
            height={BOX.shelf.h}
            rx="18"
          />
        )}
        <path className="axo-map-wall" d="M262 146V280M262 320V362M262 402V510" />
        {layout.wires.map((wire) => (
          <path key={wire.d} d={wire.d} className={`axo-map-wire j-${wire.journey}`} />
        ))}
        {!planned &&
          visit.map((d) => <path key={`lit:${d}`} d={d} className="axo-map-lit" />)}
        {!planned &&
          !reduced &&
          visit.map((d, i) => (
            <circle key={`dot:${d}`} r="6" className="axo-map-dot">
              <animateMotion
                dur="2.8s"
                begin={`${i * 0.5}s`}
                repeatCount="indefinite"
                path={d}
              />
            </circle>
          ))}
        {(["gate:http", "gate:ssh"] as const).map((id) => {
          const r = layout.rects[id];
          if (!r || !model.byId[id]) return null;
          return (
            <g key={id} data-part={id} className="axo-map-door">
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} textAnchor="middle">
                {id === "gate:http" ? "80" : "22"}
              </text>
            </g>
          );
        })}
        {stops.map((id) => {
          const part = model.byId[id];
          const r = layout.rects[id];
          if (!part || !r) return null;
          const failed = part.evidence.certainty === "failed";
          return (
            <g
              key={id}
              data-part={id}
              data-c={part.evidence.certainty}
              className={`axo-map-card${part.checking ? " is-checking" : ""}${highlight === id ? " is-highlight" : ""}`}
            >
              {failed && (
                <rect
                  className={`axo-map-halo${reduced ? " is-still" : ""}`}
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  rx="14"
                />
              )}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="14" />
              <circle
                cx={r.x + 24}
                cy={r.y + r.h / 2}
                r="8"
                fill={part.quiet ? "#3e4a60" : tint[part.evidence.certainty]}
              />
              <text x={r.x + 42} y={r.y + r.h / 2 + 8}>
                {thumbName(id, part.name)}
              </text>
            </g>
          );
        })}
        {model.gaps.some((gap) => gap.id === "monitoring") && (
          <g data-part="gap:monitoring" className="axo-map-ghost">
            <rect x={924} y={96} width={176} height={72} rx="14" />
            <text x={946} y={140}>
              Monitoring
            </text>
          </g>
        )}
      </svg>
      <span className="axo-map-open">
        Open Architecture <ArrowRight weight="bold" />
      </span>
    </button>
  );
}
