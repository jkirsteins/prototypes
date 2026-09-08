import type { World } from "../world/gen";
import { calendar } from "./calendar";
import { regionState } from "./regionstate";
import { isWorkOrder, type GameState, type Order, type WorkOrder } from "./types";

/** A visible, once-only walk to one exact known cell. */
export function isWalkOrder(o: Order): o is WorkOrder {
  return isWorkOrder(o) && o.req.task === "walk";
}

function exactCell(o: WorkOrder): number | null {
  return typeof o.req.where === "object" ? o.req.where.cell : null;
}

/**
 * Inserts one exact Walk immediately before its requester. A direct map
 * click has no requester and lands at the whole list's top. Repeated reads
 * reuse the matching Walk already in that place rather than growing rows.
 */
export function insertWalkBefore(state: GameState, world: World, cell: number, beforeId: number | null): WorkOrder {
  const st = regionState(state, world, state.player.region);
  const rows = st.orders;
  const before = beforeId === null ? 0 : rows.findIndex((o) => o.id === beforeId);
  const at = before < 0 ? rows.length : before;
  const existing = beforeId === null ? rows[0] : rows[at - 1];
  if (existing && isWalkOrder(existing) && exactCell(existing) === cell) return existing;
  const o: WorkOrder = {
    id: st.nextOrderId++,
    kind: "job",
    req: { task: "walk", arg: `cell:${cell}`, until: { kind: "once" }, deliver: "leave", where: { cell } },
    done: 0,
    minutes: 0,
    skipped: "",
    givenDoy: calendar(state.minute, state.startDoy).dayOfYear,
  };
  rows.splice(at, 0, o);
  return o;
}
