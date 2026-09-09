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
import { isCareRow } from "../src/sim/bodyorder";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { addOrder, ordersHere } from "../src/sim/orders";
import { check } from "../src/sim/tasks";
import { herePile } from "../src/sim/inventory";
import { inventoryHtml, landingHtml, logHtml, ordersHtml } from "../src/ui/panels";
import { regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

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

describe("the log puts the latest information first", () => {
  it("renders every visible timestamp newest first", () => {
    const { state, world } = newGame(21);
    advance(state, world, 600);
    expect(state.log.length).toBeGreaterThan(1);
    // The stamps, in the order they are drawn. Comparing the entries' own
    // text would not do: voice() substitutes {You} and the rest before any
    // of it reaches the page, so the raw string never appears verbatim.
    const stamps = [...logHtml(state).matchAll(/<time>d(\d+) (\d+):(\d+)<\/time>/g)]
      .map((m) => Number(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]));
    expect(stamps.length).toBeGreaterThan(1);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeLessThanOrEqual(stamps[i - 1]);
  });
});

describe("a queued row is an act, not a thing", () => {
  it("a craft order reads Make <thing>", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addOrder(state, world, { task: "craft", arg: "snare", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    // The care rows are on every list from the moment a region exists, so
    // the one order given is the one row that is not one of those.
    expect(ordersHere(state, world).filter((o) => !isCareRow(o)).length).toBe(1);
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


describe("carried and on the ground are two halves", () => {
  it("each is its own box, and says which it is", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addItem(state.player.pack, "firewood", 2);
    addItem(herePile(state, world), "stone", 3);
    const html = inventoryHtml(state, world, cal);
    // One has a weight limit that kills and the other has none, so a reader
    // scanning for a thing must be able to tell which half they found it in.
    expect(html).toContain('data-inv="carry"');
    expect(html).toContain('data-inv="ground"');
    expect(html).toContain("Carried");
    expect(html).toContain("On the ground");
  });

  it("only the carried half offers to drop, and only the ground half to take", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addItem(state.player.pack, "firewood", 2);
    addItem(herePile(state, world), "stone", 3);
    const html = inventoryHtml(state, world, cal);
    const carry = html.slice(html.indexOf('data-inv="carry"'), html.indexOf('data-inv="ground"'));
    const ground = html.slice(html.indexOf('data-inv="ground"'));
    expect(carry).toContain('data-act="drop"');
    expect(carry).not.toContain('data-act="take"');
    expect(ground).toContain('data-act="take"');
    expect(ground).not.toContain('data-act="drop"');
  });

  it("the carried half says what the limit is, because that one can kill you", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = inventoryHtml(state, world, cal);
    expect(html).toMatch(/comfortable/);
    expect(html).toMatch(/max/);
  });

  it("does not say the survivor is at camp twice in the ground half", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    addItem(herePile(state, world), "log", 1);
    const html = inventoryHtml(state, world, cal);
    expect(html).toContain("On the ground, at camp");
    expect(html).not.toContain("you are at camp");
  });

  it("omits the ground half entirely when nothing is there", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = inventoryHtml(state, world, cal);
    expect(html).not.toContain('data-inv="ground"');
    expect(html).not.toContain("nothing on the ground here");
  });
});
