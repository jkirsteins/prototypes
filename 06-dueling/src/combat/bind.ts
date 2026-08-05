import type { BindContact, Line, WeaponProfile } from "./types";

/**
 * The bind's control contest, in one module: the shared control value, the
 * per-side action tracks (pressure pulses and yield attempts), and every
 * derivation that turns weapon handling properties into in-bind behaviour.
 * The engine drives it, the AI reads it (delayed), the HUD renders it and
 * the tests pin it - all through the functions here, never a re-derived
 * copy. No function in this file may branch on a weapon id: a new sword
 * gets its whole bind game from its numbers.
 */

/** A guard is fully braced this long after its covered line settles. */
export const GUARD_SETTLE_MS = 160;
/** A pulse's gathering time, divided by the weapon's bindHandling. */
export const PULSE_COMMIT_BASE_MS = 20;
/** A pulse's force window: the sine curve's base, shared by all weapons.
 *  (Retuned at playtest direction: the bind plays as a TAP-FAST tug -
 *  each press is a quick micro-shove, the whole cycle short enough that
 *  mashing is fluid rather than press-and-wait. Weight lives in the tap
 *  RATE and the yield threat, not in individual heavy pulses.) */
export const PULSE_ACTIVE_MS = 100;
/** A pulse's spent time, scaled by its peak and divided by bindHandling:
 *  hard pressure recovers slower, nimble weapons recover faster. */
export const PULSE_RECOVERY_BASE_MS = 50;
/** The whole track, measured the same way as the yield band: how many
 *  UNCONTESTED anchor-weapon taps carry control from the centre to an
 *  endpoint. The playtest verdict on the old opaque gain was "too many
 *  taps" (an 11-gap track); four reads as a short, winnable tug, and
 *  the number is the thing a tuner would actually want to say. Weapons
 *  scale by their own authority: the rapier's lighter press makes ITS
 *  track longer, from the same property that narrows its zones. */
export const BIND_TRACK_GAPS = 4;
/** Control units per second per unit of net force - DERIVED from the
 *  track width: one anchor pulse (authority 1, the sine's 2/pi mean
 *  over PULSE_ACTIVE_MS) travels exactly 1/BIND_TRACK_GAPS. */
export const CONTROL_GAIN = 1 / (BIND_TRACK_GAPS * (2 / Math.PI) * (PULSE_ACTIVE_MS / 1000));

/** The yield zone spans about this many OPPOSING pulses of travel:
 *  pushing through it takes one shove, and the gap after that shove is
 *  THE yield opportunity - precisely one. (A playtest revision: the old
 *  fixed-fraction width held six-plus gaps, so pressing into the band
 *  fed the defender chance after chance until one landed.) */
export const YIELD_ZONE_GAPS = 1.4;
export const YIELD_ZONE_MIN = 0.05;
export const YIELD_ZONE_MAX = 0.25;
/** A yield motion's base duration, divided by rotationalControl. Scaled
 *  to the tap tempo: about one tap cycle, so a catch resolves as a beat
 *  and not a freeze-frame. */
export const YIELD_BASE_MS = 120;
/** While yielding, incoming force drives control at only this fraction:
 *  the turning blade sheds most of the push. */
export const YIELD_DRIVE_FACTOR = 0.35;
/** Incoming force below this is not a yield window: nothing to turn. */
export const YIELD_FORCE_MIN = 0.25;
/**
 * How long a caught-worthy push stays on the blade after its force peak
 * passes. At tap tempo the raw force flickers on and off five times a
 * second - an unhittable strobe if the window is instantaneous - but
 * physically the opponent's committed push does not vanish between
 * micro-shoves. Longer than the longest force-free stretch of a
 * sustained mash, so the band is SOLIDLY lit while they genuinely press
 * and goes dark only when they genuinely stop.
 */
export const YIELD_MEMORY_MS = 160;
/**
 * A bind input arriving while the track is busy waits in a one-slot
 * pending buffer this long and fires the moment the track is ready.
 * Without it, taps misaligned to the action cycle were silently eaten -
 * felt as an unresponsive mash and, for K, as a yield that never
 * happened - while the AI pressed on exact ready-ticks like a machine.
 * The slot is ONE input, last one wins, and it expires: holding or
 * spamming a key still cannot queue a train of actions.
 */
