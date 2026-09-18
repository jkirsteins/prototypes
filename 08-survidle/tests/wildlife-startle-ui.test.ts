// @vitest-environment happy-dom
import { encodeKnowledge, newKnowledge } from "../src/sim/fineknowledge";
import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { DEFAULT_ZOOM, levelAt, mapKey, mapViewportBounds, viewOrigin } from "../src/ui/map";
import { board, glyphOfCell, glyphsWith } from "./board";
import { enqueueWildlifeStartle, newUiState, resetPanels } from "../src/ui/render";
import { cellAt, type World } from "../src/world/gen";
import type { GameState } from "../src/sim/types";
import { visibleCells } from "../src/sim/sight";
import { passable } from "../src/world/route";
import { readFileSync } from "node:fs";
import { PATCH_M, patchXY } from "../src/world/spatial";


function scene() {
  const { state, world } = newGame(79);
  const ui = newUiState();
  ui.zoom = DEFAULT_ZOOM;
  const cal = calendar(state.minute, state.startDoy);
  const event: WildlifeStartleEvent = {
    id: "hidden-subject-987654321:episode-1", subjectId: 987654321,
    source: { xM: (Math.floor(state.player.xM / PATCH_M) + 5.5) * PATCH_M, yM: (Math.floor(state.player.yM / PATCH_M) + 0.5) * PATCH_M },
    bearingRad: 0, distanceM: 1500, uncertaintyM: 40,
    perception: { kind: "heard", identification: "unknown", uncertaintyM: 40 },
    terrain: "spruce", body: "light", group: "group", logText: "Something crashes away.",
  };
  return { state, world, ui, cal, event };
}

beforeEach(() => {
  resetPanels();
  document.body.innerHTML = '<div id="mapdyn"></div>';
});

/**
 * A patch the map draws as its own glyph at this rung, and one the survivor can
 * actually see. Two things changed under this fixture at once: a neighbour 50 m
 * off falls inside the survivor's own block at every rung but the closest, and
 * that block's one mark is the survivor's, so the animal would never be drawn;
 * and sight is a set of rays over 50 m patches, so which ground is visible is
 * a shape, not a radius. The animal stands on the nearest visible patch that
 * owns its glyph.
 */
function patchOfOwnGlyph(state: GameState, world: World, zoom: number): number {
  const here = cellOf(state, world);
  const span = levelAt(zoom).finePerGlyph;
  const block = (patch: number) => {
    const { x, y } = patchXY(patch);
    return `${Math.floor(x / span)},${Math.floor(y / span)}`;
  };
  const mine = block(here);
  const cal = calendar(state.minute, state.startDoy);
  const origin = patchXY(here);
  const seen = [...visibleCells(state, world, cal, here)]
    .filter((patch) => block(patch) !== mine && passable(cellAt(world, patch).terrain))
    .sort((a, b) => {
      const pa = patchXY(a);
      const pb = patchXY(b);
      return (pa.x - origin.x) ** 2 + (pa.y - origin.y) ** 2 - ((pb.x - origin.x) ** 2 + (pb.y - origin.y) ** 2);
    });
  if (seen.length === 0) throw new Error(`nothing visible owns its own glyph at zoom ${zoom}`);
  return seen[0];
}

