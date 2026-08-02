import { attackTimeline, PARRYABLE_FRACTION } from "./weapons";
import type { AttackTimeline } from "./weapons";
import type { AttackKind, AttackPhase, Height, Intent, Line, Side, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;

export type FighterState =
  | { kind: "ready" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "void"; t: number }
  | {
      kind: "attack";
      attack: AttackKind;
      phase: AttackPhase;
      /** Absolute ms since attack start: the attack's only clock. */
      elapsedMs: number;
      /** The attack's boundaries, snapshotted at start. See AttackTimeline. */
      timeline: AttackTimeline;
      /**
       * The stance height at launch, snapshotted like the timeline: the
       * blade flies where it was aimed, and the stance moving afterwards
       * does not steer it.
       */
      height: Height;
      /** Set by the engine when a defending blade met this one inside the parryable window. */
      met: boolean;
      /** One redirect per attack: the lie has been told. */
      redirected: boolean;
      /** When the lie was told (attack clock), for reaction arithmetic. */
      redirectedAtMs: number | null;
    }
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };

/**
 * The timed defence, on its own track so it can coexist with locomotion:
 * a parry raised while ready persists through a subsequent step (you carry
 * a defence you already chose), but cannot be raised mid-step (you cannot
 * react while your feet are committed). Named parry, not guard - it
 * expires and recovers, so it is an action; "guard" stays reserved for
 * weapon positions.
 */
export interface ParryTrack {
  elapsedMs: number;
  /** Where the blade physically stood at the press: current height, guardSide. */
  fromLine: Line;
  /**
   * The one complete line this parry is forming toward, fixed at the press:
   * height from the stance (its destination if in motion - targeting a
   * height is allowed, covering it waits for the arrival), side from the
   * target the press inferred. The guard never retargets itself afterwards.
   */
  targetLine: Line;
  /**
   * When targetLine becomes covered: the max of the rise, the side rotation
   * (when the target side differed from guardSide) and the height arrival,
   * computed once at the press. They are concurrent travels; none adds to
   * another. Before this instant the parry covers nothing - naming the
   * unarrived target "covered" would be the instantaneous parry's lie
   * moved one level down.
   */
  effectiveAtMs: number;
  /**
   * The identity of the attack this parry latched onto at the press: the
   * absolute duel time that attack began, or null for a predictive cold
   * press. A latched parry waits for its attack instead of expiring on
   * the window - and ends with it, however it ends. It never retargets:
   * a redirect leaves the parry covering the line it snapshotted, which
   * is the whole reason a feint can work.
   */
  targetAttackStartTime: number | null;
  /** One shift per raise, whichever axis: a single lie corrected once. */
  shifted: boolean;
}

/**
 * The guard is formed and can meet a blade. Before this it is only visible:
 * every travel the press implied (rise, side rotation, height arrival) has
 * a duration, and the press is input to the simulation, never a formed
 * guard - the same rule every other action already follows.
 */
export function guardEffective(f: Fighter): boolean {
  return f.parry !== null && f.parry.elapsedMs >= f.parry.effectiveAtMs;
}

/**
 * The line an attack occupies: height from the launch snapshot, side from
 * the attack's own declaration. Nothing may infer either from the attack
 * kind - an inside cut is a data change, and this is where that promise
 * is kept.
 */
export function lineOf(f: Fighter): Line {
  if (f.state.kind !== "attack") throw new Error("lineOf: not attacking");
  return { height: f.state.height, side: f.weapon.attacks[f.state.attack].side };
}

export interface Fighter {
  x: number;
  facing: 1 | -1;
  weapon: WeaponProfile;
  state: FighterState;
  parry: ParryTrack | null;
  /**
   * The stance track: one held height per fighter, shared by attack and
   * defence. Attacks launch from it and the parry covers it, so moving to
   * threaten also tells the opponent where you will defend. While
   * heightTo is set the stance is in motion and covers nothing new -
   * `height` stays the old value for every contact decision.
   */
  height: Height;
  heightTo: Height | null;
  heightT: number;
  /**
   * Where the blade stands on the inside/outside axis when no parry is up:
   * the default a cold press covers. Initially inside; updated when a
   * parry's side travel completes, so the guard defaults to where it last
   * stood.
   */
  guardSide: Side;
  buffered: Intent | null;
  /**
   * Settle time left after a step: while > 0, non-parry intents buffer
   * instead of starting, and the buffer flushes when it reaches 0. The
   * same concept as parryRecoveryMs - "time until X is available" is a
   * timer on the fighter, not a state.
   */
  stepRecoveryMs: number;
  /** Time until the next parry is available. Gates only the parry. */
  parryRecoveryMs: number;
}

export type FighterEvent =
  | { type: "strikeEnd"; attack: AttackKind }
  /** The blade begins to travel: the windup-to-strike transition. */
  | { type: "strikeBegin" }
  /** A foot plants: a step or void hop finishing its travel. */
  | { type: "footfall" }
  | { type: "died" };

