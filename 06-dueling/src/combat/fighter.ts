import { attackTimeline, bindTimeline, PARRYABLE_FRACTION } from "./weapons";
import type { AttackTimeline } from "./weapons";
import type { AttackKind, AttackPhase, BindContact, Height, Intent, Line, Side, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;
/** How long the bind's loser is turned out and unable to act. Sized with
 *  the advantage below so the winner's promise is HONEST: a thrust
 *  launched on the advantage's last tick still resolves inside this
 *  (advantage + strike <= exposure, per pairing, test-pinned). The first
 *  cut shipped 320/200, under which only the first 60ms of the "200ms
 *  advantage" could actually kill - 133 wall ms under bullet time, an
 *  unreactable lie of a timer. */
export const BIND_LOSS_MS = 520;
/** The winner's opening: while it decays, one immediate thrust launches
 *  from the contact (bindTimeline) and kills. Anything else spends it on
 *  nothing. */
export const BIND_ADVANTAGE_MS = 240;

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
  | { kind: "dead"; t: number }
  /**
   * Seized in a sustained bind. Deliberately a bare marker: nothing about
   * a bind is per-fighter - the clock, the contact line and the entry
   * snapshot all live on the duel's shared BindState, the single home of
   * one physical event. Two mirrored copies kept equal by discipline was
   * the bug-shaped version.
   */
  | { kind: "bind" }
  /**
   * Turned out of a lost bind: nonlethal hitstun-shaped, accepts nothing,
   * ends into ready at BIND_LOSS_MS. Unlike the bind marker this carries
   * data, because what it holds IS per-fighter: the pose the fighter was
   * frozen in when turned out (their contact snapshot and the bind line's
   * side axis), which the renderer keeps drawing - the duel's BindState is
   * gone by now, so the fighter itself is the only honest home.
   */
  | { kind: "exposed"; t: number; contact: BindContact; lineSide: Side };

/**
 * The timed defence, on its own track so it can coexist with locomotion:
 * a parry raised while ready persists through a subsequent step (you carry
 * a defence you already chose), but cannot be raised mid-step (you cannot
 * react while your feet are committed). Named parry, not guard - it
 * expires and recovers, so it is an action; "guard" stays reserved for
 * weapon positions.
 */
export interface ParryTrack {
  /**
   * rising: forming, nothing covered. held: effective on coveredLine,
   * indefinitely - there is no expiry, the guard lives while the key does.
   * shifting: still effective on coveredLine (the OLD line) while the
   * travel to targetLine runs.
   */
  phase: "rising" | "held" | "shifting";
  /** ms into the current phase. */
  phaseMs: number;
  /** The current travel's duration: the rise's three-way max or the shift's cost; 0 while held. */
  phaseDurationMs: number;
  /**
   * The line the guard is effective on while phase != rising. During a
   * shift this stays the OLD line - the guard never covers a destination
   * early and never covers nothing.
   */
  coveredLine: Line;
  /** Where the guard is going (== coveredLine while held). Never auto-retargeted. */
  targetLine: Line;
  /**
   * How long coveredLine has been effective: 0 while rising, counting
   * through held AND shifting (the old line's coverage is unbroken), reset
   * to 0 each time a shift completes. sustained-bind snapshots this;
   * pressure-and-winding turns it into firmness.
   */
  settledMs: number;
  /**
   * The identity of the attack this parry latched onto at the press: the
   * absolute duel time that attack began, or null for a predictive cold
   * press. A TAP is attack-bound: its queued release fires when this
   * attack ends. A HELD key is key-bound: the latch clearing leaves the
   * guard standing. The latch never retargets - a redirect leaves the
   * guard covering its snapshot, which is the whole reason a feint works.
   */
  targetAttackStartTime: number | null;
  /** The key came up while the latch was engaged: drop when it disengages. */
  releaseQueued: boolean;
  /** ms since the press: how long this guard has been visible at all. */
  visibleMs: number;
}

/**
 * The guard is formed and can meet a blade. Before this it is only visible:
 * every travel the press implied (rise, side rotation, height arrival) has
 * a duration, and the press is input to the simulation, never a formed
 * guard - the same rule every other action already follows.
 */
export function guardEffective(f: Fighter): boolean {
  return f.parry !== null && f.parry.phase !== "rising";
}

/** Lower the guard and charge its recovery: every way out passes here. */
export function dropGuard(f: Fighter): void {
  if (f.parry !== null) {
    f.parry = null;
    f.parryRecoveryMs = f.weapon.parryRecoveryMs;
  }
}

/**
 * How long a guard pressed toward `aim` takes to form, from this fighter's
 * current posture: the three-way max of the firm-up (the blade already
 * RESTS in a line - stance height + guardSide - and only needs to brace),
 * the side rotation and the height travel - concurrent, never summed. The
 * parry acceptance below, the duelist's defence policy and the
 * feasibility-matrix test all call this one function, so what the AI
 * believes a guard costs can never drift from what the engine charges. A
 * stance standing at the wrong height pays the full travel (the press
 * must follow a stance intent); one already in motion pays only the
 * remainder.
 */
export function guardFormationMs(f: Fighter, aim: Line): number {
  const heightTravel =
    f.height === aim.height && f.heightTo === null
      ? 0
      : f.heightTo === aim.height
        ? f.weapon.heightChangeMs - f.heightT
        : f.weapon.heightChangeMs;
  return Math.max(
    f.weapon.firmUpMs,
    aim.side === f.guardSide ? 0 : f.weapon.sideChangeMs,
    heightTravel,
  );
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
  /** The bind winner's decaying opening; see BIND_ADVANTAGE_MS. */
  bindAdvantageMs: number;
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
    x, facing, weapon, state: { kind: "ready" }, parry: null, bindAdvantageMs: 0,
    height: "low", heightTo: null, heightT: 0, guardSide: "inside",
    buffered: null, stepRecoveryMs: 0, parryRecoveryMs: 0,
  };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { targetSide?: Side; targetAttackStartTime?: number },
): "accepted" | "buffered" | "ignored" {
  const r = applyIntentInner(f, intent, opts);
  // The bind advantage is the contact: only the immediate thrust uses it
  // (startAction reads the still-set timer to pick bindTimeline), and any
  // OTHER action that goes through - accepted or buffered - is leaving the
  // contact, so the timer does not survive in your pocket. A refused
  // intent changes nothing and clears nothing.
  if (r !== "ignored") f.bindAdvantageMs = 0;
  return r;
}

