import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { activeGoals, goalDeed, goalDef, GOALS, newGoals, SEASON_ORDER } from "../src/sim/goals";
import { ITEM_NAMES, RECIPE_IDS, RECIPES, STRUCTURE_IDS, STRUCTURES, TOOL_IDS, TOOLS } from "../src/sim/items";
import { newGame, newPerson } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import { resetTeaching } from "../src/sim/teach";
import { TASK_IDS, type GoalId, type Season } from "../src/sim/types";

const cal = calendar(0);

/**
 * Words no vocabulary hands us in the bare, singular shape a title would
 * use: ITEM_NAMES only keeps the plural, and "fire drill" and "bone
 * needle" cover their own compound but not the bare half a title could
 * still say alone.
 */
const HAND_WORDS = ["drill", "needle", "wedge", "log", "stick"];

/**
 * Crafted intermediates, built structures, carried tools and gathered
 * items - the real vocabulary a route would be spelled in, read straight
 * off the tables that define it rather than typed out by hand, so a
 * goal titled "Knap a scraper" or "Weave a basket" is caught the day its
 * recipe is.
 */
const ROUTE_WORDS = [
  ...RECIPE_IDS.map((r) => RECIPES[r].name),
  ...STRUCTURE_IDS.map((s) => STRUCTURES[s].name),
  ...TOOL_IDS.map((t) => TOOLS[t].name),
  ...Object.values(ITEM_NAMES),
  ...HAND_WORDS,
].map((w) => w.toLowerCase());

/**
 * A goal's own object is fair to name - "firewood" is where you are going,
 * "cordage" is how you get there - so these are the one exception to the
 * guard below, and only for the goal they belong to.
 */
const OWN_WORD: Partial<Record<GoalId, string[]>> = {
  firewood: ["firewood"],
  water: ["water"],
  snare: ["snare", "set a snare"],
};

describe("the goal ladder", () => {
  it("holds out one goal in the opening and starts with choosing where to live", () => {
    const { state } = newGame(3);
    expect(activeGoals(state, cal)).toEqual(["site"]);
  });

  it("stays one goal at a time through the whole opening chain, fire-keeping included", () => {
    const { state } = newGame(3);
    // site is covered by the case above; walk the rest of the chain the
    // same way, since a width bug widens silently rather than crashing.
    for (const id of ["site", "firewood", "fire"] as const) {
      state.goals.done[id] = true;
      expect(activeGoals(state, cal).length).toBe(1);
    }
    state.goals.done.cook = true;
    expect(activeGoals(state, cal)).toEqual(["keptNight"]);
  });

  it("widens to two once the fire and food chain is behind it", () => {
    const { state } = newGame(3);
    for (const id of ["site", "firewood", "fire", "cook", "keptNight"] as const) state.goals.done[id] = true;
    expect(activeGoals(state, cal)).toEqual(["bed", "keptDays"]);
  });

  it("widens to three once the camp jobs run in parallel", () => {
    const { state } = newGame(3);
    for (const g of GOALS.slice(0, 9)) state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual(["water", "snare", "sign"]);
  });

  it("never shows more than the seasons can fill, and never narrows", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id) && g.id !== "store") state.goals.done[g.id] = true;
    const active = activeGoals(state, cal);
    // One worked goal left and the whole tail behind it, which is one slot.
    expect(active[0]).toBe("store");
    expect(active.length).toBe(2);
    expect(SEASON_ORDER).toContain(active[1]);
  });

  it("shows at most one season, and it is the next one due", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id)) state.goals.done[g.id] = true;
    // A day in January: winter now, so the spring is what is next due.
    const jan = calendar(0, 0);
    expect(jan.season).toBe("winter");
    expect(activeGoals(state, jan)).toEqual(["spring"]);
  });

  it("moves to the summer once the spring has been seen", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id)) state.goals.done[g.id] = true;
    state.goals.done.spring = true;
    expect(activeGoals(state, calendar(0, 0))).toEqual(["summer"]);
  });

  it("shows nothing at all once every goal is reached", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual([]);
  });
});

