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
 * The graph walk these use lives in `tests/reveal-graph.ts` and must never
 * be imported by `src/`. The game's gate is two object lookups; proving the
 * table honest is a question asked once here, not sixty times a second.
 */
import { describe, expect, it } from "vitest";
import { RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { allOpportunityDefs } from "../src/sim/opportunity-catalog";
import { fishSpecies, huntedLand } from "../src/sim/species";
import type { OpportunityKey, TaskId } from "../src/sim/types";
import { intentGroups } from "../src/ui/dopanel";
import { revealOf, rowKey } from "../src/ui/purpose";
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

const ROWS = everyRow();

/** The keys a fresh world hands over before the player has done anything. */
function dayOneKeys(): Set<OpportunityKey> {
  const { state } = newGame(21);
  return new Set(Object.keys(state.opportunities.discoveredAt) as OpportunityKey[]);
}

describe("every Do row is revealed by exactly one opportunity", () => {
  it("finds rows at all, so an empty pass cannot read as a pass", () => {
    expect(ROWS.length).toBeGreaterThan(40);
  });

  it("no row is unreachable", () => {
    const unreachable = ROWS.filter((r) => revealOf(r.id, r.arg) === null).map((r) => rowKey(r.id, r.arg));
    expect(unreachable).toEqual([]);
  });

  it("names only opportunities that exist", () => {
    const known = new Set(allOpportunityDefs().map((d) => d.key));
    const dangling = ROWS
      .map((r) => ({ row: rowKey(r.id, r.arg), key: revealOf(r.id, r.arg) }))
      .filter((r) => r.key !== null && !known.has(r.key))
      .map((r) => `${r.row} -> ${r.key}`);
    expect(dangling).toEqual([]);
  });
});

describe("a revealed row's blocks name only things revealed no later", () => {
  /**
   * What a test can actually prove here, and what it cannot.
   *
   * It cannot prove ordering in time. A reveal condition is a predicate
   * over world state - stone in the pack, a camp sited, an animal seen -
   * and no walk over static tables can say which predicate comes true
   * first. Whether eighteen rows on day 1 is the right number, and whether
   * they arrive in a good order, is a playtest question.
   *
   * What it can prove is that the graph has no cycle. If making a knife
   * needs cordage, and cordage were revealed only by something needing a
   * knife, no player could ever start: a door with its own key locked
   * inside. That is a deadlock, it is structural, and it is exactly the
   * kind of thing that survives review and dies in a playtest.
   */
  it("has no cycle, so no key is locked inside its own door", () => {
    const made = producers();

    /** Which reveal keys a key depends on: what its rows need, and who makes that. */
    const dependsOn = new Map<OpportunityKey, Set<OpportunityKey>>();
    for (const r of ROWS) {
      const key = revealOf(r.id, r.arg);
      if (key === null) continue;
      const edges = dependsOn.get(key) ?? new Set<OpportunityKey>();
      const { items, tools } = requirementsOf(r.id, r.arg);
      for (const need of [...items, ...tools]) {
        for (const source of made.get(need) ?? []) {
          const sourceKey = REVEAL_BY_ROW.get(source) ?? null;
          if (sourceKey !== null && sourceKey !== key) edges.add(sourceKey);
        }
      }
      dependsOn.set(key, edges);
    }

    const cycles: string[] = [];
    const state = new Map<OpportunityKey, "open" | "done">();
    const walk = (key: OpportunityKey, trail: OpportunityKey[]): void => {
      if (state.get(key) === "done") return;
      if (state.get(key) === "open") {
        cycles.push([...trail.slice(trail.indexOf(key)), key].join(" -> "));
        return;
      }
      state.set(key, "open");
      for (const next of dependsOn.get(key) ?? []) walk(next, [...trail, key]);
      state.set(key, "done");
    };
    for (const key of dependsOn.keys()) walk(key, []);

    expect(cycles).toEqual([]);
  });

  it("reveals every row with a key the world can actually hand over", () => {
    // Every key either arrives with the landing or is one some condition in
    // knownCapabilityOpportunityKeys can reach. A key nothing seeds and no
    // condition names would strand every row it reveals.
    const dayOne = dayOneKeys();
    const known = new Set(allOpportunityDefs().map((d) => d.key));
    const stranded = [...new Set(ROWS.map((r) => revealOf(r.id, r.arg)))]
      .filter((key): key is OpportunityKey => key !== null)
      .filter((key) => !dayOne.has(key) && !known.has(key));
    expect(stranded).toEqual([]);
  });
});

/** Every row's reveal key, by row, so the walk above can ask about a producer it found. */
const REVEAL_BY_ROW = new Map<string, OpportunityKey | null>(
  ROWS.map((r) => [rowKey(r.id, r.arg), revealOf(r.id, r.arg)]),
);

describe("the graph walk never ships", () => {
  it("is not imported by the UI", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["src/ui/dopanel.ts", "src/ui/render.ts", "src/ui/purpose.ts", "src/ui/panes.ts"]) {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      // An import, not a mention: dopanel.ts names the helper in a comment
      // saying precisely that it must never import it.
      expect(text).not.toMatch(/^\s*import[^\n]*reveal-graph/m);
      expect(text).not.toMatch(/require\([^)]*reveal-graph/);
    }
  });
});
