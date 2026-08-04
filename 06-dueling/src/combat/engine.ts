import { BIND_ADVANTAGE_MS, applyIntent, dropGuard, lineOf, TICK, tickFighter } from "./fighter";
import { bladesCross, canBind, parryMeetsAttack } from "./contact";
import { applyBindInputs, createBindContest, firmness, tickBindContest } from "./bind";
import type { BindInput } from "./bind";
import type { BindState } from "./bind";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { BindContact, Intent, WeaponProfile } from "./types";

// The contact and bind modules are the single homes of blade geometry and
// the bind contest; the engine re-exports both so existing consumers keep
// one import site.
export { bladesCross, canBind, extension, parryMeetsAttack } from "./contact";
export { firmness, GUARD_SETTLE_MS } from "./bind";
export type { BindAction, BindState } from "./bind";

/** left/right are cm along the piste (~17 m usable); floorY is canvas px (vertical is render-only). */
export const ARENA = { left: 120, right: 1800, floorY: 430 };
/** Minimum body-center separation in cm: two fighters in stance just short of touching. */
export const MIN_GAP = 130;

export interface DuelEvent {
  time: number;
  side: 0 | 1;
  kind:
    | "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "feint" | "bind" | "bindBreak" | "yieldFail" | "kill" | "draw"
    // Presentation-only kinds, returned but never logged. They mark the
    // simulation instant a thing physically happens (a foot plants, a blade
    // starts rising or travelling, a blade arrives at a guard, a bind
    // shove's force lands) - which is never the tick the triggering input
    // was accepted.
    | "step" | "swing" | "met" | "windup" | "pulse";
  text: string;
  /** windup only: how long the rise lasts, so audio can match its length. */
  ms?: number;
}

// The loser's exposure and the winner's advantage live on the fighter
// (fighter.ts constants); re-exported so bind tuning reads in one place.
export { BIND_ADVANTAGE_MS, BIND_LOSS_MS } from "./fighter";

// BindContact moved to types.ts (the fighter's exposed state carries one);
// re-exported here so consumers keep one import site.
export type { BindContact } from "./types";

export interface Duel {
  f: [Fighter, Fighter];
  time: number;
  over: boolean;
  winner: 0 | 1 | "draw" | null;
  bind: BindState | null;
  log: DuelEvent[];
}

export function createDuel(wa: WeaponProfile, wb: WeaponProfile): Duel {
  return {
    f: [createFighter(660, 1, wa), createFighter(1260, -1, wb)],
    time: 0,
    over: false,
    winner: null,
    bind: null,
    log: [],
  };
}

export function gapOf(d: Duel): number {
  return Math.abs(d.f[0].x - d.f[1].x);
}

