import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { campNeed, currentNeed, NEED_LOG_LINES, NEED_WORDS, SLEEP_AT } from "../src/sim/body";
import { FIRE_LOW_KG } from "../src/sim/items";
import { advance } from "../src/sim/advance";
import { intentSentence, startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { SPENT_AT } from "../src/sim/sleep";
import { addOrder, removeOrder, ordersHere, orderSentence, judgeOrders } from "../src/sim/orders";
import { bodyRowOf, campRowOf, isBodyRow, isCampRow, judgeBodyRow, judgeCampRow, serveCampRow, BODY_SENTENCE, CAMP_SENTENCE } from "../src/sim/bodyorder";
import { addItem, pile, qty } from "../src/sim/inventory";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";
import { Rng } from "../src/rng";
import { hurryKind } from "../src/ui/hurry";
import { readSave, serialize } from "../src/sim/save";
import { testAtmosphere, testRain } from "./weather-helpers";
import { cellAt, regionAt } from "../src/world/gen";
import { runOrders } from "../src/sim/orders";
import { stepTask } from "../src/sim/tasks";

const cal = calendar(0);

// Body-row tests control needs directly. Start each one in mild dry local air;
// the storm cases replace this at the same authoritative sampling boundary.
beforeEach(() => testAtmosphere());

describe("the body row", () => {
  it("does not bypass queue priority with a hidden idle sleep", () => {
    const { state, world } = newGame(3);
    state.player.energy = 5;
    const blocked = addOrder(state, world, { task: "split", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job", "top");
    blocked.pinned = true;
    advance(state, world, 1);
    expect(state.task).toBeNull();
    expect(state.intent).toBeNull();
  });

  it("a new region's list is the two care rows and nothing else, the camp above the body", () => {
    const { state, world } = newGame(3);
    const list = ordersHere(state, world);
    expect(list.length).toBe(2);
    expect(isCampRow(list[0])).toBe(true);
    expect(isBodyRow(list[1])).toBe(true);
    expect(orderSentence(state, world, cal, list[0])).toBe(CAMP_SENTENCE);
    expect(orderSentence(state, world, cal, list[1])).toBe(BODY_SENTENCE);
  });

  it("neither care row can be struck off", () => {
    const { state, world } = newGame(3);
    const body = bodyRowOf(state, world)!;
    const camp = campRowOf(state, world)!;
    removeOrder(state, world, body.id);
    removeOrder(state, world, camp.id);
    expect(bodyRowOf(state, world)?.id).toBe(body.id);
    expect(campRowOf(state, world)?.id).toBe(camp.id);
  });

  it("a save from before them loads with both, at the top", () => {
    const { state, world } = newGame(3);
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      st.orders = [];
    }
    const file = readSave(JSON.stringify(raw))!;
    const list = ordersHere(file.state, world);
    expect(isCampRow(list[0])).toBe(true);
    expect(isBodyRow(list[1])).toBe(true);
  });

  it("a save carrying the body row alone loads with the camp row put on above it", () => {
    const { state, world } = newGame(3);
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as { orders: { kind: string }[] }[]) {
      st.orders = st.orders.filter((o: { kind: string }) => o.kind !== "camp");
    }
    const file = readSave(JSON.stringify(raw))!;
    const list = ordersHere(file.state, world);
    expect(list.map((o) => o.kind)).toEqual(["camp", "body"]);
  });

  it("it reads met when the body wants nothing and ready when it does", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.warmth = 100;
    p.water = 3;
    p.kcal = 3000;
    p.energy = 100;
    p.sleepDebt = 0;
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).toBe("met");
    // Hungry, with food in the pack the row can reach without a walk: the
    // need fires and there is something to do about it.
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).toBe("ready");
  });

  it("a dry read never eats: judging the row over and over leaves the pack and the reserve untouched", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    const before = p.pack.items.driedMeat;
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.kcal).toBe(200);
    expect(p.pack.items.driedMeat).toBe(before);
  });

  it("a dry read never drinks: judging a thirsty body with a full waterskin leaves the reserve untouched", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.tools.push({ id: "waterskin", durability: 100, litres: 3 });
    p.water = 0.5;
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.water).toBe(0.5);
  });

  it("a dry read never feeds the fire: judging a storm at camp leaves the woodpile and the fire's own fuel untouched", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    st.fire.lit = true;
    st.fire.fuelKg = 1;
    addItem(pile(state, st.campCell!), "firewood", 5);
    testRain(8, 5, 40);
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(st.fire.fuelKg).toBe(1);
    expect(qty(pile(state, st.campCell!), "firewood")).toBe(5);
  });

  it("a dry read never records collapse: the serving read owns physical recovery memory", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    expect(p.sleeping).toBeNull();
    // Under the collapse line, the next serving read records forced Rest.
    p.energy = SLEEP_AT;
    for (let i = 0; i < 20; i++) expect(judgeBodyRow(state, world, cal, new Rng(1)).v).not.toBe("met");
    expect(p.collapsed).toBe(false);
    // The minute, and only the minute, records it without starting sleep.
    expect(currentNeed(state, world, cal)).toBe("spent");
    expect(p.collapsed).toBe(true);
    expect(p.sleeping).toBeNull();
  });

  it("a dry read never writes bodyNeed: the one minute a finished sleep or rest opens for the scheduler stays open", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    // tasks.ts clears bodyNeed to null the instant a sleep or a rest's
    // estimated span completes, so the scheduler gets one clean minute
    // before the body's row decides the need is still there. A judgement
    // that wrote the answer back would close that minute before it opened.
    p.bodyNeed = null;
    judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.bodyNeed).toBeNull();
  });

  it("a dry read of the camp row never feeds the fire: judging a fire at the low mark leaves the woodpile and the fire's own fuel untouched", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    st.fire.lit = true;
    st.fire.fuelKg = FIRE_LOW_KG;
    addItem(pile(state, st.campCell!), "firewood", 5);
    expect(judgeCampRow(state, world, cal, new Rng(1)).v).toBe("ready");
    for (let i = 0; i < 20; i++) judgeCampRow(state, world, cal, new Rng(1));
    expect(st.fire.fuelKg).toBe(FIRE_LOW_KG);
    expect(qty(pile(state, st.campCell!), "firewood")).toBe(5);
  });

  it("the camp row reads met with nothing to keep, and goes back to met once the wood is on", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    expect(judgeCampRow(state, world, cal, new Rng(1)).v).toBe("met");
    st.fire.lit = true;
    st.fire.fuelKg = FIRE_LOW_KG;
    addItem(pile(state, st.campCell!), "firewood", 5);
    expect(judgeCampRow(state, world, cal, new Rng(1)).v).toBe("ready");
    // The wet read is what actually puts the wood on, and the row has
    // nothing left to ask for after it.
    serveCampRow(state, world, cal, new Rng(1), campRowOf(state, world)!);
    expect(st.fire.fuelKg).toBeGreaterThan(FIRE_LOW_KG);
    expect(judgeCampRow(state, world, cal, new Rng(1)).v).toBe("met");
  });

  it("a blocked need reads as the row's own fragment on the row, and the log's own sentence in the log", () => {
    testRain(8, 5, 40);
    const { state, world } = newGame(3);
    // On water and over the pack limit: neither a shelter in place nor a
    // walk can start. Open land now has the emergency shelter answer.
    const water = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "water")!;
    placeAt(state, world, water);
    addItem(state.player.pack, "log", 2);
    // The row's own reading is the fragment, the same shape every other
    // skip reason takes, since the panel never resolves the log's voice.
    expect(judgeBodyRow(state, world, cal, new Rng(1))).toEqual({ v: "blocked", why: NEED_WORDS.storm });
    judgeOrders(state, world, cal);
    // The log's own line is the templated sentence, not the row's fragment:
    // this is the one the fix guards, since a wrong lookup here would still
    // pass a test that checked the row's own text instead.
    expect(state.log.at(-1)?.text).toBe(NEED_LOG_LINES.storm);
  });
});

