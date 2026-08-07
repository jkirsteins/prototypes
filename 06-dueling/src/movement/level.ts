/**
 * The movement-test level: one fixed screen, 20x11 tiles of 96 cm
 * (16 sprite px at SCALE 3 = 48 canvas px). The layout exercises every
 * verb: the left wall for wall slide and wall jumps, stepped platforms,
 * a dash-only gap (cols 8-13 at row 6), a one-tile tunnel (roof row 8,
 * cols 10-12), a ladder (col 17) to a high platform, and a pushable
 * block parked against the right wall so it must be PULLED out first.
 */
export const TILE = 96;
export const COLS = 20;
export const ROWS = 11;

export type TileKind = "empty" | "solid" | "ladder";

// # solid, H ladder (non-solid), . empty
const MAP = [
  "....................",
  "....................",
  "#...................",
  "#................H##",
  "#................H..",
  "#................H..",
  "#....###......##.H..",
  "#................H..",
  "#..##.....###....H..",
  "#..##............H..",
  "####################",
];

const KIND: Record<string, TileKind> = { ".": "empty", "#": "solid", H: "ladder" };

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

/**
 * The arena: a flat yard with one raised platform. Three tiles tall is
 * load-bearing - a jump's apex (~210 cm) cannot clear 288 cm, so the
 * only way up is the hands: jump, catch the lip, pull up.
 */
const ARENA_MAP = [
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "......########......",
  "......########......",
  "......########......",
  "####################",
];

/** Platform faces and top edge, cm. `right` is the RIGHT FACE (col 14's
 *  left edge); a body between the faces stands on the platform. */
export const ARENA_PLATFORM = { left: 6 * TILE, right: 14 * TILE, topY: 7 * TILE };

export function createArenaLevel(): Level {
  return {
    grid: ARENA_MAP.map((row) => [...row].map((ch) => KIND[ch])),
    // Parked off-world: the engine's block collision can never engage.
    blockStartX: -500,
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
  return kind === "solid";
}

/** Topmost ladder row in a column, or null when the column has no ladder. */
export function ladderTopRow(level: Level, col: number): number | null {
  for (let r = 0; r < ROWS; r++) {
    if (tileAt(level, col, r) === "ladder") return r;
  }
  return null;
}