export function tickDuel(d: Duel, ia: Intent | null, ib: Intent | null): DuelEvent[] {
  const out: DuelEvent[] = [];
  const intents: [Intent | null, Intent | null] = [ia, ib];
  const dt = TICK;
  const wasRising: [boolean, boolean] = [inRise(d.f[0]), inRise(d.f[1])];

  // Inside a bind the attack keys are the bind keys: cut presses, thrust
  // yields (no new bindings), and the AI may send press/yield directly.
  // Both sides' inputs are handed to the contest TOGETHER so contested
  // beats are arbitrated fairly - sequential handling silently gave side
  // 0 every same-tick race. Every other intent from a bound fighter is
  // consumed here and dropped: nothing steps, voids, attacks, parries or
  // walks out of a bind.
  if (d.bind !== null && !d.over) {
    const bi: [BindInput | null, BindInput | null] = [null, null];
    for (const side of [0, 1] as const) {
      const intent = intents[side];
      if (intent === null || d.f[side].state.kind !== "bind") continue;
      bi[side] =
        intent === "cut" || intent === "press" ? "press" :
        intent === "thrust" || intent === "yield" ? "yield" : null;
      intents[side] = null;
    }
    applyBindInputs(d.bind, bi);
  }

  for (const side of [0, 1] as const) {
    const intent = intents[side];
    if (intent === null || d.over) continue;
    const before = d.f[side].state.kind;
    // One simulation for both fighters: an attack's preparation is the
    // weapon's own windup, whoever throws it (preparation-and-readiness
    // deleted the AI-only telegraph bonus - the doctrine's lone
    // violation). A parry press infers its side target from the
    // opponent's currently visible attack - only what is visible on this
    // tick, never a redirect that has not happened - and the fighter
    // simulation only sees a target side.
    const opp = d.f[1 - side];
    const threatVisible = opp.state.kind === "attack" && opp.state.phase !== "recovery";
    // Captured for redirect detection: an accepted redirect keeps the state
    // kind "attack" but flips its redirected flag this tick.
    const st0 = d.f[side].state;
    const before0 = st0.kind === "attack"
      ? { kind: st0.attack, height: st0.height, redirected: st0.redirected }
      : null;
    // A parry pressed against a visible attack latches onto that attack's
    // identity - the absolute time it began - and infers its side. Both
    // read only what is visible on this tick; a cold press gets neither.
    // A side shift with nothing to read is still an order: flip to the
    // opposite side (the toggle Caps Lock rides). Inference is input;
    // the travel is simulated either way.
    const me = d.f[side];
    const r = applyIntent(me, intent, {
      targetSide:
        (intent === "parry" || intent === "sideShift") && threatVisible
          ? lineOf(opp).side
          : intent === "sideShift" && me.parry !== null
            ? me.parry.targetLine.side === "inside" ? "outside" : "inside"
            : undefined,
      targetAttackStartTime:
        intent === "parry" && threatVisible && opp.state.kind === "attack"
          ? d.time - opp.state.elapsedMs
          : undefined,
    });
    // The redirect is a visible lie by design - row 3 flips, and the log
    // records it like the abandoning feint. Only the AUDIO stays silent:
    // a cue would hand the read to anyone playing by ear.
    const st1 = d.f[side].state;
    if (
      r === "accepted" &&
      before0 !== null &&
      !before0.redirected &&
      st1.kind === "attack" &&
      st1.redirected
    ) {
      const what =
        before0.kind !== st1.attack
          ? `${before0.kind} becomes ${st1.attack}`
          : `${st1.attack} goes ${st1.height}`;
      emit(d, out, side, "feint", `${d.f[side].weapon.name} feints -> ${what}`);
      continue;
    }
    if (r === "accepted" && before !== d.f[side].state.kind) {
      const k = d.f[side].state.kind;
      if (k === "attack") emit(d, out, side, "attackStart", `${d.f[side].weapon.name} ${intent} begins`);
      else if (k === "void") emit(d, out, side, "void", `${d.f[side].weapon.name} voids`);
    } else if (r === "accepted" && intent === "parry") {
      // The parry lives on its own track, so acceptance changes no state
      // kind; same for the feint (windup truncates within the attack).
      emit(d, out, side, "parry", `${d.f[side].weapon.name} raises a parry`);
    } else if (r === "accepted" && intent === "feint") {
      emit(d, out, side, "feint", `${d.f[side].weapon.name} feints -> attack abandoned`);
    }
  }

  d.time += dt;
  const evs: [FighterEvent[], FighterEvent[]] = [tickFighter(d.f[0], dt), tickFighter(d.f[1], dt)];

  // The bind's contest, advanced after the fighters tick (their bind
  // marker is a no-op there) and before contact detection, so a bind
  // formed later this tick starts at t = 0 and resolution-tick charges
  // stand un-decayed. tickBindContest integrates the pulse forces and the
  // anti-stall drift into the shared control value and judges completing
  // yields; the bind ends ONLY through a winner - pressure reaching an
  // endpoint or a yield completing - never through a timeout or a neutral
  // break.
  if (d.bind !== null) {
    const r = tickBindContest(d.bind, dt);
    // The bind's rhythm, made audible: one unlogged thud per shove, on
    // the tick its FORCE lands (commit -> active) - never the keypress.
    // The silence after each thud IS the yield gap.
    for (const side of r.pulseStarts) {
      out.push({ time: d.time, side, kind: "pulse", text: "" });
    }
    for (const yf of r.yieldFails) {
      // Logged so a lost bind explains itself; unmapped in audio - the
      // failed rotation has no steel moment, the resolution is the moment.
      emit(d, out, yf.side, "yieldFail",
        `${d.f[yf.side].weapon.name} yields into nothing -> off balance`);
    }
    if (r.winner !== null && r.cause !== null) resolveBind(d, out, r.winner, r.cause);
    else if (r.expired) releaseBind(d);
  }

  // Physical moments surface as fighter state-machine events, deliberately
  // not at intent acceptance: the input only feeds the simulation, and the
  // sound of the outcome belongs to the tick the simulation reaches it.
  for (const side of [0, 1] as const) {
    for (const e of evs[side]) {
      if (e.type === "footfall") out.push({ time: d.time, side, kind: "step", text: "" });
      else if (e.type === "strikeBegin") out.push({ time: d.time, side, kind: "swing", text: "" });
    }
  }

  // The blade starts rising. A before/after comparison rather than emission
  // at a single call site, because the rise begins three ways: at acceptance
  // (no telegraph), when elapsedMs crosses riseStart (telegraphed AI
  // attacks), or from a buffered attack in flushBuffer.
  for (const side of [0, 1] as const) {
    const f = d.f[side];
    if (!wasRising[side] && inRise(f) && f.state.kind === "attack") {
      out.push({
        time: d.time, side, kind: "windup", text: "",
        ms: f.weapon.attacks[f.state.attack].windup,
      });
    }
  }

  clampPositions(d);

  // The clash sounds on the contact tick - the first tick the blades occupy
  // the same place, which is when `met` latches. For a parry that is the
  // travelling blade's arrival at the formed guard (at maximum range, the
  // old parryable-interval boundary; earlier at any closer gap); for a
  // crossing, the tick both extensions cover the gap. One met per contact,
  // never one per side - two clash samples on one tick would be a layer.
  // Only a CROSSING in matched steel (canBind: stiffnesses within the
  // band) locks into a bind: two attacks are two bodies driving force
  // into the contact, which is what a bind's pressure contest is made of.
  // A parried blade ALWAYS deflects, matched steel or not - a guard
  // receives and sheds the force, adding none of its own - so the two
  // defensive modes stay distinct: parry to deflect, counter-attack into
  // the blade to seize it. One contact, one sound: the bind REPLACES the
  // met as the contact's outcome event - a logged one, like parried and
  // hit - so a deflection and a lock are audibly and legibly different
  // outcomes, never a layer. The snapshot is read from the still-live
  // attack states, then both bodies are replaced with the bare marker
  // (the attacks are over; their timelines are discarded and can never
  // resolve). Not entered when the duel is already over: dead takes
  // precedence over everything.
  const contacts = markMetBlades(d);
  const binding =
    contacts.crossing && !d.over && d.bind === null && canBind(d.f[0].weapon, d.f[1].weapon);
  if (binding) {
    const carrier = contacts.sides[0];
    const line = lineOf(d.f[carrier]);
    const contact = [snapshotContact(d.f[0]), snapshotContact(d.f[1])] as [BindContact, BindContact];
    const firm: [number, number] =
      [firmness(contact[0], d.f[0].weapon), firmness(contact[1], d.f[1].weapon)];
    d.bind = {
      t: 0, line, contact, firmness: firm,
      // The contest: starting control, ready action tracks, derived
      // zones and the drift's direction - all from the entry facts, with
      // the bind event's carrier as the tie cascade's terminal fact.
      ...createBindContest(contact, firm, [d.f[0].weapon, d.f[1].weapon], carrier),
    };
    for (const f of d.f) {
      f.state = { kind: "bind" };
      f.parry = null; // no guard is up mid-attack; cleared for safety
      f.buffered = null;
    }
    emit(d, out, carrier, "bind", `${d.f[carrier].weapon.name} bound -> both blades held`);
  } else {
    for (const c of contacts.sides) {
      out.push({ time: d.time, side: c, kind: "met", text: "" });
    }
  }

  // Gather strike resolutions AFTER both fighters ticked, so same-tick
  // strikes resolve simultaneously (mutual hit = draw).
  const strikes: Array<0 | 1> = [];
  for (const side of [0, 1] as const) {
    if (evs[side].some((e) => e.type === "strikeEnd")) strikes.push(side);
  }
  const hits: Array<0 | 1> = [];
  for (const side of strikes) {
    const atk = d.f[side];
    const def = d.f[1 - side];
    if (atk.state.kind !== "attack") continue; // safety: state must be recovery-phase attack
    const gap = gapOf(d);
    const tl = atk.state.timeline;
    const baseRecovery = atk.weapon.attacks[atk.state.attack].recovery;
    // The timeline is replaced, never mutated in place: this is its single
    // post-start write site, at strike resolution. Met is checked BEFORE
    // reach: a crossing can latch beyond either blade's own reach (the
    // reach SUM covers wide measure), and steel that met steel ended on
    // steel - resolving it as a miss would contradict the clash the
    // simulation already sounded.
    if (!atk.state.met && gap > atk.weapon.reach) {
      atk.state.timeline = {
        ...tl,
        recoveryEnd: tl.recoveryStart + baseRecovery * atk.weapon.whiffRecoveryFactor,
      };
      emit(d, out, side, "whiff", `${atk.weapon.name} misses -> Nachreisen window open`);
    } else if (atk.state.met) {
      atk.state.timeline = {
        ...tl,
        recoveryEnd: tl.recoveryStart + baseRecovery + atk.weapon.parriedPenalty,
      };
      // The deflection consumes the guard; the still-held key does not
      // re-raise it (raising needs a fresh press).
      dropGuard(def);
      emit(d, out, side, "parried", `${atk.weapon.name} parried -> dui tempi counter available`);
    } else {
      hits.push(side);
    }
  }
  for (const side of hits) {
    const def = d.f[1 - side];
    const flavor =
      def.state.kind === "step" ? " (mid-step: primo tempo)" :
      def.state.kind === "attack" && def.state.phase === "recovery" ? " (in recovery: Nachreisen)" :
      def.state.kind === "attack" ? " (into preparation: mezzo tempo)" :
      def.state.kind === "void" ? " (void mistimed)" : "";
    def.state = { kind: "hitstun", t: 0 };
    dropGuard(def); // a landed blade ends any guard (the charge is moot under hitstun)
    emit(d, out, side, "hit", `${d.f[side].weapon.name} strike lands${flavor}`);
  }
  if (hits.length === 2) {
    d.over = true;
    d.winner = "draw";
    emit(d, out, 0, "draw", "mutual strike: both fighters fall");
  } else if (hits.length === 1) {
    d.over = true;
    d.winner = hits[0];
    emit(d, out, hits[0], "kill", `${d.f[hits[0]].weapon.name} kills`);
  }

  // The latch sweep. When the attack a parry latched onto ends - contact
  // (already released above), a miss, a feint cancellation, the attacker
  // struck down - the engagement is over: a TAP (release queued) drops at
  // the normal recovery price, while a still-held key keeps the guard
  // standing as a plain held guard, latch cleared. Attack-bound versus
  // key-bound, exactly the distinction the held-guard spec preserves.
  for (const side of [0, 1] as const) {
    const f = d.f[side];
    const p = f.parry;
    if (p === null) continue;
    if (p.targetAttackStartTime !== null) {
      const o = d.f[1 - side].state;
      const alive =
        o.kind === "attack" &&
        o.phase !== "recovery" &&
        Math.abs(d.time - o.elapsedMs - p.targetAttackStartTime) < TICK / 2;
      if (!alive) p.targetAttackStartTime = null;
    }
    if (p.releaseQueued && p.targetAttackStartTime === null) dropGuard(f);
  }
  return out;
}

