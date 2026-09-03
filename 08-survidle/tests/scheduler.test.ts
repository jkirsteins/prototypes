import { describe, expect, it } from "vitest";
import type { AudioEngine } from "../src/audio/engine";
import { createScheduler } from "../src/audio/scheduler";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";

function fakeEngine() {
  const played: { slot: string; opts?: { gain?: number; pan?: number; rate?: number; delay?: number } }[] = [];
  const loops: Record<string, number>[] = [];
  const engine: AudioEngine = {
    unlock() {}, ready: () => true,
    setLoops(t) { loops.push({ ...t }); },
    play(slot, opts) { played.push({ slot, opts }); },
    settings: () => ({ volume: 1, muted: false, ambience: true }),
    update() {}, suspend() {}, resume() {},
  };
  return { engine, played, loops };
}
const at = (d: number, hour: number) => 1440 * (d - 1) + (hour - 8) * 60;

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

  it("plays calls at their rate, never two within four seconds, and none when not live", () => {
    const { engine, played, loops } = fakeEngine();
    // random() = 0 makes every roll succeed: the four-second spacing is then the only limit.
    const s = createScheduler(engine, () => 0);
    const { state, world } = newGame(5);
    let id = -1;
    for (let i = 0; i < LATTICE_W * LATTICE_H && id < 0; i++) if (regionAt(world, i).capacity.raven) id = i;
    placeAt(state, world, regionAt(world, id).campCell);
    regionState(state, world, id).pop.raven = regionAt(world, id).capacity.raven;
    const noon = calendar(at(62, 12));
    for (let ms = 0; ms <= 20000; ms += 50) s.frame(state, world, noon, 10, ms, true);
    const calls = played.filter((p) => p.slot === "raven");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeLessThanOrEqual(6);
    played.length = 0;
    for (let ms = 20000; ms <= 30000; ms += 50) s.frame(state, world, noon, 10, ms, false);
    expect(played).toHaveLength(0);
    expect(loops.at(-1)).toEqual({});
  });

  it("a call is rare when the roll is high, and cues go straight through", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine, () => 0.999999);
    const { state, world } = newGame(5);
    for (let ms = 0; ms <= 20000; ms += 50) s.frame(state, world, calendar(at(62, 12)), 10, ms, true);
    expect(played.filter((p) => !p.slot.startsWith("step_") && p.slot !== "axe")).toHaveLength(0);
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
