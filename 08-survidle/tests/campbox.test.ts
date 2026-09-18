/**
 * The camp says what it is doing without being asked.
 *
 * Lighting the fire produced a delightful animation; losing it produced
 * silence, and he found out by noticing. An idle game must be loudest
 * when a thing the player built stops, so the fire's state, what stands
 * at camp and what each producer is limited by sit in the info column
 * where they cannot be missed - not in a panel behind a tab, and not
 * behind a pointer.
 */
import { describe, expect, it } from "vitest";
import { addItem, pile } from "../src/sim/inventory";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { SEEP_LIFE_DAYS } from "../src/sim/seep";
import { FOOTPRINT_M2, YARD_START_M2 } from "../src/sim/yard";
import { campHtml } from "../src/ui/panels";
import { siteCamp } from "./siting-helpers";

describe("the camp box", () => {
  it("a cold fire says cold, and a burning one says burning", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toContain("cold");
    st.fire.lit = true;
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toContain("burning");
  });

  it("the fuel bar is named so bars.ts can write its width each frame", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const rst = regionState(state, world, state.player.region);
    siteFor(rst, rst.campCell!).structures.firePit = true;
    // No width in the markup: a fuel figure that moved every minute would put
    // the whole panel through a parse and a diff to shift one bar.
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain('id="bar-fire"');
    expect(html).not.toMatch(/id="bar-fire"[^>]*width/);
  });

  it("with no fire site there is no fire line to read", () => {
    const { state, world } = newGame(21);
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).not.toContain("fire:");
  });

  it("names what stands at camp", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.boughBed = true;
    siteFor(st, st.campCell!).structures.dryingRack = true;
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("bough bed");
    expect(html).toContain("drying rack");
  });

  it("says nothing is built rather than showing an empty line", () => {
    const { state, world } = newGame(21);
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toContain("nothing");
  });

  it("says what a producer is limited by, which is why a camp that feeds itself still runs out", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.dryingRack = true;
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toContain("a rack");
  });

  it("says what is lying at camp, since a pile is a resource until it is forgotten", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 20);
    // He died of cold at camp beside 20 kg of his own firewood.
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toMatch(/20(\.0)? kg/);
  });

  it("carries a key, so morphing finds it again rather than matching by position", () => {
    const { state, world } = newGame(21);
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("<h2>");
  });
});

describe("the camp sheet", () => {
  it("says the woodpile against its cover, and what is lossy about it", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    addItem(pile(state, st.campCell!), "firewood", 30);
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("1050");
    expect(html).toContain("30");
  });

  it("says the yard, used against cleared", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    // The fire site's own footprint against the landing camp's starting
    // patch, both read independently of yardUsed itself, so a wrong sum
    // in the function under test cannot also pass the check on it.
    expect(html).toContain(`yard: ${FOOTPRINT_M2.firePit} of ${YARD_START_M2} m2`);
  });

  it("says why a stopped seep reads no rate rather than a live one", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const cell = st.campCell!;
    // Silted: dug long enough ago that seepStopped says so regardless of
    // the weather this seed happens to have, which keeps the test honest
    // about the one thing it is checking.
    state.seeps[cell] = { class: "bog", litres: 0, ice: 0, dug: state.minute - SEEP_LIFE_DAYS * 1440 };
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("seep:");
    expect(html).toContain("0 l/h, silted");
  });
});
