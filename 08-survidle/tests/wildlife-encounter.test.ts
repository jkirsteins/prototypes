import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DISTURBANCE_PROFILES, evaluateUngulateEncounter, escapeDistanceM, neutralMovementProfile, startleLogText,
  type UngulateEncounterInput, type StartlePerception,
} from "../src/sim/wildlife-encounter";

const fixture: UngulateEncounterInput = {
  seed: 42, eventId: "herd:1:escape:1", species: "deer",
  geometry: { actor: { xM: 0, yM: 0 }, subject: { xM: 40, yM: 0 }, distanceM: 40, bearingRad: 0, uncertaintyM: 0 },
  movement: { speedKmh: 4, loadKg: 0, noiseFactor: 1, visibilityFactor: 1, footingFactor: 1, deliberateApproach: false },
  terrain: "meadow", lux: 1000, precip: "none", cover: 0, huntingFactor: 1,
  alarm: 0, minutesSinceDetection: 0, escaping: false,
  detectionRoll: 0, auditoryDetectionRoll: 0, sightRoll: 0, hearingRoll: 0,
};

describe("metric disturbance", () => {
  it("has no dependency on grid geometry, unconditionally", () => {
    const source = readFileSync("src/sim/wildlife-encounter.ts", "utf8");
    expect(source).not.toMatch(/CELL_KM|cellOf|cellIndex|neighbours/);
  });

  it("does not force same-area detection or survivor perception", () => {
    const result = evaluateUngulateEncounter({ ...fixture, geometry: { ...fixture.geometry, distanceM: 210 }, detectionRoll: 0.99, auditoryDetectionRoll: 0.99, hearingRoll: 0.99, sightRoll: 0.99 });
    expect(result.detected).toBe(false);
    expect(result.alarm).toBe(0);
    expect(result.perception.kind).toBe("none");
  });

  it.each(["deer", "reindeer", "elk"] as const)("%s starts one escape when detected", (species) => {
    const result = evaluateUngulateEncounter({ ...fixture, species });
    expect(result.detected).toBe(true);
    expect(result.startsEscape).toBe(true);
    expect(result.fleeing).toBe(true);
    expect(evaluateUngulateEncounter({ ...fixture, species, escaping: true, alarm: result.alarm }).startsEscape).toBe(false);
  });

  it.each(["wolf", "wolverine", "bear"] as const)("does not apply ungulate flight to %s", (species) => {
    const result = evaluateUngulateEncounter({ ...fixture, species, alarm: 80 });
    expect(result.detected).toBe(false);
    expect(result.alarm).toBe(80);
    expect(result.startsEscape).toBe(false);
    expect(result.perception.kind).toBe("none");
  });

  it("allows sound alone to alert an animal in darkness", () => {
    const result = evaluateUngulateEncounter({ ...fixture, lux: 0, sightRoll: 1 });
    expect(result.visualDetectionProbability).toBe(0);
    expect(result.detected).toBe(true);
    expect(result.perception.kind).toBe("heard");
  });

  it("separates unseen and unheard flight from detection", () => {
    const result = evaluateUngulateEncounter({ ...fixture, sightRoll: 1, hearingRoll: 1 });
    expect(result.startsEscape).toBe(true);
    expect(result.perception).toEqual({ kind: "none" });
  });

  it("heavy rain masks both detection and departure at the same rolls", () => {
    const input = { ...fixture, detectionRoll: 0.4, auditoryDetectionRoll: 0.4, sightRoll: 0.4, hearingRoll: 0.4 };
    expect(evaluateUngulateEncounter(input).startsEscape).toBe(true);
    expect(evaluateUngulateEncounter({ ...input, precip: "heavy" }).detected).toBe(false);
    expect(evaluateUngulateEncounter({ ...input, precip: "heavy", detectionRoll: 0 }).perception.kind).toBe("none");
  });

  it("Hunting only reduces detection on a deliberate approach", () => {
    const input = { ...fixture, detectionRoll: 0.4, auditoryDetectionRoll: 0.4, huntingFactor: 3 };
    expect(evaluateUngulateEncounter(input).detected).toBe(true);
    expect(evaluateUngulateEncounter({ ...input, movement: { ...input.movement, deliberateApproach: true } }).detected).toBe(false);
  });

  it("movement factors and physical load change the approach signature", () => {
    const ordinary = evaluateUngulateEncounter(fixture);
    const quiet = evaluateUngulateEncounter({ ...fixture, movement: { ...fixture.movement, noiseFactor: 0.4, visibilityFactor: 0.5, footingFactor: 0.5 } });
    expect(quiet.auditoryDetectionProbability).toBeLessThan(ordinary.auditoryDetectionProbability);
    expect(quiet.visualDetectionProbability).toBeLessThan(ordinary.visualDetectionProbability);
    const loaded = evaluateUngulateEncounter({ ...fixture, movement: { ...fixture.movement, loadKg: 30, speedKmh: 6 } });
    expect(loaded.auditoryDetectionProbability).toBeGreaterThan(ordinary.auditoryDetectionProbability);
    expect(neutralMovementProfile(4, 12)).toEqual({ ...fixture.movement, loadKg: 12 });
  });

  it.each([
    { minutes: 29, distance: 300, detected: false, settled: false },
    { minutes: 30, distance: 259, detected: false, settled: false },
    { minutes: 30, distance: 260, detected: false, settled: true },
    { minutes: 60, distance: 40, detected: true, settled: false },
  ])("settling requires time, separation and no new detection: %j", ({ minutes, distance, detected, settled }) => {
    const result = evaluateUngulateEncounter({ ...fixture, alarm: 80, escaping: true, minutesSinceDetection: minutes, geometry: { ...fixture.geometry, distanceM: distance } });
    expect(result.detected).toBe(detected);
    expect(result.settled).toBe(settled);
    expect(result.alarm === 0).toBe(settled);
  });

  it("keeps below-flight alarm alert without inventing a startle", () => {
    const result = evaluateUngulateEncounter({ ...fixture, alarm: 30, detectionRoll: 1, auditoryDetectionRoll: 1 });
    expect(result.alert).toBe(true);
    expect(result.fleeing).toBe(false);
    expect(result.perception.kind).toBe("none");
  });

  it("derives reproducible rolls independently of unrelated evaluation order", () => {
    const input = { ...fixture, detectionRoll: undefined, auditoryDetectionRoll: undefined, sightRoll: undefined, hearingRoll: undefined };
    const before = evaluateUngulateEncounter(input);
    evaluateUngulateEncounter({ ...input, seed: 5, eventId: "other" });
    expect(evaluateUngulateEncounter(input)).toEqual(before);
  });

  it.each(["deer", "reindeer", "elk"] as const)("keeps seeded %s escapes within physical bounds", (species) => {
    const bounds = { deer: [420, 680], reindeer: [500, 760], elk: [520, 800] }[species];
    const distances = Array.from({ length: 50 }, (_, i) => escapeDistanceM(42, `escape:${i}`, DISTURBANCE_PROFILES[species]));
    expect(Math.min(...distances)).toBeGreaterThanOrEqual(bounds[0]);
    expect(Math.max(...distances)).toBeLessThanOrEqual(bounds[1]);
    expect(new Set(distances).size).toBeGreaterThan(1);
    expect(escapeDistanceM(42, "escape:0", DISTURBANCE_PROFILES[species])).toBe(distances[0]);
  });

  it.each([NaN, Infinity])("ignores invalid metric geometry %s", (distanceM) => {
    const assertion = vi.spyOn(console, "assert").mockImplementation(() => {});
    try {
      const result = evaluateUngulateEncounter({ ...fixture, alarm: 37, geometry: { ...fixture.geometry, distanceM } });
      expect(result.alarm).toBe(37);
      expect(result.detected).toBe(false);
      expect(result.startsEscape).toBe(false);
      expect(result.perception.kind).toBe("none");
    } finally { assertion.mockRestore(); }
  });
});