describe("the body row takes its turn by rank", () => {
  it("sets storm shelter work aside at storm end so ready work resumes with cover progress kept", () => {
    testRain(8, 5, 40);
    const { state, world } = newGame(17);
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "meadow")!;
    placeAt(state, world, cell);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 0, until: 10, warned: true };
    const work = addOrder(state, world, { task: "readSky", where: "nearest", until: { kind: "once" }, deliver: "leave" }, "job");
    const rows = ordersHere(state, world).map(o => o.id);
    runOrders(state, world, cal, new Rng(1));
    expect(state.task?.id).toBe("emergencyShelter");
    advance(state, world, 9);
    const progress = regionState(state, world, state.player.region).sites[cell].emergencyMinutes;
    expect(progress).toBeGreaterThan(0);
    testAtmosphere();
    advance(state, world, 2);
    expect(state.weather.storm).toBeNull();
    expect(state.intent?.orderId).toBe(work.id);
    expect(state.task?.id).toBe("readSky");
    const kept = regionState(state, world, state.player.region).sites[cell].emergencyMinutes;
    expect(kept).toBeGreaterThanOrEqual(progress);
    advance(state, world, 1);
    expect(regionState(state, world, state.player.region).sites[cell].emergencyMinutes).toBe(kept);
    expect(ordersHere(state, world).map(o => o.id)).toEqual(rows);
  });

  it("claims a matching shelter task from lower-ranked work under the body row's name", () => {
    const { state, world } = newGame(17);
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "spruce")!;
    placeAt(state, world, cell);
    const work = addOrder(state, world, { task: "findShelter", where: { cell }, until: { kind: "once" }, deliver: "leave" }, "job");
    runOrders(state, world, cal, new Rng(1));
    stepTask(state, world, cal, new Rng(1), 5);
    const progress = state.task!.progress;
    expect(state.intent?.orderId).toBe(work.id);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    runOrders(state, world, cal, new Rng(1));
    expect(state.intent).toMatchObject({ mode: "care", orderId: bodyRowOf(state, world)!.id });
    expect(state.task?.id).toBe("findShelter");
    expect(state.task!.progress).toBeGreaterThanOrEqual(progress);
  });

  it("sets aside its own emergency build at weatherproof while keeping site progress", () => {
    const { state, world } = newGame(17);
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "meadow")!;
    placeAt(state, world, cell);
    state.weather.precip = "none";
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    const body = bodyRowOf(state, world)!;
    const ids = ordersHere(state, world).map(o => o.id);
    runOrders(state, world, cal, new Rng(1));
    expect(state.task?.id).toBe("emergencyShelter");
    stepTask(state, world, cal, new Rng(1), 90);
    const progress = regionState(state, world, state.player.region).sites[cell].emergencyMinutes;
    expect(progress).toBeGreaterThanOrEqual(90);
    runOrders(state, world, cal, new Rng(1));
    expect(state.task?.id).toBe("light");
    expect(state.intent).toMatchObject({ mode: "care", orderId: body.id });
    expect(regionState(state, world, state.player.region).sites[cell].emergencyMinutes).toBe(progress);
    expect(ordersHere(state, world).map(o => o.id)).toEqual(ids);
  });

  it("leaves higher-ranked work running, then owns every storm step and resumes set-aside work", () => {
    const { state, world } = newGame(17);
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "spruce")!;
    placeAt(state, world, cell);
    state.weather.precip = "none";
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 10);
    const work = addOrder(state, world, { task: "sticks", where: { cell }, until: { kind: "forever" }, deliver: "leave" }, "grind", "top");
    const list = ordersHere(state, world);
    const body = bodyRowOf(state, world)!;
    const ids = list.map(o => o.id).sort();
    runOrders(state, world, cal, new Rng(1));
    stepTask(state, world, cal, new Rng(1), 5);
    const progress = state.task!.progress;
    runOrders(state, world, cal, new Rng(1));
    expect(state.intent?.orderId).toBe(work.id);
    expect(state.task?.id).toBe("sticks");
    list.splice(list.indexOf(body), 1);
    list.unshift(body);
    for (const task of ["findShelter", "improveCover", "light", "rest"] as const) {
      runOrders(state, world, cal, new Rng(1));
      expect(state.task?.id).toBe(task);
      expect(state.intent).toMatchObject({ mode: "care", orderId: body.id, need: "storm" });
      expect(list.map(o => o.id).sort()).toEqual(ids);
      if (task !== "rest") stepTask(state, world, cal, new Rng(1), 100);
    }
    expect(Object.values(state.paused).some(p => p.id === "sticks" && p.fraction > 0)).toBe(true);
    state.weather.storm = null;
    stepTask(state, world, cal, new Rng(1), 100);
    runOrders(state, world, cal, new Rng(1));
    expect(state.intent?.orderId).toBe(work.id);
    expect(state.task?.id).toBe("sticks");
    expect(state.task!.progress).toBeGreaterThanOrEqual(progress);
  });
  it("under the work, the survivor works on past spent", () => {
    const { state, world } = newGame(3);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    // No panel control ranks a row above the body row, so the list is
    // arranged here directly: what is under test is the scheduler's rule
    // about rank, not the door a rank is changed through.
    const list = ordersHere(state, world);
    list.reverse();
    expect(list[0].id).toBe(grind.id);
    state.player.energy = SPENT_AT - 1;
    advance(state, world, 5);
    expect(state.intent?.orderId).toBe(grind.id);
  });

  it("absolute exhaustion releases runner work regardless of rank", () => {
    const { state, world } = newGame(3);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    ordersHere(state, world).reverse();
    state.player.energy = SLEEP_AT + 1;
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(grind.id);

    state.player.energy = SLEEP_AT;
    advance(state, world, 1);

    expect(state.player.collapsed).toBe(true);
    expect(state.player.sleeping).toBeNull();
    expect(state.intent?.orderId).not.toBe(grind.id);
    expect(state.task?.id).not.toBe("sticks");
  });

  it("under the work, the body's memory is still kept current: a want that ends is seen to end, and the hurry is not left answering for it", () => {
    const { state, world } = newGame(17);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    // Both care rows under the work, which is the rank this list exists to
    // allow: "keep at it, tired or not".
    const list = ordersHere(state, world);
    list.reverse();
    expect(list[0].id).toBe(grind.id);
    advance(state, world, 60);
    expect(state.intent?.orderId).toBe(grind.id);
    // A want the row answered while it still had the minute, long over by
    // now: a fresh body is neither spent nor near sleepy.
    state.player.bodyNeed = "spent";
    advance(state, world, 2);
    expect(state.player.bodyNeed).not.toBe("spent");
    // A body reading a want it no longer has is a body nothing else can
    // speak for: the hurry reads the same memory and goes quiet on it.
    expect(hurryKind(state)).toBe("click");
  });

  it("above the work, it takes the minute mid-chunk and the work keeps its minutes", () => {
    const { state, world } = newGame(3);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 30);
    expect(state.intent?.orderId).toBe(grind.id);
    const minutes = grind.minutes;
    // Thirsty with nothing to drink from on the belt, so the need wants his
    // feet: a mouthful he could take where he stands would cost the sticks
    // nothing and the row would never need the minute at all.
    state.player.water = 0;
    advance(state, world, 2);
    expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
    expect(grind.minutes).toBeGreaterThanOrEqual(minutes);
  });

  it("striking the last order off does not stop a sleep already under way", () => {
    const { state, world } = newGame(3);
    const chore = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.player.energy = 15;
    state.player.sleepDebt = 1000;
    advance(state, world, 5);
    expect(state.task?.id).toBe("sleep");
    const slept = state.task!.progress;
    removeOrder(state, world, chore.id);
    advance(state, world, 1);
    expect(state.task?.id).toBe("sleep");
    expect(state.task!.progress).toBeGreaterThanOrEqual(slept);
  });
});

