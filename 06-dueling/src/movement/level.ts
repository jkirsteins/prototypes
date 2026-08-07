/**
 * The movement-test level: one fixed screen, 20x11 tiles of 96 cm
 * (16 sprite px at SCALE 3 = 48 canvas px). The layout exercises every
 * verb: climbable wall (col 0), stepped platforms, a dash-only gap
 * (cols 8-13 at row 6), a one-tile tunnel (roof row 8, cols 10-12), a
 * ladder (col 17) to a high platform, and a pushable block parked
 * against the right wall so it must be PULLED out first.
 */
export const TILE = 96;
export const COLS = 20;
export const ROWS = 11;

export type TileKind = "empty" | "solid" | "climb" | "ladder";

// # solid, C climbable solid, H ladder (non-solid), . empty
const MAP = [
  "....................",
  "....................",
  "C...................",
  "C................H##",
  "C................H..",
  "C................H..",
  "C....###......##.H..",
  "C................H..",
  "C..##.....###....H..",
  "C..##............H..",
  "####################",
];

const KIND: Record<string, TileKind> = { ".": "empty", "#": "solid", C: "climb", H: "ladder" };

export interface Level {
  grid: TileKind[][]; // [row][col]
  /** Pushable block spawn, cm (center x; it lives on the floor). */
  blockStartX: number;
}

export function createLevel(): Level {
  return {
    grid: MAP.map((row) => [...row].map((ch) => KIND[ch])),
    blockStartX: 19.5 * TILE,
  };
}

/** Sides and below read solid (arena walls and ground), above reads empty
 *  (open sky), so collision needs no special edge cases. */
export function tileAt(level: Level, col: number, row: number): TileKind {
  if (row < 0) return "empty";
  if (col < 0 || col >= COLS || row >= ROWS) return "solid";
  return level.grid[row][col];
}

export function isSolid(kind: TileKind): boolean {
  return kind === "solid" || kind === "climb";
}

/** Topmost ladder row in a column, or null when the column has no ladder. */
export function ladderTopRow(level: Level, col: number): number | null {
  for (let r = 0; r < ROWS; r++) {
    if (tileAt(level, col, r) === "ladder") return r;
  }
  return null;
}
