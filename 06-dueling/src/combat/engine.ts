import { applyIntent, guardEffective, TICK, tickFighter } from "./fighter";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { Intent, WeaponProfile } from "./types";

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
    // a windup bonus.
    const r = applyIntent(d.f[side], intent, {
      windupBonusMs: side === 1 ? d.f[side].weapon.telegraphMs : 0,
    });
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
  markMetBlades(d);

  // The clash sounds when the blade arrives at the guard - the end of its
  // travel - not when the parry press latched `met` somewhere inside the
  // parryable window.
  for (const side of [0, 1] as const) {
    const s = d.f[side].state;
    if (s.kind !== "attack" || s.phase !== "strike" || !s.met) continue;
    const arriveAt = s.timeline.parryableUntil;
    if (s.elapsedMs >= arriveAt && s.elapsedMs - dt < arriveAt) {
      out.push({ time: d.time, side, kind: "met", text: "" });
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
    // post-start write site, at strike resolution.
    if (gap > atk.weapon.reach) {
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
  return out;
}

/**
 * True if the defender's raised parry meets this attack on this tick: the
 * single site deciding blade contact. A parry succeeds by meeting the blade
 * while it travels, not by being up at the instant of impact - any overlap
 * between the defender's guard and the attack's parryable interval counts,
 * one rule for every weapon.
 *
 * MVP limitation: coverage is universal - a raised parry stops any cut or
 * thrust whose timing and reach line up. Attacks do not yet have lines
 * (high/low, inside/outside), so a feint can provoke an early parry and
 * punish its recovery, but cannot deceive the defender about where the
 * real attack arrives. When lines land, they become one more condition
 * HERE - attack.line in parry.coveredLines - and nowhere else.
 */
export function parryMeetsAttack(attacker: Fighter, defender: Fighter, gap: number): boolean {
  const s = attacker.state;
  if (s.kind !== "attack" || s.phase !== "strike") return false;
  if (s.elapsedMs > s.timeline.parryableUntil) return false; // delivered: too late
  if (gap > attacker.weapon.reach) return false; // nothing to meet: out of measure
  return guardEffective(defender); // a still-rising guard is visible, not formed
}

function markMetBlades(d: Duel): void {
  for (const side of [0, 1] as const) {
    const s = d.f[side].state;
    if (s.kind !== "attack" || s.met) continue;
    if (parryMeetsAttack(d.f[side], d.f[1 - side], gapOf(d))) s.met = true;
  }
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