function applyIntentInner(
  f: Fighter,
  intent: Intent,
  opts?: { targetSide?: Side; targetAttackStartTime?: number },
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
    // Height shift on a held guard: repeatable, but one travel at a time,
    // no reversal mid-flight, and refused while rising - the line is
    // chosen at the press and the guard forms before it moves.
    const p = f.parry;
    if (p.phase !== "held") return "ignored";
    const toHeight: Height = intent === "stanceUp" ? "high" : "low";
    if (toHeight === p.coveredLine.height) return "ignored";
    p.phase = "shifting";
    p.phaseMs = 0;
    p.phaseDurationMs = f.weapon.guardShiftMs;
    p.targetLine = { height: toHeight, side: p.coveredLine.side };
    // The blade travelled: the stance goes with it.
    f.height = toHeight;
    f.heightTo = null;
    f.heightT = 0;
    return "accepted";
  }
  // Side shift (horizontal arrows): re-aim a held guard's side at what a
  // fresh press would infer. A costless no-op is refused: no visible
  // attack, or the inferred side already covered.
  if (intent === "sideShift") {
    const p = f.parry;
    if (p === null || p.phase !== "held") return "ignored";
    const side = opts?.targetSide;
    if (side === undefined || side === p.coveredLine.side) return "ignored";
    p.phase = "shifting";
    p.phaseMs = 0;
    p.phaseDurationMs = f.weapon.sideChangeMs;
    p.targetLine = { height: p.coveredLine.height, side };
    return "accepted";
  }
  // The key comes up: lower the guard. While the latch is engaged the
  // release queues - a TAP's guard finishes its engagement first (the
  // engine drops it when the latched attack ends). With no latch it drops
  // now, from any phase.
  if (intent === "parryRelease") {
    const p = f.parry;
    if (p === null) return "ignored";
    if (p.targetAttackStartTime !== null) {
      p.releaseQueued = true;
      return "accepted";
    }
    dropGuard(f);
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
    if (intent === "parry") {
      if (f.parry !== null || f.parryRecoveryMs > 0) return "ignored";
      // The press targets one complete line. The side target is inferred by
      // the caller (the engine reads the visible attack) - syntactic sugar
      // for the human controller, costing nothing because choosing costs
      // nothing. Every travel toward the target is simulated: the rise, the
      // side rotation when the blade stands on the other side, and the
      // height arrival when the stance is in motion. No input teleports
      // steel; the target is covered only from effectiveAtMs.
      const side = opts?.targetSide ?? f.guardSide;
      const aim: Line = { height: f.heightTo ?? f.height, side };
      f.parry = {
        phase: "rising",
        phaseMs: 0,
        phaseDurationMs: guardFormationMs(f, aim),
        coveredLine: aim,
        targetLine: aim,
        settledMs: 0,
        targetAttackStartTime: opts?.targetAttackStartTime ?? null,
        releaseQueued: false,
        visibleMs: 0,
      };
      return "accepted";
    }
    if (f.stepRecoveryMs > 0) {
      f.buffered = intent; // one-slot buffer, last input wins
      return "buffered";
    }
    return startAction(f, intent) ? "accepted" : "ignored";
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

function startAction(f: Fighter, intent: Intent): boolean {
  switch (intent) {
    case "advance":
      f.state = { kind: "step", dir: 1, t: 0 };
      return true;
    case "retreat":
      f.state = { kind: "step", dir: -1, t: 0 };
      return true;
    case "void":
      dropGuard(f);
      f.state = { kind: "void", t: 0 };
      return true;
    case "cut":
    case "thrust":
      dropGuard(f);
      f.state = {
        kind: "attack",
        attack: intent,
        phase: "windup",
        elapsedMs: 0,
        // The bind winner's thrust launches from the contact: while the
        // advantage timer is live (the wrapper zeroes it only after this
        // runs), the point is already on line and the timeline starts at
        // strikeStart. Only the thrust's geometry matches the position
        // the win left you in - the cut deliberately gets nothing.
        timeline:
          intent === "thrust" && f.bindAdvantageMs > 0
            ? bindTimeline(f.weapon)
            : attackTimeline(f.weapon, intent),
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
    case "press":
    case "yield":
      return false; // bind actions start on the duel's BindState, not the body
    case "feint":
      return false; // only meaningful mid-windup; handled in applyIntent
    case "stanceUp":
    case "stanceDown":
      return false; // the stance lives on its own track; applyIntent moves it
    case "parryRelease":
    case "sideShift":
      return false; // guard-track verbs; applyIntent handles both
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

// Committing to your own blade (or to an evasion) abandons the raised
// defence at full recovery price - dropGuard, the one exit everything
// shares. Steps deliberately do not: a parry rides through footwork
// (rule D).

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  const settling = f.stepRecoveryMs > 0;
  f.stepRecoveryMs = Math.max(0, f.stepRecoveryMs - dt);
  f.parryRecoveryMs = Math.max(0, f.parryRecoveryMs - dt);
  f.bindAdvantageMs = Math.max(0, f.bindAdvantageMs - dt);
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
  // The parry track runs beside the body, with no expiry: the guard lives
  // while the key does. Its travels complete here - the rise into held,
  // a shift into held with the new line - and the completion of a travel
  // that changed the side is when the blade physically stands there, so
  // that is when guardSide updates. settledMs counts whenever coveredLine
  // is effective, through shifts (the old line's coverage is unbroken),
  // resetting when a shift lands a fresh line - to the sub-tick remainder
  // of the travel, not to zero: the travel ends at its continuous instant
  // inside the tick, and settledMs is compared against the attacker's
  // continuous overshoot, so dropping the remainder would refuse guards
  // that were physically formed before the deadline.
  if (f.parry !== null) {
    const p = f.parry;
    p.phaseMs += dt;
    p.visibleMs += dt;
    if (p.phase !== "rising") p.settledMs += dt;
    if (p.phase !== "held" && p.phaseMs >= p.phaseDurationMs) {
      const arrivedFromRise = p.phase === "rising";
      const remainder = p.phaseMs - p.phaseDurationMs;
      p.phase = "held";
      p.phaseMs = 0;
      p.phaseDurationMs = 0;
      p.coveredLine = p.targetLine;
      p.settledMs = remainder;
      if (arrivedFromRise || p.coveredLine.side !== f.guardSide) {
        f.guardSide = p.coveredLine.side;
      }
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
    case "bind":
      // The body is seized; the duel's shared clock decides when it is
      // released. Nothing per-fighter advances here.
      break;
    case "exposed":
      // Turned out of a lost bind: hitstun-shaped but nonlethal, and only
      // a strike resolution can interrupt it. No buffer flush on exit -
      // nothing could have buffered, since exposed accepts no intents.
      s.t += dt;
      if (s.t >= BIND_LOSS_MS) f.state = { kind: "ready" };
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
    startAction(f, b);
  }
}
