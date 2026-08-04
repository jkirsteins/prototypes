import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import { yieldOpportunity } from "./bind";
import { TICK, guardEffective, guardFormationMs, lineOf } from "./fighter";
import type { Duel } from "./engine";
import type { Fighter } from "./fighter";
import type { AttackKind, Height, Intent, Line, WeaponProfile } from "./types";

/** Mode 4 is the duelist with the stance tell amputated - a testing mode. */
export type AiMode = 0 | 1 | 2 | 3 | 4;

/**
 * The AI's reaction is a seeded draw, not a constant: base plus a uniform
 * jitter, so every reaction lands in [200, 420]ms. A fixed number made the
 * AI a metronome the player could set a clock by; jitter per episode makes
 * each read humanly uneven while (seed, inputs) still replays exactly. One
 * draw is held for the whole episode - the threshold must not wander while
 * a single stimulus is being reacted to - and consumed when the decision
 * fires, so the next stimulus gets a fresh draw.
 */
export const AI_REACTION_BASE_MS = 280;
export const AI_REACTION_JITTER_MS: readonly [number, number] = [-80, 140];
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
export const DRILL_INTERVAL_MS = 2400;
// (2400, not 2000: preparation-and-readiness folded the telegraph into
// every windup and scaled the punished recoveries to match, so the worst
// whiff commitment - the longsword cut's - grew to 2214ms. The beat must
// outlast it or the drill silently drifts; a test enforces exactly this.)

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
  /** Mode 1: reaction clock toward releasing a guard whose threat is gone. */
  releaseInMs: number;
  /**
   * Modes 3/4: the one live threat - a visible, in-measure attack,
   * identified by its start instant. One seeded roll per threat decides
   * the answer once the reaction elapses; back-to-back attacks latch
   * distinct threats with distinct rolls. `line` is the threat's line as
   * the policy last legitimately read it: a redirect younger than the
   * drawn reaction is invisible, so the read lags the lie by design.
   */
  threat: {
    startedAt: number;
    roll: number;
    answered: boolean;
    answer: "guard" | "retreat" | "counter" | "stand" | null;
    line: Line | null;
    /** The retreat draw is one step, not a rout: fired once. */
    executed: boolean;
  } | null;
  /**
   * Modes 3/4: the in-bind policy state, created at bind entry and cleared
   * when the bind ends. The temperament is one seeded draw; `obs` is the
   * ring buffer of per-tick observations that makes every read delayed -
   * a decision consumes the newest sample at least the drawn reaction
   * old, never the current tick.
   */
  bind: {
    /** 0 patient .. 1 relentless: pulse cadence, and how readily the
     *  duelist keeps pressing while being pushed. */
    aggression: number;
    /** Earliest bind time for the next pulse; redrawn after each one. */
    nextPressAtMs: number;
    obs: Array<{ t: number; control: number; opportunity: boolean }>;
    /** The conversion plan, drawn AT ENTRY (disarming §5.1): what winning
     *  this bind would be for. Anticipation, because the resolution tick
     *  is younger than any legal read - a fencer who knows what the win
     *  is for before it comes. The thrust is excluded at entry when the
     *  frozen gap exceeds its reach; the disarm needs no gate. */
    conversionPlan: "thrust" | "disarm" | "withdraw";
    conversionDelayMs: number;
  } | null;
  /** The plan, transferred out of ai.bind on the first decide after a WON
   *  bind (ai.bind dies with the bind state; a plan stored there would
   *  die on the winning tick). While this exists it OWNS the AI's output. */
  conversion: { plan: "thrust" | "disarm" | "withdraw"; dueAt: number } | null;
  /** The current episode's drawn reaction; consumed and redrawn on each fired decision. */
  reactionMs: number;
  rng: number;
}

/**
 * Seeded so a fight is reproducible from (seed, inputs) while staying
 * unpredictable to the player. Unseeded rng would be a hidden channel
 * inside the simulation and would make replays and tests diverge.
 */
