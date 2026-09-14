/**
 * The forecast's worker: builds the world once per seed, runs the
 * horizons shortest first and posts each row as it lands, yielding to
 * its queue before each row so a newer request supersedes an older one
 * before any work is spent on it.
 */
import { generateWorld, type World } from "../world/gen";
import { WORLD_CELL_H, WORLD_CELL_W } from "../world/terrain";
import { readSolved, worldKey } from "../world/worldstore";
import { forecastRow, horizons } from "./forecast";
import type { ForecastReply, ForecastRequest } from "./forecaster";

const ctx = self as unknown as { postMessage(m: ForecastReply): void; onmessage: ((ev: MessageEvent<ForecastRequest>) => void) | null };
let world: World | null = null;
let seed = Number.NaN;
let latest = 0;

/** This worker's own copy of a seed's solved world: the disk cache the main thread already wrote, or a local solve where nothing has been written yet (the seed's first-ever load, still racing that write). */
async function ownWorld(s: number): Promise<World> {
  const cached = await readSolved(worldKey(s, WORLD_CELL_W, WORLD_CELL_H));
  return generateWorld(s, cached ?? undefined);
}

ctx.onmessage = async (ev) => {
  if (ev.data.kind === "world") {
    const s = ev.data.seed;
    world = await ownWorld(s);
    seed = s;
    return;
  }
  const { id, state } = ev.data;
  latest = id;
  if (!world || seed !== state.seed) {
    world = await ownWorld(state.seed);
    seed = state.seed;
  }
  const rows = horizons(state).slice().sort((a, b) => a.minutes - b.minutes);
  for (const h of rows) {
    // Let queued requests land first: a newer one supersedes this one before any work is spent on it.
    await new Promise((r) => setTimeout(r, 0));
    if (id !== latest) return;
    const row = forecastRow(state, world, h);
    if (id !== latest) return;
    ctx.postMessage({ kind: "row", id, row });
  }
};
