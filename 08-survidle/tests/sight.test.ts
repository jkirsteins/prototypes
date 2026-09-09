import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { isKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { seeFrom, sightRangeCells, visibleCells } from "../src/sim/sight";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { fieldsAt } from "../src/world/terrain";
import { placeAt } from "../src/sim/position";

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
      if (ok) {
        const observer = fieldsAt(world.seed, x, y).e * 1200 + 1.7;
        let horizon = -Infinity;
        for (let i = 1; i <= n; i++) {
          const elevation = fieldsAt(world.seed, x + dx * i, y + dy * i).e * 1200;
          const slope = (elevation - observer) / i;
          if (i === n && slope < horizon) ok = false;
          horizon = Math.max(horizon, slope);
        }
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

/**
 * Forgets everything the landing revealed. seeFrom runs at every step of the
 * walk ashore, so on a fresh game the ground around the start is already known
 * and a test asking what one look from one cell reveals would be reading the
 * landing's work instead of its own.
 */
function forget(state: { mapped: Record<number, number> }): void {
  state.mapped = {};
}

describe("sight", () => {
  it("never sees beyond its Euclidean range at the square corners", () => {
    const { state, world } = newGame(1);
    const vantage = regionAt(world, state.player.region).cells.find((cell) => {
      const t = cellAt(world, cell).terrain;
      return t === "meadow" || t === "bog" || t === "fell" || t === "rock";
    });
    expect(vantage).toBeDefined();
    const range = sightRangeCells(state, world, NOON, vantage!);
    const vx = vantage! % world.w;
    const vy = Math.floor(vantage! / world.w);
    const farthest = Math.max(...[...visibleCells(state, world, NOON, vantage!)]
      .map((cell) => Math.hypot(cell % world.w - vx, Math.floor(cell / world.w) - vy)));
    expect(farthest).toBeLessThanOrEqual(range);
  });

  it("shows an open ridge but hides lower ground behind it", () => {
    const { state, world } = newGame(1);
    let scenario: { vantage: number; ridge: number; behind: number } | null = null;
    const forest = new Set(["spruce", "pine", "birch"]);
    for (const vantage of regionAt(world, state.player.region).cells) {
      if (forest.has(cellAt(world, vantage).terrain)) continue;
      const vx = vantage % world.w;
      const vy = Math.floor(vantage / world.w);
      const observer = fieldsAt(world.seed, vx, vy).e * 1200 + 1.7;
      const range = Math.min(12, sightRangeCells(state, world, NOON, vantage));
      for (const [dx, dy] of DIRS) {
        let highestSlope = -Infinity;
        let ridge = -1;
        for (let distance = 1; distance <= range; distance++) {
          const x = vx + dx * distance;
          const y = vy + dy * distance;
          const cell = y * world.w + x;
          if (x < 0 || y < 0 || x >= world.w || y >= world.h || forest.has(cellAt(world, cell).terrain)) break;
          const slope = (fieldsAt(world.seed, x, y).e * 1200 - observer) / distance;
          if (slope > highestSlope + 8) {
            highestSlope = slope;
            ridge = cell;
          } else if (ridge >= 0 && highestSlope > slope + 15) {
            scenario = { vantage, ridge, behind: cell };
            break;
          }
        }
        if (scenario) break;
      }
      if (scenario) break;
    }
    expect(scenario).not.toBeNull();
    const visible = visibleCells(state, world, NOON, scenario!.vantage);
    expect(visible.has(scenario!.ridge)).toBe(true);
    expect(visible.has(scenario!.behind)).toBe(false);
  });

  it("reads far over open ground and no further than the next cell through closed spruce", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, 10);
    forget(state);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, end)).toBe(true);

    const { state: state2, world: world2 } = newGame(1);
    const spruce = spruceCell(world2, state2.player.region);
    const sx = spruce % world2.w;
    const sy = Math.floor(spruce / world2.w);
    const neighbour = (sx > 0 ? sy * world2.w + (sx - 1) : sy * world2.w + (sx + 1));
    forget(state2);
    seeFrom(state2, world2, NOON, spruce);
    expect(isKnown(state2, spruce)).toBe(true);
    // The ring you stand in: a cell is 300 m and a survivor walks across it, so
    // the ground a few strides away is known even under a canopy that shows
    // nothing at any distance.
    expect(isKnown(state2, neighbour)).toBe(true);
    // And no further. The canopy still takes everything past the neighbour.
    const beyond = sx > 0 ? sy * world2.w + (sx - 2) : sy * world2.w + (sx + 2);
    expect(isKnown(state2, beyond)).toBe(false);
  });

  it("takes the ring away again once the light is under what walking wants", () => {
    const { state, world } = newGame(1);
    const spruce = spruceCell(world, state.player.region);
    const sx = spruce % world.w;
    const sy = Math.floor(spruce / world.w);
    const neighbour = sx > 0 ? sy * world.w + (sx - 1) : sy * world.w + (sx + 1);
    state.weather.clear = false;
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    forget(state);
    seeFrom(state, world, night, spruce);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, neighbour)).toBe(false);
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
    forget(state);
    seeFrom(state, world, night, vantage);
    expect(isKnown(state, vantage)).toBe(true);
    expect(isKnown(state, end)).toBe(false);
  });

  it("a torch lights nearby ground but does not turn night into distant terrain sight", () => {
    const { state, world } = newGame(1);
    const { vantage, end } = openRun(world, state.player.region, 10);
    placeAt(state, world, vantage);
    state.player.torch = { lit: true, minutes: 60 };
    state.weather.clear = false;
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    const visible = visibleCells(state, world, night, vantage);
    expect(visible.has(vantage)).toBe(true);
    expect(visible.has(end)).toBe(false);
  });

  it("stops at the first blocking canopy", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, water, spruce, behind } = waterThenSpruce(world, region);
    forget(state);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, water)).toBe(true);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, behind)).toBe(false);
  });
});
