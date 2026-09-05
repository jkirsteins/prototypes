import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { trapDraws, trapFactor } from "../src/sim/camp";
import { resolveCell, yieldItem } from "../src/sim/intent";
import { addItem, pile, qty } from "../src/sim/inventory";
import { TRAP_HOLD_KG } from "../src/sim/items";
import { readShore } from "../src/sim/knowledge";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { ICE_SHORE_CM } from "../src/sim/water";

const cal = calendar(0);
type G = ReturnType<typeof newGame>;
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}

/** Seed 4's start region has a lake: the player on its shore, the shore read, a basket in the pack, and the lake full of fish. */
function readyToSet() {
  const g = newGame(4);
  placeAtSpot(g.state, g.world, g.state.player.region, "shore");
  const cell = cellOf(g.state, g.world);
  const obs = readShore(g.state, g.world, cell);
  const st = regionState(g.state, g.world, g.state.player.region);
  for (const s of obs.fish) st.pop[s] = 50;
  addItem(g.state.player.pack, "basketTrap", 1);
  return { ...g, cell, st, obs };
}

/**
 * Like readyToSet, but 20 July: open water for months, so a multi-day
 * advance never runs into seed 4's April cold snap (the shore ices over,
 * and an idle player freezes, within the game's first two dawns - both
 * pre-existing weather, unrelated to the trap). The two tests that drive
 * the trap across real simulated days use this start instead.
 */
function readyToSetInJuly() {
  const g = newGame(4, 200);
  placeAtSpot(g.state, g.world, g.state.player.region, "shore");
  const cell = cellOf(g.state, g.world);
  const obs = readShore(g.state, g.world, cell);
  const st = regionState(g.state, g.world, g.state.player.region);
  for (const s of obs.fish) st.pop[s] = 50;
  addItem(g.state.player.pack, "basketTrap", 1);
  return { ...g, cell, st, obs };
}

function setTrap(g: ReturnType<typeof readyToSet>) {
  expect(startTask(g.state, g.world, cal, "setTrap")).toBe(true);
  advance(g.state, g.world, 20);
  expect(g.st.trap).not.toBeNull();
}

describe("the basket trap", () => {
  it("sets at a read shore with fish and a basket in reach, once per region", () => {
    const g = readyToSet();
    const { state, world, cell, st } = g;
    expect(check(state, world, cal, "setTrap")).toMatchObject({ ok: true, duration: 20 });
    setTrap(g);
    expect(st.trap).toMatchObject({ cell, kg: 0 });
    expect(st.trap!.fish).toEqual(g.obs.fish);
    expect(qty(state.player.pack, "basketTrap")).toBe(0);
    expect(check(state, world, cal, "setTrap").why).toMatch(/already/);
  });

  it("refuses an unread shore, an empty water, ice, and no basket, in that order of reasons", () => {
    const g = newGame(4);
    placeAtSpot(g.state, g.world, g.state.player.region, "shore");
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "read the water first" });
    const cell = cellOf(g.state, g.world);
    readShore(g.state, g.world, cell);
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "needs a basket trap" });
    g.state.player.known[cell].fish = [];
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "nothing lives in this water" });
    g.state.weather.iceCm = ICE_SHORE_CM;
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "the water is under ice" });
  });

  it("draws at dawn, stops at the hold, and the rate steps with level and mastery", () => {
    const g = readyToSetInJuly();
    setTrap(g);
    advance(g.state, g.world, 10 * 1440);
    expect(g.st.trap!.kg).toBeGreaterThan(0);
    expect(g.st.trap!.kg).toBeLessThanOrEqual(TRAP_HOLD_KG);
    g.st.trap!.kg = TRAP_HOLD_KG;
    advance(g.state, g.world, 3 * 1440);
    expect(g.st.trap!.kg).toBe(TRAP_HOLD_KG);
    expect(trapDraws(5)).toBe(4);
    expect(trapDraws(10)).toBe(5);
    expect(trapDraws(25)).toBe(8);
    expect(trapDraws(40)).toBe(8);
    expect(trapFactor(0)).toBe(1);
    expect(trapFactor(20)).toBeCloseTo(4 / 3, 9);
    expect(trapFactor(50)).toBeCloseTo(5 / 3, 9);
  });

  it("keeps drawing with nobody home, at the base rate", () => {
    const g = readyToSetInJuly();
    setTrap(g);
    g.state.dead = { cause: "starved", minute: g.state.minute };
    advance(g.state, g.world, 10 * 1440, { nobody: true });
    expect(g.st.trap!.kg).toBeGreaterThan(0);
  });

  it("empties at the trap cell into the pack as raw fish and credits the trap source", () => {
    const g = readyToSet();
    setTrap(g);
    g.st.trap!.kg = 1.2;
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    expect(check(g.state, g.world, cal, "emptyTrap").why).toMatch(/^walk to the trap/);
    expect(resolveCell(g.state, g.world, cal, "emptyTrap", undefined, "nearest").cell).toBe(g.cell);
    placeAt(g.state, g.world, g.cell);
    expect(check(g.state, g.world, cal, "emptyTrap")).toMatchObject({ ok: true, duration: 15 });
    expect(startTask(g.state, g.world, cal, "emptyTrap")).toBe(true);
    advance(g.state, g.world, 15);
    expect(g.st.trap!.kg).toBe(0);
    expect(qty(g.state.player.pack, "fish")).toBeCloseTo(1.2, 6);
    expect(today(g.state).yield.trap).toBeCloseTo(1200, 6);
    expect(check(g.state, g.world, cal, "emptyTrap")).toMatchObject({ ok: false, why: "the trap is empty" });
    expect(yieldItem("emptyTrap")).toBe("fish");
  });

  it("the ice takes it, and says so", () => {
    const g = readyToSet();
    setTrap(g);
    g.state.weather.iceCm = ICE_SHORE_CM;
    advance(g.state, g.world, 1440);
    expect(g.st.trap).toBeNull();
    expect(g.state.log.some((l) => l.text.includes("The ice has taken the trap"))).toBe(true);
  });

  it("an intent to set the trap goes to the nearest read shore with fish", () => {
    const g = readyToSet();
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    expect(resolveCell(g.state, g.world, cal, "setTrap", undefined, "nearest").cell).toBe(g.cell);
  });

  it("a set-trap order pockets the basket from the camp pile before it leaves, and sets the trap at the read shore", () => {
    const g = newGame(4);
    placeAtSpot(g.state, g.world, g.state.player.region, "shore");
    const cell = cellOf(g.state, g.world);
    const obs = readShore(g.state, g.world, cell);
    const st = regionState(g.state, g.world, g.state.player.region);
    for (const s of obs.fish) st.pop[s] = 50;
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    addItem(pile(g.state, st.campCell), "basketTrap", 1);
    addOrder(g.state, g.world, { task: "setTrap", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(until(g, () => qty(g.state.player.pack, "basketTrap") === 1, 5)).toBe(true);
    expect(qty(pile(g.state, st.campCell), "basketTrap")).toBe(0);
    expect(until(g, () => st.trap !== null, 200)).toBe(true);
    expect(st.trap).toMatchObject({ cell });
  });
});
