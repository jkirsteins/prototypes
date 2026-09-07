import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionAt } from "../src/world/gen";
import { levelMinutes } from "../src/sim/skills";
import { availableTasks } from "../src/sim/tasks";
import { doHtml, filterRows, FOLD_KEY, intentGroups, loadFolds, makeFirst, saveFold, splitFar } from "../src/ui/dopanel";
import { defaultChoice, defaultChoiceFor, newUiState, rowRequest, setWhenField } from "../src/ui/render";
import type { OrderWhen } from "../src/sim/types";

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
    expect((open.match(/class="kind"/g) ?? []).length).toBe(6);
    expect(rowRequest({ ...defaultChoice(), deliver: "camp" }, "sticks", undefined).req.deliver).toBe("camp");
  });
});

/** One row's markup, from its own data-opt to the next row's, so a "not there" reads the row and not its neighbours. */
function rowHtml(html: string, key: string): string {
  const i = html.indexOf(`data-opt="${key}"`);
  const j = html.indexOf('data-opt="', i + 1);
  return html.slice(i, j < 0 ? undefined : j);
}

describe("the condition fields", () => {
  it("rowRequest carries a daily count and a when block", () => {
    const daily = rowRequest({ ...defaultChoice(), until: "daily", n: 2 }, "roots", undefined);
    expect(daily.req.until).toEqual({ kind: "daily", n: 2 });
    expect(daily.kind).toBe("job");
    const seasoned = rowRequest({ ...defaultChoice(), when: { season: { from: 120, to: 181 } } }, "roots", undefined);
    expect(seasoned.req.when).toEqual({ season: { from: 120, to: 181 } });
    // An untouched when block is no block at all: the plain click's request is what it was.
    expect(rowRequest(defaultChoice(), "roots", undefined).req.when).toBeUndefined();
  });

  it("the season, the stock line and the daily count open at the condition rung and are named under it", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), open: { id: "berries" as const, arg: "" } };
    state.skills.foraging.xp = levelMinutes(12);
    const under = rowHtml(doHtml(state, world, cal, ui), "intent:berries:");
    expect(under).not.toContain("data-row-season-from");
    expect(under).not.toContain("data-row-stock-item");
    expect(under).toContain("conditions at Foraging 15");

    state.skills.foraging.xp = levelMinutes(15);
    const at = rowHtml(doHtml(state, world, cal, ui), "intent:berries:");
    for (const f of ["data-row-season-from", "data-row-season-to", "data-row-stock-item", "data-row-stock-mode", "data-row-stock-n"]) expect(at, f).toContain(f);
    expect(at).toContain('data-until="daily"');
    expect(at).not.toContain("conditions at Foraging 15");
  });

  it("the restart line shows at the condition rung and the due date at the pace rung, and only a keep carries them", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = { ...newUiState(), open: { id: "chop" as const, arg: "" } };
    state.skills.woodcraft.xp = levelMinutes(15);
    const at15 = rowHtml(doHtml(state, world, cal, ui), "intent:chop:");
    expect(at15).toContain("data-row-restart");
    expect(at15).not.toContain("data-row-by");
    expect(at15).toContain("pace at Woodcraft 20");

    state.skills.woodcraft.xp = levelMinutes(20);
    const at20 = rowHtml(doHtml(state, world, cal, ui), "intent:chop:");
    expect(at20).toContain("data-row-by");
    expect(at20).not.toContain("pace at Woodcraft 20");
    // A row with no stock to count has neither: nothing there reads a restart line or a date.
    const lit = rowHtml(doHtml(state, world, cal, { ...ui, open: { id: "light", arg: "" } }), "intent:light:");
    expect(lit).not.toContain("data-row-restart");

    // The fields sit beside the kinds, so the request is where the two a keep alone reads are dropped.
    const choice = { ...defaultChoice(), n: 40, when: { season: { from: 181, to: 273 }, restart: 30, by: 334 } };
    expect(rowRequest({ ...choice, until: "keep" }, "chop", undefined).req.when).toEqual(choice.when);
    expect(rowRequest({ ...choice, until: "times" }, "chop", undefined).req.when).toEqual({ season: { from: 181, to: 273 } });
    expect(rowRequest({ ...defaultChoice(), when: { restart: 30 } }, "chop", undefined).req.when).toBeUndefined();
  });

  it("a condition field writes the open row's when block, and any takes it off again", () => {
    const when: OrderWhen = {};
    setWhenField(when, "season-from", "3");
    expect(when.season?.from).toBe(90);
    setWhenField(when, "season-to", "9");
    expect(when.season).toEqual({ from: 90, to: 273 });
    setWhenField(when, "season-from", "");
    expect(when.season).toBeUndefined();

    setWhenField(when, "stock-item", "bone");
    expect(when.stock).toEqual({ item: "bone", atLeast: 1 });
    setWhenField(when, "stock-n", "4");
    expect(when.stock).toEqual({ item: "bone", atLeast: 4 });
    setWhenField(when, "stock-mode", "under");
    expect(when.stock).toEqual({ item: "bone", under: 4 });
    setWhenField(when, "stock-item", "");
    expect(when.stock).toBeUndefined();

    setWhenField(when, "restart", "192");
    setWhenField(when, "by", "11");
    expect(when.restart).toBe(192);
    expect(when.by).toBe(334);
    setWhenField(when, "restart", "");
    setWhenField(when, "by", "");
    expect(when.restart).toBeUndefined();
    expect(when.by).toBeUndefined();
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
