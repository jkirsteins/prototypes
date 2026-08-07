import { describe, expect, test } from "vitest";
import { ARENA_PLATFORM, TILE } from "../src/movement/level";
import { DRAW_MS, EDGE_MARGIN, SENTINEL_POST, createArenaScene } from "../src/scenes/arena";
import { TICK } from "../src/combat/fighter";
import type { ArenaScene } from "../src/scenes/arena";
import type { HeldLevels, Scene } from "../src/scenes/scene";

const audioStub = { unlock() {}, frame() {}, moveFrame() {}, cue() {}, toggleMute() {} };
const HELD0: HeldLevels = { advance: false, retreat: false, guard: false, up: false, down: false, walk: false };

function scene(): ArenaScene {
  return createArenaScene({
    ctx: null as unknown as CanvasRenderingContext2D,
    images: {} as never,
    tiles: {} as never,
    audio: audioStub as never,
    seedPin: 7,
    initialAiMode: 4, // the shipping default: the measure-managing duelist

    pWeapon: "longsword",
    eWeapon: "rapier",
  });
}

const tick = (s: Scene, n: number, held: HeldLevels = HELD0): void => {
  for (let i = 0; i < n; i++) s.tickOnce(held, 0);
};
const press = (s: Scene, key: string): void => {
  // The scene reads only key/code; node has no KeyboardEvent constructor.
  s.press({ key, code: "" } as KeyboardEvent);
};
const DRAW_TICKS = Math.ceil(DRAW_MS / TICK) + 1;

describe("the arena scene", () => {
  test("starts sheathed on the floor, enemy waiting on the platform", () => {
    const s = scene();
    const w = s.world();
    expect(w.player.kind).toBe("mover");
    if (w.player.kind === "mover") expect(w.player.m.y).toBe(10 * TILE);
    expect(w.enemy.x).toBeGreaterThan(ARENA_PLATFORM.left);
    expect(w.enemy.x).toBeLessThan(ARENA_PLATFORM.right);
    expect(w.duel).toBeNull();
    expect(s.snapshot().armed).toBe(false);
  });

  test("drawing takes DRAW_MS and produces a fighter", () => {
    const s = scene();
    press(s, "e");
    tick(s, 2);
    expect(s.world().player.kind).toBe("drawing");
    tick(s, DRAW_TICKS);
    expect(s.world().player.kind).toBe("fighter");
    expect(s.snapshot().armed).toBe(true);
  });

  test("drawing is refused mid-air", () => {
    const s = scene();
    const w = s.world();
    if (w.player.kind !== "mover") throw new Error("setup");
    w.player.m.state = { kind: "fall" };
    w.player.m.y = 8 * TILE; // mid-air over the floor
    press(s, "e");
    tick(s, 1);
    expect(s.world().player.kind).toBe("mover");
  });

  /** Teleport the mover onto the platform beside the enemy, then draw. */
  function engaged(): ArenaScene {
    const s = scene();
    const w = s.world();
    if (w.player.kind !== "mover") throw new Error("setup");
    w.player.m.x = 700;
    w.player.m.y = ARENA_PLATFORM.topY;
    w.player.m.state = { kind: "idle" };
    press(s, "e");
    tick(s, DRAW_TICKS + 2);
    return s;
  }

  test("finishing the draw on the platform assembles a duel with the waiting enemy", () => {
    const s = engaged();
    const w = s.world();
    expect(w.duel).not.toBeNull();
    expect(w.duel?.f[1]).toBe(w.enemy);
    if (w.player.kind === "fighter") expect(w.duel?.f[0]).toBe(w.player.f);
    else throw new Error("player should be a fighter");
  });

  test("backing past the lip dissolves the duel into a sheathed fall", () => {
    const s = engaged();
    const w = s.world();
    if (w.player.kind !== "fighter") throw new Error("setup");
    w.player.f.x = ARENA_PLATFORM.left - 1; // a retreat's travel just crossed the lip
    tick(s, 1);
    const after = s.world();
    expect(after.duel).toBeNull();
    expect(after.player.kind).toBe("mover");
    if (after.player.kind === "mover") expect(after.player.m.state.kind).toBe("fall");
    expect(s.snapshot().armed).toBe(false);
  });

  test("the enemy never enters the edge margin, even under sustained advance", () => {
    const s = engaged();
    const held = { ...HELD0, advance: true };
    for (let i = 0; i < 3000; i++) {
      s.tickOnce(held, 0);
      const e = s.world().enemy;
      expect(e.x).toBeGreaterThanOrEqual(ARENA_PLATFORM.left + EDGE_MARGIN - 1);
      expect(e.x).toBeLessThanOrEqual(ARENA_PLATFORM.right - EDGE_MARGIN + 1);
    }
  });

  test("an unarmed player beside the enemy is never attacked; it holds its post", () => {
    const s = scene();
    const w = s.world();
    if (w.player.kind !== "mover") throw new Error("setup");
    w.player.m.x = w.enemy.x - 150;
    w.player.m.y = ARENA_PLATFORM.topY;
    w.player.m.state = { kind: "idle" };
    for (let i = 0; i < 4000; i++) {
      s.tickOnce(HELD0, 0);
      expect(s.world().enemy.state.kind).not.toBe("attack");
    }
    expect(s.snapshot().decided).toBe(false);
    expect(Math.abs(s.world().enemy.x - SENTINEL_POST)).toBeLessThan(60);
  });

  test("after a disengage the enemy walks back to its post", () => {
    const s = engaged();
    const w = s.world();
    if (w.player.kind !== "fighter") throw new Error("setup");
    // Displace the enemy from its post, then bail off the lip and watch
    // the walk home.
    w.enemy.x = SENTINEL_POST - 200;
    w.player.f.x = ARENA_PLATFORM.left - 1;
    tick(s, 1);
    expect(s.world().duel).toBeNull();
    tick(s, 1200);
    expect(Math.abs(s.world().enemy.x - SENTINEL_POST)).toBeLessThan(60);
  });

  test("reset rebuilds the yard: player sheathed on the floor, enemy back at its post", () => {
    const s = engaged();
    s.reset();
    const w = s.world();
    expect(w.player.kind).toBe("mover");
    expect(w.duel).toBeNull();
    expect(w.enemy.state.kind).toBe("ready");
    expect(w.enemy.x).toBe(SENTINEL_POST);
  });
});
