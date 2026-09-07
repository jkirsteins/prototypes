/**
 * The words a player reads.
 *
 * Each of these was a misreading in the 2026-09-07 playtest, and none of
 * them was a bug in what the game did - only in what it said about it.
 * They are tested because prose has no other guard: a rename three months
 * from now would put every one of them back without a single failure.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem } from "../src/sim/inventory";
import { beginAgain } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { addOrder, ordersHere } from "../src/sim/orders";
import { check } from "../src/sim/tasks";
import { inventoryHtml, landingHtml, logHtml, ordersHtml } from "../src/ui/panels";
import { regionAt } from "../src/world/gen";

describe("the names are Norwegian", () => {
  it("the letters are the real ones, not the nearest ASCII", () => {
    // A plain "a" where an "å" belongs is a different sound, and a native
    // speaker read "Bjorklia" aloud and it was wrong.
    const { world, state } = newGame(21);
    const home = regionAt(world, state.player.region);
    const names = [home, ...home.neighbours.map((n) => regionAt(world, n.id))].map((r) => r.name);
    expect(names.join(" ")).toMatch(/[åøæÅØÆ]/);
  });
});

describe("the log reads the way a story is told", () => {
  it("oldest first, since he read newest-first as his own misreading", () => {
    const { state, world } = newGame(21);
    advance(state, world, 600);
    expect(state.log.length).toBeGreaterThan(1);
    const html = logHtml(state);
    const first = state.log[0].text;
    const last = state.log[state.log.length - 1].text;
    if (first !== last) expect(html.indexOf(first)).toBeLessThan(html.indexOf(last));
  });
});

describe("a queued row is an act, not a thing", () => {
  it("a craft order reads Make <thing>", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addOrder(state, world, { task: "craft", arg: "snare", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(ordersHere(state, world).length).toBe(1);
    expect(ordersHtml(state, world, cal)).toContain("Make snare");
  });

  it("and so does the row it was given from", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "craft", "snare").label).toBe("Make snare");
  });
});

/** A world at a landing screen: the first survivor dead, the next boat in. */
function landing() {
  const g = newGame(17);
  advance(g.state, g.world, 3 * 1440);
  die(g.state, "froze", regionAt(g.world, g.state.player.region).name);
  beginAgain(g.state, g.world);
  return g;
}

describe("the landing says what you came with", () => {
  it("names the kit, once, rather than leaving a second life still guessing", () => {
    const { state, world } = landing();
    const html = landingHtml(state, world);
    expect(html).toMatch(/axe/i);
    expect(html).toMatch(/dried meat/i);
  });

  it("the reroll button says what it does, in the button", () => {
    // The only explanation was a title tooltip, and he went a whole run and
    // into the second without ever finding it.
    const { state, world } = landing();
    const html = landingHtml(state, world);
    const at = html.indexOf('data-act="next-boat"');
    expect(at).toBeGreaterThan(-1);
    const btn = html.slice(at, html.indexOf("</button>", at));
    expect(btn).toMatch(/three new people/i);
  });
});

describe("the pack says what each thing weighs", () => {
  it("a value per row, not only a total", () => {
    // A total with no breakdown cannot be reasoned about, and hover-only
    // text is what hid the reroll for a whole run.
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addItem(state.player.pack, "firewood", 5);
    const html = inventoryHtml(state, world, cal);
    const at = html.indexOf("firewood");
    expect(at).toBeGreaterThan(-1);
    expect(html.slice(at, at + 120)).toMatch(/5(\.0)? kg/);
  });
});
