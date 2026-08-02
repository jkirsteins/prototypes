import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { Fighter } from "./fighter";
import type { AttackKind, Height, Intent, WeaponProfile } from "./types";

export type AiMode = 0 | 1 | 2 | 3;

export const AI_REACTION_MS = 180;
/**
 * The human budget the reaction-matrix test is computed against: seeing an
 * attack and deciding takes about this long, before any blade or body
 * starts moving. A design constant, not a measured player property.
 */
export const PLAYER_REACTION_MS = 250;
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
  return whiffCommit + w.stepDuration + w.stepRecoveryMs;
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
  /** Mode 2: the height half of the four-line drill cycle. */
  nextHeight: Height;
  /**
   * Mode 3: the decided-but-not-yet-thrown attack. The height is chosen
   * with the attack, and the stance moves FIRST - physically honest, and
   * a second tell the player can read before the telegraph even starts.
   */
  plan: { attack: AttackKind; height: Height } | null;
  /** Mode 3 anti-repeat: a seeded run must never read as "always low". */
  lastHeight: Height | null;
  sameHeightRun: number;
  rng: number;
}

/**
 * Seeded so a fight is reproducible from (seed, inputs) while staying
 * unpredictable to the player. Unseeded rng would be a hidden channel
 * inside the simulation and would make replays and tests diverge.
 */
export function createAiState(seed: number = DEFAULT_SEED): AiState {
  return {
    cooldown: 0, next: "thrust", nextHeight: "low",
    plan: null, lastHeight: null, sameHeightRun: 0,
    rng: seed >>> 0,
  };
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
    // The stance first: a guard only covers its height, so a dummy at the
    // wrong one must travel - heightChangeMs the player can watch it pay.
    // The press's side target is inferred by the engine from this same
    // visible attack, like any press.
    const threatHeight = opp.state.height;
    if (
      elapsedMs >= AI_REACTION_MS &&
      self.height !== threatHeight &&
      self.heightTo === null &&
      self.parry === null &&
      self.state.kind === "ready"
    ) {
      return threatHeight === "high" ? "stanceUp" : "stanceDown";
    }
    // Meet the blade as it commits: press so the guard is FORMED when the
    // strike begins - the press must lead by the rise, plus half the
    // effective span as margin. With rise 0 this reduces to the old
    // half-window heuristic; with it, the dummy visibly cannot answer
    // attacks whose preparation is shorter than reaction + rise (the
    // rapier thrust - a documented, tested failure, not a bug), nor ones
    // whose preparation is shorter than reaction + the stance travel.
    const untilStrike = timeline.strikeStart - elapsedMs;
    const lead = self.weapon.parryRiseMs + (self.weapon.parryWindowMs - self.weapon.parryRiseMs) * 0.5;
    if (
      elapsedMs >= AI_REACTION_MS &&
      untilStrike <= lead &&
      self.state.kind === "ready" &&
      self.parry === null &&
      self.stepRecoveryMs <= 0 &&
      self.parryRecoveryMs <= 0
    ) {
      return "parry";
    }
    return null;
  }

  // Modes 2 and 3 share the attack cooldown.
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  // Free to act means the settle is over too: deciding during it would
  // buffer the attack, burn the cooldown at decision time, and let the
  // next tick's movement intent overwrite the slot - the attack would
  // evaporate. The AI waits the settle out, as it waited out the old
  // pause state.
  if (self.state.kind !== "ready" || self.stepRecoveryMs > 0) return null;
  if (opp.state.kind === "dead") return null;
  const zone = zoneFor(gapOf(d), self.weapon);

  if (mode === 2) {
    // The drill metronome: attack in place on a fixed beat. The attack
    // alternates every beat and the height flips after each cut, so a full
    // cycle drills all four reachable lines - thrust low, cut low, thrust
    // high, cut high - in a fixed, countable order. Predictability is the
    // point, and so is the visible stance move before the off-height beats.
    if (ai.plan === null) {
      if (ai.cooldown > 0 || zone === "out") return null;
      const attack = alternate(ai);
      const height = ai.nextHeight;
      if (attack === "cut") ai.nextHeight = ai.nextHeight === "low" ? "high" : "low";
      ai.plan = { attack, height };
      ai.cooldown = DRILL_INTERVAL_MS;
    }
    return executePlan(self, ai);
  }

  // Mode 3, the duelist: approach until an extension can land (narrow
  // measure), strike, and back off out of danger while the cycle floor
  // recovers - approach, strike, retire. Attack, height and wait are all
  // seeded draws, so none can be anticipated - but the height is executed
  // as a stance move BEFORE the attack, which is a tell the player can
  // read. An anti-repeat cap (never three at one height) keeps a seeded
  // run from reading as "always low".
  if (ai.plan !== null) {
    if (zone !== "narrow") return "advance"; // re-close, the decision stands
    return executePlan(self, ai);
  }
  if (zone !== "narrow") return "advance";
  if (ai.cooldown <= 0) {
    const floor = duelistCooldown(self.weapon);
    ai.cooldown = floor * (1 + DUELIST_JITTER * nextRandom(ai));
    const attack: AttackKind = nextRandom(ai) < 0.5 ? "thrust" : "cut";
    let height: Height = nextRandom(ai) < 0.5 ? "high" : "low";
    if (height === ai.lastHeight && ai.sameHeightRun >= 2) {
      height = height === "high" ? "low" : "high";
    }
    ai.sameHeightRun = height === ai.lastHeight ? ai.sameHeightRun + 1 : 1;
    ai.lastHeight = height;
    ai.plan = { attack, height };
    return executePlan(self, ai);
  }
  return "retreat";
}

/**
 * Carry a decided attack out physically: move the stance first, wait for
 * it to arrive, then throw. The caller has already established the body is
 * ready; the stance-first ordering is what turns a hidden decision into a
 * readable one.
 */
function executePlan(self: Fighter, ai: AiState): Intent | null {
  const p = ai.plan;
  if (p === null) return null;
  if (self.heightTo !== null) return null; // stance in motion: wait
  if (self.height !== p.height) return p.height === "high" ? "stanceUp" : "stanceDown";
  ai.plan = null;
  return p.attack;
}

/** Strict alternation: the drill dummy's predictable attack order. */
function alternate(ai: AiState): AttackKind {
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  return attack;
}