/**
 * Latch contacts and report the NEW ones: the sides whose met cue fires on
 * this tick. A thin caller - every geometric condition lives in the contact
 * module. The mutual case is checked first and returns early, because a
 * fighter cannot both cross a blade and be parried on the same tick; a
 * crossing reports ONE contact, carried by the fighter whose strike began
 * later - the blade whose travel completed the contact.
 */
/**
 * The bind ends - always decisively, since the contest has no neutral
 * exit. The winner leaves clean carrying BIND_ADVANTAGE_MS (no settle -
 * the immediate thrust is the whole point), the loser is turned out into
 * `exposed` holding the pose the bind froze them in, and one logged
 * bindBreak fires on THIS tick - the tick the simulation resolved the
 * contest, never a keypress tick. A fighter whose guard the entry consumed
 * pays parryRecoveryMs here, where it is felt.
 */
function resolveBind(d: Duel, out: DuelEvent[], winner: 0 | 1, cause: "pressure" | "yield"): void {
  const bind = d.bind;
  if (bind === null) return;
  for (const side of [0, 1] as const) {
    const f = d.f[side];
    if (side === winner) {
      f.state = { kind: "ready" };
      f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    } else {
      f.state = { kind: "exposed", t: 0, contact: bind.contact[side], lineSide: bind.line.side };
    }
    if (bind.contact[side].kind === "guard") {
      f.parryRecoveryMs = f.weapon.parryRecoveryMs;
    }
  }
  const how = cause === "pressure" ? "presses through the bind" : "yields and turns the bind";
  emit(d, out, winner, "bindBreak", `${d.f[winner].weapon.name} ${how} -> opening`);
  d.bind = null;
}