export const BIND_INPUT_GRACE_MS = 120;
/** A failed yield's control jolt toward the yielder's own loss. Wider
 *  than the one-gap zones: ANY failed yield inside the zone crosses the
 *  endpoint and loses the bind outright - the doomed K is the mistake
 *  the whole beat design punishes - while a fail out in open water is
 *  survivable at the jolt plus the recovery. */
export const YIELD_FAIL_PENALTY = 0.3;
/** About two tap cycles on top of the wasted motion: a real punish for a
 *  blind K, without freezing the fighter out of the tempo. */
export const YIELD_FAIL_RECOVERY_MS = 200;
/** The anti-stall drift: dormant while anyone is acting and through the
 *  grace, then ramping on CALM time (both action tracks ready). There is
 *  no neutral exit, so two passive fighters must still produce a winner -
 *  but a fighter who acts suppresses the drift entirely, so it never
 *  outweighs play. */
export const DRIFT_GRACE_MS = 600;
export const DRIFT_BASE = 0.2;
export const DRIFT_RAMP_PER_S = 0.25;
export const DRIFT_MAX = 0.8;
/** Entry lean cap: no starting position begins inside a danger zone. */
export const INITIAL_CONTROL_MAX = 0.35;
/**
 * The bind clock: a hard cap on the contest, drained on the HUD. The
 * calm-time drift already decides PASSIVE binds well inside this, so the
 * clock exists for the active stalemate - two fighters trading equal
 * pulses forever. At expiry the bind breaks NEUTRAL: no winner, no
 * advantage, no exposure - both fighters shove each other apart into an
 * involuntary retreat step. (This revises the earlier no-timeout doctrine
 * at playtest direction: an evenly matched bind ending in a shove reads
 * better than one that cannot end.)
 */
export const BIND_TIME_LIMIT_MS = 5000;

/**
 * Pressure is derived, never rolled: a pure function of one side's entry
 * snapshot. A strike is as firm as it was far through its travel (the body
 * is behind the blade); a guard is as firm as its covered line had been
 * settled, capped at GUARD_SETTLE_MS - it has no fixed lifetime to
 * normalise against. Derived once at entry and stored on the bind, because
 * the states it reads are discarded there.
 */
export function firmness(c: BindContact, _w: WeaponProfile): number {
  if (c.kind === "strike") return c.progress;
  return Math.min(1, c.settledMs / GUARD_SETTLE_MS);
}

/** A bind input waiting out the tail of its own action (BIND_INPUT_GRACE_MS). */
export interface PendingBindInput {
  intent: "press" | "yield";
  ageMs: number;
}

/** One pressure pulse's shape, fixed at its start from the weapon. */
export interface PressurePulse {
  commitMs: number;
  activeMs: number;
  recoveryMs: number;
  peakForce: number;
}

/**
 * One side's physical action inside the bind. Press and yield are mutually
 * exclusive commitments, so one track holds both - and "ready" is the only
 * state that accepts an intent. `t` is ms into the current state.
 */
export type BindAction =
  | { kind: "ready"; t: number }
  | { kind: "pressCommit"; t: number; pulse: PressurePulse }
  | { kind: "pressActive"; t: number; pulse: PressurePulse }
  | { kind: "pressRecover"; t: number; durationMs: number }
  | {
      kind: "yielding";
      t: number;
      durationMs: number;
      /** Decided at the press, resolved at the motion's end: the blade
       *  caught real force inside its own zone (the lit band's condition,
       *  which is what makes the band an honest promise). */
      succeeded: boolean;
    }
  | { kind: "yieldFailRecover"; t: number; durationMs: number };

/**
 * The bind: one physical event with one clock and one shared control
 * value, owned by the duel - never mirrored onto the fighters, whose
 * `bind` markers carry no data. Since the control-contest revision the
 * bind holds NO hidden state: everything here is a physical action or a
 * derived fact, all of it observable.
 */
