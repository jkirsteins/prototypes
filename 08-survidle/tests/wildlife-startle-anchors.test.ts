// @vitest-environment happy-dom
import { newKnowledge } from "../src/sim/fineknowledge";
import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { levelAt, mapHtml } from "../src/ui/map";
import { enqueueWildlifeStartle, newUiState, resetPanels, setPanel } from "../src/ui/render";
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
  const draw = (now = 1100) => setPanel("mapdyn", mapHtml(world, state, ui, calendar(state.minute, state.startDoy), now));
  return { state, world, animal, ui, event, draw };
}

/** Read the glyph's layout rather than guessing its slot from simulation state. */
function glyphBox(glyph: HTMLElement, zoom: number) {
  const level = levelAt(zoom);
  if (glyph.classList.contains("wildlife-map-mark")) return {
    x: Number.parseFloat(glyph.style.getPropertyValue("--animal-x")),
    top: Number.parseFloat(glyph.style.getPropertyValue("--animal-y")) - level.line / 2,
  };
  const cell = glyph.closest<HTMLElement>(".c")!;
  return {
    x: (Number(cell.dataset.mapX) + 0.5) * level.px,
    top: Number(cell.dataset.mapY) * level.line,
  };
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
    draw();
    const glyph = document.querySelector<HTMLElement>(`[data-wildlife-id="${animal.id}"]`)!;
    const cue = document.querySelector<HTMLElement>(".wildlife-startle.seen")!;
    const box = glyphBox(glyph, zoom);
    expect(Number.parseFloat(cue.style.left)).toBeCloseTo(box.x);
    expect(Number.parseFloat(cue.style.top) + 18).toBeLessThanOrEqual(box.top + 1e-6);
    expect(cue.parentElement?.classList.contains("grid")).toBe(true);
    expect(glyph.classList.contains("wildlife-recoil")).toBe(true);
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
    draw();
    const glyph = document.querySelector<HTMLElement>(`[data-wildlife-id="${animal.id}"]`)!;
    const cue = document.querySelector<HTMLElement>(".wildlife-startle.seen")!;
    expect(Number.parseFloat(cue.style.left)).toBeCloseTo(glyphBox(glyph, zoom).x);
    expect(Number.parseFloat(cue.style.top) + 18).toBeLessThanOrEqual(glyphBox(glyph, zoom).top + 1e-6);
  });

  it.each(["heard", "seen"] as const)("projects an unrendered %s source inside its own patch without disclosing identity", (kind) => {
    const { state, animal, ui, event, draw } = scene(0);
    animal.active = null;
    state.knowledge = newKnowledge();
    event.subjectId = 987654321;
    event.source = { xM: (Math.floor(state.player.xM / PATCH_M) + 0.2) * PATCH_M, yM: (Math.floor(state.player.yM / PATCH_M) + 0.75) * PATCH_M };
    event.perception = kind === "seen" ? { kind, identification: "unknown" } : { kind, identification: "unknown", uncertaintyM: 0 };
    enqueueWildlifeStartle(ui, event, 1000);
    draw();
    const cue = document.querySelector<HTMLElement>(".wildlife-startle")!;
    expect(Number.parseFloat(cue.style.left)).toBeCloseTo(398.2);
    expect(Number.parseFloat(cue.style.top)).toBeCloseTo(237.5);
    expect(document.querySelector(".mk-animal")).toBeNull();
    expect(document.body.innerHTML).not.toContain("987654321");
    const key = cue.dataset.startle;
    ui.zoom = 1;
    draw(1400);
    const zoomed = document.querySelector<HTMLElement>(".wildlife-startle")!;
    expect(zoomed).toBe(cue);
    expect(zoomed.dataset.startle).toBe(key);
    expect(zoomed.style.getPropertyValue("--wildlife-start")).toBe("1000ms");
  });

  it("keeps a heard cue at its perceived source even if the subject also has a visible glyph", () => {
    const { state, world, animal, ui, event, draw } = scene(0);
    animal.active!.cell = patchOfOwnGlyph(state, world, 0);
    event.source = { xM: (Math.floor(state.player.xM / PATCH_M) + 0.2) * PATCH_M, yM: (Math.floor(state.player.yM / PATCH_M) + 0.75) * PATCH_M };
    event.perception = { kind: "heard", identification: "unknown", uncertaintyM: 0 };
    enqueueWildlifeStartle(ui, event, 1000);
    draw();
    expect(document.querySelector(`[data-wildlife-id="${animal.id}"]`)).not.toBeNull();
    expect(document.querySelector(".wildlife-recoil")).toBeNull();
    const cue = document.querySelector<HTMLElement>(".wildlife-startle")!;
    expect(Number.parseFloat(cue.style.left)).toBeCloseTo(398.2);
    expect(Number.parseFloat(cue.style.top)).toBeCloseTo(237.5);
    expect(cue.hasAttribute("data-wildlife-id")).toBe(false);
  });

  it("preserves an animal node when its exact position crosses a cell boundary", () => {
    const { state, world, animal, draw } = scene(0);
    draw();
    const glyph = document.querySelector<HTMLElement>(`[data-wildlife-id="${animal.id}"]`)!;
    const x = glyph.style.getPropertyValue("--animal-x");
    const next = neighbours(world, animal.active!.cell).find((cell) =>
      passable(cellAt(world, cell).terrain) && cellAt(world, cell).region === state.player.region)!;
    animal.active!.cell = next;
    animal.active!.position = metricPointForStoredCell(state.seed, animal.id, next)!;
    draw();
    const moved = document.querySelector<HTMLElement>(`[data-wildlife-id="${animal.id}"]`)!;
    expect(moved.style.getPropertyValue("--animal-x")).not.toBe(x);
    expect(moved).toBe(glyph);
  });
});
