import { describe, expect, it } from "vitest";
import { canMoveCamp, siteLine, siteReport } from "../src/sim/camp";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, removeItem } from "../src/sim/inventory";
import { giveOrder } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { baseWalkSpeed } from "../src/sim/player";
import { atCamp, campCellOf, cellOf, describeWhere, kmBetween, placeAt, spotHere, SPOT_WORDS } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { advance } from "../src/sim/advance";
import { availableTasks, beginTask, walkTarget, whereIs } from "../src/sim/tasks";
import { ICE_SAFE_CM, walkableIce } from "../src/sim/weather";
import { doHtml } from "../src/ui/dopanel";
import { mapHtml } from "../src/ui/map";
import { regionHtml } from "../src/ui/panels";
import { defaultChoice, newUiState, rowRequest } from "../src/ui/render";
import { fmtKm } from "../src/units";
import { regionAt } from "../src/world/gen";
import { findRoute, routeMinutes } from "../src/world/route";
import { neighbourLandCell } from "./siting-helpers";

describe("moving the camp is allowed while nothing stands at it", () => {
  it("is ok on a fresh game, and names the structure, the banked fire or the pile that blocks it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    expect(canMoveCamp(state, world)).toEqual({ ok: true });
    st.structures.firePit = true;
    expect(canMoveCamp(state, world)).toEqual({ ok: false, why: "the fire pit stands there" });
    st.structures.firePit = false;
    st.fire.fuelKg = 2;
    expect(canMoveCamp(state, world)).toEqual({ ok: false, why: "the fire is banked there" });
    st.fire.fuelKg = 0;
    addItem(pile(state, st.campCell), "stick", 30);
    expect(canMoveCamp(state, world).ok).toBe(false);
    expect((canMoveCamp(state, world) as { why: string }).why).toMatch(/^\d+(\.\d)? kg lie at the old camp, carry them first$/);
    st.structures.snares = 3;
    removeItem(pile(state, st.campCell), "stick", 30);
    expect(canMoveCamp(state, world)).toEqual({ ok: true });
  });

  it("wet wood alone still banks the fire, with no dry fuel at all", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 2;
    expect(canMoveCamp(state, world)).toEqual({ ok: false, why: "the fire is banked there" });
  });

  it("reads the camp pile without creating one where nothing lies", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    placeAt(state, world, neighbourLandCell(world, st.campCell));
    expect(state.piles[st.campCell]).toBeUndefined();
    availableTasks(state, world, cal);
    expect(state.piles[st.campCell]).toBeUndefined();
  });
});

describe("the camp reads follow the live cell", () => {
  it("campCellOf, spotHere, describeWhere and atCamp read regionState's camp, not the generated one", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
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
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
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

describe("the region overview's from-camp distances follow a move", () => {
  it("uses the generated distance for an untouched region and the live camp once one is moved", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    const st = regionState(state, world, home);
    const cal = calendar(0);

    // An untouched neighbour has no region state yet: the overview falls back to the generated km.
    const neighbourId = regionAt(world, home).neighbours[0].id;
    const untouchedSpot = regionAt(world, neighbourId).spots.find((s) => s.id !== "camp");
    expect(untouchedSpot).toBeDefined();
    expect(neighbourId in state.regions).toBe(false);
    const untouchedHtml = regionHtml(state, world, cal, { ...newUiState(), selected: neighbourId });
    expect(untouchedHtml).toContain(`${fmtKm(untouchedSpot!.km)} from camp`);

    // Move home's camp, then step into the neighbour region and read home's overview from there:
    // the distance shown is live (from the moved camp), not the stale generated s.km.
    const spot = regionAt(world, home).spots.find((s) => s.id !== "camp");
    expect(spot).toBeDefined();
    const next = neighbourLandCell(world, st.campCell);
    st.campCell = next;
    placeAt(state, world, regionAt(world, neighbourId).campCell);
    expect(state.player.region).toBe(neighbourId);
    const html = regionHtml(state, world, cal, { ...newUiState(), selected: home });
    const liveKm = kmBetween(world, next, spot!.cell);
    expect(liveKm).not.toBeNull();
    expect(html).toContain(`${fmtKm(liveKm!)} from camp`);
  });
});

describe("walkTarget resolves the live camp, not the generated one", () => {
  it("a region's camp and the current region's own 'camp' spot both follow a move", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    const st = regionState(state, world, home);
    const generatedHome = st.campCell;
    const next = neighbourLandCell(world, generatedHome);
    st.campCell = next;
    // The current region's own camp spot, addressed as "spot:camp".
    expect(walkTarget(state, world, "spot:camp")?.cell).toBe(next);
    expect(walkTarget(state, world, "spot:camp")?.cell).not.toBe(generatedHome);

    // A neighbour's camp, addressed as "region:<id>" - touch it first so it has its own state.
    const neighbourId = regionAt(world, home).neighbours[0].id;
    const nSt = regionState(state, world, neighbourId);
    const generatedNeighbour = nSt.campCell;
    const nNext = neighbourLandCell(world, generatedNeighbour);
    nSt.campCell = nNext;
    expect(walkTarget(state, world, `region:${neighbourId}`)?.cell).toBe(nNext);
    expect(walkTarget(state, world, `region:${neighbourId}`)?.cell).not.toBe(generatedNeighbour);
  });
});

describe("regionHtml's here list marks 'you are here' at the moved camp", () => {
  it("matches the live camp cell, not the cell RegionDef.spots generated for it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
    const next = neighbourLandCell(world, generated);
    st.campCell = next;
    const cal = calendar(state.minute, state.startDoy);

    placeAt(state, world, next);
    expect(regionHtml(state, world, cal, newUiState())).toContain("you are here");

    // Standing on the old, now unremarkable, generated cell is no longer "here" for the camp row.
    placeAt(state, world, generated);
    expect(regionHtml(state, world, cal, newUiState())).not.toContain("you are here");
  });
});

