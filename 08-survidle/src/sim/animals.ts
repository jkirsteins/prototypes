import type { Rng } from "../rng";
import { regionAt, speciesHere, type World } from "../world/gen";
import type { Calendar } from "./calendar";
import { log } from "./log";
import { regionState, touchedRegions } from "./regionstate";
import { isVoiceOnly, type Species, SPECIES_DEFS } from "./species";
import type { GameState, RegionState } from "./types";

const MIGRATION = 0.03;
/** Species whose comings and goings near the player are worth a log line. */
const NOTABLE: Species[] = ["deer", "reindeer", "elk", "wolf", "bear"];

export function density(pop: number, k: number): number {
  return k <= 0 ? 0 : Math.min(1, pop / k);
}

export function densityLabel(d: number): string {
  if (d < 0.02) return "none";
  if (d < 0.15) return "tracks";
  if (d < 0.4) return "few";
  if (d < 0.7) return "some";
  return "many";
}

/** Animals of a species in a region; none for a species the region never holds. */
export function popOf(st: RegionState, s: Species): number {
  return st.pop[s] ?? 0;
}

/** Capacity as it stands this season: winter thins the browsers, migrants are away. */
export function seasonalCapacity(world: World, region: number, s: Species, cal: Calendar): number {
  const k = regionAt(world, region).capacity[s] ?? 0;
  const r = SPECIES_DEFS[s].season;
  if (r.kind === "resident") return cal.season === "winter" ? k * (r.winter ?? 1) : k;
  return cal.month >= r.arrive && cal.month < r.leave ? k : 0;
}

export function regionDensity(state: GameState, world: World, region: number, s: Species, cal: Calendar): number {
  return density(popOf(regionState(state, world, region), s), seasonalCapacity(world, region, s, cal));
}

/** Runs once per game day at 04:00: growth, then migration. Logs notable movements near the player. */
export function dailyAnimals(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  const growing = cal.month >= 3 && cal.month <= 8;
  const here = state.player.region;
  const before = NOTABLE.map((s) => popOf(regionState(state, world, here), s));
  const touched = touchedRegions(state);
  const touchedSet = new Set(touched);

  for (const id of touched) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      const def = SPECIES_DEFS[s];
      const k = seasonalCapacity(world, r.id, s, cal);
      const pop = popOf(st, s);
      if (isVoiceOnly(s)) {
        st.pop[s] = k;
      } else if (def.season.kind === "migrant") {
        // A flock arrives over a few weeks and leaves the same way; next year's replaces what was taken.
        st.pop[s] = pop + (k - pop) * 0.1;
      } else if (k <= 0) {
        st.pop[s] = 0;
      } else if (growing) {
        st.pop[s] = Math.max(0, pop + def.growth * pop * (1 - pop / k));
      } else if (pop > k) {
        // Winter thins a herd the land cannot feed.
        st.pop[s] = pop - (pop - k) * 0.05;
      }
    }
  }

  // Migration: a share of each mammal population leaves for a touched neighbour
  // with room. Untouched country sits at its starting numbers, so nothing
  // moves in or out of it. Birds and fish do not shuffle.
  const moves: { from: number; to: number; s: Species; n: number }[] = [];
  for (const id of touched) {
    const r = regionAt(world, id);
    const nbs = r.neighbours.filter((nb) => touchedSet.has(nb.id));
    if (!nbs.length) continue;
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      if (SPECIES_DEFS[s].kind !== "mammal") continue;
      const n = popOf(st, s) * MIGRATION;
      if (n < 0.01) continue;
      const weights = nbs.map((nb) => {
        const k = seasonalCapacity(world, nb.id, s, cal);
        return Math.max(0, k - popOf(state.regions[nb.id], s));
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let pick = rng.next() * total;
      let to = nbs[0].id;
      for (let i = 0; i < weights.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          to = nbs[i].id;
          break;
        }
      }
      moves.push({ from: id, to, s, n });
    }
  }
  for (const m of moves) {
    state.regions[m.from].pop[m.s] = popOf(state.regions[m.from], m.s) - m.n;
    state.regions[m.to].pop[m.s] = popOf(state.regions[m.to], m.s) + m.n;
  }

  NOTABLE.forEach((s, i) => {
    const now = popOf(state.regions[here], s);
    const was = before[i];
    if (was < 0.5 && now < 0.5) return;
    const change = (now - was) / Math.max(0.5, was);
    if (change > 0.25) log(state, `${cap(SPECIES_DEFS[s].name)} tracks are fresher around ${regionAt(world, here).name}.`, "good");
    else if (change < -0.25) {
      const gone = moves.find((m) => m.from === here && m.s === s);
      const where = gone ? ` toward ${regionAt(world, gone.to).name}` : "";
      log(state, `The ${SPECIES_DEFS[s].name} have moved on${where}.`);
    }
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
