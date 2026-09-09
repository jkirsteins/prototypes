import type { World } from "../world/gen";
import { regionState } from "./regionstate";
import { isCareRow } from "./bodyorder";
import type { GameState, Order, WorkIntent, WorkOrder } from "./types";

/**
 * Finds the order a live intent belongs to without tying ownership to the
 * region the survivor happens to occupy mid-route.
 */
export function owningOrder(state: GameState, world: World, intent: WorkIntent): WorkOrder | null {
  if (intent.orderId === null) return null;
  const preferred = intent.orderRegion ?? state.player.region;
  const find = (orders: Order[]): WorkOrder | null => {
    const order = orders.find((candidate) => candidate.id === intent.orderId);
    return order && !isCareRow(order) ? order : null;
  };
  const local = find(regionState(state, world, preferred).orders);
  if (local) return local;
  for (const [region, st] of Object.entries(state.regions)) {
    if (Number(region) === preferred) continue;
    const order = find(st.orders);
    if (order) return order;
  }
  return null;
}
