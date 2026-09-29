// The dotted world map, unpacked once from its generated grid.

import {
  MAP_COLUMNS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  cellCentre,
} from "./projection";
import { LAND, OWNERS, PLACES } from "./world-map-data";

export interface Dot {
  x: number;
  y: number;
  /** ISO 3166-1 alpha-2, or null for land no country answers for. */
  country: string | null;
}

export interface WorldMap {
  width: number;
  height: number;
  dots: Dot[];
  /** Where a visit from a country lands: its label point. */
  places: Map<string, { x: number; y: number }>;
}

const bytes = (base64: string) =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

let unpacked: WorldMap | null = null;

export function worldMap(): WorldMap {
  if (unpacked) return unpacked;
  const codes: string[] = [];
  const places = new Map<string, { x: number; y: number }>();
  for (const entry of PLACES.split(";")) {
    const code = entry.slice(0, 2);
    const [x, y] = entry.slice(2).split(",").map(Number);
    codes.push(code);
    places.set(code, { x, y });
  }
  const land = bytes(LAND);
  const owners = bytes(OWNERS);
  const dots: Dot[] = [];
  for (let row = 0; row < MAP_ROWS; row++)
    for (let column = 0; column < MAP_COLUMNS; column++) {
      const index = row * MAP_COLUMNS + column;
      if (!(land[index >> 3] & (1 << (index & 7)))) continue;
      const owner = owners[dots.length];
      dots.push({
        ...cellCentre(row, column),
        country: owner ? codes[owner - 1] : null,
      });
    }
  unpacked = { width: MAP_WIDTH, height: MAP_HEIGHT, dots, places };
  return unpacked;
}
