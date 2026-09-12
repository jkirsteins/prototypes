import { encodeKnowledge, knowledgeAt } from "../src/sim/fineknowledge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findStartleScenario, prepareStartleScenario, replayStartleScenario, stepStartleScenario } from "../scripts/startle-seeds";
import { setWildlifeEventSink } from "../src/sim/wildlife-events";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { cellAt, neighbours } from "../src/world/gen";
import { passable } from "../src/world/route";
import { readSave, serialize } from "../src/sim/save";

afterEach(() => { setWildlifeEventSink(null); vi.restoreAllMocks(); });

describe("reproducible startle playtests", () => {
  it.each(["visible", "heard-only", "same-area-remain", "bog", "snow", "blocked-edge"] as const)("finds and replays %s with natural seeded rolls", (kind) => {
    // Full 1..5000 discovery is the CLI's job; reuse verified lower bounds
    // here so every normal commit does not regenerate 73 unrelated worlds.
    const scenario = findStartleScenario(kind, kind === "bog" ? 74 : 1, 5000);
    expect(scenario).not.toBeNull();
    const result = replayStartleScenario(scenario!);
    expect(result.kind).toBe(kind);
    expect(replayStartleScenario(scenario!)).toEqual(result);
    expect(findStartleScenario(kind, scenario!.seed, scenario!.seed)).toEqual(scenario);
    const scene = prepareStartleScenario(scenario!);
    const before = JSON.stringify({ mapped: encodeKnowledge(scene.state.knowledge), wildlife: scene.state.wildlife.familiarity, visible: scene.state.wildlife.visible });
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink(event => events.push(event));
    stepStartleScenario(scene, scenario!, true);
    if (kind === "same-area-remain") {
      expect(events).toHaveLength(0);
      expect(result.alarm).toBe(0);
      expect(result.endCell).toBe(scenario!.startCell);
      expect(scenario!.startCell).toBe(scenario!.survivorCell);
    } else {
      expect(events).toHaveLength(1);
      expect(scene.state.log.filter(entry => entry.text === events[0].logText)).toHaveLength(1);
      expect(result.alarm).toBeGreaterThan(0);
      if (kind === "visible") expect(events[0].perception.kind).toBe("seen");
      if (kind === "heard-only") {
        expect(events[0].perception.kind).toBe("heard");
        expect(knowledgeAt(scene.state.knowledge, scenario!.startCell)).toBe("unknown");
        expect(JSON.stringify({ mapped: encodeKnowledge(scene.state.knowledge), wildlife: scene.state.wildlife.familiarity, visible: scene.state.wildlife.visible })).toBe(before);
      }
      if (kind === "bog") expect(events[0].terrain).toBe("bog");
      if (kind === "snow") expect(scene.state.weather.snowCm).toBeGreaterThanOrEqual(5);
      if (kind === "blocked-edge") {
        expect(neighbours(scene.world, scenario!.startCell).some(cell => !passable(cellAt(scene.world, cell).terrain) || cellAt(scene.world, cell).region !== scene.state.player.region)).toBe(true);
        expect(cellAt(scene.world, result.endCell).region).toBe(scene.state.player.region);
        expect(passable(cellAt(scene.world, result.endCell).terrain)).toBe(true);
      }
      // Re-evaluation and saved escape both keep the episode silent.
      stepStartleScenario(scene, scenario!, true);
      const loaded = readSave(serialize(scene.state, 0))!.state;
      stepStartleScenario({ state: loaded, world: scene.world }, scenario!, true);
      expect(events).toHaveLength(1);
    }
  });

  it("honors an exhausted or invalid seed interval", () => {
    expect(findStartleScenario("visible", 2, 1)).toBeNull();
    expect(() => findStartleScenario("visible", 0, Infinity)).toThrow();
    expect(() => findStartleScenario("visible", 1.5, 4)).toThrow();
  });

  it("keeps offline replay silent at the presentation boundary", () => {
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Unseeded random draw"); });
    const scenario = findStartleScenario("visible", 1, 5000)!;
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink(event => events.push(event));
    expect(replayStartleScenario(scenario).kind).toBe("visible");
    expect(events).toHaveLength(0);
  });
});
