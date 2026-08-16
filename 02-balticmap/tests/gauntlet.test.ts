import { describe, it, expect } from "vitest";
import {
  advance, beginTurn, chooseBuild, declineDuel, newGame, pickDuel, pickFaction,
  playCard, startGame, takesNoTurn, viewOf, type GameState,
} from "../src/game";
import {
  DUEL_TURNS, duelCandidates, outsideTheDuel, type Gauntlet,
} from "../src/gauntlet";
import { hasRuler } from "../src/rulers";
import type { Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rng = () => seededRng(7);

/** Six lands on a complete graph, the human on `beta`. Six because the win
 *  bar is half the map: one conquest on four lands already ends the run, and
 *  a duel test that wins by accident is a duel test about nothing. */
const SIX = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
const maxes = Object.fromEntries(SIX.map((id) => [id, 60]));

function playing(): GameState {
  return pickFaction(
    chooseBuild(
      startGame(newGame(SIX, undefined, {}, undefined, maxes)),
      "warpath", seededRng(1),
    ),
    "beta", seededRng(1),
  );
}

/** Two rivals that hold a chair, named off the board rather than hardcoded:
 *  which lands are dealt a leader is a seeded roll, and a test that guessed
 *  would be testing the roll. */
function ruledRivals(g: GameState): [string, string] {
  const ruled = g.factionIds.filter(
    (f) => f !== "beta" && hasRuler(g.rulers, f),
  );
  expect(ruled.length).toBeGreaterThanOrEqual(2);
  return [ruled[0], ruled[1]];
}

function withGauntlet(g: GameState, gauntlet: Gauntlet): GameState {
  return { ...g, gauntlet };
}

function seatOf(g: GameState, factionId: string): number {
  return g.players.findIndex((p) => p.factionId === factionId);
}

function withHand(g: GameState, seat: number, hand: string[]): GameState {
  return {
    ...g,
    players: g.players.map((pl, i) => (i === seat ? { ...pl, hand } : pl)),
  };
}

/** Walks every seat that will take one through its turn and hands back the
 *  state at the next wrap onto seat 0 - the real `advance`, so a seat the
 *  duel scope stills is stilled by the code under test rather than by the
 *  fixture. Nobody plays anything: `playedThisTurn` is what `advance` waits
 *  for, and a turn spent on nothing still ends. */
function nextRound(g: GameState): GameState {
  let s = g;
  for (let i = 0; i < 60; i++) {
    s = advance({ ...s, playedThisTurn: true, repeatGroup: null }, rng());
    if (s.current === 0) return s;
  }
  throw new Error("nextRound: the round never wrapped");
}

/** The seats that actually took a turn over one round. */
function actedIn(g: GameState): string[] {
  const seen: string[] = [];
  let s = g;
  for (let i = 0; i < 60; i++) {
    s = advance({ ...s, playedThisTurn: true, repeatGroup: null }, rng());
    seen.push(s.players[s.current].factionId);
    if (s.current === 0) return seen;
  }
  throw new Error("actedIn: the round never wrapped");
}

describe("the run opens on a pick", () => {
  it("deals into `picking`, with the border as the offer", () => {
    const g = playing();
    expect(g.gauntlet.kind).toBe("picking");
    const candidates =
      g.gauntlet.kind === "picking" ? g.gauntlet.candidates : [];
    expect(candidates).not.toContain("beta");
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("offers nothing before a land is dealt - nothing borders nothing", () => {
    expect(newGame(SIX).gauntlet).toEqual({ kind: "picking", candidates: [] });
  });

  it("leaves the world turning while the pick stands", () => {
    // The engine never blocks on a question. A reducer that refused to
    // advance until somebody answered would hang the sim, a `?turns=` boot
    // and every test with nobody to ask; holding the SCREEN is `inputLocked`.
    const g = playing();
    const after = nextRound(g);
    expect(after.turn).toBe(g.turn + 1);
    expect(after.gauntlet.kind).toBe("picking");
  });
});

describe("the candidates", () => {
  it("are the bordering realms, in map order", () => {
    const g = playing();
    expect(duelCandidates(viewOf(g), "beta")).toEqual(
      SIX.filter((id) => id !== "beta"),
    );
  });

  it("drop the actor's own vassals - a duel needs two realms", () => {
    // `attackReach` deliberately includes a lord's own vassals, because
    // holding one under the independence gate is what vassalage costs. A
    // duel against one would scope the turn loop to a single realm.
    const g = playing();
    const overlords = new Map(g.overlords);
    overlords.set("gamma", "beta");
    expect(duelCandidates(viewOf({ ...g, overlords }), "beta"))
      .not.toContain("gamma");
  });

  it("name the faction that HOLDS an annexed land, never the land", () => {
    const g = playing();
    const held = { ...g, incorporated: { gamma: "delta" } };
    const offered = duelCandidates(viewOf(held), "beta");
    expect(offered).not.toContain("gamma");
    expect(offered).toContain("delta");
  });
});

describe("a duel scopes the turn loop", () => {
  it("stills a third realm and nobody else", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy, until: g.turn + DUEL_TURNS,
    });
    expect(takesNoTurn(duel, "beta")).toBe(false); // the person
    expect(takesNoTurn(duel, enemy)).toBe(false); // the other side
    expect(hasRuler(duel.rulers, third)).toBe(true);
    expect(takesNoTurn(duel, third)).toBe(true); // a chief, and no fight
  });

  it("keeps a vassal of either side in it", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const overlords = new Map(g.overlords);
    overlords.set(third, enemy);
    const duel = withGauntlet(
      { ...g, overlords },
      { kind: "duel", enemy, until: g.turn + DUEL_TURNS },
    );
    // fullRealmOf and not realmOf: taking a lord takes its pyramid, so the
    // pyramid is what fights.
    expect(takesNoTurn(duel, third)).toBe(false);
    const mine = new Map(g.overlords);
    mine.set(third, "beta");
    expect(
      takesNoTurn(
        withGauntlet(
          { ...g, overlords: mine },
          { kind: "duel", enemy, until: g.turn + DUEL_TURNS },
        ),
        third,
      ),
    ).toBe(false);
  });

  it("never stills a PERSON, whichever side they are on", () => {
    // A second person playing a seat in neither realm would otherwise be
    // frozen out for twenty rounds by a fight they are not in.
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(
      { ...g, humanSeats: [0, seatOf(g, third)] },
      { kind: "duel", enemy, until: g.turn + DUEL_TURNS },
    );
    expect(takesNoTurn(duel, third)).toBe(false);
  });

  it("still gives up an annexed seat - the run is over for them", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(
      { ...g, incorporated: { [enemy]: third } },
      { kind: "duel", enemy, until: g.turn + DUEL_TURNS },
    );
    expect(takesNoTurn(duel, enemy)).toBe(true);
  });

  it("is only two realms round the table", () => {
    const g = playing();
    const [enemy] = ruledRivals(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy, until: g.turn + DUEL_TURNS,
    });
    expect(new Set(actedIn(duel))).toEqual(new Set(["beta", enemy]));
  });

  it("does not exist for a board nobody is playing", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    expect(
      outsideTheDuel(
        { kind: "duel", enemy, until: 99 }, null, third,
        g.overlords, g.incorporated,
      ),
    ).toBe(false);
  });
});

