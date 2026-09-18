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
 * A map click is the only thing that creates a Walk row. It replaces any
 * previous explicit destination and owns the top of the list. Routes needed
 * by another row remain steps of that row and never enter the list.
 *
 * The row is never met on its own: the survivor walks there and stays,
 * resting where they stand, until the player strikes the row off. A walk
 * that dropped off the list on arrival handed the minute straight back to
 * the row below, and the survivor left the cell they had just been sent
 * to. One such row only: another click repurposes it for the new cell and
 * puts it back on top.
 */
export function insertWalkAtTop(state: GameState, world: World, cell: number): WorkOrder {
  const st = regionState(state, world, state.player.region);
  const rows = st.orders;
  const walk = rows.find(isWalkOrder);
  const req: WorkOrder["req"] = { task: "walk", arg: `cell:${cell}`, until: { kind: "dismissed" }, deliver: "leave", where: { cell } };
  const o: WorkOrder = walk ?? {
    id: st.nextOrderId++, kind: "job",
    req, done: 0, minutes: 0, skipped: "",
    givenDoy: calendar(state.minute, state.startDoy).dayOfYear,
  };
  if (walk && exactCell(walk) !== cell) { walk.req = req; walk.done = 0; walk.skipped = ""; }
  st.orders = [o, ...rows.filter((row) => !isWalkOrder(row))];
  return o;
}