export function createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter {
  return {
    x, facing, weapon, state: { kind: "ready" }, parry: null,
    height: "low", heightTo: null, heightT: 0, guardSide: "inside",
    buffered: null, stepRecoveryMs: 0, parryRecoveryMs: 0,
  };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { windupBonusMs?: number; targetSide?: Side; targetAttackStartTime?: number },
): "accepted" | "buffered" | "ignored" {
  const k = f.state.kind;
  if (k === "dead" || k === "hitstun") return "ignored";
  // A feint abandons a windup in progress: commitment is the windup ->
  // strike transition, so this is the one door out of an attack, and it
  // leads into a short recovery, not into another action. Never queued -
  // a buffered feint would fire at nothing.
  if (intent === "feint") {
    const s = f.state;
    if (s.kind === "attack" && s.phase === "windup") {
      s.phase = "recovery";
      s.timeline = {
        ...s.timeline,
        recoveryStart: s.elapsedMs,
        recoveryEnd: s.elapsedMs + f.weapon.feintRecoveryMs,
      };
      return "accepted";
    }
    return "ignored";
  }
  // Anywhere in the windup, the attack can be re-aimed - the same door the
  // F-cancel uses, closing at strikeStart: an arrow redirects its height,
  // the other attack key its side. Once. (An earlier draft opened only the
  // beat's 60-100ms - a window a human cannot hit; redirecting early is
  // legal and merely a weak feint, since the true line telegraphs longer.)
  if (intent === "stanceUp" || intent === "stanceDown" || intent === "cut" || intent === "thrust") {
    const s = f.state;
    if (
      s.kind === "attack" &&
      s.phase === "windup" &&
      !s.redirected &&
      s.elapsedMs < s.timeline.strikeStart
    ) {
      if (intent === "stanceUp" || intent === "stanceDown") {
        const toHeight: Height = intent === "stanceUp" ? "high" : "low";
        if (toHeight === s.height) return "ignored"; // not a lie: already there
        return redirectAttack(f, s.attack, toHeight);
      }
      if (intent !== s.attack) return redirectAttack(f, intent, s.height);
      return "ignored"; // the same kind again is not a redirect
    }
  }
  // A raised, formed guard may shift its covered line once per raise: an
  // arrow travels it to the other height (guardShiftMs), a second parry
  // press re-aims its side (sideChangeMs, same inference as the press).
  // The old line stays covered until the shift completes.
  if ((intent === "stanceUp" || intent === "stanceDown") && f.parry !== null) {
    const p = f.parry;
    if (p.shifted || p.elapsedMs < p.effectiveAtMs) return "ignored";
    const toHeight: Height = intent === "stanceUp" ? "high" : "low";
    if (toHeight === p.targetLine.height) return "ignored";
    p.fromLine = p.targetLine;
    p.targetLine = { height: toHeight, side: p.targetLine.side };
    p.effectiveAtMs = p.elapsedMs + f.weapon.guardShiftMs;
    p.shifted = true;
    // The blade travelled: the stance goes with it.
    f.height = toHeight;
    f.heightTo = null;
    f.heightT = 0;
    return "accepted";
  }
  // The stance is its own track, like the parry: never queued, and free
  // during the settle. It is refused while the body is committed (you
  // cannot re-aim mid-action) and while a parry is up (a formed guard is
  // committed to its height; the guard shift above is the priced way to
  // move it). The arrows reach only high and low - middle stays declared
  // but unreachable until a third stance earns its way in.
  if (intent === "stanceUp" || intent === "stanceDown") {
    if (k !== "ready") return "ignored";
    const target: Height = intent === "stanceUp" ? "high" : "low";
    if (f.heightTo === target) return "ignored"; // already going there
    if (f.height === target) {
      if (f.heightTo === null) return "ignored"; // already there
      // Reversal: turn back before arriving. Contact-wise the fighter
      // never left this height, so the transition simply ends.
      f.heightTo = null;
      f.heightT = 0;
      return "accepted";
    }
    f.heightTo = target;
    f.heightT = 0;
    return "accepted";
  }
  if (k === "ready") {
    // A parry answers something happening right now, so it is never queued
    // and the step-recovery timer does not gate it: the settle after a step
    // is short and uncommitted, so a guard may go up during it. Everything
    // else waits the settle out in the one-slot buffer.
    if (intent === "parry" && f.parry !== null) {
      const p = f.parry;
      if (p.shifted || p.elapsedMs < p.effectiveAtMs) return "ignored";
      const side = opts?.targetSide ?? f.guardSide;
      if (side === p.targetLine.side) return "ignored"; // nothing to re-aim at
      p.fromLine = p.targetLine;
      p.targetLine = { height: p.targetLine.height, side };
      p.effectiveAtMs = p.elapsedMs + f.weapon.sideChangeMs;
      p.shifted = true;
      return "accepted";
    }
    if (intent === "parry") {
      if (f.parryRecoveryMs > 0) return "ignored";
      // The press targets one complete line. The side target is inferred by
      // the caller (the engine reads the visible attack) - syntactic sugar
      // for the human controller, costing nothing because choosing costs
      // nothing. Every travel toward the target is simulated: the rise, the
      // side rotation when the blade stands on the other side, and the
      // height arrival when the stance is in motion. No input teleports
      // steel; the target is covered only from effectiveAtMs.
      const side = opts?.targetSide ?? f.guardSide;
      f.parry = {
        elapsedMs: 0,
        fromLine: { height: f.height, side: f.guardSide },
        targetLine: { height: f.heightTo ?? f.height, side },
        effectiveAtMs: Math.max(
          f.weapon.parryRiseMs,
          side === f.guardSide ? 0 : f.weapon.sideChangeMs,
          f.heightTo === null ? 0 : f.weapon.heightChangeMs - f.heightT,
        ),
        targetAttackStartTime: opts?.targetAttackStartTime ?? null,
        shifted: false,
      };
      return "accepted";
    }
    if (f.stepRecoveryMs > 0) {
      f.buffered = intent; // one-slot buffer, last input wins
      return "buffered";
    }
    return startAction(f, intent, opts?.windupBonusMs ?? 0) ? "accepted" : "ignored";
  }
  // Rule D: a parry cannot be raised mid-step - you cannot react while
  // your feet are committed, only carry a defence you already chose. And
  // it is never buffered: a parry that fires when the step finishes would
  // be raised against a blade that has already landed.
  if (intent === "parry") return "ignored";
  if (k === "step") {
    f.buffered = intent; // one-slot buffer, last input wins
    return "buffered";
  }
  return "ignored"; // committed: void, attack
}

