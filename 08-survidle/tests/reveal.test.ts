/**
 * Which opportunity puts each Do row on the board.
 *
 * Day 1 drew 84 rows and 12 could be started; Make offered 22 recipes and
 * none of them. The answer is to gate a row on the opportunity that names
 * it, and the only failure mode that design has is a revealed action
 * blocked by an unrevealed one. These tests forbid exactly that.
 *
 * They are tests and not prose for the reason `tests/purpose.test.ts` is:
 * a row that no opportunity reveals is an action no run can reach, and
 * nobody would notice until a player went looking for it.
 *
 * This first pass only measures. It prints the gap so the opportunities
 * that still have to be authored name themselves, and asserts nothing
 * about REVEAL, which does not exist yet.
 */
import { describe, expect, it } from "vitest";
import { RECIPE_IDS, RECIPES, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { DAY_ONE_CAPABILITY_KEYS } from "../src/sim/opportunity-catalog";
import { fishSpecies, huntedLand } from "../src/sim/species";
import type { OpportunityKey, TaskId } from "../src/sim/types";
import { intentGroups } from "../src/ui/dopanel";
import { rowKey } from "../src/ui/purpose";
import { regionAt } from "../src/world/gen";
import { producers, requirementsOf } from "./reveal-graph";

type Row = { id: TaskId; arg?: string };

/**
 * Every row the Do panel can ever draw, built the way
 * `tests/purpose.test.ts` builds it: intentGroups filters species by what
 * a region carries, so a few real regions alone would only check the rows
 * those grounds happen to offer.
 */
function everyRow(): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  const add = (id: TaskId, arg?: string) => {
    const key = rowKey(id, arg);
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

  add("hunt" as TaskId, "any");
  for (const s of huntedLand()) add("hunt" as TaskId, s);
  add("fish" as TaskId, "any");
  for (const s of fishSpecies()) add("fish" as TaskId, s);
  for (const id of RECIPE_IDS) add("craft" as TaskId, id);
  for (const id of STRUCTURE_IDS) add("build" as TaskId, id);

  return rows;
}

/** The keys a fresh world hands over before the player has done anything. */
function dayOneKeys(): Set<OpportunityKey> {
  const { state } = newGame(21);
  return new Set(Object.keys(state.opportunities.discoveredAt) as OpportunityKey[]);
}

describe("the opportunity gap", () => {
  const rows = everyRow();

  it("finds rows at all, so an empty pass cannot read as a pass", () => {
    expect(rows.length).toBeGreaterThan(40);
  });

  it("reports which rows a minute-0 opportunity would fail to gate", () => {
    const seeded = dayOneKeys();
    const dayOne = new Set<OpportunityKey>([...DAY_ONE_CAPABILITY_KEYS, ...seeded]);

    // A make: or build: key exists for these rows today, so they are the
    // ones REVEAL would naturally name - and every one of them is already
    // discovered before the player has done anything.
    const defeated = rows
      .filter((r) => r.id === "craft" || r.id === "build")
      .map((r) => ({ row: rowKey(r.id, r.arg), key: naturalKey(r) }))
      .filter((r) => r.key !== null && dayOne.has(r.key));

    const uncovered = rows
      .filter((r) => r.id === "craft" || r.id === "build")
      .map((r) => ({ row: rowKey(r.id, r.arg), key: naturalKey(r) }))
      .filter((r) => r.key === null || !dayOne.has(r.key));

    console.log(`day-one keys seeded: ${dayOne.size}`);
    console.log(`rows a minute-0 key would fail to gate (${defeated.length}):`);
    console.log(`  ${defeated.map((d) => d.row).join(", ")}`);
    console.log(`craft/build rows with no natural key (${uncovered.length}):`);
    console.log(`  ${uncovered.map((d) => d.row).join(", ")}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("reports rows whose needs no action produces", () => {
    const made = producers();
    const orphans: string[] = [];
    for (const r of rows) {
      const { items, tools } = requirementsOf(r.id, r.arg);
      for (const need of [...items, ...tools]) {
        if (!made.has(need)) orphans.push(`${rowKey(r.id, r.arg)} needs ${need}`);
      }
    }
    console.log(`requirements no action produces (${orphans.length}):`);
    console.log(`  ${orphans.join("\n  ") || "none"}`);
    expect(orphans).toEqual([]);
  });
});

/** The `make:`/`build:` key a craft or build row would naturally be revealed by, if one exists. */
function naturalKey(r: Row): OpportunityKey | null {
  if (r.id === "build" && r.arg) return `build:${r.arg}` as OpportunityKey;
  if (r.id === "craft" && r.arg) {
    const out = RECIPES[r.arg as keyof typeof RECIPES]?.out.item;
    return out ? (`make:${out}` as OpportunityKey) : null;
  }
  return null;
}
