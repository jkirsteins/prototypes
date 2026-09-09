import { describe, expect, it } from "vitest";
import { cellPossibilities, leaveCamp } from "../src/sim/camp";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { giveOrder } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { atCamp, campCellOf, cellOf, describeWhere, kmBetween, placeAt, spotHere, SPOT_WORDS } from "../src/sim/position";
import { regionState, siteAt, siteFor } from "../src/sim/regionstate";
import { advance } from "../src/sim/advance";
import { availableTasks, beginTask, leftBehind, walkTarget, whereIs } from "../src/sim/tasks";
import { seepGround } from "../src/sim/seep";
import { mapHtml } from "../src/ui/map";
import { placesHtml } from "../src/ui/panels";
import { tipHtml } from "../src/ui/tip";
import { defaultChoice, newUiState, rowRequest } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import { neighbourLandCell, siteCamp } from "./siting-helpers";
import { paneHtml } from "./pane";

describe("making camp elsewhere is always legal, and leaves what it held", () => {
  it("is legal wherever the survivor stands, a structure, a banked fire and a loose pile at the old camp notwithstanding", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.fuelKg = 2;
    addItem(pile(state, st.campCell!), "stick", 30);
    placeAt(state, world, neighbourLandCell(world, st.campCell!));
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).find((o) => o.id === "makeCamp")!.ok).toBe(true);
  });

  it("moving on leaves the site, the pile, the fuel and the rack's load behind, and kills the fire outright", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const old = st.campCell!;
    siteFor(st, old).structures.firePit = true;
    siteFor(st, old).structures.leanTo = true;
    // Banked, not burning: the fire is out but its wood is still stacked there, so
    // the 20-minute walk to the new site does not eat into the kilos this pins.
    st.fire.lit = false;
    st.fire.fuelKg = 4;
    st.fire.wetKg = 1;
    st.fire.embers = 30;
    st.fire.litSince = state.minute - 60;
    st.fire.rainHeld = 5;
    st.rack.kg = 3;
    st.rack.dried = 500;
    addItem(pile(state, old), "stone", 2);
    const away = neighbourLandCell(world, old);
    placeAt(state, world, away);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 20);
    expect(st.campCell!).toBe(away);
    expect(siteAt(st, old)!.structures.leanTo).toBe(true);
    expect(siteAt(st, away)).toBeNull();
    expect(st.fire.lit).toBe(false);
    expect(st.fire.embers).toBe(0);
    expect(st.fire.litSince).toBeNull();
    expect(st.fire.rainHeld).toBe(0);
    expect(st.rack.kg).toBe(0);
    expect(st.rack.dried).toBe(0);
    // The lean-to left standing there dries the pile's own wood as any lean-to does, so the
    // split between the two items may have moved a touch; the kilos of wood themselves have not.
    expect(qty(pile(state, old), "firewood") + qty(pile(state, old), "wetFirewood")).toBeCloseTo(5, 1);
    expect(qty(pile(state, old), "rawMeat")).toBeCloseTo(3, 1);
    expect(qty(pile(state, old), "stone")).toBe(2);
    expect(qty(pile(state, away), "firewood")).toBe(0);
  });

  it("a camp with a hut on it can still be moved", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.turfHut = true;
    addItem(pile(state, st.campCell!), "stone", 5);
    st.fire.lit = true;
    st.fire.fuelKg = 2;
    placeAt(state, world, neighbourLandCell(world, st.campCell!));
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).find((o) => o.id === "makeCamp")!.ok).toBe(true);
  });

  it("leaving an already bare camp leaves nothing behind, on a fire long since dead", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    leaveCamp(state, world);
    expect(st.fire.lit).toBe(false);
    expect(st.fire.embers).toBe(0);
    expect(st.fire.litSince).toBeNull();
    expect(st.rack.kg).toBe(0);
  });

  it("wet wood alone still moves, and lands as wetFirewood alone with no dry fuel beside it", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const old = st.campCell!;
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 2;
    const away = neighbourLandCell(world, old);
    placeAt(state, world, away);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 20);
    expect(st.campCell!).toBe(away);
    // Any pile dries a touch on its own even with nothing built to shelter it; the wet
    // kilos themselves, not the split between the two wood items, are what this pins.
    expect(qty(pile(state, old), "wetFirewood") + qty(pile(state, old), "firewood")).toBeCloseTo(2, 1);
    expect(qty(pile(state, old), "firewood")).toBeLessThan(0.1);
  });

  it("reads the camp pile without creating one where nothing lies", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    placeAt(state, world, neighbourLandCell(world, st.campCell!));
    expect(state.piles[st.campCell!]).toBeUndefined();
    availableTasks(state, world, cal);
    expect(state.piles[st.campCell!]).toBeUndefined();
  });

  it("leftBehind reads the old camp's pile without creating one, on the same cell the confirm dialog asks it about", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, neighbourLandCell(world, st.campCell!));
    expect(state.piles[st.campCell!]).toBeUndefined();
    expect(leftBehind(state, world)).toBe("");
    expect(state.piles[st.campCell!]).toBeUndefined();
  });
});

