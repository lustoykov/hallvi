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
  // Amber, like stale: something to look at, not something broken.
  warning: "#c2691f",
  planned: "#8b95a5",
  unknown: "#8b95a5",
  absent: "#b9c2d0",
};

/** Short enough to read at thumbnail size. */
function thumbName(id: string, name: string) {
  if (id === "offsite") return "Off-site";
  return name.split("/").pop() ?? name;
}

/**
 * SVG text does not wrap and does not clip: it simply keeps going, out of its
 * box and across whatever is next to it. So a label that will not fit has to
 * be cut here, at the width the box actually has.
 *
 * The full name is one click away — the whole thumbnail is a button that
 * opens Architecture — which is what makes cutting it acceptable.
 */
function fit(text: string, boxWidth: number, fontSize = 23, inset = 54) {
  const room = boxWidth - inset;
  const budget = Math.max(3, Math.floor(room / (fontSize * 0.56)));
  return text.length <= budget ? text : `${text.slice(0, budget - 1)}…`;
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
  const services = model.parts.filter((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  // Drawing one service and saying nothing about the other two is the
  // thumbnail claiming a shape the records contradict — the same rule the
  // full map already follows.
  const stops = [
    "source",
    "controller",
    "app",
    ...services.map((service) => service.id),
    ...volumes.map((volume) => volume.id),
    "offsite",
  ].filter((id): id is string => Boolean(id));
  // A thumbnail shows the shape. Four long container names at a third of
  // their usual size is not a shape, it is a paragraph — so past two, the
  // data locations keep their tiles and their state dots and the shelf says
  // how many there are.
  const nameVolumes = volumes.length <= 2;
  const visit = layout.legs.visit.flat();
  const host = model.byId.host;
  const header = BOX.header.y + BOX.header.h;
  const server = layout.rects.server ?? BOX.server;
  const shelf = layout.rects.shelf ?? BOX.shelf;
  const privateZone = layout.rects.private ?? BOX.private;
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
      <svg
        viewBox={`0 ${MAP_TOP} ${MAP_W} ${layout.height}`}
        aria-hidden="true"
      >
        <rect
          className="axo-map-server"
          x={server.x}
          y={server.y}
          width={server.w}
          height={server.h}
          rx="26"
        />
        <line
          className="axo-map-rule"
          x1={server.x}
          x2={server.x + server.w}
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
            cx={server.x + 30}
            cy={BOX.header.y + 27}
            r="8"
            fill={tint[host?.evidence.certainty ?? "unknown"]}
          />
          <text
            className="axo-map-title"
            x={server.x + 50}
            y={BOX.header.y + 36}
          >
            {host?.name ?? "Your server"}
          </text>
        </g>
        {services.length > 0 && (
          <rect
            className="axo-map-private"
            x={privateZone.x}
            y={privateZone.y}
            width={privateZone.w}
            height={privateZone.h}
            rx="18"
          />
        )}
        {volumes.length > 0 && (
          <rect
            className="axo-map-shelf"
            x={shelf.x}
            y={shelf.y}
            width={shelf.w}
            height={shelf.h}
            rx="18"
          />
        )}
        <path
          className="axo-map-wall"
          d="M262 146V280M262 320V362M262 402V510"
        />
        {layout.wires.map((wire) => (
          <path
            key={wire.d}
            d={wire.d}
            className={`axo-map-wire j-${wire.journey}`}
          />
        ))}
        {!planned &&
          visit.map((d) => (
            <path key={`lit:${d}`} d={d} className="axo-map-lit" />
          ))}
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
              {(part.kind !== "volume" || nameVolumes) && (
                <text x={r.x + 42} y={r.y + r.h / 2 + 8}>
                  {fit(thumbName(id, part.name), r.w)}
                </text>
              )}
            </g>
          );
        })}
        {!nameVolumes && (
          <text
            className="axo-map-count"
            x={shelf.x + shelf.w - 20}
            y={shelf.y + 22}
            textAnchor="end"
          >
            {volumes.length} data locations
          </text>
        )}
        {model.gaps.some((gap) => gap.id === "monitoring") && (
          <g data-part="gap:monitoring" className="axo-map-ghost">
            <rect
              x={BOX.watch.x}
              y={BOX.watch.y}
              width={BOX.watch.w}
              height={BOX.watch.h}
              rx="14"
            />
            <text x={BOX.watch.x + 22} y={BOX.watch.y + BOX.watch.h / 2 + 8}>
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
