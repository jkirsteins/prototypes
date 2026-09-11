// @vitest-environment happy-dom
import { encodeKnowledge, newKnowledge } from "../src/sim/fineknowledge";
import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { DEFAULT_ZOOM, levelAt, mapHtml, mapKey, mapViewportBounds, viewOrigin } from "../src/ui/map";
import { enqueueWildlifeStartle, newUiState, resetPanels, setPanel } from "../src/ui/render";
import { cellAt, neighbours } from "../src/world/gen";
import { passable } from "../src/world/route";
import { css, rule } from "./css";
import { PATCH_M } from "../src/world/spatial";


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

describe("transient wildlife map cues", () => {
  it("adds one non-identifying cue over hidden ground, preserves map knowledge, and expires after 1200 ms", () => {
    const { state, world, ui, cal, event } = scene();
    state.knowledge = newKnowledge();
    const before = JSON.stringify(state) + encodeKnowledge(state.knowledge);
    enqueueWildlifeStartle(ui, event, 1000);
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const cue = document.querySelector(".wildlife-startle")!;
    expect(cue?.className).toBe("wildlife-startle heard");
    // The glyph the source falls in is a block of patches, and its data-map-cell
    // names the block's first patch rather than the source's own.
    const level = levelAt(ui.zoom);
    const origin = viewOrigin(state, world, ui.zoom);
    const gx = Math.floor((Math.floor(event.source.xM / PATCH_M) - origin.x0) / level.finePerGlyph);
    const gy = Math.floor((Math.floor(event.source.yM / PATCH_M) - origin.y0) / level.finePerGlyph);
    const blockCell = (origin.y0 + gy * level.finePerGlyph) * world.w + origin.x0 + gx * level.finePerGlyph;
    expect(document.querySelector(`[data-map-cell="${blockCell}"]`)?.classList.contains("fog")).toBe(true);
    expect(cue?.parentElement?.classList.contains("grid")).toBe(true);
    expect(cue?.textContent).toBe("!");
    expect(cue?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".mk-animal")).toBeNull();
    expect(document.body.innerHTML).not.toContain(String(event.subjectId));
    expect(document.body.innerHTML).not.toContain(event.id);
    expect(JSON.stringify(state) + encodeKnowledge(state.knowledge)).toBe(before);
    expect(mapHtml(world, state, ui, cal, 2200)).not.toContain('class="wildlife-startle');
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
    expect(mapHtml(world, state, ui, cal, 1800).match(/class="wildlife-startle heard"/g)).toHaveLength(1);
    expect(mapKey(state, world, ui, cal, 2200)).toBe(initial);
    expect(enqueueWildlifeStartle(ui, event, 2300)).toBe(false);
  });

  it.each([0, 1, DEFAULT_ZOOM])("preserves the player glyph and original animation start from zoom %i", (zoom) => {
    const { state, world, ui, cal, event } = scene();
    ui.zoom = zoom;
    event.source = { xM: state.player.xM, yM: state.player.yM };
    enqueueWildlifeStartle(ui, event, 1000);
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const first = document.querySelector(".wildlife-startle")!;
    const player = document.querySelector(".mk-player")!;
    expect(first).not.toBeNull();
    expect(first.parentElement).toBe(player.closest(".grid"));
    expect(player.firstChild?.textContent).toBe("@");
    // Every rung draws one glyph per block and none inside it.
    expect(player.classList.contains("c")).toBe(true);
    expect(document.querySelectorAll(".micro-ground")).toHaveLength(0);
    expect(first.getAttribute("style")).toContain("--wildlife-start:1000ms");
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1500));
    expect(document.querySelector(".wildlife-startle")).toBe(first);
    ui.zoom = 3;
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1800));
    expect(document.querySelectorAll(".wildlife-startle")).toHaveLength(1);
    expect(document.querySelector(".wildlife-startle")?.getAttribute("style")).toContain("--wildlife-start:1000ms");
    expect(document.querySelector(".mk-player")?.firstChild?.textContent).toBe("@");
    expect(mapHtml(world, state, ui, cal, 2200)).not.toContain('class="wildlife-startle');
  });

  it.each([0, 1, DEFAULT_ZOOM])("recoils a currently visible animal without replacing its glyph at zoom %i", (zoom) => {
    const { state, world, ui, cal, event } = scene();
    ui.zoom = zoom;
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.active!.cell = neighbours(world, cellOf(state, world)).find((c) => passable(cellAt(world, c).terrain) && cellAt(world, c).region === state.player.region)!;
    const cell = cellAt(world, subject.active!.cell);
    event.source = { xM: (cell.x + 0.5) * PATCH_M, yM: (cell.y + 0.5) * PATCH_M };
    event.subjectId = subject.id;
    event.perception = { kind: "seen", identification: "species" };
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1000));
    const original = document.querySelector(`[data-wildlife-id="${subject.id}"]`)?.textContent;
    expect(original).toBeTruthy();
    enqueueWildlifeStartle(ui, event, 1000);
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const animal = document.querySelector(`[data-wildlife-id="${subject.id}"].wildlife-recoil`);
    expect(animal?.firstChild?.textContent).toBe(original);
    expect(animal?.closest(".grid")?.querySelector(".wildlife-startle.seen")?.textContent).toBe("!");
    expect(animal?.getAttribute("style")).toContain("--wildlife-start:1000ms");
    // Only the closest rung carries the herd's own metre position, laid over
    // the grid; the block rungs put its letter on the glyph it stands in.
    if (zoom === 0) {
      expect(animal?.classList.contains("wildlife-map-mark")).toBe(true);
      expect(animal?.parentElement?.classList.contains("grid")).toBe(true);
    } else {
      expect(animal?.closest(".c")).not.toBeNull();
    }
    const heardUi = newUiState();
    heardUi.zoom = zoom;
    enqueueWildlifeStartle(heardUi, { ...event, perception: { kind: "heard", identification: "unknown", uncertaintyM: 40 } }, 1000);
    expect(mapHtml(world, state, heardUi, cal, 1100)).not.toContain("wildlife-recoil");
  });

  it("projects a distant event to one nearest edge cue with its bearing", () => {
    const { state, world, ui, cal, event } = scene();
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const level = levelAt(ui.zoom);
    event.source = { xM: (x0 + (level.w + 10) * level.finePerGlyph) * PATCH_M, yM: (y0 + 4.5 * level.finePerGlyph) * PATCH_M };
    event.uncertaintyM = 0;
    enqueueWildlifeStartle(ui, event, 1000);
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const cues = document.querySelectorAll(".wildlife-startle");
    expect(cues).toHaveLength(1);
    expect(cues[0].classList.contains("bearing-east")).toBe(true);
    expect(cues[0].parentElement?.classList.contains("grid")).toBe(true);
    expect((cues[0] as HTMLElement).style.left).toBe("768px");
    expect((cues[0] as HTMLElement).style.top).toBe("38px");
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
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const cue = document.querySelector<HTMLElement>(".wildlife-startle.edge.bearing-east");
    expect(cue).not.toBeNull();
    expect(cue?.parentElement?.classList.contains("grid")).toBe(true);
    expect(cue?.style.left).toBe("522px");
    expect(cue?.style.top).toBe("262px");
    expect(document.querySelectorAll(".wildlife-startle")).toHaveLength(1);
    const clippedKey = mapKey(state, world, ui, cal, 1100);
    ui.mapViewport = { left: 0, top: 0, right: 792, bottom: 504 };
    expect(mapKey(state, world, ui, cal, 1300)).not.toBe(clippedKey);
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1300));
    expect(document.querySelector(".wildlife-startle.edge")).toBeNull();
    expect(document.querySelector(".wildlife-startle")?.getAttribute("style")).toContain("--wildlife-start:1000ms");
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
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1100));
    const cues = document.querySelectorAll<HTMLElement>(".wildlife-startle");
    expect(cues).toHaveLength(1);
    expect(cues[0].classList.contains("edge")).toBe(true);
    expect(cues[0].classList.contains("bearing-north")).toBe(true);
    expect(cues[0].parentElement?.classList.contains("grid")).toBe(true);
    expect(cues[0].style.left).toBe("71.5px");
    expect(cues[0].style.top).toBe(cueTop);
    expect(cues[0].style.getPropertyValue("--wildlife-start")).toBe("1000ms");
  });

  it("keeps the cue above glyphs and weather and removes motion when reduced motion is requested", () => {
    expect(rule(".wildlife-startle")).toContain("pointer-events: none");
    expect(rule(".wildlife-startle")).toContain("z-index: var(--map-startle)");
    expect(rule(".wildlife-startle")).toContain("paused");
    expect(rule(".wildlife-startle")).toContain("--wildlife-now");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.wildlife-startle\s*\{[^}]*animation-name:\s*wildlife-startle-fade/);
    expect(css).toMatch(/\.wildlife-recoil\s*\{\s*animation:\s*none/);
  });
});