describe("the camp reads follow the live cell", () => {
  it("campCellOf, spotHere, describeWhere and atCamp read regionState's camp, not the generated one", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell!;
    expect(campCellOf(state, world)).toBe(generated);
    expect(spotHere(state, world)).toBe("camp");
    expect(describeWhere(state, world)).toBe("at camp");
    expect(atCamp(state, world)).toBe(true);

    // Move the camp one passable cell over, in the same region, and stand on it.
    const next = neighbourLandCell(world, generated);
    st.campCell = next;
    placeAt(state, world, next);
    expect(campCellOf(state, world)).toBe(next);
    expect(spotHere(state, world)).toBe("camp");
    expect(describeWhere(state, world)).toBe("at camp");
    expect(atCamp(state, world)).toBe(true);

    // Standing back on the old (now unremarkable) cell is no longer "camp".
    placeAt(state, world, generated);
    expect(spotHere(state, world)).not.toBe("camp");
    expect(describeWhere(state, world)).not.toBe("at camp");
    expect(atCamp(state, world)).toBe(false);
  });
});

describe("whereIs names a cell by the live camp, not the generated one", () => {
  it("reads the region's other spots as before, but the camp only at the moved cell", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell!;
    const other = regionAt(world, state.player.region).spots.find((s) => s.id !== "camp");
    expect(other).toBeDefined();
    expect(whereIs(state, world, generated)).toBe("camp");
    expect(whereIs(state, world, other!.cell)).toBe(SPOT_WORDS[other!.id]);

    const next = neighbourLandCell(world, generated);
    st.campCell = next;
    expect(whereIs(state, world, next)).toBe("camp");
    expect(whereIs(state, world, generated)).not.toBe("camp");
  });
});

describe("distances from camp follow a move", () => {
  it("reads the live camp cell rather than the one the region was generated with", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const home = state.player.region;
    const st = regionState(state, world, home);

    // The overview panel that used to print these is gone; the rule it was
    // printing is not, and it is the rule that matters: a camp that moved is
    // the camp everything measures from.
    const spot = regionAt(world, home).spots.find((s) => s.id !== "camp");
    expect(spot).toBeDefined();
    const generated = st.campCell!;
    const before = kmBetween(state, world, generated, spot!.cell);

    const next = neighbourLandCell(world, generated);
    st.campCell = next;
    expect(campCellOf(state, world, home)).toBe(next);

    const after = kmBetween(state, world, campCellOf(state, world, home)!, spot!.cell);
    expect(after).not.toBeNull();
    expect(after).toBe(kmBetween(state, world, next, spot!.cell));
    // The generated cell is no longer what anything measures from.
    expect(campCellOf(state, world, home)).not.toBe(generated);
    expect(before).not.toBeNull();
  });

  it("an untouched region is not given state just by being asked about", () => {
    const { state, world } = newGame(17);
    const neighbourId = regionAt(world, state.player.region).neighbours[0].id;
    expect(neighbourId in state.regions).toBe(false);
    // A region has no camp until somebody makes one, and asking about one
    // nobody has been to neither invents a camp nor builds state for it.
    expect(campCellOf(state, world, neighbourId)).toBeNull();
    expect(neighbourId in state.regions).toBe(false);
  });
});

