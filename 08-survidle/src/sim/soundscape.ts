/**
 * What the place sounds like, as questions the audio layer asks every
 * frame. Pure: reads the state, rolls nothing, plays nothing. The audio
 * layer turns these into loops and one-shots on its own clock.
 */
import { cellAt, regionAt, speciesHere, waterKindOf, type World } from "../world/gen";
import { regionDensity } from "./animals";
import type { Calendar } from "./calendar";
import { fuelTotal } from "./fire";
import { FIRE_LOW_KG } from "./items";
import { sheltered } from "./player";
import { atCamp, cellOf } from "./position";
import { regionState } from "./regionstate";
import { type Call, SPECIES_DEFS } from "./species";
import type { GameState, RecipeId, Terrain } from "./types";
import { ICE_THIN_CM, stormNow } from "./weather";

export type Footing = "leaves" | "grass" | "bog" | "rock" | "snow" | "ice";

export interface Surroundings {
  /** Shares of the 5x5 cells around the player. forest is spruce, pine and birch; open is fell, rock, meadow and bog; bog is also given alone. */
  forest: number;
  birch: number;
  open: number;
  bog: number;
  lake: number;
  sea: number;
  footing: Footing;
  /** Standing water around is under ice. */
  frozen: boolean;
  fire: "none" | "torch" | "low" | "fed";
  indoors: boolean;
  rain: "none" | "light" | "heavy";
  storm: boolean;
}

/** Cells either side of the player counted for the surroundings. */
const REACH = 2;
/** Snow this deep is what you hear under foot. */
const SNOW_FOOTING_CM = 5;

function footingOf(t: Terrain, snowCm: number): Footing {
  if (t === "water") return "ice";
  if (snowCm >= SNOW_FOOTING_CM) return "snow";
  if (t === "bog") return "bog";
  if (t === "rock" || t === "fell") return "rock";
  if (t === "meadow") return "grass";
  return "leaves";
}

export function surroundings(state: GameState, world: World, ambient: number): Surroundings {
  const here = cellOf(state, world);
  const hx = here % world.w;
  const hy = Math.floor(here / world.w);
  let n = 0;
  let forest = 0;
  let birch = 0;
  let open = 0;
  let bog = 0;
  let lake = 0;
  let sea = 0;
  for (let dy = -REACH; dy <= REACH; dy++) {
    for (let dx = -REACH; dx <= REACH; dx++) {
      const x = hx + dx;
      const y = hy + dy;
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      const idx = y * world.w + x;
      const t = cellAt(world, idx).terrain;
      n++;
      if (t === "spruce" || t === "pine" || t === "birch") forest++;
      if (t === "birch") birch++;
      if (t === "fell" || t === "rock" || t === "meadow" || t === "bog") open++;
      if (t === "bog") bog++;
      if (t === "water") {
        if (waterKindOf(world, idx) === "sea") sea++;
        else lake++;
      }
    }
  }
  const st = regionState(state, world, state.player.region);
  const camp = atCamp(state, world);
  const fire: Surroundings["fire"] = camp && st.fire.lit ? (fuelTotal(st.fire) > FIRE_LOW_KG ? "fed" : "low") : state.player.torch.lit ? "torch" : "none";
  const w = state.weather;
  return {
    forest: forest / n, birch: birch / n, open: open / n, bog: bog / n, lake: lake / n, sea: sea / n,
    footing: footingOf(cellAt(world, here).terrain, w.snowCm),
    frozen: w.iceCm >= ICE_THIN_CM,
    fire,
    indoors: sheltered(state, world) && (st.structures.cabin || st.structures.turfHut),
    rain: ambient > 0 ? w.precip : "none",
    storm: stormNow(w, state.minute),
  };
}

/** Whether a call's window is open: dawn is sunrise -1 to +3, dusk is sunset -2 to +1, day and night follow the sun. */
export function windowOpen(when: Call["when"], cal: Calendar): boolean {
  const h = cal.hour;
  switch (when) {
    case "any": return true;
    case "day": return !cal.isNight;
    case "night": return cal.isNight;
    case "dawn": return h >= cal.sunrise - 1 && h < cal.sunrise + 3;
    case "dusk": return h >= cal.sunset - 2 && h < cal.sunset + 1;
  }
}

function inMonths(months: [number, number] | undefined, month: number): boolean {
  if (!months) return true;
  const [a, b] = months;
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/** Target gains for the ambience loops, by slot. Absent means silent. */
export function ambienceMix(s: Surroundings, cal: Calendar, ambient: number): Record<string, number> {
  const mix: Record<string, number> = {};
  const set = (slot: string, v: number) => { if (v > 0) mix[slot] = v; };
  set("forest", s.forest);
  if (cal.month >= 4 && cal.month <= 8) set("leaves", s.birch);
  set("open", s.open * (s.storm ? 2 : 1));
  if (!s.frozen) set("lake", s.lake);
  set("sea", s.sea);
  if (s.rain === "light") set("rain_light", 1);
  if (s.rain === "heavy") set("rain_heavy", 1);
  if (s.fire === "torch") set("fire", 0.5);
  if (s.fire === "low") set("fire", 0.7);
  if (s.fire === "fed") set("fire", 1);
  if (cal.month >= 4 && cal.month <= 6 && windowOpen("dawn", cal)) set("chorus", s.forest);
  if (cal.month >= 5 && cal.month <= 7 && cal.hour >= 18 && cal.hour < 23 && ambient > 10) set("insects", s.bog + (s.open - s.bog) * 0.5);
  return mix;
}

export interface OpenCall { slot: string; /** calls per real minute */ rate: number }

/** Every call open now from a species that lives here above "tracks". */
export function openCalls(state: GameState, world: World, cal: Calendar): OpenCall[] {
  const region = state.player.region;
  const out: OpenCall[] = [];
  for (const s of speciesHere(regionAt(world, region))) {
    const def = SPECIES_DEFS[s];
    if (!def.calls) continue;
    const d = regionDensity(state, world, region, s, cal);
    if (d < 0.15) continue;
    for (const c of def.calls) {
      if (!windowOpen(c.when, cal) || !inMonths(c.months, cal.month)) continue;
      const rate = s === "wolf" ? 0.6 * d * (0.3 + 0.7 * cal.moonLight) : 0.5 * c.weight * d;
      out.push({ slot: c.sound, rate });
    }
  }
  return out;
}

const KNAPPED = new Set<RecipeId>(["knife", "axe", "arrows", "fishingSpear"]);

/** The repeating sound of the task under way: footsteps, the axe, the knapping stone. Null for everything else. */
export function activityLoop(state: GameState, s: Surroundings): { slot: string; period: number } | null {
  const t = state.task;
  if (!t) return null;
  switch (t.id) {
    case "walk": case "travel": return { slot: `step_${s.footing}`, period: 0.6 };
    case "chop": return { slot: "axe", period: 1.5 };
    case "split": return { slot: "axe", period: 2 };
    case "craft": return KNAPPED.has(t.arg as RecipeId) ? { slot: "knap", period: 1.2 } : null;
    default: return null;
  }
}
