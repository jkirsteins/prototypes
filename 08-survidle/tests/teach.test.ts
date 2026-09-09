import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { beginAgain, land } from "../src/sim/landing";
import { MANUAL_SECTIONS } from "../src/sim/manual";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { levelMinutes, markTaught, RUNG_LEVEL, RUNG_ORDER, RUNG_WORD, SKILL_IDS, SKILL_NAMES, teachOnce, train } from "../src/sim/skills";
import { catchUp, loadGame, saveGame } from "../src/sim/save";
import { CONCEPTS, resetTeaching, tipFor, TIPS, welcomeLines } from "../src/sim/teach";
import { giveOrder } from "../src/sim/ladder";
import { conceptHtml, exampleFor, momentToOpen, welcomeHtml } from "../src/ui/teachpanel";
import { newUiState, type UiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";

/** A storage the save tests can hand to saveGame and loadGame without a DOM. */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

describe("the teaching queue", () => {
  it("queues a rung once, however many skills open it", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    teachOnce(state, "job");
    expect(state.teachQueue).toEqual(["job"]);
    expect(state.taught.job).toBe(true);
  });

  it("keeps the order the rungs were earned in", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    teachOnce(state, "grind");
    expect(state.teachQueue).toEqual(["job", "grind"]);
  });

  it("never queues a rung the survivor landed already holding", () => {
    const { state } = newGame(17);
    markTaught(state, "job");
    teachOnce(state, "job");
    expect(state.teachQueue).toEqual([]);
    expect(state.taught.job).toBe(true);
  });

  it("clears both fields, so the next survivor learns for themselves", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    resetTeaching(state);
    expect(state.taught).toEqual({});
    expect(state.teachQueue).toEqual([]);
  });

  it("carries the queue through a save, so a rung earned with the tab shut is still waiting", () => {
    const { state } = newGame(17);
    teachOnce(state, "keep");
    const storage = memoryStorage();
    saveGame(state, storage);
    const back = loadGame(storage);
    expect(back?.state.teachQueue).toEqual(["keep"]);
    expect(back?.state.taught.keep).toBe(true);
  });

  it("gives a save written without the fields an empty queue rather than undefined", () => {
    const { state } = newGame(17);
    const storage = memoryStorage();
    saveGame(state, storage);
    const file = JSON.parse(storage.getItem("survidle.save")!);
    file.state.taught = undefined;
    file.state.teachQueue = undefined;
    storage.setItem("survidle.save", JSON.stringify(file));
    const back = loadGame(storage);
    expect(back?.state.taught).toEqual({});
    expect(back?.state.teachQueue).toEqual([]);
  });

  it("queues a rung the moment practice crosses it, and not a minute before", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.job) - 1;
    state.task = { id: "chop", arg: "spruce", progress: 0, duration: 60, repeat: false };
    train(state, world, 0.5);
    expect(state.teachQueue).toEqual([]);
    train(state, world, 1);
    expect(state.teachQueue).toEqual(["job"]);
  });

  it("leaves an heir's queue empty, however many rungs they land holding", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "woodcraft", 12);
    advance(state, world, 60);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world);
    // A quarter of level 12 is level 6: jobs and grinds, both carried in.
    expect(state.taught.job).toBe(true);
    expect(state.taught.grind).toBe(true);
    expect(state.teachQueue).toEqual([]);
  });

  it("gives the heir their own slate, so a rung the ancestor had is still a moment when earned by practice", () => {
    const { state, world } = newGame(17);
    teachOnce(state, "job");
    setSkillLevel(state, "woodcraft", 2);
    advance(state, world, 60);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world);
    // Level 2 carries to level 1: the heir lands holding no rung at all.
    expect(state.taught).toEqual({});
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.job) - 1;
    state.task = { id: "chop", arg: "spruce", progress: 0, duration: 60, repeat: false };
    train(state, world, 1);
    expect(state.teachQueue).toEqual(["job"]);
  });
});

