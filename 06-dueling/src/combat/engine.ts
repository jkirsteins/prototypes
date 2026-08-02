import { applyIntent, tickFighter } from "./fighter";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { Intent, WeaponProfile } from "./types";

export const ARENA = { left: 60, right: 900, floorY: 430 };
export const MIN_GAP = 64;

export interface DuelEvent {
  time: number;
  side: 0 | 1;
  kind: "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "kill" | "draw";
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
    f: [createFighter(330, 1, wa), createFighter(630, -1, wb)],
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
  const dt = 1000 / 60;

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
    }
  }

  d.time += dt;
  const evs: [FighterEvent[], FighterEvent[]] = [tickFighter(d.f[0], dt), tickFighter(d.f[1], dt)];

  clampPositions(d);

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
    } else if (def.state.kind === "parry") {
      atk.state.recoveryMs += atk.weapon.parriedPenalty;
      def.state = { kind: "idle" };
      def.parryCd = def.weapon.parryCooldown;
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
    // (true here: ARENA.right - ARENA.left = 840 >> MIN_GAP = 64).
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
