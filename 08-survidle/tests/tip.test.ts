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
import { mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { campCellOf, cellOf } from "../src/sim/position";
import { cellFromPoint, levelAt, viewOrigin } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { tipHtml, tipKey } from "../src/ui/tip";
import { cellIdx } from "../src/world/gen";

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
  it("ground nobody has walked says so and nothing else", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // Somewhere far enough to be unvisited on day one.
    const far = cellIdx(world, world.w - 2, world.h - 2);
    const html = tipHtml(state, world, cal, far);
    expect(html).toMatch(/never|not been|unknown/i);
  });

  it("known ground names its terrain and how far it is", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const camp = campCellOf(state, world);
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

  it("a cell with no way to it says why instead of offering a button that would fail", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const far = cellIdx(world, world.w - 2, world.h - 2);
    markKnown(state, far);
    const html = tipHtml(state, world, cal, far);
    expect(html).not.toContain('data-act="task"');
    expect(html).toMatch(/no way|too far|cannot|do not know/i);
  });

  it("it carries a close, because a touch device has no way to stop hovering", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    expect(tipHtml(state, world, cal, here)).toContain('data-act="tip-close"');
  });

  it("what is lying there is named, since a pile is a resource until it is forgotten", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const camp = campCellOf(state, world);
    markKnown(state, camp);
    addItem(pile(state, camp), "firewood", 20);
    expect(tipHtml(state, world, cal, camp)).toMatch(/20(\.0)? kg/);
  });

  it("it says what the cell would be as a camp, which is the lever he never knew he had", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const here = cellOf(state, world);
    const away = here + 3;
    markKnown(state, away);
    // He took the landing camp as given, twice, and paid a 2.4 km each-way
    // walk for sticks. Siting is a lever, and nothing ever said so.
    expect(tipHtml(state, world, cal, away)).toMatch(/as a camp/i);
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
    const camp = campCellOf(state, world);
    const before = tipKey(state, world, camp);
    addItem(pile(state, camp), "firewood", 5);
    expect(tipKey(state, world, camp)).not.toBe(before);
  });
});
