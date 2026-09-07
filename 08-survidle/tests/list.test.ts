import { describe, expect, it } from "vitest";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, pile, TRACE_KG } from "../src/sim/inventory";
import {
  AUTO_EAT_ORDER, EGG_FROM_DOY, EGG_TO_DOY, FOODS, LEAN_KCAL_PER_DAY, MEAT_DRY_RATIO, ROOT_FROM_DOY, ROOT_TO_DOY,
  SAP_FROM_DOY, SAP_TAPS_PER_DAY, SAP_TO_DOY, SPOIL_HOURS,
} from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { inSeason, ordersHere, removeOrder } from "../src/sim/orders";
import { regionState } from "../src/sim/regionstate";
import {
  HANG_ABOVE_KG, PLANT_HOURS_PER_ROW, REFERENCE_ORDERS, setUpReference, stepReference, wantOpen, winterStockWant,
  WINTER_STOCK, WINTER_WOOD_TO_DOY, WOOD_DUE_DOY,
} from "../src/sim/reference";
import { levelMinutes, SKILL_IDS } from "../src/sim/skills";
import { MIDSUMMER_DOY, PLANT_HOURS_PER_DAY } from "../src/sim/tables";

const key = (w: (typeof REFERENCE_ORDERS)[number]) => `${w.req.task}:${w.req.arg ?? ""}:${w.kind}`;
const want = (t: string) => REFERENCE_ORDERS.find((x) => key(x) === t)!;

