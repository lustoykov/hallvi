// Where a place sits on the dotted world map.
//
// Natural Earth I (Šavrič, Patterson, Jenny and Jenny, 2011): a compromise
// projection that keeps the continents recognisable without Mercator's
// giant Greenland. The map is cropped at 84°N and 57°S, which keeps every
// inhabited coast and leaves Antarctica's band of dots out.
//
// The generator (`scripts/generate-world-map.mts`) samples the land into a
// grid with these same numbers, and the page places a country with them, so
// a visit lands on the dots it belongs to. Change one and regenerate.

/** Grid cells across the widest line, the equator. */
export const MAP_COLUMNS = 128;
const NORTH = 84;
const SOUTH = -57;

function raw(lon: number, lat: number): [number, number] {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  // The published polynomials, in Horner form.
  const width =
    0.8707 -
    0.131979 * phi2 +
    phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4));
  const height =
    1.007226 +
    phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4));
  return [lambda * width, phi * height];
}

const HALF_WIDTH = raw(180, 0)[0];
const TOP = raw(0, NORTH)[1];
const BOTTOM = raw(0, SOUTH)[1];
/** One grid step, in projected units. */
const STEP = (2 * HALF_WIDTH) / MAP_COLUMNS;
/** Rows are offset by half a step, so they sit closer: a hexagonal grid. */
export const ROW_HEIGHT = Math.sqrt(3) / 2;
export const MAP_ROWS = Math.floor((TOP - BOTTOM) / STEP / ROW_HEIGHT);
/** The map's size in grid steps, which is also its SVG view box. */
export const MAP_WIDTH = MAP_COLUMNS;
export const MAP_HEIGHT = MAP_ROWS * ROW_HEIGHT;

/** A longitude and latitude, in grid steps from the map's top-left corner. */
export function toMap(lon: number, lat: number) {
  const [x, y] = raw(lon, lat);
  return { x: (x + HALF_WIDTH) / STEP, y: (TOP - y) / STEP };
}

/** The centre of one grid cell; odd rows sit half a step to the right. */
export function cellCentre(row: number, column: number) {
  return {
    x: column + (row % 2 ? 0.75 : 0.25),
    y: (row + 0.5) * ROW_HEIGHT,
  };
}

/** The projected point under a map position, for the generator's sampling. */
export function fromMap(x: number, y: number): [number, number] {
  return [x * STEP - HALF_WIDTH, TOP - y * STEP];
}

/** A longitude and latitude, projected, for the generator's polygons. */
export const projected = raw;
