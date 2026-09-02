import type { Calendar } from "../sim/calendar";
import { cellOf } from "../sim/position";
import type { GameState, Terrain } from "../sim/types";
import type { World } from "../world/gen";
import { esc, type UiState } from "./render";

const GLYPH: Record<Terrain, string> = {
  water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: ".",
};

export const SNOW_SHOWN_CM = 5;

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, world: World, ui: UiState, cal: Calendar): string {
  const marks = state.regions.map((r) => `${r.structures.cabin || r.structures.leanTo ? "H" : ""}${r.fire.lit ? "F" : ""}`).join(",");
  const route = state.route ? `${state.route.target}:${state.route.path.length}` : "";
  const piles = Object.keys(state.piles).join(",");
  return `${cellOf(state, world)}|${ui.selected}|${state.weather.snowCm > SNOW_SHOWN_CM}|${cal.isNight}|${marks}|${route}|${piles}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const snow = state.weather.snowCm > SNOW_SHOWN_CM;
  const playerCell = cellOf(state, world);
  const markerAt = new Map<number, { glyph: string; cls: string }>();
  world.regions.forEach((_r, id) => {
    const st = state.regions[id];
    let m: { glyph: string; cls: string } | null = null;
    if (st.fire.lit) m = { glyph: "F", cls: "mk-fire" };
    else if (st.structures.cabin || st.structures.leanTo) m = { glyph: "H", cls: "mk-shelter" };
    if (m) markerAt.set(st.campCell, m);
  });
  markerAt.set(playerCell, { glyph: "@", cls: "mk-player" });
  const routeCells = new Set(state.route?.path ?? []);
  const pileCells = new Set(Object.keys(state.piles).map(Number));

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
    if (routeCells.has(i)) cls.push("rt");
    let glyph = GLYPH[c.terrain];
    if (snow && c.terrain === "meadow") glyph = "*";
    const m = markerAt.get(i);
    if (m) {
      cls.push("mk", m.cls);
      glyph = m.glyph;
    } else if (pileCells.has(i)) {
      cls.push("pl");
    }
    const title = `${world.regions[reg].name}${pileCells.has(i) ? ", something lies here" : ""}`;
    parts.push(`<span class="${cls.join(" ")}" data-act="select" data-r="${reg}" data-cell="${i}" title="${esc(title)}">${glyph === "\"" ? "&quot;" : glyph}</span>`);
  }
  parts.push("</div>");
  parts.push(
    `<div class="legend"><span>~ water</span><span>A spruce</span><span>T pine</span><span>Y birch</span><span>. meadow</span><span>" bog</span><span>n rock</span><span>^ fell</span><span class="accent">@ you</span><span>H shelter</span><span>F fire</span><span class="pl-key">underlined: something lies there</span><span>click a region for its card</span></div>`,
  );
  return parts.join("");
}
