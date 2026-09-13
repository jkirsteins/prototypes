import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { knownShare, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { current } from "../src/sim/record";
import { levelMinutes, skillLevel } from "../src/sim/skills";
import { exploreInjuryChance, stepTask } from "../src/sim/tasks";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

type G = ReturnType<typeof newGame>;
const ROUGH = ["fell", "rock", "bog"];

function partlyKnownNeighbour(g: G): number {
  const { state, world } = g;
  const home = regionAt(world, state.player.region);
  const nb = home.neighbours.find((n) => {
    const s = knownShare(state, world, n.id);
    return s > 0 && s < 1;
  });
  if (nb) return nb.id;
  const target = home.neighbours[0].id;
  markKnown(state, regionAt(world, target).cells[0]);
  return target;
}

/** Rough footing with more of the same a step away, so a minute's walk is a minute on rough ground. */
function roughFooting(world: World, region: number): { cell: number; next: number } {
  for (const cell of regionAt(world, region).cells) {
    if (!ROUGH.includes(cellAt(world, cell).terrain)) continue;
    const next = neighbours(world, cell).find((n) => ROUGH.includes(cellAt(world, n).terrain));
    if (next !== undefined) return { cell, next };
  }
  throw new Error("reference seed no longer has rough footing with more rough ground beside it");
}

/** A sweep one minute short of the hour turn, walking from `cell` to `next`. */
function sweeping(g: G, region: number, cell: number, next: number): void {
  g.state.task = { id: "explore", arg: `region:${region}`, progress: 59, duration: 1e9, repeat: false };
  g.state.route = { target: next, path: [next], walked: [cell], label: "test", ice: "none", lastLand: cell };
}

describe("wayfinding on bad ground", () => {
  it("counts the minutes walked on rough ground rather than the patch the hour ends on", () => {
    const g = newGame(19);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const { cell, next } = roughFooting(world, region);

    placeAt(state, world, cell);
    sweeping(g, region, cell, next);
    state.task!.progress = 10;
    stepTask(state, world, calendar(state.minute), new Rng(1), 1);
    expect(state.task!.roughMinutes).toBe(1);
  });

  it("hurts a novice who spent the hour on it, and rarely a master", () => {
    const g = newGame(19);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const { cell, next } = roughFooting(world, region);

    placeAt(state, world, cell);
    sweeping(g, region, cell, next);
    // The hour behind this minute was walked on rough ground, which is what the
    // roll is over; the cap makes the minute about to be added spare.
    state.task!.roughMinutes = 60;

    expect(exploreInjuryChance(1)).toBeGreaterThan(0);
    let seed = 1;
    while (!(new Rng(seed).next() < exploreInjuryChance(1))) seed++;

    stepTask(state, world, calendar(state.minute), new Rng(seed), 1);
    expect(state.player.injured).toBeGreaterThan(0);
    expect(state.log.some((e) => e.kind === "bad" && e.text.includes("hurt"))).toBe(true);
    expect(current(state).events.some((e) => e.kind === "injury")).toBe(true);

    const g2 = newGame(19);
    placeAt(g2.state, g2.world, cell);
    g2.state.skills.wayfinding.xp = levelMinutes(20);
    sweeping(g2, region, cell, next);
    g2.state.task!.roughMinutes = 60;
    expect(exploreInjuryChance(skillLevel(g2.state, "wayfinding"))).toBe(0);
    stepTask(g2.state, g2.world, calendar(g2.state.minute), new Rng(seed), 1);
    expect(g2.state.player.injured).toBe(0);
  });

  it("does not roll on an hour that never touched rough ground", () => {
    const g = newGame(19);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const { cell, next } = roughFooting(world, region);
    placeAt(state, world, cell);
    sweeping(g, region, cell, next);
    state.task!.roughMinutes = 0;
    let seed = 1;
    while (!(new Rng(seed).next() < exploreInjuryChance(1))) seed++;
    stepTask(state, world, calendar(state.minute), new Rng(seed), 1);
    // The one minute walked here is rough, so the hour's share is 1/60 and the
    // seed that would hurt at the full chance does not.
    expect(state.player.injured).toBe(0);
  });
});
