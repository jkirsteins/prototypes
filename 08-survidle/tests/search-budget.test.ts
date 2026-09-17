import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import * as intent from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { doHtml, filterRows, intentGroups } from "../src/ui/dopanel";
import { check, withProgression } from "../src/sim/tasks";
import { knownHuntSpecies } from "../src/sim/hunting";
import { regionAt } from "../src/world/gen";
import type { Species } from "../src/sim/species";
import { newUiState } from "../src/ui/render";

afterEach(() => vi.restoreAllMocks());

describe("search construction budget", () => {
  it("does not route unrelated direct-address rows for free text", () => {
    const { state, world } = newGame(21);
    const build = vi.spyOn(intent, "intentOption");
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), { ...newUiState(), filter: "torch" });
    expect(html).toContain('data-opt="intent:craft:torch"');
    expect(build.mock.calls.length).toBeLessThan(45);
    expect(build.mock.calls.some((call) => call[3] === "craft" && call[4] === "hideCoat")).toBe(false);
  });

  it("preserves exhaustive free-text matches in live details, refusals and keywords", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const known = new Set(knownHuntSpecies(state, world));
    const rows = intentGroups(regionAt(world, state.player.region)).flatMap((g) => g.items)
      .filter(({ id, arg }) => id !== "hunt" || arg === "any" || known.has(arg as Species))
      .map(({ id, arg }) => {
        const full = intent.intentOption(state, world, cal, id, arg, "nearest");
        return withProgression(state, world, { ...check(state, world, cal, id, arg, full.cell), cell: full.cell });
      }).filter((o) => o.id !== "explore" && o.id !== "searchHome");
    for (const filter of ["torch", "needs", "cordage", "darkness", "materials", "logs", "fur", "no axe", "chance", "takes", "building"]) {
      const html = doHtml(state, world, cal, { ...newUiState(), filter });
      const actual = [...html.matchAll(/data-opt="intent:([^"]+)"/g)].map((m) => m[1]);
      const expected = filterRows(rows, filter).map((o) => `${o.id}:${o.arg ?? ""}`);
      expect(actual.filter((id) => !id.startsWith("explore:") && !id.startsWith("searchHome:")), filter).toEqual(expected);
    }
  });

  it("routes only concept members, not every action, for a dark concept search", () => {
    const { state, world } = newGame(21);
    const ui = { ...newUiState(), filter: "kw:dark" };
    const build = vi.spyOn(intent, "intentOption");
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), ui);
    expect(html).toContain("torch");
    expect(build.mock.calls.length).toBeLessThanOrEqual(2);
    expect(build.mock.calls.length).toBeGreaterThan(0);
  });

  it("does not construct routes for an unknown concept", () => {
    const { state, world } = newGame(21);
    const build = vi.spyOn(intent, "intentOption");
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), { ...newUiState(), filter: "kw:nonexistent" });
    expect(html).toContain("nothing answers");
    expect(build.mock.calls).toHaveLength(0);
  });
});
