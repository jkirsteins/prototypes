import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { ANIMALS } from "./items";
import { log } from "./log";
import { type GameState, SPECIES, type Species } from "./types";

/** Daily logistic growth rates; realistic yearly increase spread over the growing season. */
const GROWTH: Record<Species, number> = { hare: 0.006, grouse: 0.005, deer: 0.0012, elk: 0.0006, fish: 0.003 };
const MIGRATION = 0.03;

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

/** Capacity as it stands this season: deer and elk thin out in winter. */
export function seasonalCapacity(world: World, region: number, s: Species, cal: Calendar): number {
  const k = world.regions[region].capacity[s];
  if (cal.season === "winter" && (s === "deer" || s === "elk")) return k * 0.6;
  return k;
}

export function regionDensity(state: GameState, world: World, region: number, s: Species, cal: Calendar): number {
  return density(state.regions[region].pop[s], seasonalCapacity(world, region, s, cal));
}

/** Runs once per game day at 04:00: growth, then migration. Logs notable movements near the player. */
export function dailyAnimals(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  const growing = cal.month >= 3 && cal.month <= 8;
  const before = SPECIES.map((s) => state.regions[state.player.region].pop[s]);

  for (const r of world.regions) {
    const st = state.regions[r.id];
    for (const s of SPECIES) {
      const k = seasonalCapacity(world, r.id, s, cal);
      if (k <= 0) {
        st.pop[s] = 0;
        continue;
      }
      const pop = st.pop[s];
      if (growing) {
        st.pop[s] = Math.max(0, pop + GROWTH[s] * pop * (1 - pop / k));
      } else if (pop > k) {
        // Winter thins a herd the land cannot feed.
        st.pop[s] = pop - (pop - k) * 0.05;
      }
    }
  }

  // Migration: a share of each land population leaves for a neighbour with room.
  const moves: { from: number; to: number; s: Species; n: number }[] = [];
  for (const r of world.regions) {
    if (!r.neighbours.length) continue;
    const st = state.regions[r.id];
    for (const s of SPECIES) {
      if (s === "fish") continue;
      const n = st.pop[s] * MIGRATION;
      if (n < 0.01) continue;
      const weights = r.neighbours.map((nb) => {
        const k = seasonalCapacity(world, nb.id, s, cal);
        return Math.max(0, k - state.regions[nb.id].pop[s]);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let pick = rng.next() * total;
      let to = r.neighbours[0].id;
      for (let i = 0; i < weights.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          to = r.neighbours[i].id;
          break;
        }
      }
      moves.push({ from: r.id, to, s, n });
    }
  }
  for (const m of moves) {
    state.regions[m.from].pop[m.s] -= m.n;
    state.regions[m.to].pop[m.s] += m.n;
  }

  const here = state.player.region;
  SPECIES.forEach((s, i) => {
    if (s !== "deer" && s !== "elk") return;
    const now = state.regions[here].pop[s];
    const was = before[i];
    if (was < 0.5 && now < 0.5) return;
    const change = (now - was) / Math.max(0.5, was);
    if (change > 0.25) log(state, `${cap(ANIMALS[s].name)} tracks are fresher around ${world.regions[here].name}.`, "good");
    else if (change < -0.25) {
      const gone = moves.find((m) => m.from === here && m.s === s);
      const where = gone ? ` toward ${world.regions[gone.to].name}` : "";
      log(state, `The ${ANIMALS[s].name} have moved on${where}.`);
    }
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