export interface BindState {
  t: number;
  /** ms both action tracks have been ready: the drift's clock, reset the
   *  moment either side commits to anything. */
  calmMs: number;
  /** Per side: ms since incoming force last reached YIELD_FORCE_MIN -
   *  the yield window's memory (YIELD_MEMORY_MS). */
  sinceForce: [number, number];
  /** Per side: the one pending bind input awaiting readiness, if any. */
  pending: [PendingBindInput | null, PendingBindInput | null];
  /** Who claimed the last beat (§ the beat is exclusive); contested
   *  same-tick presses alternate against this. */
  lastClaimant: 0 | 1 | null;
  /** The actual contact line, saved at entry (sustained-bind). */
  line: Line;
  contact: [BindContact, BindContact];
  /** Derived from `contact` at entry; sets the starting lean and drift. */
  firmness: [number, number];
  /** -1: side 0 wins by pressure; +1: side 1 wins; the contested value. */
  control: number;
  action: [BindAction, BindAction];
  /** Yield-zone widths in control units, derived at entry per side. */
  yieldZone: [number, number];
  /** Each side's pulse shape and yield motion length: constants of the
   *  pairing, derived once at entry like the zones. */
  pulseShape: [PressurePulse, PressurePulse];
  yieldDurationMs: [number, number];
  /** sign(lead1 - lead0) at entry; the drift's primary direction. */
  leadSign: -1 | 0 | 1;
  /** The documented tie cascade's terminal value, derived from contact
   *  facts at entry (travel progress, then which blade completed the
   *  contact); never 0, never weapon identity, never random. */
  tieSign: -1 | 1;
  /** Sign of the last non-zero pulse force, for the tie cascade. */
  lastForceSign: -1 | 0 | 1;
}

/** One side's effective contact initiative: body and leverage behind it. */
function lead(firm: number, w: WeaponProfile): number {
  return firm * w.bindAuthority;
}

/**
 * The starting position: the normalised lead difference, capped outside
 * both danger zones. A settled guard against a barely-launched strike
 * begins most of the way toward the guard's win; even entries begin at 0.
 */
export function deriveInitialBindControl(
  firm: [number, number],
  ws: [WeaponProfile, WeaponProfile],
): number {
  const l0 = lead(firm[0], ws[0]);
  const l1 = lead(firm[1], ws[1]);
  const top = Math.max(l0, l1);
  if (top <= 0) return 0;
  const raw = 0.5 * ((l1 - l0) / top);
  return Math.max(-INITIAL_CONTROL_MAX, Math.min(INITIAL_CONTROL_MAX, raw));
}

/** A pulse's shape from the weapon's authority and handling alone. */
export function derivePressurePulse(w: WeaponProfile): PressurePulse {
  const peakForce = w.bindAuthority;
  return {
    commitMs: PULSE_COMMIT_BASE_MS / w.bindHandling,
    activeMs: PULSE_ACTIVE_MS,
    recoveryMs: (PULSE_RECOVERY_BASE_MS * peakForce) / w.bindHandling,
    peakForce,
  };
}

/** The force one side exerts right now: the active pulse's sine curve. */
export function pulseForce(a: BindAction): number {
  if (a.kind !== "pressActive") return 0;
  const p = a.pulse;
  return p.peakForce * Math.sin((Math.PI * Math.min(a.t, p.activeMs)) / p.activeMs);
}

/** Signed net pulse force: positive pushes control toward +1 (side 1's win). */
export function netBindForce(action: [BindAction, BindAction]): number {
  return pulseForce(action[1]) - pulseForce(action[0]);
}

/**
 * A side's yield-zone width: how much of the approach to its loss endpoint
 * its blade can still turn, from its own rotation against the opponent's
 * authority. Derived at entry, stored on the bind.
 */
