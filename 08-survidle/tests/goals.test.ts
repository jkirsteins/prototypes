import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { activeGoals, goalDeed, goalDef, goalSteps, GOALS, introduceGoals, newGoals, SEASON_ORDER, unintroducedGoals } from "../src/sim/goals";
import { ITEM_NAMES, RECIPE_IDS, RECIPES, STRUCTURE_IDS, STRUCTURES, TOOL_IDS, TOOLS } from "../src/sim/items";
import { newGame, newPerson } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import { resetTeaching } from "../src/sim/teach";
import { TASK_IDS, type GoalId, type Season } from "../src/sim/types";

const cal = calendar(0);

const CHAPTER_1 = ["findUsefulCover", "makeUsefulShelter", "testShelter"] as const;
const CHAPTER_2 = ["readWeather", "prepareWeather", "surviveForecast"] as const;
const CHAPTER_3 = ["remoteRefuge", "fieldFire", "fieldMeal", "remoteStorm"] as const;
const WEATHER_GOALS = [...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3] as readonly GoalId[];

function finish(state: ReturnType<typeof newGame>["state"], ids: readonly GoalId[]): void {
  for (const id of ids) state.goals.done[id] = true;
}

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
  drink: ["water"],
  fat: ["fat"],
  forageMeal: ["berries", "eggs", "roots", "seaweed"],
  snareMeal: ["snare", "snare", "cooked meat"],
  huntMeal: ["bow", "arrow", "cooked meat"],
  fishMeal: ["fish", "fishing spear", "cooked fish"],
  trapMeal: ["fish", "basket trap", "cooked fish"],
};

