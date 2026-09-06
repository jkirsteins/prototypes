import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { PRODUCERS } from "../src/sim/capabilities";
import { resolveCell } from "../src/sim/intent";
import { addItem, freshTool, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { SEEP, SEEP_DRY_DAYS, SEEP_LIFE_DAYS, seepGround, seepNeedsRedig, seepStopped, stepSeeps } from "../src/sim/seep";
import { check, startTask } from "../src/sim/tasks";
import { drink, fillVessels, FREEZE_C, sourceLitres, waterSource } from "../src/sim/water";
import { MARKS } from "../src/ui/map";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";

const cal = calendar(0);

/** The first cell in the start region matching the terrain test, given the cell's terrain and its neighbours'. */
function findCell(world: World, ok: (t: string, nb: string[]) => boolean): number {
  const r = regionAt(world, world.start);
  for (const c of r.cells) {
    const nb = neighbours(world, c).map((n) => cellAt(world, n).terrain);
    if (ok(cellAt(world, c).terrain, nb)) return c;
  }
  throw new Error("no such cell in the start region");
}
/** The first wet cell of the start region: damp spruce on the reference seeds, whose start regions are forest with no bog. */
function wetCell(world: World): number {
  const c = regionAt(world, world.start).cells.find((c) => seepGround(world, c) !== null);
  if (c === undefined) throw new Error("no wet cell in the start region");
  return c;
}

describe("seep ground", () => {
  it("is bog on a bog, damp in spruce, and nothing on pine or a shore", () => {
    const { world } = newGame(17);
    // The start regions are forest with no bog of their own; find one in the world.
    let bog = -1;
    for (let idx = 0; idx < world.w * world.h && bog < 0; idx += 7) {
      if (cellAt(world, idx).terrain === "bog" && !neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water")) bog = idx;
    }
    if (bog >= 0) expect(seepGround(world, bog)).toBe("bog");
    expect(seepGround(world, findCell(world, (t, nb) => t === "spruce" && !nb.includes("water")))).toBe("damp");
    expect(seepGround(world, findCell(world, (t, nb) => t === "pine" && !nb.includes("water")))).toBeNull();
    expect(seepGround(world, findCell(world, (t, nb) => t !== "water" && nb.includes("water")))).toBeNull();
  });
});

describe("a seep", () => {
  function dug(seed = 17) {
    const g = newGame(seed);
    const cell = wetCell(g.world);
    g.state.seeps[cell] = { class: seepGround(g.world, cell)!, litres: 0, ice: 0, dug: g.state.minute };
    return { ...g, cell };
  }

  it("refills at its class rate and stops at the pool", () => {
    const { state, world, cell } = dug();
    const cls = state.seeps[cell].class;
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBeCloseTo(SEEP[cls].refillLPerHour, 5);
    stepSeeps(state, world, 10, 60 * 24);
    expect(state.seeps[cell].litres).toBe(SEEP[cls].poolL);
  });

  it("freezes in place under the freezing line with no fire on its cell, and thaws by one", () => {
    const { state, world, cell } = dug();
    state.seeps[cell].litres = 4;
    stepSeeps(state, world, FREEZE_C - 1, 60);
    expect(state.seeps[cell].litres).toBe(0);
    expect(state.seeps[cell].ice).toBe(4);
    expect(seepStopped(state, world, cell, FREEZE_C - 1)).toBe("frozen");
    stepSeeps(state, world, 2, 60);
    expect(state.seeps[cell].ice).toBeCloseTo(2, 5);
    expect(state.seeps[cell].litres).toBeGreaterThan(2);
  });

  it("stops refilling after the dry spell and starts again with rain", () => {
    const { state, world, cell } = dug();
    state.weather.dryDays = SEEP_DRY_DAYS;
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBe(0);
    expect(seepStopped(state, world, cell, 10)).toBe("drought");
    state.weather.dryDays = 0;
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBeGreaterThan(0);
  });

  it("wants re-digging past two thirds of a year and silts up past a year", () => {
    const { state, world, cell } = dug();
    state.minute = Math.ceil((SEEP_LIFE_DAYS * 1440 * 2) / 3);
    expect(seepNeedsRedig(state, state.seeps[cell])).toBe(true);
    expect(seepStopped(state, world, cell, 10)).toBeNull();
    state.minute = SEEP_LIFE_DAYS * 1440;
    expect(seepStopped(state, world, cell, 10)).toBe("silted");
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBe(0);
  });

  it("ticks with the world, and an old save loads with no seeps", () => {
    const { state, world, cell } = dug();
    placeAt(state, world, regionState(state, world, state.player.region).campCell);
    advance(state, world, 60);
    expect(state.seeps[cell].litres).toBeGreaterThan(0);
    const raw = JSON.parse(serialize(state));
    delete raw.state.seeps;
    expect(deserialize(JSON.stringify(raw))!.state.seeps).toEqual({});
  });
});

describe("drinking from a seep", () => {
  it("a drink takes the pool and no more, and a fill leaves with what the pool had", () => {
    const { state, world } = newGame(17);
    const cell = wetCell(world);
    state.seeps[cell] = { class: seepGround(world, cell)!, litres: 2, ice: 0, dug: state.minute };
    placeAt(state, world, cell);
    state.player.water = 0.5;
    expect(sourceLitres(state, world)).toBe(2);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBeCloseTo(2.5, 5);
    expect(state.seeps[cell].litres).toBe(0);
    state.seeps[cell].litres = 2;
    state.player.tools.push(freshTool("waterskin"));
    expect(fillVessels(state, world)).toBeCloseTo(2, 5);
    expect(state.seeps[cell].litres).toBe(0);
    expect(waterSource(state, world)).toBe(false);
  });

  it("the seep row goes to the nearest seep that holds water, and is greyed with why when none does", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.player.tools.push(freshTool("barkBucket"));
    expect(check(state, world, cal, "fill", "seep").why).toBe("no seep dug");
    const cell = wetCell(world);
    state.seeps[cell] = { class: seepGround(world, cell)!, litres: 0, ice: 0, dug: state.minute };
    expect(resolveCell(state, world, cal, "fill", "seep", "nearest").cell).toBe(cell);
    expect(check(state, world, cal, "fill", "seep", cell).why).toBe("the seep is empty");
    state.seeps[cell].ice = 3;
    expect(check(state, world, cal, "fill", "seep", cell).why).toBe("the seep is frozen");
    state.seeps[cell].ice = 0;
    state.seeps[cell].litres = 5;
    const o = check(state, world, cal, "fill", "seep", cell);
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Fetch water from the seep");
  });
});

describe("digging a seep", () => {
  function ready(seed = 17) {
    const g = newGame(seed);
    const cell = wetCell(g.world);
    placeAt(g.state, g.world, cell);
    g.state.player.tools.push(freshTool("barkBucket"));
    addItem(g.state.player.pack, "stick", 4);
    return { ...g, cell };
  }

  it("is legal on wet ground with sticks and a bucket, refused on dry ground, on a shore, and where one stands", () => {
    const { state, world, cell } = ready();
    const o = check(state, world, cal, "build", "seep");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Dig a seep");
    expect(o.detail).toMatch(/10 l pool, \+[13] l\/h/);
    const pine = findCell(world, (t, nb) => t === "pine" && !nb.includes("water"));
    expect(check(state, world, cal, "build", "seep", pine).why).toBe("dry ground");
    const shore = findCell(world, (t, nb) => t !== "water" && nb.includes("water"));
    expect(check(state, world, cal, "build", "seep", shore).why).toBe("the shore is here");
    state.seeps[cell] = { class: seepGround(world, cell)!, litres: 0, ice: 0, dug: 0 };
    expect(check(state, world, cal, "build", "seep").why).toBe("a seep is here already");
  });

  it("four hours of digging leave a seep on the cell with an empty pool", () => {
    const { state, world, cell } = ready();
    expect(startTask(state, world, cal, "build", "seep")).toBe(true);
    expect(state.task?.duration).toBeCloseTo(240, 0);
    advance(state, world, 240);
    expect(state.seeps[cell]).toMatchObject({ class: seepGround(world, cell), ice: 0 });
    expect(state.seeps[cell].litres).toBeLessThan(1);
    expect(qty(state.player.pack, "stick")).toBe(0);
  });

  it("the dig order walks to the nearest wet cell without a seep", () => {
    const { state, world } = ready();
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    const target = resolveCell(state, world, cal, "build", "seep", "nearest").cell;
    expect(seepGround(world, target)).not.toBeNull();
    expect(state.seeps[target]).toBeUndefined();
    expect(cellAt(world, target).region).toBe(state.player.region);
  });

  it("re-digging is offered on the seep's cell past two thirds of its life and resets its clock", () => {
    const { state, world, cell } = ready();
    state.seeps[cell] = { class: seepGround(world, cell)!, litres: 3, ice: 0, dug: 0 };
    expect(check(state, world, cal, "mend", "seep").why).toBe("holds well enough");
    state.minute = SEEP_LIFE_DAYS * 1440;
    const o = check(state, world, cal, "mend", "seep");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Re-dig the seep");
    startTask(state, world, cal, "mend", "seep");
    advance(state, world, 60);
    expect(state.seeps[cell].dug).toBeGreaterThanOrEqual(SEEP_LIFE_DAYS * 1440);
    placeAt(state, world, regionState(state, world, state.player.region).campCell);
    expect(check(state, world, cal, "mend", "seep").why).toBe("no seep here");
  });

  it("is marked on the map and has a producer row", () => {
    expect(MARKS.seep).toEqual({ glyph: "s", cls: "mk-seep", label: "seep" });
    expect(PRODUCERS).toContain("seep");
  });
});
