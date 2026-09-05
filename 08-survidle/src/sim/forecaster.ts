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

export interface ForecastRequest { kind: "forecast"; id: number; state: GameState }
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
  view(): ForecastView;
  /** Called with each row from the latest request as it lands. */
  onRow?: (row: ForecastRow) => void;
  dispose(): void;
}

/** With a worker, rows land as messages; without one, the pure forecast fills the view before request returns. `runs` is for the synchronous path only. */
export function createForecaster(world: World, worker?: Worker, runs?: number): Forecaster {
  const view = emptyView();
  let next = 0;
  const f: Forecaster = {
    request(state) {
      const id = ++next;
      beginRequest(view, id);
      if (worker) {
        const msg: ForecastRequest = { kind: "forecast", id, state };
        worker.postMessage(msg);
      } else {
        for (const row of forecast(state, world, runs)) {
          applyRow(view, id, row);
          f.onRow?.(row);
        }
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
