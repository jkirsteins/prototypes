import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { epitaph, epitaphTail } from "../src/sim/epitaph";
import { beginAgain, land } from "../src/sim/landing";
import { fmtName } from "../src/sim/names";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { cemeteryHtml, journalHtml, landingHtml, tombstoneHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";

function dead() {
  const g = newGame(17);
  advance(g.state, g.world, 3 * 1440);
  die(g.state, "froze", regionAt(g.world, g.state.player.region).name);
  return g;
}

describe("the tombstone", () => {
  it("shows the name, the epitaph, the entry, the next boat and Begin again, and no line about the save", () => {
    const { state, world } = dead();
    const html = tombstoneHtml(state, world);
    expect(html).toContain(fmtName(current(state).name));
    expect(html).toContain(epitaphTail(current(state)));
    expect(html).toMatch(/The next boat lands in July, year 1\./);
    expect(html).toContain('data-act="begin-again"');
    expect(html).toContain('data-act="cemetery"');
    expect(html).not.toContain("The save is gone");
  });
});

describe("the landing screen", () => {
  it("shows the date, the gap, the prefilled name, a reroll and Land", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    const html = landingHtml(state, world);
    expect(html).toContain("year 1");
    expect(html).toContain("90 days after");
    expect(html).toContain(`value="${fmtName(state.landing!.name)}"`);
    expect(html).toContain('data-act="reroll-name"');
    expect(html).toContain('data-act="land"');
  });
});

describe("the cemetery and the journal", () => {
  it("lists survivors newest first under their epitaphs, with leave this world behind a confirm", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    const ui = { ...newUiState(), cemetery: true };
    // Ilze is alive: the cemetery lists only the dead, so she is absent and Veikko alone is present.
    const beforeDying = cemeteryHtml(state, ui);
    expect(beforeDying).not.toContain("Ilze Berg");
    expect(beforeDying).toContain(fmtName(state.survivors[0].name));
    advance(state, world, 1440);
    die(state, "starved", regionAt(world, state.player.region).name);
    const html = cemeteryHtml(state, ui);
    const first = html.indexOf("Ilze Berg");
    const second = html.indexOf(fmtName(state.survivors[0].name));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('data-act="leave-world"');
    expect(html).not.toContain('data-act="leave-world-yes"');
    expect(cemeteryHtml(state, { ...ui, confirmLeave: true })).toContain('data-act="leave-world-yes"');
    expect(cemeteryHtml(state, { ...ui, cemeteryOpen: 1 })).toContain(epitaph(state.survivors[0]));
  });

  it("a world with one living survivor shows an empty cemetery with just the leave-world control", () => {
    const { state } = newGame(17);
    const html = cemeteryHtml(state, { ...newUiState(), cemetery: true });
    expect(html).not.toContain(fmtName(current(state).name));
    expect(html).toContain("No one has died here yet.");
    expect(html).toContain('data-act="leave-world"');
  });

  it("the journal opens with the season panel and the current life, then the ancestors", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    land(state, world);
    const html = journalHtml(state, calendar(state.minute, state.startDoy));
    expect(html).toContain("Next:");
    expect(html).toContain(fmtName(current(state).name));
    expect(html).toContain(fmtName(state.survivors[0].name));
    expect(html).toContain('data-act="cemetery"');
  });
});
