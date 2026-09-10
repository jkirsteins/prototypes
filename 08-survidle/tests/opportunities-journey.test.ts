const SEASON_KEYS = ["season:spring", "season:summer", "season:autumn", "season:winter"] as const;
import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { activeOpportunityKeys, recordOpportunityEvent, opportunityDef, opportunitySteps, OPPORTUNITIES, acknowledgeOpportunities, newOpportunities, unpresentedOpportunityKeys } from "../src/sim/opportunities";
import { ITEM_NAMES, RECIPE_IDS, RECIPES, STRUCTURE_IDS, STRUCTURES, TOOL_IDS, TOOLS } from "../src/sim/items";
import { newGame, newPerson } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { regionAt } from "../src/world/gen";
import { deserialize, serialize } from "../src/sim/save";
import { resetTeaching } from "../src/sim/teach";
import { TASK_IDS, type OpportunityKey, type Season } from "../src/sim/types";
import { allOpportunityDefs } from "../src/sim/opportunity-catalog";

const cal = calendar(0);

const INITIAL_COLLECTIONS = [
  "forage:berries", "forage:eggs", "forage:barkFlour", "forage:cookedRoots",
  "build:leanTo", "build:cabin", "build:boughBed", "build:turfHut", "build:snowShelter",
  "make:knife", "make:fireDrill", "make:bow", "make:fishingSpear", "make:needle",
  "make:stoneAxe", "make:flakedAxe", "make:whetstone", "make:barkBucket", "make:waterskin",
] as const;

const CHAPTER_1 = ["findUsefulCover", "makeUsefulShelter", "testShelter"] as const;
const CHAPTER_2 = ["readWeather", "prepareWeather", "surviveForecast"] as const;
const CHAPTER_3 = ["remoteRefuge", "fieldFire", "fieldMeal", "remoteStorm"] as const;
const WEATHER_OPPORTUNITIES = [...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3] as readonly OpportunityKey[];