export function deriveYieldZone(self: WeaponProfile, opp: WeaponProfile): number {
  // One opposing pulse's uncontested travel is one GAP; the band holds
  // YIELD_ZONE_GAPS of them (scaled by own rotation), so its width reads
  // directly as "how many answers crossing it offers".
  const gapTravel =
    CONTROL_GAIN * (2 / Math.PI) * opp.bindAuthority * (PULSE_ACTIVE_MS / 1000);
  const raw = YIELD_ZONE_GAPS * self.rotationalControl * gapTravel;
  return Math.max(YIELD_ZONE_MIN, Math.min(YIELD_ZONE_MAX, raw));
}

/** The yield motion's length: quicker rotation turns force sooner. */
export function deriveYieldDuration(self: WeaponProfile): number {
  return YIELD_BASE_MS / self.rotationalControl;
}

/** Side s loses at the opposite endpoint: +1 for side 0, -1 for side 1. */
export function inYieldZone(control: number, side: 0 | 1, zoneWidth: number): boolean {
  return side === 0 ? control >= 1 - zoneWidth : control <= -(1 - zoneWidth);
}

/** The pulse force currently pushing side s toward its own loss. */
export function incomingForce(net: number, side: 0 | 1): number {
  return Math.max(0, side === 0 ? net : -net);
}

/** The opponent's pulse is committed or active: the beat is theirs, and
 *  it locks BOTH of this side's verbs - press and yield alike. */
export function beatClaimedAgainst(bind: BindState, side: 0 | 1): boolean {
  const opp = bind.action[1 - side];
  return opp.kind === "pressCommit" || opp.kind === "pressActive";
}

/**
 * Catchable force exists: inside the own zone, with the opponent's gross
 * push live or still on the blade (memory). This is the THREAT - what
 * the presser risks leaving behind - independent of whose beat it is.
 */
export function yieldThreat(bind: BindState, side: 0 | 1): boolean {
  if (!inYieldZone(bind.control, side, bind.yieldZone[side])) return false;
  return (
    pulseForce(bind.action[1 - side]) >= YIELD_FORCE_MIN ||
    bind.sinceForce[side] <= YIELD_MEMORY_MS
  );
}

/**
 * The visible yield window: the threat, AND the beat is free. Whoever
 * presses first locks the other side's yield along with their press -
 * without that lock, a deep defender's yield was a guaranteed answer to
 * any pressure and pressing was never correct. The escape hatch is
 * TIMED: the gap between the opponent's pulses, where the memory still
 * holds their spent force. Evaluated live - no canYield flag anywhere -
 * and it is the SAME condition a starting yield snapshots as its
 * success, so the lit band remains an honest promise: tap K while it
 * flashes and the yield wins (unless the endpoint outruns the motion).
 */
export function yieldOpportunity(bind: BindState, side: 0 | 1): boolean {
  return yieldThreat(bind, side) && !beatClaimedAgainst(bind, side);
}

/**
 * The anti-stall drift: dormant while anyone is committed to an action and
 * through the calm grace, then ramping on calm time, aimed at the win of
 * the side that entered with initiative. Ties fall through the documented
 * cascade: last non-zero force, then the contact-fact tie sign fixed at
 * entry.
 */
export function bindDrift(bind: BindState): number {
  if (bind.calmMs < DRIFT_GRACE_MS) return 0;
  const sign = bind.leadSign !== 0 ? bind.leadSign : bind.lastForceSign !== 0 ? bind.lastForceSign : bind.tieSign;
  const mag = Math.min(DRIFT_BASE + (DRIFT_RAMP_PER_S * (bind.calmMs - DRIFT_GRACE_MS)) / 1000, DRIFT_MAX);
  return sign * mag;
}

/**
 * THE BEAT IS EXCLUSIVE: only one pulse may be committed or active at a
 * time - whoever presses first claims the beat, and the contact carries
 * their shove whole. (A playtest revision: with simultaneous opposing
 * pulses, a counter-press 10ms behind the first nearly cancelled it and
 * the marker only ever wiggled; now every claimed beat visibly moves,
 * and the tug is a race for beats that jitter makes winnable.) A claim
 * attempt succeeds only from a ready track against an unclaimed beat.
 */
