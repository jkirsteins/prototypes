import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { stories } from "../src/sim/epitaph";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { medianPerson, rollCandidates } from "../src/sim/person";
import { die } from "../src/sim/player";
import { current, newRecord } from "../src/sim/record";
import { cardHtml, cardText, livingExtras } from "../src/ui/card";
import { cemeteryHtml, journalHtml, landingHtml, statsHtml, tombstoneHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import type { LifeRecord } from "../src/sim/types";

const strip = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<button[\s\S]*?<\/button>/g, "").replace(/<[^>]+>/g, "\n").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").split("\n").map((s) => s.trim()).filter(Boolean).join("\n");

describe("the card", () => {
  it("prints a candidate as plain text, the same lines the screen shows", () => {
    const c = rollCandidates(17, 1, 0, [])[0];
    const text = cardText(c.person, c.name);
    expect(text.split("\n")[0]).toBe(`${c.name.first} ${c.name.last}`);
    expect(text.split("\n")).toHaveLength(1 + 4 + c.person.quirks.length);
    expect(text).toMatch(/carries \d+(\.\d)? kg all day/);
    expect(strip(cardHtml(c.person, c.name, undefined, { copy: true }))).toBe(text);
  });

  it("ranks the stories: the wolves' night, the elk, the walls, then the rest, oldest first", () => {
    const r: LifeRecord = newRecord(1, { first: "Eirik", last: "Kalnins" }, { year: 1, doy: 90 }, 0, medianPerson("m"));
    const d = { year: 1, doy: 90 };
    r.events.push({ kind: "storm", day: 2, date: d });
    r.events.push({ kind: "built", structure: "leanTo", day: 3, date: d });
    r.events.push({ kind: "firstKill", species: "hare", day: 4, date: d });
    r.events.push({ kind: "firstKill", species: "elk", day: 30, date: d });
    r.events.push({ kind: "built", structure: "turfHut", day: 40, date: d });
    r.worst = { day: 12, warmth: 8, wolves: true };
    expect(stories(r)).toEqual(["Day 12. The worst night: warmth 8, wolves at the fire.", "Day 30. First elk.", "Day 40. Built the turf hut."]);
    r.events.length = 0;
    r.worst = null;
    expect(stories(r)).toEqual([]);
    r.events.push({ kind: "toolWorn", tool: "axe", day: 5, date: d });
    expect(stories(r)).toEqual(["Day 5. The iron axe wore out."]);
  });

  it("the living survivor's card knows the day, the skills, the fears and the losses", () => {
    const { state, world } = newGame(17, undefined, { ...medianPerson("f"), quirks: ["coastBorn"] });
    advance(state, world, 2 * 1440);
    const x = livingExtras(state);
    expect(x.day).toBe(3);
    expect(x.fear).toBe("the fell in cloud.");
    expect(x.lost).toBe("nothing.");
    expect(x.know).toMatch(/shore/);
    state.player.toes = true;
    expect(livingExtras(state).lost).toBe("toes to frostbite.");
  });

  it("shows on the landing cards, the stats header, the journal, the tombstone and an opened grave", () => {
    const { state, world } = newGame(17);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    expect(statsHtml(state, world, cal, 5, ui)).toContain('class="face"');
    expect(statsHtml(state, world, cal, 5, ui)).toContain(current(state).name.first);
    const journal = journalHtml(state, cal, ui);
    expect(journal).toContain("Day 1 of this life.");
    expect(journal).toContain('data-act="copy-card"');
    expect(journal.match(/<svg class="face"/g)).toHaveLength(1);
    advance(state, world, 1440);
    die(state, "froze", regionAt(world, state.player.region).name);
    const tomb = tombstoneHtml(state, world, ui);
    expect(tomb).toContain('class="face"');
    expect(tomb).toContain('data-act="copy-card"');
    beginAgain(state, world);
    expect(landingHtml(state, world).match(/<svg class="face"/g)).toHaveLength(3);
    expect(landingHtml(state, world)).not.toContain("copy-card");
    land(state, world);
    const opened = cemeteryHtml(state, { ...ui, cemetery: true, cemeteryOpen: 1 });
    expect(opened).toContain('class="face"');
    expect(cemeteryHtml(state, { ...ui, cemetery: true })).not.toContain('class="face"');
  });
});