/**
 * The bind clock ran out: an evenly matched contest breaks NEUTRAL. Both
 * fighters shove each other apart - an involuntary retreat step through
 * their own step machinery, so the separation is simulated travel (with
 * its footfall and settle), never a teleport. No winner, no advantage, no
 * exposure, and deliberately no sound of its own: silence where a second
 * clash would ring is the information that nobody won, and the growing
 * gap carries the rest. A fighter whose guard the entry consumed still
 * pays parryRecoveryMs here - the guard was spent either way.
 */
function releaseBind(d: Duel): void {
  const bind = d.bind;
  if (bind === null) return;
  for (const side of [0, 1] as const) {
    const f = d.f[side];
    f.state = { kind: "step", dir: -1, t: 0 };
    if (bind.contact[side].kind === "guard") {
      f.parryRecoveryMs = f.weapon.parryRecoveryMs;
    }
  }
  d.bind = null;
}

/** One side's part of a forming bind, read while the states are still live. */
function snapshotContact(f: Fighter): BindContact {
  const s = f.state;
  if (s.kind === "attack") {
    const tl = s.timeline;
    const progress = Math.max(0, Math.min(1, (s.elapsedMs - tl.strikeStart) / (tl.parryableUntil - tl.strikeStart)));
    return { kind: "strike", progress };
  }
  return { kind: "guard", settledMs: f.parry?.settledMs ?? 0 };
}

