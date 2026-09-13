/**
 * Sight is measured in metres over 50 m patches, and what blocks a ray is the
 * surface at the patch. The ground under these cases is painted into the chunk
 * itself: the refinement classifies its own terrain from slope and wetness, so
 * a solved cell painted "meadow" is not meadow once a patch of it is generated.
 * Prominence is the exception - it reads the solve's own heights, and its
 * fixture is a solved world twenty kilometres across and more.
 */
import { describe, expect, it } from "vitest";
import { hasLineOfSight, prominenceM } from "../src/sim/sight";
import { KIND } from "../src/world/solve";
import { patchId } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { fineFixture } from "./fine-fixture";
import { flatWorld } from "./world-fixture";

/** The row the cases look along, in the middle of the painted chunk. */
const ROW = 48;

describe("sight in metres", () => {
  it("sees across water: a sea cell is no obstacle", () => {
    // Meadow at 5 m with a sound of sea through it, 1.75 km of open water.
    const f = fineFixture({ terrain: "meadow", heightM: 5 });
    for (let y = 0; y < 96; y++) {
      for (let x = 30; x < 65; x++) {
        const i = f.at(x, y);
        f.terrain[i] = TERRAIN_INDEX.water;
        f.kind[i] = KIND.sea;
        f.height[i] = -10;
        f.surface[i] = 0;
      }
    }
    expect(hasLineOfSight(f.world, patchId(10, ROW), patchId(85, ROW))).toBe(true);
  });

  it("is blocked by a ridge between two valley floors", () => {
    const f = fineFixture({ terrain: "meadow", heightM: 100 });
    // A ridge of rock 300 m above the floor, one parent wide: patches x 48..53.
    for (let y = 0; y < 96; y++) {
      for (let x = 48; x < 54; x++) {
        const i = f.at(x, y);
        f.terrain[i] = TERRAIN_INDEX.rock;
        f.height[i] = 400;
        f.surface[i] = 400;
      }
    }
    expect(hasLineOfSight(f.world, patchId(10, ROW), patchId(90, ROW))).toBe(false);
    // The floor on this side of the ridge is in plain view.
    expect(hasLineOfSight(f.world, patchId(10, ROW), patchId(44, ROW))).toBe(true);
  });

  it("reads prominence above the lowest ground within 20 km, not altitude", () => {
    // 400 by 200 solved cells: 120 km wide, so a patch can stand more than
    // twenty kilometres from the fjord without the sampling box leaving it.
    const plateau = flatWorld({ w: 400, h: 200, terrain: "meadow", heightM: 300 });
    expect(prominenceM(plateau, 1200, 600)).toBe(0);
    const fjord = flatWorld({ w: 400, h: 200, terrain: "meadow", heightM: 300 });
    for (let y = 0; y < 200; y++) for (let x = 0; x < 20; x++) fjord.solved.height[y * 400 + x] = 0;
    // Twelve kilometres from the fjord floor, so the whole 300 m stands above it.
    expect(prominenceM(fjord, 240, 600)).toBe(300);
    // Fifty-four kilometres out the fjord is out of reach and the plateau is flat.
    expect(prominenceM(fjord, 1200, 600)).toBe(0);
  });
});
