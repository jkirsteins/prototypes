/**
 * The needs ledger: what the rows that could not run this minute would need
 * to run, published by the judgement and read by the care rows. Cleared and
 * rewritten every pass, so a row struck off takes its need with it, and
 * nothing here is saved. One need for now, the fire, as the level the rows
 * ask for; the camp row raises the pit toward it and leaves its refusal
 * here when it cannot, so the blocked row can say why in full.
 *
 * The rows publish and the care rows fulfil: a cook row never stokes the
 * pit itself, and the camp row never reads what a cook wants beyond the
 * level written here. The generic version - water, light, a tool's edge,
 * shelter - is deliberately not built; a second need type is added when a
 * row actually needs it (roadmap R).
 */
import { type FireLevel, higherFire } from "./fire";
import type { GameState } from "./types";

export interface Needs {
  /** The highest fire level a blocked row asked for this pass. */
  fire: FireLevel;
  /** The rows that asked, by label, for the debug reading. */
  fireBy: string[];
  /** Why the camp row could not raise the fire to that level, from its last try; empty when it could or did not try. */
  fireRefusal: string;
}

const ledgers = new WeakMap<GameState, Needs>();

export function needsOf(state: GameState): Needs {
  let n = ledgers.get(state);
  if (!n) {
    n = { fire: "none", fireBy: [], fireRefusal: "" };
    ledgers.set(state, n);
  }
  return n;
}

/** The start of a judgement pass: last pass's needs are gone, the refusal stays until the camp row tries again. */
export function clearNeeds(state: GameState): void {
  const n = needsOf(state);
  n.fire = "none";
  n.fireBy = [];
}

export function publishFireNeed(state: GameState, level: FireLevel, by: string): void {
  const n = needsOf(state);
  n.fire = higherFire(n.fire, level);
  if (!n.fireBy.includes(by)) n.fireBy.push(by);
}

export function setFireRefusal(state: GameState, why: string): void {
  needsOf(state).fireRefusal = why;
}
