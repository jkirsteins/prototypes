import { aiDecide, createAiState } from "../combat/ai";
import { assembleDuel, inRise, standaloneFighterEvents, tickDuel } from "../combat/engine";
import { TICK, applyIntent, createFighter, tickFighter } from "../combat/fighter";
import { WEAPONS } from "../combat/weapons";
import { createMover, tickMove } from "../movement/engine";
import { ARENA_PLATFORM, TILE, createArenaLevel } from "../movement/level";
import { advanceBulletTime, bulletTimePhase, bulletTimeScale, createBulletTime } from "../ui/bullettime";
import { drawArenaFrame } from "../render/arenadraw";
import { RUN_MAG } from "./move";
import type { AiMode, AiState } from "../combat/ai";
import type { AudioEngine } from "../audio/audio";
import type { Duel, DuelEvent } from "../combat/engine";
import type { Fighter } from "../combat/fighter";
import type { Intent, WeaponId } from "../combat/types";
import type { ActionId, Labels } from "../input/scheme";
import type { Level } from "../movement/level";
import type { MoveEvent, MoveInput, Mover } from "../movement/engine";
import type { SheetName } from "../render/sheets";
import type { TimeControl } from "../render/draw";
import type { HeldAction, HeldLevels, Scene } from "./scene";

// The rule constants live in arenarules.ts (a leaf module - see its
// comment); re-exported here so consumers keep one import site.
export { DRAW_MS, EDGE_MARGIN } from "./arenarules";
import { DRAW_MS, EDGE_MARGIN } from "./arenarules";

/**
 * The player's representation. A Mover while sheathed, a Fighter while
 * drawn; the conversions are the scene's mode boundaries. `floorY` is
 * the cm y of the surface the armed body stands on - a fighter has no
 * vertical physics of its own.
 */
export type PlayerRep =
  | { kind: "mover"; m: Mover }
  | { kind: "drawing"; m: Mover; t: number }
  | { kind: "fighter"; f: Fighter; floorY: number }
  | { kind: "sheathing"; f: Fighter; floorY: number; t: number };

export interface ArenaWorld {
  level: Level;
  player: PlayerRep;
  enemy: Fighter;
  duel: Duel | null;
  time: number;
  aiMode: AiMode;
  seed: number;
}

export interface ArenaSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  audio: AudioEngine;
  seedPin: number | undefined;
  initialAiMode: AiMode;
  pWeapon: WeaponId;
  eWeapon: WeaponId;
}

export interface ArenaScene extends Scene {
  world(): ArenaWorld;
}

const SHEATHED_HOLD: Scene["holdKeys"] = {
  a: "retreat", d: "advance", w: "up", s: "down", l: "guard", shift: "walk",
};
const ARMED_HOLD: Scene["holdKeys"] = { a: "retreat", d: "advance", l: "guard" };

/** The enemy's post: the platform's center. It waits there, and walks
 *  back there whenever no duel holds it elsewhere. */
export const SENTINEL_POST = (ARENA_PLATFORM.left + ARENA_PLATFORM.right) / 2;

/**
 * Policy, not physics: refuse footwork whose travel would end within
 * EDGE_MARGIN of a lip. The enemy's feet, its own choice - the player
 * is free to walk off. Voids travel backward like a retreat.
 */
function edgeSafe(f: Fighter, intent: Intent | null): Intent | null {
  if (intent !== "advance" && intent !== "retreat" && intent !== "void") return intent;
  const dir = intent === "advance" ? f.facing : -f.facing;
  const travel = intent === "void" ? f.weapon.voidDistance : f.weapon.stepDistance;
  const end = f.x + dir * travel;
  if (end < ARENA_PLATFORM.left + EDGE_MARGIN || end > ARENA_PLATFORM.right - EDGE_MARGIN) return null;
  return intent;
}

