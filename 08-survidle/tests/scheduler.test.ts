import { requireCamp } from "./siting-helpers";
import { describe, expect, it } from "vitest";
import type { AudioEngine } from "../src/audio/engine";
import { createScheduler, roll } from "../src/audio/scheduler";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { HOWLING_HOLD } from "../src/sim/soundscape";
import type { GameState } from "../src/sim/types";
import { regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { testAtmosphere } from "./weather-helpers";

function fakeEngine() {
  const played: { slot: string; opts?: { gain?: number; pan?: number; rate?: number; delay?: number } }[] = [];
  const loops: Record<string, number>[] = [];
  const engine: AudioEngine = {
    unlock() {}, ready: () => true,
    setLoops(t) { loops.push({ ...t }); },
    play(slot, opts) { played.push({ slot, opts }); },
    settings: () => ({ volume: 1, muted: false, ambience: true }),
    update() {}, suspend() {}, resume() {}, duck() {},
  };
  return { engine, played, loops };
}
const at = (d: number, hour: number) => 1440 * (d - 1) + (hour - 8) * 60;

/** A region where `species` lives, with its population at capacity, and the survivor at its camp. */
function among(state: GameState, world: ReturnType<typeof newGame>["world"], species: "raven" | "wolf"): void {
  let id = -1;
  for (let i = 0; i < LATTICE_W * LATTICE_H && id < 0; i++) if (regionAt(world, i).capacity[species]) id = i;
  placeAt(state, world, requireCamp(regionAt(world, id)));
  regionState(state, world, id).pop[species] = regionAt(world, id).capacity[species];
}

/**
 * Runs the scheduler over `minutes` of game time at one game minute a real
 * second, four frames a minute, the calendar pinned at `cal`, and returns
 * every call with the game minute it was heard at.
 */
function listen(s: ReturnType<typeof createScheduler>, played: { slot: string }[], state: GameState, world: ReturnType<typeof newGame>["world"], cal: ReturnType<typeof calendar>, minutes: number, live = true): { slot: string; minute: number }[] {
  const heard: { slot: string; minute: number }[] = [];
  const start = state.minute;
  for (let ms = 0; ms <= minutes * 1000; ms += 250) {
    state.minute = start + ms / 1000;
    const before = played.length;
    s.frame(state, world, cal, 10, ms, live);
    for (const p of played.slice(before)) if (!p.slot.startsWith("step_") && p.slot !== "axe") heard.push({ slot: p.slot, minute: Math.floor(state.minute) });
  }
  return heard;
}

describe("scheduler", () => {
  it("steps every 0.6 s while walking and swings the axe while felling", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine, () => 0.5);
    const { state, world } = newGame(3);
    const cal = calendar(state.minute);
    state.task = { id: "walk", progress: 0, duration: 10, repeat: false };
    for (let ms = 0; ms <= 3000; ms += 16) s.frame(state, world, cal, 10, ms, true);
    const steps = played.filter((p) => p.slot.startsWith("step_"));
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(6);
    played.length = 0;
    state.task = { id: "chop", progress: 0, duration: 50, repeat: false };
    for (let ms = 3000; ms <= 6000; ms += 16) s.frame(state, world, cal, 10, ms, true);
    expect(played.filter((p) => p.slot === "axe").length).toBe(2);
  });

  it("rolls the calls from the seed and the game minute: the same run hears the same calls at the same minutes", () => {
    const noon = calendar(at(62, 12));
    const runs = [0, 1].map(() => {
      const { engine, played } = fakeEngine();
      const { state, world } = newGame(5);
      among(state, world, "raven");
      return listen(createScheduler(engine, Math.random), played, state, world, noon, 600);
    });
    expect(runs[0].length).toBeGreaterThan(3);
    expect(runs[1]).toEqual(runs[0]);
    // Another seed is another night, even over the same ground.
    const { engine, played } = fakeEngine();
    const { state, world } = newGame(5);
    among(state, world, "raven");
    state.seed = 6;
    expect(listen(createScheduler(engine), played, state, world, noon, 600)).not.toEqual(runs[0]);
    // The roll itself is a pure function of seed, minute and name.
    expect(roll(5, 100, "raven")).toBe(roll(5, 100, "raven"));
    expect(roll(5, 100, "raven")).not.toBe(roll(5, 101, "raven"));
    expect(roll(5, 100, "raven")).not.toBe(roll(6, 100, "raven"));
    expect(roll(5, 100, "raven")).not.toBe(roll(5, 100, "owl"));
  });

  it("plays at most one call per burst, four game minutes apart, hears more than one species, and nothing when not live", () => {
    const { engine, played, loops } = fakeEngine();
    const s = createScheduler(engine);
    const { state, world } = newGame(5);
    among(state, world, "raven");
    const noon = calendar(at(62, 12));
    const heard = listen(s, played, state, world, noon, 1800);
    expect(heard.length).toBeGreaterThan(5);
    for (let i = 1; i < heard.length; i++) expect(heard[i].minute - heard[i - 1].minute).toBeGreaterThanOrEqual(4);
    expect(heard.some((c) => c.slot === "raven")).toBe(true);
    expect(new Set(heard.map((c) => c.slot)).size).toBeGreaterThan(1);
    played.length = 0;
    expect(listen(s, played, state, world, noon, 600, false)).toHaveLength(0);
    expect(loops.at(-1)).toEqual({});
  });

  it("does not fire the calls of a stretch nobody heard: a jump of hours rolls its last minutes only", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine);
    const { state, world } = newGame(5);
    among(state, world, "raven");
    const noon = calendar(at(62, 12));
    s.frame(state, world, noon, 10, 0, true);
    state.minute += 8 * 60;
    played.length = 0;
    s.frame(state, world, noon, 10, 250, true);
    // Ten minutes at a raven's rate is a call at most, never the eight hours' worth.
    expect(played.length).toBeLessThanOrEqual(1);
  });

  it("the full-moon chorus holds its slot for hours after a bout while the single howl keeps rolling", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine);
    const { state, world } = newGame(5);
    among(state, world, "wolf");
    testAtmosphere({ cloud: 0 });
    const full = calendar(at(3, 1));
    // Sixty game hours of a clear full-moon night over a full pack: the
    // chorus rate alone passes some eighteen rolls, and the hold lets at
    // most fifteen bouts through, so the spacing is what the hold decides.
    const heard = listen(s, played, state, world, full, 60 * 60);
    const chorus = heard.filter((c) => c.slot === "howling");
    expect(chorus.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < chorus.length; i++) expect(chorus[i].minute - chorus[i - 1].minute).toBeGreaterThanOrEqual(HOWLING_HOLD);
    expect(heard.filter((c) => c.slot === "wolf").length).toBeGreaterThan(chorus.length);
  });

  it("cues go straight through", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine);
    s.cue("treeFalls");
    expect(played.at(-1)?.slot).toBe("treeFalls");
  });

  it("hands the beds to the engine", () => {
    const { engine, loops } = fakeEngine();
    const s = createScheduler(engine, () => 0.5);
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    s.frame(state, world, calendar(0), 5, 0, true);
    expect(loops.at(-1)?.forest).toBeGreaterThan(0);
  });
});
