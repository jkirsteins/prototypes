import { describe, it, expect } from "vitest";
import { runGame } from "../src/sim";
import baseline from "./fixtures/seeded-games-baseline.json";
import { BASELINE_FACTION, BASELINE_SEEDS, BASELINE_TURN_CAP } from "./baseline-config";

describe("seeded games", () => {
  // Ruler naming must be a pure function of faction and turn, never a draw
  // from the rng that shuffles decks. If a name ever costs an rng value,
  // every seeded game diverges from here and this test says so.
  //
  // A deliberate change to the CARDS set is the other, legitimate way this
  // fixture can go stale: buildAiDeck() draws one rng() value per
  // deck-buildable non-basic in CARDS's declaration order, so adding or
  // removing a card shifts every later rng draw for every seeded game and
  // requires re-freezing the fixture with `npm run capture:baseline`. To
  // tell that apart from a real bug (an accidental rng draw reaching the
  // rules), run one of the fixed-deck world arms (e.g. conquest-scaled or
  // conquest-omens via `npm run simulate:world`) before and after the change:
  // those arms build their decks explicitly and never call buildAiDeck. If
  // their output also moved, the code is wrong - fix it, do not re-freeze. If
  // their output is byte-identical, only deck building moved and re-freezing
  // this fixture is correct.
  it("are unchanged by anything that does not touch the rules", () => {
    const games = BASELINE_SEEDS.map((seed) =>
      runGame({ seed, humanFaction: BASELINE_FACTION, turnCap: BASELINE_TURN_CAP }),
    );
    expect(games).toEqual(baseline);
  });
});
