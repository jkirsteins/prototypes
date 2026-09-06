import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { currentNeed, iceHoleSite, snaresWaiting, WORK_HOURS_DEFAULT } from "../src/sim/body";
import { calendar, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { body } from "../src/sim/person";
import { addOrder } from "../src/sim/orders";
import { taskDrain } from "../src/sim/player";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { alertness, RESTED_AT, sleepiness, SLEEP_ONSET, SPENT_AT, WAKE_AT } from "../src/sim/sleep";
import { beginTask, setAside, startTask } from "../src/sim/tasks";
import type { GameState } from "../src/sim/types";
import { drink, ICE_SHORE_CM, iceHoleOpen, THIRSTY_L, WATER_FULL } from "../src/sim/water";
import { stormComing, stormNow } from "../src/sim/weather";
import { regionAt, spotOf } from "../src/world/gen";

/** A kitted camp on seed 17 with one endless felling grind, the survivor fresh at 08:00. */
function felling() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  g.state.player.energy = 100;
  addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  // One minute is enough for the order to become a live intent to read needs against.
  advance(g.state, g.world, 1);
  return g;
}

/** The debt that puts this hour's sleepiness on a wanted line. */
function debtFor(target: number, hour: number): number {
  return target + alertness(hour);
}

/** The first minute from here that is night with no storm about, so only the clause under test can hold. */
function calmNight(state: GameState): number {
  let m = state.minute;
  for (let i = 0; i < 4000; i++) {
    if (calendar(m).isNight && !stormNow(state.weather, m) && !stormComing(state.weather, m)) return m;
    m += 15;
  }
  throw new Error("no calm night within the search");
}