function claimPress(bind: BindState, side: 0 | 1): boolean {
  if (bind.action[side].kind !== "ready") return false;
  const opp = bind.action[1 - side];
  if (opp.kind === "pressCommit" || opp.kind === "pressActive") return false;
  bind.pending[side] = null;
  bind.action[side] = { kind: "pressCommit", t: 0, pulse: bind.pulseShape[side] };
  bind.lastClaimant = side;
  return true;
}

/**
 * A press input: claims the beat if it can. A press into the OPPONENT'S
 * claimed beat is LOST outright - the turn is forfeited, never queued -
 * while a press blocked only by one's own unfinished action waits in the
 * grace slot as usual.
 */
export function startPress(bind: BindState, side: 0 | 1): boolean {
  if (claimPress(bind, side)) return true;
  if (bind.action[side].kind !== "ready") {
    bind.pending[side] = { intent: "press", ageMs: 0 };
  }
  return false;
}

/**
 * Starts one committed yield attempt; refused unless the track is ready.
 * ALWAYS committed once started - an early press is never silently
 * dropped, because ignoring it would make mashing the key free. Success
 * is the lit-band condition, snapshotted here at the press and resolved
 * when the motion completes; a press outside the window commits the whole
 * failing motion.
 */
/** Commit the yield motion; success is the honest window's snapshot -
 *  which includes the beat being free, so a K into the opponent's claim
 *  is a committed, DOOMED rotation. */
function beginYield(bind: BindState, side: 0 | 1): void {
  bind.pending[side] = null;
  bind.action[side] = {
    kind: "yielding",
    t: 0,
    durationMs: bind.yieldDurationMs[side],
    succeeded: yieldOpportunity(bind, side),
  };
}

/** The PENDING path's gate: a queued K waits (within its grace) for both
 *  its own track and a free beat - leniency for input alignment must not
 *  fire into certain failure. */
function tryYield(bind: BindState, side: 0 | 1): boolean {
  if (bind.action[side].kind !== "ready") return false;
  if (beatClaimedAgainst(bind, side)) return false;
  beginYield(bind, side);
  return true;
}

/**
 * A fresh yield input. Into the OPPONENT'S claimed beat it still COMMITS
 * - and fails, with the full penalty: they pressed first, and a blocked
 * K that cost nothing could simply be spammed until it landed in a gap,
 * which would make the yield a guaranteed answer to pressure again. The
 * mistimed K is the mistake the whole beat design exists to punish. A K
 * blocked only by one's own unfinished action waits in the grace slot.
 */
export function startYield(bind: BindState, side: 0 | 1): boolean {
  if (bind.action[side].kind !== "ready") {
    bind.pending[side] = { intent: "yield", ageMs: 0 };
    return false;
  }
  beginYield(bind, side);
  return true;
}

/** What a bound fighter's tick input means, both sides together. */
export type BindInput = "press" | "yield";

/**
 * One tick's bind inputs, arbitrated with full information: handling the
 * sides sequentially would silently hand every contested beat to side 0.
 * PRESSES RESOLVE FIRST - pressing first denies the same-tick yield along
 * with the counter-press, which is the whole value of pressing. Contested
 * same-tick presses ALTERNATE against the last claimant (the first ever
 * contested beat goes to the side that entered WITHOUT the initiative, a
 * small documented compensation); the loser of the contention loses the
 * turn.
 */
export function applyBindInputs(
  bind: BindState,
  inputs: [BindInput | null, BindInput | null],
): void {
  const w0 = inputs[0] === "press";
  const w1 = inputs[1] === "press";
  if (w0 && w1) {
    const first: 0 | 1 =
      bind.lastClaimant !== null
        ? ((1 - bind.lastClaimant) as 0 | 1)
        : bind.leadSign === 1 ? 0
        : bind.leadSign === -1 ? 1
        : bind.tieSign === 1 ? 0 : 1;
    startPress(bind, first);
    // The other contested press is the lost turn, deliberately unqueued.
  } else if (w0) {
    startPress(bind, 0);
  } else if (w1) {
    startPress(bind, 1);
  }
  for (const side of [0, 1] as const) {
    if (inputs[side] === "yield") startYield(bind, side);
  }
}

