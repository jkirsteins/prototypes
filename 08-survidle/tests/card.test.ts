import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { stories } from "../src/sim/epitaph";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { medianPerson, rollCandidates } from "../src/sim/person";
import { die } from "../src/sim/player";
import { current, newRecord } from "../src/sim/record";
import { cardHtml, cardSections, deadExtras, livingExtras } from "../src/ui/card";
import { cemeteryHtml, journalHtml, landingHtml, statsHtml, tombstoneHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import type { LifeRecord } from "../src/sim/types";


describe("the card", () => {
  it("puts a candidate in blocks: the grades, then the quirks, and nothing else before a life is lived", () => {
    const c = rollCandidates(17, 1, 0, [])[0];
    const s = cardSections(c.person);
    expect(s.grades).toHaveLength(3);
    expect(s.grades[0].word).toMatch(/^(Weak|Slight|Ordinary|Strong|Mighty) and /);
    expect(s.grades[0].evidence).toMatch(/carries \d+(\.\d)? kg, \d+(\.\d)? kg at a push; works \d+ hours/);
    expect(s.quirks).toHaveLength(c.person.quirks.length);
    expect(s.life).toEqual([]);
    const html = cardHtml(c.person, c.name);
    expect(html).toContain(`${c.name.first} ${c.name.last}`);
    expect(html).not.toContain("cardday");
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
    const s = cardSections(current(state).person, livingExtras(state));
    expect(s.life.map((r) => r.label)).toEqual(["Knows", "Fears", "Lost"]);
  });

  it("the dead say nothing under Knows, because the entry below the card says it", () => {
    const r: LifeRecord = newRecord(1, { first: "Eirik", last: "Kalnins" }, { year: 1, doy: 90 }, 0, { ...medianPerson("m"), quirks: ["coastBorn"] });
    r.died = { day: 9, cause: "froze", date: { year: 1, doy: 99 }, region: "the shore", kmFromCamp: 0, packFoodKg: 0, campFoodKcal: 0, campFirewoodKg: 0, after: null };
    const s = cardSections(r.person, deadExtras(r));
    expect(s.life.map((row) => row.label)).toEqual(["Fears", "Lost"]);
    expect(JSON.stringify(s)).not.toContain("what the entry says");
    // The entry is printed beside every card, so the card never retells the record.
    expect(JSON.stringify(s)).not.toContain("The worst night");
    const html = cardHtml(r.person, r.name, deadExtras(r));
    expect(html).toContain("day 9");
    // The fear is stated on its own line and nowhere else: the quirk sentence no longer repeats it.
    expect(html.match(/the fell in cloud/g)).toHaveLength(1);
  });

  it("shows on the landing cards, the stats header, the journal, the tombstone and an opened grave", () => {
    const { state, world } = newGame(17);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    expect(statsHtml(state, world, cal, 5, ui)).toContain('class="face"');
    expect(statsHtml(state, world, cal, 5, ui)).toContain(current(state).name.first);
    const journal = journalHtml(state, cal, ui);
    expect(journal).toContain("day 1");
    expect(journal).not.toContain("of this life");
    expect(journal.match(/<svg class="face"/g)).toHaveLength(1);
    advance(state, world, 1440);
    die(state, "froze", regionAt(world, state.player.region).name);
    const tomb = tombstoneHtml(state, world, ui);
    expect(tomb).toContain('class="face"');
    expect(tomb).not.toContain("copy-card");
    beginAgain(state, world);
    expect(landingHtml(state, world).match(/<svg class="face"/g)).toHaveLength(3);
    expect(landingHtml(state, world)).not.toContain("copy-card");
    // Three cards across: the blocks are what keeps them apart, so every one carries them.
    expect(landingHtml(state, world).match(/class="cardblock"/g)).toHaveLength(6);
    land(state, world);
    const opened = cemeteryHtml(state, { ...ui, cemetery: true, cemeteryOpen: 1 });
    expect(opened).toContain('class="face"');
    const closed = cemeteryHtml(state, { ...ui, cemetery: true });
    expect(closed).not.toContain('class="face"');
    // A closed grave tells the three stories; opened, the entry says them and the grave must not say them twice.
    const told = stories(state.survivors[0]);
    expect(told.length).toBeGreaterThan(0);
    expect(closed).toContain(told[0]);
    expect(opened.slice(0, opened.indexOf('class="card"'))).not.toContain(told[0]);
  });
});
