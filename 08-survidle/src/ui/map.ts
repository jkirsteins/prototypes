import type { Calendar } from "../sim/calendar";
import type { GameState, Terrain } from "../sim/types";
import type { World } from "../world/gen";
import { esc, type UiState } from "./render";

const GLYPH: Record<Terrain, string> = {
  water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: ".",
};

export const SNOW_SHOWN_CM = 5;

/** The cell each region's marker sits on: the land cell nearest its centroid. */
const markerCache = new WeakMap<World, number[]>();
export function markerCells(world: World): number[] {
  let cached = markerCache.get(world);
  if (cached) return cached;
  cached = world.regions.map((r) => {
    let best = r.cells[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const idx of r.cells) {
      const c = world.cells[idx];
      if (c.terrain === "water") continue;
      const d = (c.x - r.cx) ** 2 + (c.y - r.cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return best;
  });
  markerCache.set(world, cached);
  return cached;
}

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, ui: UiState, cal: Calendar): string {
  const marks = state.regions.map((r) => `${r.structures.cabin || r.structures.leanTo ? "H" : ""}${r.fire.lit ? "F" : ""}`).join(",");
  return `${state.player.region}|${ui.selected}|${state.weather.snowCm > SNOW_SHOWN_CM}|${cal.isNight}|${marks}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const snow = state.weather.snowCm > SNOW_SHOWN_CM;
  const markers = markerCells(world);
  const markerAt = new Map<number, { glyph: string; cls: string }>();
  world.regions.forEach((_r, id) => {
    const st = state.regions[id];
    let m: { glyph: string; cls: string } | null = null;
    if (id === cur) m = { glyph: "@", cls: "mk-player" };
    else if (st.fire.lit) m = { glyph: "F", cls: "mk-fire" };
    else if (st.structures.cabin || st.structures.leanTo) m = { glyph: "H", cls: "mk-shelter" };
    if (m) markerAt.set(markers[id], m);
  });

  const { w, h, cells } = world;
  const parts: string[] = [];
  parts.push(`<div class="grid${snow ? " snow" : ""}${cal.isNight ? " night" : ""}">`);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const cls = [`c t-${c.terrain}`];
    const reg = c.region;
    if (c.x > 0 && cells[i - 1].region !== reg) cls.push("bl");
    if (c.x < w - 1 && cells[i + 1].region !== reg) cls.push("br");
    if (c.y > 0 && cells[i - w].region !== reg) cls.push("bt");
    if (c.y < h - 1 && cells[i + w].region !== reg) cls.push("bb");
    if (reg === cur) cls.push("cur");
    if (sel !== null && reg === sel) cls.push("sel");
    let glyph = GLYPH[c.terrain];
    if (snow && c.terrain === "meadow") glyph = "*";
    const m = markerAt.get(i);
    if (m) {
      cls.push("mk", m.cls);
      glyph = m.glyph;
    }
    parts.push(`<span class="${cls.join(" ")}" data-act="select" data-r="${reg}" title="${esc(world.regions[reg].name)}">${glyph === "\"" ? "&quot;" : glyph}</span>`);
  }
  parts.push("</div>");
  parts.push(
    `<div class="legend"><span>~ water</span><span>A spruce</span><span>T pine</span><span>Y birch</span><span>. meadow</span><span>" bog</span><span>n rock</span><span>^ fell</span><span class="accent">@ you</span><span>H shelter</span><span>F fire</span><span>click a region for its card</span></div>`,
  );
  return parts.join("");
}
