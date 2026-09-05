/**
 * The forecast's worker: builds the world once per seed, runs the
 * horizons shortest first and posts each row as it lands, yielding to
 * its queue between rows so a newer request supersedes an older one.
 */
import { generateWorld, type World } from "../world/gen";
import { forecastRow, horizons } from "./forecast";
import type { ForecastReply, ForecastRequest } from "./forecaster";

const ctx = self as unknown as { postMessage(m: ForecastReply): void; onmessage: ((ev: MessageEvent<ForecastRequest>) => void) | null };
let world: World | null = null;
let seed = Number.NaN;
let latest = 0;

ctx.onmessage = async (ev) => {
  const { id, state } = ev.data;
  latest = id;
  if (!world || seed !== state.seed) {
    world = generateWorld(state.seed);
    seed = state.seed;
  }
  for (const h of horizons(state)) {
    if (id !== latest) return;
    const row = forecastRow(state, world, h);
    if (id !== latest) return;
    ctx.postMessage({ kind: "row", id, row });
    await new Promise((r) => setTimeout(r, 0));
  }
};