function startAction(f: Fighter, intent: Intent, windupBonusMs: number): boolean {
  switch (intent) {
    case "advance":
      f.state = { kind: "step", dir: 1, t: 0 };
      return true;
    case "retreat":
      f.state = { kind: "step", dir: -1, t: 0 };
      return true;
    case "void":
      dropParry(f);
      f.state = { kind: "void", t: 0 };
      return true;
    case "cut":
    case "thrust":
      dropParry(f);
      f.state = {
        kind: "attack",
        attack: intent,
        phase: "windup",
        elapsedMs: 0,
        timeline: attackTimeline(f.weapon, intent, windupBonusMs),
        // A stance mid-transition still covers its old height, and the
        // blade launches from where the body truly is.
        height: f.height,
        met: false,
        redirected: false,
        redirectedAtMs: null,
      };
      return true;
    case "parry":
      return false; // the parry lives on its own track; applyIntent raises it
    case "feint":
      return false; // only meaningful mid-windup; handled in applyIntent
    case "stanceUp":
    case "stanceDown":
      return false; // the stance lives on its own track; applyIntent moves it
  }
}

/**
 * Re-aim an attack mid-windup: the feint that continues. The clock never
 * resets - only the future marks are rewritten, from this instant plus the
 * redirect's travel, using the (possibly new) kind's timings. The rise
 * stays in the past: the pose was sold, and the blade goes somewhere the
 * sale did not say.
 */
function redirectAttack(f: Fighter, toKind: AttackKind, toHeight: Height): "accepted" {
  const s = f.state;
  if (s.kind !== "attack") throw new Error("unreachable");
  const changedHeight = toHeight !== s.height;
  const changedSide = toKind !== s.attack;
  const cost = Math.max(
    changedHeight ? f.weapon.redirectHeightMs : 0,
    changedSide ? f.weapon.redirectSideMs : 0,
  );
  const t2 = f.weapon.attacks[toKind];
  s.attack = toKind;
  s.height = toHeight;
  s.redirected = true;
  s.redirectedAtMs = s.elapsedMs;
  s.timeline = {
    ...s.timeline, // riseStart and riseEnd stay in the past
    strikeStart: s.elapsedMs + cost,
    parryableUntil: s.elapsedMs + cost + t2.strike * PARRYABLE_FRACTION,
    strikeEnd: s.elapsedMs + cost + t2.strike,
    recoveryStart: s.elapsedMs + cost + t2.strike,
    recoveryEnd: s.elapsedMs + cost + t2.strike + t2.recovery,
  };
  // The body went where the blade went.
  if (changedHeight) {
    f.height = toHeight;
    f.heightTo = null;
    f.heightT = 0;
  }
  return "accepted";
}

/**
 * Committing to your own blade (or to an evasion) abandons the raised
 * defence, priced: the recovery is charged as if the parry had been
 * spent. Steps deliberately do not call this - a parry rides through
 * footwork (rule D).
 */
