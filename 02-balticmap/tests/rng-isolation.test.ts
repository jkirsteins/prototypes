import { describe, it, expect } from "vitest";
import { runGame } from "../src/sim";
import baseline from "./fixtures/seeded-games-baseline.json";
import { BASELINE_FACTION, BASELINE_SEEDS, BASELINE_TURN_CAP } from "./baseline-config";

describe("seeded games", () => {
  // Ruler naming must be a pure function of faction and turn, never a draw
  // from the rng that shuffles decks. If a name ever costs an rng value,
  // every seeded game diverges from here and this test says so.
  it("are unchanged by anything that does not touch the rules", () => {
    const games = BASELINE_SEEDS.map((seed) =>
      runGame({ seed, humanFaction: BASELINE_FACTION, turnCap: BASELINE_TURN_CAP }),
    );
    expect(games).toEqual(baseline);
  });
});