describe("transient wildlife map cues", () => {
  it("adds one non-identifying cue over hidden ground, preserves map knowledge, and expires after 1200 ms", () => {
    const { state, world, ui, cal, event } = scene();
    state.knowledge = newKnowledge();
    const before = JSON.stringify(state) + encodeKnowledge(state.knowledge);
    enqueueWildlifeStartle(ui, event, 1000);
    const b = board(world, state, ui, cal, 1100);
    expect(b.startles).toHaveLength(1);
    const cue = b.startles[0];
    expect(cue.kind).toBe("heard");
    // The glyph the source falls in is a block of patches, and its cell
    // names the block's first patch rather than the source's own.
    const level = levelAt(ui.zoom);
    const origin = viewOrigin(state, world, ui.zoom);
    const gx = Math.floor((Math.floor(event.source.xM / PATCH_M) - origin.x0) / level.finePerGlyph);
    const gy = Math.floor((Math.floor(event.source.yM / PATCH_M) - origin.y0) / level.finePerGlyph);
    const blockCell = (origin.y0 + gy * level.finePerGlyph) * world.w + origin.x0 + gx * level.finePerGlyph;
    expect(glyphOfCell(b, blockCell)?.classes).toContain("fog");
    expect(glyphsWith(b, "mk-animal")).toHaveLength(0);
    // Nothing on the board names the hidden subject.
    expect(JSON.stringify(b)).not.toContain(String(event.subjectId));
    expect(JSON.stringify(b)).not.toContain(event.id);
    expect(JSON.stringify(state) + encodeKnowledge(state.knowledge)).toBe(before);
    expect(board(world, state, ui, cal, 2200).startles).toHaveLength(0);
    expect(ui.wildlifeStartles).toHaveLength(0);
  });

  it("ignores duplicate herd events, including after expiry, and changes the map key only at onset and expiry", () => {
    const { state, world, ui, cal, event } = scene();
    const initial = mapKey(state, world, ui, cal, 1000);
    expect(enqueueWildlifeStartle(ui, event, 1000)).toBe(true);
    expect(enqueueWildlifeStartle(ui, event, 1100)).toBe(false);
    const active = mapKey(state, world, ui, cal, 1100);
    expect(active).not.toBe(initial);
    expect(mapKey(state, world, ui, cal, 1800)).toBe(active);
    expect(board(world, state, ui, cal, 1800).startles.filter((cue) => cue.kind === "heard")).toHaveLength(1);
    expect(mapKey(state, world, ui, cal, 2200)).toBe(initial);
    expect(enqueueWildlifeStartle(ui, event, 2300)).toBe(false);
  });

  it.each([0, 1, DEFAULT_ZOOM])("preserves the player glyph and original animation start from zoom %i", (zoom) => {
    const { state, world, ui, cal, event } = scene();
    ui.zoom = zoom;
    event.source = { xM: state.player.xM, yM: state.player.yM };
    enqueueWildlifeStartle(ui, event, 1000);
    let b = board(world, state, ui, cal, 1100);
    const first = b.startles[0];
    expect(first).toBeDefined();
    const player = glyphsWith(b, "mk-player")[0];
    expect(player.glyph).toBe("@");
    // Every rung draws one glyph per block and none inside it.
    expect(player.classes[0]).toBe("c");
    expect(first.startedAtMs).toBe(1000);
    b = board(world, state, ui, cal, 1500);
    expect(b.startles[0].key).toBe(first.key);
    expect(b.startles[0].startedAtMs).toBe(1000);
    ui.zoom = 3;
    b = board(world, state, ui, cal, 1800);
    expect(b.startles).toHaveLength(1);
    expect(b.startles[0].key).toBe(first.key);
    expect(b.startles[0].startedAtMs).toBe(1000);
    expect(glyphsWith(b, "mk-player")[0].glyph).toBe("@");
    expect(board(world, state, ui, cal, 2200).startles).toHaveLength(0);
  });

  it.each([0, 1, DEFAULT_ZOOM])("recoils a currently visible animal without replacing its glyph at zoom %i", (zoom) => {
    const { state, world, ui, cal, event } = scene();
    ui.zoom = zoom;
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.active!.cell = patchOfOwnGlyph(state, world, zoom);
    const cell = cellAt(world, subject.active!.cell);
    event.source = { xM: (cell.x + 0.5) * PATCH_M, yM: (cell.y + 0.5) * PATCH_M };
    event.subjectId = subject.id;
    event.perception = { kind: "seen", identification: "species" };
    // Only the closest rung carries the herd's own metre position, laid over
    // the grid; the block rungs put its letter on the glyph it stands in.
    const drawnAnimal = (b: ReturnType<typeof board>) => zoom === 0
      ? (() => { const m = b.marks.find((mark) => mark.id === subject.id); return m ? { glyph: m.glyph, recoil: m.recoilAt } : null; })()
      : (() => { const g = b.glyphs.find((glyph) => glyph.wildlifeId === subject.id); return g ? { glyph: g.glyph, recoil: g.wildlifeStart } : null; })();
    const original = drawnAnimal(board(world, state, ui, cal, 1000));
    expect(original?.glyph).toBeTruthy();
    expect(original?.recoil).toBeUndefined();
    enqueueWildlifeStartle(ui, event, 1000);
    const b = board(world, state, ui, cal, 1100);
    const animal = drawnAnimal(b);
    expect(animal?.glyph).toBe(original?.glyph);
    expect(animal?.recoil).toBe(1000);
    expect(b.startles.find((cue) => cue.kind === "seen")).toBeDefined();
    const heardUi = newUiState();
    heardUi.zoom = zoom;
    enqueueWildlifeStartle(heardUi, { ...event, perception: { kind: "heard", identification: "unknown", uncertaintyM: 40 } }, 1000);
    expect(drawnAnimal(board(world, state, heardUi, cal, 1100))?.recoil).toBeUndefined();
  });

  it("projects a distant event to one nearest edge cue with its bearing", () => {
    const { state, world, ui, cal, event } = scene();
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const level = levelAt(ui.zoom);
    event.source = { xM: (x0 + (level.w + 10) * level.finePerGlyph) * PATCH_M, yM: (y0 + 4.5 * level.finePerGlyph) * PATCH_M };
    event.uncertaintyM = 0;
    enqueueWildlifeStartle(ui, event, 1000);
    const cues = board(world, state, ui, cal, 1100).startles;
    expect(cues).toHaveLength(1);
    expect(cues[0].edge).toBe("east");
    expect(cues[0].x).toBe(768);
    expect(cues[0].y).toBe(38);
  });

  it("keeps cues inside a 300 by 160 clipped panel, including sources still inside the logical grid", () => {
    const { state, world, ui, cal, event } = scene();
    // The 792 by 504 grid is centered in a panel that clips all four sides.
    ui.mapViewport = mapViewportBounds(
      { left: 20, top: 60, right: 812, bottom: 564 },
      { left: 266, top: 232, right: 566, bottom: 392 },
    );
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const glyphPatches = levelAt(ui.zoom).finePerGlyph;
    event.source = { xM: (x0 + 68.5 * glyphPatches) * PATCH_M, yM: (y0 + 20.5 * glyphPatches) * PATCH_M };
    event.uncertaintyM = 0;
    enqueueWildlifeStartle(ui, event, 1000);
    const clipped = board(world, state, ui, cal, 1100).startles;
    expect(clipped).toHaveLength(1);
    expect(clipped[0].edge).toBe("east");
    expect(clipped[0].x).toBe(522);
    expect(clipped[0].y).toBe(262);
    const clippedKey = mapKey(state, world, ui, cal, 1100);
    ui.mapViewport = { left: 0, top: 0, right: 792, bottom: 504 };
    expect(mapKey(state, world, ui, cal, 1300)).not.toBe(clippedKey);
    const open = board(world, state, ui, cal, 1300).startles;
    expect(open[0].edge).toBeNull();
    expect(open[0].startedAtMs).toBe(1000);
  });

  it.each([
    { row: 0, top: 0, cueTop: "24px" },
    { row: 1, top: 64, cueTop: "88px" },
  ])("keeps the close-zoom row $row cue visible above a viewport starting at $top", ({ row, top, cueTop }) => {
    const { state, world, ui, cal, event } = scene();
    ui.zoom = 0;
    ui.mapViewport = { left: 0, top, right: 792, bottom: 504 };
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    // A source near the top of a patch is visible, but its raised cue needs
    // clamping to keep the pop and rise inside the viewport.
    event.source = { xM: (x0 + 6.5) * PATCH_M, yM: (y0 + row + 0.2) * PATCH_M };
    event.bearingRad = -Math.PI / 2;
    event.uncertaintyM = 0;
    enqueueWildlifeStartle(ui, event, 1000);
    const cues = board(world, state, ui, cal, 1100).startles;
    expect(cues).toHaveLength(1);
    expect(cues[0].edge).toBe("north");
    expect(cues[0].x).toBe(71.5);
    expect(cues[0].y).toBe(Number.parseFloat(cueTop));
    expect(cues[0].startedAtMs).toBe(1000);
  });

  it("keeps the cue above glyphs and weather and removes motion when reduced motion is requested", () => {
    // The cue is drawn by the effects layer after every glyph, mark and pulse
    // (map.ts, updateEffects), against the wall clock from the cue's own
    // start; under reduced motion it keeps the fade and drops the pop and the
    // rise, and the recoil is not drawn at all.
    const source = readFileSync("src/ui/map.ts", "utf8");
    const startles = source.slice(source.indexOf("function drawStartles("), source.indexOf("let pointedPatch"));
    expect(startles).toContain("cue.startedAtMs");
    expect(startles).toContain("frozen ? 0 :");
    const recoils = source.slice(source.indexOf("function drawRecoils("), source.indexOf("const markSlides"));
    expect(recoils).toContain("if (reducedMotionEffects()) return;");
  });
});
