import type { AttackKind, AttackPhase, Intent, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;

export type FighterState =
  | { kind: "idle" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "pause"; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: AttackPhase; t: number; recoveryMs: number; tell: boolean }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };

export interface Fighter {
  x: number;
  facing: 1 | -1;
  weapon: WeaponProfile;
  state: FighterState;
  buffered: Intent | null;
  parryCd: number;
}

export type FighterEvent =
  | { type: "strikeEnd"; attack: AttackKind }
  | { type: "attackStart"; attack: AttackKind; tell: boolean }
  | { type: "voidStart" }
  | { type: "parryStart" }
  | { type: "died" };

export function createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter {
  return { x, facing, weapon, state: { kind: "idle" }, buffered: null, parryCd: 0 };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { tell?: boolean },
): "accepted" | "buffered" | "ignored" {
  const k = f.state.kind;
  if (k === "dead" || k === "hitstun") return "ignored";
  if (k === "idle") {
    return startAction(f, intent, opts?.tell ?? false) ? "accepted" : "ignored";
  }
  if (k === "step" || k === "pause") {
    f.buffered = intent; // one-slot buffer, last input wins
    return "buffered";
  }
  return "ignored"; // committed: void, attack, parry
}

function startAction(f: Fighter, intent: Intent, tell: boolean): boolean {
  switch (intent) {
    case "advance":
      f.state = { kind: "step", dir: 1, t: 0 };
      return true;
    case "retreat":
      f.state = { kind: "step", dir: -1, t: 0 };
      return true;
    case "void":
      f.state = { kind: "void", t: 0 };
      return true;
    case "cut":
    case "thrust":
      f.state = {
        kind: "attack",
        attack: intent,
        phase: tell ? "pretempo" : "windup",
        t: 0,
        recoveryMs: f.weapon.attacks[intent].recovery,
        tell,
      };
      return true;
    case "parry":
      if (f.parryCd > 0) return false;
      f.state = { kind: "parry", t: 0 };
      return true;
  }
}

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  f.parryCd = Math.max(0, f.parryCd - dt);
  const s = f.state;
  switch (s.kind) {
    case "idle":
    case "dead":
      if (s.kind === "dead") s.t += dt;
      break;
    case "step": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.stepDuration);
      s.t += dt;
      const now = Math.min(s.t, w.stepDuration);
      f.x += ((now - prev) / w.stepDuration) * w.stepDistance * s.dir * f.facing;
      if (s.t >= w.stepDuration) f.state = { kind: "pause", t: s.t - w.stepDuration };
      break;
    }
    case "pause":
      s.t += dt;
      if (s.t >= f.weapon.stancePause) {
        f.state = { kind: "idle" };
        flushBuffer(f, events);
      }
      break;
    case "void": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.voidDuration);
      s.t += dt;
      const now = Math.min(s.t, w.voidDuration);
      f.x -= ((now - prev) / w.voidDuration) * w.voidDistance * f.facing;
      if (s.t >= w.voidDuration) {
        f.state = { kind: "idle" };
        flushBuffer(f, events);
      }
      break;
    }
    case "parry":
      s.t += dt;
      if (s.t >= f.weapon.parryWindow) {
        f.state = { kind: "idle" };
        f.parryCd = f.weapon.parryCooldown;
      }
      break;
    case "hitstun":
      s.t += dt;
      if (s.t >= HIT_STUN_MS) {
        f.state = { kind: "dead", t: 0 };
        events.push({ type: "died" });
      }
      break;
    case "attack":
      // Implemented in Task 7.
      break;
  }
  return events;
}

function flushBuffer(f: Fighter, events: FighterEvent[]): void {
  const b = f.buffered;
  f.buffered = null;
  if (b !== null && startAction(f, b, false)) {
    emitStart(f, events);
  }
}

function emitStart(f: Fighter, events: FighterEvent[]): void {
  const s = f.state;
  if (s.kind === "attack") events.push({ type: "attackStart", attack: s.attack, tell: s.tell });
  else if (s.kind === "void") events.push({ type: "voidStart" });
  else if (s.kind === "parry") events.push({ type: "parryStart" });
}
