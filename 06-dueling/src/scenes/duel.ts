import { aiDecide, createAiState } from "../combat/ai";
import { createDuel, tickDuel } from "../combat/engine";
import { TICK } from "../combat/fighter";
import { WEAPONS } from "../combat/weapons";
import { advanceBulletTime, bulletTimePhase, bulletTimeScale, createBulletTime } from "../ui/bullettime";
import { drawFrame } from "../render/draw";
import type { AiMode } from "../combat/ai";
import type { AudioEngine } from "../audio/audio";
import type { Duel, DuelEvent } from "../combat/engine";
import type { Intent, WeaponId } from "../combat/types";
import type { ActionId, Labels } from "../input/scheme";
import type { SheetName } from "../render/sheets";
import type { TimeControl } from "../render/draw";
import type { HeldAction, HeldLevels, Scene } from "./scene";

export interface DuelSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  audio: AudioEngine;
  /** URL-param seed pin, or undefined for fresh seeds per duel. */
  seedPin: number | undefined;
  initialAiMode: AiMode;
}

export function createDuelScene(deps: DuelSceneDeps): Scene & { setWeapons(p: WeaponId, e: WeaponId): void; start(): void } {
  let pWeapon: WeaponId = "longsword";
  let eWeapon: WeaponId = "rapier";
  let aiMode = deps.initialAiMode;
  let duel: Duel | null = null;
  let ai = createAiState();
  let activeSeed = 0;
  let pending: Intent | null = null;
  let bullet = createBulletTime();
  let frameEvents: DuelEvent[] = [];

  const start = (): void => {
    // Without ?seed each duel draws a fresh one so rematches are not
    // replays; a pinned seed makes a fight worth repeating recoverable.
    activeSeed = deps.seedPin ?? Math.floor(Math.random() * 0xffffffff);
    duel = createDuel(WEAPONS[pWeapon], WEAPONS[eWeapon]);
    ai = createAiState(activeSeed);
    pending = null;
    // A fresh duel starts on a fresh clock - the abandoned fight's easing
    // may not leak in. createBulletTime()'s level/depth/wasActive all
    // start at their off state, so this reassignment alone sounds no cue.
    bullet = createBulletTime();
  };

  return {
    id: "duel",
    holdKeys: { a: "retreat", d: "advance", l: "guard" },
    setWeapons(p, e) { pWeapon = p; eWeapon = e; },
    start,
    reset: start,
    heldEdge(action: HeldAction, value: boolean) {
      if (action === "guard") pending = value ? "parry" : "parryRelease";
      else if (!value && duel) {
        const dir = action === "advance" ? "advance" : "retreat";
        if (duel.f[0].buffered === dir) duel.f[0].buffered = null;
      }
    },
    press(e: KeyboardEvent): boolean {
      if (duel === null) return false;
      switch (e.key.toLowerCase()) {
        case "s": pending = "void"; return true;
        case "j": pending = "cut"; return true;
        case "k": pending = "thrust"; return true;
        case "i": pending = "disarm"; return true;
        case "arrowleft": case "arrowright": case "capslock":
          pending = "sideShift"; return true;
        case "f": pending = "feint"; return true;
        case "arrowup": pending = "stanceUp"; return true;
        case "arrowdown": pending = "stanceDown"; return true;
        case "shift": {
          if (e.code !== "ShiftLeft") return false;
          const f = duel.f[0];
          const target = f.heightTo ?? f.height;
          pending = target === "high" ? "stanceDown" : "stanceUp";
          return true;
        }
        case "0": aiMode = 0; return true;
        case "1": aiMode = 1; return true;
        case "2": aiMode = 2; return true;
        case "3": aiMode = 3; return true;
        case "4": aiMode = 4; return true;
        default: return false;
      }
    },
    keyRelease(e: KeyboardEvent) {
      // The lock's OFF edge (see the keydown case): also a press.
      if (e.key.toLowerCase() === "capslock" && duel !== null) pending = "sideShift";
    },
    padAction(a: ActionId) {
      switch (a) {
        case "void": case "cut": case "thrust": case "feint":
        case "stanceUp": case "stanceDown": case "sideShift": case "disarm":
          pending = a;
          break;
        default:
          break;
      }
    },
    tickOnce(held: HeldLevels) {
      if (!duel) return;
      let ia: Intent | null = pending;
      pending = null;
      if (ia === null && held.advance) ia = "advance";
      if (ia === null && held.retreat) ia = "retreat";
      const ib = aiDecide(duel, aiMode, ai, TICK);
      frameEvents.push(...tickDuel(duel, ia, ib));
    },
    frameScale(wallDt: number): number {
      const edge = advanceBulletTime(bullet, wallDt, bulletTimePhase(duel));
      if (edge === "enter") deps.audio.cue("bulletIn");
      else if (edge === "exit") deps.audio.cue("bulletOut");
      return bulletTimeScale(bullet);
    },
    audioFrame() {
      deps.audio.frame(frameEvents);
      frameEvents = [];
    },
    draw(overlay: boolean, labels: Labels, time: TimeControl) {
      if (!duel) return;
      drawFrame(
        { ctx: deps.ctx, images: deps.images, overlay, labels },
        duel, aiMode, activeSeed,
        { ...time, bulletScale: bulletTimeScale(bullet) },
      );
    },
    snapshot() {
      return { live: duel !== null && !duel.over, decided: duel?.over === true };
    },
  };
}
