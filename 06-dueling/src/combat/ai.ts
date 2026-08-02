import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { AttackKind, Intent, WeaponProfile } from "./types";

export type AiMode = 0 | 1 | 2 | 3;

export const AI_REACTION_MS = 180;
/**
 * Mode 2 is a drill metronome: a fixed, weapon-independent onset beat to
 * train reads against, in real clock time. It must exceed the slowest
 * attack's whiff commitment for every weapon or the beat silently drifts
 * (an attack scheduled mid-recovery starts late); a test enforces this.
 */
export const DRILL_INTERVAL_MS = 2000;

/**
 * Mode 3's cycle floor. This is a structural guarantee, not a personality
 * knob: the cooldown runs concurrently with the attack, so it only shapes
 * behavior as a floor on the whole attack cycle - and the retire step can
 * only ever fire if that floor outlasts the thrust's worst-case (whiffed)
 * commitment. Deriving it from the weapon keeps the approach-strike-retire
 * pulse alive under any retuning. Personality-driven pacing, when it comes,
 * layers on top as fighter-cognition delays in plain milliseconds.
 */
export function duelistCooldown(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  const whiffCommit = t.windup + t.beat + t.strike + t.recovery * w.whiffRecoveryFactor;
  return whiffCommit + w.stepDuration + w.stancePause;
}

/**
 * Jitter on the duelist's decisions, as a fraction of its cycle floor. Big
 * enough to defeat anticipation, small enough that the pulse stays legible.
 * Jitter belongs on decisions only: varying a wind-up's length would break
 * the signalling grammar the player is meant to carry between opponents.
 */
export const DUELIST_JITTER = 0.25;

export const DEFAULT_SEED = 0x5eed;

export interface AiState {
  cooldown: number;
  next: AttackKind;
  rng: number;
}

/**
 * Seeded so a fight is reproducible from (seed, inputs) while staying
 * unpredictable to the player. Unseeded rng would be a hidden channel
 * inside the simulation and would make replays and tests diverge.
 */
export function createAiState(seed: number = DEFAULT_SEED): AiState {
  return { cooldown: 0, next: "thrust", rng: seed >>> 0 };
}

/** mulberry32: one multiply-xor round, returns [0, 1) and advances the state. */
function nextRandom(ai: AiState): number {
  ai.rng = (ai.rng + 0x6d2b79f5) >>> 0;
  let t = ai.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Decides side 1's intent. Deterministic given the AiState seed. */
export function aiDecide(d: Duel, mode: AiMode, ai: AiState, dt: number): Intent | null {
  if (mode === 0 || d.over) return null;
  const self = d.f[1];
  const opp = d.f[0];

  if (mode === 1) {
    if (opp.state.kind !== "attack") return null;
    // Read the threat, not the motion: neither fighter can move mid-attack,
    // so an attack launched from beyond the attacker's own reach can never
    // land. A fencer does not parry out-of-measure attacks; neither does
    // the dummy.
    if (gapOf(d) > opp.weapon.reach) return null;
    const { phase, elapsedMs, timeline } = opp.state;
    if (phase === "recovery") return null;
    // Meet the blade as it commits: raise the guard so it is up when the
    // strike begins, which is when the blade first becomes meetable. The
    // attack's own timeline is the read - no re-derived phase arithmetic.
    const untilStrike = timeline.strikeStart - elapsedMs;
    if (
      elapsedMs >= AI_REACTION_MS &&
      untilStrike <= self.weapon.parryWindow * 0.5 &&
      self.state.kind === "idle" &&
      self.parryCd <= 0
    ) {
      return "parry";
    }
    return null;
  }

  // Modes 2 and 3 share the attack cooldown.
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  if (self.state.kind !== "idle") return null;
  if (opp.state.kind === "dead") return null;
  const zone = zoneFor(gapOf(d), self.weapon);

  if (mode === 2) {
    // The drill metronome: attack in place on a fixed beat, alternating
    // attacks so both cascades get practised. Predictability is the point.
    if (ai.cooldown > 0 || zone === "out") return null;
    return startAttack(ai, DRILL_INTERVAL_MS, alternate(ai));
  }

  // Mode 3, the duelist: approach until an extension can land (narrow
  // measure), strike, and back off out of danger while the cycle floor
  // recovers - approach, strike, retire. Its choice of attack and the
  // length of its wait are jittered so neither can be anticipated.
  if (zone !== "narrow") return "advance";
  if (ai.cooldown <= 0) {
    const floor = duelistCooldown(self.weapon);
    const wait = floor * (1 + DUELIST_JITTER * nextRandom(ai));
    return startAttack(ai, wait, nextRandom(ai) < 0.5 ? "thrust" : "cut");
  }
  return "retreat";
}

/** Strict alternation: the drill dummy's predictable attack order. */
function alternate(ai: AiState): AttackKind {
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  return attack;
}

function startAttack(ai: AiState, cooldown: number, attack: AttackKind): AttackKind {
  ai.cooldown = cooldown;
  return attack;
}