describe("the working day", () => {
  it("is ten hours by default, and it is the fatigue drain's divisor rather than a count", () => {
    const { state } = newGame(1);
    expect(WORK_HOURS_DEFAULT).toBe(10);
    // The person is the only source of the number: the drain and the night
    // chore budget both read it there, and nothing keeps a copy.
    expect(body(state).workHours).toBe(10);
    // The day is over when the drain says so: ten hours of task work from full
    // land exactly on the spent line, and nothing anywhere adds hours up.
    expect(100 - body(state).workHours * taskDrain(body(state).workHours)).toBeCloseTo(SPENT_AT, 6);
  });

  it("a save from before the two processes derives its debt from its fatigue and drops the old markers", () => {
    const { state } = newGame(1);
    const raw = JSON.parse(serialize(state));
    raw.state.player.energy = 70;
    delete raw.state.player.sleepDebt;
    delete raw.state.player.sleeping;
    raw.state.player.restUntil = 12345;
    raw.state.player.sleptTonight = true;
    raw.state.player.workHours = 9;
    const p = deserialize(JSON.stringify(raw))!.state.player as unknown as Record<string, unknown>;
    expect(p.sleepDebt).toBe(30);
    expect(p.sleeping).toBeNull();
    expect(p.restUntil).toBeUndefined();
    expect(p.sleptTonight).toBeUndefined();
    expect(p.workHours).toBeUndefined();
  });

  it("a night under way survives a save and load, so a run reloaded mid-sleep goes back to bed", () => {
    const { state, world } = felling();
    const cal = calendar(state.minute, state.startDoy);
    state.player.sleepDebt = debtFor(SLEEP_ONSET + 1, cal.hour);
    state.player.water = WATER_FULL;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("sleep");
    expect(state.player.sleeping).toEqual({ collapsed: false });
    const back = deserialize(serialize(state))!.state;
    expect(back.player.sleeping).toEqual({ collapsed: false });
  });

  it("a runner on a felling grind works itself to the spent line and takes its evening by the fire", () => {
    const { state, world } = felling();
    let sawSpent = false;
    let sawRest = false;
    for (let h = 0; h < 16; h++) {
      advance(state, world, 60);
      if (state.intent?.need === "spent") {
        sawSpent = true;
        if (state.task?.id === "rest") sawRest = true;
      }
    }
    expect(sawSpent).toBe(true);
    expect(sawRest).toBe(true);
    // A day of task minutes near the working day, arrived at by the drain and
    // not by a count: the ledger reads it, nothing enforces it.
    const day1 = state.ledger.find((d) => d.day === 1)!;
    expect(day1.workMin / 60).toBeGreaterThan(8);
    expect(day1.workMin / 60).toBeLessThan(13);
  });

  it("the evening's rest ends when the body is rested, in the dark, with no dawn waited for", () => {
    const { state, world } = felling();
    let sawRest = false;
    let releasedAt: number | null = null;
    for (let m = 0; m < 20 * 60 && releasedAt === null; m++) {
      advance(state, world, 1);
      if (state.intent?.need === "spent" && state.task?.id === "rest") sawRest = true;
      else if (sawRest && state.player.energy >= RESTED_AT) releasedAt = state.minute;
    }
    expect(sawRest).toBe(true);
    expect(releasedAt).not.toBeNull();
    expect(calendar(releasedAt!, state.startDoy).isNight).toBe(true);
  });

  it("the night falls out of the model: to bed on the onset line, up on the wake line, seven to nine hours between", () => {
    const { state, world } = felling();
    let bed: number | null = null;
    let up: number | null = null;
    let bedSleepy = 0;
    for (let m = 0; m < 30 * 60 && up === null; m++) {
      advance(state, world, 1);
      if (state.task?.id === "sleep") {
        if (bed === null) {
          bed = state.minute;
          bedSleepy = sleepiness(state.player.sleepDebt, calendar(state.minute, state.startDoy).hour);
        }
      } else if (bed !== null) up = state.minute;
    }
    expect(bed).not.toBeNull();
    expect(up).not.toBeNull();
    const hours = (up! - bed!) / 60;
    expect(hours).toBeGreaterThan(7);
    expect(hours).toBeLessThan(9);
    // It lay down because it was sleepy, and not because the sun went down:
    // sunset was more than an hour earlier.
    expect(bedSleepy).toBeGreaterThanOrEqual(SLEEP_ONSET);
    const down = calendar(bed!, state.startDoy);
    expect(down.hour).toBeGreaterThan(down.sunset + 1);
  });

  it("a chop started by hand has no intent, so no body need takes it off the tree", () => {
    const { state, world } = newGame(17);
    kitOut(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.energy = 100;
    const cal = calendar(state.minute);
    expect(startTask(state, world, cal, "chop", undefined, true)).toBe(true);
    expect(state.intent).toBeNull();
    advance(state, world, 30);
    expect(state.task?.id).toBe("chop");
    expect(START_MINUTE_OF_DAY).toBe(480);
  });

  it("a spent body drinks its fill before it sits down for the evening", () => {
    const { state, world } = felling();
    const it = state.intent!;
    state.player.energy = SPENT_AT - 1;
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.water = 1.5;
    expect(state.player.water).toBeLessThan(WATER_FULL - 0.5);
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("thirsty");
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(WATER_FULL);
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("spent");
  });

  it("a sleepy body gets up to drink first, and lies down once it is full", () => {
    const { state, world } = felling();
    const it = state.intent!;
    placeAtSpot(state, world, state.player.region, "shore");
    state.minute = calmNight(state);
    const cal = calendar(state.minute);
    // Rested but a day's debt behind it: the onset line, not the collapse.
    state.player.energy = 100;
    state.player.sleepDebt = debtFor(SLEEP_ONSET + 2, cal.hour);
    state.player.water = THIRSTY_L / 2;
    expect(currentNeed(state, world, cal, it)).toBe("thirsty");
    state.player.water = WATER_FULL;
    expect(currentNeed(state, world, cal, it)).toBe("sleep");
  });

  it("a sleep in progress lets go at the wake line, and the same reading holds by day and by night", () => {
    const { state, world } = felling();
    const it = state.intent!;
    state.player.energy = 100;
    state.player.water = WATER_FULL;
    for (const minute of [25 * 60, 14 * 60]) {
      // 09:00 on day 2, then 22:00 on day 1: the clock is asked nothing.
      state.minute = minute;
      const cal = calendar(state.minute);
      it.need = "sleep";
      state.player.sleepDebt = debtFor(SLEEP_ONSET, cal.hour);
      expect(currentNeed(state, world, cal, it)).toBe("sleep");
      it.need = "sleep";
      state.player.sleepDebt = debtFor(0, cal.hour);
      expect(currentNeed(state, world, cal, it)).not.toBe("sleep");
      expect(sleepiness(state.player.sleepDebt, cal.hour)).toBeCloseTo(0, 6);
    }
  });

  it("a sleep set aside is a night interrupted, not a night over: the body goes back to bed", () => {
    const { state, world } = felling();
    const it = state.intent!;
    const cal = calendar(state.minute);
    state.player.energy = 100;
    state.player.water = WATER_FULL;
    state.player.sleepDebt = debtFor(SLEEP_ONSET + 1, cal.hour);
    expect(currentNeed(state, world, cal, it)).toBe("sleep");
    expect(beginTask(state, world, cal, "sleep")).toBe(true);
    // Whatever takes the body off the bed - a fire to feed, an order changing
    // under it - the night is the player's and only the model ends it.
    setAside(state, world);
    expect(state.task).toBeNull();
    expect(state.player.sleeping).toEqual({ collapsed: false });
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("sleep");
    // Past the wake line, and only then, it is up.
    state.player.sleepDebt = debtFor(WAKE_AT - 1, cal.hour);
    expect(currentNeed(state, world, cal, it)).not.toBe("sleep");
    expect(state.player.sleeping).toBeNull();
  });

  it("a sleep broken to feed the fire is resumed, and an order switching under the sleeper does not end the night", () => {
    const { state, world } = felling();
    const st = regionState(state, world, state.player.region);
    st.fire.lit = false;
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 5);
    placeAt(state, world, st.campCell);
    state.player.energy = 100;
    state.player.water = WATER_FULL;
    state.player.sleepDebt = debtFor(SLEEP_ONSET + 5, calendar(state.minute, state.startDoy).hour);
    // The fire step comes first at camp, so the sleep waits on it.
    advance(state, world, 1);
    expect(state.intent?.need).toBe("sleep");
    expect(["light", "lightIndoors"]).toContain(state.task?.id);
    expect(state.player.sleeping).toEqual({ collapsed: false });
    // The order the runner was serving is dropped mid-night; the night stands.
    state.intent = null;
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    let sleeping = false;
    for (let m = 0; m < 120 && !sleeping; m++) {
      advance(state, world, 1);
      sleeping = state.task?.id === "sleep";
    }
    expect(sleeping).toBe(true);
  });
});