export interface BindTickResult {
  winner: 0 | 1 | null;
  cause: "pressure" | "yield" | null;
  /** Yields that resolved as failures this tick: turned without force. */
  yieldFails: Array<{ side: 0 | 1 }>;
  /** Sides whose pulse's FORCE landed this tick (commit -> active): the
   *  shove's physical moment, and the audible beat of the bind's rhythm. */
  pulseStarts: Array<0 | 1>;
  /** The clock ran out with no winner: the bind breaks neutral. Play is
   *  given the whole tick first - a winner on the expiry tick still wins. */
  expired: boolean;
}

/** Remaining fraction of the bind clock, for the HUD's draining bar. */
export function bindTimerFrac(bind: BindState): number {
  return Math.max(0, 1 - bind.t / BIND_TIME_LIMIT_MS);
}

/**
 * One simulation tick of the contest. Order inside the tick: forces are
 * read from the action states as they stand, control integrates them (a
 * yielding side takes incoming force at the drive factor and banks the
 * redirected remainder), endpoints are checked, THEN the action tracks
 * advance and a completing yield is judged - so an endpoint crossing and a
 * yield completion on the same tick go to the presser, deterministically.
 */
export function tickBindContest(bind: BindState, dt: number): BindTickResult {
  const result: BindTickResult = { winner: null, cause: null, yieldFails: [], pulseStarts: [], expired: false };
  bind.t += dt;
  const dtS = dt / 1000;
  const bothReady = bind.action[0].kind === "ready" && bind.action[1].kind === "ready";
  bind.calmMs = bothReady ? bind.calmMs + dt : 0;

  const net = netBindForce(bind.action);
  if (net !== 0) bind.lastForceSign = net > 0 ? 1 : -1;
  // The yield window's memory: the OPPONENT'S gross push refreshes it,
  // quiet ages it. Gross, not net - two lockstep presses cancel each
  // other's marker movement, but their blade is still physically pushing
  // and that push is still catchable.
  for (const side of [0, 1] as const) {
    bind.sinceForce[side] =
      pulseForce(bind.action[1 - side]) >= YIELD_FORCE_MIN ? 0 : bind.sinceForce[side] + dt;
  }

  // Integrate control: each side's incoming component, scaled down while
  // that side is mid-yield (the turning blade sheds most of the push),
  // plus the drift.
  let effNet = net;
  for (const side of [0, 1] as const) {
    const a = bind.action[side];
    if (a.kind !== "yielding") continue;
    const inc = incomingForce(net, side);
    if (inc <= 0) continue;
    const redirectedAway = inc * (1 - YIELD_DRIVE_FACTOR);
    effNet += side === 0 ? -redirectedAway : redirectedAway;
  }
  // No endpoint resistance any more: it existed to stretch reactive
  // transit time in the pre-beat model, and under the gap model it only
  // multiplied how many gaps a zone crossing offered.
  bind.control += (CONTROL_GAIN * effNet + bindDrift(bind)) * dtS;

  const endpoint = (): 0 | 1 | null =>
    bind.control <= -1 ? 0 : bind.control >= 1 ? 1 : null;
  const atEnd = endpoint();
  if (atEnd !== null) {
    bind.control = atEnd === 0 ? -1 : 1;
    result.winner = atEnd;
    result.cause = "pressure";
    return result;
  }

  // Advance the action tracks, carrying phase remainders so a boundary
  // inside a tick costs nothing.
  for (const side of [0, 1] as const) {
    let a = bind.action[side];
    a.t += dt;
    if (a.kind === "pressCommit" && a.t >= a.pulse.commitMs) {
      a = bind.action[side] = { kind: "pressActive", t: a.t - a.pulse.commitMs, pulse: a.pulse };
      result.pulseStarts.push(side);
    }
    if (a.kind === "pressActive" && a.t >= a.pulse.activeMs) {
      a = bind.action[side] = {
        kind: "pressRecover",
        t: a.t - a.pulse.activeMs,
        durationMs: a.pulse.recoveryMs,
      };
    }
    if ((a.kind === "pressRecover" || a.kind === "yieldFailRecover") && a.t >= a.durationMs) {
      a = bind.action[side] = { kind: "ready", t: 0 };
    }
    // The grace slot: an input that arrived while this track was busy
    // fires the moment it is ready - including the ready this very tick
    // produced - or expires. One input, never a train.
    const p = bind.pending[side];
    if (p !== null) {
      p.ageMs += dt;
      if (p.ageMs > BIND_INPUT_GRACE_MS) bind.pending[side] = null;
      else if (a.kind === "ready") {
        // A pending input also waits out an opponent's claim (it predates
        // the claim, so it is not a lost turn) - but only within its TTL.
        if (p.intent === "press") claimPress(bind, side);
        else tryYield(bind, side);
        a = bind.action[side];
      }
    }
    if (a.kind === "yielding" && a.t >= a.durationMs) {
      if (a.succeeded) {
        result.winner = side;
        result.cause = "yield";
        return result;
      }
      // The failed yield: the press caught no window - the rotation found
      // nothing to turn, and the blade is out of line. Control jolts
      // toward the yielder's own loss, which deep in the zone can end
      // the bind.
      result.yieldFails.push({ side });
      bind.control += side === 0 ? YIELD_FAIL_PENALTY : -YIELD_FAIL_PENALTY;
      bind.action[side] = { kind: "yieldFailRecover", t: 0, durationMs: YIELD_FAIL_RECOVERY_MS };
      const after = endpoint();
      if (after !== null) {
        bind.control = after === 0 ? -1 : 1;
        result.winner = after;
        result.cause = "pressure";
        return result;
      }
    }
  }
  // The clock, checked last: everything play could still decide this tick
  // has been given its chance, so a winner on the expiry tick still wins.
  result.expired = bind.t >= BIND_TIME_LIMIT_MS;
  return result;
}