describe("the list after the axe", () => {
  // A vessel that froze full has no room, so a fill tops off nothing and the
  // pour at camp passes it over: a fetch keep with every vessel frozen runs
  // all day and draws nothing. A level-20 camp did that for twenty days from
  // 30 January and froze on 19 February with 109 logs at camp. The thaw is a
  // grind, blocked with "nothing is frozen" the rest of the year.
  it("thaws a frozen vessel above every water fetch", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks[0]).toBe("thaw::grind");
    for (const t of ["fill:shore:keep", "fill:hole:keep", "melt::keep"]) expect(tasks.indexOf(t)).toBeGreaterThan(0);
  });

  it("keeps the bough bed laid right after the lean-to", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("build:boughBed:keep")).toBe(tasks.indexOf("build:leanTo:job") + 1);
  });

  it("keeps stone, hones after the knife, and orders the three firewood methods", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    // The opening gathers eight as a job that re-gives until met; the keep beside the axe wants is what refills it for the celt and the hone.
    expect(tasks.indexOf("stone::job")).toBeLessThan(tasks.indexOf("stone::keep"));
    expect(tasks.indexOf("craft:whetstone:job")).toBe(tasks.indexOf("stone::keep") + 1);
    expect(tasks.indexOf("hone::grind")).toBe(tasks.indexOf("craft:whetstone:job") + 1);
    expect(tasks.indexOf("craft:wedges:keep")).toBe(tasks.indexOf("hone::grind") + 1);
    expect(tasks.indexOf("craft:stoneAxe:keep")).toBe(tasks.indexOf("craft:wedges:keep") + 1);
    expect(tasks.indexOf("splitWedges::keep")).toBe(tasks.indexOf("split::keep") + 1);
    expect(tasks.indexOf("deadwood::keep")).toBe(tasks.indexOf("splitWedges::keep") + 1);
  });

  it("opens the axe split with an axe in reach and the wedges and dead wood without one", () => {
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, want("split::keep"))).toBe(true);
    expect(wantOpen(state, world, want("splitWedges::keep"))).toBe(false);
    expect(wantOpen(state, world, want("deadwood::keep"))).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("split::keep"))).toBe(false);
    expect(wantOpen(state, world, want("splitWedges::keep"))).toBe(true);
    expect(wantOpen(state, world, want("deadwood::keep"))).toBe(true);
  });

  it("wants the celt from Crafting 5 and the flaked axe under it, only with no axe to hand", () => {
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"))).toBe(false);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"))).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"))).toBe(true);
    setSkillLevel(state, "crafting", 5);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"))).toBe(true);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"))).toBe(false);
  });

  it("says the winter pile's window on all three methods, and leaves the method itself to the axe", () => {
    const { state, world } = newGame(17);
    // Read off WINTER_STOCK.firewoodKg rather than a literal: the stock was
    // sized from the measured hut winter, and the three methods move with it.
    const winterPile = REFERENCE_ORDERS.filter((w) => w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg);
    expect(winterPile.map(key)).toEqual(["split::keep", "splitWedges::keep", "deadwood::keep"]);
    // The window is the order's own: midsummer to the day before the thaw, shut through the
    // spring and summer a pile stacked then would only sit through, and shut on the thaw's
    // own first day, which a season inclusive of its last day makes the day before it.
    for (const w of winterPile) {
      expect(w.req.when?.season).toEqual({ from: MIDSUMMER_DOY, to: WINTER_WOOD_TO_DOY - 1 });
      expect(inSeason(WINTER_WOOD_TO_DOY, w.req.when!.season!)).toBe(false);
      expect(inSeason(150, w.req.when!.season!)).toBe(false);
      expect(inSeason(280, w.req.when!.season!)).toBe(true);
    }
    // The axe is what the runner still reads: with one in reach the split is the method,
    // without one the wedges and the dead wood are.
    expect(wantOpen(state, world, winterPile[0])).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, winterPile[0])).toBe(false);
    expect(wantOpen(state, world, winterPile[1])).toBe(true);
    expect(wantOpen(state, world, winterPile[2])).toBe(true);
  });

  it("keeps twenty snares set above the gathering block, with the rack, and forty below the trough", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    const twenty = REFERENCE_ORDERS.findIndex((w) => w.req.task === "build" && w.req.arg === "snare" && w.kind === "keep" && w.req.until.kind === "campHas" && w.req.until.qty === 20);
    const forty = REFERENCE_ORDERS.findIndex((w) => w.req.task === "build" && w.req.arg === "snare" && w.kind === "keep" && w.req.until.kind === "campHas" && w.req.until.qty === 40);
    // The rack and the snare line are work that finishes; the gathering keeps below them are
    // measured in food at camp and can never read met, so they must not outrank a standing producer.
    expect(tasks[twenty - 1]).toBe("build:dryingRack:job");
    expect(twenty).toBeLessThan(tasks.indexOf("eggs::job"));
    expect(twenty).toBeLessThan(tasks.indexOf("fish:any:keep"));
    expect(forty).toBe(tasks.indexOf("build:waterStore:job") + 1);
  });

  it("keeps the fat rendered above the cook keeps, cracks bones, and gathers eggs, roots, sap and seaweed in their seasons", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("cook:rawFat:grind")).toBeLessThan(tasks.indexOf("cook:fish:keep"));
    expect(tasks.indexOf("crack::grind")).toBeGreaterThan(tasks.indexOf("cook::keep"));
    for (const t of ["eggs::job", "roots::job", "cook:roots:keep", "tapSap::job", "seaweed::job"]) expect(tasks).toContain(t);
    // Inner bark and its grind are off the list: at 275 kcal an hour they cost more than they
    // return, and the task stays in the game for a player who wants the fallback by hand.
    for (const t of ["innerBark::keep", "grindBark::keep"]) expect(tasks).not.toContain(t);
    // Each gather says its own window, so nothing but the ground under the camp is left
    // for the runner to read: the nests, the sap and the summer dig by their windows.
    expect(want("eggs::job").req.when?.season).toEqual({ from: EGG_FROM_DOY, to: EGG_TO_DOY });
    // The tap is a count a day inside its window, not a job done once: what it yields is
    // drunk on the spot, so nothing at camp says it has been done and nothing but the day
    // roll can ask for it again. The birches' own cap is what the count reads.
    expect(want("tapSap::job").req.until).toEqual({ kind: "daily", n: SAP_TAPS_PER_DAY });
    expect(want("tapSap::job").req.when?.season).toEqual({ from: SAP_FROM_DOY, to: SAP_TO_DOY });
    const digs = REFERENCE_ORDERS.filter((w) => w.req.task === "roots" && w.kind === "job");
    expect(digs.map((w) => w.req.when?.season)).toEqual([
      { from: ROOT_FROM_DOY, to: ROOT_TO_DOY },
      { from: ROOT_TO_DOY + 1, to: ROOT_FROM_DOY - 1 },
    ]);
    // The winter dig is the one gather the runner still holds a rule for: an ice hole is
    // what reaches the rhizomes under frozen ground, and an axe is what keeps one open.
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, digs[0])).toBe(true);
    expect(wantOpen(state, world, digs[1])).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, digs[0])).toBe(true);
    expect(wantOpen(state, world, digs[1])).toBe(false);
  });

  it("asks for the plant band by the day: a daily count per row, the handbook's three hours split across them", () => {
    // A keep measured in food at camp can never read met while the body eats what it brings
    // home, so the plant keeps took four and a half to seven and a half hours a day and the
    // hunt rows below them never got a turn. These are daily counts instead: spent, the row
    // waits for the morning, and the day roll is what starts it over.
    for (const t of ["eggs::job", "roots::job", "seaweed::job"]) {
      expect(want(t).kind).toBe("job");
      expect(want(t).req.until).toEqual({ kind: "daily", n: PLANT_HOURS_PER_ROW });
    }
    // Three rows at a time: the winter dig is the root row in the months the summer one is shut.
    expect(PLANT_HOURS_PER_ROW * 3).toBe(PLANT_HOURS_PER_DAY);
  });

  it("gives a daily want its count once a day: spent, it waits for the morning", () => {
    const { state, world, player } = setUpReference(17, true);
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    // The summer row, told from the winter dig standing shut beside it by the window it carries.
    const roots = () => ordersHere(state, world).find((o) => o.req.task === "roots" && o.req.when?.season?.from === ROOT_FROM_DOY);
    player.tick(state, world);
    const first = roots();
    expect(first).toBeDefined();
    // Spend the day's count by hand: the order drops off the next look and is not given again.
    first!.done = PLANT_HOURS_PER_ROW;
    removeOrder(state, world, first!.id);
    player.tick(state, world);
    expect(roots()).toBeUndefined();
    // A day later the morning reset clears the count and the want is given again.
    state.minute += 24 * 60;
    player.tick(state, world);
    expect(roots()).toBeDefined();
  });

  it("the wants carry their conditions, and wantOpen holds only the named runner rules", () => {
    const eggs = want("eggs::job");
    expect(eggs.req.until).toEqual({ kind: "daily", n: PLANT_HOURS_PER_ROW });
    expect(eggs.req.when).toEqual({ season: { from: EGG_FROM_DOY, to: EGG_TO_DOY } });
    // The hunt keep's figure is the winter stock's dried meat in the raw kilos it dried from,
    // which is the unit the keep counts its forms in, and it restarts at four fifths of that -
    // the fifth the stock carries as spare. It is the larder gate, said on the row itself.
    const hunt = want("hunt:any:keep");
    expect(hunt.req.until).toEqual({ kind: "campHas", qty: WINTER_STOCK.driedMeatKg * MEAT_DRY_RATIO });
    expect(hunt.req.when).toEqual({ restart: (WINTER_STOCK.driedMeatKg * MEAT_DRY_RATIO * 4) / 5 });
    const fish = want("fish:any:keep");
    expect(fish.req.when).toEqual({ stock: { item: "driedMeat", under: WINTER_STOCK.driedMeatKg } });
    // The paced pile: told from the summer keep of the same task by its target.
    const split = REFERENCE_ORDERS.find((w) => w.req.task === "split" && winterStockWant(w))!;
    expect(split.req.when).toEqual({ season: { from: MIDSUMMER_DOY, to: WINTER_WOOD_TO_DOY - 1 }, by: WOOD_DUE_DOY });
    expect(want("hang::grind").req.when).toEqual({ stock: { item: "rawMeat", atLeast: HANG_ABOVE_KG } });
    expect(want("cook:rawFat:grind").req.when).toEqual({ stock: { item: "rawFat", atLeast: TRACE_KG } });
    expect(want("crack::grind").req.when).toEqual({ stock: { item: "bone", atLeast: 1 } });
    expect(want("build:dryingRack:job").req.when).toEqual({ stock: { item: "rawMeat", atLeast: TRACE_KG } });
    const tasks = REFERENCE_ORDERS.map(key);
    expect(REFERENCE_ORDERS.indexOf(split)).toBeLessThan(tasks.indexOf("hunt:any:keep"));
    // A winter's dried meat at camp is the two food rows' own business, read off their
    // band and their stock line by whoever holds the order, and no rule in the runner.
    const { state, world } = newGame(17);
    addItem(pile(state, regionState(state, world, state.player.region).campCell), "driedMeat", WINTER_STOCK.driedMeatKg);
    for (const w of [hunt, fish]) expect(wantOpen(state, world, w)).toBe(true);
  });

  it("the runner gives the plain shape under the rung and counts the morning as a returning player", () => {
    // A month into the wood window, so the pile's target has risen off the nothing it starts
    // its season at and stands above the kit's own 20 kg, and high summer, so no shore ices
    // over and none of the named rules flips in the three days.
    const { state, world, player } = setUpReference(17, true, MIDSUMMER_DOY + 30);
    for (const s of SKILL_IDS) state.skills[s].xp = levelMinutes(20);
    // Kitted, all skills 20: the wood keep goes with its pace and its season and no morning is counted for it.
    stepReference({ state, world, player }, 1440 * 3);
    // The winter pile, told from the summer keep of the same task by its target.
    const paced = ordersHere(state, world).find((o) => o.req.task === "split" && o.req.until.kind === "campHas" && o.req.until.qty === WINTER_STOCK.firewoodKg);
    expect(paced?.req.when?.by).toBe(WOOD_DUE_DOY);
    expect(paced?.req.when?.season).toEqual({ from: MIDSUMMER_DOY, to: WINTER_WOOD_TO_DOY - 1 });
    expect(player.attention(1, 3).mornings).toBe(0);
  });

  it("a level-5 heir gets jobs and grinds only, and its list changes every morning the plant band re-opens", () => {
    const { state, world, player } = setUpReference(17, false);
    for (const s of SKILL_IDS) state.skills[s].xp = levelMinutes(5);
    stepReference({ state, world, player }, 1440 * 5);
    for (const o of ordersHere(state, world)) expect(o.kind).not.toBe("keep");
    expect(player.attention(1, 5).mornings).toBeGreaterThan(0);
  });

  it("hunts above the plant band and above the fish keep, with the bow and the arrows left below them", () => {
    // The hunt keep is a promise about raw meat at camp and a large kill meets it for days, so
    // it is not the treadmill a fish keep is. Under the block it got nine minutes to an hour and
    // twenty a day and three of four level-20 seeds killed nothing all summer. The bow and the
    // arrows stay below: lifted with it they cost seed 19 the woodpile and a cold death on day 22.
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("hunt:any:keep")).toBeLessThan(tasks.indexOf("roots::job"));
    expect(tasks.indexOf("hunt:any:keep")).toBeLessThan(tasks.indexOf("fish:any:keep"));
    expect(tasks.indexOf("craft:bow:keep")).toBeGreaterThan(tasks.indexOf("fish:any:keep"));
    expect(tasks.indexOf("craft:arrows:keep")).toBe(tasks.indexOf("craft:bow:keep") + 1);
  });

  it("renders raw fat as a grind while any is at camp, above the cook keeps", () => {
    // A keep of a kilo of rendered fat reads met the moment the first kilo is off the fire, and
    // camp fat is drawn only by auto-eat, last in the order, at a fifth of a kilo a day. So an
    // elk's raw fat sat beside the fire and rotted in three days with the row reading met: 53.7
    // kg of 65.7 on seed 42, 483,000 kcal, in the year it lived. It is the crack and hang shape:
    // a grind that is never met, with a stock line on the row to say what it waits for.
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks).toContain("cook:rawFat:grind");
    expect(tasks.indexOf("cook:rawFat:grind")).toBeLessThan(tasks.indexOf("cook:fish:keep"));
  });

  it("hangs only what the body cannot eat before it rots, and hangs it above the plant band", () => {
    // A grind is never met, so an ungated hang runs on every kilo a snare brings in: the
    // list's own record is two year seeds frozen on days 300 and 325 under one. The threshold
    // is derived and not chosen - raw meat's spoil hours against the lean ceiling at raw
    // meat's kcal a kilo - so a kill that will rot opens it and a hare does not.
    expect(HANG_ABOVE_KG).toBeCloseTo((SPOIL_HOURS.rawMeat / 24) * (LEAN_KCAL_PER_DAY / FOODS.rawMeat.kcalPerKg));
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("hang::grind")).toBeLessThan(tasks.indexOf("roots::job"));
  });

  it("keeps a cook for the oily catch as well as the lean one, since raw oily fish is eaten by nobody", () => {
    // cookedOilyFish is in the auto-eat order and the raw item is not, so a char landed
    // without this keep is carried home and rots in a day and a half. Every reference seed
    // died with an oily species standing in its shore's read.
    const tasks = REFERENCE_ORDERS.map(key);
    expect(AUTO_EAT_ORDER).not.toContain("oilyFish");
    expect(AUTO_EAT_ORDER).toContain("cookedOilyFish");
    expect(tasks.indexOf("cook:oilyFish:keep")).toBe(tasks.indexOf("cook:fish:keep") + 1);
  });
});
