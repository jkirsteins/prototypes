import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { isKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { seeFrom } from "../src/sim/sight";
import { cellAt, regionAt, type World } from "../src/world/gen";

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A meadow-or-bog cell in `region` with `n` more open cells running straight from it in some cardinal direction. */
function openRun(world: World, region: number, n: number): { vantage: number; end: number } {
  for (const idx of regionAt(world, region).cells) {
    const t = cellAt(world, idx).terrain;
    if (t !== "meadow" && t !== "bog") continue;
    const x = idx % world.w;
    const y = Math.floor(idx / world.w);
    for (const [dx, dy] of DIRS) {
      let end = -1;
      let ok = true;
      for (let i = 1; i <= n; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) { ok = false; break; }
        const nt = cellAt(world, ny * world.w + nx).terrain;
        if (nt === "spruce" || nt === "pine" || nt === "birch") { ok = false; break; }
        end = ny * world.w + nx;
      }
      if (ok) return { vantage: idx, end };
    }
  }
  throw new Error(`region ${region} has no ${n}-cell open run`);
}

/** A closed-spruce cell in `region`, and one of its passable neighbours. */
function spruceCell(world: World, region: number): number {
  const idx = regionAt(world, region).cells.find((c) => cellAt(world, c).terrain === "spruce");
  if (idx === undefined) throw new Error(`region ${region} has no spruce`);
  return idx;
}

/** A vantage in `region` with water then spruce along a straight ray, and the cell one past the spruce. */
function waterThenSpruce(world: World, region: number): { vantage: number; water: number; spruce: number; behind: number } {
  for (const idx of regionAt(world, region).cells) {
    const t = cellAt(world, idx).terrain;
    if (t === "spruce" || t === "pine" || t === "birch") continue;
    const x = idx % world.w;
    const y = Math.floor(idx / world.w);
    for (const [dx, dy] of DIRS) {
      const seq: { terrain: string; idx: number }[] = [];
      let ok = true;
      for (let i = 1; i <= 6; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) { ok = false; break; }
        const nidx = ny * world.w + nx;
        seq.push({ terrain: cellAt(world, nidx).terrain, idx: nidx });
      }
      if (!ok) continue;
      const spruceAt = seq.findIndex((s) => s.terrain === "spruce");
      if (spruceAt >= 1 && spruceAt < seq.length - 1 && seq.slice(0, spruceAt).every((s) => s.terrain === "water")) {
        return { vantage: idx, water: seq[0].idx, spruce: seq[spruceAt].idx, behind: seq[spruceAt + 1].idx };
      }
    }
  }
  throw new Error(`region ${region} has no water-then-spruce ray`);
}

// Seed 1's start region, at solar noon on landing day (1 April): bright enough that light never gates the range.
const NOON = calendar(300);

describe("sight", () => {
  it("reads far over open ground and nothing through closed spruce", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, 10);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, end)).toBe(true);

    const { state: state2, world: world2 } = newGame(1);
    const spruce = spruceCell(world2, state2.player.region);
    const sx = spruce % world2.w;
    const sy = Math.floor(spruce / world2.w);
    const neighbour = (sx > 0 ? sy * world2.w + (sx - 1) : sy * world2.w + (sx + 1));
    seeFrom(state2, world2, NOON, spruce);
    expect(isKnown(state2, spruce)).toBe(true);
    expect(isKnown(state2, neighbour)).toBe(false);
  });

  it("maps nothing at night", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, 10);
    state.weather.clear = false;
    // 2 a.m. in December, moon new: astronomical night with cloud over what little
    // starlight there is, so illuminance floors at the dark reference and the light
    // factor is exactly 0.
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    seeFrom(state, world, night, vantage);
    expect(isKnown(state, vantage)).toBe(true);
    expect(isKnown(state, end)).toBe(false);
  });

  it("stops at the first blocking canopy", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, water, spruce, behind } = waterThenSpruce(world, region);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, water)).toBe(true);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, behind)).toBe(false);
  });
});