describe("make camp here", () => {
  it("is not offered on the camp cell, is offered one land cell away, moves the camp on completion and logs it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(false);
    const next = neighbourLandCell(world, st.campCell);
    placeAt(state, world, next);
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(true);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "makeCamp")).toBe(true);
    advance(state, world, 25);
    expect(st.campCell).toBe(next);
    expect(state.log.some((e) => e.text === "You make camp here.")).toBe(true);
  });

  it("names why it cannot start: a structure at the old camp, or a loose pile there", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const next = neighbourLandCell(world, st.campCell);
    placeAt(state, world, next);
    const cal = calendar(state.minute, state.startDoy);
    st.structures.firePit = true;
    expect(availableTasks(state, world, cal).find((o) => o.id === "makeCamp")).toEqual(
      expect.objectContaining({ ok: false, why: "the fire pit stands there" }),
    );
    st.structures.firePit = false;
    addItem(pile(state, st.campCell), "stick", 30);
    expect(availableTasks(state, world, cal).find((o) => o.id === "makeCamp")!.ok).toBe(false);
    removeItem(pile(state, st.campCell), "stick", 30);
    expect(availableTasks(state, world, cal).find((o) => o.id === "makeCamp")!.ok).toBe(true);
  });

  it("a live intent's camp follows the move", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
    addOrder(state, world, { task: "sticks", until: { kind: "campHas", qty: 100 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 1);
    expect(state.intent).not.toBeNull();

    const next = neighbourLandCell(world, generated);
    placeAt(state, world, next);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 25);
    expect(st.campCell).toBe(next);
    expect(state.intent!.campCell).toBe(next);
  });

  it("queued, binds the cell the click meant, and walks back to it even after the survivor moves on before the order starts", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const clicked = neighbourLandCell(world, st.campCell);
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
    expect(st.campCell).toBe(clicked);
  });

  it("reads 'making camp' while it runs, not the raw task id with the site's identifier", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const next = neighbourLandCell(world, st.campCell);
    placeAt(state, world, next);
    addOrder(state, world, { task: "makeCamp", until: { kind: "once" }, deliver: "leave", where: { cell: next } }, "job");
    advance(state, world, 1);
    expect(state.intent).not.toBeNull();
    expect(state.intent!.step).toBe("making camp");
  });

  it("the greyed row at camp has no clickable queue path", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, newUiState());
    expect(html).toContain("this is the camp");
    expect(html).not.toMatch(/data-act="intent"\s+data-id="makeCamp"/);
  });
});

