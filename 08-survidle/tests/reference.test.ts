import { beforeAll, describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar, coastOpen, START_DOY } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, hasTool, pile, qty } from "../src/sim/inventory";
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
  wantOpen,
  weekLines,
  winterStockWant,
  WINTER_STOCK,
  WINTER_WOOD_FROM_DOY,
  WINTER_WOOD_TO_DOY,
} from "../src/sim/reference";
import { emptyBurn, emptyYield, weekBefore } from "../src/sim/ledger";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes, SKILL_IDS } from "../src/sim/skills";
import { SPECIES_DEFS } from "../src/sim/species";
import { APRIL, BURN, MIDSUMMER_DOY } from "../src/sim/tables";
import { ICE_SHORE_CM } from "../src/sim/water";

describe("the reference player", () => {
  it("at level 1 the first tick gives every open want as a once job, ranked as the list", () => {
    const { state, world, player } = setUpReference(17);
    expect(ordersHere(state, world)).toEqual([]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    // The three named hunts (elk, reindeer, deer) gate on the species' recommended level,
    // so a level-1 survivor's first tick never sees them; the woodpile keep and the
    // log keep gate by season and a 1 April start is closed for both; the two ice-hole
    // fetches and the two melts wait for the shore to ice over, and the fire indoors for a hut;
    // and the hide coat, trousers and boots wait for Crafting 8; every other want is open.
    const cal = calendar(state.minute, state.startDoy);
    const open = REFERENCE_ORDERS.filter((w) => wantOpen(state, world, w, cal));
    expect(list.length).toBe(REFERENCE_ORDERS.length - 19);
    expect(open.length).toBe(REFERENCE_ORDERS.length - 19);
    list.forEach((o, i) => {
      expect(o.kind, `order ${i + 1}`).toBe("job");
      expect(o.req.until.kind, `order ${i + 1}`).toBe("once");
      expect(o.req.task, `order ${i + 1}`).toBe(open[i].req.task);
    });
  });

  it("the knife, fire drill, fishing spear and bow are keeps of one spare, the celt and the flaked axe too; the basket trap stays a once job, since it is set and not held", () => {
    for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) {
      const o = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(o.kind, id).toBe("keep");
      expect(o.req.until, id).toEqual({ kind: "campHas", qty: 1 });
    }
    for (const id of ["stoneAxe", "flakedAxe"] as const) {
      const axe = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(axe.kind, id).toBe("keep");
    }
    const whet = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "whetstone")!;
    expect(whet.kind).toBe("job");
    expect(REFERENCE_ORDERS.find((o) => o.req.task === "hone")!.kind).toBe("grind");
    const trap = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "basketTrap")!;
    expect(trap.kind).toBe("job");
    expect(trap.req.until.kind).toBe("once");
  });

  it("the basket trap is carried, not stocked: its craft want leaves it in the pack, unlike every other craft want", () => {
    const crafts = REFERENCE_ORDERS.filter((o) => o.req.task === "craft");
    for (const o of crafts) expect(o.req.deliver, o.req.arg ?? "").toBe(o.req.arg === "basketTrap" ? "leave" : "camp");
  });

  it("a competent day two: chop right after the fire is lit, the knife and the snares right after the lean-to", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const at = (s: string) => tasks.findIndex((t) => t.startsWith(s));
    expect(at("light::keep")).toBeGreaterThan(-1);
    // The fire indoors keep sits right under the pit keep, the two methods of one want.
    expect(at("lightIndoors::keep")).toBe(at("light::keep") + 1);
    expect(at("chop::keep")).toBe(at("light::keep") + 2);
    expect(at("build:leanTo:job:once")).toBeGreaterThan(at("chop::keep"));
    // The bough bed keep sits right after the lean-to (build:boughBed:keep), and the snow shelter
    // job right after that, pushing the knife two further down.
    expect(at("craft:knife:keep:campHas")).toBe(at("build:leanTo:job:once") + 3);
    expect(at("craft:snare:keep")).toBe(at("craft:knife:keep:campHas") + 1);
    expect(at("build:snare:job:times")).toBe(at("craft:snare:keep") + 1);
  });

  it("the trap follows the spear with no empty keep, the hut group sits below the hunt keep, and the fish keep follows the cook keeps", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}`);
    const cook = tasks.lastIndexOf("cook:");
    expect(tasks[cook - 1]).toBe("cook:fish");
    expect(tasks[cook + 1]).toBe("fish:any");
    expect(tasks[cook + 2]).toBe("berries:");
    // The twenty-snare keep sits right after the berries, pushing the rack and the bow one further down.
    expect(tasks[cook + 3]).toBe("build:snare");
    expect(tasks[cook + 4]).toBe("build:dryingRack");
    expect(tasks[cook + 5]).toBe("craft:bow");
    const spear = tasks.indexOf("craft:fishingSpear");
    expect(tasks.slice(spear + 1, spear + 4)).toEqual(["read:", "craft:basketTrap", "setTrap:"]);
    expect(tasks[spear + 4]).toBe("cook:fish");
    expect(tasks).not.toContain("emptyTrap:");
    const hunt = tasks.indexOf("hunt:any");
    // The clothing block, then the stone restock, then the edge's whole life with the spare axe: a whetstone in the opening cost the knife its stone and the snares an hour.
    expect(tasks.slice(hunt + 1, hunt + 8)).toEqual(["craft:needle", "repair:", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens"]);
    expect(tasks.slice(hunt + 8, hunt + 14)).toEqual(["stone:", "craft:whetstone", "hone:", "craft:wedges", "craft:stoneAxe", "craft:flakedAxe"]);
    const axe = tasks.indexOf("craft:flakedAxe");
    // The forty-snare keep sits right after the water trough, pushing the fill, melt, winter-stock and hang block one further down.
    expect(tasks.slice(axe + 1, axe + 9)).toEqual(["sticks:", "bark:", "build:turfHut", "build:waterStore", "build:snare", "fill:shore", "fill:hole", "melt:"]);
    // The winter-stock keeps head the surplus loop, the three firewood methods then the logs: a grind
    // above a keep starves it, and the hang grind starved the woodpile on a camp taking elk all autumn.
    expect(tasks.slice(axe + 9, axe + 13)).toEqual(["split:", "splitWedges:", "deadwood:", "chop:"]);
    expect(tasks[axe + 13]).toBe("hang:");
    expect(tasks.slice(axe + 14, axe + 17)).toEqual(["hunt:elk", "hunt:reindeer", "hunt:deer"]);
    expect(REFERENCE_ORDERS[REFERENCE_ORDERS.length - 1].kind).toBe("grind");
    // 65: the bough bed keep after the lean-to, the snow shelter job after the bough bed, the
    // twenty-snare keep after the berries, the forty-snare keep after the water trough, the
    // thaw grind at the head of the water block.
    expect(REFERENCE_ORDERS.length).toBe(65);
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
    expect(REFERENCE_TARGET_DAY).toBe(20);
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

  it("the gate day's checkpoint fed reads the week it prints, a full week by then", () => {
    // Seed 79, not 17: the bough bed keep right after the lean-to (reference.ts) moves seed 17's
    // death to day 19, a day short of REFERENCE_TARGET_DAY, so it never reaches this checkpoint.
    const r = runReference(79, 27);
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

  it("a capped run does not double the checkpoint", () => {
    // calendar()'s day is dayIndex + 1, so a run of REFERENCE_TARGET_DAY - 1 full days
    // (day 1 is the start) reads back as day REFERENCE_TARGET_DAY once it stops. Seed 79
    // is alive there (it passes the April gate; seed 17 no longer does, since the bough
    // bed keep right after the lean-to moves its death to day 19), so the day cap and the
    // REFERENCE_TARGET_DAY checkpoint land on the same day, without hunting for a seed that
    // dies there instead - this does not cover the death-landing-on-a-checkpoint variant of
    // the same branch.
    const r = runReference(79, REFERENCE_TARGET_DAY - 1);
    expect(r.outcome).toEqual({ kind: "reached", day: REFERENCE_TARGET_DAY });
    const days = r.checkpoints.map((c) => c.day);
    expect(new Set(days).size).toBe(days.length);
    expect(days[days.length - 1]).toBe(REFERENCE_TARGET_DAY);
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

  // Two lives of ninety days is seconds of simulation, so the two readings
  // taken off the same run share it rather than raising the heir twice. Ninety,
  // because the first life on seed 17 starves on day 61 with the camp on the shore.
  let sixty: ReturnType<typeof runHeir>;
  beforeAll(() => {
    sixty = runHeir(17, 90);
  }, 30000);

  it("walks to the old camp before it gives an order, and reaches it inside three days", () => {
    expect(sixty.found.reachedCampDay).not.toBeNull();
    expect(sixty.found.reachedCampDay!).toBeLessThanOrEqual(3);
  });

  it("reports the trap's kilos and the new structures in the found line", () => {
    expect(sixty.found).toHaveProperty("trapKg");
    expect(sixty.found.trapKg === null || sixty.found.trapKg >= 0).toBe(true);
  });

  it("a first life still alive at the day cap has no heir to raise, and stands in for both", () => {
    const r = runHeir(17, 1);
    expect(r.first.outcome.kind).toBe("reached");
    expect(r.gapDays).toBe(0);
    expect(r.heir).toEqual(r.first);
  });
});

// The three-life run over a quarter of a year lives in tests/slow/lineage.test.ts
// (`npm run test:slow`); what stays here is the shape of a lineage, cheaply.
describe("the lineage", () => {
  it("raises an heir after the first life dies, landing it in the open coast with the old camp to find", () => {
    const r = runLineage(17, 90, 2);
    expect(r.lives.length).toBe(2);
    expect(r.lives[1].found).not.toBeNull();
    expect(coastOpen(r.lives[1].landed.doy)).toBe(true);
  }, 30000);

  it("stops early when a life reaches the day cap alive", () => {
    const r = runLineage(17, 5, 3);
    expect(r.lives.length).toBe(1);
    expect(r.lives[0].report.outcome.kind).toBe("reached");
  });
});

describe("wants by level", () => {
  it("opens the large-game hunts at the species' recommended hunting level and not below", () => {
    const { state, world } = newGame(17);
    const cal = calendar(0);
    const elk = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "elk")!;
    const any = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "any")!;
    expect(wantOpen(state, world, elk, cal)).toBe(false);
    expect(wantOpen(state, world, any, cal)).toBe(true);
    setSkillLevel(state, "hunting", SPECIES_DEFS.elk.hunt!.level!);
    expect(wantOpen(state, world, elk, cal)).toBe(true);
  });

  it("the list hangs as a grind, keeps eight cordage, pins the winter woodpile at the stock, and hunts elk, reindeer and roe deer by name", () => {
    const hang = REFERENCE_ORDERS.find((w) => w.req.task === "hang")!;
    expect(hang.kind).toBe("grind");
    expect(hang.req.until.kind).toBe("forever");
    const cordage = REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === "cordage")!;
    expect(cordage.req.until).toEqual({ kind: "campHas", qty: 8 });
    // The woodpile keep is the winter stock's own target, sized from the
    // measured hut winter rather than pinned at a literal here.
    const woodpile = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg)!;
    expect(woodpile.req.until).toEqual({ kind: "campHas", qty: WINTER_STOCK.firewoodKg });
    const named = REFERENCE_ORDERS.filter((w) => w.req.task === "hunt" && w.req.arg !== "any").map((w) => w.req.arg);
    expect(named).toEqual(["elk", "reindeer", "deer"]);
  });

  it("hunts the named species as grinds, never keeps: a keep on raw meat can never read met while the rack is above it in the list", () => {
    const named = REFERENCE_ORDERS.filter((w) => w.req.task === "hunt" && w.req.arg !== "any");
    for (const w of named) {
      expect(w.kind, w.req.arg).toBe("grind");
      expect(w.req.until.kind, w.req.arg).toBe("forever");
    }
  });

  it("withdraws the woodpile when the thaw closes it, and gives it again the next September", () => {
    // Keeps are earned at woodcraft 10, so the woodpile stands as itself and
    // is told from the list's 60 kg keep by its target.
    const { state, world } = newGame(17, WINTER_WOOD_FROM_DOY);
    setSkillLevel(state, "woodcraft", 10);
    const player = new ReferencePlayer();
    const woodpile = () => ordersHere(state, world).filter((o) => o.req.task === "split" && o.req.until.kind === "campHas" && o.req.until.qty === WINTER_STOCK.firewoodKg);
    player.tick(state, world);
    expect(woodpile().length).toBe(1);
    // Forward to the thaw: the days left in the year from the opening day, then April's first day.
    state.minute = (365 - WINTER_WOOD_FROM_DOY + WINTER_WOOD_TO_DOY) * 1440;
    expect(calendar(state.minute, state.startDoy).dayOfYear).toBe(WINTER_WOOD_TO_DOY);
    player.tick(state, world);
    expect(woodpile()).toEqual([]);
    // A full year from the start: the opening day again, and the want reopens.
    state.minute = 365 * 1440;
    expect(calendar(state.minute, state.startDoy).dayOfYear).toBe(WINTER_WOOD_FROM_DOY);
    player.tick(state, world);
    expect(woodpile().length).toBe(1);
  });

  // The window opens at midsummer, not 1 September: against the measured 6.6-tonne
  // stock a camp that starts cutting on the first frost never catches up.
  it("opens the winter firewood keep from midsummer and not in spring, staying open through winter until the thaw", () => {
    const { state, world } = newGame(17);
    const wood = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg)!;
    expect(wantOpen(state, world, wood, calendar(0, 90))).toBe(false);
    expect(wantOpen(state, world, wood, calendar(0, 150))).toBe(false);
    expect(wantOpen(state, world, wood, calendar(0, WINTER_WOOD_FROM_DOY))).toBe(true);
    expect(wantOpen(state, world, wood, calendar(0, 244))).toBe(true);
    expect(wantOpen(state, world, wood, calendar(0, 20))).toBe(true);
  });

  it("stone is wanted twice: a once job for eight at the opening, and a keep of eight below the clothing block as the restock", () => {
    // The opening must be met on day one - six stones for the fire pit, two for the knife - and a keep at
    // level 1 is a stand-in that has to be given again, which happens only once camp is under half the
    // target. Four stone does not build a fire pit, so the opening stays a once job and the keep is the
    // restock that feeds the arrows and the axe, where topping up under four is what a restock should do.
    const stones = REFERENCE_ORDERS.filter((w) => w.req.task === "stone");
    expect(stones.length).toBe(2);
    expect(stones[0].kind).toBe("job");
    expect(stones[0].req.until).toEqual({ kind: "campHas", qty: 8 });
    expect(stones[1].kind).toBe("keep");
    expect(stones[1].req.until).toEqual({ kind: "campHas", qty: 8 });
    const at = (w: (typeof REFERENCE_ORDERS)[number]) => REFERENCE_ORDERS.indexOf(w);
    expect(at(stones[0])).toBeLessThan(at(REFERENCE_ORDERS.find((w) => w.req.arg === "firePit")!));
    // The restock sits right above the whetstone, the first of the edge's wants, which spend stone.
    expect(at(stones[1])).toBe(at(REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === "whetstone")!) - 1);
  });

  it("the winter log keep sits beside the woodpile keep and above the named hunts, opened with it from midsummer", () => {
    // A grind is never met and a grind above a keep starves it: with the log keep last, below the three
    // named hunts, camp logs never passed five through the autumn and a level-20 camp froze in December.
    const logs = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.logs)!;
    expect(logs.kind).toBe("keep");
    expect(REFERENCE_ORDERS.some((w) => w.req.task === "chop" && w.kind === "grind")).toBe(false);
    const woodpile = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg)!;
    // The wedge split and dead wood, the woodpile's two methods for a camp with no axe, sit between the two.
    expect(REFERENCE_ORDERS.indexOf(logs)).toBe(REFERENCE_ORDERS.indexOf(woodpile) + 3);
    const tail = REFERENCE_ORDERS.slice(REFERENCE_ORDERS.indexOf(logs) + 1);
    expect(tail.map((w) => `${w.req.task}:${w.req.arg}:${w.kind}`)).toEqual(["hang:undefined:grind", "hunt:elk:grind", "hunt:reindeer:grind", "hunt:deer:grind"]);
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, logs, calendar(0, 90))).toBe(false);
    expect(wantOpen(state, world, logs, calendar(0, 244))).toBe(true);
    expect(wantOpen(state, world, logs, calendar(0, 20))).toBe(true);
    // The summer's 4-log keep is not a winter-stock want and stays open in April.
    const summer = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === 4)!;
    expect(wantOpen(state, world, summer, calendar(0, 90))).toBe(true);
  });

  it("winterStockWant tells the two winter keeps from the summer keeps of the same tasks by their targets", () => {
    const find = (task: string, q: number) => REFERENCE_ORDERS.find((w) => w.req.task === task && w.req.until.kind === "campHas" && w.req.until.qty === q)!;
    expect(winterStockWant(find("split", WINTER_STOCK.firewoodKg))).toBe(true);
    expect(winterStockWant(find("chop", WINTER_STOCK.logs))).toBe(true);
    expect(winterStockWant(find("chop", 4))).toBe(false);
    expect(winterStockWant(find("split", 60))).toBe(false);
  });

  it("the hide coat, trousers and boots wait for Crafting 8; the needle, the fur hat, the mittens and the bow do not", () => {
    const { state, world } = newGame(17);
    const cal = calendar(0);
    const want = (arg: string) => REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === arg)!;
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, world, want(arg), cal), arg).toBe(false);
    for (const arg of ["needle", "furHat", "furMittens", "bow"]) expect(wantOpen(state, world, want(arg), cal), arg).toBe(true);
    setSkillLevel(state, "crafting", 8);
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, world, want(arg), cal), arg).toBe(true);
  });

  it("the clothing block is a needle kept like a tool, a mend grind and five garments as once jobs, right after the small-game hunt keep", () => {
    // The needle is a keep of one because a needle that wears out takes the mend grind with it: a once
    // job left two year seeds with the grind skipped "needs a bone needle" beside hundreds of kilos of hide.
    const block = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const hunt = block.indexOf("hunt:any:keep:campHas");
    expect(block.slice(hunt + 1, hunt + 8)).toEqual([
      "craft:needle:keep:campHas", "repair::grind:forever",
      "craft:hideCoat:job:once", "craft:hideTrousers:job:once", "craft:hideBoots:job:once", "craft:furHat:job:once", "craft:furMittens:job:once",
    ]);
  });

  it("a kitted level-20 list makes one spare spear and stops", () => {
    const ref = setUpReference(17, true);
    for (const s of SKILL_IDS) setSkillLevel(ref.state, s, 20);
    stepReference(ref, 20 * 1440);
    const st = regionState(ref.state, ref.world, ref.state.player.region);
    expect(hasTool(ref.state.player, "fishingSpear")).toBe(true);
    expect(qty(pile(ref.state, st.campCell), "fishingSpear")).toBe(1);
  });
});

describe("wants by method", () => {
  it("names the water method: the shore keep in summer, the hole keep with an axe on ice, the melt keep without one", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const shore = REFERENCE_ORDERS.find((w) => w.req.task === "fill" && w.req.arg === "shore" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    const hole = REFERENCE_ORDERS.find((w) => w.req.task === "fill" && w.req.arg === "hole" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    const melt = REFERENCE_ORDERS.find((w) => w.req.task === "melt" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    expect(shore.kind).toBe("keep");
    expect(hole.kind).toBe("keep");
    expect(melt.kind).toBe("keep");
    const cal = calendar(0, 90);
    expect(wantOpen(state, world, shore, cal)).toBe(true);
    expect(wantOpen(state, world, hole, cal)).toBe(false);
    expect(wantOpen(state, world, melt, cal)).toBe(false);
    state.weather.iceCm = ICE_SHORE_CM;
    expect(wantOpen(state, world, shore, cal)).toBe(false);
    expect(wantOpen(state, world, hole, cal)).toBe(true);
    expect(wantOpen(state, world, melt, cal)).toBe(false);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    expect(wantOpen(state, world, hole, cal)).toBe(false);
    expect(wantOpen(state, world, melt, cal)).toBe(true);
    addItem(pile(state, st.campCell), "axe", 1);
    expect(wantOpen(state, world, hole, cal)).toBe(true);
    expect(wantOpen(state, world, melt, cal)).toBe(false);
  });

  it("keeps the pit fire lit until a hut or a hearth stands, then the fire indoors", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const pit = REFERENCE_ORDERS.find((w) => w.req.task === "light")!;
    const indoors = REFERENCE_ORDERS.find((w) => w.req.task === "lightIndoors")!;
    expect(pit.kind).toBe("keep");
    expect(indoors.kind).toBe("keep");
    const cal = calendar(0, 90);
    expect(wantOpen(state, world, pit, cal)).toBe(true);
    expect(wantOpen(state, world, indoors, cal)).toBe(false);
    st.structures.turfHut = true;
    expect(wantOpen(state, world, pit, cal)).toBe(false);
    expect(wantOpen(state, world, indoors, cal)).toBe(true);
  });
});

describe("the lineage gate", () => {
  it("runs up to six lives and stops at the first that reaches the day cap", () => {
    const l = runLineage(17, 3, 6);
    expect(l.lives.length).toBeGreaterThanOrEqual(1);
    expect(l.lives.length).toBeLessThanOrEqual(6);
    const last = l.lives[l.lives.length - 1].report;
    if (last.outcome.kind === "reached") expect(last.outcome.day).toBeGreaterThanOrEqual(3);
    for (const life of l.lives.slice(0, -1)) expect(life.report.outcome.kind).toBe("died");
  });
});
