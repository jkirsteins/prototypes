import { describe, it, expect } from "vitest";
import {
  SCENARIOS, WORLD_SCENARIOS, checksFor, runScenario, runWorldScenario,
  worldChecksFor, type Expectation,
} from "../src/scenarios";
import {
  DECK_ARMS, HUMAN_DECKS, HUMAN_POLICIES, WORLD_ARMS, aggregate,
} from "../src/sim";

describe("scenario definitions", () => {
  it("has unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a known arm, policy and deck, and expects something", () => {
    for (const s of SCENARIOS) {
      expect(Object.keys(DECK_ARMS), s.id).toContain(s.arm);
      expect(Object.keys(HUMAN_POLICIES), s.id).toContain(s.humanPolicy);
      expect(Object.keys(HUMAN_DECKS), s.id).toContain(s.humanDeck);
      expect(Object.keys(s.expect).length, s.id).toBeGreaterThan(0);
    }
  });

  it("uses bands that are ordered and non-empty", () => {
    for (const s of SCENARIOS) {
      for (const [metric, band] of Object.entries(s.expect)) {
        expect(band[0], `${s.id}/${metric}`).toBeLessThan(band[1]);
      }
    }
  });
});

describe("checksFor", () => {
  const stats = aggregate("x", []);

  it("passes a value inside its band and fails one outside", () => {
    const inside = checksFor({ subjugatedShare: [0, 1] }, { ...stats, subjugatedShare: 0.5 });
    expect(inside[0].ok).toBe(true);
    const outside = checksFor({ subjugatedShare: [0.8, 1] }, { ...stats, subjugatedShare: 0.5 });
    expect(outside[0].ok).toBe(false);
  });

  it("treats an unmeasurable metric as a miss rather than a pass", () => {
    const c = checksFor(
      { medianFirstSubjugation: [1, 10] },
      { ...stats, medianFirstSubjugation: null },
    );
    expect(c[0].ok).toBe(false);
  });

  it("accepts the band edges", () => {
    const expect_: Expectation = { defeatShare: [0.25, 0.75] };
    expect(checksFor(expect_, { ...stats, defeatShare: 0.25 })[0].ok).toBe(true);
    expect(checksFor(expect_, { ...stats, defeatShare: 0.75 })[0].ok).toBe(true);
  });
});

describe("world scenarios", () => {
  it("has unique ids", () => {
    const ids = WORLD_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a known arm and orders every band", () => {
    for (const s of WORLD_SCENARIOS) {
      expect(Object.keys(WORLD_ARMS), s.id).toContain(s.arm);
      expect(Object.keys(s.expect).length, s.id).toBeGreaterThan(0);
      for (const [metric, band] of Object.entries(s.expect)) {
        expect(band[0], `${s.id}/${metric}`).toBeLessThanOrEqual(band[1]);
      }
    }
  });

  it("counts an unmeasurable metric as a miss, never as a pass", () => {
    const checks = worldChecksFor(
      { medianEndTurn: [1, 10] },
      {
        arm: "x", games: 0, unifiedShare: 0, capShare: 0, medianEndTurn: null,
        meanEndTurn: null, meanSubjugations: null, meanIncorporations: null,
        medianLargestRealm: null, medianStallTurns: null,
        firstLegalTargetShare: null, targetedPlaysSeen: 0, playShareByCard: {},
        meanPreventedAssassinations: null, meanUntestedGuards: null,
        meanUnusedBoosts: null, meanAlliancesOnOwnTargets: null,
        alliancesOnOwnTargetsShare: null,
        meanSettlementsFounded: null, settlementsOnHeldLandsShare: null,
        settlementsFoundedTotal: 0, settlementsWalkedOffShare: null,
        revoltsSownTotal: 0, revoltsPlayedTotal: 0,
        medianVassalTenure: null, meanVassalTenure: null,
      },
    );
    expect(checks[0].ok).toBe(false);
  });

  it("holds every committed world band", { timeout: 600_000 }, () => {
    for (const s of WORLD_SCENARIOS) {
      const result = runWorldScenario(s);
      for (const c of result.checks) {
        expect(
          c.ok,
          `${s.id} ${c.metric}: ${c.value} outside ${c.band[0]}..${c.band[1]}`,
        ).toBe(true);
      }
    }
  });
});

describe.each(SCENARIOS.map((s) => [s.id, s] as const))(
  "scenario %s",
  (_id, scenario) => {
    it(
      `holds its pacing bands: ${scenario.description}`,
      { timeout: 60_000 },
      () => {
        const result = runScenario(scenario);
        const misses = result.checks
          .filter((c) => !c.ok)
          .map((c) => `${c.metric}=${c.value} outside ${c.band[0]}..${c.band[1]}`);
        expect(misses, misses.join("; ")).toEqual([]);
      },
    );
  },
);
