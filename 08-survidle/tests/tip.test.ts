/**
 * The map says what is under the pointer.
 *
 * Across two runs he found no use for the map, and when told it was not
 * meant to be flavour he answered: "well then the map could definitely
 * benefit from interaction." A tooltip is the genre's answer, and it is
 * also the only carrier for the half of the region panel that was
 * genuinely about one cell rather than about sixteen square kilometres.
 *
 * The rules it must not break are in section 11 of the overhaul spec: the
 * hovered cell is derived from where the pointer is rather than from a
 * glyph's enter and leave, and no coordinate ever enters the markup.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { isKnown, mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { seeFrom } from "../src/sim/sight";
import { siteCamp } from "./siting-helpers";
import { campCellOf, cellOf } from "../src/sim/position";
import { cellFromClient, cellFromPoint, levelAt, viewOrigin } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { tipHtml, tipKey } from "../src/ui/tip";
import { cellAt, regionAt } from "../src/world/gen";

/** The point at the middle of the glyph holding this cell, in the board's own pixels. */
function pointOf(world: ReturnType<typeof newGame>["world"], state: ReturnType<typeof newGame>["state"], ui: ReturnType<typeof newUiState>, cell: number) {
  const l = levelAt(ui.zoom);
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  return { x: ((x - x0) / l.cells) * l.px + l.px / 2, y: ((y - y0) / l.cells) * l.line + l.line / 2 };
}

describe("finding the cell under the pointer", () => {
  const { state, world } = newGame(21);
  const ui = newUiState();

  it("a point on the board resolves to a cell", () => {
    expect(cellFromPoint(world, state, ui, 5, 5)).not.toBeNull();
  });

  it("the middle glyph is the one the survivor stands on", () => {
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    expect(cellFromPoint(world, state, ui, p.x, p.y)).toBe(here);
  });

  it("subtracts a centered grid's screen offset before resolving a cell", () => {
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    expect(cellFromClient(world, state, ui, p.x + 137, p.y + 41, { left: 137, top: 41 })).toBe(here);
  });

  it("a point off the board resolves to nothing rather than to cell zero", () => {
    expect(cellFromPoint(world, state, ui, -50, -50)).toBeNull();
    const l = levelAt(ui.zoom);
    expect(cellFromPoint(world, state, ui, l.w * l.px + 40, 5)).toBeNull();
  });

  it("it reads the pointer's position, so nothing is needed on a glyph", () => {
    // A glyph replaced under the pointer fires an enter and a glyph detached
    // under it never fires a leave, so hover state kept per element gets
    // stuck. There is no per-glyph attribute to go stale here.
    const a = cellFromPoint(world, state, ui, 30, 30);
    expect(cellFromPoint(world, state, ui, 30, 30)).toBe(a);
  });
});

