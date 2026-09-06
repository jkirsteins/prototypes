import type { Rng } from "../rng";
import { regionAt, speciesHere, type World } from "../world/gen";
import type { Presence } from "./advance";
import { type Calendar, monthName } from "./calendar";
import { log } from "./log";
import { regionState, startingPop, touchedRegions } from "./regionstate";
import { awayWord, isVoiceOnly, seasonFactor, type Species, SPECIES_DEFS, type SpeciesDef } from "./species";
import type { GameState, RegionState } from "./types";
import { ICE_THIN_CM } from "./weather";

const MIGRATION = 0.03;
/**
 * Small game refills a hunted range from the country around it: hares
 * disperse kilometres and a vacated range is full again within weeks. Each
 * day a region below its seasonal capacity receives this share of its gap,
 * scaled by its neighbours' mean density; 0.052 a day takes a half-empty
 * region to nine tenths in thirty days with full neighbours, since
 * 0.948^30 is 0.2. Runs in every month: hares move in winter too.
 */
export const SMALL_GAME_INFLOW = 0.052;
/** The species the inflow rule moves; deer, elk, reindeer and the predators keep the slow migration. */
export const SMALL_GAME: Species[] = ["hare", "squirrel", "willowGrouse", "ptarmigan", "blackGrouse", "capercaillie", "hazelGrouse"];
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

/**
 * Why a species cannot be met here at all just now, in the words the hunt
 * row and the region card both say, or null when it can be met. The one
 * predicate for it: the population alone would not show an absence, because
 * a migrant's numbers decay by a tenth a day and stay above one animal for
 * weeks after the flock has gone.
 */
export function absence(def: SpeciesDef, cal: Calendar, iceCm: number): string | null {
  if (def.season.kind === "migrant" && seasonFactor(def, cal.month) === 0) return `${awayWord(def)} until ${monthName(def.season.arrive)}`;
  if (def.kind === "bird" && def.habitat.lake !== undefined && iceCm >= ICE_THIN_CM) return "the lake is frozen";
  return null;
}

/** Capacity as it stands this season: winter thins the browsers, migrants are away, lake birds leave a frozen lake. */
export function seasonalCapacity(world: World, region: number, s: Species, cal: Calendar, iceCm = 0): number {
  const def = SPECIES_DEFS[s];
  if (absence(def, cal, iceCm)) return 0;
  return (regionAt(world, region).capacity[s] ?? 0) * seasonFactor(def, cal.month);
}

export function regionDensity(state: GameState, world: World, region: number, s: Species, cal: Calendar): number {
  return density(popOf(regionState(state, world, region), s), seasonalCapacity(world, region, s, cal, state.weather.iceCm));
}

/** Runs once per game day at 04:00: growth, then migration. Logs notable movements near the player; nothing to notice with nobody home. */
export function dailyAnimals(state: GameState, world: World, cal: Calendar, rng: Rng, who: Presence | null): void {
  const growing = cal.month >= 3 && cal.month <= 8;
  const here = who?.region;
  const before = here !== undefined ? NOTABLE.map((s) => popOf(regionState(state, world, here), s)) : [];
  const touched = touchedRegions(state);
  const touchedSet = new Set(touched);

  for (const id of touched) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      const def = SPECIES_DEFS[s];
      const k = seasonalCapacity(world, r.id, s, cal, state.weather.iceCm);
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

  // Small game moves into a region with room from every neighbour, in
  // proportion to the gap and the neighbours' density, never taking a
  // neighbour under the receiver's own density. An untouched neighbour is
  // read at its starting numbers and materialised only when it gives.
  for (const id of touched) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      if (!SMALL_GAME.includes(s)) continue;
      const k = seasonalCapacity(world, r.id, s, cal, state.weather.iceCm);
      if (k <= 0) continue;
      const pop = popOf(st, s);
      const gap = k - pop;
      if (gap <= 0.01) continue;
      const nbs = r.neighbours.map((nb) => {
        const nk = seasonalCapacity(world, nb.id, s, cal, state.weather.iceCm);
        const npop = state.regions[nb.id] ? popOf(state.regions[nb.id], s) : (startingPop(world, nb.id)[s] ?? 0);
        return { id: nb.id, k: nk, pop: npop, d: nk > 0 ? Math.min(1, npop / nk) : 0 };
      }).filter((nb) => nb.k > 0);
      if (!nbs.length) continue;
      const meanD = nbs.reduce((a, nb) => a + nb.d, 0) / nbs.length;
      const want = SMALL_GAME_INFLOW * gap * meanD;
      if (want < 0.01) continue;
      const after = (pop + want) / k;
      const totalD = nbs.reduce((a, nb) => a + nb.d, 0);
      let got = 0;
      for (const nb of nbs) {
        if (nb.d <= 0) continue;
        const share = want * (nb.d / totalD);
        const spare = Math.max(0, nb.pop - nb.k * after);
        const give = Math.min(share, spare);
        if (give < 0.001) continue;
        const nst = regionState(state, world, nb.id);
        nst.pop[s] = popOf(nst, s) - give;
        got += give;
      }
      st.pop[s] = pop + got;
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
      if (SPECIES_DEFS[s].kind !== "mammal" || SMALL_GAME.includes(s)) continue;
      const n = popOf(st, s) * MIGRATION;
      if (n < 0.01) continue;
      // Only neighbours with room; a region that never holds the species has weight 0 and must not be a fallback.
      const candidates = nbs
        .map((nb) => ({ id: nb.id, weight: Math.max(0, seasonalCapacity(world, nb.id, s, cal, state.weather.iceCm) - popOf(state.regions[nb.id], s)) }))
        .filter((c) => c.weight > 0);
      if (!candidates.length) continue;
      const total = candidates.reduce((a, c) => a + c.weight, 0);
      let pick = rng.next() * total;
      let to = candidates[candidates.length - 1].id;
      for (const c of candidates) {
        pick -= c.weight;
        if (pick <= 0) {
          to = c.id;
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
    if (here === undefined) return;
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
