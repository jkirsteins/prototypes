import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { activeGoals, goalDeed, goalDef, GOALS, newGoals, SEASON_ORDER } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { RECIPES, RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { TASK_IDS, type Season } from "../src/sim/types";

const cal = calendar(0);

/**
 * Crafted intermediates: naming one in a goal's title would hand the player
 * the route, which is the thing the whole subsystem exists not to do. The
 * goal's own object is fair - "firewood" is where you are going, "cordage"
 * is how you get there.
 */
const ROUTE_WORDS = [
  "cordage", "fire drill", "drill", "stone knife", "knife", "whetstone",
  "bone needle", "needle", "wedge", "flaked axe", "stone axe", "torch",
  "bow", "arrow", "fishing spear", "bark", "stick", "log",
];

describe("the goal ladder", () => {
  it("holds out one goal in the opening and starts with the firewood", () => {
    const { state } = newGame(3);
    expect(activeGoals(state, cal)).toEqual(["firewood"]);
  });

  it("widens to two once the fire and food chain is behind it", () => {
    const { state } = newGame(3);
    for (const id of ["firewood", "fire", "cook"] as const) state.goals.done[id] = true;
    expect(activeGoals(state, cal)).toEqual(["bed", "roof"]);
  });

  it("widens to three once the camp jobs run in parallel", () => {
    const { state } = newGame(3);
    for (const g of GOALS.slice(0, 5)) state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual(["water", "snare", "store"]);
  });

  it("never shows more than the seasons can fill, and never narrows", () => {
    const { state } = newGame(3);
    for (const g of GOALS.slice(0, 7)) state.goals.done[g.id] = true;
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
        { kind: "delivered", item: "firewood", kg: 99 } as const,
        { kind: "delivered", item: "wetFirewood", kg: 99 } as const,
      ];
      expect(emitted.some((d) => g.credit(d) > 0), `${g.id} is unreachable`).toBe(true);
    }
  });

  it("never names a route in a title", () => {
    for (const g of GOALS) {
      const t = g.title.toLowerCase();
      for (const w of ROUTE_WORDS) {
        expect(t.includes(w), `"${g.title}" names the route word "${w}"`).toBe(false);
      }
    }
  });

  it("gives every recipe a chance to stay secret: no title is a recipe name", () => {
    const names = RECIPE_IDS.map((r) => RECIPES[r].name.toLowerCase());
    for (const g of GOALS) expect(names).not.toContain(g.title.toLowerCase());
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

  it("counts the kilos this survivor carried in, so an inherited pile moves nothing", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "delivered", item: "firewood", kg: 4 })).toEqual([]);
    expect(state.goals.progress.firewood).toBeCloseTo(4);
    expect(goalDeed(state, { kind: "delivered", item: "wetFirewood", kg: 6 })).toEqual(["firewood"]);
    expect(state.goals.done.firewood).toBe(true);
  });

  it("never hands the same goal out twice", () => {
    const { state } = newGame(3);
    state.goals.done.fire = true;
    expect(goalDeed(state, { kind: "lit" })).toEqual([]);
  });

  it("queues each completion for its congratulation", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    expect(state.goals.queue).toEqual(["firewood"]);
  });

  it("gives a goal reached before it was asked for its credit anyway", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "built", structure: "turfHut" })).toEqual(["roof"]);
  });

  it("keeps a counted goal's progress across a death", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 6 });
    // What a landing does to the person half; the world half is untouched.
    expect(state.goals.progress.firewood).toBeCloseTo(6);
  });

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
});
