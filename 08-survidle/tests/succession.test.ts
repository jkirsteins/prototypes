/**
 * Ground a survivor felled out, and what grows back over it. Generated
 * terrain is immutable, so the clearing is a saved override and every reader
 * a mechanic uses has to see it: felling, dead wood, the canopy a ray meets,
 * the glyph and the tooltip.
 */
import { describe, expect, it } from "vitest";
import { forestGame } from "./siting-helpers";
import { calendar } from "../src/sim/calendar";
import { freshTool } from "../src/sim/inventory";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { growWood, setWoodPatchLeft, takeWood, woodPatchFull, woodPatchLeft } from "../src/sim/stocks";
import { check } from "../src/sim/tasks";
import { cellPresentation } from "../src/ui/cellpresentation";
import { legendHtml } from "../src/ui/map";
import { canopyHeightAt, generatedTerrainOf, groundChangeAt, terrainOfPatch } from "../src/world/cells";
import { CLEARING_SHARE, REGROWN_SHARE, YOUNG_CANOPY_M, YOUNG_SHARE } from "../src/world/groundchange";
import { STAND_ROTATION_YEARS } from "../src/world/aggregate";
import { CANOPY_HEIGHT_M } from "../src/world/terrain";

const noWeather = () => ({ snowCm: 0, iceCm: 0 });

/** A run standing on forest, with an axe, and the patch underfoot. */
function felling(seed: number) {
  const { state, world } = forestGame(seed);
  state.player.tools = [freshTool("axe")];
  const patch = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  return { state, world, patch, st };
}

describe("felling a stand out leaves a clearing", () => {
  it("flips the patch through the stock the work itself takes", () => {
    const { state, world, patch, st } = felling(21);
    const full = woodPatchFull(world, patch);
    expect(check(state, world, calendar(state.minute, state.startDoy), "chop").ok).toBe(true);
    // Down to the last tenth: the scattered small stuff an axe passed by.
    takeWood(st, world, patch, full * (1 - CLEARING_SHARE));
    expect(groundChangeAt(world, patch)?.kind).toBe("clearing");
    // The chunk still grows what it always grew; only the run's record changed.
    expect(terrainOfPatch(world, patch)).toBe("meadow");
    expect(["spruce", "pine", "birch"]).toContain(generatedTerrainOf(world, patch));
  });

  it("leaves a worked stand a wood until it is felled past the threshold", () => {
    const { world, patch, st } = felling(21);
    const full = woodPatchFull(world, patch);
    takeWood(st, world, patch, full * (1 - CLEARING_SHARE) - 1);
    expect(groundChangeAt(world, patch)).toBeUndefined();
    expect(terrainOfPatch(world, patch)).not.toBe("meadow");
  });

  it("refuses felling and dead wood on the clearing and keeps no canopy over it", () => {
    const { state, world, patch, st } = felling(21);
    setWoodPatchLeft(st, world, patch, 0);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "chop")).toMatchObject({ ok: false });
    expect(check(state, world, cal, "chop").why).toContain("forest");
    expect(check(state, world, cal, "deadwood")).toMatchObject({ ok: false });
    expect(check(state, world, cal, "deadwood").why).toContain("forest");
    // Meadow-like for shelter and sight: nothing standing to break a wind or a ray.
    expect(canopyHeightAt(world, patch)).toBe(0);
  });

  it("puts a thicket over young growth, still with nothing to fell", () => {
    const { state, world, patch, st } = felling(21);
    const full = woodPatchFull(world, patch);
    setWoodPatchLeft(st, world, patch, 0);
    // Grown back past the thicket share but not yet a wood.
    setWoodPatchLeft(st, world, patch, full * (YOUNG_SHARE + REGROWN_SHARE) / 2);
    expect(groundChangeAt(world, patch)?.kind).toBe("young");
    expect(canopyHeightAt(world, patch)).toBe(YOUNG_CANOPY_M);
    expect(canopyHeightAt(world, patch)).toBeLessThan(CANOPY_HEIGHT_M[generatedTerrainOf(world, patch)]!);
    expect(check(state, world, calendar(state.minute, state.startDoy), "chop").why).toContain("forest");
  });
});

describe("a clearing grows back on the stand's own clock", () => {
  it("passes from clearing to young growth to wood over the rotation", () => {
    const { world, patch, st } = felling(21);
    const rotation = STAND_ROTATION_YEARS[generatedTerrainOf(world, patch)]!;
    setWoodPatchLeft(st, world, patch, 0);
    expect(groundChangeAt(world, patch)?.kind).toBe("clearing");

    // A year puts back a rotation's worth, so the shares are also a clock.
    const run = (years: number) => { for (let d = 0; d < Math.round(years * 365); d++) growWood(st, world); };
    run(YOUNG_SHARE * rotation - 1);
    expect(groundChangeAt(world, patch)?.kind).toBe("clearing");
    run(2);
    expect(groundChangeAt(world, patch)?.kind).toBe("young");
    run(REGROWN_SHARE * rotation - YOUNG_SHARE * rotation - 2);
    expect(groundChangeAt(world, patch)?.kind).toBe("young");
    run(2);
    expect(groundChangeAt(world, patch)).toBeUndefined();
    expect(terrainOfPatch(world, patch)).toBe(generatedTerrainOf(world, patch));
    expect(woodPatchLeft(st, world, patch)).toBeGreaterThan(woodPatchFull(world, patch) * REGROWN_SHARE);
  });

  it("takes decades rather than seasons", () => {
    const { world, patch } = felling(21);
    const rotation = STAND_ROTATION_YEARS[generatedTerrainOf(world, patch)]!;
    expect(REGROWN_SHARE * rotation).toBeGreaterThan(30);
  });
});

describe("the clearing is saved and shown", () => {
  it("survives a save and a load", () => {
    const { state, world, patch, st } = felling(21);
    setWoodPatchLeft(st, world, patch, 0);
    const back = deserialize(serialize(state));
    expect(back && "state" in back).toBe(true);
    const loaded = (back as { state: typeof state }).state;
    expect(loaded.groundChanges[patch]).toEqual(state.groundChanges[patch]);
  });

  it("draws its own glyph at the closest rung and names it in the tooltip", () => {
    const { state, world, patch, st } = felling(21);
    setWoodPatchLeft(st, world, patch, 0);
    const shown = cellPresentation(state, world, patch, "current", noWeather);
    expect(shown.glyph).toBe("c");
    expect(shown.heading).toBe("clearing");
    expect(legendHtml()).toContain("clearing");
    expect(legendHtml()).toContain("young growth");
  });
});
