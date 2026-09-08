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
 */
export function insertWalkAtTop(state: GameState, world: World, cell: number): WorkOrder {
  const st = regionState(state, world, state.player.region);
  const rows = st.orders;
  const walks = rows.filter(isWalkOrder);
  const same = walks.find((o) => exactCell(o) === cell);
  const o: WorkOrder = same ?? {
    id: st.nextOrderId++, kind: "job",
    req: { task: "walk", arg: `cell:${cell}`, until: { kind: "once" }, deliver: "leave", where: { cell } },
    done: 0, minutes: 0, skipped: "",
    givenDoy: calendar(state.minute, state.startDoy).dayOfYear,
  };
  st.orders = [o, ...rows.filter((row) => !isWalkOrder(row))];
  return o;
}