function dropParry(f: Fighter): void {
  if (f.parry !== null) {
    f.parry = null;
    f.parryRecoveryMs = f.weapon.parryRecoveryMs;
  }
}

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  const settling = f.stepRecoveryMs > 0;
  f.stepRecoveryMs = Math.max(0, f.stepRecoveryMs - dt);
  f.parryRecoveryMs = Math.max(0, f.parryRecoveryMs - dt);
  // The stance track runs beside everything: a transition in flight
  // arrives on its own clock whatever the body is doing.
  if (f.heightTo !== null) {
    f.heightT += dt;
    if (f.heightT >= f.weapon.heightChangeMs) {
      f.height = f.heightTo;
      f.heightTo = null;
      f.heightT = 0;
    }
  }
  // The parry track runs beside the body: it expires on its own clock
  // whatever the feet are doing, and charges its recovery when spent. The
  // completion of its side rotation is when the blade physically stands on
  // the target side, so that is when the standing guardSide updates - a
  // guard dropped mid-rotation never got there and updates nothing.
  if (f.parry !== null) {
    const p = f.parry;
    p.elapsedMs += dt;
    const sideTravel = p.targetLine.side === p.fromLine.side ? 0 : f.weapon.sideChangeMs;
    if (p.elapsedMs >= sideTravel) f.guardSide = p.targetLine.side;
    // A threat-latched parry (raised against a visible attack) has no
    // timed expiry: it waits for THAT attack, and the engine ends it when
    // that attack ends - contact, miss, cancellation, or the attacker
    // being struck down. Only the predictive cold press, with no attack
    // to wait for, runs the window.
    if (p.targetAttackStartTime === null && p.elapsedMs >= f.weapon.parryWindowMs) {
      f.parry = null;
      f.parryRecoveryMs = f.weapon.parryRecoveryMs;
    }
  }
  const s = f.state;
  switch (s.kind) {
    case "ready":
    case "dead":
      if (s.kind === "dead") s.t += dt;
      // The settle expires only while actually ready: a parry raised during
      // it leaves the buffer in place, exactly as the old pause-interrupt
      // did, and the buffer then waits for the next completed settle.
      else if (settling && f.stepRecoveryMs === 0) flushBuffer(f, events);
      break;
    case "step": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.stepDuration);
      s.t += dt;
      const now = Math.min(s.t, w.stepDuration);
      f.x += ((now - prev) / w.stepDuration) * w.stepDistance * s.dir * f.facing;
      if (s.t >= w.stepDuration) {
        // Carry the overrun into the settle, or the step cycle would gain
        // up to one tick. An oversized dt can spend the whole settle inside
        // this tick, in which case the buffer flushes immediately.
        f.state = { kind: "ready" };
        events.push({ type: "footfall" });
        f.stepRecoveryMs = Math.max(0, w.stepRecoveryMs - (s.t - w.stepDuration));
        if (f.stepRecoveryMs === 0) flushBuffer(f, events);
      }
      break;
    }
    case "void": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.voidDuration);
      s.t += dt;
      const now = Math.min(s.t, w.voidDuration);
      f.x -= ((now - prev) / w.voidDuration) * w.voidDistance * f.facing;
      if (s.t >= w.voidDuration) {
        f.state = { kind: "ready" };
        events.push({ type: "footfall" });
        flushBuffer(f, events);
      }
      break;
    }
    case "hitstun":
      s.t += dt;
      if (s.t >= HIT_STUN_MS) {
        f.state = { kind: "dead", t: 0 };
        events.push({ type: "died" });
      }
      break;
    case "attack": {
      // One clock, absolute marks: the phase follows elapsedMs across the
      // timeline, so tick quantisation has nothing to accumulate in. The
      // sequential ifs let a phase shorter than one tick be crossed cleanly.
      const tl = s.timeline;
      s.elapsedMs += dt;
      if (s.phase === "windup" && s.elapsedMs >= tl.strikeStart) {
        s.phase = "strike";
        events.push({ type: "strikeBegin" });
      }
      if (s.phase === "strike" && s.elapsedMs >= tl.strikeEnd) {
        s.phase = "recovery";
        events.push({ type: "strikeEnd", attack: s.attack });
        // Resolution barrier: the engine may replace the timeline (whiff,
        // parried) in response to strikeEnd, so recoveryEnd is not read
        // until the next tick.
      } else if (s.phase === "recovery" && s.elapsedMs >= tl.recoveryEnd) {
        f.state = { kind: "ready" };
        flushBuffer(f, events);
      }
      break;
    }
  }
  return events;
}

function flushBuffer(f: Fighter, _events: FighterEvent[]): void {
  const b = f.buffered;
  f.buffered = null;
  if (b !== null) {
    startAction(f, b, 0);
  }
}
