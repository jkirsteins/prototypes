import { applyIntent, lineOf, TICK, tickFighter } from "./fighter";
import { bladesCross, parryMeetsAttack } from "./contact";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { Intent, WeaponProfile } from "./types";

// The contact module is the single home of blade geometry; the engine
// re-exports it so existing consumers keep one import site.
export { bladesCross, extension, parryMeetsAttack } from "./contact";

/** left/right are cm along the piste (~17 m usable); floorY is canvas px (vertical is render-only). */
export const ARENA = { left: 120, right: 1800, floorY: 430 };
/** Minimum body-center separation in cm: two fighters in stance just short of touching. */
export const MIN_GAP = 130;

export interface DuelEvent {
  time: number;
  side: 0 | 1;
  kind:
    | "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "feint" | "kill" | "draw"
    // Presentation-only kinds, returned but never logged. They mark the
    // simulation instant a thing physically happens (a foot plants, a blade
    // starts rising or travelling, a blade arrives at a guard) - which is
    // never the tick the triggering input was accepted.
    | "step" | "swing" | "met" | "windup";
  text: string;
  /** windup only: how long the rise lasts, so audio can match its length. */
  ms?: number;
}

export interface Duel {
  f: [Fighter, Fighter];
  time: number;
  over: boolean;
  winner: 0 | 1 | "draw" | null;
  log: DuelEvent[];
}

export function createDuel(wa: WeaponProfile, wb: WeaponProfile): Duel {
  return {
    f: [createFighter(660, 1, wa), createFighter(1260, -1, wb)],
    time: 0,
    over: false,
    winner: null,
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

  for (const side of [0, 1] as const) {
    const intent = intents[side];
    if (intent === null || d.over) continue;
    const before = d.f[side].state.kind;
    // The AI's attacks carry a telegraph: extra windup the player can read.
    // The fighter simulation never learns who controls it - it only sees
    // a windup bonus. A parry press infers its side target from the
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
    const r = applyIntent(d.f[side], intent, {
      windupBonusMs: side === 1 ? d.f[side].weapon.telegraphMs : 0,
      targetSide: intent === "parry" && threatVisible ? lineOf(opp).side : undefined,
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
  for (const c of markMetBlades(d)) {
    out.push({ time: d.time, side: c, kind: "met", text: "" });
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
      // The guard has done its work; release it now rather than leaving
      // the defender holding against a blade that is no longer coming.
      if (def.parry !== null) {
        def.parry = null;
        def.parryRecoveryMs = def.weapon.parryRecoveryMs;
      }
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
    def.parry = null; // a landed blade ends any guard
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

  // A latched parry ends with its attack, however the attack ends: contact
  // (the parried branch above released it already), a miss, a feint
  // cancellation, or the attacker struck down. The sweep asks one question -
  // does the attack this parry waits for still exist, unresolved? - and
  // releases the guard at its normal recovery price when the answer is no.
  for (const side of [0, 1] as const) {
    const f = d.f[side];
    const p = f.parry;
    if (p === null || p.targetAttackStartTime === null) continue;
    const o = d.f[1 - side].state;
    const alive =
      o.kind === "attack" &&
      o.phase !== "recovery" &&
      Math.abs(d.time - o.elapsedMs - p.targetAttackStartTime) < TICK / 2;
    if (!alive) {
      f.parry = null;
      f.parryRecoveryMs = f.weapon.parryRecoveryMs;
    }
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
function markMetBlades(d: Duel): Array<0 | 1> {
  const gap = gapOf(d);
  const a = d.f[0].state;
  const b = d.f[1].state;
  if (a.kind === "attack" && b.kind === "attack" && bladesCross(d.f[0], d.f[1], gap)) {
    if (a.met && b.met) return []; // already latched: no re-emission
    a.met = true;
    b.met = true;
    // "Began later" compares absolute instants: each attack has its own clock.
    const beganA = d.time - a.elapsedMs + a.timeline.strikeStart;
    const beganB = d.time - b.elapsedMs + b.timeline.strikeStart;
    return [beganA >= beganB ? 0 : 1];
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
  return contacts;
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