export function createArenaScene(deps: ArenaSceneDeps): ArenaScene {
  const level = createArenaLevel();
  let activeSeed = 0;
  let aiMode = deps.initialAiMode;
  let player: PlayerRep = { kind: "mover", m: createMover(level) };
  let enemy: Fighter = createFighter(SENTINEL_POST, -1, WEAPONS[deps.eWeapon]);
  let duel: Duel | null = null;
  let ai: AiState = createAiState();
  let bullet = createBulletTime();
  let simTime = 0;
  let pendingIntent: Intent | null = null;
  let pendingJump = false;
  let pendingDash = false;
  let pendingDraw = false;
  let pendingSheathe = false;
  let frameDuelEvents: DuelEvent[] = [];
  let frameMoveEvents: MoveEvent[] = [];

  const armed = (): boolean => player.kind === "fighter" || player.kind === "sheathing";

  const start = (): void => {
    activeSeed = deps.seedPin ?? Math.floor(Math.random() * 0xffffffff);
    const m = createMover(level);
    m.x = 2 * TILE; // on the floor, left of the platform
    player = { kind: "mover", m };
    enemy = createFighter(SENTINEL_POST, -1, WEAPONS[deps.eWeapon]);
    duel = null;
    ai = createAiState(activeSeed);
    bullet = createBulletTime();
    simTime = 0;
    pendingIntent = null;
    pendingJump = pendingDash = pendingDraw = pendingSheathe = false;
    self.holdKeys = SHEATHED_HOLD;
  };

  const fighterToMover = (f: Fighter, floorY: number, state: "idle" | "fall"): Mover => {
    const m = createMover(level);
    m.x = f.x;
    m.y = floorY;
    m.facing = f.facing;
    m.state = { kind: state };
    m.airMs = 0;
    m.airFromJump = false;
    return m;
  };

  /** The duel object dies; the enemy walks out of any pair state - the
   *  contest it was in no longer physically exists. */
  const dissolveDuel = (): void => {
    if (enemy.state.kind === "bind" || enemy.state.kind === "exposed") enemy.state = { kind: "ready" };
    duel = null;
  };

  const playerX = (): number =>
    player.kind === "mover" || player.kind === "drawing" ? player.m.x : player.f.x;

  /**
   * The sentinel at rest: it fights ONLY through a duel - an unarmed
   * body is never attacked - and whenever no duel holds it elsewhere it
   * walks back to its post and waits. Decisions only; every physical
   * consequence goes through the fighter machine.
   */
  const sentinelDecide = (): Intent | null => {
    if (enemy.state.kind !== "ready" || enemy.stepRecoveryMs > 0) return null;
    const d = SENTINEL_POST - enemy.x;
    if (Math.abs(d) > enemy.weapon.stepDistance / 2) {
      const step = enemy.facing === Math.sign(d) ? "advance" : "retreat";
      return edgeSafe(enemy, step);
    }
    return null;
  };

  /**
   * The enemy holds its ground at the margin: MIN_GAP's shove can push a
   * braced fighter where no step of its own would go, so when the pair's
   * separation carries the enemy into the margin the whole pair shifts
   * back, gap intact. Scene-level and policy-driven - the enemy CHOOSES
   * to brace at the lip; the engine's physics stays symmetric.
   */
  const braceAtMargin = (): void => {
    if (duel === null) return;
    const lo = ARENA_PLATFORM.left + EDGE_MARGIN;
    const hi = ARENA_PLATFORM.right - EDGE_MARGIN;
    const shift = Math.max(lo - enemy.x, 0) + Math.min(hi - enemy.x, 0);
    if (shift !== 0) {
      enemy.x += shift;
      duel.f[0].x += shift;
    }
  };

  const self: ArenaScene = {
    id: "arena",
    holdKeys: SHEATHED_HOLD,
    world(): ArenaWorld {
      return { level, player, enemy, duel, time: simTime, aiMode, seed: activeSeed };
    },
    reset: start,
    heldEdge(action: HeldAction, value: boolean) {
      if (!armed()) return;
      if (action === "guard") pendingIntent = value ? "parry" : "parryRelease";
      else if (!value) {
        const f = player.kind === "fighter" || player.kind === "sheathing" ? player.f : null;
        const dir = action === "advance" ? "advance" : "retreat";
        if (f !== null && f.buffered === dir) f.buffered = null;
      }
    },
    press(e: KeyboardEvent): boolean {
      const k = e.key.toLowerCase();
      if (duel?.over === true) return false;
      if (armed()) {
        switch (k) {
          case "e": pendingSheathe = true; return true;
          case "s": pendingIntent = "void"; return true;
          case "j": pendingIntent = "cut"; return true;
          case "k": pendingIntent = "thrust"; return true;
          case "i": pendingIntent = "disarm"; return true;
          case "f": pendingIntent = "feint"; return true;
          case "arrowleft": case "arrowright": case "capslock":
            pendingIntent = "sideShift"; return true;
          case "arrowup": pendingIntent = "stanceUp"; return true;
          case "arrowdown": pendingIntent = "stanceDown"; return true;
          case "shift": {
            if (e.code !== "ShiftLeft" || player.kind !== "fighter") return false;
            const f = player.f;
            const target = f.heightTo ?? f.height;
            pendingIntent = target === "high" ? "stanceDown" : "stanceUp";
            return true;
          }
          case "0": aiMode = 0; return true;
          case "1": aiMode = 1; return true;
          case "2": aiMode = 2; return true;
          case "3": aiMode = 3; return true;
          case "4": aiMode = 4; return true;
          default: return false;
        }
      }
      switch (k) {
        case "k": pendingJump = true; return true;
        case "j": pendingDash = true; return true;
        case "e": pendingDraw = true; return true;
        default: return false;
      }
    },
    keyRelease(e: KeyboardEvent) {
      // The lock's OFF edge, exactly the duel's quirk.
      if (armed() && e.key.toLowerCase() === "capslock") pendingIntent = "sideShift";
    },
    padAction(a: ActionId) {
      if (a === "resetScene") { start(); return; }
      if (a === "drawSheathe") {
        if (armed()) pendingSheathe = true;
        else pendingDraw = true;
        return;
      }
      if (armed()) {
        switch (a) {
          case "void": case "cut": case "thrust": case "feint":
          case "stanceUp": case "stanceDown": case "sideShift": case "disarm":
            pendingIntent = a;
            break;
          default:
            break;
        }
        return;
      }
      if (a === "jump") pendingJump = true;
      else if (a === "dash") pendingDash = true;
    },
    tickOnce(held: HeldLevels, moveMag: number) {
      if (duel?.over === true) return; // the banner owns the scene; R restarts
      simTime += TICK;
      const enemyWasRising = inRise(enemy);

      if (duel !== null) {
        // --- engaged: the duel engine owns both bodies -------------------
        if (pendingSheathe && player.kind === "fighter" && duel.f[0].state.kind === "ready" && duel.bind === null) {
          player = { kind: "sheathing", f: player.f, floorY: player.floorY, t: 0 };
        }
        pendingSheathe = false;
        pendingJump = pendingDash = pendingDraw = false;
        let ia: Intent | null = null;
        if (player.kind === "fighter") {
          ia = pendingIntent;
          if (ia === null && held.advance) ia = "advance";
          if (ia === null && held.retreat) ia = "retreat";
        }
        pendingIntent = null;
        const ib = edgeSafe(enemy, aiDecide(duel, aiMode, ai, TICK));
        frameDuelEvents.push(...tickDuel(duel, ia, ib));
        braceAtMargin();
        if (player.kind === "sheathing") {
          player.t += TICK;
          if (player.t >= DRAW_MS) {
            player = { kind: "mover", m: fighterToMover(player.f, player.floorY, "idle") };
            dissolveDuel();
            self.holdKeys = SHEATHED_HOLD;
            return;
          }
        }
        // The edge rule, the player's side of it: feet past the lip is a
        // fall, and falling sheathes - instantly, no bar.
        if (duel !== null && !duel.over) {
          const fx = duel.f[0].x;
          if (fx < ARENA_PLATFORM.left || fx > ARENA_PLATFORM.right) {
            player = { kind: "mover", m: fighterToMover(duel.f[0], ARENA_PLATFORM.topY, "fall") };
            dissolveDuel();
            self.holdKeys = SHEATHED_HOLD;
          }
        }
        return;
      }

      // --- unengaged: the sentinel walks back to its post and waits ------
      const px = playerX();
      if (enemy.state.kind === "ready") enemy.facing = px >= enemy.x ? 1 : -1;
      const it = sentinelDecide();
      if (it !== null) applyIntent(enemy, it);
      const evs = tickFighter(enemy, TICK);
      frameDuelEvents.push(...standaloneFighterEvents(enemy, 1, simTime, evs, enemyWasRising));

      // --- the player's own representation -------------------------------
      if (player.kind === "mover") {
        // The draw is read against the standing state, before the tick:
        // accepted only from grounded upright stillness-compatible states.
        if (pendingDraw && ["idle", "walk", "run"].includes(player.m.state.kind)) {
          player.m.vx = 0;
          player = { kind: "drawing", m: player.m, t: 0 };
          pendingDraw = pendingJump = pendingDash = false;
          return;
        }
        pendingDraw = false;
        const padWalks = moveMag > 0 && moveMag < RUN_MAG;
        const input: MoveInput = {
          held: {
            left: held.retreat, right: held.advance,
            up: held.up, down: held.down,
            grab: held.guard, walk: held.walk || padWalks,
          },
          pressed: { jump: pendingJump, dash: pendingDash },
        };
        pendingJump = pendingDash = false;
        frameMoveEvents.push(...tickMove(player.m, level, input));
      } else if (player.kind === "drawing") {
        pendingJump = pendingDash = pendingDraw = false;
        player.t += TICK;
        if (player.t >= DRAW_MS) {
          const m = player.m;
          const f = createFighter(m.x, m.x <= enemy.x ? 1 : -1, WEAPONS[deps.pWeapon]);
          player = { kind: "fighter", f, floorY: m.y };
          self.holdKeys = ARMED_HOLD;
        }
      } else if (player.kind === "fighter") {
        // Armed but unengaged: only reachable off the platform. The
        // fighter ticks standalone; strikes whiff at nothing.
        const wasRising = inRise(player.f);
        if (pendingSheathe && player.f.state.kind === "ready") {
          player = { kind: "sheathing", f: player.f, floorY: player.floorY, t: 0 };
          pendingSheathe = false;
          pendingIntent = null;
          return;
        }
        pendingSheathe = false;
        if (player.f.state.kind === "ready") player.f.facing = enemy.x >= player.f.x ? 1 : -1;
        let ia: Intent | null = pendingIntent;
        pendingIntent = null;
        if (ia === null && held.advance) ia = "advance";
        if (ia === null && held.retreat) ia = "retreat";
        if (ia !== null) applyIntent(player.f, ia);
        const pevs = tickFighter(player.f, TICK);
        frameDuelEvents.push(...standaloneFighterEvents(player.f, 0, simTime, pevs, wasRising));
        if (pevs.some((ev) => ev.type === "strikeEnd")) {
          frameDuelEvents.push({ time: simTime, side: 0, kind: "whiff", text: "" });
        }
      } else {
        // sheathing, unengaged
        pendingSheathe = false;
        pendingIntent = null;
        player.t += TICK;
        if (player.t >= DRAW_MS) {
          player = { kind: "mover", m: fighterToMover(player.f, player.floorY, "idle") };
          self.holdKeys = SHEATHED_HOLD;
        }
      }

      // --- engagement: both armed bodies on the same surface -------------
      if (player.kind === "fighter" && player.floorY === ARENA_PLATFORM.topY) {
        duel = assembleDuel(player.f, enemy);
      }
    },
    frameScale(wallDt: number): number {
      const edge = advanceBulletTime(bullet, wallDt, bulletTimePhase(duel));
      if (edge === "enter") deps.audio.cue("bulletIn");
      else if (edge === "exit") deps.audio.cue("bulletOut");
      return bulletTimeScale(bullet);
    },
    audioFrame() {
      deps.audio.frame(frameDuelEvents);
      deps.audio.moveFrame(frameMoveEvents);
      frameDuelEvents = [];
      frameMoveEvents = [];
    },
    draw(overlay: boolean, labels: Labels, time: TimeControl) {
      drawArenaFrame(
        { ctx: deps.ctx, images: deps.images, tiles: deps.tiles, labels },
        this.world(), overlay,
        { ...time, bulletScale: bulletTimeScale(bullet) },
      );
    },
    snapshot() {
      return {
        live: duel?.over !== true,
        decided: duel?.over === true,
        armed: armed(),
      };
    },
  };
  start();
  return self;
}