describe("departure disclosure", () => {
  it.each([
    { recognized: true, speciesKnown: true, distance: 40, kind: "subject" },
    { recognized: false, speciesKnown: true, distance: 40, kind: "species" },
    { recognized: false, speciesKnown: false, distance: 40, kind: "ungulate" },
    { recognized: true, speciesKnown: true, distance: 130, kind: "unknown" },
  ])("sight discloses only legible detail: %j", ({ distance, kind, ...knowledge }) => {
    expect(evaluateUngulateEncounter({ ...fixture, ...knowledge, geometry: { ...fixture.geometry, distanceM: distance } }).perception).toEqual({ kind: "seen", identification: kind });
  });

  it.each([
    { speciesKnown: true, huntingFactor: 2, distance: 40, kind: "species" },
    { speciesKnown: false, huntingFactor: 1, distance: 40, kind: "ungulate" },
    { speciesKnown: true, huntingFactor: 1, distance: 170, kind: "unknown" },
  ])("hearing never names the recognized subject: %j", ({ distance, kind, ...knowledge }) => {
    const result = evaluateUngulateEncounter({ ...fixture, ...knowledge, recognized: true, sightRoll: 1, geometry: { ...fixture.geometry, distanceM: distance } });
    expect(result.perception).toMatchObject({ kind: "heard", identification: kind });
    expect(result.perception).toHaveProperty("uncertaintyM");
  });

  it("Hunting cannot make a masked departure audible", () => {
    const result = evaluateUngulateEncounter({ ...fixture, huntingFactor: 100, sightRoll: 1, competingNoise: 1 });
    expect(result.startsEscape).toBe(true);
    expect(result.perception.kind).toBe("none");
  });

  it.each([
    { perception: { kind: "seen", identification: "subject" }, terrain: "birch", want: "The River Herd startles and bounds into the birches." },
    { perception: { kind: "seen", identification: "species" }, terrain: "birch", want: "A roe deer herd startles and bounds into the birches." },
    { perception: { kind: "seen", identification: "ungulate" }, terrain: "meadow", want: "A herd of hoofed animals startles and bounds through the grass." },
    { perception: { kind: "heard", identification: "ungulate", uncertaintyM: 10 }, terrain: "spruce", want: "Hooves crash away through the spruce to the east." },
    { perception: { kind: "heard", identification: "ungulate", uncertaintyM: 80 }, terrain: "spruce", want: "Hooves crash away through the spruce." },
    { perception: { kind: "heard", identification: "unknown", uncertaintyM: 80 }, terrain: "spruce", want: "Something crashes away through the spruce." },
    { perception: { kind: "none" }, terrain: "spruce", want: null },
  ] as const)("writes only disclosed log facts: $want", ({ perception, terrain, want }) => {
    expect(startleLogText({ perception: perception as StartlePerception, species: "deer", subjectName: "River Herd", group: "group", terrain, bearingRad: 0, distanceM: 40 })).toBe(want);
  });
});
