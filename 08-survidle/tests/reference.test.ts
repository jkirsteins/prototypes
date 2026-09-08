import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { isCareRow } from "../src/sim/bodyorder";
import { calendar, START_DOY } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, hasTool, pile, qty } from "../src/sim/inventory";
import { FOODS } from "../src/sim/items";
import { ARRIVAL_DRIED_MEAT_KG, newGame, START_KCAL } from "../src/sim/newgame";
import { conditionOpen, inSeason, ordersHere } from "../src/sim/orders";
import { fatLandmarks, medianPerson } from "../src/sim/person";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
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
  REGIVE_DAYS,
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
  WOOD_DUE_DOY,
} from "../src/sim/reference";
import { emptyBurn, emptyYield, weekBefore } from "../src/sim/ledger";
import { SAP_FROM_DOY, SAP_KCAL, SAP_TAPS_PER_DAY } from "../src/sim/items";
import { readShore } from "../src/sim/knowledge";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes, SKILL_IDS } from "../src/sim/skills";
import { SPECIES_DEFS } from "../src/sim/species";
import { APRIL, BURN, MIDSUMMER_DOY } from "../src/sim/tables";
import { ICE_SHORE_CM } from "../src/sim/water";
import { cellIdx, terrainOf, WORLD_H, WORLD_W, type World } from "../src/world/gen";

/**
 * No reference seed's home region has a birch cell (the brief's own
 * region-scoped lookup finds none for 17, 19, 42 or 79), so this scans the
 * terrain grid directly, the way tests/plants.test.ts's own finder does.
 */
function findBirchCell(world: World): number {
  for (let y = 0; y < WORLD_H; y += 3) {
    for (let x = 0; x < WORLD_W; x += 3) {
      if (terrainOf(world, x, y) === "birch") return cellIdx(world, x, y);
    }
  }
  throw new Error("no birch cell found anywhere in the world");
}

