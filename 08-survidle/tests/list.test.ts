import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, pile } from "../src/sim/inventory";
import { AUTO_EAT_ORDER } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { ordersHere, removeOrder } from "../src/sim/orders";
import { regionState } from "../src/sim/regionstate";
import { PLANT_HOURS_PER_ROW, REFERENCE_ORDERS, setUpReference, wantOpen, WINTER_STOCK } from "../src/sim/reference";
import { SKILL_IDS } from "../src/sim/skills";
import { PLANT_HOURS_PER_DAY } from "../src/sim/tables";

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
    const cal = calendar(state.minute, state.startDoy);
    expect(wantOpen(state, world, want("split::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("splitWedges::keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("deadwood::keep"), cal)).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("split::keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("splitWedges::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("deadwood::keep"), cal)).toBe(true);
  });

  it("wants the celt from Crafting 5 and the flaked axe under it, only with no axe to hand", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"), cal)).toBe(false);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(true);
    setSkillLevel(state, "crafting", 5);
    expect(wantOpen(state, world, want("craft:stoneAxe:keep"), cal)).toBe(true);
    expect(wantOpen(state, world, want("craft:flakedAxe:keep"), cal)).toBe(false);
  });

  it("keeps the winter pile's season rule on all three methods", () => {
    const { state, world } = newGame(17);
    const april = calendar(state.minute, state.startDoy);
    // Read off WINTER_STOCK.firewoodKg rather than a literal: the stock was
    // sized from the measured hut winter, and the three methods move with it.
    const winterPile = REFERENCE_ORDERS.filter((w) => w.req.until.kind === "campHas" && w.req.until.qty === WINTER_STOCK.firewoodKg);
    expect(winterPile.map(key)).toEqual(["split::keep", "splitWedges::keep", "deadwood::keep"]);
    for (const w of winterPile) expect(wantOpen(state, world, w, april)).toBe(false);
    const october = calendar(0, 280);
    expect(wantOpen(state, world, winterPile[0], october)).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, winterPile[0], october)).toBe(false);
    expect(wantOpen(state, world, winterPile[1], october)).toBe(true);
    expect(wantOpen(state, world, winterPile[2], october)).toBe(true);
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

  it("keeps the fat rendered above the cook keeps, cracks bones, and gathers eggs, roots, bark, sap and seaweed in their seasons", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("cook:rawFat:keep")).toBeLessThan(tasks.indexOf("cook:fish:keep"));
    expect(tasks.indexOf("crack::grind")).toBeGreaterThan(tasks.indexOf("cook::keep"));
    for (const t of ["eggs::job", "roots::job", "cook:roots:keep", "innerBark::keep", "grindBark::keep", "tapSap::job", "seaweed::job"]) expect(tasks).toContain(t);
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, want("eggs::job"), calendar(0, 100))).toBe(false);
    expect(wantOpen(state, world, want("eggs::job"), calendar(0, 130))).toBe(true);
    expect(wantOpen(state, world, want("tapSap::job"), calendar(0, 125))).toBe(true);
    expect(wantOpen(state, world, want("tapSap::job"), calendar(0, 200))).toBe(false);
    expect(wantOpen(state, world, want("innerBark::keep"), calendar(0, 250))).toBe(false);
    expect(wantOpen(state, world, want("roots::job"), calendar(0, 250))).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, want("roots::job"), calendar(0, 340))).toBe(false);
  });

  it("asks for the plant band by the day: a counted job per row, the handbook's three hours split across them", () => {
    // A keep measured in food at camp can never read met while the body eats what it brings
    // home, so the plant keeps took four and a half to seven and a half hours a day and the
    // hunt rows below them never got a turn. These are counted jobs instead, given afresh
    // each morning and finished for the day once the count is spent.
    for (const t of ["eggs::job", "roots::job", "seaweed::job"]) {
      expect(want(t).kind).toBe("job");
      expect(want(t).req.until).toEqual({ kind: "times", n: PLANT_HOURS_PER_ROW });
    }
    expect(PLANT_HOURS_PER_ROW * 3).toBe(PLANT_HOURS_PER_DAY);
  });

  it("gives a daily want its count once a day: spent, it waits for the morning", () => {
    const { state, world, player } = setUpReference(17, true);
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    const roots = () => ordersHere(state, world).find((o) => o.req.task === "roots");
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

  it("wants the rack only once there is meat to dry, so the hour is not spent on an empty one", () => {
    // The rack outranks the gathering keeps, so nothing shuts it but this: a beginner who
    // builds it on day five with no kill yet loses the hour off the woodpile, and seed 19
    // froze on day 22 when it did.
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const april = calendar(0, 100);
    expect(wantOpen(state, world, want("build:dryingRack:job"), april)).toBe(false);
    addItem(pile(state, st.campCell), "rawMeat", 2);
    expect(wantOpen(state, world, want("build:dryingRack:job"), april)).toBe(true);
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
