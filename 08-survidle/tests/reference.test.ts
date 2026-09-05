import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { coastOpen, START_DOY } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { FOODS } from "../src/sim/items";
import { ARRIVAL_DRIED_MEAT_KG, newGame, START_KCAL } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { FAT_FULL } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import {
  campFoodKcal,
  fed,
  FOOD_CLAUSE_KCAL,
  gateFor,
  KITTED_TARGET_DAY,
  OPENING_TICK_MINUTES,
  passesGate,
  REFERENCE_ORDERS,
  REFERENCE_TARGET_DAY,
  ReferencePlayer,
  runHeir,
  runLineage,
  runReference,
  setUpReference,
  stepReference,
  weekLines,
} from "../src/sim/reference";
import { emptyBurn, emptyYield, weekBefore } from "../src/sim/ledger";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes } from "../src/sim/skills";
import { APRIL, BURN, MIDSUMMER_DOY } from "../src/sim/tables";

describe("the reference player", () => {
  it("at level 1 the first tick gives every want as a once job, ranked as the list", () => {
    const { state, world, player } = setUpReference(17);
    expect(ordersHere(state, world)).toEqual([]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    list.forEach((o, i) => {
      expect(o.kind, `order ${i + 1}`).toBe("job");
      expect(o.req.until.kind, `order ${i + 1}`).toBe("once");
      expect(o.req.task, `order ${i + 1}`).toBe(REFERENCE_ORDERS[i].req.task);
    });
  });

  it("the knife, fire drill, fishing spear and bow are made once; the axe keep stays, for the spare", () => {
    for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) {
      const o = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(o.kind, id).toBe("job");
      expect(o.req.until.kind, id).toBe("once");
    }
    const axe = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "axe")!;
    expect(axe.kind).toBe("keep");
  });

  it("the basket trap is carried, not stocked: its craft want leaves it in the pack, unlike every other craft want", () => {
    const crafts = REFERENCE_ORDERS.filter((o) => o.req.task === "craft");
    for (const o of crafts) expect(o.req.deliver, o.req.arg ?? "").toBe(o.req.arg === "basketTrap" ? "leave" : "camp");
  });

  it("a competent day two: chop right after the fire is lit, the knife and the snares right after the lean-to", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const at = (s: string) => tasks.findIndex((t) => t.startsWith(s));
    expect(at("light::keep")).toBeGreaterThan(-1);
    expect(at("chop::keep")).toBe(at("light::keep") + 1);
    expect(at("build:leanTo:job:once")).toBeGreaterThan(at("chop::keep"));
    expect(at("craft:knife:job:once")).toBe(at("build:leanTo:job:once") + 1);
    expect(at("craft:snare:keep")).toBe(at("craft:knife:job:once") + 1);
    expect(at("build:snare:job:times")).toBe(at("craft:snare:keep") + 1);
  });

  it("the trap follows the spear with no empty keep, the hut group sits below the hunt keep, and the fish keep follows the cook keeps", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}`);
    const cook = tasks.lastIndexOf("cook:");
    expect(tasks[cook - 1]).toBe("cook:fish");
    expect(tasks[cook + 1]).toBe("fish:any");
    expect(tasks[cook + 2]).toBe("berries:");
    expect(tasks[cook + 3]).toBe("build:dryingRack");
    const hang = tasks.indexOf("hang:");
    expect(tasks[hang + 1]).toBe("craft:bow");
    const spear = tasks.indexOf("craft:fishingSpear");
    expect(tasks.slice(spear + 1, spear + 4)).toEqual(["read:", "craft:basketTrap", "setTrap:"]);
    expect(tasks[spear + 4]).toBe("cook:fish");
    expect(tasks).not.toContain("emptyTrap:");
    const hunt = tasks.indexOf("hunt:any");
    expect(tasks[hunt + 1]).toBe("craft:axe");
    const axe = tasks.indexOf("craft:axe");
    expect(tasks.slice(axe + 1, axe + 6)).toEqual(["sticks:", "bark:", "build:turfHut", "build:waterStore", "fill:"]);
    expect(tasks[axe + 6]).toBe("chop:");
    expect(REFERENCE_ORDERS.length).toBe(35);
  });

  // Cordage needs bark (see RECIPES), so the want that feeds it is bark.
  it("a want whose stand-in dropped off is given again while unmet, and a finished true job is not", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "bark", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "craft", until: { kind: "once" }, arg: "cordage", deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player.tick(state, world);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["bark", "craft"]);
    // The stand-ins run to completion and drop off.
    stepReference({ state, world, player }, 6 * 60);
    // The bark keep is unmet while camp has under half of 10, so it is standing again; the cordage job finished and is not.
    const tasks = ordersHere(state, world).map((o) => o.req.task);
    expect(tasks.filter((t) => t === "craft")).toEqual([]);
    const st = regionState(state, world, state.player.region);
    const have = qty(pile(state, st.campCell), "bark");
    if (have < 5) expect(tasks).toContain("bark");
    else expect(tasks).not.toContain("bark");
  });

  it("a times want counts its stand-ins' units: given exactly twice at woodcraft 1, and once as itself at woodcraft 3", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    const seen = new Set<number>();
    for (let h = 0; h < 6; h++) {
      player.tick(state, world);
      for (const o of ordersHere(state, world)) if (o.req.task === "sticks") seen.add(o.id);
      advance(state, world, 60);
    }
    // Two once-job stand-ins, never a third: their units add up to the want's n:2.
    expect(seen.size).toBe(2);
    expect(ordersHere(state, world).some((o) => o.req.task === "sticks")).toBe(false);

    const at3 = newGame(17);
    at3.state.skills.woodcraft.xp = levelMinutes(3);
    const player3 = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player3.tick(at3.state, at3.world);
    const first = ordersHere(at3.state, at3.world);
    expect(first.length).toBe(1);
    expect(first[0].kind).toBe("job");
    expect(first[0].req.until).toEqual({ kind: "times", n: 2 });
    for (let h = 0; h < 6; h++) {
      player3.tick(at3.state, at3.world);
      advance(at3.state, at3.world, 60);
    }
    expect(ordersHere(at3.state, at3.world).length).toBe(0);
  });

  it("a times want that reaches its rung mid-count keeps only its remainder, not a fresh n", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 3 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    const seen = new Set<number>();
    for (let h = 0; h < 2; h++) {
      player.tick(state, world);
      for (const o of ordersHere(state, world)) if (o.req.task === "sticks") seen.add(o.id);
      advance(state, world, 60);
    }
    // Two once-job stand-ins complete before the skill reaches the rung.
    expect(seen.size).toBe(2);

    state.skills.woodcraft.xp = levelMinutes(3);
    player.tick(state, world);
    const standing = ordersHere(state, world).find((o) => o.req.task === "sticks")!;
    expect(standing.kind).toBe("job");
    expect(standing.req.until).toEqual({ kind: "times", n: 1 });
  });

  it("the stand-in follows the level: a keep given at woodcraft 10 is a keep, ranked where the want sits", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(10);
    const player = new ReferencePlayer([
      { req: { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, kind: "keep" },
    ]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.map((o) => [o.req.task, o.kind])).toEqual([["fill", "job"], ["split", "keep"]]);
    expect(list[0].req.until.kind).toBe("once");
  });

  it("the fill keep, given at the shore with a bucket in hand, stocks the camp within six hours", () => {
    const ref = setUpReference(17, true);
    placeAtSpot(ref.state, ref.world, ref.state.player.region, "shore");
    ref.player.tick(ref.state, ref.world);
    stepReference(ref, 6 * 60);
    expect(ref.state.dead).toBeNull();
    const camp = pile(ref.state, regionState(ref.state, ref.world, ref.state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
    expect(OPENING_TICK_MINUTES).toBe(60);
  });

  it("the April target is the day a beginner eating the least and burning the most runs out of fat", () => {
    const reserve = FAT_FULL + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg;
    const deficit = BURN.day.hi - APRIL.rows.total!.beginner.lo;
    expect(REFERENCE_TARGET_DAY).toBe(Math.floor(reserve / deficit));
    expect(REFERENCE_TARGET_DAY).toBe(26);
    expect(KITTED_TARGET_DAY).toBe(30);
  });

  it("the gate passes a seed alive on the target day and fails one that dies on it or before", () => {
    expect(passesGate(null, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(REFERENCE_TARGET_DAY + 1, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(REFERENCE_TARGET_DAY, REFERENCE_TARGET_DAY)).toBe(false);
    expect(passesGate(REFERENCE_TARGET_DAY - 1, REFERENCE_TARGET_DAY)).toBe(false);
  });

  it("the food clause reads the week before the checkpoint: a beginner's day of food eaten on average, whatever the stomach and the larder hold at the instant", () => {
    const week = (eaten: number, days = 7) => ({ ...weekBefore([], 1), days, eaten });
    expect(fed(week(FOOD_CLAUSE_KCAL))).toBe(true);
    expect(fed(week(FOOD_CLAUSE_KCAL - 1))).toBe(false);
    expect(fed(week(FOOD_CLAUSE_KCAL, 0))).toBe(false);
    // Seed 19's shape at day 26: stomach 0, camp 0, eating 2,971 a day - fed.
    const { state, world } = newGame(19);
    state.player.kcal = 0;
    state.minute = 25 * 1440;
    for (let day = 19; day <= 25; day++) state.ledger.push({ day, yield: emptyYield(), eaten: 2971, burn: emptyBurn(), sleepMin: 0, workMin: 0 });
    expect(campFoodKcal(state, world)).toBe(0);
    expect(fed(weekBefore(state.ledger, 26))).toBe(true);
    // A body on the fat alone with nothing eaten all week is not, whatever the stomach reads.
    for (const d of state.ledger) d.eaten = 0;
    state.player.kcal = 3000;
    expect(fed(weekBefore(state.ledger, 26))).toBe(false);
  });

  it("campFoodKcal counts every food lying at camp", () => {
    const { state, world } = newGame(17);
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    expect(campFoodKcal(state, world)).toBe(0);
    addItem(camp, "cookedFish", 0.5);
    addItem(camp, "fish", 3);
    expect(campFoodKcal(state, world)).toBe(500);
  });

  it("the gate for a start is the target day in spring and the first snow from July on", () => {
    expect(gateFor(START_DOY, false)).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(gateFor(START_DOY, true)).toEqual({ kind: "day", day: KITTED_TARGET_DAY });
    expect(gateFor(MIDSUMMER_DOY - 1, false)).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(gateFor(MIDSUMMER_DOY, false)).toEqual({ kind: "firstSnow" });
    expect(gateFor(235, true)).toEqual({ kind: "firstSnow" });
  });

  it("a run short of its gate day fails, with a checkpoint and its week on the last day either way", () => {
    const r = runReference(17, 2);
    expect(r.gate).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(r.passed).toBe(false);
    expect(r.checkpoints.length).toBe(1);
    expect(r.checkpoints[0].day).toBe(r.outcome.day);
    if (r.outcome.kind === "reached") {
      // Two days stepped: the day is 3, and the week before it holds the records for days 1 and 2.
      expect(r.outcome.day).toBe(3);
      expect(r.checkpoints[0].week.days).toBe(2);
      expect(r.checkpoints[0].week.burn.base).toBeGreaterThan(0);
    }
  });

  it("the day-26 checkpoint's fed reads the week it prints, a full week by then", () => {
    const r = runReference(17, 27);
    const c = r.checkpoints.find((cp) => cp.day === REFERENCE_TARGET_DAY);
    expect(c).toBeDefined();
    expect(c!.week.days).toBe(7);
    expect(c!.fed).toBe(fed(c!.week));
  });

  it("a start that opens with snow on the ground has no first snow to report", () => {
    // Mid-November: the seasonal mean there is below zero, so newGame lays snow on day 1.
    const r = runReference(17, 1, { startDoy: 320 });
    expect(r.gate).toEqual({ kind: "firstSnow" });
    expect(r.firstSnowDay).toBeNull();
  });

  it("weekLines reads a week against the table for its date", () => {
    const week = { days: 7, yield: { fish: 310, trap: 0, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 290, burn: { base: 1680, activity: 620, walk: 640, cold: 200, sick: 0 }, sleepMin: 504, workMin: 672 };
    const lines = weekLines(week, 115);
    expect(lines[0]).toContain("fish 310 (in band)");
    expect(lines[0]).toContain("kit 0");
    expect(lines[0]).toContain("vs April");
    expect(lines[1]).toContain("eaten/day 290");
    expect(lines[1]).toContain("net +20");
    expect(lines[2]).toContain("burn/day 3140 (in band)");
    expect(lines[2]).toContain("work 1260 (in band");
    expect(lines[2]).toContain("cold 200 (in band)");
    expect(lines[3]).toContain("sleep/day 8.4 h (in band)");
    expect(lines[3]).toContain("work/day 11.2 h");
    const none = weekLines({ ...week, days: 0 }, 115);
    expect(none[0]).toContain("no full day yet");
  });

  it("a death landing exactly on a checkpoint day does not double the checkpoint", () => {
    // Seed 153 dies on the gate day, the REFERENCE_TARGET_DAY checkpoint, so the run has a death and a checkpoint on the same day.
    const r = runReference(153, 30);
    expect(r.outcome).toEqual({ kind: "died", day: REFERENCE_TARGET_DAY, cause: "starved" });
    const days = r.checkpoints.map((c) => c.day);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("the heir", () => {
  it("runs two lives on seed 17 and lands the heir in the open season near the old camp", () => {
    const r = runHeir(17, 70);
    expect(r.first.outcome.kind).toBe("died");
    expect(r.gapDays).toBeGreaterThanOrEqual(90);
    expect(coastOpen(r.landed.doy)).toBe(true);
    expect(r.found.kmToOldCamp).toBeGreaterThanOrEqual(3);
    expect(r.found.kmToOldCamp).toBeLessThanOrEqual(20);
    expect(r.heir.record.index).toBe(2);
    expect(r.heir.checkpoints.length).toBeGreaterThan(0);
  }, 30000);

  it("walks to the old camp before it gives an order, and reaches it inside three days", () => {
    const r = runHeir(17, 60);
    expect(r.found.reachedCampDay).not.toBeNull();
    expect(r.found.reachedCampDay!).toBeLessThanOrEqual(3);
  }, 30000);

  it("reports the trap's kilos and the new structures in the found line", () => {
    const r = runHeir(17, 60);
    expect(r.found).toHaveProperty("trapKg");
    expect(r.found.trapKg === null || r.found.trapKg >= 0).toBe(true);
  }, 30000);

  it("a first life still alive at the day cap has no heir to raise, and stands in for both", () => {
    const r = runHeir(17, 1);
    expect(r.first.outcome.kind).toBe("reached");
    expect(r.gapDays).toBe(0);
    expect(r.heir).toEqual(r.first);
  });
});

describe("the lineage", () => {
  it("runs three lives on seed 17, each landing after a gap and reporting what it found", () => {
    const r = runLineage(17, 250, 3);
    expect(r.seed).toBe(17);
    expect(r.lives.length).toBe(3);
    expect(r.lives[0].index).toBe(1);
    expect(r.lives[0].gapDays).toBe(0);
    expect(r.lives[0].found).toBeNull();
    for (const life of r.lives.slice(1)) {
      expect(life.gapDays).toBeGreaterThanOrEqual(90);
      expect(coastOpen(life.landed.doy)).toBe(true);
      expect(life.found).not.toBeNull();
      expect(life.found!.structures).toContain("firePit");
      expect(typeof life.found!.logs).toBe("number");
    }
    for (const life of r.lives) {
      expect(life.report.surplus.hang === null || life.report.surplus.hang >= 1).toBe(true);
    }
  });

  it("stops early when a life reaches the day cap alive", () => {
    const r = runLineage(17, 5, 3);
    expect(r.lives.length).toBe(1);
    expect(r.lives[0].report.outcome.kind).toBe("reached");
  });
});