describe("walkTarget resolves the live camp, not the generated one", () => {
  it("a region's camp and the current region's own 'camp' spot both follow a move", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const home = state.player.region;
    const st = regionState(state, world, home);
    const generatedHome = st.campCell!;
    const next = neighbourLandCell(world, generatedHome);
    st.campCell = next;
    // The current region's own camp spot, addressed as "spot:camp".
    expect(walkTarget(state, world, "spot:camp")?.cell).toBe(next);
    expect(walkTarget(state, world, "spot:camp")?.cell).not.toBe(generatedHome);

    // A neighbour's camp, addressed as "region:<id>" - somebody has made camp there.
    const neighbourId = regionAt(world, home).neighbours[0].id;
    const generatedNeighbour = siteCamp(state, world, neighbourId);
    const nSt = regionState(state, world, neighbourId);
    const nNext = neighbourLandCell(world, generatedNeighbour);
    nSt.campCell = nNext;
    expect(walkTarget(state, world, `region:${neighbourId}`)?.cell).toBe(nNext);
    expect(walkTarget(state, world, `region:${neighbourId}`)?.cell).not.toBe(generatedNeighbour);
  });
});

describe("the places list marks 'you are here' at the moved camp", () => {
  it("matches the live camp cell, not the cell RegionDef.spots generated for it", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell!;
    const next = neighbourLandCell(world, generated);
    st.campCell = next;
    const cal = calendar(state.minute, state.startDoy);

    placeAt(state, world, next);
    expect(placesHtml(state, world, cal)).toContain("you are here");

    // Standing on the old, now unremarkable, generated cell is no longer "here" for the camp row.
    placeAt(state, world, generated);
    expect(placesHtml(state, world, cal)).not.toContain("you are here");
  });
});

describe("make camp here", () => {
  it("is not offered on the camp cell, is offered one land cell away, moves the camp on completion and logs it", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(false);
    const next = neighbourLandCell(world, st.campCell!);
    placeAt(state, world, next);
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(true);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "makeCamp")).toBe(true);
    advance(state, world, 25);
    expect(st.campCell!).toBe(next);
    expect(state.log.some((e) => e.text === "{You} {make} camp here.")).toBe(true);
    expect(state.goals.done.secondCamp).toBeUndefined();
  });

  it("names what stays at the old camp in the log line: the structure and the pile, not the fire's kilos twice", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const old = st.campCell!;
    siteFor(st, old).structures.firePit = true;
    addItem(pile(state, old), "stick", 30);
    const next = neighbourLandCell(world, old);
    placeAt(state, world, next);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 20);
    expect(siteAt(st, old)!.structures.firePit).toBe(true);
    expect(state.log.some((e) => e.text === "{You} {make} camp here. The fire site and 15 kg stay at the old camp.")).toBe(true);
  });

  it("a live intent's camp follows the move", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell!;
    addOrder(state, world, { task: "sticks", until: { kind: "campHas", qty: 100 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 1);
    expect(state.intent).not.toBeNull();

    const next = neighbourLandCell(world, generated);
    placeAt(state, world, next);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 25);
    expect(st.campCell!).toBe(next);
    expect(state.intent!.campCell!).toBe(next);
  });

  it("queued, binds the cell the click meant, and walks back to it even after the survivor moves on before the order starts", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const clicked = neighbourLandCell(world, st.campCell!);
    placeAt(state, world, clicked);
    // What main.ts's "intent" click does: the row's own choice carries no cell of its
    // own, so the click binds the one it is standing on before the request joins the
    // order queue - the runner then resolves that bound cell, not wherever it starts.
    const { req, kind } = rowRequest(defaultChoice(), "makeCamp", undefined);
    req.where = { cell: cellOf(state, world) };
    giveOrder(state, world, req, kind);

    const elsewhere = neighbourLandCell(world, clicked);
    placeAt(state, world, elsewhere);
    advance(state, world, 200);
    expect(st.campCell!).toBe(clicked);
  });

  it("reads 'making camp' while it runs, not the raw task id with the site's identifier", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const next = neighbourLandCell(world, st.campCell!);
    placeAt(state, world, next);
    addOrder(state, world, { task: "makeCamp", until: { kind: "once" }, deliver: "leave", where: { cell: next } }, "job");
    advance(state, world, 1);
    expect(state.intent).not.toBeNull();
    expect(state.intent!.step).toBe("making camp");
  });

  it("the greyed row at camp has no clickable queue path", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const html = paneHtml(state, world, cal, "makeCamp");
    expect(html).toContain("this is the camp");
    expect(html).not.toMatch(/data-act="intent"\s+data-id="makeCamp"/);
  });
});

