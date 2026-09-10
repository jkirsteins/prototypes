import { describe, expect, it } from "vitest";
import { cellPresentation } from "../src/ui/cellpresentation";
import { weatherShotSimulation } from "../src/sim/weather-scenarios";
import { cellAt, regionAt } from "../src/world/gen";
import { newGame } from "../src/sim/newgame";

describe("the player-facing projection of one cell", () => {
  it("does not resolve current ground for unknown or remembered cells", () => {
    const shot = weatherShotSimulation("frozen-water");
    let reads = 0;
    const ground = () => {
      reads++;
      return { snowCm: 20, iceCm: 32 };
    };
    expect(cellPresentation(shot.state, shot.world, shot.cell, "unknown", ground)).toEqual({
      knowledge: "unknown", heading: "unknown ground", glyph: " ", classes: [],
    });
    const remembered = cellPresentation(shot.state, shot.world, shot.cell, "remembered", ground);
    expect(remembered).toMatchObject({ knowledge: "remembered", terrain: "water", heading: "water" });
    expect(remembered.glyph).toBe("~");
    expect(remembered.classes).toEqual(["t-water", "memory"]);
    expect(reads).toBe(0);
  });

  it("projects current safe ice with its underlying water glyph and background class", () => {
    const shot = weatherShotSimulation("frozen-water");
    let reads = 0;
    const current = cellPresentation(shot.state, shot.world, shot.cell, "current", () => {
      reads++;
      return { snowCm: 20, iceCm: 32 };
    });
    expect(current).toMatchObject({
      knowledge: "current",
      heading: "safe ice over water",
      location: "on safe ice",
      glyph: "~",
      classes: ["t-water", "ice-safe"],
      surface: { kind: "water", water: "sea", ice: "safe" },
    });
    expect(reads).toBe(1);
  });

  it("projects current snow through color classes without replacing meadow terrain", () => {
    const shot = newGame(17);
    const meadow = regionAt(shot.world, shot.state.player.region).cells.find((cell) => cellAt(shot.world, cell).terrain === "meadow");
    expect(meadow).toBeTypeOf("number");
    const current = cellPresentation(shot.state, shot.world, meadow!, "current", () => ({ snowCm: 31, iceCm: 0 }));
    expect(current).toMatchObject({
      knowledge: "current",
      heading: expect.stringContaining("deep snow over"),
      classes: expect.arrayContaining(["ground-snow", "ground-snow-deep"]),
    });
    expect(current.glyph).not.toBe("*");
  });
});
