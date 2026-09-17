/**
 * The forecast's worker: builds the world once per seed, runs the
 * horizons shortest first and posts each row as it lands, yielding to
 * its queue before each row so a newer request supersedes an older one
 * before any work is spent on it.
 */
import { generateWorld, type World } from "../world/gen";
import { WORLD_CELL_H, WORLD_CELL_W } from "../world/terrain";
import { readSolved, worldKey } from "../world/worldstore";
import { retainSolved } from "../world/solvecache";
import { forecastRow, horizons } from "./forecast";
import type { ForecastReply, ForecastRequest } from "./forecaster";

/**
 * What `onMessage` needs from the outside world, factored out so the guard
 * below can be driven by a test without a real Worker global: `post` in
 * place of postMessage, `wait` for the between-horizon yield, `solve` for
 * turning a seed into this worker's own copy of the world.
 */
export interface WorkerDeps {
  post: (m: ForecastReply) => void;
  wait: () => Promise<void>;
  solve: (seed: number) => Promise<World>;
}

/**
 * The worker's own state and its message handling. A row loop already
 * abandons when a newer forecast request supersedes it (`id !== latest`);
 * it now also abandons when the world it started against has been replaced
 * by a `"world"` message landing mid-loop - `fresh()` in main.ts (reset
 * world, leave world, next boat) posts one on a new seed without going
 * through a forecast request at all, and the loop's yield between horizons
 * is exactly where that race fits. `worldGen` is stamped on every
 * replacement and the loop checks it the same way it checks `id`, so a row
 * computed after a world switch is never mistaken for one computed before it.
 */
export function createForecastWorker(deps: WorkerDeps) {
  let world: World | null = null;
  let seed = Number.NaN;
  let latest = 0;
  let worldGen = 0;
  let pending: Promise<World> | null = null;

  async function onMessage(data: ForecastRequest): Promise<void> {
    if (data.kind === "world") {
      if (seed !== data.seed) {
        world = null;
        pending = null;
      }
      seed = data.seed;
      worldGen++;
      return;
    }
    const { id, state } = data;
    latest = id;
    if (seed !== state.seed) {
      world = null;
      pending = null;
      seed = state.seed;
      worldGen++;
    }
    const myGen = worldGen;
    if (!world) {
      // Seed announcements allocate nothing. Concurrent requests share the
      // pending load; a superseded load must never install an old world.
      pending ??= deps.solve(state.seed);
      const loading = pending;
      let loaded: World;
      try {
        loaded = await loading;
      } catch (err) {
        if (pending === loading) pending = null;
        throw err;
      }
      if (id !== latest || worldGen !== myGen) return;
      world = loaded;
    }
    const runWorld = world;
    const rows = horizons(state).slice().sort((a, b) => a.minutes - b.minutes);
    for (const h of rows) {
      // Let queued requests, and a world switch, land first: either one
      // supersedes this row before any work is spent computing it.
      await deps.wait();
      if (id !== latest || worldGen !== myGen) return;
      const row = forecastRow(state, runWorld, h);
      if (id !== latest || worldGen !== myGen) return;
      deps.post({ kind: "row", id, row });
    }
  }

  return { onMessage };
}

const ctx = self as unknown as { postMessage(m: ForecastReply): void; onmessage: ((ev: MessageEvent<ForecastRequest>) => void) | null };
const worker = createForecastWorker({
  post: (m) => ctx.postMessage(m),
  wait: () => new Promise((r) => setTimeout(r, 0)),
  // The main thread has solved this seed already; the disk cache it wrote holds the same arrays, or a local solve where nothing has been written yet (the seed's first-ever load, still racing that write).
  solve: async (s) => {
    const world = generateWorld(s, (await readSolved(worldKey(s, WORLD_CELL_W, WORLD_CELL_H))) ?? undefined);
    retainSolved(s);
    return world;
  },
});
ctx.onmessage = (ev) => {
  void worker.onMessage(ev.data);
};
