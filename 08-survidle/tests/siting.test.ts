import { describe, expect, it } from "vitest";
import { canMoveCamp } from "../src/sim/camp";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, removeItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { atCamp, campCellOf, describeWhere, kmBetween, placeAt, spotHere, SPOT_WORDS } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { whereIs } from "../src/sim/tasks";
import { regionHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { fmtKm } from "../src/units";
import { regionAt } from "../src/world/gen";
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