describe("a concept moment", () => {
  it("has an entry for every rung, so a rung cannot open into silence", () => {
    for (const r of RUNG_ORDER) {
      expect(CONCEPTS[r].title.length).toBeGreaterThan(0);
      expect(CONCEPTS[r].lines.length).toBeGreaterThan(0);
    }
  });

  it("names the concept and never the skill: which skill got there first is the log's business", () => {
    for (const r of RUNG_ORDER) {
      const text = `${CONCEPTS[r].title} ${CONCEPTS[r].lines.join(" ")}`;
      for (const name of Object.values(SKILL_NAMES)) expect(text).not.toContain(name);
    }
  });

  it("builds an example a player could really give, worded as the order list would word it", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    for (const s of SKILL_IDS) setSkillLevel(state, s, RUNG_LEVEL.grind);
    const ex = exampleFor(state, world, cal, "grind");
    expect(ex).not.toBeNull();
    expect(ex).toContain("forever");
  });

  it("words an example as an order to give, never as a live row's progress", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    for (const r of RUNG_ORDER) {
      for (const s of SKILL_IDS) setSkillLevel(state, s, RUNG_LEVEL[r]);
      const ex = exampleFor(state, world, cal, r);
      expect(ex, r).not.toBeNull();
      // "0 of 10 done" is what a row that is already running says.
      expect(ex, r).not.toContain(" done");
    }
  });

  it("shows its prose alone rather than inventing work when no row can carry the rung", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    // Nothing has reached the pace rung on a first morning.
    expect(exampleFor(state, world, cal, "pace")).toBeNull();
    expect(conceptHtml(state, world, cal, "pace")).not.toContain("You could now say");
  });

  it("never throws, for any rung at any level", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    for (const r of RUNG_ORDER) {
      for (const l of [1, RUNG_LEVEL.job, RUNG_LEVEL.pace]) {
        for (const s of SKILL_IDS) setSkillLevel(state, s, l);
        expect(() => conceptHtml(state, world, cal, r)).not.toThrow();
      }
    }
  });

  it("puts the rung's own title and its close button in the box", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = conceptHtml(state, world, cal, "job");
    expect(html).toContain(CONCEPTS.job.title);
    expect(html).toContain('data-act="teach-close"');
  });
});

describe("a moment never opens over something else", () => {
  it("waits behind the away report for a rung crossed while nobody was watching", () => {
    const { state, world } = newGame(17);
    // The order is given at the rung that allows it, the way a player gives it;
    // the practice is then wound back to a minute under the next one.
    setSkillLevel(state, "woodcraft", RUNG_LEVEL.grind);
    giveOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.grind) - 1;
    resetTeaching(state);
    const ui = newUiState();
    // Three game hours away (the argument is real seconds, and one of those is
    // one game minute): long enough to walk out and cross the rung at the
    // stump, short enough that a first-day survivor with no fire is still
    // alive to be taught anything.
    ui.away = catchUp(state, world, 180);
    expect(state.dead).toBeNull();
    expect(state.teachQueue).toEqual(["grind"]);
    // The report of what happened comes first; the teaching waits its turn.
    expect(momentToOpen(state, ui)).toBeNull();
    ui.away = null;
    expect(momentToOpen(state, ui)).toBe("grind");
  });

  it("still never opens when the catch-up killed them: the tombstone outranks it", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "woodcraft", RUNG_LEVEL.grind);
    giveOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.grind) - 1;
    resetTeaching(state);
    const ui = newUiState();
    // Days of felling in April with no fire is a death, and the rung is crossed
    // long before it: the queue fills and is never spent.
    ui.away = catchUp(state, world, 24 * 3600);
    expect(state.dead).toBeTruthy();
    expect(state.teachQueue).toEqual(["grind"]);
    expect(momentToOpen(state, ui)).toBeNull();
    ui.away = null;
    expect(momentToOpen(state, ui)).toBeNull();
  });

  it("stays shut behind every overlay that outranks it", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    for (const shut of ["away", "welcome", "manual", "cemetery", "teach"] as const) {
      const ui = newUiState();
      if (shut === "away") ui.away = { entries: [], orders: [], movedTo: null } as unknown as NonNullable<UiState["away"]>;
      else if (shut === "teach") ui.teach = "keep";
      else ui[shut] = true;
      expect(momentToOpen(state, ui), shut).toBeNull();
    }
    expect(momentToOpen(state, newUiState())).toBe("job");
  });

  it("stays shut over a tombstone, and over the landing that follows it", () => {
    const { state, world } = newGame(17);
    teachOnce(state, "job");
    die(state, "froze", regionAt(world, state.player.region).name);
    expect(state.dead).toBeTruthy();
    expect(momentToOpen(state, newUiState())).toBeNull();
    beginAgain(state, world);
    expect(state.landing).toBeTruthy();
    expect(momentToOpen(state, newUiState())).toBeNull();
    // Nothing was consumed by being refused; the landing is what clears it.
    expect(state.teachQueue).toEqual(["job"]);
    land(state, world);
    expect(state.teachQueue).toEqual([]);
  });

  it("reads the queue without draining it, so the caller decides when one opens", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    teachOnce(state, "grind");
    expect(momentToOpen(state, newUiState())).toBe("job");
    expect(momentToOpen(state, newUiState())).toBe("job");
    expect(state.teachQueue).toEqual(["job", "grind"]);
  });
});

