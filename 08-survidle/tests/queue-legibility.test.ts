/**
 * The playtest of 2026-09-07, findings 4, 5, 7 and 9 and bugs 3 to 8:
 * the list saying what it is doing. Spec:
 * docs/superpowers/specs/2026-09-07-survidle-queue-legibility-design.md
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { addItem, produce, weight } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";
import { placeAt } from "../src/sim/position";
import { addOrder, judgeOrders, ordersHere, waitingLine } from "../src/sim/orders";
import { conceptsFor, doHtml, filterRows, intentGroups, keyedRows } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { orderByHand } from "../src/sim/ladder";
import { Rng } from "../src/rng";
import { regionAt } from "../src/world/gen";
import { body } from "../src/sim/person";
import type { IntentRequest } from "../src/sim/types";
import { siteCamp } from "./siting-helpers";

const once = (task: IntentRequest["task"], arg?: string): IntentRequest =>
  ({ task, arg, until: { kind: "once" }, deliver: "leave", where: "nearest" });

describe("a waiting row names its cause", () => {
  it("a row that could run but is not the chosen one names the order ahead of it", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    addOrder(state, world, { ...once("sticks"), until: { kind: "forever" } }, "grind");
    addOrder(state, world, { ...once("stone"), until: { kind: "forever" } }, "grind");
    const judged = judgeOrders(state, world, cal);
    const [head, second] = ordersHere(state, world);
    expect(judged.chosen?.id).toBe(head.id);
    const line = waitingLine(state, world, cal, second, judged);
    expect(line).toContain("waiting its turn");
    // The point of the line: it names what is ahead, rather than the bare word.
    expect(line).not.toBe("waiting");
  });

  it("a row under a once order that cannot run says it is held up, and by what", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    // Cooking with nothing to cook cannot run, and a once order stops the list under it.
    addOrder(state, world, once("cook", "rawMeat"), "job");
    addOrder(state, world, { ...once("sticks"), until: { kind: "forever" } }, "grind");
    const judged = judgeOrders(state, world, cal);
    expect(judged.stalling).not.toBeNull();
    expect(judged.chosen).toBeNull();
    const second = ordersHere(state, world)[1];
    expect(waitingLine(state, world, cal, second, judged)).toContain("held up by");
  });

  it("a row the scheduler refused keeps its own reason", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const o = addOrder(state, world, once("cook", "rawMeat"), "job");
    const judged = judgeOrders(state, world, cal);
    expect(o.skipped).not.toBe("");
    expect(waitingLine(state, world, cal, o, judged)).toBe(o.skipped);
  });
});

describe("a yield that lands on the ground says so", () => {
  it("a yield diverted away from camp is logged, naming what lies where it fell", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    // Stand at the forest - a real work cell in this region, not the camp.
    const forest = regionAt(world, state.player.region).spots.find((s) => s.cell !== st.campCell!)!;
    placeAt(state, world, forest.cell);
    addItem(state.player.pack, "stone", Math.ceil(body(state).packComfortableKg / 1) + 5);
    expect(weight(state.player.pack)).toBeGreaterThan(body(state).packComfortableKg);
    const before = state.log.length;
    expect(produce(state, world, "stick", 6)).toBe("pile");
    const added = state.log.slice(before).map((e) => e.text).join(" ");
    expect(added).toMatch(/lie|lies/);
  });

  it("a yield landing in the camp pile is not logged: the camp pile is the store", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    addItem(state.player.pack, "stone", Math.ceil(body(state).packComfortableKg / 1) + 5);
    const before = state.log.length;
    expect(produce(state, world, "stick", 6)).toBe("pile");
    expect(state.log.length).toBe(before);
  });
});

describe("the concepts a row answers to are visible and exactly filterable", () => {
  it("every row a concept names reports that concept", () => {
    for (const row of keyedRows()) {
      const [id, arg] = row.split(":");
      expect(conceptsFor(id, arg).length, `${row} names no concept`).toBeGreaterThan(0);
    }
  });

  it("the food rows report food, including the ones that never say the word", () => {
    expect(conceptsFor("roots", undefined)).toContain("food");
    expect(conceptsFor("hunt", "any")).toContain("food");
    expect(conceptsFor("cook", "roots")).toContain("food");
    expect(conceptsFor("build", "dryingRack")).toContain("food");
  });

  it("a row reports every concept that names it, not just the first", () => {
    // Splitting a log is fire and fuel both.
    expect(conceptsFor("split", undefined).sort()).toEqual(["fire", "fuel"]);
  });

  it("kw: matches by concept and not by the letters a row happens to spell", () => {
    const rows = [
      { id: "roots", arg: undefined, label: "Dig roots", detail: "cook them" },
      { id: "chop", arg: undefined, label: "Fell a tree", detail: "sound the food of a fire" },
    ];
    const found = filterRows(rows, "kw:food").map((r) => r.label);
    expect(found).toEqual(["Dig roots"]);
    // The plain word still reads the whole row, as it always did.
    expect(filterRows(rows, "food").map((r) => r.label)).toContain("Fell a tree");
  });

  it("kw: with a word no concept carries finds nothing rather than everything", () => {
    const rows = [{ id: "roots", arg: undefined, label: "Dig roots" }];
    expect(filterRows(rows, "kw:turnip")).toEqual([]);
  });

  it("every concept a row reports is one the Do panel could filter back to", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const rows = intentGroups(regionAt(world, state.player.region)).flatMap((g) => g.items);
    for (const { id, arg } of rows) {
      for (const c of conceptsFor(id, arg)) {
        const hit = filterRows(rows.map((r) => ({ id: r.id, arg: r.arg, label: r.id })), `kw:${c}`);
        expect(hit.length, `kw:${c} finds nothing`).toBeGreaterThan(0);
      }
    }
  });
});

describe("a click that starts nothing says so", () => {
  it("a once order whose work cannot start logs why, and stays on the list", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const rng = new Rng(state.rng);
    const before = state.log.length;
    // Cooking raw meat with none in reach: the check at the cell refuses.
    const o = orderByHand(state, world, cal, rng, once("cook", "rawMeat"), "job");
    expect(state.intent?.orderId).not.toBe(o.id);
    expect(ordersHere(state, world).some((x) => x.id === o.id)).toBe(true);
    expect(state.log.slice(before).map((e) => e.text).join(" ")).toContain("cannot start now");
  });

  it("a once order that can start still starts, and logs no refusal", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const rng = new Rng(state.rng);
    const before = state.log.length;
    const o = orderByHand(state, world, cal, rng, once("sticks"), "job");
    expect(state.intent?.orderId).toBe(o.id);
    expect(state.log.slice(before).map((e) => e.text).join(" ")).not.toContain("cannot start now");
  });
});

describe("make camp asks before it binds", () => {
  it("the confirm step is a screen state, and the camp cell is the one the region already held", () => {
    const { state, world } = newGame(1000010);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const was = st.campCell!;
    // Standing at camp, Make camp is refused before any confirm; move off it.
    placeAt(state, world, regionAt(world, state.player.region).spots.find((s) => s.cell !== st.campCell!)!.cell);
    const ui = newUiState();
    expect(ui.confirmCamp).toBe(false);
    // The confirm row replaces the plain one and offers camp-yes, not intent.
    ui.confirmCamp = true;
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, ui, ui.folds);
    expect(html).toContain("Move camp here?");
    expect(html).toContain("camp-yes");
    // Drawing the question moves no camp.
    expect(regionState(state, world, state.player.region).campCell!).toBe(was);
  });
});
