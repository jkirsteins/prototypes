// @vitest-environment happy-dom
import { newKnowledge } from "../src/sim/fineknowledge";
import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { levelAt } from "../src/ui/map";
import { board, glyphsWith, type MapModel } from "./board";
import { enqueueWildlifeStartle, newUiState, resetPanels } from "../src/ui/render";
import { cellAt, neighbours, type World } from "../src/world/gen";
import type { GameState } from "../src/sim/types";
import { visibleCells } from "../src/sim/sight";
import { passable } from "../src/world/route";
import { metricPointForStoredCell } from "../src/sim/wildlife-space";
import { PATCH_M, patchXY } from "../src/world/spatial";


function scene(zoom: number) {
  const { state, world } = newGame(79);
  activateWildlife(state, world, new Rng(1));
  const animal = state.wildlife.subjects.find((subject) => subject.active)!;
  for (const other of state.wildlife.subjects) if (other !== animal) other.active = null;
  animal.active!.cell = cellOf(state, world);
  const ui = newUiState();
  ui.zoom = zoom;
  const event: WildlifeStartleEvent = {
    id: "anchor-event-987654321", subjectId: animal.id,
    source: { xM: state.player.xM, yM: state.player.yM },
    bearingRad: 0, distanceM: 45, uncertaintyM: 0,
    perception: { kind: "seen", identification: "ungulate" },
    terrain: "pine", body: "light", group: "group", logText: "Hooves crash away.",
  };
  const draw = (now = 1100) => board(world, state, ui, calendar(state.minute, state.startDoy), now);
  return { state, world, animal, ui, event, draw };
}

/** Where the animal is drawn - its mark at the closest rung, its glyph at the block rungs - and whether it is recoiling. */
function drawnAnimal(b: MapModel, id: number, zoom: number) {
  const level = levelAt(zoom);
  const mark = b.marks.find((m) => m.id === id);
  if (mark) return { x: mark.x, top: mark.y - level.line / 2, recoil: mark.recoilAt };
  const glyph = b.glyphs.find((g) => g.wildlifeId === id);
  if (!glyph) return null;
  return { x: (glyph.gx + 0.5) * level.px, top: glyph.gy * level.line, recoil: glyph.wildlifeStart };
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

describe("wildlife cue anchors", () => {
  it.each([0, 1, 2])("anchors seen cues above the visible animal after escape at zoom %i", (zoom) => {
    const { state, world, animal, ui, event, draw } = scene(zoom);
    // The event records the original shared cell. Immediate escape has already
    // moved the animal before the next map render.
    animal.active!.cell = patchOfOwnGlyph(state, world, zoom);
    animal.active!.position = metricPointForStoredCell(state.seed, animal.id, animal.active!.cell)!;
    enqueueWildlifeStartle(ui, event, 1000);
    const b = draw();
    const box = drawnAnimal(b, animal.id, zoom)!;
    const cue = b.startles.find((c) => c.kind === "seen")!;
    expect(cue.x).toBeCloseTo(box.x);
    expect(cue.y + 18).toBeLessThanOrEqual(box.top + 1e-6);
    expect(box.recoil).toBe(1000);
  });

  // Only the closest rung draws a herd's own metre position; at the block
  // rungs a glyph holds one mark and the survivor's owns it, so an animal on
  // their patch is named in the tooltip rather than drawn over them.
  it("uses the animal's exact position when it shares ground with the player", () => {
    const zoom = 0;
    const { state, animal, ui, event, draw } = scene(zoom);
    animal.active!.intent = "rest";
    animal.active!.position = { xM: state.player.xM, yM: state.player.yM };
    enqueueWildlifeStartle(ui, event, 1000);
    const b = draw();
    const box = drawnAnimal(b, animal.id, zoom)!;
    const cue = b.startles.find((c) => c.kind === "seen")!;
    expect(cue.x).toBeCloseTo(box.x);
    expect(cue.y + 18).toBeLessThanOrEqual(box.top + 1e-6);
  });

  it.each(["heard", "seen"] as const)("projects an unrendered %s source inside its own patch without disclosing identity", (kind) => {
    const { state, animal, ui, event, draw } = scene(0);
    animal.active = null;
    state.knowledge = newKnowledge();
    event.subjectId = 987654321;
    event.source = { xM: (Math.floor(state.player.xM / PATCH_M) + 0.2) * PATCH_M, yM: (Math.floor(state.player.yM / PATCH_M) + 0.75) * PATCH_M };
    event.perception = kind === "seen" ? { kind, identification: "unknown" } : { kind, identification: "unknown", uncertaintyM: 0 };
    enqueueWildlifeStartle(ui, event, 1000);
    const b = draw();
    const cue = b.startles[0];
    expect(cue.x).toBeCloseTo(398.2);
    expect(cue.y).toBeCloseTo(237.5);
    expect(glyphsWith(b, "mk-animal")).toHaveLength(0);
    expect(b.marks).toHaveLength(0);
    expect(JSON.stringify(b)).not.toContain("987654321");
    ui.zoom = 1;
    const zoomed = draw(1400).startles[0];
    expect(zoomed.key).toBe(cue.key);
    expect(zoomed.startedAtMs).toBe(1000);
  });

  it("keeps a heard cue at its perceived source even if the subject also has a visible glyph", () => {
    const { state, world, animal, ui, event, draw } = scene(0);
    animal.active!.cell = patchOfOwnGlyph(state, world, 0);
    event.source = { xM: (Math.floor(state.player.xM / PATCH_M) + 0.2) * PATCH_M, yM: (Math.floor(state.player.yM / PATCH_M) + 0.75) * PATCH_M };
    event.perception = { kind: "heard", identification: "unknown", uncertaintyM: 0 };
    enqueueWildlifeStartle(ui, event, 1000);
    const b = draw();
    const shown = drawnAnimal(b, animal.id, 0);
    expect(shown).not.toBeNull();
    expect(shown?.recoil).toBeUndefined();
    const cue = b.startles[0];
    expect(cue.x).toBeCloseTo(398.2);
    expect(cue.y).toBeCloseTo(237.5);
  });

  it("keeps an animal's mark, under the same id, when its exact position crosses a cell boundary", () => {
    const { state, world, animal, draw } = scene(0);
    const mark = draw().marks.find((m) => m.id === animal.id)!;
    expect(mark).toBeDefined();
    const next = neighbours(world, animal.active!.cell).find((cell) =>
      passable(cellAt(world, cell).terrain) && cellAt(world, cell).region === state.player.region)!;
    animal.active!.cell = next;
    animal.active!.position = metricPointForStoredCell(state.seed, animal.id, next)!;
    // The same mark, moved: the effects layer slides it by id (map.ts, drawMarks).
    const moved = draw().marks.find((m) => m.id === animal.id)!;
    expect(moved).toBeDefined();
    expect(moved.x).not.toBe(mark.x);
  });
});
