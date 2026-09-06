import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { minutesToCamp } from "../src/sim/body";
import { alertness, minutesToWake, RESTED_AT, SLEEP_MIN_MINUTES, SLEEP_ONSET } from "../src/sim/sleep";
import { calendar, minutesUntilDawn, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { bankFire } from "../src/sim/fire";
import { addItem, pile, qty, weight } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { baseWalkSpeed, stepPlayer } from "../src/sim/player";
import { cellOf, placeAt, watersideCell } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { PACK_COMFORTABLE_KG } from "../src/units";
import { cellAt, hasSpot, neighbours, regionAt } from "../src/world/gen";
import { findRoute, routeMinutes } from "../src/world/route";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
const rng = () => new Rng(1);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** A forever felling from camp, with the camp cell to hand. Seed 39: meadow camp, forest 0.6 km away. */
function felling(seed = 39, deliver: "leave" | "camp" = "leave") {
  const g = newGame(seed);
  const { state, world } = g;
  const camp = regionState(state, world, state.player.region).campCell;
  addItem(state.player.pack, "driedMeat", 2);
  startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "forever" }, deliver, where: "nearest" });
  return { g, state, world, camp };
}

describe("the body tier", () => {
  it("collapsing, it sets the tree aside, walks to camp and dozes there until it is rested", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    advance(state, world, 20);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("walk");
    expect(state.intent?.step).toBe("walking to camp for the night");
    expect(state.intent?.need).toBe("sleep");
    expect(Object.keys(state.paused)).toHaveLength(1);
    expect(until(g, () => state.task?.id === "sleep")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    // A morning collapse is a doze by the fire and says so; only a sleep begun
    // in the dark reads as sleeping.
    expect(state.intent?.step).toBe("dozing by the fire");
    expect(until(g, () => state.task?.id !== "sleep", 700)).toBe(true);
    expect(state.intent?.need).toBeNull();
    // It lay there until the fatigue an evening by the fire would have restored.
    expect(state.player.energy).toBeGreaterThanOrEqual(RESTED_AT);
    // Back to the tree it left, and on with the same intent.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.task!.progress).toBeGreaterThan(15);
  });

  it("bedtime is the onset line and not the dark: a sleepy body goes to bed, a fresh one works on through it", () => {
    // 21:00 on 1 April is dark at 62 N, and the dark on its own decides nothing.
    const hour = calendar(13 * 60).hour;
    const { g, state } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.minute = 13 * 60;
    state.player.energy = 100;
    state.player.sleepDebt = SLEEP_ONSET + 1 + alertness(hour);
    advance(state, g.world, 1);
    expect(state.intent?.need).toBe("sleep");
    const other = felling();
    expect(until(other.g, () => other.state.task?.id === "chop")).toBe(true);
    other.state.minute = 13 * 60;
    other.state.player.energy = 40;
    other.state.player.sleepDebt = SLEEP_ONSET - 5 + alertness(hour);
    advance(other.state, other.world, 1);
    expect(other.state.intent?.need).toBeNull();
    expect(other.state.task?.id).toBe("chop");
  });

  it("makes a fire for the night when the means are at camp: pit from stones, a split log, then light", () => {
    const { g, state, world, camp } = felling();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "stone", 6);
    addItem(pile(state, camp), "log", 1);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.energy = 20;
    const steps: string[] = [];
    until(g, () => {
      const s = state.intent?.step ?? "";
      if (steps.at(-1) !== s) steps.push(s);
      return state.task?.id === "sleep";
    }, 1500);
    expect(steps).toEqual(expect.arrayContaining(["walking to camp for the night", "laying a fire pit", "splitting a log for the fire", "lighting the fire", "dozing by the fire"]));
    expect(regionState(state, world, state.player.region).fire.lit).toBe(true);
  });

  it("with no way to camp it sleeps where it stands and says so", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Overload the pack so no walk can start.
    addItem(state.player.pack, "stone", 40);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("sleep");
    expect(state.intent?.step).toContain("where {you} {stand}");
    expect(state.log.some((e) => e.text.includes("{You} {sleep} where {you} {are}"))).toBe(true);
  });

  it("cold, it goes to camp and rests until warm again, and sleep outranks cold", () => {
    const { g, state, world, camp } = felling();
    const st = regionState(state, world, state.player.region);
    // A fire already going, so this region's camp can actually warm a cold body.
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(state.intent?.step).toBe("walking to camp to warm up");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    // The fire actually raises warmth: the rest runs to completion and gains real ground, so it is not "spent".
    expect(until(g, () => state.task?.id !== "rest", 200)).toBe(true);
    expect(state.player.warmth).toBeGreaterThan(45);
    expect(state.intent?.coldSpent).toBeFalsy();
    // Cold again: the need re-enters normally, not stuck spent from the rest that worked.
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    // Between the entry and the exit the need still holds; at the exit it lets go.
    state.player.warmth = 40;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    state.player.warmth = 80;
    advance(state, world, 1);
    expect(state.intent?.need).toBeNull();
    state.player.warmth = 20;
    state.player.energy = 15;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("sleep");
  });

  it("cold with a bare camp (no pit, no drill, no shelter) keeps working: the camp cannot warm anyone", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBeNull();
    expect(state.task?.id).toBe("chop");
  });

  it("cold with a lean-to at camp and no fire still goes to camp: shelter alone counts", () => {
    const { g, state, world } = felling();
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(state.intent?.step).toBe("walking to camp to warm up");
  });

  it("cold with a lean-to and no fire in deep cold: a rest that cannot help gives the need up", () => {
    const { g, state, world, camp } = felling();
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    // Far below any target the shelter alone can reach, so the rest that follows cannot gain a point.
    state.weather.offset = -25;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(until(g, () => state.task?.id !== "rest", 200)).toBe(true);
    expect(state.intent?.need).toBeNull();
    expect(state.intent?.coldSpent).toBe(true);
    // Spent, not stuck: the chop resumes rather than resting forever for nothing.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Warm again some other way (not by resting here): coldSpent lets go once warmth clears WARM_AT.
    state.player.warmth = 80;
    advance(state, world, 1);
    expect(state.intent?.coldSpent).toBe(false);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
  });

  it("hungry, it eats from the pack and keeps working; with food only at camp it goes there", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.autoEat = false;
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.player.kcal).toBeGreaterThan(1700);
    expect(state.task?.id).toBe("chop");
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 1);
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.intent?.step).toBe("walking to camp to eat");
    expect(until(g, () => state.player.kcal > 1800)).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("pockets provisions when leaving camp, up to 2 kg and never past the comfortable load", () => {
    // Seed 3's camp sits on forest, so a "sticks" intent never leaves camp and provision()
    // (fired from walkTo) never runs. Seed 39's camp is meadow; the forest is 0.6 km off.
    const g = newGame(39);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 5);
    startIntent(state, world, cal, rng(), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(qty(state.player.pack, "driedMeat")).toBeCloseTo(2, 6);
    expect(weight(state.player.pack)).toBeLessThanOrEqual(PACK_COMFORTABLE_KG);
  });

  it("provisioning at a waterside camp also fills every vessel", () => {
    // Seed 42's camp is not itself waterside (waterSource is false there), so the
    // region's camp is moved to a waterside cell of its own region for this test.
    // The named forest spot (rather than "nearest") keeps the felling cell distinct
    // from the new camp cell, so the intent actually walks off camp and provisions.
    // The waterside cell also needs a real route to the forest spot: not every
    // waterside cell in a region connects to it.
    const g = newGame(42);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const r = regionAt(world, state.player.region);
    const forestCell = r.spots.find((s) => s.id === "forest")!.cell;
    const waterside = r.cells.find((c) => c !== st.campCell && watersideCell(world, c) && findRoute(world, c, forestCell))!;
    st.campCell = waterside;
    placeAt(state, world, waterside);
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 0 });
    addItem(state.player.pack, "driedMeat", 2);
    startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "once" }, deliver: "leave", where: "forest" });
    expect(state.intent?.step).toBe("walking to the forest");
    expect(state.player.tools.find((t) => t.id === "barkBucket")!.litres).toBeCloseTo(2, 6);
  });

  it("a working day: trees fall, the night is spent at camp, and the work goes on at dawn", () => {
    // Seed 10: forest and shore both off camp, so a long trace can drink at the
    // shore on its own instead of needing its water kept topped up by hand.
    const { state, world, camp } = felling(10);
    const seen = new Map<string, number>();
    let sawThirsty = false;
    for (let m = 0; m < 1440 * 1.5; m++) {
      advance(state, world, 1);
      if (state.intent?.need === "thirsty") sawThirsty = true;
      const k = `${state.task?.id ?? "idle"}@${cellOf(state, world) === camp ? "camp" : "away"}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(state.dead).toBeNull();
    expect(state.stats.trees).toBeGreaterThan(3);
    expect(seen.get("sleep@camp") ?? 0).toBeGreaterThan(60);
    // The camp is a shore cell and may itself be forest, so the felling is counted wherever it happens.
    const chopMin = (seen.get("chop@away") ?? 0) + (seen.get("chop@camp") ?? 0);
    expect(chopMin).toBeGreaterThan(300);
    expect(state.intent?.task).toBe("chop");
    expect(sawThirsty).toBe(true);
    // Woodcraft trained only through the felling minutes. The trace samples after each minute, so the
    // minute a tree comes down is counted by train and not by the trace: one minute per tree of slack.
    expect(Math.abs(state.skills.woodcraft.xp - chopMin)).toBeLessThanOrEqual(state.stats.trees + 1);
  });

  it("a working day with deliver camp: logs pile up at camp, the pack clears after each delivery, and sleep still happens at camp", () => {
    // Seed 10: forest and shore both off camp; see the trace above. Ice closes the shore
    // within the first day here, so a lit fire at camp is what keeps thirst answerable
    // for the rest of this longer, heavier-laden trace.
    const { state, world, camp } = felling(10, "camp");
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    addItem(pile(state, camp), "firewood", 40);
    let clearedAfterDelivery = false;
    let sleptAtCamp = false;
    let sawThirsty = false;
    let lastCampLogs = qty(pile(state, camp), "log");
    for (let m = 0; m < 1440 * 1.5; m++) {
      advance(state, world, 1);
      if (state.intent?.need === "thirsty") sawThirsty = true;
      const campLogs = qty(pile(state, camp), "log");
      // Whenever the camp pile just grew, the load that grew it should already be off the back.
      if (campLogs > lastCampLogs && qty(state.player.pack, "log") === 0) clearedAfterDelivery = true;
      lastCampLogs = campLogs;
      if (state.task?.id === "sleep" && cellOf(state, world) === camp) sleptAtCamp = true;
    }
    expect(state.dead).toBeNull();
    expect(qty(pile(state, camp), "log")).toBeGreaterThan(8);
    expect(clearedAfterDelivery).toBe(true);
    expect(sleptAtCamp).toBe(true);
    expect(sawThirsty).toBe(true);
  });

  it("a cabin build is set aside for the night and picked up with its minutes kept", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    addItem(pile(state, camp), "log", 40);
    addItem(pile(state, camp), "stone", 12);
    addItem(pile(state, camp), "cordage", 8);
    addItem(state.player.pack, "driedMeat", 2);
    // At energy 25 the cabin's slow early-mastery pace bakes fewer than 4 banked
    // minutes into the ~37 minutes before sleep claims it; 40 gives it room to clear 10.
    state.player.energy = 40;
    startIntent(state, world, cal, rng(), { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.task?.id).toBe("build");
    expect(until(g, () => state.task?.id === "sleep", 1500)).toBe(true);
    const banked = st.build.cabin ?? 0;
    expect(banked).toBeGreaterThan(10);
    expect(until(g, () => state.task?.id === "build", 1500)).toBe(true);
    expect(state.task!.duration).toBeCloseTo(3600 - banked, 0);
  });
});

describe("the runner in the elements", () => {
  it("drinks from a vessel, else walks to the shore, else melts snow at the fire", () => {
    // Seed 10: the camp is a shore cell, so the felling is sent to the forest spot,
    // 0.9 km off the water, and both fallbacks in this test actually walk somewhere.
    const g = newGame(10);
    const { state, world } = g;
    addItem(state.player.pack, "driedMeat", 2);
    startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "forest" });
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.water = 0.8;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 });
    advance(state, world, 1);
    expect(state.player.water).toBeGreaterThan(2.5);
    expect(state.task?.id).toBe("chop");
    state.player.tools = state.player.tools.filter((t) => t.id !== "barkBucket");
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    // The nearest waterside cell to where the chop left off, not necessarily the named shore spot.
    expect(state.intent?.step).toMatch(/^walking to .+ for water$/);
    // Drink fills to WATER_FULL, but the same minute's own loss still applies after it,
    // so the reserve settles a hair under 3.0 rather than sitting exactly at it.
    expect(until(g, () => state.player.water >= 2.9)).toBe(true);
    // Iced over: melt at camp instead, when a fire burns there. Setting the ice and
    // the fire before letting the walk back to the tree finish (rather than forcing
    // thirst again straight away) means the next low reading is judged from the work
    // cell, not caught mid-return, so it is this fallback under test and not the last.
    state.weather.iceCm = 4;
    state.weather.snowCm = 5;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // An axe in hand would otherwise make the iced shore a hole to cut; stow
    // it in the pack (a task that needs it, like chop, still finds it there
    // and takes it back up) after chop is running so the fallback under
    // test at the next low reading is the melt, not the cut.
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(state.player.pack, "axe", 1);
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.intent?.step).toBe("walking to camp for water");
    expect(until(g, () => state.task?.id === "melt")).toBe(true);
  });

  it("a storm sends it home, keeps the fire fed, and it waits under the roof until the storm passes", () => {
    const { g, state, world, camp } = felling();
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 4;
    addItem(pile(state, camp), "firewood", 20);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 4 * 60, warned: false };
    advance(state, world, 1);
    expect(state.intent?.need).toBe("storm");
    expect(state.intent?.step).toBe("walking to camp before the storm");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    // Fed to 12 kg every minute it runs short, then the same minute's own burn
    // nibbles a little off again before this reads it back.
    expect(st.fire.fuelKg).toBeGreaterThanOrEqual(11.9);
    expect(state.intent?.step).toBe("waiting out the storm");
    expect(until(g, () => state.intent?.need !== "storm", 600)).toBe(true);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
  });

  it("a storm at a cold pit with a drill and dry wood lights the fire before waiting it out", () => {
    const { g, state, world, camp } = felling();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "stone", 6);
    addItem(pile(state, camp), "firewood", 20);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 4 * 60, warned: false };
    const steps: string[] = [];
    until(g, () => {
      const s = state.intent?.step ?? "";
      if (steps.at(-1) !== s) steps.push(s);
      return state.intent?.step === "waiting out the storm";
    }, 600);
    expect(steps).toEqual(expect.arrayContaining(["walking to camp before the storm", "laying a fire pit", "lighting the fire", "waiting out the storm"]));
    expect(regionState(state, world, state.player.region).fire.lit).toBe(true);
  });

  it("in winter it leaves the work so as to be at camp by sunset", () => {
    const { g, state, world, camp } = felling();
    state.minute = 320 * 1440;
    // A filled waterskin so an unreachable shore in the depths of winter never
    // masks the home need behind an unresolvable thirst; this trace is about dusk.
    state.player.tools.push({ id: "waterskin", durability: 100, litres: 3, frozen: false });
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    const c = calendar(state.minute);
    expect(c.season).toBe("winter");
    let arrivedAt = -1;
    until(g, () => {
      // Kept fresh and out of debt every minute, so it is dusk that sends this
      // body home and not the day's fatigue or the onset line.
      state.player.energy = 100;
      state.player.sleepDebt = 10;
      if (cellOf(state, world) === camp && arrivedAt < 0) arrivedAt = calendar(state.minute).hour;
      return arrivedAt >= 0;
    }, 900);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(arrivedAt).toBeLessThanOrEqual(calendar(state.minute).sunset + 0.05);
    expect(state.intent?.need).toBe("home");
  });

  it("the home need holds sticky from the minute it first fires until night, without flickering the runner back out to work", () => {
    // Starting well into the winter afternoon (not the pre-dawn dark this same
    // day still carries at minute 0) so the trace has clear daylight to run
    // through before the walk-timed boundary fires and dusk actually falls.
    const { g, state, world, camp } = felling();
    state.minute = 320 * 1440 + 240;
    state.player.tools.push({ id: "waterskin", durability: 100, litres: 3, frozen: false });
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(calendar(state.minute).season).toBe("winter");
    let homeStarted = false;
    for (let m = 0; m < 900; m++) {
      advance(state, world, 1);
      const c = calendar(state.minute);
      if (c.isNight) break;
      if (state.intent?.need === "home") {
        homeStarted = true;
        if (cellOf(state, world) === camp) expect(state.intent?.step).toBe("in before dark");
        expect(state.intent?.step).not.toBe("walking to the forest");
      } else {
        // Once the need has fired it must hold every minute until night; it never lets go early.
        expect(homeStarted).toBe(false);
      }
    }
    expect(homeStarted).toBe(true);
  });

  it("banks a big fire before walking off camp", () => {
    const g = newGame(39);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.task?.id).toBe("walk");
    expect(st.fire.fuelKg).toBeCloseTo(6, 6);
    expect(qty(pile(state, st.campCell), "firewood")).toBeCloseTo(24, 6);
  });

  it("splits a banked mixed pile's surplus back in the ratio it was held", () => {
    const g = newGame(39);
    const { state, world } = g;
    const region = state.player.region;
    const st = regionState(state, world, region);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    st.fire.wetKg = 10;
    const banked = bankFire(state, world, region);
    expect(banked).toBeCloseTo(24, 6);
    expect(st.fire.fuelKg).toBeCloseTo(4, 6);
    expect(st.fire.wetKg).toBeCloseTo(2, 6);
    expect(qty(pile(state, st.campCell), "firewood")).toBeCloseTo(16, 6);
    expect(qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(8, 6);
  });

  it("a storm with no roof still sends the runner to camp to feed the fire and wait it out", () => {
    const { g, state, world, camp } = felling();
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 4;
    addItem(pile(state, camp), "firewood", 20);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 4 * 60, warned: false };
    advance(state, world, 1);
    expect(state.intent?.need).toBe("storm");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    // Fed the same as with a roof: no-roof only changes cold's shelter check, not storm's.
    expect(st.fire.fuelKg).toBeGreaterThanOrEqual(11.9);
    expect(state.intent?.step).toBe("waiting out the storm");
  });

  it("thirst that cannot be quenched does not mask the home need", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // A winter afternoon a few minutes shy of sunset, with the shore iced over
    // and no fire at camp: nothing can be done about thirst here, so the need
    // must not hold and hide the home need that should fire instead.
    const sunset = calendar(320 * 1440).sunset;
    state.minute = 320 * 1440 - START_MINUTE_OF_DAY + Math.round((sunset - 0.1) * 60);
    state.player.water = 0.5;
    state.weather.iceCm = 3;
    // An axe in hand would otherwise make the iced shore a hole to cut,
    // which is quenchable and would beat the case this test wants.
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(state.player.pack, "axe", 1);
    advance(state, world, 1);
    expect(state.intent?.need).not.toBe("thirsty");
    expect(state.intent?.need).toBe("home");
  });

  it("times a route to camp with the same ice mode it was found under", () => {
    const g = newGame(10);
    const { state, world } = g;
    // A water cell bridges two land cells in this region; crossing it under safe
    // ice is far shorter than any route around, so that is the route found.
    const here = 1685846;
    const campCell = 1685844;
    placeAt(state, world, here);
    const st = regionState(state, world, state.player.region);
    st.campCell = campCell;
    state.weather.iceCm = 20;
    const cal2 = calendar(state.minute);
    const route = findRoute(world, here, campCell, "safe")!;
    const expected = routeMinutes(world, route, baseWalkSpeed(state, cal2, state.weather), "safe");
    expect(minutesToCamp(state, world, cal2)).toBeCloseTo(expected, 6);
  });

  it("falls through to the camp-and-melt fallback when no shore can be walked to", () => {
    // Seed 42: the forest coincides with camp, so once thirst falls through it can
    // go straight to melting rather than needing a further walk to observe. The camp
    // is a shore cell, so the water under foot is shut with ice and the axe stowed,
    // or there would be nothing to fall through from.
    const { g, state, world } = felling(42);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Overload the pack so no walk can start anywhere; melting needs none once at camp.
    addItem(state.player.pack, "stone", 40);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 4;
    state.weather.snowCm = 5;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    expect(state.intent?.step).toBe("melting snow");
  });

  it("thin ice never carries an automatic walk, through thirst, a storm, and the home need", () => {
    // Thin ice (8 cm, between ICE_THIN_CM and ICE_SAFE_CM) sits in the world
    // throughout: every plain walk the body's own needs start must resolve to
    // safe ice or none, sampled every minute across all three needs.
    const { state, world } = felling(10);
    state.weather.iceCm = 8;
    let sawThin = false;
    const sample = () => {
      if (state.route?.ice === "thin") sawThin = true;
    };
    const run = (minutes: number) => {
      for (let m = 0; m < minutes; m++) {
        advance(state, world, 1);
        sample();
      }
    };

    // Thirst: the shore is iced shut at this thickness, so this forces the melt-at-camp fallback.
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.weather.snowCm = 5;
    state.player.water = 0.5;
    run(200);
    expect(state.dead).toBeNull();

    // Storm.
    state.weather.storm = { from: state.minute + 5, until: state.minute + 5 + 4 * 60, warned: false };
    run(400);
    expect(state.dead).toBeNull();

    // Home before dark, deep winter; reserves topped off so the trace runs to night rather than to a death.
    state.minute = 320 * 1440 + 240;
    state.player.tools.push({ id: "waterskin", durability: 100, litres: 3, frozen: false });
    state.player.water = 3;
    state.player.kcal = 5000;
    state.player.health = 100;
    run(900);
    expect(sawThin).toBe(false);
  });

  it("a region with no named shore spot but real waterside cells still finds water to walk to", () => {
    // findStart requires a shore spot, so no starting region can ever lack one; this
    // stands the player in seed 2's region 94 instead, whose frac.water (2.0%) sits
    // at placeSpots' 2% floor for naming a "shore" spot (share <= 0.02 gets none),
    // though it still borders water.
    const g = newGame(2);
    const { state, world } = g;
    const r = regionAt(world, 94);
    expect(hasSpot(r, "shore")).toBe(false);
    // The camp itself is a shore cell now; stand in forest away from the water so the thirst has to walk.
    const dryForest = r.cells.find((c) => ["spruce", "pine", "birch"].includes(cellAt(world, c).terrain) && !neighbours(world, c).some((n) => cellAt(world, n).terrain === "water"))!;
    placeAt(state, world, dryForest);
    addItem(state.player.pack, "driedMeat", 2);
    startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    expect(state.intent?.step).toMatch(/^walking to .+ for water$/);
  });
});

describe("how long a sleep runs", () => {
  it("a body with a day's debt behind it sleeps the model's hours, with no dawn under them", () => {
    const { state, world } = newGame(1);
    // 13:00 on 1 April: dawn is seventeen hours off, and the old floor would
    // have held the body down for all of them.
    state.minute = 5 * 60;
    const cal = calendar(state.minute);
    state.player.energy = 0;
    state.player.sleepDebt = 64;
    const o = check(state, world, cal, "sleep");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(minutesToWake(64, cal.hour));
    expect(o.duration).toBeLessThan(minutesUntilDawn(state.minute));
    expect(o.detail).toContain("until rested");
  });

  it("a body with its debt paid lies down for the floor's hour and no more", () => {
    const { state, world } = newGame(1);
    // 22:00 on 1 April, and nothing owing: under an hour nothing is recovered,
    // so an hour is the floor even for a body already past the wake line.
    state.minute = 14 * 60;
    state.player.sleepDebt = 0;
    expect(check(state, world, calendar(state.minute), "sleep").duration).toBe(SLEEP_MIN_MINUTES);
  });

  it("an hour on a task costs seven energy; an hour of camp work four", () => {
    const { state, world } = newGame(1);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const e0 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(e0 - state.player.energy).toBeCloseTo(7, 6);
    state.task = { id: "craft", arg: "cordage", progress: 0, duration: 60, repeat: false };
    const e1 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(e1 - state.player.energy).toBeCloseTo(4, 6);
  });
});
