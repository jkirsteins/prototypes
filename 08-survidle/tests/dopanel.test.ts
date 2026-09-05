import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { availableTasks } from "../src/sim/tasks";
import { filterRows, FOLD_KEY, loadFolds, makeFirst, saveFold, splitFar } from "../src/ui/dopanel";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); },
  } as Storage;
}

describe("fold and filter", () => {
  it("folds round-trip through storage and default open", () => {
    const s = memory();
    expect(loadFolds(s)).toEqual({});
    saveFold(s, "camp", false);
    expect(loadFolds(s)).toEqual({ camp: false });
    expect(JSON.parse(s.getItem(FOLD_KEY)!)).toEqual({ camp: false });
  });

  it("the filter narrows by label, case-insensitive, and an empty filter keeps everything", () => {
    const rows = [{ label: "Gather sticks" }, { label: "Strip bark" }, { label: "Fell a tree" }];
    expect(filterRows(rows, "STICK").map((r) => r.label)).toEqual(["Gather sticks"]);
    expect(filterRows(rows, "  ").length).toBe(3);
  });

  it("far rows are those that cannot start and sit more than a level short; Make lists startable first", () => {
    // Seed 17 on day 1: every skill sits at level 1, so a recipe recommended
    // well above that (bow, at Crafting 5) is both unstartable (no knife yet)
    // and more than a level short - the shape splitFar and makeFirst are for.
    // Felling is startable from the first minute, so it pairs as the near row.
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const opts = availableTasks(state, world, cal);
    const chop = opts.find((o) => o.id === "chop")!;
    const bow = opts.find((o) => o.id === "craft" && o.arg === "bow")!;
    expect(chop.ok).toBe(true);
    expect(bow.ok).toBe(false);
    expect(bow.recommended).toEqual({ text: "Crafting 5", under: true });

    const { near, far } = splitFar([chop, bow], state);
    expect(near).toEqual([chop]);
    expect(far).toEqual([bow]);

    expect(makeFirst([bow, chop])).toEqual([chop, bow]);
  });
});