describe("the site report", () => {
  it("lists every spot but camp with walk minutes, and carries no terrain or ices field", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const r = siteReport(state, world, st.campCell);
    const region = regionAt(world, state.player.region);
    expect(r.spots.map((s) => s.id).sort()).toEqual(region.spots.filter((s) => s.id !== "camp").map((s) => s.id).sort());
    expect(r.spots.some((s) => s.minutes !== null && s.minutes > 0)).toBe(true);
    expect(r).not.toHaveProperty("terrain");
    expect(r).not.toHaveProperty("ices");
  });

  it("siteLine names each spot once with its bare minutes, one 'min' for the whole line", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const r = siteReport(state, world, st.campCell);
    const line = siteLine(r);
    for (const s of r.spots) expect(line).toContain(s.id);
    expect(line).not.toContain("ices over in winter");
    expect(line.endsWith(" min")).toBe(true);
    expect(line.match(/ min/g)).toHaveLength(1);
  });

  it("shows in the region panel off the camp cell, and not on it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    expect(regionHtml(state, world, cal, newUiState())).not.toContain("as a camp");
    const next = neighbourLandCell(world, st.campCell);
    placeAt(state, world, next);
    expect(regionHtml(state, world, cal, newUiState())).toContain("as a camp");
  });

  it("names why a move is blocked beside what the cell offers as a camp", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const next = neighbourLandCell(world, st.campCell);
    placeAt(state, world, next);
    const cal = calendar(state.minute, state.startDoy);
    st.fire.fuelKg = 2;
    const html = regionHtml(state, world, cal, newUiState());
    expect(html).toContain("as a camp");
    expect(html).toContain("the fire is banked there");
  });
});

describe("checking travel to a neighbour touches no region state", () => {
  it("availableTasks's every-neighbour travel check does not grow state.regions", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(Object.keys(state.regions).length).toBe(1);
    availableTasks(state, world, cal);
    expect(Object.keys(state.regions).length).toBe(1);
  });

  it("whereIs reading a neighbour's camp cell does not touch its state either", () => {
    const { state, world } = newGame(17);
    expect(Object.keys(state.regions).length).toBe(1);
    const neighbourId = regionAt(world, state.player.region).neighbours[0].id;
    const neighbourCamp = regionAt(world, neighbourId).campCell;
    whereIs(state, world, neighbourCamp);
    expect(Object.keys(state.regions).length).toBe(1);
  });
});

describe("the Here list never doubles up when the camp sits on another spot's cell", () => {
  it("shows one 'you are here' row once the camp is moved onto the forest spot's own cell", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const forest = regionAt(world, state.player.region).spots.find((s) => s.id === "forest")!;
    st.campCell = forest.cell;
    placeAt(state, world, forest.cell);
    const cal = calendar(state.minute, state.startDoy);
    const html = regionHtml(state, world, cal, newUiState());
    expect(html.match(/you are here/g)).toHaveLength(1);
  });
});

describe("the site report crosses the ice the walk buttons cross", () => {
  it("routes at walkableIce(state.weather), not a flat 'none' - seed 45's outcrop is six cells over safe ice, eight around it", () => {
    const { state, world } = newGame(45);
    const st = regionState(state, world, state.player.region);
    const region = regionAt(world, state.player.region);
    const outcrop = region.spots.find((s) => s.id === "outcrop")!;

    // The land-only route this spot would take without ice, for contrast.
    const landRoute = findRoute(world, st.campCell, outcrop.cell, "none");
    expect(landRoute).not.toBeNull();

    state.weather.iceCm = ICE_SAFE_CM + 1;
    const ice = walkableIce(state.weather);
    expect(ice).toBe("safe");
    const iceRoute = findRoute(world, st.campCell, outcrop.cell, ice);
    expect(iceRoute).not.toBeNull();
    expect(iceRoute!.length).toBeLessThan(landRoute!.length);

    const cal = calendar(state.minute, state.startDoy);
    const speed = baseWalkSpeed(state, cal, state.weather);
    const expected = Math.round(routeMinutes(world, iceRoute!, speed, ice));
    const r = siteReport(state, world, st.campCell);
    expect(r.spots.find((s) => s.id === "outcrop")!.minutes).toBe(expected);
  });
});

describe("the map marks the camp", () => {
  it("draws x until a fire or shelter glyph takes the cell, and follows a move", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = newUiState();
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
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