describe("the reference player", () => {
  it("a job that cannot run is passed over, and the rows under it run without it being struck off", () => {
    // Under the ladder's rungs every want is a once job. The opening list's
    // first row is the thaw, and in a summer with nothing frozen it can
    // never run: nothing pins it, so the list does not wait on it, and it
    // stays on the list rather than being withdrawn to make way.
    const ref = setUpReference(17, true);
    ref.player.tick(ref.state, ref.world);
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(ordersHere(ref.state, ref.world)[2].req.task).toBe("thaw");
    stepReference(ref, 60);
    const list = ordersHere(ref.state, ref.world);
    expect(list.some((o) => o.req.task === "thaw")).toBe(true);
    // The rows under it run just the same: a row passed over holds nothing up.
    expect(list.length).toBeGreaterThan(20);
    stepReference(ref, 5 * 60);
    expect(ref.state.dead).toBeNull();
    const camp = pile(ref.state, regionState(ref.state, ref.world, ref.state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
  });

  it("at level 1 the first tick gives every open want as a once job, ranked as the list", () => {
    const { state, world, player } = setUpReference(17);
    expect(ordersHere(state, world).every(isCareRow)).toBe(true);
    player.tick(state, world);
    // Neither care row is one of the reference's own wants.
    const list = ordersHere(state, world).filter((o) => !isCareRow(o));
    // Two readings shut a want on the opening morning. The runner's own rules shut the three
    // named hunts (the species' recommended level), the two ice-hole fetches and the two melts
    // (the shore is open), the fire indoors (no hut), the hide coat, trousers and boots
    // (Crafting 8), the celt and the flaked axe, the wedge split and the dead wood (an axe is
    // in hand), and seaweed (an inland lake). The wants' own conditions shut the nests, the
    // sap, the winter dig, the winter pile and its logs, the rack, the hang and the render,
    // each waiting on a window or on a stock camp has not got on day one. A level-1 survivor
    // writes neither reading, so the runner reads both by hand and the list is what is left,
    // every want of it a once job.
    const cal = calendar(state.minute, state.startDoy);
    const shape = (w: (typeof REFERENCE_ORDERS)[number]) => ({ id: -1, kind: w.kind, req: w.req, done: 0, minutes: 0, skipped: "" });
    const open = REFERENCE_ORDERS.filter((w) => wantOpen(state, world, w) && conditionOpen(state, world, cal, shape(w)) === null);
    expect(list.length).toBe(REFERENCE_ORDERS.length - 27);
    expect(open.length).toBe(REFERENCE_ORDERS.length - 27);
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
    // Fat rendered, then the two catches - the lean item and the oily one, which is eaten by
    // nobody raw - and then the meat. The render is a grind and the three below it are keeps:
    // a kilo of rendered fat at camp is no reason to let the rest of a carcass rot.
    expect(tasks[cook - 3]).toBe("cook:rawFat");
    expect(REFERENCE_ORDERS[cook - 3].kind).toBe("grind");
    expect(tasks[cook - 2]).toBe("cook:fish");
    expect(tasks[cook - 1]).toBe("cook:oilyFish");
    // The bone crack, then the two standing producers - the rack and the twenty-snare line, work
    // that finishes and feeds the camp afterwards - then the hang, then the winter stock's four
    // wood keeps, which are the one thing on the list due on a date, then the meat, and only then
    // the fat and carbohydrate item's own gathers: the nests, the two root rows and their cook
    // keep, the sap tap and seaweed, all above the fish keep. Inner bark and its grind are off
    // the list; see tests/list.test.ts for why.
    expect(tasks.slice(cook + 1, cook + 5)).toEqual(["crack:", "build:dryingRack", "build:snare", "hang:"]);
    expect(tasks.slice(cook + 5, cook + 10)).toEqual(["split:", "splitWedges:", "deadwood:", "chop:", "hunt:any"]);
    expect(tasks.slice(cook + 10, cook + 16)).toEqual(["eggs:", "roots:", "roots:", "cook:roots", "tapSap:", "seaweed:"]);
    expect(tasks[cook + 16]).toBe("fish:any");
    expect(tasks[cook + 17]).toBe("berries:");
    expect(tasks[cook + 18]).toBe("craft:bow");
    const spear = tasks.indexOf("craft:fishingSpear");
    expect(tasks.slice(spear + 1, spear + 4)).toEqual(["read:", "craft:basketTrap", "setTrap:"]);
    // The rendered-fat keep sits above the two cook keeps, fat first: raw fat rots in three
    // warm days and is the calories the lean ceiling does not touch.
    expect(tasks[spear + 4]).toBe("cook:rawFat");
    expect(tasks[spear + 5]).toBe("cook:fish");
    expect(tasks).not.toContain("emptyTrap:");
    // The clothing block follows the arrows, then the stone restock, then the edge's whole life with
    // the spare axe: a whetstone in the opening cost the knife its stone and the snares an hour.
    const arrows = tasks.indexOf("craft:arrows");
    expect(tasks.slice(arrows + 1, arrows + 8)).toEqual(["craft:needle", "repair:", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens"]);
    expect(tasks.slice(arrows + 8, arrows + 14)).toEqual(["stone:", "craft:whetstone", "hone:", "craft:wedges", "craft:stoneAxe", "craft:flakedAxe"]);
    const axe = tasks.indexOf("craft:flakedAxe");
    // The forty-snare keep sits right after the water trough, pushing the fill, melt, winter-stock and hang block one further down.
    expect(tasks.slice(axe + 1, axe + 9)).toEqual(["sticks:", "bark:", "build:turfHut", "build:waterStore", "build:snare", "fill:shore", "fill:hole", "melt:"]);
    // The three named hunts are what is left of the surplus loop: the winter stock's own keeps
    // sit above the hunt keep, where a promise due on a date belongs, and the hang grind above
    // the plant band once its own stock line shut it on anything a body can eat in time.
    expect(tasks.slice(axe + 9, axe + 12)).toEqual(["hunt:elk", "hunt:reindeer", "hunt:deer"]);
    expect(REFERENCE_ORDERS[REFERENCE_ORDERS.length - 1].kind).toBe("grind");
    // 74: the bough bed keep after the lean-to, the snow shelter job after the bough bed, the
    // twenty-snare keep and the rack above the gathering block, the forty-snare keep after the
    // water trough, the thaw grind at the head of the water block, the fat and carbohydrate
    // item's eight insertions around the cook keeps - the rendered-fat keep, the oily-fish cook
    // keep, the bone crack, eggs, roots and its cook keep, the sap tap and seaweed - and the
    // winter dig, the root row's second window, which the frozen months want an ice hole for.
    expect(REFERENCE_ORDERS.length).toBe(74);
  });

  // Cordage needs bark (see RECIPES), so the want that feeds it is bark.
  it("a want whose stand-in dropped off is given again while unmet, and a finished true job is not", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "bark", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "craft", until: { kind: "once" }, arg: "cordage", deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player.tick(state, world);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["wait", "wait", "bark", "craft"]);
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

  it("the sap tap is a count a day in its window: at the rung the order stands and costs no morning, under it the returning player gives it afresh", () => {
    // A tap is drunk on the spot, so nothing at camp reads as done and a job done once would
    // be a job done once a year. The count a day is what says otherwise, and it is the row's
    // own promise rather than a rule about the vocabulary: at the condition rung the order
    // carries the count and the window and never drops off, so the list never changes.
    const tap = REFERENCE_ORDERS.find((w) => w.req.task === "tapSap")!;
    const run = (level: number) => {
      const { state, world } = newGame(17, SAP_FROM_DOY);
      placeAt(state, world, findBirchCell(world));
      state.player.tools.push({ id: "knife", durability: 100 });
      state.player.kcal = 3000;
      state.player.water = 3;
      state.player.warmth = 100;
      state.player.health = 100;
      for (const s of SKILL_IDS) setSkillLevel(state, s, level);
      const player = new ReferencePlayer([tap]);
      stepReference({ state, world, player }, 3 * 24 * 60);
      return { player, sap: state.ledger.reduce((s, d) => s + d.yield.sap, 0) };
    };
    // Three days inside the window book more than one day's three-tap cap at either level.
    const twenty = run(20);
    expect(twenty.sap).toBeGreaterThan(SAP_KCAL * SAP_TAPS_PER_DAY);
    expect(twenty.player.attention(1, 3).mornings).toBe(0);
    const five = run(5);
    expect(five.sap).toBeGreaterThan(SAP_KCAL * SAP_TAPS_PER_DAY);
    // Under the rung the count is stripped to a plain one, so the morning is the player's.
    expect(five.player.attention(1, 3).mornings).toBeGreaterThan(0);
  });

  // Every other job pins the opposite: given as itself, it finishes for good, and a second
  // look the next day leaves nothing new done and no order standing. Work wanted again
  // tomorrow says so with a count a day; these four are the shapes that must not reopen.
  it("a garment craft is finished for good: one coat's materials, not a fresh one every day camp holds hides", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "crafting", 8);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.player.tools.push({ id: "needle", durability: 100 });
    const camp = pile(state, st.campCell);
    addItem(camp, "hide", 60);
    addItem(camp, "sinew", 20);
    const player = new ReferencePlayer([
      { req: { task: "craft", arg: "hideCoat", until: { kind: "once" }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    const ref = { state, world, player };
    stepReference(ref, 24 * 60);
    expect(qty(camp, "hide")).toBe(54);
    expect(ordersHere(state, world).some((o) => o.req.task === "craft")).toBe(false);
    stepReference(ref, 24 * 60);
    expect(qty(camp, "hide")).toBe(54);
    expect(ordersHere(state, world).some((o) => o.req.task === "craft")).toBe(false);
  });

  it("a build:snare times-5 job is finished for good at five snares, not re-issued to forty", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "hunting", 20);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "snare", 10);
    const player = new ReferencePlayer([
      { req: { task: "build", arg: "snare", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" }, kind: "job" },
    ]);
    const ref = { state, world, player };
    stepReference(ref, 24 * 60);
    expect(st.structures.snares).toBe(5);
    expect(ordersHere(state, world).some((o) => o.req.task === "build")).toBe(false);
    stepReference(ref, 24 * 60);
    expect(st.structures.snares).toBe(5);
    expect(ordersHere(state, world).some((o) => o.req.task === "build")).toBe(false);
  });

  it("read is finished for good after its one hour, not re-given the next day", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "shore");
    const player = new ReferencePlayer([{ req: { task: "read", until: { kind: "once" }, deliver: "camp", where: "nearest" }, kind: "job" }]);
    const ref = { state, world, player };
    stepReference(ref, 24 * 60);
    const known1 = Object.keys(state.player.known).length;
    expect(known1).toBeGreaterThan(0);
    expect(ordersHere(state, world).some((o) => o.req.task === "read")).toBe(false);
    stepReference(ref, 24 * 60);
    expect(Object.keys(state.player.known).length).toBe(known1);
    expect(ordersHere(state, world).some((o) => o.req.task === "read")).toBe(false);
  });

  it("setTrap is finished for good once the trap is set, not re-set the next day while it stands", () => {
    const { state, world } = newGame(4, 200);
    placeAtSpot(state, world, state.player.region, "shore");
    const cell = cellOf(state, world);
    const obs = readShore(state, world, cell);
    const st = regionState(state, world, state.player.region);
    for (const s of obs.fish) st.pop[s] = 2500;
    addItem(state.player.pack, "basketTrap", 1);
    const player = new ReferencePlayer([{ req: { task: "setTrap", until: { kind: "once" }, deliver: "camp", where: "nearest" }, kind: "job" }]);
    const ref = { state, world, player };
    stepReference(ref, 24 * 60);
    expect(st.trap).not.toBeNull();
    expect(ordersHere(state, world).some((o) => o.req.task === "setTrap")).toBe(false);
    stepReference(ref, 24 * 60);
    expect(ordersHere(state, world).some((o) => o.req.task === "setTrap")).toBe(false);
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
    // The two care rows plus the one real order.
    expect(first.length).toBe(3);
    expect(first[2].kind).toBe("job");
    expect(first[2].req.until).toEqual({ kind: "times", n: 2 });
    for (let h = 0; h < 6; h++) {
      player3.tick(at3.state, at3.world);
      advance(at3.state, at3.world, 60);
    }
    expect(ordersHere(at3.state, at3.world).every(isCareRow)).toBe(true);
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
    expect(list.map((o) => [o.req.task, o.kind])).toEqual([["wait", "camp"], ["wait", "body"], ["fill", "job"], ["split", "keep"]]);
    expect(list[2].req.until.kind).toBe("once");
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

  it("the April target is the day a beginner eating the least and burning the most reaches the floor", () => {
    const median = medianPerson("m");
    const l = fatLandmarks(median);
    // Only the reserve above essential fat is fuel; the floor is structure.
    const reserve = (l.typical - l.floor) + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg;
    const deficit = BURN.day.hi - APRIL.rows.total!.beginner.lo;
    expect(REFERENCE_TARGET_DAY).toBe(20);
    expect(REFERENCE_TARGET_DAY).toBe(Math.floor(reserve / deficit));
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
    for (let day = 19; day <= 25; day++) state.ledger.push({ day, yield: emptyYield(), eaten: 2971, leanKcal: 0, nonLeanKcal: 2971, leanAtCamp: false, burn: emptyBurn(), sleepMin: 0, workMin: 0 });
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
    // Seed 17, not 79: seed 79's body sits in its settling zone, where
    // starvation() correctly reads 0 and no longer throttles workSpeed the
    // way the old 1 - fat/typical did. Her day reshuffles, the fire goes
    // unlit from day 4, warmth falls, and with p.kcal at 0 the health-regen
    // gate never opens, so cold damage kills her by day 7 - never reaching
    // this checkpoint. Seed 17 reaches REFERENCE_TARGET_DAY alive here.
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
    const week = { days: 7, yield: { fish: 310, trap: 0, snare: 0, hunt: 0, berries: 0, kit: 0, marrow: 0, roe: 0, eggs: 0, bark: 0, roots: 0, sap: 0, seaweed: 0 }, eaten: 290, burn: { base: 1680, activity: 620, walk: 640, cold: 200, sick: 0 }, sleepMin: 504, workMin: 672, leanWallDays: 3 };
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
    expect(lines[3]).toContain("lean-wall days 3 of 7");
    const none = weekLines({ ...week, days: 0 }, 115);
    expect(none[0]).toContain("no full day yet");
  });

  it("a capped run does not double the checkpoint", () => {
    // calendar()'s day is dayIndex + 1, so a run of REFERENCE_TARGET_DAY - 1 full days
    // (day 1 is the start) reads back as day REFERENCE_TARGET_DAY once it stops, so the day
    // cap and the REFERENCE_TARGET_DAY checkpoint land on the same day. This does not cover
    // the death-landing-on-a-checkpoint variant of the same branch.
    //
    // Which seed stands here is incidental: the subject is the cap, and any run still alive
    // at it will do. A seed that starts dying before the cap is a reading for the gate to
    // report, not a reason to change what this test is about - swap in another living seed
    // and leave the death where the gate can see it.
    const r = runReference(79, REFERENCE_TARGET_DAY - 1);
    expect(r.outcome).toEqual({ kind: "reached", day: REFERENCE_TARGET_DAY });
    const days = r.checkpoints.map((c) => c.day);
    expect(new Set(days).size).toBe(days.length);
    expect(days[days.length - 1]).toBe(REFERENCE_TARGET_DAY);
  });

  it("carries the attention count for the whole run: mornings the list changed, of the days it ran", () => {
    const r = runReference(17, 5);
    // A from-scratch run's list stands from day 1, so the days asked about are the whole run.
    expect(r.attention.days).toBe(r.outcome.day);
    expect(r.attention.mornings).toBeGreaterThanOrEqual(0);
    expect(r.attention.mornings).toBeLessThanOrEqual(r.attention.days);
  });
});

// An heir actually raised - two lives lived out, the gap, the walk home to the
// old camp - lives in tests/slow/heir.test.ts (`npm run test:slow`); what stays
// here is the end of runHeir that costs nothing to reach.
describe("the heir", () => {
  it("a first life still alive at the day cap has no heir to raise, and stands in for both", () => {
    const r = runHeir(17, 1);
    expect(r.first.outcome.kind).toBe("reached");
    expect(r.gapDays).toBe(0);
    expect(r.heir).toEqual(r.first);
  });
});

// Any lineage that actually raises an heir - the two-life run and the three-life
// run over a quarter of a year - lives in tests/slow/lineage.test.ts (`npm run
// test:slow`); what stays here is the shape of a lineage that never has to.
describe("the lineage", () => {
  it("stops early when a life reaches the day cap alive", () => {
    const r = runLineage(17, 5, 3);
    expect(r.lives.length).toBe(1);
    expect(r.lives[0].report.outcome.kind).toBe("reached");
  });
});

describe("wants by level", () => {
  it("opens the large-game hunts at the species' recommended hunting level and not below", () => {
    const { state, world } = newGame(17);
    const elk = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "elk")!;
    const any = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "any")!;
    expect(wantOpen(state, world, elk)).toBe(false);
    expect(wantOpen(state, world, any)).toBe(true);
    setSkillLevel(state, "hunting", SPECIES_DEFS.elk.hunt!.level!);
    expect(wantOpen(state, world, elk)).toBe(true);
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

  it("stands in for the pace by hand at woodcraft 10: a plain keep at today's target, withdrawn when the thaw closes the window", () => {
    // Keeps are earned at woodcraft 10 and the due date at 20, so the log reserve stands as
    // a keep aimed at what the date asks for this morning, and the window is the runner's to
    // read. A month into the window: the rise starts at nothing on its first day.
    const start = WINTER_WOOD_FROM_DOY + 30;
    const { state, world } = newGame(17, start);
    setSkillLevel(state, "woodcraft", 10);
    const player = new ReferencePlayer();
    // Above the list's 4-log summer keep, which is what tells the two apart under the rung.
    const woodpile = () => ordersHere(state, world).filter((o) => o.req.task === "chop" && o.req.until.kind === "campHas" && o.req.until.qty > 4);
    player.tick(state, world);
    expect(woodpile().length).toBe(1);
    const target = woodpile()[0].req.until;
    expect(target.kind === "campHas" && target.qty).toBeCloseTo((WINTER_STOCK.logs * 30) / (WOOD_DUE_DOY - WINTER_WOOD_FROM_DOY));
    expect(woodpile()[0].req.when).toBeUndefined();
    // Forward to the day after the thaw's first: the days left in the year, then April's second.
    state.minute = (365 - start + WINTER_WOOD_TO_DOY + 1) * 1440;
    expect(calendar(state.minute, state.startDoy).dayOfYear).toBe(WINTER_WOOD_TO_DOY + 1);
    player.tick(state, world);
    expect(woodpile()).toEqual([]);
    // A full year from the start: the same day of the window again, and the want reopens.
    state.minute = 365 * 1440;
    expect(calendar(state.minute, state.startDoy).dayOfYear).toBe(start);
    player.tick(state, world);
    expect(woodpile().length).toBe(1);
  });

  // The window opens at midsummer, not 1 September: against the measured 6.6-tonne
  // stock a camp that starts cutting on the first frost never catches up.
  it("says the winter firewood window on the keep: midsummer to the thaw, shut through the spring", () => {
    const wood = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg)!;
    const season = wood.req.when!.season!;
    expect(inSeason(WINTER_WOOD_TO_DOY, season)).toBe(false);
    expect(inSeason(150, season)).toBe(false);
    expect(inSeason(WINTER_WOOD_FROM_DOY, season)).toBe(true);
    expect(inSeason(244, season)).toBe(true);
    expect(inSeason(20, season)).toBe(true);
    // The buffer rises to its figure by 1 December and holds there: it is the pile the
    // fire draws on daily, refilled from the reserve, so 1 March wants as much as
    // 1 December. It rises rather than standing flat because a row a beginner can never
    // meet takes the whole day from the food rows under it.
    expect(wood.req.when!.by).toBe(WOOD_DUE_DOY);
    expect(wood.req.when!.spend).toBeUndefined();
    // The reserve is the row the spending belongs to: a store cut for one winter is
    // burned through it, so it falls away again to nothing at the thaw.
    const reserve = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.logs)!;
    expect(reserve.req.when!.season).toEqual(season);
    expect(reserve.req.when!.by).toBe(WOOD_DUE_DOY);
    expect(reserve.req.when!.spend).toBe(true);
  });

  it("follows a paced keep down by hand as readily as up, on the same weekly look", () => {
    // Under Woodcraft 20 the due date is stripped and the runner stands in for it, so a
    // camp that never earns the rung must still stop felling for a reserve the thaw will
    // leave standing: the returning player reads their own pile against the winter left
    // and lowers the ask, which costs the same morning that raising it did.
    const { state, world } = newGame(17, WOOD_DUE_DOY);
    setSkillLevel(state, "woodcraft", 10);
    const player = new ReferencePlayer();
    const reserve = () => ordersHere(state, world).find((o) => o.req.task === "chop" && o.req.until.kind === "campHas" && o.req.until.qty > 4);
    player.tick(state, world);
    // The due date itself: the stand-in is given at the whole figure.
    const peak = reserve()!.req.until;
    expect(peak.kind === "campHas" && peak.qty).toBeCloseTo(WINTER_STOCK.logs);
    // A week on, a week's worth of the fall off the peak, and the row is given again at it.
    state.minute = REGIVE_DAYS * 1440;
    player.tick(state, world);
    const later = reserve()!.req.until;
    const fall = ((WINTER_WOOD_TO_DOY - 1 - WOOD_DUE_DOY) % 365 + 365) % 365;
    expect(later.kind === "campHas" && later.qty).toBeCloseTo(WINTER_STOCK.logs * (1 - REGIVE_DAYS / fall));
  });

  it("stone is wanted twice: a once job for eight at the opening, and a keep of eight below the clothing block as the restock", () => {
    // The opening must be met on day one - the knife, and the whetstone the edge wants soon after - and a
    // keep at level 1 is a stand-in that has to be given again, which happens only once camp is under half
    // the target. So the opening stays a once job and the keep is the restock that feeds the arrows and the
    // axe, where topping up under four is what a restock should do. The fire site is not in that reckoning:
    // it is cleared ground and asks for no stone, which is why it sits above the opening job and not below.
    const stones = REFERENCE_ORDERS.filter((w) => w.req.task === "stone");
    expect(stones.length).toBe(2);
    expect(stones[0].kind).toBe("job");
    expect(stones[0].req.until).toEqual({ kind: "campHas", qty: 8 });
    expect(stones[1].kind).toBe("keep");
    expect(stones[1].req.until).toEqual({ kind: "campHas", qty: 8 });
    const at = (w: (typeof REFERENCE_ORDERS)[number]) => REFERENCE_ORDERS.indexOf(w);
    expect(at(stones[0])).toBeGreaterThan(at(REFERENCE_ORDERS.find((w) => w.req.arg === "firePit")!));
    // The restock sits right above the whetstone, the first of the edge's wants, which spend stone.
    expect(at(stones[1])).toBe(at(REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === "whetstone")!) - 1);
  });

  it("the winter log keep sits beside the woodpile keep, the four of them above the hunt keep", () => {
    // A grind is never met and a grind above a keep starves it: with the log keep last, below the three
    // named hunts, camp logs never passed five through the autumn and a level-20 camp froze in December.
    // The four sit above the hunt keep, since what they promise is due on a date and a hunt is not.
    const logs = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.logs)!;
    expect(logs.kind).toBe("keep");
    expect(REFERENCE_ORDERS.some((w) => w.req.task === "chop" && w.kind === "grind")).toBe(false);
    const woodpile = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg)!;
    // The wedge split and dead wood, the woodpile's two methods for a camp with no axe, sit between the two.
    expect(REFERENCE_ORDERS.indexOf(logs)).toBe(REFERENCE_ORDERS.indexOf(woodpile) + 3);
    const hunt = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "any")!;
    expect(REFERENCE_ORDERS.indexOf(hunt)).toBe(REFERENCE_ORDERS.indexOf(logs) + 1);
    // The three named hunts are all that is left at the foot of the list.
    const tail = REFERENCE_ORDERS.slice(-3);
    expect(tail.map((w) => `${w.req.task}:${w.req.arg}:${w.kind}`)).toEqual(["hunt:elk:grind", "hunt:reindeer:grind", "hunt:deer:grind"]);
    // The log keep carries the woodpile's window and date and, alone of the four, the
    // spending; the summer's 4-log keep carries none of it.
    expect(logs.req.when!.season).toEqual(woodpile.req.when!.season);
    expect(logs.req.when!.by).toBe(WOOD_DUE_DOY);
    expect(logs.req.when!.spend).toBe(true);
    expect(woodpile.req.when!.spend).toBeUndefined();
    const summer = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === 4)!;
    expect(summer.req.when).toBeUndefined();
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
    const want = (arg: string) => REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === arg)!;
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, world, want(arg)), arg).toBe(false);
    for (const arg of ["needle", "furHat", "furMittens", "bow"]) expect(wantOpen(state, world, want(arg)), arg).toBe(true);
    setSkillLevel(state, "crafting", 8);
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, world, want(arg)), arg).toBe(true);
  });

  it("the clothing block is a needle kept like a tool, a mend grind and five garments as once jobs, right after the arrows", () => {
    // The needle is a keep of one because a needle that wears out takes the mend grind with it: a once
    // job left two year seeds with the grind skipped "needs a bone needle" beside hundreds of kilos of hide.
    // The block used to follow the small-game hunt keep; that keep moved above the plant band and the
    // arrows, the last of the ranged kit, are what the block follows now.
    const block = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const hunt = block.indexOf("craft:arrows:keep:campHas");
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
    expect(wantOpen(state, world, shore)).toBe(true);
    expect(wantOpen(state, world, hole)).toBe(false);
    expect(wantOpen(state, world, melt)).toBe(false);
    state.weather.iceCm = ICE_SHORE_CM;
    expect(wantOpen(state, world, shore)).toBe(false);
    expect(wantOpen(state, world, hole)).toBe(true);
    expect(wantOpen(state, world, melt)).toBe(false);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    expect(wantOpen(state, world, hole)).toBe(false);
    expect(wantOpen(state, world, melt)).toBe(true);
    addItem(pile(state, st.campCell), "axe", 1);
    expect(wantOpen(state, world, hole)).toBe(true);
    expect(wantOpen(state, world, melt)).toBe(false);
  });

  it("keeps the pit fire lit until a hut or a hearth stands, then the fire indoors", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const pit = REFERENCE_ORDERS.find((w) => w.req.task === "light")!;
    const indoors = REFERENCE_ORDERS.find((w) => w.req.task === "lightIndoors")!;
    expect(pit.kind).toBe("keep");
    expect(indoors.kind).toBe("keep");
    expect(wantOpen(state, world, pit)).toBe(true);
    expect(wantOpen(state, world, indoors)).toBe(false);
    st.structures.turfHut = true;
    expect(wantOpen(state, world, pit)).toBe(false);
    expect(wantOpen(state, world, indoors)).toBe(true);
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

// The attention count off a real forty-day year run lives in
// tests/slow/year-attention.test.ts (`npm run test:slow`).
