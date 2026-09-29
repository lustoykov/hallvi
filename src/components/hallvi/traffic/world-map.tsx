"use client";

// A light dotted world map, where visits land as soft dots.
//
// The land is a grid of pale dots (Natural Earth, public domain; see
// scripts/generate-world-map.mts). The countries visitors came from in the
// last day rest on it as soft blue dots, sized by their share, and a visit
// that arrives while the page is open lands on its country, ripples once
// and settles. Only the country is known, so a visit lands where the country
// is labelled and never pretends to a city.
//
// "tint" colours the land dots of each country by its share instead, a
// dotted choropleth; arrivals brighten their country for a moment.

import { useEffect, useMemo, useRef, useState } from "react";

import type { Ranked } from "@/server/traffic/contract";

import type { SeenLine } from "../overview-live/use-traffic";
import { countryName } from "./model";
import { worldMap } from "./map-grid";

export type MapLook = "dots" | "tint";

interface Landing {
  id: number;
  x: number;
  y: number;
  country: string;
}

/** Many dots as one path: each a zero-length line with a round cap. */
const dotted = (points: { x: number; y: number }[]) =>
  points
    .map((point) => `M${point.x.toFixed(2)} ${point.y.toFixed(2)}h0`)
    .join("");

/** How strongly a country reads: a share, softened so small ones show. */
const weight = (share: number) => Math.sqrt(Math.min(1, Math.max(0, share)));

/** The countries a map can place, and the largest of them. */
function placed(countries: Ranked[]) {
  const map = worldMap();
  const known = countries.filter(
    (country) => country.count > 0 && map.places.has(country.key),
  );
  return { known, top: Math.max(1, ...known.map((country) => country.count)) };
}

// The land never changes, so it is drawn into a path once.
let land: string | null = null;
const landPath = () => (land ??= dotted(worldMap().dots));

/** The tint look: each country's dots in one of four strengths. */
function tintOf(countries: Ranked[]) {
  const { known, top } = placed(countries);
  const level = new Map<string, number>();
  for (const country of known)
    level.set(
      country.key,
      Math.min(3, Math.floor(weight(country.count / top) * 4)),
    );
  return [0, 1, 2, 3].map((strength) =>
    dotted(
      worldMap().dots.filter(
        (dot) => dot.country !== null && level.get(dot.country) === strength,
      ),
    ),
  );
}

export function WorldMap({
  countries,
  look = "dots",
  onArrival,
  focus = null,
  label,
}: {
  /** The last day's countries, by views. */
  countries: Ranked[];
  look?: MapLook;
  /** Subscribes to visits as they happen; absent draws a still map. */
  onArrival?: (listener: (line: SeenLine) => void) => () => void;
  /** A country to pick out, when a list beside the map is hovered. */
  focus?: string | null;
  label: string;
}) {
  const map = worldMap();
  const [landings, setLandings] = useState<Landing[]>([]);
  // Countries brightened by a visit a moment ago, in the tint look.
  const [lit, setLit] = useState<Landing[]>([]);
  const counter = useRef(0);

  const { known, top } = placed(countries);
  const tinted = useMemo(
    () => (look === "tint" ? tintOf(countries) : []),
    [look, countries],
  );

  useEffect(() => {
    if (!onArrival) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = new Set<number>();
    const stop = onArrival((line) => {
      const place = line.country
        ? worldMap().places.get(line.country)
        : undefined;
      if (!place || line.kind !== "view") return;
      const id = counter.current++;
      // Near the label point, not on it: two visits from one country are
      // two dots, and neither claims to know a city.
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * 1.1;
      const landing = {
        id,
        x: place.x + Math.cos(angle) * reach,
        y: place.y + Math.sin(angle) * reach * 0.8,
        country: line.country!,
      };
      setLandings((current) => [...current.slice(-24), landing]);
      setLit((current) => [...current, landing]);
      const without = (current: Landing[]) =>
        current.filter((one) => one.id !== id);
      timers.add(window.setTimeout(() => setLit(without), 2_400));
      timers.add(
        window.setTimeout(() => setLandings(without), still ? 4_000 : 7_000),
      );
    });
    return () => {
      stop();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [onArrival]);

  const recentlyLit = [...new Set(lit.map((one) => one.country))];

  return (
    <svg
      className="tf-map"
      data-look={look}
      viewBox={`-1 -1 ${map.width + 2} ${map.height + 2}`}
      role="img"
      aria-label={label}
    >
      <path className="tf-map-land" d={landPath()} />
      {tinted.map((path, strength) =>
        path ? (
          <path
            key={strength}
            className="tf-map-tint"
            data-strength={strength}
            d={path}
          />
        ) : null,
      )}
      {look === "tint" &&
        recentlyLit.map((code) => (
          <path
            key={`lit-${code}`}
            className="tf-map-lit"
            d={dotted(map.dots.filter((dot) => dot.country === code))}
          />
        ))}
      {look === "dots" &&
        known.map((country) => {
          const place = map.places.get(country.key)!;
          const share = weight(country.count / top);
          return (
            <circle
              key={country.key}
              className="tf-map-country"
              data-focus={focus === country.key || undefined}
              cx={place.x}
              cy={place.y}
              r={0.55 + share * 1.35}
            >
              <title>{`${countryName(country.key)}: ${country.count.toLocaleString("en-US")} views`}</title>
            </circle>
          );
        })}
      {look === "tint" && focus && map.places.has(focus) && (
        <circle
          className="tf-map-focus"
          cx={map.places.get(focus)!.x}
          cy={map.places.get(focus)!.y}
          r={1.6}
        />
      )}
      {landings.map((landing) => (
        <g
          key={landing.id}
          className="tf-map-landing"
          transform={`translate(${landing.x.toFixed(2)} ${landing.y.toFixed(2)})`}
        >
          <circle className="tf-map-ripple" r={1} />
          <circle className="tf-map-dot" r={0.62} />
        </g>
      ))}
    </svg>
  );
}