function finish(state: ReturnType<typeof newGame>["state"], ids: readonly OpportunityKey[]): void {
  for (const id of ids) state.opportunities.completedAt[id] = 0;
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
 * opportunity titled "Knap a scraper" or "Weave a basket" is caught the day its
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
 * An opportunity's own object is fair to name - "firewood" is where you are going,
 * "cordage" is how you get there - so these are the one exception to the
 * guard below, and only for the opportunity they belong to.
 */
const OWN_WORD: Partial<Record<OpportunityKey, string[]>> = {
  firewood: ["firewood"],
  water: ["water"],
  drink: ["water"],
  fat: ["fat"],
  forageMeal: ["berries", "eggs", "roots", "seaweed"],
  snareMeal: ["snare", "snare", "cooked meat"],
  huntMeal: ["bow", "arrow", "cooked meat"],
  fishMeal: ["fish", "fishing spear", "cooked fish"],
  trapMeal: ["fish", "basket trap", "cooked fish"] };

describe("the authored opportunity journey", () => {
  it("starts with site, the four known seasons, and the visible collection possibilities", () => {
    const { state } = newGame(3);
    expect(activeOpportunityKeys(state, cal)).toEqual(["site", ...SEASON_KEYS, ...INITIAL_COLLECTIONS]);
    expect(unpresentedOpportunityKeys(state, cal).sort()).toEqual(["site", ...INITIAL_COLLECTIONS].sort());
    acknowledgeOpportunities(state, ["site"]);
    expect(unpresentedOpportunityKeys(state, cal).sort()).toEqual([...INITIAL_COLLECTIONS].sort());
    acknowledgeOpportunities(state, [...INITIAL_COLLECTIONS]);
    expect(unpresentedOpportunityKeys(state, cal)).toEqual([]);
  });
  it("releases all first-night leaves, then waits for all three before meals", () => {
    const { state } = newGame(3);
    finish(state, ["site", "drink", "firewood", "fire"]);
    expect(activeOpportunityKeys(state, cal)).toEqual(expect.arrayContaining(["bed", "roof", "keptNight"]));
    finish(state, ["bed", "roof"]);
    expect(activeOpportunityKeys(state, cal)).not.toContain("cook");
    finish(state, ["keptNight"]);
    expect(activeOpportunityKeys(state, cal)).toEqual(expect.arrayContaining(["forageMeal", "cook"]));
  });
  it("gates weather at day eight and remote work at day thirty-one", () => {
    const { state } = newGame(3);
    finish(state, ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook", ...CHAPTER_1]);
    state.minute = 9599;
    expect(activeOpportunityKeys(state, calendar(state.minute))).not.toContain("readWeather");
    state.minute = 9600;
    expect(activeOpportunityKeys(state, calendar(state.minute))).toContain("readWeather");
    expect(activeOpportunityKeys(state, calendar(state.minute))).not.toContain("snareMeal");
    finish(state, CHAPTER_2);
    state.minute = 42719;
    expect(activeOpportunityKeys(state, calendar(state.minute))).not.toContain("remoteRefuge");
    state.minute = 42720;
    expect(activeOpportunityKeys(state, calendar(state.minute))).toContain("remoteRefuge");
    finish(state, CHAPTER_3);
    expect(activeOpportunityKeys(state, calendar(state.minute))).toEqual(expect.arrayContaining(["snareMeal", "huntMeal", "fishMeal"]));
  });
  it("keeps all unfinished seasonal leaves available from world start", () => {
    const { state } = newGame(3);
    recordOpportunityEvent(state, { kind: "season", season: "winter" });
    expect(activeOpportunityKeys(state, cal)).toEqual(["site", "season:spring", "season:summer", "season:autumn", ...INITIAL_COLLECTIONS]);
  });
  it("has no unfinished keys after every definition is completed", () => {
    const { state } = newGame(3);
    for (const def of allOpportunityDefs()) state.opportunities.completedAt[def.key] = 0;
    expect(activeOpportunityKeys(state, cal)).toEqual([]);
  });
});

describe("opportunity guards", () => {
  it("credits every authored opportunity step by a deed the game actually emits", () => {
    for (const g of OPPORTUNITIES) {
      if (WEATHER_OPPORTUNITIES.includes(g.key)) continue;
      const emitted = [
        ...TASK_IDS.map((id) => ({ kind: "task", id }) as const),
        ...RECIPE_IDS.map((recipe) => ({ kind: "crafted", recipe }) as const),
        ...STRUCTURE_IDS.map((s) => ({ kind: "built", structure: s }) as const),
        // SEASON_KEYS's ids and the four seasons share their spelling, not their type.
        ...SEASON_KEYS.map((s) => ({ kind: "season", season: s.slice(7) as Season }) as const),
        { kind: "lit" } as const,
        { kind: "stored" } as const,
        { kind: "signFound", species: "deer" } as const,
        { kind: "animalKilled", species: "deer" } as const,
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
      for (const step of g.steps) {
        expect(emitted.some((d) => step.credit(d) > 0), `${g.key}/${step.id} is unreachable`).toBe(true);
      }
    }
  });

  it("never names a route in a title, checked against the real vocabularies as substrings", () => {
    for (const g of OPPORTUNITIES) {
      const t = g.title.toLowerCase();
      const own = OWN_WORD[g.key] ?? [];
      for (const w of ROUTE_WORDS) {
        if (own.includes(w)) continue;
        expect(t.includes(w), `"${g.title}" names the route word "${w}"`).toBe(false);
      }
    }
  });

  it("uses only ASCII the user can type", () => {
    for (const g of OPPORTUNITIES) expect(g.title).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("opportunities are the world's, not a life's", () => {
  it("ignores deeds until the opportunity has been announced, without replaying them later", () => {
    const { state } = newGame(3);
    expect(recordOpportunityEvent(state, { kind: "drank" })).toEqual([]);
    expect(state.opportunities.completedAt.drink).toBeUndefined();
    expect(state.opportunities.stepProgress.drink).toBeUndefined();
    expect(state.opportunities.notices.flatMap((notice) => notice.completed)).toEqual([]);

    reveal(state, ["drink"]);
    expect(state.opportunities.completedAt.drink).toBeUndefined();
    expect(recordOpportunityEvent(state, { kind: "drank" })).toEqual(["drink"]);
    expect(state.opportunities.completedAt.drink).toBeDefined();
  });

  it("advances on a deed and not on a state a survivor inherited", () => {
    const { state } = newGame(3);
    reveal(state, ["fire"]);
    // Standing in a camp whose fire is already burning is not lighting one.
    expect(state.opportunities.completedAt.fire).toBeUndefined();
    // A light whose tinder failed emits the task and no "lit": no credit.
    expect(recordOpportunityEvent(state, { kind: "task", id: "light" })).toEqual([]);
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    recordOpportunityEvent(state, { kind: "fuelled" });
    recordOpportunityEvent(state, { kind: "crafted", recipe: "fireDrill" });
    expect(recordOpportunityEvent(state, { kind: "lit" })).toEqual(["fire"]);
    expect(state.opportunities.completedAt.fire).toBeDefined();
  });

  it("counts the kilos this survivor actually gathered, wet or dry alike", () => {
    const { state } = newGame(3);
    reveal(state, ["firewood"]);
    expect(recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 4 })).toEqual([]);
    expect(state.opportunities.stepProgress.firewood?.wood).toBeCloseTo(4);
    expect(recordOpportunityEvent(state, { kind: "gathered", item: "wetFirewood", kg: 6 })).toEqual(["firewood"]);
    expect(state.opportunities.completedAt.firewood).toBeDefined();
  });

  it("never hands the same opportunity out twice", () => {
    const { state } = newGame(3);
    state.opportunities.completedAt.fire = 0;
    expect(recordOpportunityEvent(state, { kind: "lit" })).toEqual([]);
  });

  it("queues each completion for its congratulation", () => {
    const { state } = newGame(3);
    reveal(state, ["firewood"]);
    recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(state.opportunities.notices.flatMap((notice) => notice.completed)).toEqual(["firewood"]);
  });

  it("does not credit later building opportunities before they are announced", () => {
    const { state } = newGame(3);
    expect(recordOpportunityEvent(state, { kind: "built", structure: "turfHut" })).toEqual(["build:turfHut"]);
    expect(state.opportunities.completedAt["build:turfHut"]).toBe(state.minute);
    expect(state.opportunities.completedAt.roof).toBeUndefined();
    expect(state.opportunities.completedAt.durableRoof).toBeUndefined();
  });

  it("finishes hunting only after sign, recovery, and eating", () => {
    const { state } = newGame(3);
    reveal(state, ["huntMeal"]);

    recordOpportunityEvent(state, { kind: "ate", item: "cookedMeat" });
    expect(state.opportunities.completedAt.huntMeal).toBeUndefined();

    recordOpportunityEvent(state, { kind: "crafted", recipe: "bow" });
    recordOpportunityEvent(state, { kind: "crafted", recipe: "arrows" });
    recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
    recordOpportunityEvent(state, { kind: "recoveredAtCamp" });
    expect(opportunitySteps(state, "huntMeal").map((step) => [step.label, step.done])).toEqual([
      ["Make a bow", true],
      ["Make arrows", true],
      ["Find fresh animal sign", true],
      ["Bring meat back to camp", true],
      ["Eat cooked meat", false],
    ]);
    expect(recordOpportunityEvent(state, { kind: "ate", item: "cookedMeat" })).toEqual(["huntMeal"]);
  });

  it.each([
    {
      id: "forageMeal" as const,
      setup: [] as const,
      acquire: { kind: "foodAcquired", method: "forage" } as const,
      food: "berries" as const },
    {
      id: "snareMeal" as const,
      setup: [
        { kind: "crafted", recipe: "snare" },
        { kind: "built", structure: "snare" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "snare" } as const,
      food: "cookedMeat" as const },
    {
      id: "huntMeal" as const,
      setup: [
        { kind: "crafted", recipe: "bow" },
        { kind: "crafted", recipe: "arrows" },
        { kind: "signFound", species: "deer" },
        { kind: "recoveredAtCamp" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "hunt" } as const,
      food: "cookedMeat" as const },
    {
      id: "fishMeal" as const,
      setup: [{ kind: "crafted", recipe: "fishingSpear" }] as const,
      acquire: { kind: "foodAcquired", method: "fish" } as const,
      food: "cookedFish" as const },
    {
      id: "trapMeal" as const,
      setup: [
        { kind: "crafted", recipe: "basketTrap" },
        { kind: "task", id: "setTrap" },
      ] as const,
      acquire: { kind: "foodAcquired", method: "trap" } as const,
      food: "cookedFish" as const },
  ])("requires acquisition and eating for $id", ({ id, setup, acquire, food }) => {
    const { state } = newGame(3);
    reveal(state, [id]);
    expect(recordOpportunityEvent(state, { kind: "ate", item: food })).toEqual([]);
    for (const deed of setup) recordOpportunityEvent(state, deed);
    recordOpportunityEvent(state, acquire);
    expect(state.opportunities.completedAt[id]).toBeUndefined();
    expect(recordOpportunityEvent(state, { kind: "ate", item: food })).toEqual([id]);
  });

  it("lets one matching meal close its method opportunity and the lasting-source umbrella", () => {
    const { state } = newGame(3);
    reveal(state, ["trapMeal", "foodSource"]);
    recordOpportunityEvent(state, { kind: "crafted", recipe: "basketTrap" });
    recordOpportunityEvent(state, { kind: "task", id: "setTrap" });
    recordOpportunityEvent(state, { kind: "foodAcquired", method: "trap" });
    expect(recordOpportunityEvent(state, { kind: "ate", item: "cookedFish" })).toEqual(["trapMeal", "foodSource"]);
  });

  // Progress surviving a death only means something once a death actually
  // happens; tests/opportunities-deeds.test.ts lands a real heir and checks it there.

  it("gives every opportunity a definition", () => {
    for (const g of OPPORTUNITIES) expect(opportunityDef(g.key)).toBe(g);
  });

  it("starts a world with an empty ladder standing in the season it landed in", () => {
    const g = newOpportunities("winter");
    expect(g.completedAt).toEqual({});
    expect(g.stepProgress).toEqual({});
    expect(Object.keys(g.discoveredAt)).toEqual([...SEASON_KEYS, "site"]);
    expect(g.notices).toHaveLength(1);
    expect(g.context.weather).toBeNull();
    expect(g.context.chapter3HomeRegion).toBeNull();
    expect(g.lastSeason).toBe("winter");
  });

  it("leaves state.opportunities alone when a new life is placed in the world or its teaching is reset", () => {
    const { state, world } = newGame(3);
    state.opportunities.stepProgress.firewood = { wood: 6 };
    state.opportunities.discoveredAt.findUsefulCover = 0;
    const cell = cellOf(state, world);
    newPerson(state, world, cell, state.player.region);
    resetTeaching(state);
    // Nothing gets marked done and nothing but the one field set above is
    // touched: a mutation that credits any opportunity here would show up as an
    // extra key in either object, not just a wrong value in one already set.
    expect(state.opportunities.completedAt).toEqual({});
    expect(state.opportunities.stepProgress).toEqual({ firewood: { wood: 6 } });
    expect(state.opportunities.discoveredAt.findUsefulCover).toBeDefined();
  });

  it("migrate gives a save with no opportunities field an empty ladder standing in today's season", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state)) as { version: number; state: Record<string, unknown> };
    delete raw.state.opportunities;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.opportunities).toEqual(newOpportunities(calendar(state.minute, state.startDoy).season));
  });

  it("migrates known legacy deeds, compatible steps, and queued facts without replay", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state));
    raw.version = 9;
    delete raw.state.opportunities;
    raw.state["goals"] = {
      done: { site: true, drink: true, spring: true, obsolete: true },
      introduced: { firewood: true, fire: true },
      progress: { firewood: 6 },
      stepProgress: { fire: { site: 1, obsolete: 8 } },
      queue: ["drink", "obsolete"], noticeQueue: ["Weather passed."],
      chapter3HomeRegion: 77, lastSeason: "summer",
    };
    const loaded = deserialize(JSON.stringify(raw))!.state;
    expect(loaded.opportunities.current).toBe("firewood");
    expect(loaded.opportunities.completedAt).toEqual({ site: 0, drink: 0, "season:spring": 0 });
    expect(loaded.opportunities.discoveredAt.fire).toBe(0);
    expect(loaded.opportunities.stepProgress.firewood).toEqual({ wood: 6 });
    expect(loaded.opportunities.stepProgress.fire).toEqual({ site: 1 });
    expect(loaded.opportunities.notices).toEqual([expect.objectContaining({ completed: ["drink"], messages: ["Weather passed."] })]);
    expect(loaded.opportunities.context.chapter3HomeRegion).toBe(77);
    expect(loaded.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
    expect(JSON.parse(serialize(loaded)).state["goals"]).toBeUndefined();
  });

  it("keeps a legacy missing chapter home unknown rather than inferring one", () => {
    const { state, world } = newGame(3);
    state.regions[state.player.region].campCell = cellOf(state, world);
    const raw = JSON.parse(serialize(state));
    delete raw.state.opportunities;
    raw.state["goals"] = { introduced: { remoteRefuge: true } };
    const loaded = deserialize(JSON.stringify(raw))!.state;
    expect(loaded.opportunities.context.chapter3HomeRegion).toBeNull();
  });

  it.each(["refresh", "event"])("initializes a migrated remote chapter during live %s and credits the refuge", (entry) => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    state.regions[home].campCell = cellOf(state, world);
    const raw = JSON.parse(serialize(state));
    raw.version = 9;
    raw.state.minute = 42720;
    delete raw.state.opportunities;
    raw.state["goals"] = {
      done: Object.fromEntries(["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook", "findUsefulCover", "makeUsefulShelter", "testShelter", "readWeather", "prepareWeather", "surviveForecast"].map((id) => [id, true])),
      introduced: {}, chapter3HomeRegion: null,
    };
    const loaded = deserialize(JSON.stringify(raw))!.state;
    expect(loaded.opportunities.discoveredAt.remoteRefuge).toBeDefined();
    expect(loaded.opportunities.context.chapter3HomeRegion).toBeNull();
    expect(loaded.opportunities.completedAt.remoteRefuge).toBeUndefined();

    if (entry === "refresh") {
      activeOpportunityKeys(loaded, calendar(loaded.minute, loaded.startDoy));
      expect(loaded.opportunities.context.chapter3HomeRegion).toBe(home);
    }
    expect(loaded.opportunities.completedAt.remoteRefuge).toBeUndefined();
    const remote = regionAt(world, home).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    placeAt(loaded, world, refuge);
    expect(recordOpportunityEvent(loaded, {
      kind: "protectionChanged", minute: loaded.minute, region: remote,
      cell: refuge, from: 1, to: 2, source: "improved",
    }, world)).toContain("remoteRefuge");
    expect(loaded.opportunities.context.chapter3HomeRegion).toBe(home);
    expect(loaded.opportunities.completedAt.remoteRefuge).toBe(42720);
    expect(loaded.opportunities.discoveredAt.fieldFire).toBe(42720);
  });

  it("selects the old visible leaf on either side of the day-eight weather gate", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state));
    delete raw.state.opportunities;
    raw.state["goals"] = { done: Object.fromEntries(["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook", "findUsefulCover", "makeUsefulShelter", "testShelter"].map((id) => [id, true])), introduced: {} };
    raw.state.minute = 9599;
    expect(deserialize(JSON.stringify(raw))!.state.opportunities.current).toBe("snareMeal");
    raw.state.minute = 9600;
    expect(deserialize(JSON.stringify(raw))!.state.opportunities.current).toBe("readWeather");
  });

  it("moves a legacy weather reservation and home without inspecting the world", () => {
    const { state } = newGame(3);
    const raw = JSON.parse(serialize(state));
    delete raw.state.opportunities;
    const weather = { goal: "remoteStorm", status: "running", createdAt: 200, attempts: 3,
      stormId: 7, source: "natural", area: { region: 9, centre: 72, radiusKm: 1 },
      announcedAt: 300, resolvedAt: null, minutesByProtection: [1, 2, 3, 4],
      atCampMinutes: 5, awayFromCampMinutes: 6, maxWetness: 70, readerIndex: 2, plan: null };
    raw.state["goals"] = { opportunity: weather, chapter3HomeRegion: 5 };
    const loaded = deserialize(JSON.stringify(raw))!.state;
    const { goal: _goal, ...legacyContext } = weather;
    expect(loaded.opportunities.context).toEqual({
      weather: { ...legacyContext, opportunity: "remoteStorm" },
      chapter3HomeRegion: 5,
    });
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
