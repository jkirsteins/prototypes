import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { REFERENCE_ORDERS, wantOpen } from "../src/sim/reference";

const key = (w: (typeof REFERENCE_ORDERS)[number]) => `${w.req.task}:${w.req.arg ?? ""}:${w.kind}`;
const want = (t: string) => REFERENCE_ORDERS.find((x) => key(x) === t)!;

describe("the list after the axe", () => {
  it("keeps stone, hones after the knife, and orders the three firewood methods", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    // The opening gathers eight as a job that re-gives until met; the keep beside the axe wants is what refills it for the celt and the hone.
    expect(tasks.indexOf("stone::job")).toBeLessThan(tasks.indexOf("stone::keep"));
    expect(tasks.indexOf("craft:whetstone:job")).toBe(tasks.indexOf("stone::keep") + 1);
    expect(tasks.indexOf("hone::grind")).toBe(tasks.indexOf("craft:whetstone:job") + 1);
    expect(tasks.indexOf("craft:wedges:keep")).toBe(tasks.indexOf("hone::grind") + 1);
    expect(tasks.indexOf("craft:stoneAxe:keep")).toBe(tasks.indexOf("craft:wedges:keep") + 1);
    expect(tasks.indexOf("splitWedges::keep")).toBe(tasks.indexOf("split::keep") + 1);
    expect(tasks.indexOf("deadwood::keep")).toBe(tasks.indexOf("splitWedges::keep") + 1);
  });

  it("opens the axe split with an axe in reach and the wedges and dead wood without one", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(wantOpen(state, world, want("split::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("splitWedges::keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("deadwood::keep"), cal)).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("split::keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("splitWedges::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("deadwood::keep"), cal)).toBe(true);
  });

  it("wants the celt from Crafting 5 and the flaked axe under it, only with no axe to hand", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(true);
    setSkillLevel(state, "crafting", 5);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(false);
  });

  it("keeps the winter pile's season rule on all three methods", () => {
    const { state, world } = newGame(17);
    const april = calendar(state.minute, state.startDoy);
    const pile400 = REFERENCE_ORDERS.filter((w) => w.req.until.kind === "campHas" && w.req.until.qty === 400);
    expect(pile400.map(key)).toEqual(["split::keep", "splitWedges::keep", "deadwood::keep"]);
    for (const w of pile400) expect(wantOpen(state, world, w, april)).toBe(false);
    const october = calendar(0, 280);
    expect(wantOpen(state, world, pile400[0], october)).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, pile400[0], october)).toBe(false);
    expect(wantOpen(state, world, pile400[1], october)).toBe(true);
    expect(wantOpen(state, world, pile400[2], october)).toBe(true);
  });
});