describe("cell possibilities", () => {
  it("names seep ground and invents no other possibilities", () => {
    const { state, world } = newGame(17);
    const cells = regionAt(world, state.player.region).cells;
    const wet = cells.find((cell) => seepGround(world, cell));
    const dry = cells.find((cell) => !seepGround(world, cell));
    expect(wet).toBeDefined();
    expect(dry).toBeDefined();
    expect(cellPossibilities(world, wet!)).toEqual(["seep possible"]);
    expect(cellPossibilities(world, dry!)).toEqual([]);
  });

  it("shows only real possibilities in the tooltip and make-camp row", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const wet = regionAt(world, state.player.region).cells.find((cell) => seepGround(world, cell));
    expect(wet).toBeDefined();
    placeAt(state, world, wet!);
    expect(tipHtml(state, world, cal, wet!)).toContain("seep possible");
    expect(tipHtml(state, world, cal, wet!)).not.toContain("as a camp");
    expect(paneHtml(state, world, cal, "makeCamp")).toContain("seep possible");
  });
});

describe("checking travel to a neighbour touches no region state", () => {
  it("availableTasks's every-neighbour travel check does not grow state.regions", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    expect(Object.keys(state.regions).length).toBe(1);
    availableTasks(state, world, cal);
    expect(Object.keys(state.regions).length).toBe(1);
  });

  it("whereIs reading a neighbour's camp cell does not touch its state either", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    expect(Object.keys(state.regions).length).toBe(1);
    const neighbourId = regionAt(world, state.player.region).neighbours[0].id;
    const neighbourCamp = regionAt(world, neighbourId).campCell!;
    whereIs(state, world, neighbourCamp);
    expect(Object.keys(state.regions).length).toBe(1);
  });
});

describe("the places list never doubles up when the camp sits on another spot's cell", () => {
  it("shows one 'you are here' row once the camp is moved onto the forest spot's own cell", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const forest = regionAt(world, state.player.region).spots.find((s) => s.id === "forest")!;
    st.campCell = forest.cell;
    placeAt(state, world, forest.cell);
    const cal = calendar(state.minute, state.startDoy);
    const html = placesHtml(state, world, cal);
    expect(html.match(/you are here/g)).toHaveLength(1);
  });
});

describe("the map marks the camp", () => {
  it("draws x until a fire or shelter glyph takes the cell, and follows a move", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const ui = newUiState();
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell!;
    // A fresh game starts you standing on the camp, and your own glyph wins the cell,
    // the same way a fire or shelter you stand on does; step off to see the mark.
    const off = neighbourLandCell(world, generated);
    placeAt(state, world, off);
    expect(mapHtml(world, state, ui, cal)).toContain("mk-camp");
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    expect(mapHtml(world, state, ui, cal)).not.toContain("mk-camp");
    st.fire.lit = false;
    st.fire.fuelKg = 0;

    // The mark follows a move, to a cell you are not standing on either.
    st.campCell = neighbourLandCell(world, off);
    expect(mapHtml(world, state, ui, cal)).toContain("mk-camp");
  });
});
