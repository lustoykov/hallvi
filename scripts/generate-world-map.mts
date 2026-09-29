// Builds the dotted world map the Traffic page draws.
//
// Usage: node --import tsx scripts/generate-world-map.mts
//
// Source: Natural Earth 1:50m Cultural Vectors, Admin 0 – Countries
// (https://www.naturalearthdata.com/, via the nvkelso/natural-earth-vector
// repository). Natural Earth is in the public domain: "No permission is
// needed to use Natural Earth." The file is downloaded once into
// work/natural-earth/, which is never committed.
//
// What it writes, `src/components/hallvi/traffic/world-map-data.ts`, is the
// land sampled into the grid `traffic/projection.ts` describes: one bit per
// cell, the country each land cell belongs to, and each country's label
// point, where a visit from it lands. A few kilobytes; no shapes, so the page
// never draws a border it would have to take a side on.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  MAP_COLUMNS,
  MAP_ROWS,
  ROW_HEIGHT,
  cellCentre,
  toMap,
} from "../src/components/hallvi/traffic/projection";

const SOURCE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const cache = resolve("work/natural-earth");
const file = join(cache, "ne_50m_admin_0_countries.geojson");
const out = resolve("src/components/hallvi/traffic/world-map-data.ts");

type Ring = [number, number][];
interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

// Natural Earth leaves a code out where the status is disputed. A visitor's
// address resolves to the country that answers for it in practice, so the
// land goes with that one; Siachen answers to nobody and stays unowned land.
const DISPUTED: Record<string, string | null> = {
  Somaliland: "SO",
  "N. Cyprus": "CY",
  "Siachen Glacier": null,
};

async function source() {
  if (!existsSync(file)) {
    mkdirSync(cache, { recursive: true });
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
    writeFileSync(file, await response.text());
  }
  return JSON.parse(readFileSync(file, "utf8")) as { features: Feature[] };
}

function codeOf(feature: Feature) {
  const name = String(feature.properties.NAME);
  if (name in DISPUTED) return DISPUTED[name];
  const code = String(feature.properties.ISO_A2_EH);
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Rings in map coordinates, with a bounding box to skip most tests. */
function shapesOf(feature: Feature) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Ring[]]
      : (feature.geometry.coordinates as Ring[][]);
  return polygons.map((rings) => {
    const projected = rings.map((ring) =>
      ring.map(([lon, lat]) => {
        const point = toMap(lon, lat);
        return [point.x, point.y] as [number, number];
      }),
    );
    const xs = projected[0].map((point) => point[0]);
    const ys = projected[0].map((point) => point[1]);
    return {
      rings: projected,
      box: [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ] as const,
      area: Math.abs(
        projected[0].reduce(
          (sum, [x, y], index, ring) =>
            sum +
            x * ring[(index + 1) % ring.length][1] -
            ring[(index + 1) % ring.length][0] * y,
          0,
        ) / 2,
      ),
    };
  });
}

function inside(rings: Ring[], x: number, y: number) {
  let hit = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        hit = !hit;
    }
  return hit;
}

const { features } = await source();
const countries = features.map((feature) => ({
  code: codeOf(feature),
  label: toMap(
    Number(feature.properties.LABEL_X),
    Number(feature.properties.LABEL_Y),
  ),
  shapes: shapesOf(feature),
}));

/** The country whose land holds a point, or undefined for sea. */
function ownerAt(x: number, y: number) {
  for (const country of countries)
    for (const shape of country.shapes) {
      const [x0, y0, x1, y1] = shape.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (inside(shape.rings, x, y)) return country.code;
    }
  return undefined;
}

// Five samples a cell: its centre and four around it. Land is a cell at
// least two of them fall on, so a coast keeps its thin peninsulas and
// islands without every shore growing a row.
const SAMPLES = [
  [0, 0],
  [-0.3, -0.3 * ROW_HEIGHT],
  [0.3, -0.3 * ROW_HEIGHT],
  [-0.3, 0.3 * ROW_HEIGHT],
  [0.3, 0.3 * ROW_HEIGHT],
];
const cells = new Map<number, string | null>();
for (let row = 0; row < MAP_ROWS; row++)
  for (let column = 0; column < MAP_COLUMNS; column++) {
    const centre = cellCentre(row, column);
    const votes = new Map<string | null, number>();
    let land = 0;
    for (const [dx, dy] of SAMPLES) {
      const owner = ownerAt(centre.x + dx, centre.y + dy);
      if (owner === undefined) continue;
      land++;
      votes.set(owner, (votes.get(owner) ?? 0) + 1);
    }
    if (land < 2) continue;
    const owner = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    cells.set(row * MAP_COLUMNS + column, owner);
  }

// A country too small for any cell still gets the one under its label point,
// where that cell is sea: a visit from Singapore or Tonga lands on a dot.
const codes = [...new Set(countries.map((country) => country.code))]
  .filter((code): code is string => code !== null)
  .sort();
const owned = new Set(cells.values());
for (const code of codes) {
  if (owned.has(code)) continue;
  const country = countries.find((one) => one.code === code)!;
  const row = Math.max(
    0,
    Math.min(MAP_ROWS - 1, Math.round(country.label.y / ROW_HEIGHT - 0.5)),
  );
  const column = Math.max(
    0,
    Math.min(
      MAP_COLUMNS - 1,
      Math.round(country.label.x - (row % 2 ? 0.75 : 0.25)),
    ),
  );
  const index = row * MAP_COLUMNS + column;
  if (!cells.has(index)) cells.set(index, code);
}

// One label point per code: a country drawn in pieces (Australia and its
// reefs) keeps the one of its largest piece.
const places = codes.map((code) => {
  const country = countries
    .filter((one) => one.code === code)
    .sort(
      (a, b) =>
        Math.max(...b.shapes.map((shape) => shape.area)) -
        Math.max(...a.shapes.map((shape) => shape.area)),
    )[0];
  return `${code}${country.label.x.toFixed(1)},${country.label.y.toFixed(1)}`;
});

const bits = new Uint8Array(Math.ceil((MAP_ROWS * MAP_COLUMNS) / 8));
const owners: number[] = [];
for (let index = 0; index < MAP_ROWS * MAP_COLUMNS; index++) {
  if (!cells.has(index)) continue;
  bits[index >> 3] |= 1 << (index & 7);
  const code = cells.get(index);
  owners.push(code ? codes.indexOf(code) + 1 : 0);
}

writeFileSync(
  out,
  `// Generated by scripts/generate-world-map.mts. Do not edit by hand.
//
// Natural Earth 1:50m Admin 0 – Countries (naturalearthdata.com), public
// domain, sampled into the grid traffic/projection.ts describes.

/** One bit per grid cell, row by row: whether the cell is land. */
export const LAND = "${Buffer.from(bits).toString("base64")}";

/** For each land cell in order, 1 + its country's index in PLACES; 0 none. */
export const OWNERS = "${Buffer.from(owners).toString("base64")}";

/** Each country's ISO 3166-1 alpha-2 code and label point, in grid steps. */
export const PLACES = "${places.join(";")}";
`,
);

console.log(
  `${cells.size} land cells of ${MAP_ROWS * MAP_COLUMNS}, ${codes.length} countries → ${out}`,
);
