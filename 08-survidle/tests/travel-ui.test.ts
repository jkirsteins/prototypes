/**
 * Leaving the region is a corner of the map.
 *
 * It used to be a button at the foot of the region panel, and only after
 * picking a neighbour on the map first - so a player who never worked out
 * that regions were clickable never saw that there was anywhere else to
 * go. The ways out are listed where the ground is drawn, always.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placesHtml, travelHtml } from "../src/ui/panels";
import { regionAt } from "../src/world/gen";

describe("the ways out", () => {
  it("uses the same distance, time, or combined format as every route", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const distance = placesHtml(state, world, cal, "distance");
    const time = placesHtml(state, world, cal, "time");
    const both = placesHtml(state, world, cal, "both");
    expect(distance).toMatch(/\d+\.\d km/);
    expect(distance).not.toMatch(/\d+ min/);
    expect(time).toMatch(/\d+ min|\d+ h/);
    expect(both).toMatch(/\d+\.\d km, (?:\d+ h )?\d+ min/);
  });

  it("lists the neighbours, and only the neighbours", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = travelHtml(state, world, cal);
    const listed = [...html.matchAll(/data-arg="region:(\d+)"/g)].map((m) => Number(m[1]));
    const nb = regionAt(world, state.player.region).neighbours.map((n) => n.id);
    expect(nb.length).toBeGreaterThan(0);
    expect([...new Set(listed)].sort((a, b) => a - b)).toEqual([...nb].sort((a, b) => a - b));
  });

  it("never lists the region you are standing in", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    expect(travelHtml(state, world, cal)).not.toContain(`data-arg="region:${state.player.region}"`);
  });

  it("offers to explore ground that is not known yet, not to go to it", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // A fresh survivor knows nothing outside the landing, so every way out
    // is an exploration. Offering "Go" would promise a walk over ground
    // nobody has seen.
    const html = travelHtml(state, world, cal);
    expect(html).toContain('data-id="explore"');
  });

  it("stops offering to explore ground that is already known", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const nb = regionAt(world, state.player.region).neighbours[0].id;
    // Knowing the destination is not enough: you have to know a way there,
    // so the ground between counts too.
    mapRegion(state, world, state.player.region);
    mapRegion(state, world, nb);
    const html = travelHtml(state, world, cal);
    const at = html.indexOf(`data-way="${nb}"`);
    expect(at).toBeGreaterThan(-1);
    const row = html.slice(at, html.indexOf("</div>", at));
    // Known ground is either somewhere to go or somewhere there is no
    // route to yet, and it says which. What it must never do is offer to
    // explore land the survivor has already walked.
    expect(row).not.toContain('data-id="explore"');
    expect(row.includes('data-id="travel"') || /no way|know/i.test(row)).toBe(true);
  });

  it("names each neighbour, since a direction with no name is not a choice", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = travelHtml(state, world, cal);
    for (const n of regionAt(world, state.player.region).neighbours) {
      expect(html).toContain(regionAt(world, n.id).name);
    }
  });

  it("says nothing about undefined when a way out is shut", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    expect(travelHtml(state, world, cal)).not.toContain("undefined");
  });

  it("every entry carries a key, since this box redraws under the pointer", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = travelHtml(state, world, cal);
    const rows = html.match(/<div class="way"[^>]*>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toMatch(/data-way=/);
  });
});
