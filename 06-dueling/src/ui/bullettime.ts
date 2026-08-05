import type { Duel } from "../combat/engine";

/**
 * Bullet time: while a bind runs - AND through its aftermath - the
 * wall-clock feed into the fixed-tick accumulator is scaled down, so the
 * pressure contest and its consequences play out slowly enough to read
 * and act on. This is deliberately a PRESENTATION effect, the same class
 * as pause and the [/] speed keys: the simulation stays a pure function
 * of ticks, every AI constant keeps meaning the same simulation
 * milliseconds, and replays and the golden hash cannot see it. What
 * changes is only how much wall time the player is given per tick -
 * which is the point: the human gets reading time, the deterministic sim
 * does not know.
 *
 * The transitions curve: `level` eases 0 -> 1 over BULLET_IN_MS of wall
 * time when a bind forms and back over BULLET_OUT_MS when its aftermath
 * ends, and the applied scale runs through a smoothstep of that level, so
 * both edges arrive and leave softly instead of snapping.
 */

/** Tick-feed multiplier at full depth. Retuned for the bind's tap-fast
 *  revision: the first cut erred on 0.12x for slow inspection, which
 *  stretched every pulse cooldown into multi-second wall waits and made
 *  the tapping feel dead. 0.45x keeps the cinematic slowdown while a
 *  tap cycle stays a sub-half-second wall rhythm. */
export const BULLET_TIME_SCALE = 0.45;
/** The AFTERMATH's deeper floor: the you-won-the-bind beat - kill or
 *  disarm, or scramble free - runs 3x slower again than the bind
 *  itself, because it is one read-and-choose moment, not a tap rhythm:
 *  the 240ms advantage window stretches to ~1.6s of wall clock. Only
 *  this beat deepens; the bind's tap tempo is untouched. */
export const BULLET_AFTERMATH_SCALE = 0.15;
/** Wall ms to curve fully in after the bind forms. */
export const BULLET_IN_MS = 600;
/** Wall ms to curve fully out after the bind resolves. */
export const BULLET_OUT_MS = 900;
/** Wall ms to curve out after a COMMITTED conversion: once the winner
 *  has chosen - thrust, disarm, or anything else that spends the
 *  advantage - the outcome is already decided and watching it crawl
 *  teaches nothing. Fast enough to read as immediate, still a curve,
 *  never a snap. */
export const BULLET_COMMIT_OUT_MS = 250;
/** Wall ms for the aftermath's extra deepening: fast, because the beat
 *  it protects is short - but curved, never a snap. */
export const BULLET_DEEPEN_MS = 200;

/**
 * Whether slowed time is warranted right now: the bind itself, and its
 * AFTERMATH - a fighter still turned out (exposed) or still holding the
 * bind advantage, which is exactly the kill-or-escape beat the slowdown
 * exists to make readable. An earlier cut released time the instant the
 * bind resolved, and the winner's thrust murdered the loser at full
 * speed before the resolution could even be seen. A decided duel is over:
 * the ease-out then plays through the death.
 */
export function bulletTimeActive(d: Duel | null): boolean {
  return bulletTimePhase(d) !== "off";
}

/** Which depth the moment warrants: the bind's tap-tempo slowdown, or
 *  the aftermath's deeper read-and-choose floor - which lasts exactly as
 *  long as the CHOICE is open: someone holds a live advantage. The
 *  moment it is spent (a conversion committed, any other action taken)
 *  or expires, the decision is made and time releases - the guaranteed
 *  execution needs no slow progress bar. (The exposed stagger alone no
 *  longer holds time: with the advantage gone the beat is over.) */
export function bulletTimePhase(d: Duel | null): "off" | "bind" | "aftermath" {
  if (d === null || d.over) return "off";
  if (d.bind !== null) return "bind";
  if (d.f.some((f) => f.bindAdvantageMs > 0)) return "aftermath";
  return "off";
}

export interface BulletTime {
  /** 0 = real time, 1 = fully in bullet time; eased linearly, shaped on read. */
  level: number;
  /** 0 = the bind's floor, 1 = the aftermath's deeper floor; eased on its
   *  own faster clock so the already-running slowdown deepens further the
   *  moment the bind resolves into the choice. */
  depth: number;
  /** Last target, for edge detection (null = never observed). */
  wasActive: boolean;
}

export function createBulletTime(): BulletTime {
  return { level: 0, depth: 0, wasActive: false };
}

/**
 * Advance the controller by one frame of wall time. Returns the edge this
 * frame crossed - "enter" the moment a bind takes hold of time, "exit" the
 * moment it lets go - so the caller can sound the transition cues exactly
 * once, at the transition.
 */
export function advanceBulletTime(
  bt: BulletTime,
  wallDtMs: number,
  phase: "off" | "bind" | "aftermath",
): "enter" | "exit" | null {
  const active = phase !== "off";
  const edge: "enter" | "exit" | null =
    active && !bt.wasActive ? "enter" : !active && bt.wasActive ? "exit" : null;
  bt.wasActive = active;
  // Leaving from the aftermath depth means a conversion was committed:
  // the fast exit. Every other release keeps the standard curve.
  const outMs = bt.depth > 0 ? BULLET_COMMIT_OUT_MS : BULLET_OUT_MS;
  const step = active ? wallDtMs / BULLET_IN_MS : -wallDtMs / outMs;
  bt.level = Math.max(0, Math.min(1, bt.level + step));
  // The deepening: toward 1 while the aftermath runs, on its own fast
  // clock. On the way OUT it holds and lets the main level carry the
  // ease back to real time (the scale releases from wherever it was, no
  // pop), resetting once time is fully released.
  if (phase === "aftermath") {
    bt.depth = Math.min(1, bt.depth + wallDtMs / BULLET_DEEPEN_MS);
  } else if (bt.level === 0) {
    bt.depth = 0;
  }
  return edge;
}

/** The multiplier to apply to the accumulator's wall-time feed. */
export function bulletTimeScale(bt: BulletTime): number {
  const smooth = (x: number): number => x * x * (3 - 2 * x);
  // The floor slides from the bind's scale to the aftermath's as depth
  // eases in; the main level then blends real time toward that floor.
  const floor =
    BULLET_TIME_SCALE - (BULLET_TIME_SCALE - BULLET_AFTERMATH_SCALE) * smooth(bt.depth);
  return 1 - (1 - floor) * smooth(bt.level);
}