describe("what the tooltip says", () => {
  it("unwalked ground in this region says so and nothing else", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // A survivor lands on ground they can read, so the whole home region
    // starts known: the map is wound back to what an eye at the landing
    // takes in, which is what leaves any of it unwalked to point at.
    const home = regionAt(world, state.player.region);
    for (const k of Object.keys(state.mapped)) delete state.mapped[Number(k)];
    seeFrom(state, world, cal, cellOf(state, world));
    // In this region: ground over a border is somewhere to go rather than
    // somewhere unseen, and says so instead.
    const unseen = home.cells.find((c) => !isKnown(state, c));
    expect(unseen).toBeDefined();
    expect(tipHtml(state, world, cal, unseen!)).toMatch(/never|not been|unknown/i);
  });

  it("known ground names its terrain and how far it is", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    siteCamp(state, world);
    const camp = campCellOf(state, world)!;
    markKnown(state, camp);
    const html = tipHtml(state, world, cal, camp);
    expect(html).toMatch(/km|\bm\b|here/);
  });

  it("a cell you can walk to carries the walk, so a tap can act without a second gesture", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // A walk is only offered over ground the survivor knows, so the whole
    // region is known here: what is under test is the button, not the fog.
    mapRegion(state, world, state.player.region);
    const near = cellOf(state, world) + 2;
    expect(tipHtml(state, world, cal, near)).toContain('data-act="task"');
  });

  it("uses the selected route format without changing the heading", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    mapRegion(state, world, state.player.region);
    const near = cellOf(state, world) + 2;
    const distance = tipHtml(state, world, cal, near, "distance");
    const time = tipHtml(state, world, cal, near, "time");
    const both = tipHtml(state, world, cal, near, "both");
    expect(distance).toMatch(/class="tip-route"[^>]*>\d+\.\d km<\/button>/);
    expect(time).toMatch(/class="tip-route"[^>]*>(?:\d+ h )?\d+ min<\/button>/);
    expect(both).toMatch(/class="tip-route"[^>]*>\d+\.\d km, (?:\d+ h )?\d+ min<\/button>/);
    expect(distance.match(/<div class="tiphead">.*?<\/div>/)?.[0]).toBe(time.match(/<div class="tiphead">.*?<\/div>/)?.[0]);
  });

  it("a cell in this region with no way to it says why instead of a button that would fail", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // Somewhere in the home region the survivor has seen but cannot reach.
    const home = regionAt(world, state.player.region);
    const far = home.cells.find((c) => cellAt(world, c).terrain === "water");
    expect(far).toBeDefined();
    markKnown(state, far!);
    const html = tipHtml(state, world, cal, far!);
    expect(html).not.toContain('data-id="walk"');
    expect(html).toMatch(/no way|too far|cannot|water/i);
  });

  it("ground in another region offers the way in, not a walk that would stop at the border", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const nb = regionAt(world, state.player.region).neighbours[0].id;
    const cell = regionAt(world, nb).cells[0];
    // This is what puts the regions on the map: point at one and it says how
    // to get in, rather than naming it in a list beside the map.
    const html = tipHtml(state, world, cal, cell);
    expect(html).toContain(regionAt(world, nb).name);
    expect(html).toMatch(/Explore|Go to|know no way|cannot/);
    expect(html).not.toContain('data-id="walk"');
  });

  it("a hover tooltip has no redundant close button", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    expect(tipHtml(state, world, cal, here)).not.toContain('data-act="tip-close"');
  });

  it("what is lying there is named, since a pile is a resource until it is forgotten", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    siteCamp(state, world);
    const camp = campCellOf(state, world)!;
    markKnown(state, camp);
    addItem(pile(state, camp), "firewood", 20);
    expect(tipHtml(state, world, cal, camp)).toMatch(/20(\.0)? kg/);
  });

  it("it omits generated camp-to-spot estimates", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    const away = here + 3;
    markKnown(state, away);
    expect(tipHtml(state, world, cal, away)).not.toMatch(/as a camp/i);
  });

  it("no coordinate is in the markup", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    // A pointer moves many times a second. Coordinates in the panel string
    // would change that string on every move and put the redraw budget
    // through the floor; bars.ts writes the position onto the element.
    const html = tipHtml(state, world, cal, here);
    expect(html).not.toMatch(/style="[^"]*(left|top):/);
  });
});

describe("the tooltip's key", () => {
  it("is the same for the same cell, so a still pointer redraws nothing", () => {
    const { state, world } = newGame(21);
    const here = cellOf(state, world);
    expect(tipKey(state, world, here)).toBe(tipKey(state, world, here));
  });

  it("differs between cells, so moving to a new one redraws once", () => {
    const { state, world } = newGame(21);
    const here = cellOf(state, world);
    expect(tipKey(state, world, here)).not.toBe(tipKey(state, world, here + 5));
  });

  it("changes when the pile under it changes, so a heap picked up stops being advertised", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const camp = campCellOf(state, world)!;
    const before = tipKey(state, world, camp);
    addItem(pile(state, camp), "firewood", 5);
    expect(tipKey(state, world, camp)).not.toBe(before);
  });
});