describe("goal guards", () => {
  it("credits every goal by a deed the game actually emits", () => {
    for (const g of GOALS) {
      const emitted = [
        ...TASK_IDS.map((id) => ({ kind: "task", id }) as const),
        ...STRUCTURE_IDS.map((s) => ({ kind: "built", structure: s }) as const),
        // SEASON_ORDER's ids and the four seasons share their spelling, not their type.
        ...SEASON_ORDER.map((s) => ({ kind: "season", season: s as Season }) as const),
        { kind: "lit" } as const,
        { kind: "stored" } as const,
        { kind: "foundSign" } as const,
        { kind: "recoveredAtCamp" } as const,
        { kind: "gathered", item: "firewood", kg: 99 } as const,
        { kind: "gathered", item: "wetFirewood", kg: 99 } as const,
        { kind: "keptNight" } as const,
        { kind: "keptFor", minutes: 999999 } as const,
        { kind: "keptRain", minutes: 999999 } as const,
      ];
      expect(emitted.some((d) => g.credit(d) > 0), `${g.id} is unreachable`).toBe(true);
    }
  });

  it("never names a route in a title, checked against the real vocabularies as substrings", () => {
    for (const g of GOALS) {
      const t = g.title.toLowerCase();
      const own = OWN_WORD[g.id] ?? [];
      for (const w of ROUTE_WORDS) {
        if (own.includes(w)) continue;
        expect(t.includes(w), `"${g.title}" names the route word "${w}"`).toBe(false);
      }
    }
  });

  it("uses only ASCII the user can type", () => {
    for (const g of GOALS) expect(g.title).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("goals are the world's, not a life's", () => {
  it("advances on a deed and not on a state a survivor inherited", () => {
    const { state } = newGame(3);
    // Standing in a camp whose fire is already burning is not lighting one.
    expect(state.goals.done.fire).toBeUndefined();
    // A light whose tinder failed emits the task and no "lit": no credit.
    expect(goalDeed(state, { kind: "task", id: "light" })).toEqual([]);
    expect(goalDeed(state, { kind: "lit" })).toEqual(["fire"]);
    expect(state.goals.done.fire).toBe(true);
  });

  it("counts the kilos this survivor actually gathered, wet or dry alike", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "gathered", item: "firewood", kg: 4 })).toEqual([]);
    expect(state.goals.progress.firewood).toBeCloseTo(4);
    expect(goalDeed(state, { kind: "gathered", item: "wetFirewood", kg: 6 })).toEqual(["firewood"]);
    expect(state.goals.done.firewood).toBe(true);
  });

  it("never hands the same goal out twice", () => {
    const { state } = newGame(3);
    state.goals.done.fire = true;
    expect(goalDeed(state, { kind: "lit" })).toEqual([]);
  });

  it("queues each completion for its congratulation", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(state.goals.queue).toEqual(["firewood"]);
  });

  it("gives a goal reached before it was asked for its credit anyway", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "built", structure: "turfHut" })).toEqual(["roof"]);
  });

  // Progress surviving a death only means something once a death actually
  // happens; tests/goals-deeds.test.ts lands a real heir and checks it there.

  it("gives every goal a definition", () => {
    for (const g of GOALS) expect(goalDef(g.id)).toBe(g);
  });

  it("starts a world with an empty ladder standing in the season it landed in", () => {
    const g = newGoals("winter");
    expect(g.done).toEqual({});
    expect(g.progress).toEqual({});
    expect(g.queue).toEqual([]);
    expect(g.lastSeason).toBe("winter");
  });

  it("leaves state.goals alone when a new life is placed in the world or its teaching is reset", () => {
    const { state, world } = newGame(3);
    state.goals.progress.firewood = 6;
    const cell = cellOf(state, world);
    newPerson(state, world, cell, state.player.region);
    resetTeaching(state);
    // Nothing gets marked done and nothing but the one field set above is
    // touched: a mutation that credits any goal here would show up as an
    // extra key in either object, not just a wrong value in one already set.
    expect(state.goals.done).toEqual({});
    expect(state.goals.progress).toEqual({ firewood: 6 });
  });

  it("migrate gives a save with no goals field an empty ladder standing in today's season", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state)) as { version: number; state: Record<string, unknown> };
    delete raw.state.goals;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.goals).toEqual(newGoals(calendar(state.minute, state.startDoy).season));
  });
});
