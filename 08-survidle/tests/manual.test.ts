import { describe, expect, it } from "vitest";
import { MANUAL_LINKS, MANUAL_SECTIONS, openManualOnFirstLanding } from "../src/sim/manual";
import { newGame } from "../src/sim/newgame";
import { landingHtml, manualHtml } from "../src/ui/panels";
import { beginAgain } from "../src/sim/landing";
import { die } from "../src/sim/player";
import { regionAt } from "../src/world/gen";

describe("the manual", () => {
  it("is four short sections and the handbook links", () => {
    expect(MANUAL_SECTIONS.map((s) => s.title)).toEqual(["The first days, in order", "What kills you, and how fast", "Food and the seasons", "Orders and being away"]);
    for (const s of MANUAL_SECTIONS) {
      expect(s.lines.length).toBeGreaterThanOrEqual(2);
      expect(s.lines.length).toBeLessThanOrEqual(5);
    }
    expect(MANUAL_LINKS.map((l) => l.url)).toContain("https://archive.org/details/handbok_overlevnad_1988");
    expect(MANUAL_LINKS.map((l) => l.url)).toContain("https://archive.org/details/northern-bushcraft_202210");
    const html = manualHtml();
    for (const s of MANUAL_SECTIONS) expect(html).toContain(s.title);
    for (const l of MANUAL_LINKS) expect(html).toContain(l.url);
    expect(html).toContain('data-act="manual-close"');
    expect(html).not.toMatch(/[—–…‘’“”]/);
  });

  it("opens once on a world's first landing and never for a heir", () => {
    const { state } = newGame(17);
    expect(state.manualSeen).toBe(false);
    expect(openManualOnFirstLanding(state, false)).toBe(true);
    expect(state.manualSeen).toBe(true);
    expect(openManualOnFirstLanding(state, false)).toBe(false);
    const fresh = newGame(19).state;
    expect(openManualOnFirstLanding(fresh, true)).toBe(false);
    expect(fresh.manualSeen).toBe(false);
  });

  it("the landing screen has the button", () => {
    const { state, world } = newGame(17);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    expect(landingHtml(state, world)).toContain('data-act="manual-open"');
  });
});