describe("answering the pick", () => {
  it("opens a duel that runs DUEL_TURNS rounds", () => {
    const g = playing();
    const after = pickDuel(g, "gamma");
    expect(after.gauntlet).toEqual({
      kind: "duel", enemy: "gamma", until: g.turn + DUEL_TURNS,
    });
  });

  it("refuses anything the offer does not hold", () => {
    // An identity return is what `commitDecision` reads as refused, so a
    // stale modal or a wire message cannot scope the loop to a land the
    // player may not fight.
    const g = playing();
    expect(pickDuel(g, "beta")).toBe(g);
    expect(pickDuel(g, "nobody")).toBe(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy: "gamma", until: g.turn + DUEL_TURNS,
    });
    expect(pickDuel(duel, "delta")).toBe(duel);
  });

  it("takes declining as an answer, and spends the round on the world", () => {
    const g = playing();
    const once = declineDuel(g);
    expect(once.gauntlet).toEqual({ kind: "world-tick" });
    // And there is nothing left to decline: the answer was given.
    expect(declineDuel(once)).toBe(once);
  });
});

describe("the cycle turns at the round wrap", () => {
  /** A wrap onto seat 0 with nothing else moving - the same shape
   *  `landMarches` uses in tests/game.test.ts. */
  const wrap = (g: GameState): GameState =>
    beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());

  it("holds the duel until its turn comes", () => {
    const g = playing();
    const duel = withGauntlet(g, {
      kind: "duel", enemy: "gamma", until: g.turn + 5,
    });
    expect(wrap(duel).gauntlet).toEqual(duel.gauntlet);
  });

  it("ends a duel on the clock", () => {
    const g = playing();
    const duel = withGauntlet(g, {
      kind: "duel", enemy: "gamma", until: g.turn + 1,
    });
    expect(wrap(duel).gauntlet).toEqual({ kind: "world-tick" });
  });

  it("ends a duel the moment a land is taken from the enemy", () => {
    const g0 = playing();
    const [enemy] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, defense: { [enemy]: 0 } },
      { kind: "duel", enemy, until: g0.turn + DUEL_TURNS },
    );
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), enemy, { sourceId: "beta" },
    );
    expect(declared.gauntlet.kind).toBe("duel"); // the arrow is not the taking
    const landed = beginTurn({ ...declared, turn: declared.turn + 1 }, rng());
    expect(landed.overlords.get(enemy)).toBe("beta");
    expect(landed.gauntlet).toEqual({ kind: "world-tick" });
  });

  it("ends a duel the enemy is winning, too", () => {
    // A duel that ended only on the player's own conquest would trap a
    // losing player inside the scope that is beating them.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    const g = withGauntlet(
      {
        ...g0, overlords, defense: { [third]: 0 },
        marches: {
          "1": {
            id: 1, actor: enemy, from: enemy, to: third, cardId: "raid",
            damage: 1, holdsArmy: true, declared: g0.turn - 1,
            expiry: g0.turn,
          },
        },
      },
      { kind: "duel", enemy, until: g0.turn + DUEL_TURNS },
    );
    const taken = beginTurn({ ...g, current: seatOf(g, enemy) }, rng());
    expect(taken.overlords.get(third)).toBe(enemy);
    // The duel is decided but the round it was decided in stands: the cycle
    // turns at the wrap and nowhere else.
    expect(taken.gauntlet).toEqual({
      kind: "duel", enemy, until: g0.turn,
    });
    expect(wrap(taken).gauntlet).toEqual({ kind: "world-tick" });
  });

  it("does not end on a land taken from somebody else", () => {
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, defense: { [third]: 0 } },
      { kind: "duel", enemy, until: g0.turn + DUEL_TURNS },
    );
    const landed = beginTurn(
      {
        ...playCard(
          withHand(g, 0, ["raid"]), 0, rng(), third, { sourceId: "beta" },
        ),
        turn: g.turn + 1,
      },
      rng(),
    );
    expect(landed.overlords.get(third)).toBe("beta");
    expect(landed.gauntlet.kind).toBe("duel");
  });

  it("spends exactly one round on the world, then asks again", () => {
    const g = withGauntlet(playing(), { kind: "world-tick" });
    const acted = actedIn(g);
    // Everybody with a chair, which is what a world tick is for.
    expect(acted.length).toBeGreaterThan(2);
    const after = nextRound(g);
    expect(after.gauntlet.kind).toBe("picking");
  });

  it("re-reads the offer rather than quoting a stale one", () => {
    const g = playing();
    const held = { ...g, incorporated: { gamma: "delta" } };
    const after = beginTurn({ ...held, current: 0, turn: g.turn + 1 }, rng());
    expect(after.gauntlet.kind).toBe("picking");
    const candidates =
      after.gauntlet.kind === "picking" ? after.gauntlet.candidates : [];
    expect(candidates).not.toContain("gamma");
  });

  it("keeps the same offer object when nothing moved", () => {
    const g = playing();
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());
    expect(after.gauntlet).toBe(g.gauntlet);
  });
});

describe("a duel cannot hang the run", () => {
  it("survives the enemy being swallowed by a third party", () => {
    // Only the two realms act, but a third party's arrow declared before the
    // duel still lands at the round wrap, so the enemy can stop existing
    // mid-duel. The clock is the backstop, and it is reachable because the
    // person's own seat always takes its turn and the wrap is at that seat.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, incorporated: { [enemy]: third } },
      { kind: "duel", enemy, until: g0.turn + 1 },
    );
    expect(actedIn(g)).toEqual(["beta"]);
    const after = nextRound(g);
    expect(after.gauntlet).toEqual({ kind: "world-tick" });
  });
});
