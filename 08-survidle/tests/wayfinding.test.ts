import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { NOT_ORDERS } from "../src/sim/ladder";
import { beginAgain, land } from "../src/sim/landing";
import { knownShare } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { placeAt } from "../src/sim/position";
import { current } from "../src/sim/record";
import {
  levelMinutes, masteryKey, MASTERY_KEYS, opensOrders, RUNG_LINE, RUNG_ORDER, skillLevel, skillOf, train,
} from "../src/sim/skills";
import { exploreInjuryChance, startTask, stepTask } from "../src/sim/tasks";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";
import { passable } from "../src/world/route";

type G = ReturnType<typeof newGame>;

/** A neighbouring region already glimpsed a little, the same toehold explore.test.ts starts a sweep from. */
function partlyKnownNeighbour(g: G): number {
  const { state, world } = g;
  const home = regionAt(world, state.player.region);
  const nb = home.neighbours.find((n) => {
    const s = knownShare(state, world, n.id);
    return s > 0 && s < 1;
  });
  if (!nb) throw new Error("reference seed no longer leaves a neighbour partly seen at landing");
  return nb.id;
}

/** Drives the current explore task to its end, minute by minute; the real elapsed minutes. */
function driveExplore(g: G, maxMinutes = 40000): number {
  const { state, world } = g;
  const rng = new Rng(1);
  let minutes = 0;
  for (; minutes < maxMinutes && state.task; minutes++) stepTask(state, world, calendar(state.minute), rng, 1);
  return minutes;
}

/** A passable fell/rock/bog cell in the region, with a passable neighbour a step can be aimed at. */
function roughFooting(world: World, region: number): { cell: number; next: number } {
  for (const cell of regionAt(world, region).cells) {
    const t = cellAt(world, cell).terrain;
    if (t !== "fell" && t !== "rock" && t !== "bog") continue;
    const next = neighbours(world, cell).find((n) => passable(cellAt(world, n).terrain));
    if (next !== undefined) return { cell, next };
  }
  throw new Error("reference seed no longer has rough footing in this region");
}

describe("wayfinding", () => {
  it("practises by exploring and not by walking", () => {
    const g = newGame(4);
    const { state, world } = g;

    startTask(state, world, calendar(state.minute), "walk", "spot:forest");
    const rng = new Rng(1);
    for (let m = 0; m < 5 && state.task; m++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(state.skills.wayfinding.xp).toBe(0);

    const region = partlyKnownNeighbour(g);
    expect(startTask(state, world, calendar(state.minute), "explore", `region:${region}`)).toBe(true);
    for (let m = 0; m < 5 && state.task; m++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(state.skills.wayfinding.xp).toBeGreaterThan(0);
  });

  it("is the skill behind exploring", () => {
    expect(skillOf("explore")).toBe("wayfinding");
    expect(masteryKey({} as never, {} as never, "explore")).toBe("explore");
    expect(MASTERY_KEYS.wayfinding).toEqual(["explore"]);
  });

  it("opens no orders, and logs no rung it does not have", () => {
    expect(opensOrders("wayfinding")).toBe(false);
    expect(opensOrders("woodcraft")).toBe(true);

    const g = newGame(4);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    expect(startTask(state, world, calendar(state.minute), "explore", `region:${region}`)).toBe(true);
    state.skills.wayfinding.xp = levelMinutes(20) - 1;
    train(state, world, 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain("Wayfinding 20.");
    for (const k of RUNG_ORDER) expect(texts).not.toContain(RUNG_LINE[k]("Wayfinding"));

    // No order button appears for exploring either: the runner's own move, never a standing order.
    expect(NOT_ORDERS).toContain("explore");
    const ui = newUiState();
    ui.tab = "move";
    ui.advanced = true;
    expect(doHtml(state, world, calendar(state.minute), ui)).not.toContain('data-id="explore"');
  });

  it("carrying a wayfinding level to an heir logs no rung either", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "wayfinding", 20);
    advance(state, world, 60);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world);
    const texts = state.log.map((e) => e.text);
    for (const k of RUNG_ORDER) expect(texts).not.toContain(RUNG_LINE[k]("Wayfinding"));
  });

  it("weighs more vantages with level, so the sweep gets shorter", () => {
    // Reference seed 47: level 10 finds a materially shorter sweep than level 1
    // over the same region. The candidate pool grows with level but the pick
    // is not guaranteed shorter in general (a farther, better-seeing vantage
    // can cost more to reach than it saves) - this seed demonstrates the
    // order the brief asks for, not a universal bound.
    const g1 = newGame(47);
    const region1 = partlyKnownNeighbour(g1);
    expect(startTask(g1.state, g1.world, calendar(0), "explore", `region:${region1}`)).toBe(true);
    const m1 = driveExplore(g1);

    const g2 = newGame(47);
    const region2 = partlyKnownNeighbour(g2);
    g2.state.skills.wayfinding.xp = levelMinutes(10);
    expect(startTask(g2.state, g2.world, calendar(0), "explore", `region:${region2}`)).toBe(true);
    const m2 = driveExplore(g2);

    expect(m2).toBeLessThan(m1);
  });

  it("hurts a novice on bad ground and rarely a master", () => {
    const g = newGame(19);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const { cell, next } = roughFooting(world, region);

    placeAt(state, world, cell);
    state.task = { id: "explore", arg: `region:${region}`, progress: 59, duration: 1e9, repeat: false };
    state.route = { target: next, path: [next], walked: [cell], label: "test", ice: "none", lastLand: cell };

    // The only rng draw on this tick is the injury roll (dry land, no ice
    // crossing): find a seed whose first roll lands inside the novice's chance.
    let seed = 1;
    while (!(new Rng(seed).next() < exploreInjuryChance(1))) seed++;

    stepTask(state, world, calendar(state.minute), new Rng(seed), 1);
    expect(state.player.injured).toBeGreaterThan(0);
    expect(state.log.some((e) => e.kind === "bad" && e.text.includes("hurt"))).toBe(true);
    expect(current(state).events.some((e) => e.kind === "injury")).toBe(true);

    const g2 = newGame(19);
    const state2 = g2.state;
    const world2 = g2.world;
    placeAt(state2, world2, cell);
    state2.skills.wayfinding.xp = levelMinutes(20);
    state2.task = { id: "explore", arg: `region:${region}`, progress: 59, duration: 1e9, repeat: false };
    state2.route = { target: next, path: [next], walked: [cell], label: "test", ice: "none", lastLand: cell };
    expect(exploreInjuryChance(skillLevel(state2, "wayfinding"))).toBe(0);
    stepTask(state2, world2, calendar(state2.minute), new Rng(seed), 1);
    expect(state2.player.injured).toBe(0);
  });
});