describe("the goal ladder", () => {
  it("holds out one goal in the opening and starts with choosing where to live", () => {
    const { state } = newGame(3);
    expect(activeGoals(state, cal)).toEqual(["site"]);
    expect(state.goals.introduced).toEqual({});
  });

  it("introduces each active goal once", () => {
    const { state } = newGame(3);
    expect(unintroducedGoals(state, cal)).toEqual(["site"]);
    introduceGoals(state, ["site"]);
    expect(unintroducedGoals(state, cal)).toEqual([]);
  });

  it("keeps the opening sequential until first-night work can run together", () => {
    const { state } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire"] as const) {
      expect(activeGoals(state, cal)).toEqual([id]);
      state.goals.done[id] = true;
    }
    expect(activeGoals(state, cal)).toEqual(["bed", "roof", "keptNight"]);
  });

  it("widens to three for first-night preparation", () => {
    const { state } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire"] as const) state.goals.done[id] = true;
    expect(activeGoals(state, cal)).toEqual(["bed", "roof", "keptNight"]);
  });

  it("opens only the first unfinished authored stage", () => {
    const { state } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight"] as GoalId[]) state.goals.done[id] = true;
    expect(activeGoals(state, cal)).toEqual(["forageMeal", "cook"]);
    state.goals.done.forageMeal = true;
    expect(activeGoals(state, cal)).toEqual(["cook"]);
    state.goals.done.cook = true;
    expect(activeGoals(state, cal)).toEqual(["findUsefulCover"]);
  });

  it("teaches Chapter 1 one step at a time after the first meals", () => {
    const { state } = newGame(3);
    finish(state, ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook"]);
    for (const id of CHAPTER_1) {
      expect(activeGoals(state, cal)).toEqual([id]);
      state.goals.done[id] = true;
    }
    expect(activeGoals(state, cal)).toEqual(["snareMeal", "huntMeal", "fishMeal"]);
  });

  it("keeps ordinary goals visible before Chapter 2 opens, then adds the lesson at day 8", () => {
    const { state } = newGame(3);
    finish(state, ["site", "drink", "firewood", "fire", "forageMeal", "cook", ...CHAPTER_1, "bed", "roof", "keptNight"]);
    const day7 = calendar(6 * 1440, state.startDoy);
    const day8 = calendar(7 * 1440, state.startDoy);
    expect(activeGoals(state, day7)).toEqual(["snareMeal", "huntMeal", "fishMeal"]);
    expect(activeGoals(state, day8)).toEqual(["readWeather", "snareMeal", "huntMeal"]);
  });

  it("keeps Chapters 2 and 3 ordered beside the current ordinary stage", () => {
    const { state } = newGame(3);
    finish(state, ["site", "drink", "firewood", "fire", "forageMeal", "cook", ...CHAPTER_1, "bed", "roof", "keptNight"]);
    const day8 = calendar(7 * 1440, state.startDoy);
    for (const id of CHAPTER_2) {
      expect(activeGoals(state, day8)).toEqual([id, "snareMeal", "huntMeal"]);
      state.goals.done[id] = true;
    }
    expect(activeGoals(state, day8)).toEqual(["snareMeal", "huntMeal", "fishMeal"]);
    const day31 = calendar(30 * 1440, state.startDoy);
    for (const id of CHAPTER_3) {
      expect(activeGoals(state, day31)).toEqual([id, "snareMeal", "huntMeal"]);
      state.goals.done[id] = true;
    }
    expect(activeGoals(state, day31)).toEqual(["snareMeal", "huntMeal", "fishMeal"]);
  });

  it("finishes authored work before opening the seasonal tail", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id) && g.id !== "winterStores") state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual(["winterStores"]);
    state.goals.done.winterStores = true;
    expect(activeGoals(state, cal)).toEqual(["summer"]);
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
      if (WEATHER_GOALS.includes(g.id)) continue;
      const emitted = [
        ...TASK_IDS.map((id) => ({ kind: "task", id }) as const),
        ...RECIPE_IDS.map((recipe) => ({ kind: "crafted", recipe }) as const),
        ...STRUCTURE_IDS.map((s) => ({ kind: "built", structure: s }) as const),
        // SEASON_ORDER's ids and the four seasons share their spelling, not their type.
        ...SEASON_ORDER.map((s) => ({ kind: "season", season: s as Season }) as const),
        { kind: "lit" } as const,
        { kind: "stored" } as const,
        { kind: "foundSign" } as const,
        { kind: "recoveredAtCamp" } as const,
        { kind: "cooked", kg: 1 } as const,
        { kind: "gathered", item: "firewood", kg: 99 } as const,
        { kind: "gathered", item: "wetFirewood", kg: 99 } as const,
        { kind: "keptNight" } as const,
        { kind: "keptFor", minutes: 999999 } as const,
        { kind: "keptRain", minutes: 999999 } as const,
        { kind: "drank" } as const,
        { kind: "foodAcquired", method: "forage" } as const,
        { kind: "foodAcquired", method: "snare" } as const,
        { kind: "foodAcquired", method: "hunt" } as const,
        { kind: "foodAcquired", method: "fish" } as const,
        { kind: "foodAcquired", method: "trap" } as const,
        { kind: "ate", item: "berries" } as const,
        { kind: "ate", item: "cookedMeat" } as const,
        { kind: "ate", item: "cookedFish" } as const,
        { kind: "ate", item: "driedMeat" } as const,
        { kind: "preserved" } as const,
        { kind: "fuelled" } as const,
        { kind: "ordered", task: "deadwood", long: true } as const,
        { kind: "foodSourced" } as const,
        { kind: "ateFat" } as const,
        { kind: "toolCared" } as const,
        { kind: "explored", anotherRegion: true } as const,
        { kind: "campedAgain", region: 1 } as const,
        { kind: "seasonalFood" } as const,
        { kind: "winterStocked" } as const,
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
  it("ignores deeds until the goal has been announced, without replaying them later", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "drank" })).toEqual([]);
    expect(state.goals.done.drink).toBeUndefined();
    expect(state.goals.progress.drink).toBeUndefined();
    expect(state.goals.queue).toEqual([]);

    introduceGoals(state, ["drink"]);
    expect(state.goals.done.drink).toBeUndefined();
    expect(goalDeed(state, { kind: "drank" })).toEqual(["drink"]);
    expect(state.goals.done.drink).toBe(true);
  });

  it("advances on a deed and not on a state a survivor inherited", () => {
    const { state } = newGame(3);
    introduceGoals(state, ["fire"]);
    // Standing in a camp whose fire is already burning is not lighting one.
    expect(state.goals.done.fire).toBeUndefined();
    // A light whose tinder failed emits the task and no "lit": no credit.
    expect(goalDeed(state, { kind: "task", id: "light" })).toEqual([]);
    goalDeed(state, { kind: "built", structure: "firePit" });
    goalDeed(state, { kind: "fuelled" });
    goalDeed(state, { kind: "crafted", recipe: "fireDrill" });
    expect(goalDeed(state, { kind: "lit" })).toEqual(["fire"]);
    expect(state.goals.done.fire).toBe(true);
  });

  it("counts the kilos this survivor actually gathered, wet or dry alike", () => {
    const { state } = newGame(3);
    introduceGoals(state, ["firewood"]);
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
    introduceGoals(state, ["firewood"]);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(state.goals.queue).toEqual(["firewood"]);
  });

  it("does not credit later building goals before they are announced", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "built", structure: "turfHut" })).toEqual([]);
    expect(state.goals.done.roof).toBeUndefined();
    expect(state.goals.done.durableRoof).toBeUndefined();
  });

  it("finishes hunting only after sign, recovery, and eating", () => {
    const { state } = newGame(3);
    introduceGoals(state, ["huntMeal"]);

    goalDeed(state, { kind: "ate", item: "cookedMeat" });
    expect(state.goals.done.huntMeal).toBeUndefined();

    goalDeed(state, { kind: "crafted", recipe: "bow" });
    goalDeed(state, { kind: "crafted", recipe: "arrows" });
    goalDeed(state, { kind: "foundSign" });
    goalDeed(state, { kind: "recoveredAtCamp" });
    expect(goalSteps(state, "huntMeal").map((step) => [step.label, step.done])).toEqual([
      ["Make a bow", true],
      ["Make arrows", true],
      ["Find fresh animal sign", true],
      ["Bring meat back to camp", true],
      ["Eat cooked meat", false],
    ]);
    expect(goalDeed(state, { kind: "ate", item: "cookedMeat" })).toEqual(["huntMeal"]);
  });

  it.each([
    {
      id: "forageMeal" as const,
      setup: [] as const,
      acquire: { kind: "foodAcquired", method: "forage" } as const,
      food: "berries" as const,
    },
    {
      id: "snareMeal" as const,
      setup: [
        { kind: "crafted", recipe: "snare" },
        { kind: "built", structure: "snare" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "snare" } as const,
      food: "cookedMeat" as const,
    },
    {
      id: "huntMeal" as const,
      setup: [
        { kind: "crafted", recipe: "bow" },
        { kind: "crafted", recipe: "arrows" },
        { kind: "foundSign" },
        { kind: "recoveredAtCamp" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "hunt" } as const,
      food: "cookedMeat" as const,
    },
    {
      id: "fishMeal" as const,
      setup: [{ kind: "crafted", recipe: "fishingSpear" }] as const,
      acquire: { kind: "foodAcquired", method: "fish" } as const,
      food: "cookedFish" as const,
    },
    {
      id: "trapMeal" as const,
      setup: [
        { kind: "crafted", recipe: "basketTrap" },
        { kind: "task", id: "setTrap" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "trap" } as const,
      food: "cookedFish" as const,
    },
  ])("requires acquisition and eating for $id", ({ id, setup, acquire, food }) => {
    const { state } = newGame(3);
    introduceGoals(state, [id]);
    expect(goalDeed(state, { kind: "ate", item: food })).toEqual([]);
    for (const deed of setup) goalDeed(state, deed);
    goalDeed(state, acquire);
    expect(state.goals.done[id]).toBeUndefined();
    expect(goalDeed(state, { kind: "ate", item: food })).toEqual([id]);
  });

  it("lets one matching meal close its method goal and the lasting-source umbrella", () => {
    const { state } = newGame(3);
    introduceGoals(state, ["trapMeal", "foodSource"]);
    goalDeed(state, { kind: "crafted", recipe: "basketTrap" });
    goalDeed(state, { kind: "task", id: "setTrap" });
    goalDeed(state, { kind: "foodAcquired", method: "trap" });
    expect(goalDeed(state, { kind: "ate", item: "cookedFish" })).toEqual(["trapMeal", "foodSource"]);
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
    expect(g.stepProgress).toEqual({});
    expect(g.introduced).toEqual({});
    expect(g.queue).toEqual([]);
    expect(g.noticeQueue).toEqual([]);
    expect(g.opportunity).toBeNull();
    expect(g.chapter3HomeRegion).toBeNull();
    expect(g.lastSeason).toBe("winter");
  });

  it("leaves state.goals alone when a new life is placed in the world or its teaching is reset", () => {
    const { state, world } = newGame(3);
    state.goals.progress.firewood = 6;
    state.goals.introduced.findUsefulCover = true;
    const cell = cellOf(state, world);
    newPerson(state, world, cell, state.player.region);
    resetTeaching(state);
    // Nothing gets marked done and nothing but the one field set above is
    // touched: a mutation that credits any goal here would show up as an
    // extra key in either object, not just a wrong value in one already set.
    expect(state.goals.done).toEqual({});
    expect(state.goals.progress).toEqual({ firewood: 6 });
    expect(state.goals.introduced.findUsefulCover).toBe(true);
  });

  it("migrate gives a save with no goals field an empty ladder standing in today's season", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state)) as { version: number; state: Record<string, unknown> };
    delete raw.state.goals;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.goals).toEqual(newGoals(calendar(state.minute, state.startDoy).season));
  });

  it("migrates an old ladder without moving its current goal backward", () => {
    const { state } = newGame(3);
    for (const id of ["site", "firewood", "fire", "cook"] as const) state.goals.done[id] = true;
    state.goals.queue = ["cook", "snare" as GoalId];
    const raw = JSON.parse(serialize(state)) as { state: { goals: Record<string, unknown> } };
    delete raw.state.goals.introduced;
    const loaded = deserialize(JSON.stringify(raw))!.state;
    expect(activeGoals(loaded, calendar(loaded.minute, loaded.startDoy))).toEqual(["keptNight"]);
    expect(loaded.goals.done.drink).toBe(true);
    expect(loaded.goals.done.bed).toBe(true);
    expect(loaded.goals.done.roof).toBe(true);
    for (const id of WEATHER_GOALS) expect(loaded.goals.done[id], id).toBeUndefined();
    expect(loaded.goals.queue).toEqual(["cook"]);
    expect(loaded.goals.noticeQueue).toEqual([]);
  });

  it("recovers Chapter 3 home for a save where the refuge goal was already introduced", () => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    state.regions[home].campCell = cellOf(state, world);
    state.goals.introduced.remoteRefuge = true;
    const raw = JSON.parse(serialize(state)) as { state: { goals: Record<string, unknown> } };
    delete raw.state.goals.chapter3HomeRegion;

    const loaded = deserialize(JSON.stringify(raw))!.state;

    expect(loaded.goals.chapter3HomeRegion).toBe(home);
  });

  it("restores the origin of an old survey already inside its target region", () => {
    const { state } = newGame(3);
    const target = state.player.region;
    const origin = target + 10000;
    state.regions[origin] = structuredClone(state.regions[target]);
    state.regions[origin].campCell = 123;
    state.task = { id: "explore", arg: `region:${target}`, progress: 4, duration: 10, repeat: false };
    const loaded = deserialize(serialize(state))!.state;
    expect(loaded.task?.originRegion).toBe(origin);
  });
});