export function createAiState(seed: number = DEFAULT_SEED): AiState {
  const ai: AiState = {
    cooldown: 0, next: "thrust", nextHeight: "low",
    plan: null, lastHeight: null, sameHeightRun: 0,
    releaseInMs: 0,
    threat: null,
    bind: null,
    conversion: null,
    reactionMs: 0,
    rng: seed >>> 0,
  };
  ai.reactionMs = drawReaction(ai);
  return ai;
}

/** mulberry32: one multiply-xor round, returns [0, 1) and advances the state. */
function nextRandom(ai: AiState): number {
  ai.rng = (ai.rng + 0x6d2b79f5) >>> 0;
  let t = ai.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** One reaction episode's threshold: base plus uniform jitter, in [200, 420]. */
export function drawReaction(ai: AiState): number {
  const [lo, hi] = AI_REACTION_JITTER_MS;
  return AI_REACTION_BASE_MS + lo + (hi - lo) * nextRandom(ai);
}

/** Decides side 1's intent. Deterministic given the AiState seed. */
export function aiDecide(d: Duel, mode: AiMode, ai: AiState, dt: number): Intent | null {
  if (mode === 0 || d.over) return null;
  const self = d.f[1];
  const opp = d.f[0];

  if (mode === 1) {
    // A held guard whose threat is gone comes down after a reaction: the
    // dummy holds THROUGH the attack, then lowers and recovers for the
    // next rep. (A deflection consumes the guard by itself.)
    if (self.parry !== null && opp.state.kind !== "attack") {
      ai.releaseInMs += dt;
      if (ai.releaseInMs >= ai.reactionMs) {
        ai.releaseInMs = 0;
        ai.reactionMs = drawReaction(ai);
        return "parryRelease";
      }
      return null;
    }
    ai.releaseInMs = 0;
    if (opp.state.kind !== "attack") return null;
    // Read the threat, not the motion: neither fighter can move mid-attack,
    // so an attack launched from beyond the attacker's own reach can never
    // land. A fencer does not parry out-of-measure attacks; neither does
    // the dummy.
    if (gapOf(d) > opp.weapon.reach) return null;
    const { phase, elapsedMs } = opp.state;
    if (phase === "recovery") return null;
    // The stance first: a guard only covers its height, so a dummy at the
    // wrong one must travel - heightChangeMs the player can watch it pay.
    // The press's side target is inferred by the engine from this same
    // visible attack, like any press.
    const threatHeight = opp.state.height;
    if (
      elapsedMs >= ai.reactionMs &&
      self.height !== threatHeight &&
      self.heightTo === null &&
      self.parry === null &&
      self.state.kind === "ready"
    ) {
      ai.reactionMs = drawReaction(ai);
      return threatHeight === "high" ? "stanceUp" : "stanceDown";
    }
    // A latched guard whose attack has visibly changed line gets one
    // correction, after a reaction time: the mismatched axis shifts.
    if (
      self.parry !== null &&
      self.parry.phase === "held" &&
      opp.state.redirectedAtMs !== null &&
      opp.state.elapsedMs - opp.state.redirectedAtMs >= ai.reactionMs
    ) {
      const theirs = lineOf(opp);
      const covered = self.parry.coveredLine;
      if (covered.height !== theirs.height) {
        ai.reactionMs = drawReaction(ai);
        return theirs.height === "high" ? "stanceUp" : "stanceDown";
      }
      if (covered.side !== theirs.side) {
        ai.reactionMs = drawReaction(ai);
        return "sideShift";
      }
    }
    // With no expiry there is nothing to centre a press inside: the dummy
    // presses as soon as it has reacted and its stance has arrived, and
    // HOLDS. The rise and the stance travel still decide what it can
    // answer - the documented failures (the rapier thrust) stay failures.
    if (
      elapsedMs >= ai.reactionMs &&
      self.state.kind === "ready" &&
      self.parry === null &&
      self.stepRecoveryMs <= 0 &&
      self.parryRecoveryMs <= 0
    ) {
      ai.reactionMs = drawReaction(ai);
      return "parry";
    }
    return null;
  }

  // Modes 2 and 3 share the attack cooldown. It ticks in every state -
  // an attack in flight does not pause the cycle.
  ai.cooldown = Math.max(0, ai.cooldown - dt);

  // The bind contest: the duelist plays the same pressure/yield game as
  // the player, through the same intents, paying the same commitment. It
  // reads only DELAYED observations - each tick's control and yield
  // window enter a ring buffer, and a decision consumes the newest sample
  // at least the drawn reaction old, never the current tick - so a yield
  // it misses was missed by its reaction or its own spent recovery, never
  // by a scripted error. The temperament (one seeded draw at entry) sets
  // the pulse cadence and how stubbornly it presses while being pushed:
  // across seeds it leans on sustained pressure, probes with spaced
  // pulses, or holds yield-ready.
  // Leaving the bind: the FIRST decide after the teardown transfers the
  // entry-drawn conversion plan if the bind was won (a copy, never a
  // draw), or discards it - then, while ai.conversion exists, it OWNS
  // the output before every normal policy branch: the pulse issuing a
  // step or attack during the 0-60ms delay would consume the advantage
  // through the cleared-by-anything rule and destroy the plan.
  if (self.state.kind !== "bind") {
    if (ai.bind !== null) {
      if (self.bindAdvantageMs > 0) {
        ai.conversion = { plan: ai.bind.conversionPlan, dueAt: d.time + ai.bind.conversionDelayMs };
      }
      ai.bind = null;
    }
    if (ai.conversion !== null) {
      if (self.bindAdvantageMs <= 0) {
        ai.conversion = null; // the advantage died first: plan moot
        return null;
      }
      if (d.time < ai.conversion.dueAt) return null; // committed, waiting
      const plan = ai.conversion.plan;
      ai.conversion = null;
      return plan === "withdraw" ? "retreat" : plan;
    }
  }
  if ((mode === 3 || mode === 4) && self.state.kind === "bind" && d.bind !== null) {
    const bind = d.bind;
    if (ai.bind === null) {
      const aggression = nextRandom(ai);
      const nextPressAtMs = 60 + nextRandom(ai) * 240;
      // The conversion plan: personality over the conversions the entry
      // arithmetic allows. The gap is frozen from the entry tick, so the
      // reach gate reads entry-observable state - no reaction-time
      // exception is needed and none is taken. Weights 0.40/0.40/0.20,
      // renormalized to 2/3, 1/3 when the thrust cannot land.
      const inReach = gapOf(d) <= self.weapon.reach;
      const roll = nextRandom(ai);
      const conversionPlan: "thrust" | "disarm" | "withdraw" = inReach
        ? roll < 0.4 ? "thrust" : roll < 0.8 ? "disarm" : "withdraw"
        : roll < 2 / 3 ? "disarm" : "withdraw";
      const conversionDelayMs = nextRandom(ai) * 60;
      ai.bind = { aggression, nextPressAtMs, obs: [], conversionPlan, conversionDelayMs };
    }
    const bs = ai.bind;
    bs.obs.push({ t: bind.t, control: bind.control, opportunity: yieldOpportunity(bind, 1) });
    if (bs.obs.length > 120) bs.obs.shift();
    let delayed: (typeof bs.obs)[number] | null = null;
    for (let i = bs.obs.length - 1; i >= 0; i--) {
      if (bs.obs[i].t <= bind.t - ai.reactionMs) {
        delayed = bs.obs[i];
        break;
      }
    }
    if (delayed === null) return null; // nothing old enough to react to
    if (bind.action[1].kind !== "ready") return null; // committed: pay it out
    // Yield only on a delayed sighting of the honest window (a gap in the
    // opponent's beats with catchable force). Every attempt is a gamble
    // that the gap still exists when the K lands - a mistimed K commits a
    // doomed rotation - and that risk is the design, not a flaw: an
    // earlier extrapolating read fired K regardless of whose beat ran,
    // which under punished mistimes was seeded self-destruction.
    if (delayed.opportunity) {
      ai.reactionMs = drawReaction(ai);
      return "yield";
    }
    if (bind.t >= bs.nextPressAtMs) {
      // Being pushed toward its own loss, a patient duelist holds its
      // readiness for the coming yield window instead of spending it.
      if (delayed.control <= -0.35 && bs.aggression < 0.5) {
        bs.nextPressAtMs = bind.t + 90;
        return null;
      }
      // Humanlike cadence, never a metronome: the base sits NEAR the
      // pulse cycle rather than at it, every gap is jittered, and a
      // seeded breather interrupts the bursts - so a player who commits
      // to a sustained mash gains real ground during the rests. The
      // imperfection lives entirely in timing (the constitution's rule),
      // and a metronomic AI was unbeatable in the tap war by any human.
      const breather = nextRandom(ai) < 0.2;
      const gap = breather
        ? 400 + nextRandom(ai) * 350
        : (215 + (1 - bs.aggression) * 265) * (0.8 + 0.5 * nextRandom(ai));
      bs.nextPressAtMs = bind.t + gap;
      return "press";
    }
    return null;
  }
  if (self.state.kind === "bind") return null; // modes 1/2 always hold

  // Mode 3 reads the defender WHILE attacking: a guard that has stood
  // long enough to react to, aimed exactly at this attack's line, gets
  // redirected - the side swap, the cheapest escape. Purely reactive, no
  // rng: deterministic and unpredictable, because it depends on what the
  // player did. The window is the sold half of the windup, same as the
  // player's. Mode 3 ONLY: mode 4 is the testing dummy with the lies
  // amputated - no stance tell, and no redirects either, so its attacks
  // fly exactly where they launched.
  if (mode === 3 && self.state.kind === "attack") {
    const s = self.state;
    if (
      s.phase === "windup" &&
      !s.redirected &&
      s.elapsedMs < s.timeline.strikeStart
    ) {
      const g = opp.parry;
      if (g !== null && g.visibleMs >= ai.reactionMs) {
        const mine = lineOf(self);
        if (g.coveredLine.height === mine.height && g.coveredLine.side === mine.side) {
          ai.reactionMs = drawReaction(ai);
          return s.attack === "cut" ? "thrust" : "cut";
        }
      }
    }
    return null;
  }
  // The defence policy (duelist-defence): a visible, in-measure attack
  // latches ONE threat with one seeded roll over four answers - guard
  // 0.40, retreat 0.20, counter-attack 0.15, stand 0.25 - fired after
  // the drawn reaction. The guard answer checks feasibility with the
  // engine's own arithmetic (guardFormationMs) and downgrades honestly
  // to retreat; the counter is drawn like a normal plan, and its
  // crossing is the duelist's one door into the bind. Either way, while
  // a live blade points at it the duelist NEVER closes: the whole
  // approach/attack pulse below is suppressed until the threat resolves.
  if (mode === 3 || mode === 4) {
    const os = opp.state;
    if (os.kind !== "attack" || os.phase === "recovery") {
      ai.threat = null;
    } else {
      // An in-measure attack is a THREAT and gets one answered roll; an
      // out-of-measure one is theatre and gets none (mode 1's rule). But
      // a live blade suppresses closing EITHER way - the first cut of
      // this reflex only suppressed in measure, and the duelist's
      // approach pulse marched it back into a still-flying cut the
      // moment its own retreat had carried it out of reach.
      if (gapOf(d) <= opp.weapon.reach) {
        // The latch waits out the duelist's own attack: committed is
        // committed, the trade stands, and no roll burns until the
        // blade comes home.
        const startedAt = d.time - os.elapsedMs;
        if (
          self.state.kind !== "attack" &&
          (ai.threat === null || Math.abs(ai.threat.startedAt - startedAt) >= TICK / 2)
        ) {
          ai.threat = {
            startedAt, roll: nextRandom(ai),
            answered: false, answer: null, line: lineOf(opp), executed: false,
          };
        }
        const th = ai.threat;
        if (
          th !== null &&
          !th.answered &&
          os.elapsedMs >= ai.reactionMs &&
          self.state.kind === "ready" &&
          self.stepRecoveryMs <= 0
        ) {
          th.answered = true;
          const reaction = ai.reactionMs;
          ai.reactionMs = drawReaction(ai);
          // The read is delayed: the line latched with the threat is the
          // pre-redirect original, and it refreshes to the current line
          // only when any redirect is older than the reaction - a young
          // lie is invisible, so the decision aims where the attack
          // stood before it. (The side of any press still rides the
          // engine's inference from the CURRENT visible attack - the
          // same sugar the player's press gets.)
          if (os.redirectedAtMs === null || os.elapsedMs - os.redirectedAtMs >= reaction) {
            th.line = lineOf(opp);
          }
          th.answer =
            th.roll < 0.4 ? "guard"
            : th.roll < 0.6 ? "retreat"
            : th.roll < 0.75 ? "counter"
            : "stand";
          // A defence pre-empts a pending unthrown plan; stand lets it
          // proceed (committed is committed - its stance move already told).
          if (th.answer !== "stand") ai.plan = null;
          if (th.answer === "counter") ai.plan = drawPlan(self, opp, ai, mode);
        }
        if (th?.answered) {
          if (th.answer === "guard") {
            const intent = guardAnswer(self, opp, ai, th);
            if (th.answer === "guard") return intent;
            // downgraded: fall through to the retreat branch this tick
          }
          if (th.answer === "retreat") {
            if (
              !th.executed &&
              self.state.kind === "ready" &&
              self.stepRecoveryMs <= 0
            ) {
              th.executed = true;
              return "retreat";
            }
            return null;
          }
          if (th.answer === "counter") {
            if (self.state.kind === "ready" && self.stepRecoveryMs <= 0) {
              return executePlan(self, ai);
            }
            return null;
          }
          // stand: no defensive action - but a plan decided BEFORE the
          // threat still proceeds.
          if (ai.plan !== null && self.state.kind === "ready" && self.stepRecoveryMs <= 0) {
            return executePlan(self, ai);
          }
        }
      } else {
        ai.threat = null;
      }
      return null; // a fencer does not walk onto a blade
    }
    // No live threat: a guard left standing from an answered one comes
    // down after a reaction, exactly mode 1's release lifecycle - the
    // duelist pays the input lifecycle like anyone else, and a guard
    // that never came down would be a permanent wall the menu never
    // priced.
    if (self.parry !== null && os.kind !== "attack") {
      ai.releaseInMs += dt;
      if (ai.releaseInMs >= ai.reactionMs) {
        ai.releaseInMs = 0;
        ai.reactionMs = drawReaction(ai);
        return "parryRelease";
      }
      return null;
    }
    ai.releaseInMs = 0;
  }

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
    ai.plan = drawPlan(self, opp, ai, mode);
    return executePlan(self, ai);
  }
  return "retreat";
}

