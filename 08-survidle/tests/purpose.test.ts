/**
 * Every Do row has exactly one purpose.
 *
 * The Do panel groups by purpose - Food, Fuel, Water - because a tester
 * who could not find what he wanted in one long list said so plainly:
 * "it's somewhat obscured in a long list of skills/actions, which is the
 * bad part". A row with no purpose would render into no pane and simply
 * be gone, and nobody would notice until a player went looking for it.
 *
 * Prose did not stop that happening to the AI policy in 02-balticmap.
 * This is a test for the same reason POLICY_COVERAGE is.
 */
import { describe, expect, it } from "vitest";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { fishSpecies, huntedLand } from "../src/sim/species";
import type { TaskId } from "../src/sim/types";
import { intentGroups } from "../src/ui/dopanel";
import { PURPOSES, purposeOf, SUBTABS, subtabOf } from "../src/ui/purpose";
import { regionAt } from "../src/world/gen";

type Row = { id: TaskId; arg?: string };

/**
 * Every row the Do panel can ever draw.
 *
 * intentGroups filters its species by what a region carries, so walking a
 * couple of real regions would only ever check the rows those grounds
 * happen to offer - and a row that has no home is exactly the sort of
 * thing that only appears on the one map nobody tested. So the universe
 * is built from the same sources intentGroups draws from, and a few real
 * regions are folded in on top to catch anything the lists miss.
 */
function everyRow(): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  const add = (id: TaskId, arg?: string) => {
    const key = `${id}:${arg ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ id, arg });
  };

  for (const seed of [21, 3, 79]) {
    const { state, world } = newGame(seed);
    const here = regionAt(world, state.player.region);
    for (const r of [here, ...here.neighbours.map((n) => regionAt(world, n.id))]) {
      for (const g of intentGroups(r)) for (const item of g.items) add(item.id, item.arg);
    }
  }

  // The species and the recipes in full, whatever any one ground carries.
  add("hunt" as TaskId, "any");
  for (const s of huntedLand()) add("hunt" as TaskId, s);
  add("fish" as TaskId, "any");
  for (const s of fishSpecies()) add("fish" as TaskId, s);
  for (const id of RECIPE_IDS) add("craft" as TaskId, id);
  for (const id of STRUCTURE_IDS) add("build" as TaskId, id);

  return rows;
}

describe("every Do row has exactly one purpose", () => {
  const rows = everyRow();

  it("finds rows at all, so an empty pass cannot read as a pass", () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it("no row falls through", () => {
    const homeless = rows.filter((r) => purposeOf(r.id, r.arg) === null).map((r) => `${r.id}:${r.arg ?? ""}`);
    expect(homeless).toEqual([]);
  });

  it("every row's purpose is one its subtab offers", () => {
    const wrong = rows
      .filter((r) => {
        const sub = subtabOf(r.id, r.arg);
        return sub === null || !PURPOSES[sub].includes(purposeOf(r.id, r.arg) as string);
      })
      .map((r) => `${r.id}:${r.arg ?? ""}`);
    expect(wrong).toEqual([]);
  });

  it("no purpose pane is empty", () => {
    const empty = SUBTABS.flatMap((s) =>
      PURPOSES[s]
        .filter((p) => !rows.some((r) => subtabOf(r.id, r.arg) === s && purposeOf(r.id, r.arg) === p))
        .map((p) => `${s}/${p}`),
    );
    expect(empty).toEqual([]);
  });

  it("makeCamp is siting, so it sits under Build and not among the chores", () => {
    expect(subtabOf("makeCamp")).toBe("Build");
    expect(purposeOf("makeCamp")).toBe("Site");
  });

  it("finding shelter has one visible home under Explore", () => {
    expect(subtabOf("findShelter")).toBe("Explore");
    expect(purposeOf("findShelter")).toBe("Shelter");
    expect(PURPOSES.Explore).toContain("Shelter");
  });

  it("improving shelter has one visible home under Build", () => {
    expect(subtabOf("improveCover")).toBe("Build");
    expect(purposeOf("improveCover")).toBe("Shelter");
    expect(PURPOSES.Build).toContain("Shelter");
  });

  it("an arg-keyed row beats its bare task, which is how every hunt species shares one line", () => {
    // craft is Make whatever the recipe; the recipe decides which pane.
    expect(purposeOf("craft", "knife")).toBe("Tools");
    expect(purposeOf("craft", "hideCoat")).toBe("Clothing");
    // hunt has no per-species entry: they are all game.
    expect(purposeOf("hunt", "elk")).toBe("Game");
  });
});
