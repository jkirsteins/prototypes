import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { regionDensity } from "../src/sim/animals";
import { HUNT_SIGN_DAYS, noticeSignOnFoot } from "../src/sim/hunting";
import { DARK_LUX, illuminance } from "../src/sim/light";
import { newGame } from "../src/sim/newgame";
import { discoverOpportunity, isOpportunityComplete } from "../src/sim/opportunities";
import { regionState } from "../src/sim/regionstate";
import { huntedLand } from "../src/sim/species";
import type { GameState } from "../src/sim/types";
import { cellAt, regionAt, type World } from "../src/world/gen";

/** Every roll comes off, so what the seam refuses is its own gates and nothing else. */
class Always extends Rng {
  next(): number {
    return 0;
  }
}

/** No roll comes off, so a hit could only come from a missing roll. */
class Never extends Rng {
  next(): number {
    return 0.999999;
  }
}

/** One fixed draw, for measuring where the odds fall rather than whether they are zero. */
class Fixed extends Rng {
  constructor(private readonly draw: number) {
    super(1);
  }

  next(): number {
    return this.draw;
  }
}

const NOON_MINUTE = 4 * 60;
const noonAt = (minute: number) => calendar(minute + NOON_MINUTE);
const NOON = noonAt(0);

/**
 * Elk country: one land cell in the starting region, with every other
 * huntable land species dead so a hit can only be an elk.
 */
function elkCountry(state: GameState, world: World): number {
  const region = regionAt(world, state.player.region);
  const st = regionState(state, world, region.id);
  for (const species of huntedLand()) if (species !== "elk") st.pop[species] = 0;
  const cell = region.cells.find((c) => cellAt(world, c).terrain !== "water");
  if (cell === undefined) throw new Error("no land cell in the starting region");
  return cell;
}

function signLines(state: GameState): string[] {
  return state.log.map((entry) => entry.text).filter((text) => text.startsWith("Fresh sign:"));
}

describe("sign noticed on foot", () => {
  it("finds sign of the species that is there, writes it and credits the track", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    expect(regionDensity(state, world, state.player.region, "elk", NOON)).toBeGreaterThan(0);
    discoverOpportunity(state.opportunities, "track:elk", state.minute);

    noticeSignOnFoot(state, world, NOON, new Always(1), cell);

    expect(Object.keys(state.player.huntSigns[cell]?.species ?? {})).toEqual(["elk"]);
    expect(signLines(state)).toEqual(["Fresh sign: an elk."]);
    expect(isOpportunityComplete(state.opportunities, "track:elk")).toBe(true);
  });

  it("finds nothing in the pitch dark", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    // An overcast midnight with the moon down: the seam's floor is zero, so
    // only ground this dark offers literally nothing to read.
    state.minute = 11 * 1440 + 16 * 60;
    const cal = calendar(state.minute, state.startDoy);
    expect(illuminance(state, world, cal, cell)).toBe(DARK_LUX);

    noticeSignOnFoot(state, world, cal, new Always(1), cell);
    expect(state.player.huntSigns[cell]).toBeUndefined();
    expect(signLines(state)).toEqual([]);
  });

  it("reads far less by starlight than by day", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    noticeSignOnFoot(state, world, NOON, new Fixed(0.02), cell);
    expect(state.player.huntSigns[cell]?.species.elk).toBeDefined();

    const { state: night, world: nightWorld } = newGame(1);
    const nightCell = elkCountry(night, nightWorld);
    night.minute = 16 * 1440 + 16 * 60;
    noticeSignOnFoot(night, nightWorld, calendar(night.minute, night.startDoy), new Fixed(0.02), nightCell);
    expect(night.player.huntSigns[nightCell]).toBeUndefined();
  });

  it("finds nothing on water", () => {
    const { state, world } = newGame(1);
    elkCountry(state, world);
    const region = regionAt(world, state.player.region);
    const water = region.cells.find((c) => cellAt(world, c).terrain === "water");
    if (water === undefined) throw new Error("no water cell in the starting region");
    noticeSignOnFoot(state, world, NOON, new Always(1), water);
    expect(state.player.huntSigns[water]).toBeUndefined();
    expect(signLines(state)).toEqual([]);
  });

  it("finds nothing where nothing lives", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    regionState(state, world, state.player.region).pop.elk = 0;
    expect(regionDensity(state, world, state.player.region, "elk", NOON)).toBe(0);

    noticeSignOnFoot(state, world, NOON, new Always(1), cell);
    expect(state.player.huntSigns[cell]).toBeUndefined();
    expect(signLines(state)).toEqual([]);
  });

  it("never fires on a roll that misses", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    noticeSignOnFoot(state, world, NOON, new Never(1), cell);
    expect(state.player.huntSigns[cell]).toBeUndefined();
  });

  it("neither logs nor credits the same cell twice inside the sign's life", () => {
    const { state, world } = newGame(1);
    const cell = elkCountry(state, world);
    discoverOpportunity(state.opportunities, "track:elk", state.minute);

    noticeSignOnFoot(state, world, NOON, new Always(1), cell);
    expect(signLines(state).length).toBe(1);

    // A credited track cannot show a second credit, so the deed is put back
    // as undone and the repeat is asked to earn it again.
    delete state.opportunities.completedAt["track:elk"];
    delete state.opportunities.stepProgress["track:elk"];
    state.minute += 1440;
    noticeSignOnFoot(state, world, noonAt(state.minute), new Always(1), cell);
    expect(signLines(state).length).toBe(1);
    expect(isOpportunityComplete(state.opportunities, "track:elk")).toBe(false);

    state.minute += HUNT_SIGN_DAYS * 1440;
    noticeSignOnFoot(state, world, noonAt(state.minute), new Always(1), cell);
    expect(signLines(state).length).toBe(2);
    expect(isOpportunityComplete(state.opportunities, "track:elk")).toBe(true);
  });
});