/**
 * One attack plan, drawn the one way the duelist draws attacks: seeded
 * kind and height, the anti-repeat cap, the standing-guard avoid, and
 * mode 4's pinned height. The pulse and the counter-attack answer share
 * this, so a counter is drawn exactly like a planned attack - same
 * draws, same stance-first tell, no special counter grammar to learn.
 */
function drawPlan(
  self: Fighter,
  opp: Fighter,
  ai: AiState,
  mode: AiMode,
): { attack: AttackKind; height: Height } {
  const attack: AttackKind = nextRandom(ai) < 0.5 ? "thrust" : "cut";
  let height: Height = nextRandom(ai) < 0.5 ? "high" : "low";
  if (height === ai.lastHeight && ai.sameHeightRun >= 2) {
    height = height === "high" ? "low" : "high";
  }
  // A standing guard is row-3 information: launch where it is not.
  // The draws above still burn, so replays stay comparable.
  if (opp.parry !== null && guardEffective(opp)) {
    height = opp.parry.coveredLine.height === "high" ? "low" : "high";
  }
  // Mode 4: the same duelist with the stance tell amputated - every
  // draw above still burns, so a seeded mode-3 and mode-4 fight stay
  // comparable, but the plan is pinned to the standing height and
  // executePlan therefore never moves the stance. A testing mode: what
  // is still readable without the tell is exactly what it isolates.
  if (mode === 4) height = self.height;
  ai.sameHeightRun = height === ai.lastHeight ? ai.sameHeightRun + 1 : 1;
  ai.lastHeight = height;
  return { attack, height };
}