describe("the welcome", () => {
  it("tells a fresh survivor that everything is theirs to click", () => {
    const { state } = newGame(17);
    const w = welcomeLines(state);
    expect(w.held).toEqual([]);
    expect(w.body.join(" ")).toContain("one at a time");
    expect(w.body.join(" ")).toContain(String(RUNG_LEVEL.job));
  });

  it("names what an heir landed holding, and the rung it already opens", () => {
    const { state } = newGame(17);
    setSkillLevel(state, "woodcraft", RUNG_LEVEL.grind);
    setSkillLevel(state, "building", RUNG_LEVEL.job);
    const w = welcomeLines(state);
    expect(w.held).toContain(`${SKILL_NAMES.woodcraft} ${RUNG_LEVEL.grind}`);
    expect(w.held).toContain(`${SKILL_NAMES.building} ${RUNG_LEVEL.job}`);
    // The highest rung any carried skill opens, not the lowest.
    expect(w.body.join(" ")).toContain(RUNG_WORD.grind);
  });

  it("says so plainly when what carried over still opens no rung", () => {
    const { state } = newGame(17);
    setSkillLevel(state, "woodcraft", 2);
    const w = welcomeLines(state);
    expect(w.held).toEqual([`${SKILL_NAMES.woodcraft} 2`]);
    expect(w.body.join(" ")).toContain("comes with practice");
  });

  it("gives a landing the same tip every time, and never the last landing's twice", () => {
    expect(tipFor(17, 3)).toBe(tipFor(17, 3));
    for (let i = 1; i < TIPS.length + 4; i++) expect(tipFor(17, i)).not.toBe(tipFor(17, i - 1));
    for (let i = 1; i < TIPS.length + 4; i++) expect(tipFor(4242, i)).not.toBe(tipFor(4242, i - 1));
  });

  it("keeps every tip to one line the box can lay out", () => {
    for (const t of TIPS) expect(t.length).toBeLessThanOrEqual(140);
  });

  it("draws the survivor's name, all six skills and its begin button", () => {
    const { state } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = welcomeHtml(state, cal);
    expect(html).toContain(current(state).name.first);
    for (const s of SKILL_IDS) expect(html).toContain(SKILL_NAMES[s]);
    expect(html).toContain('data-act="welcome-close"');
    expect(html).not.toContain(MANUAL_SECTIONS[0].lines[0]);
  });
});
