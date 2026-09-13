import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { bestHuntCell, huntCandidates, HUNT_SHORTLIST, huntEstimate, noteHuntSign } from "../src/sim/hunting";
import { markKnown, mapRegion } from "../src/sim/mapped";
import { isKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { setSkillLevel } from "../src/sim/horizon";
import { campCellOf, cellOf, kmBetween } from "../src/sim/position";
import * as routing from "../src/sim/routing";
import { skillLevel } from "../src/sim/skills";
import { visibleCells } from "../src/sim/sight";
import { regionAt } from "../src/world/gen";
import { fineFixture } from "./fine-fixture";
import { FINE_CHUNK } from "../src/world/cells";
import { CHANNEL_RIVER } from "../src/world/refine";
import { KIND } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { patchId } from "../src/world/spatial";

afterEach(() => vi.restoreAllMocks());

/** A key that names one A* search, so a repeated call served from the route cache is not counted twice. */
function searchKey(args: unknown[]): string {
  return `${args[2]}>${args[3]}>${args[4] ?? "none"}>${args[5] ?? false}`;
}

describe("reachable ground", () => {
  it("leaves the far bank out when no ford crosses the river", () => {
    // A river is a channel one 50 m patch wide now, not a painted 300 m column,
    // so the barrier is carved into the chunk and the banks are ordinary ground.
    const f = fineFixture({ terrain: "meadow" });
    for (let y = 0; y < FINE_CHUNK; y++) {
      const i = y * FINE_CHUNK + 48;
      f.terrain[i] = TERRAIN_INDEX.river;
      f.kind[i] = KIND.river;
      f.channel[i] = CHANNEL_RIVER;
    }
    // A summer start, so no ice turns the river into a road.
    const { state } = newGame(1, 200, undefined, f.world);
    for (let y = 0; y < FINE_CHUNK; y++) for (let x = 0; x < FINE_CHUNK; x++) markKnown(state, patchId(x, y));
    const reachable = routing.reachableFrom(state, f.world, patchId(40, 32), "none");
    expect(reachable.has(patchId(47, 32))).toBe(true);
    expect(reachable.has(patchId(40, 10))).toBe(true);
    for (let y = 0; y < FINE_CHUNK; y++) expect(reachable.has(patchId(48, y))).toBe(false);
    expect(reachable.has(patchId(49, 32))).toBe(false);
    expect(reachable.has(patchId(80, 32))).toBe(false);
  });
});

describe("the hunting chooser", () => {
  it("routes to a shortlist rather than to every mapped cell", () => {
    const { state, world } = newGame(42);
    mapRegion(state, world, state.player.region);
    const cal = calendar(state.minute);
    const spy = vi.spyOn(routing, "survivorRoute");
    bestHuntCell(state, world, cal);
    const searches = new Set(spy.mock.calls.map((call) => searchKey(call as unknown[])));
    expect(searches.size).toBeLessThanOrEqual(HUNT_SHORTLIST * 2 + 2);
  });

  // Level 1 reads as pure proximity and level 20 as pure expected return; both
  // are monotone in a single term, so neither can feel the normalisers widening
  // from the region to the shortlist. Level 10 mixes the two terms and is the
  // case that can. The expert's choice is not the cell underfoot, so the
  // agreement has teeth there too.
  // A sweep of all the candidate ground is exactly the assertion that the
  // shortlist cuts no winner: if the twenty-four it keeps had lost the best
  // cell, the sweep would name it here and the chooser would not.
  it.each([1, 10, 20])("picks the cell a sweep of every candidate cell picks at hunting level %i", (level) => {
    const { state, world } = newGame(42);
    mapRegion(state, world, state.player.region);
    setSkillLevel(state, "hunting", level);
    const cal = calendar(state.minute);
    expect(bestHuntCell(state, world, cal)).toBe(sweepHuntCell(state, world, cal));
  });
});

/**
 * The chooser as it scored before the shortlist: an estimate and a real route
 * for every cell the chooser is willing to consider, rather than for the
 * twenty-four it keeps. It is here so the shortlist is measured against the
 * scoring it replaced rather than against a remembered cell.
 *
 * Two things it must share with the chooser or it measures something else.
 * The ground: `huntCandidates` represents each parent and terrain by the
 * nearest patch of it, which is a narrowing of its own with its own reason,
 * and not what the shortlist does. The travel: `huntEstimate` divides by the
 * walk, so an estimate told nothing about the walk is a different quantity.
 */
function sweepHuntCell(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], cal: ReturnType<typeof calendar>): number {
  const here = cellOf(state, world);
  const camp = campCellOf(state, world);
  const observable = visibleCells(state, world, cal, here);
  const choices = huntCandidates(state, world, [regionAt(world, state.player.region)])
    .filter((cell) => isKnown(state, cell))
    .map((cell) => {
      const km = kmBetween(state, world, here, cell, "none");
      if (km === null) return null;
      // The same quantity the chooser scores: an estimate that has been told
      // what the walk to the cell and back to camp costs. Scoring without it
      // measures a different thing and the two paths cannot be compared.
      const travel = { toCell: km, toCamp: camp === null ? 0 : (kmBetween(state, world, cell, camp, "none") ?? 0) };
      const estimate = huntEstimate(state, world, cal, cell, observable, travel);
      if (!estimate.species.length) return null;
      return { cell, km, estimate };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!choices.length) return here;
  const skill = Math.min(1, (skillLevel(state, "hunting") - 1) / 19);
  const maxKm = Math.max(...choices.map((x) => x.km), 0.001);
  const maxValue = Math.max(...choices.map((x) => x.estimate.kgPerHour), 0.001);
  choices.sort((a, b) => {
    const proximityA = 1 - a.km / maxKm;
    const proximityB = 1 - b.km / maxKm;
    const valueA = (a.estimate.kgPerHour / maxValue) * a.estimate.confidence;
    const valueB = (b.estimate.kgPerHour / maxValue) * b.estimate.confidence;
    return (proximityB * (1 - skill) + valueB * skill) - (proximityA * (1 - skill) + valueA * skill)
      || a.km - b.km || a.cell - b.cell;
  });
  return choices[0].cell;
}

/**
 * The sign table's budget.
 *
 * Choosing where to hunt scores every mapped cell of the region, and two of
 * the terms it scores with - the region's latest sign of a species, and
 * whether that species has been learned absent - are facts about a region
 * and a species, not about a cell. Read per cell, each one walks the whole
 * sign table, and that table grows all run, so the cost of a single decision
 * climbs with every sign the survivor has ever noted. The same walk is paid
 * again by the Ahead forecast and by the catch-up on return.
 *
 * The budget is a claim about shape rather than a number of milliseconds:
 * the table is walked a fixed few times per decision, and the entries it
 * visits stay in proportion to what the table holds. Raising either number
 * is not the fix; reading the table once per region and species is.
 *
 * This ran red when it was written. One decision on seed 42 with 200 signed
 * cells walked the table 1,962 times and read 394,086 entries out of it, for
 * a table 200 entries long.
 */
const SIGN_TABLE_WALK_BUDGET = 8;
const SIGN_TABLE_READS_PER_FURTHER_SIGN = 4;

describe("the sign table's budget", () => {
  function signTableWork(signs: number): { walks: number; visits: number } {
    const { state, world } = newGame(42);
    mapRegion(state, world, state.player.region);
    const cal = calendar(state.minute);
    for (const cell of regionAt(world, state.player.region).cells.slice(0, signs)) {
      noteHuntSign(state, cell, "hare");
      noteHuntSign(state, cell, "deer");
    }
    let walks = 0;
    let visits = 0;
    const table = state.player.huntSigns;
    state.player.huntSigns = new Proxy(table, {
      ownKeys(target) {
        walks++;
        return Reflect.ownKeys(target);
      },
      get(target, key, receiver) {
        if (key !== Symbol.toStringTag) visits++;
        return Reflect.get(target, key, receiver);
      },
    });
    bestHuntCell(state, world, cal);
    state.player.huntSigns = table;
    return { walks, visits };
  }

  it("walks the table a handful of times, not once per cell and species", () => {
    expect(signTableWork(200).walks).toBeLessThanOrEqual(SIGN_TABLE_WALK_BUDGET);
  });

  // Point lookups of the cell underfoot are reads of the table too, and they
  // scale with the ground scored, which is proper. What must not scale is the
  // product: a sign the survivor noted in April costing a read on every cell
  // scored in September. So the claim is made on the growth - each further
  // sign costs a few reads per decision, not a read per cell and species.
  it("costs a few reads per further sign, not a read per cell scored", () => {
    const lean = signTableWork(50).visits;
    const full = signTableWork(200).visits;
    expect(full - lean).toBeLessThanOrEqual((200 - 50) * SIGN_TABLE_READS_PER_FURTHER_SIGN);
  });
});
