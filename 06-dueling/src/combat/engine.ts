import { applyIntent, TICK, tickFighter } from "./fighter";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { Intent, WeaponProfile } from "./types";
import { parryableMs } from "./weapons";

/** left/right are cm along the piste (~17 m usable); floorY is canvas px (vertical is render-only). */
export const ARENA = { left: 120, right: 1800, floorY: 430 };
/** Minimum body-center separation in cm: two fighters in stance just short of touching. */
export const MIN_GAP = 130;

export interface DuelEvent {
  time: number;
  side: 0 | 1;
  kind: "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "kill" | "draw" | "step" | "met";
  text: string;
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

  for (const side of [0, 1] as const) {
    const intent = intents[side];
    if (intent === null || d.over) continue;
    const before = d.f[side].state.kind;
    const r = applyIntent(d.f[side], intent, { tell: side === 1 });
    if (r === "accepted" && before !== d.f[side].state.kind) {
      const k = d.f[side].state.kind;
      if (k === "attack") emit(d, out, side, "attackStart", `${d.f[side].weapon.name} ${intent} begins`);
      else if (k === "void") emit(d, out, side, "void", `${d.f[side].weapon.name} voids`);
      else if (k === "parry") emit(d, out, side, "parry", `${d.f[side].weapon.name} raises a parry`);
      // Steps go to the returned array only, never d.log: they exist for
      // presentation (footstep audio), and every step would drown the log.
      else if (k === "step") out.push({ time: d.time, side, kind: "step", text: "" });
    }
  }

  d.time += dt;
  const evs: [FighterEvent[], FighterEvent[]] = [tickFighter(d.f[0], dt), tickFighter(d.f[1], dt)];

  // Chained steps start inside flushBuffer, bypassing the acceptance chain
  // above, so they surface as fighter events instead.
  for (const side of [0, 1] as const) {
    for (const e of evs[side]) {
      if (e.type === "stepStart") out.push({ time: d.time, side, kind: "step", text: "" });
    }
  }

  clampPositions(d);
  markMetBlades(d, out);

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
    if (gap > atk.weapon.reach) {
      atk.state.recoveryMs *= atk.weapon.whiffRecoveryFactor;
      emit(d, out, side, "whiff", `${atk.weapon.name} misses -> Nachreisen window open`);
    } else if (atk.state.met) {
      atk.state.recoveryMs += atk.weapon.parriedPenalty;
      // The guard has done its work; free it now rather than leaving the
      // defender committed to a blade that is no longer coming.
      if (def.state.kind === "parry") {
        def.state = { kind: "idle" };
        def.parryCd = def.weapon.parryCooldown;
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
 * A parry succeeds by meeting the blade while it travels, not by being up
 * at the instant of impact: any overlap between the defender's guard and
 * the attack's parryable interval counts. That makes "meet the blade as it
 * commits" one rule for every weapon, instead of a press time that shifts
 * with each attack's strike duration.
 */
function markMetBlades(d: Duel, out: DuelEvent[]): void {
  for (const side of [0, 1] as const) {
    const atk = d.f[side];
    const s = atk.state;
    if (s.kind !== "attack" || s.phase !== "strike" || s.met) continue;
    if (s.t > parryableMs(atk.weapon.attacks[s.attack])) continue;
    if (gapOf(d) > atk.weapon.reach) continue; // nothing to meet: out of measure
    if (d.f[1 - side].state.kind === "parry") {
      s.met = true;
      // This is the instant of blade contact; "parried" only resolves at
      // strike end. Presentation-only (the clash sound), so unlogged.
      out.push({ time: d.time, side, kind: "met", text: "" });
    }
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

function emit(d: Duel, out: DuelEvent[], side: 0 | 1, kind: DuelEvent["kind"], text: string): void {
  const e: DuelEvent = { time: d.time, side, kind, text };
  d.log.push(e);
  out.push(e);
}