function markMetBlades(d: Duel): { sides: Array<0 | 1>; crossing: boolean } {
  const gap = gapOf(d);
  const a = d.f[0].state;
  const b = d.f[1].state;
  if (a.kind === "attack" && b.kind === "attack" && bladesCross(d.f[0], d.f[1], gap)) {
    if (a.met && b.met) return { sides: [], crossing: false }; // already latched: no re-emission
    a.met = true;
    b.met = true;
    // "Began later" compares absolute instants: each attack has its own clock.
    const beganA = d.time - a.elapsedMs + a.timeline.strikeStart;
    const beganB = d.time - b.elapsedMs + b.timeline.strikeStart;
    return { sides: [beganA >= beganB ? 0 : 1], crossing: true };
  }
  const contacts: Array<0 | 1> = [];
  for (const side of [0, 1] as const) {
    const s = d.f[side].state;
    if (s.kind !== "attack" || s.met) continue;
    if (parryMeetsAttack(d.f[side], d.f[1 - side], gap)) {
      s.met = true;
      contacts.push(side);
    }
  }
  return { sides: contacts, crossing: false };
}

function clampPositions(d: Duel): void {
  for (const f of d.f) f.x = Math.min(ARENA.right, Math.max(ARENA.left, f.x));
  const gap = gapOf(d);
  if (gap < MIN_GAP) {
    const push = (MIN_GAP - gap) / 2;
    const [l, r] = d.f[0].x <= d.f[1].x ? [d.f[0], d.f[1]] : [d.f[1], d.f[0]];
    // Each side wants to move by `push`, but a wall can absorb part of one
    // side's share. Hand the absorbed remainder to the other side so the
    // pair still separates by MIN_GAP near arena edges. This assumes the
    // arena is wider than MIN_GAP so both ends never wall-limit at once
    // (true here: ARENA.right - ARENA.left = 1680 >> MIN_GAP = 130).
    const lTarget = l.x - push;
    const lClamped = Math.max(ARENA.left, lTarget);
    const lShortfall = lClamped - lTarget;

    const rTarget = r.x + push;
    const rClamped = Math.min(ARENA.right, rTarget);
    const rShortfall = rTarget - rClamped;

    l.x = Math.max(ARENA.left, lClamped - rShortfall);
    r.x = Math.min(ARENA.right, rClamped + lShortfall);
  }
}

/** The blade is visibly rising: past the telegraph, before the strike. */
function inRise(f: Fighter): boolean {
  return (
    f.state.kind === "attack" &&
    f.state.phase === "windup" &&
    f.state.elapsedMs >= f.state.timeline.riseStart
  );
}

function emit(d: Duel, out: DuelEvent[], side: 0 | 1, kind: DuelEvent["kind"], text: string): void {
  const e: DuelEvent = { time: d.time, side, kind, text };
  d.log.push(e);
  out.push(e);
}
