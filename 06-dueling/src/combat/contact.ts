import { lineOf, TICK } from "./fighter";
import type { Fighter } from "./fighter";
import type { WeaponProfile } from "./types";

/**
 * Blade contact, in one module: the travel model and the two ways steel
 * meets steel. parryMeetsAttack and bladesCross are deliberately siblings -
 * the state-tracks spec promised geometry arrives in one place, and with
 * two kinds of contact the only way to keep that promise is to keep them
 * where they are read together. Line conditions (attack-lines) and travel
 * conditions (blade-contact) live here and nowhere else.
 */

/**
 * A sustained bind needs blades that can HOLD each other's lateral
 * pressure: stiffnesses within this band of each other. Below it the
 * stiffer blade simply blows the whippier one off line and the contact
 * deflects. 0.6 places the shipping pair correctly - the longsword mirror
 * (1.0/1.0) and the rapier mirror (0.35/0.35) both lock, longsword against
 * rapier (0.35) does not - and future swords land on whichever side their
 * stiffness puts them.
 */
export const BIND_STIFFNESS_RATIO = 0.6;

/**
 * Whether a contact between these two blades sustains into a bind, derived
 * from their physical properties - never a flag, never a pairwise table.
 * Symmetric by construction. When floppier steel arrives (a blade so
 * flexible that even its mirror cannot hold pressure), a stiffness floor
 * joins the ratio here, in this one function.
 */
export function canBind(a: WeaponProfile, b: WeaponProfile): boolean {
  const lo = Math.min(a.bladeStiffness, b.bladeStiffness);
  const hi = Math.max(a.bladeStiffness, b.bladeStiffness);
  return lo / hi >= BIND_STIFFNESS_RATIO;
}

/**
 * How far this fighter's blade extends from their body centre, in cm. The
 * blade extends linearly from the body to full reach across the travelling
 * half of the strike and holds full extension through the delivered half.
 * A strike is not a region that switches on - it is a blade moving, and
 * every contact rule reads its position from here. Anything that is not an
 * attacking strike has extension 0: a guard is a position, not a reach.
 */
export function extension(f: Fighter): number {
  const s = f.state;
  if (s.kind !== "attack" || s.phase !== "strike") return 0;
  const t = s.timeline;
  const travel = (s.elapsedMs - t.strikeStart) / (t.parryableUntil - t.strikeStart);
  return f.weapon.reach * Math.min(1, travel);
}

/**
 * Still in the meetable half: the blade is travelling, so it can find
 * steel. The tick that CROSSES parryableUntil still counts - the interval
 * a contact needs, [arrival, parryableUntil], can be narrower than one
 * tick (and at gap === reach it is exactly zero), so gating on the strict
 * boundary would make physically-met blades unlatchable whenever the
 * window falls between two ticks. Contact that exists inside a tick
 * belongs to that tick.
 */
function travelling(f: Fighter): boolean {
  const s = f.state;
  return s.kind === "attack" && s.phase === "strike" && s.elapsedMs < s.timeline.parryableUntil + TICK;
}

/**
 * True if the defender's raised parry meets this attack on this tick.
 * Contact needs: a travelling blade, arrived at the guard (its extension
 * covers the gap), a formed guard, and the attack's line matching the
 * parry's target line on BOTH axes. The covered line is what this reads -
 * never the defender's current stance, never any hidden final line of the
 * attack - so a guard whose snapshot a redirect has outdated visibly covers
 * the wrong line and misses.
 *
 * Sides match label-equal with no mirroring: a symmetric engagement folds
 * my inside and their inside onto the same crossing (quarte against quarte
 * is one blade contact in both fencers' inside lines).
 */
export function parryMeetsAttack(attacker: Fighter, defender: Fighter, gap: number): boolean {
  const s = attacker.state;
  if (!travelling(attacker) || s.kind !== "attack") return false;
  if (extension(attacker) < gap) return false; // not yet arrived at the guard
  const p = defender.parry;
  if (p === null) return false;
  // The travelling() grace tick covers the BLADE's quantization, never the
  // guard's lateness: on the tick that crosses parryableUntil, the guard
  // must have been formed by the deadline instant itself. settledMs counts
  // effective time (through shifts - the old line's coverage is unbroken),
  // so subtracting the attacker's overshoot reads formedness at exactly
  // that instant. While rising nothing is covered.
  if (p.phase === "rising") return false;
  const overshoot = Math.max(0, s.elapsedMs - s.timeline.parryableUntil);
  if (p.settledMs < overshoot) return false; // formed only after the deadline
  const covered = p.coveredLine;
  const line = lineOf(attacker);
  return line.height === covered.height && line.side === covered.side;
}

/** Steel is present in the line: in the strike, travelling or delivered. */
function inStrike(f: Fighter): boolean {
  return f.state.kind === "attack" && f.state.phase === "strike";
}

/**
 * True if two attacking blades cross on this tick. Symmetric in its
 * arguments: neither fighter is the defender. A TRAVELLING blade meets any
 * steel in its line - the other blade travelling toward it, or already
 * delivered but still standing in its strike: a delivered blade does not
 * vanish, it occupies the line until the strike ends. Only two delivered
 * blades never clash, because nothing is moving. Both must be on one line
 * (both axes) with their extensions together covering the gap, so the
 * clash tick depends on the distance and blades far apart in tempo never
 * meet at all.
 *
 * The one-travelling rule is also what makes answering an attack with an
 * attack humanly possible: requiring both blades in their travelling
 * halves gave the counter a press window narrower than a reaction time,
 * so every crossing had to be anticipated. Steel that stands in the line
 * widens it to a read.
 */
export function bladesCross(a: Fighter, b: Fighter, gap: number): boolean {
  if (!inStrike(a) || !inStrike(b)) return false;
  if (!travelling(a) && !travelling(b)) return false; // two delivered blades: nothing moves
  const la = lineOf(a);
  const lb = lineOf(b);
  if (la.height !== lb.height || la.side !== lb.side) return false;
  return extension(a) + extension(b) >= gap;
}
