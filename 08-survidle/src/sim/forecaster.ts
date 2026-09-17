/**
 * The main thread's side of the forecast: a view of rows with stale
 * marks, filled by a worker that posts one row per horizon as it lands,
 * or filled at once by the pure forecast where there is no worker (the
 * headless harness, the tests).
 */
import type { World } from "../world/gen";
import { forecast, type ForecastRow, type HorizonId } from "./forecast";
import { current } from "./record";
import type { GameState } from "./types";

export interface ViewRow extends ForecastRow { stale: boolean }
export interface ForecastView { id: number; rows: Partial<Record<HorizonId, ViewRow>> }

export type ForecastRequest =
  | { kind: "forecast"; id: number; state: GameState }
  /**
   * The seed alone. The main thread reads this same seed's solved arrays for
   * the whole session, so sending them along would mean two live copies of
   * one solved world and a main-thread copy paid at every call; the worker
   * gets its own instead, from the cache solve.worker's own copy already
   * wrote to disk, or a local solve on the rare seed nothing has written yet.
   */
  | { kind: "world"; seed: number };
export interface ForecastReply { kind: "row"; id: number; row: ForecastRow }

export function emptyView(): ForecastView {
  return { id: 0, rows: {} };
}

/** A new request: every row on show is from an older state until its replacement lands. */
export function beginRequest(view: ForecastView, id: number): void {
  view.id = id;
  for (const r of Object.values(view.rows)) if (r) r.stale = true;
}

/** A row from the latest request replaces; one from an older request only fills a horizon nothing has landed for, and stays stale. */
export function applyRow(view: ForecastView, id: number, row: ForecastRow): void {
  if (id === view.id) view.rows[row.id] = { ...row, stale: false };
  else if (id < view.id && !view.rows[row.id]) view.rows[row.id] = { ...row, stale: true };
}

/**
 * The month row's number into the life record: the runs alive of ten,
 * into today's entry (the last one the daily step pushed) if it is
 * still null. False when there is no entry yet or it is already
 * written. The journal and the evolution view read the series later.
 *
 * This relies on a new life's record starting with an empty series, so
 * a row computed for the life that just died cannot land in the heir's;
 * and a row that lands after the day has rolled writes into the new
 * day's entry rather than the one it was computed for.
 */
export function noteMonthRow(state: GameState, row: ForecastRow): boolean {
  if (row.id !== "month") return false;
  const f = current(state).forecast;
  const i = f.length - 1;
  if (i < 0 || f[i] !== null) return false;
  f[i] = row.runs - row.died;
  return true;
}

export interface Forecaster {
  request(state: GameState): void;
  /** The world the forecast runs in; a worker is told the seed and builds its own copy rather than being sent this thread's. */
  setWorld(world: World): void;
  view(): ForecastView;
  /** Called with each row from the latest request as it lands. */
  onRow?: (row: ForecastRow) => void;
  dispose(): void;
}

/** With a worker, rows land as messages; without one, the pure forecast fills the view before request returns. `runs` is for the synchronous path only. */
export function createForecaster(world: World, worker?: Worker, runs?: number): Forecaster {
  const view = emptyView();
  let next = 0;
  // The world the synchronous path forecasts in; a worker keeps its own, built from the arrays setWorld sends.
  let active = world;
  const f: Forecaster = {
    request(state) {
      const id = ++next;
      beginRequest(view, id);
      if (worker) {
        const msg: ForecastRequest = { kind: "forecast", id, state };
        worker.postMessage(msg);
      } else {
        for (const row of forecast(state, active, runs)) {
          applyRow(view, id, row);
          f.onRow?.(row);
        }
      }
    },
    // Only the seed crosses to the worker: the main thread reads this same
    // world's arrays for the map all run, so a copy sent along would sit
    // beside them rather than instead of them, and posting it would block
    // this thread on cloning ~44 MB before the message even queues.
    setWorld(w) {
      active = w;
      if (worker) {
        const msg: ForecastRequest = { kind: "world", seed: w.seed };
        worker.postMessage(msg);
      }
    },
    view: () => view,
    dispose() { worker?.terminate(); },
  };
  worker?.addEventListener("message", (ev: MessageEvent<ForecastReply>) => {
    if (ev.data?.kind !== "row") return;
    applyRow(view, ev.data.id, ev.data.row);
    if (ev.data.id === view.id) f.onRow?.(ev.data.row);
  });
  return f;
}
