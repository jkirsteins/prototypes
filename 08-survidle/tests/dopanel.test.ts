import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionAt } from "../src/world/gen";
import { levelMinutes } from "../src/sim/skills";
import { availableTasks } from "../src/sim/tasks";
import { doHtml, filterRows, FOLD_KEY, intentGroups, loadFolds, makeFirst, saveFold, splitFar } from "../src/ui/dopanel";
import { defaultChoice, defaultChoiceFor, newUiState, rowRequest } from "../src/ui/render";

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
    placeAtSpot(state, world, state.player.region, "forest");
    const cal = calendar(state.minute, state.startDoy);
    const opts = availableTasks(state, world, cal);
    const chop = opts.find((o) => o.id === "chop")!;
    const bow = opts.find((o) => o.id === "craft" && o.arg === "bow")!;
    expect(chop.ok).toBe(true);
    expect(bow.ok).toBe(false);
    expect(bow.recommended).toEqual({ text: "Crafting 5", under: true, short: 4 });

    const { near, far } = splitFar([chop, bow], state);
    expect(near).toEqual([chop]);
    expect(far).toEqual([bow]);

    expect(makeFirst([bow, chop])).toEqual([chop, bow]);
  });

  it("the filter narrows doHtml's rows to matching labels and drops emptied groups", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    state.skills.woodcraft.xp = levelMinutes(5);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "stick" });
    expect(html).toContain("Gather sticks");
    expect(html).not.toContain("Fell a tree");
    expect((html.match(/data-group="/g) ?? []).length).toBe(1);
  });

  it("a folded group renders its heading only", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    state.skills.woodcraft.xp = levelMinutes(5);
    const html = doHtml(state, world, cal, newUiState(), { Gather: false });
    const group = html.slice(html.indexOf('data-group="Gather"'), html.indexOf('data-group="Hunt"'));
    expect(group).toContain("+ Gather");
    expect(group).not.toContain("Gather sticks");
  });

  it("ui.moreOpen renders a group's far rows in place of the more button", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const closed = doHtml(state, world, cal, newUiState());
    expect(closed).toMatch(/data-act="more" data-group="Make">more \(\d+\)/);
    const opened = doHtml(state, world, cal, { ...newUiState(), moreOpen: ["Make"] });
    expect(opened).toContain('data-opt="intent:craft:bow"');
    expect(opened).toMatch(/data-act="more" data-group="Make">less/);
  });

  it("a non-empty filter skips the far fold: a far row still renders, with no more line", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, { ...newUiState(), filter: "coat" });
    expect(html).toContain("hide coat");
    expect(html).not.toContain('data-act="more"');
  });

  it("once is a kind button, carrying the row's own choice of deliver and where", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = newUiState();
    ui.open = { id: "sticks", arg: "" };
    const html = doHtml(state, world, cal, ui);
    const open = html.slice(html.indexOf('data-opt="intent:sticks:"'));
    expect(open).toContain('data-until="once"');
    expect((open.match(/class="kind"/g) ?? []).length).toBe(5);
    expect(rowRequest({ ...defaultChoice(), deliver: "camp" }, "sticks", undefined).req.deliver).toBe("camp");
  });
});

describe("the fetch rows", () => {
  it("the Camp group lists a fetch row per method and a plain click brings the water to camp", () => {
    const { world } = newGame(17);
    const r = regionAt(world, world.start);
    const camp = intentGroups(r).find((g) => g.label === "Camp")!;
    expect(camp.items.filter((i) => i.id === "fill").map((i) => i.arg)).toEqual(["shore", "hole", "seep"]);
    expect(rowRequest(defaultChoiceFor("fill"), "fill", "shore").req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("melt"), "melt", undefined).req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("chop"), "chop", undefined).req.deliver).toBe("leave");
  });
});
