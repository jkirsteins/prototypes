import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { NOT_ORDERS } from "../src/sim/ladder";
import { beginAgain, land } from "../src/sim/landing";
import { knownShare } from "../src/sim/mapped";
import { isRead } from "../src/sim/knowledge";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { placeAt, watersideCell } from "../src/sim/position";
import { current } from "../src/sim/record";
import {
  levelMinutes, masteryKey, MASTERY_KEYS, opensOrders, RUNG_LINE, RUNG_ORDER, skillLevel, skillOf, train,
} from "../src/sim/skills";
import { sightRangeCells } from "../src/sim/sight";
import { exploreInjuryChance, startTask, stepTask } from "../src/sim/tasks";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
import { siteCamp } from "./siting-helpers";

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

/** A cell with a real (non-spruce) base sight range: spruce's own base is 0, and 0 times any multiplier is still 0. */
function openFooting(world: World, region: number): number {
  const cell = regionAt(world, region).cells.find((c) => {
    const t = cellAt(world, c).terrain;
    return t === "meadow" || t === "rock" || t === "fell";
  });
  if (cell === undefined) throw new Error("reference seed no longer has open ground to read sight range from");
  return cell;
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
    siteCamp(g.state, g.world);
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
    expect(MASTERY_KEYS.wayfinding).toEqual(["explore", "searchHome"]);
  });

  it("runs Read water as real Fishing work inside one survey row", () => {
    const { state, world } = newGame(4);
    const region = state.player.region;
    const shore = regionAt(world, region).cells.find((cell) => watersideCell(world, cell));
    expect(shore).toBeDefined();
    placeAt(state, world, shore!);
    state.task = {
      id: "explore", arg: `region:${region}`, progress: 0, duration: 60, repeat: false,
      visited: [shore!], surveyPhase: "read", surveyedWater: [], surveyWater: shore!, surveyShore: shore!, surveyProgress: 0,
    };
    const beforeWayfinding = state.skills.wayfinding.xp;
    stepTask(state, world, calendar(state.minute), new Rng(1), 60);
    expect(isRead(state, shore!)).toBe(true);
    expect(state.skills.fishing.xp).toBeGreaterThan(0);
    expect(state.skills.fishing.mastery.read).toBeGreaterThan(0);
    expect(state.skills.wayfinding.xp).toBe(beforeWayfinding);
  });

  it("opens no orders, and logs no rung it does not have", () => {
    expect(opensOrders("wayfinding")).toBe(false);
    expect(opensOrders("woodcraft")).toBe(true);

    const g = newGame(4);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    expect(startTask(state, world, calendar(state.minute), "explore", `region:${region}`)).toBe(true);
    state.skills.wayfinding.xp = levelMinutes(20) - 1;
    train(state, world, 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain("Wayfinding 20.");
    for (const k of RUNG_ORDER) expect(texts).not.toContain(RUNG_LINE[k]("Wayfinding"));

    // Survey is visible, but it has no order expansion: it is manual one-time work.
    expect(NOT_ORDERS).toContain("explore");
    const ui = newUiState();
    ui.panes = { pane: "do", subtab: "Explore", purpose: "Wayfinding" };
    const html = doHtml(state, world, calendar(state.minute), ui);
    expect(html).toContain('data-id="explore"');
    expect(html).not.toContain('data-act="row-more" data-id="explore"');
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

  it("reads farther with practice, capped at the sharp-eyed 1.5x by level 20", () => {
    const g = newGame(4);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const cal = calendar(state.minute);
    const cell = openFooting(world, state.player.region);
    const at = (level: number) => {
      state.skills.wayfinding.xp = levelMinutes(level);
      return sightRangeCells(state, world, cal, cell);
    };
    const l1 = at(1);
    const l10 = at(10);
    const l20 = at(20);
    expect(l10).toBeGreaterThan(l1);
    expect(l20).toBeGreaterThan(l10);
    // RUNG_LEVEL.pace (20) is the last rung, "fully practised": the
    // multiplier stops climbing there rather than still growing toward
    // the skill cap (50).
    expect(at(25)).toBe(l20);
    expect(at(50)).toBe(l20);
  });

  // Whether that wider eye actually shortens the sweep is measured across
  // seeds 1..12 at levels 1, 10 and 20 (RUNG_LEVEL.pace, "fully
  // practised", the multiplier's own cap): see
  // tests/slow/wayfinding-vantage.test.ts (npm run test:slow) - real
  // simulated minutes across 12 seeds at three levels is real wall-clock
  // time, so it sits behind that rather than taxing every npm test.
  // Honest finding there, even at full practice: the sweep does not
  // shorten. Wayfinding's speed promise is not delivered by the code as
  // it stands; see the task-6 report for the full table and reasoning.

  it("hurts a novice on bad ground and rarely a master", () => {
    const g = newGame(19);
    siteCamp(g.state, g.world);
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