describe("the camp row and a chunk in hand", () => {
  it("the walk to the snares still waits for the work in hand to end", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 60);
    expect(state.intent?.orderId).toBe(grind.id);
    expect(state.task).not.toBeNull();
    // A catch hanging in the snares, which is the camp's other want: it asks
    // for his feet, so it is work like any other and takes its turn.
    st.snareCatch = { count: 1, age: 0 };
    expect(campNeed(state, world, calendar(state.minute, state.startDoy))).toBe("snares");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(grind.id);
    expect(state.task).not.toBeNull();
  });
});

describe("work with no row behind it", () => {
  it("says so when the body takes the minute off it, since nothing on the list will bring it back", () => {
    const { state, world } = newGame(3);
    // Started by hand with no order behind it, the way a raw haul click is:
    // there is no row to pick it up again once the body has the minute.
    placeAtSpot(state, world, state.player.region, "forest");
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" });
    const said = intentSentence(state, world, cal, state.intent!);
    expect(state.intent?.orderId).toBeNull();
    // Thirsty with nothing to drink from, so the need wants his feet and the
    // row has to claim the minute to answer it.
    state.player.water = 0;
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
    expect(state.log.some((e) => e.text === `${said}: set aside, {you} {are} thirsty.`)).toBe(true);
  });

  it("leaves the survivor idle until the body has a concrete need", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    // A keep already meets, so the scheduler has no work to start.
    addItem(pile(state, st.campCell!), "firewood", 60);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 10);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
    // A real sleep need creates a care intent and a sleep task.
    state.player.sleepDebt = 1000;
    advance(state, world, 2);
    expect(state.task?.id).toBe("sleep");
    expect(state.intent?.mode).toBe("care");
    expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
    expect(state.log.some((e) => e.text.includes("set aside,"))).toBe(false);
  });
});