describe("checking the snares", () => {
  it("a catch waiting and the heath in reach is a chore by day, and it ends on arrival", () => {
    const { state, world } = felling();
    const st = regionState(state, world, state.player.region);
    const heath = spotOf(regionAt(world, state.player.region), "heath")!.cell;
    expect(snaresWaiting(state, world, calendar(state.minute))).toBeNull();
    st.snareCatch = { count: 2, age: 0 };
    expect(snaresWaiting(state, world, calendar(state.minute))).toBe(heath);
    advance(state, world, 1);
    expect(state.intent?.need).toBe("snares");
    expect(state.intent?.step).toContain("check the snares");
    // Walk there: the catch comes with you and the chore is over.
    for (let m = 0; m < 600 && st.snareCatch.count > 0; m += 15) advance(state, world, 15);
    expect(st.snareCatch.count).toBe(0);
    expect(state.intent?.need ?? null).not.toBe("snares");
    expect(state.log.some((e) => /hares? in the snares/.test(e.text))).toBe(true);
  });

  it("the chore waits for daylight and yields to thirst", () => {
    const { state, world } = felling();
    const st = regionState(state, world, state.player.region);
    st.snareCatch = { count: 1, age: 0 };
    state.minute = 14 * 60; // 22:00
    const night = calendar(state.minute);
    expect(night.isNight).toBe(true);
    expect(snaresWaiting(state, world, night)).toBeNull();
    state.minute = 0;
    state.player.water = 0.5;
    state.player.energy = 100;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
  });
});

describe("cutting the ice hole", () => {
  it("an iced shore, no hole and an axe in hand is a source: the runner walks there, cuts, and drinks", () => {
    const { state, world } = felling();
    state.weather.iceCm = ICE_SHORE_CM + 1;
    state.player.water = 0.5;
    state.player.energy = 100;
    for (const t of state.player.tools) if (t.id === "barkBucket") t.litres = 0;
    const cal = calendar(state.minute);
    const site = iceHoleSite(state, world, cal);
    expect(site).not.toBeNull();
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    expect(state.intent?.step).toContain("ice hole");
    // The nearest waterside cell is recomputed from the runner's own moving
    // position every tick, same as shoreForWater's candidate list, so the
    // cell it settles on cutting can differ from the one first read at a
    // standstill; a hole open anywhere in the region is the actual claim.
    const st = regionState(state, world, state.player.region);
    for (let m = 0; m < 480 && !st.iceHole; m += 15) advance(state, world, 15);
    expect(st.iceHole).not.toBeNull();
    expect(iceHoleOpen(state, st.iceHole!.cell)).toBe(true);
    for (let m = 0; m < 120 && state.player.water < 1; m += 15) advance(state, world, 15);
    expect(state.player.water).toBeGreaterThan(1);
  });

  it("without an axe the iced shore is no source", () => {
    const { state, world } = felling();
    state.weather.iceCm = ICE_SHORE_CM + 1;
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    expect(iceHoleSite(state, world, calendar(state.minute))).toBeNull();
  });
});