/**
 * Carry the guard answer out against whatever the guard is already doing
 * (duelist-defence §4.2.1): press from cold - stance first - keep holding
 * a matching line, shift a wrong one, let an in-motion travel arrive.
 * Every path checks feasibility with the engine's own arithmetic
 * (guardFormationMs, the same function the parry acceptance runs) and
 * downgrades to retreat - by rewriting th.answer, which the caller then
 * executes - whenever the steel cannot arrive before parryableUntil: a
 * press that cannot form is noise, not imperfection. The wrong-line
 * correction doubles as the line-feints shift reflex: th.line refreshes
 * only once a redirect is older than the drawn reaction, so a lie told
 * inside the duelist's shift latency defeats the guard exactly as it
 * defeats a human.
 */
function guardAnswer(
  self: Fighter,
  opp: Fighter,
  ai: AiState,
  th: NonNullable<AiState["threat"]>,
): Intent | null {
  const os = opp.state;
  if (os.kind !== "attack") return null;
  if (os.redirectedAtMs === null || os.elapsedMs - os.redirectedAtMs >= ai.reactionMs) {
    th.line = lineOf(opp);
  }
  const line = th.line;
  if (line === null) return null;
  const deadline = os.timeline.parryableUntil;
  const p = self.parry;
  if (p === null) {
    if (self.state.kind !== "ready") return null; // feet committed: wait
    if (os.elapsedMs + self.parryRecoveryMs + guardFormationMs(self, line) > deadline) {
      th.answer = "retreat";
      return null;
    }
    if (self.height !== line.height && self.heightTo === null) {
      return line.height === "high" ? "stanceUp" : "stanceDown";
    }
    if (self.parryRecoveryMs > 0) return null; // press the moment it clears
    return "parry";
  }
  if (p.phase === "held") {
    if (p.coveredLine.height === line.height && p.coveredLine.side === line.side) {
      return null; // the answer is to keep holding
    }
    if (p.coveredLine.height !== line.height) {
      if (os.elapsedMs + self.weapon.guardShiftMs > deadline) {
        th.answer = "retreat";
        return null;
      }
      return line.height === "high" ? "stanceUp" : "stanceDown";
    }
    if (os.elapsedMs + self.weapon.sideChangeMs > deadline) {
      th.answer = "retreat";
      return null;
    }
    return "sideShift";
  }
  // Rising or shifting: a travel toward the threat that arrives in time
  // needs nothing; a shift whose OLD line matches stays covered for as
  // long as it runs (held-guard's old-line-holds rule). Anything else
  // cannot retarget mid-travel - downgrade.
  const arrivesAt = os.elapsedMs + (p.phaseDurationMs - p.phaseMs);
  const toward =
    p.targetLine.height === line.height && p.targetLine.side === line.side;
  const oldCovers =
    p.phase === "shifting" &&
    p.coveredLine.height === line.height &&
    p.coveredLine.side === line.side;
  if (oldCovers || (toward && arrivesAt <= deadline)) return null;
  th.answer = "retreat";
  return null;
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
