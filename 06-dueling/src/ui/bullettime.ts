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
/** Wall ms to curve fully in after the bind forms. */
export const BULLET_IN_MS = 600;
/** Wall ms to curve fully out after the bind resolves. */
export const BULLET_OUT_MS = 900;

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
  if (d === null || d.over) return false;
  if (d.bind !== null) return true;
  return d.f.some((f) => f.state.kind === "exposed" || f.bindAdvantageMs > 0);
}

export interface BulletTime {
  /** 0 = real time, 1 = fully in bullet time; eased linearly, shaped on read. */
  level: number;
  /** Last target, for edge detection (null = never observed). */
  wasActive: boolean;
}

export function createBulletTime(): BulletTime {
  return { level: 0, wasActive: false };
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
  active: boolean,
): "enter" | "exit" | null {
  const edge: "enter" | "exit" | null =
    active && !bt.wasActive ? "enter" : !active && bt.wasActive ? "exit" : null;
  bt.wasActive = active;
  const step = active ? wallDtMs / BULLET_IN_MS : -wallDtMs / BULLET_OUT_MS;
  bt.level = Math.max(0, Math.min(1, bt.level + step));
  return edge;
}

/** The multiplier to apply to the accumulator's wall-time feed. */
export function bulletTimeScale(bt: BulletTime): number {
  const l = bt.level;
  const shaped = l * l * (3 - 2 * l); // smoothstep: soft at both ends
  return 1 - (1 - BULLET_TIME_SCALE) * shaped;
}
