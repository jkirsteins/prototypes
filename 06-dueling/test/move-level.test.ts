import { describe, expect, test } from "vitest";
import { COLS, ROWS, TILE, createLevel, isSolid, ladderTopRow, tileAt } from "../src/movement/level";

describe("the movement level", () => {
  const level = createLevel();

  test("dimensions: 20x11 tiles of 96 cm", () => {
    expect(COLS).toBe(20);
    expect(ROWS).toBe(11);
    expect(TILE).toBe(96);
  });

  test("the floor row is fully solid", () => {
    for (let c = 0; c < COLS; c++) expect(isSolid(tileAt(level, c, 10))).toBe(true);
  });

  test("the left wall is solid from row 2 to row 9", () => {
    for (let r = 2; r <= 9; r++) expect(tileAt(level, 0, r)).toBe("solid");
    expect(tileAt(level, 0, 1)).toBe("empty"); // lip above: ledge-grabbable
  });

  test("the ladder spans rows 3-9 at col 17 and knows its top", () => {
    for (let r = 3; r <= 9; r++) expect(tileAt(level, 17, r)).toBe("ladder");
    expect(ladderTopRow(level, 17)).toBe(3);
    expect(ladderTopRow(level, 5)).toBe(null);
  });

  test("the tunnel has exactly one tile of clearance", () => {
    // roof at row 8, cols 10-12; row 9 below it is empty; floor at row 10
    for (let c = 10; c <= 12; c++) {
      expect(isSolid(tileAt(level, c, 8))).toBe(true);
      expect(tileAt(level, c, 9)).toBe("empty");
    }
  });

  test("platforms sit where the layout says", () => {
    for (const [c, r] of [[3, 8], [4, 8], [5, 6], [6, 6], [7, 6], [14, 6], [15, 6], [18, 3], [19, 3]]) {
      expect(isSolid(tileAt(level, c, r))).toBe(true);
    }
    // the left step is solid down to the floor; a floating platform there
    // would leave a second accidental crawl-gap under it.
    for (const [c, r] of [[3, 9], [4, 9]]) {
      expect(isSolid(tileAt(level, c, r))).toBe(true);
    }
    // the dash gap: cols 8-13 at row 6 are open
    for (let c = 8; c <= 13; c++) expect(isSolid(tileAt(level, c, 6))).toBe(false);
  });

  test("out of bounds: sides and below are solid, above is empty", () => {
    expect(isSolid(tileAt(level, -1, 5))).toBe(true);
    expect(isSolid(tileAt(level, COLS, 5))).toBe(true);
    expect(isSolid(tileAt(level, 5, ROWS))).toBe(true);
    expect(isSolid(tileAt(level, 5, -1))).toBe(false);
  });

  test("the block starts on the floor at col 19", () => {
    expect(level.blockStartX).toBe(19.5 * TILE);
  });
});
