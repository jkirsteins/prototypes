import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyStep } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { addItem } from "../src/sim/inventory";
import { orderByHand } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { hungerLine } from "../src/sim/actions";
import { ordersHere, removeOrder } from "../src/sim/orders";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { availableTasks } from "../src/sim/tasks";
import { updateBars } from "../src/ui/bars";
import { activity, inventoryHtml } from "../src/ui/panels";
import { mapInventoryHtml, tipHtml } from "../src/ui/tip";
import { fmtDaysAbout } from "../src/units";
import { rule } from "./css";
import { neighbourLandCell, siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

/**
 * The 2026-09-10 blind playtest on seed 30: each bug it found, pinned to
 * the landing it was seen on. The record is docs/playtest-2026-09-10.md.
 */
beforeEach(() => testAtmosphere());

describe("a once field fire is one fire", () => {
  it("lights once, and the order leaves the list", () => {
    const { state, world } = newGame(30);
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 10);
    const cal = calendar(state.minute, state.startDoy);
    orderByHand(state, world, cal, new Rng(1), { task: "light", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    for (let m = 0; m < 300; m++) advance(state, world, 1);
    const lit = state.log.filter((e) => e.text.includes("The field fire is lit")).length;
    expect(lit).toBe(1);
    expect(ordersHere(state, world).some((o) => "req" in o && o.req.task === "light")).toBe(false);
  });
});

describe("a landing is not a camp until somebody makes one", () => {
  it("the map tooltip calls the landing cell by its ground, and Camp only once it is one", () => {
    const { state, world } = newGame(30);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    expect(regionState(state, world, state.player.region).campCell).toBeNull();
    expect(tipHtml(state, world, cal, here)).not.toContain("<b>Camp</b>");
    siteCamp(state, world);
    expect(tipHtml(state, world, cal, here)).toContain("<b>Camp</b>");
  });

  it("offers no walk to a camp that does not exist", () => {
    const { state, world } = newGame(30);
    const cal = calendar(state.minute, state.startDoy);
    // A row for the generated camp spot read "Walk to ?" with no camp made.
    // Stood a cell off the ground the region offers for a camp, so the walk
    // row has somewhere to go once that ground is one.
    placeAt(state, world, neighbourLandCell(world, cellOf(state, world)));
    expect(availableTasks(state, world, cal).some((o) => o.id === "walk" && o.arg === "spot:camp")).toBe(false);
    siteCamp(state, world);
    expect(availableTasks(state, world, cal).some((o) => o.id === "walk" && o.arg === "spot:camp")).toBe(true);
  });

  it("the body says there is no camp yet rather than no way to one", () => {
    const { state, world } = newGame(30);
    const cal = calendar(state.minute, state.startDoy);
    state.intent = null;
    const step = bodyStep(state, world, cal, new Rng(1), "sleep");
    expect(step?.step).toContain("no camp yet");
    expect(step?.step).not.toContain("no way to camp");
    expect(state.log.some((e) => e.text.includes("No camp yet"))).toBe(true);
  });
});

describe("self-care says which need it serves", () => {
  it("names the need in the title, so an ice hole reads as thirst", () => {
    const { state, world } = newGame(30);
    const cal = calendar(state.minute, state.startDoy);
    state.intent = { mode: "care", care: "body", need: "thirsty", orderId: 1, step: "opening an ice hole" };
    state.task = { id: "iceHole", progress: 0, duration: 60, repeat: false };
    expect(activity(state, world, cal)?.title).toBe("Self-care: thirsty");
    state.intent = { mode: "care", care: "camp", need: "fire", orderId: 2, step: "lighting the fire" };
    state.task = { id: "light", progress: 0, duration: 20, repeat: false };
    expect(activity(state, world, cal)?.title).toBe("Camp maintenance: the fire");
  });
});

describe("a long forecast is approximate", () => {
  it("counts days for a fortnight, weeks for a season, months beyond", () => {
    expect(fmtDaysAbout(1)).toBe("1 day");
    expect(fmtDaysAbout(9)).toBe("9 days");
    expect(fmtDaysAbout(14)).toBe("14 days");
    expect(fmtDaysAbout(20)).toBe("about 3 weeks");
    expect(fmtDaysAbout(45)).toBe("about 6 weeks");
    expect(fmtDaysAbout(105)).toBe("about 3 months");
    expect(fmtDaysAbout(200)).toBe("about 7 months");
  });
});

describe("every pane scrolls", () => {
  it("a pane taller than its box scrolls inside it rather than being cut off", () => {
    expect(rule("#camp, #inventory, #gear, #log, #journal")).toContain("overflow-y: auto");
  });
});

describe("the Carried line is everything on the body", () => {
  it("names the tools before the pack, so an axe is not a Gear-tab secret", () => {
    const { state, world } = newGame(30);
    expect(state.player.tools.some((t) => t.id === "axe")).toBe(true);
    const html = mapInventoryHtml(state, world, null);
    expect(html).toContain("Carried:</b> iron axe, ");
    expect(html).toContain("dried meat");
  });
});

describe("eating and drinking are the self-care row's, and nobody else's", () => {
  it("draws no eat, drink, fill or add-firewood button", () => {
    const { state, world } = newGame(30);
    siteCamp(state, world);
    addItem(state.player.pack, "cookedMeat", 1);
    addItem(state.player.pack, "firewood", 5);
    regionState(state, world, state.player.region).fire.lit = true;
    const cal = calendar(state.minute, state.startDoy);
    const html = inventoryHtml(state, world, cal);
    for (const act of ["eat", "drink", "feed", "fill"]) expect(html).not.toContain(`data-act="${act}"`);
  });

  it("a hungry body under a hand order does not eat until the row has the minute", () => {
    const { state, world } = newGame(39);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    addItem(state.player.pack, "driedMeat", 2);
    state.player.kcal = hungerLine(state) - 200;
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(state.intent?.mode).toBe("hand");
    const before = state.player.kcal;
    for (let m = 0; m < 20 && state.intent?.mode === "hand"; m++) advance(state, world, 1);
    expect(state.player.kcal).toBeLessThanOrEqual(before);
    // The row given its minute eats.
    state.intent = null;
    state.task = null;
    removeOrder(state, world, 3);
    for (let m = 0; m < 5; m++) advance(state, world, 1);
    expect(state.player.kcal).toBeGreaterThan(before);
  });
});

describe("a bar says which way it is going", () => {
  it("reads the change over the last ten game minutes as up, down or steady", () => {
    const { state, world } = newGame(30);
    const root = document.createElement("div");
    root.innerHTML = `<div class="bar"><div data-bar="kcal"></div><i data-trend="kcal"></i><b data-val="kcal"></b></div><div class="bar"><div data-bar="water"></div><i data-trend="water"></i><b data-val="water"></b></div>`;
    state.player.kcal = 2000;
    state.player.water = 2.0;
    updateBars(state, world, root);
    state.minute += 10;
    state.player.kcal = 1900;
    updateBars(state, world, root);
    const kcal = root.querySelector<HTMLElement>("[data-trend=kcal]")!;
    const water = root.querySelector<HTMLElement>("[data-trend=water]")!;
    expect(kcal.dataset.dir).toBe("down");
    expect(kcal.title).toContain("falling");
    expect(water.dataset.dir).toBe("steady");
    state.minute += 10;
    state.player.kcal = 2400;
    updateBars(state, world, root);
    expect(kcal.dataset.dir).toBe("up");
    expect(kcal.title).toContain("rising");
  });
});