/**
 * Entry derivation bundle: everything the contest needs beyond the
 * sustained-bind snapshot, computed once on the entry tick.
 * `contactCompletedBy` is the side whose travel completed the contact (the
 * bind event's carrier) - the tie cascade's terminal fact.
 */
export function createBindContest(
  contact: [BindContact, BindContact],
  firm: [number, number],
  ws: [WeaponProfile, WeaponProfile],
  contactCompletedBy: 0 | 1,
): Pick<
  BindState,
  | "control" | "action" | "yieldZone" | "pulseShape" | "yieldDurationMs"
  | "leadSign" | "tieSign" | "lastForceSign" | "calmMs" | "sinceForce"
  | "pending" | "lastClaimant"
> {
  const l0 = lead(firm[0], ws[0]);
  const l1 = lead(firm[1], ws[1]);
  const leadSign: -1 | 0 | 1 = l1 > l0 ? 1 : l1 < l0 ? -1 : 0;
  const progress = (c: BindContact): number => (c.kind === "strike" ? c.progress : 0);
  const p0 = progress(contact[0]);
  const p1 = progress(contact[1]);
  // Greater travel progress, then the blade that completed the contact:
  // contact facts all the way down, so the cascade never reaches a coin.
  const tieSign: -1 | 1 = p1 > p0 ? 1 : p1 < p0 ? -1 : contactCompletedBy === 1 ? 1 : -1;
  return {
    control: deriveInitialBindControl(firm, ws),
    action: [{ kind: "ready", t: 0 }, { kind: "ready", t: 0 }],
    yieldZone: [deriveYieldZone(ws[0], ws[1]), deriveYieldZone(ws[1], ws[0])],
    pulseShape: [derivePressurePulse(ws[0]), derivePressurePulse(ws[1])],
    yieldDurationMs: [deriveYieldDuration(ws[0]), deriveYieldDuration(ws[1])],
    leadSign,
    tieSign,
    lastForceSign: 0,
    calmMs: 0,
    sinceForce: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    pending: [null, null],
    lastClaimant: null,
  };
}
