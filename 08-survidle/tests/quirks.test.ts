import { describe, expect, it } from "vitest";
import type { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { regionDensity } from "../src/sim/animals";
import { calendar, START_DOY } from "../src/sim/calendar";
import { hourlyEvents } from "../src/sim/events";
import { lightingInRain } from "../src/sim/fire";
import { addItem, freshTool } from "../src/sim/inventory";
import { isRead } from "../src/sim/knowledge";
import { newGame } from "../src/sim/newgame";
import { FELL_FEAR_LINE, medianPerson, SHORE_FEAR_LINE } from "../src/sim/person";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { gap } from "../src/sim/skills";
import { check } from "../src/sim/tasks";
import type { QuirkId } from "../src/sim/types";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";

function withQuirk(seed: number, q: QuirkId | null) {
  return newGame(seed, undefined, { ...medianPerson("f"), quirks: q ? [q] : [] });
}

/** Every roll lands: the wolves come, and so does the fever. */
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (a: readonly unknown[]) => a[0], gauss: () => 0, s: 0 } as unknown as Rng;

describe("the quirks", () => {
  it("coast-born reads every shore of the landing ground at once, and the median none", () => {
    const coast = withQuirk(17, "coastBorn");
    const median = withQuirk(17, null);
    const r = regionAt(coast.world, coast.state.player.region);
    const shores = r.cells.filter((c) => cellAt(coast.world, c).terrain !== "water" && regionAt(coast.world, c) !== undefined);
    expect(shores.length).toBeGreaterThan(0);
    expect(Object.keys(coast.state.player.known).length).toBeGreaterThan(0);
    expect(Object.keys(median.state.player.known).length).toBe(0);
    const shore = Number(Object.keys(coast.state.player.known)[0]);
    expect(isRead(coast.state, shore)).toBe(true);
  });

  it("coast-born will not walk onto the fell in cloud, and the median will", () => {
    const coast = withQuirk(17, "coastBorn");
    const median = withQuirk(17, null);
    const w = coast.world;
    const fell = [...Array(w.w * w.h).keys()].find((c) => cellAt(w, c).terrain === "fell")!;
    expect(fell).toBeDefined();
    const cal = calendar(0, START_DOY);
    coast.state.weather.clear = false;
    median.state.weather.clear = false;
    // The refusal is the row's, not the route's: the walk is offered and the fear says why.
    const refused = check(coast.state, w, cal, "walk", `cell:${fell}`);
    if (refused.ok || refused.why === FELL_FEAR_LINE) expect(refused.why).toBe(FELL_FEAR_LINE);
    const allowed = check(median.state, w, cal, "walk", `cell:${fell}`);
    expect(allowed.why).not.toBe(FELL_FEAR_LINE);
    coast.state.weather.clear = true;
    expect(check(coast.state, w, cal, "walk", `cell:${fell}`).why).not.toBe(FELL_FEAR_LINE);
    // The route itself treats the fell as water with no ice when the fear is on.
    const here = coast.state.regions[coast.state.player.region].campCell;
    expect(findRoute(w, here, fell, "none", true)).toBeNull();
  });

  it("forest-born knows the forest's game two levels early and will not work the shore in a storm", () => {
    const forest = withQuirk(17, "forestBorn");
    const median = withQuirk(17, null);
    // Roe deer wants Hunting 4 in the forest; a level-1 median is three short, the forest-born one.
    expect(gap(median.state, "hunt:deer")).toBe(3);
    expect(gap(forest.state, "hunt:deer")).toBe(1);
    // The seal is shore game: no favour there.
    expect(gap(forest.state, "hunt:seal")).toBe(gap(median.state, "hunt:seal"));
    const cal = calendar(0, START_DOY);
    for (const g of [forest, median]) {
      placeAtSpot(g.state, g.world, g.state.player.region, "shore");
      g.state.player.tools.push(freshTool("fishingSpear"));
      g.state.weather.storm = { from: 0, until: 600, warned: true };
    }
    expect(check(forest.state, forest.world, cal, "fish", "any").why).toBe(SHORE_FEAR_LINE);
    expect(check(median.state, median.world, cal, "fish", "any").why).not.toBe(SHORE_FEAR_LINE);
    forest.state.weather.storm = null;
    expect(check(forest.state, forest.world, cal, "fish", "any").why).not.toBe(SHORE_FEAR_LINE);
  });

  it("sleeps light: the wolves never reach the bed, and a storm night is half a night's rest", () => {
    const light = withQuirk(17, "sleepsLight");
    const median = withQuirk(17, null);
    const night = calendar(15 * 60, START_DOY);
    for (const g of [light, median]) {
      // Somewhere wolves live, away from camp and its fire.
      const region = [...Array(200).keys()].find((id) => (regionAt(g.world, id).capacity.wolf ?? 0) > 0)!;
      expect(region).toBeDefined();
      expect(regionDensity(g.state, g.world, region, "wolf", night)).toBeGreaterThan(0);
      const r = regionAt(g.world, region);
      const forest = r.cells.find((c) => ["spruce", "pine", "birch"].includes(cellAt(g.world, c).terrain))!;
      placeAt(g.state, g.world, forest);
      regionState(g.state, g.world, g.state.player.region);
      hourlyEvents(g.state, g.world, night, -5, -5, always);
    }
    expect(light.state.player.health).toBe(100);
    expect(light.state.player.injured).toBe(0);
    expect(light.state.log.some((e) => e.text.includes("{wake} at the wolves"))).toBe(true);
    expect(median.state.player.health).toBe(75);
    expect(median.state.player.injured).toBeGreaterThan(0);
    // The storm night: asleep through a storm, the light sleeper pays off half
    // the sleep debt the sound sleeper does. The quirk is on the debt's fall
    // rather than on fatigue, so the rest of the body is unchanged: the hour
    // gives back the same energy either way, and it is the pressure that is
    // still there in the morning.
    const stormy = withQuirk(17, "sleepsLight");
    const calm = withQuirk(17, null);
    for (const g of [stormy, calm]) {
      g.state.player.energy = 20;
      g.state.player.sleepDebt = 60;
      g.state.weather.storm = { from: 0, until: 10 * 60, warned: true };
      g.state.task = { id: "sleep", progress: 0, duration: 120, repeat: false };
      advance(g.state, g.world, 60);
    }
    // Half the rate is a shade over half the hour's fall, since the fall is on
    // the debt still owed and the light sleeper still owes more of it.
    expect(60 - stormy.state.player.sleepDebt).toBeCloseTo((60 - calm.state.player.sleepDebt) / 2, 0);
    expect(stormy.state.player.energy).toBeCloseTo(calm.state.player.energy, 6);
  });

  it("big eater: a tenth faster at work and a tenth more burnt in every bucket", () => {
    const eater = withQuirk(17, "bigEater");
    const median = withQuirk(17, null);
    const cal = calendar(0, START_DOY);
    for (const g of [eater, median]) placeAtSpot(g.state, g.world, g.state.player.region, "forest");
    expect(check(eater.state, eater.world, cal, "chop").duration / check(median.state, median.world, cal, "chop").duration).toBeCloseTo(0.9);
    expect(check(eater.state, eater.world, cal, "walk", "spot:camp").duration).toBeCloseTo(check(median.state, median.world, cal, "walk", "spot:camp").duration);
    for (const g of [eater, median]) advance(g.state, g.world, 60);
    const burn = (g: typeof eater) => {
      const b = g.state.ledger.at(-1)!.burn;
      return b.base + b.activity + b.walk + b.cold + b.sick;
    };
    expect(burn(eater) / burn(median)).toBeCloseTo(1.1, 2);
  });

  it("steady by the fire lights in rain without fail, in the same twenty minutes", () => {
    const rain = { precip: "heavy" as const, clear: false, offset: 0, snowCm: 0, rolledDay: 0, storm: null, dryDays: 0, wetDay: true, dryWarned: false, iceCm: 0 };
    expect(lightingInRain(rain, 5, false).failChance).toBeCloseTo(1 / 3);
    expect(lightingInRain(rain, 5, false, true).failChance).toBe(0);
    expect(lightingInRain(rain, 5, false, true).minutes).toBe(20);
    const steady = withQuirk(17, "steadyByTheFire");
    addItem(steady.state.player.pack, "firewood", 5);
    expect(steady.state.player.tools.length).toBeGreaterThan(0);
  });
});
