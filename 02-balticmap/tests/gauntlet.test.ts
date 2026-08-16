import { describe, it, expect } from "vitest";
import {
  advance, beginTurn, chooseBuild, declineDuel, escapesVassalage, newGame,
  pickBoon, pickDuel, pickFaction, playCard, startGame, takesNoTurn, viewOf,
  type GameState,
} from "../src/game";
import {
  ACTS, actExitSize, BIG_LAND_SITES, BOON_GROWTH_AMOUNT,
  BOSS_CEILING_PER_ACT, BOSS_LEADERSHIP_PER_ACT, bossFor, DUEL_DEFENSE_REWARD,
  DUEL_WEALTH_REWARD, duelCandidates, duelStakes, outsideTheDuel, rewardFor,
  type Gauntlet,
} from "../src/gauntlet";
import { LAND_GROWTH } from "../src/defense";
import {
  damageAfterTerrain, PASSIVES, stripOnCapture,
} from "../src/passives";
import { naiveHumanTurn, runGame, SIM_FACTION_IDS } from "../src/sim";
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
    expect(newGame(SIX).gauntlet).toEqual({ kind: "picking", candidates: [], boss: false });
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
  it("are the bordering realms with a chief, in map order", () => {
    const g = playing();
    const led = SIX.filter((id) => id !== "beta" && hasRuler(g.rulers, id));
    expect(led.length).toBeGreaterThan(0);
    expect(duelCandidates(viewOf(g), "beta")).toEqual(led);
  });

  it("prefer a chief - a leaderless enemy is the rare case, not the usual one", () => {
    // Measured before this rule: 110 of 110 turn-1 candidates across all 26
    // seats of the real map were leaderless, because `actingFactions` spaces
    // the acting seats apart. A duel is the fight the run is built around,
    // and one against a land that never answers is the map standing still.
    const g = playing();
    for (const id of duelCandidates(viewOf(g), "beta")) {
      expect(hasRuler(g.rulers, id)).toBe(true);
    }
    expect(SIX.some((id) => id !== "beta" && !hasRuler(g.rulers, id)))
      .toBe(true);
  });

  it("still offer a chiefless land to a realm hemmed in by quiet ones", () => {
    // The border is what it is. An empty modal would be worse than a fight
    // against a quiet land, which acts for the duel's length anyway.
    const g = playing();
    const quiet = { ...g, rulers: { beta: g.rulers.beta } };
    const offered = duelCandidates(viewOf(quiet), "beta");
    expect(offered).toEqual(SIX.filter((id) => id !== "beta"));
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

describe("what may be staked", () => {
  it("is the realm's own lands, in map order", () => {
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    const g = { ...g0, overlords };
    const stakes = duelStakes(viewOf(g), "beta", enemy);
    // The realm and nothing else - a bet is made out of what you hold.
    expect(stakes).toContain("beta");
    expect(stakes).toContain(third);
    expect(stakes).not.toContain(enemy);
    // Map order, so the offer reads the same way twice and a seeded replay
    // lists the same lands in the same places.
    expect(stakes).toEqual(g.factionIds.filter((f) => stakes.includes(f)));
  });

  it("includes a VASSAL's land, which is a real risk and not an oversight", () => {
    // `fullRealmOf` per the realm-sizes rule: a lord marches out of its
    // vassals' lands, so a vassal's border land is as much a front as its own.
    // Staking one carries the extra risk that the vassal walks out from under
    // the bet - which voids the duel - and the player can read that gate on
    // the same map.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    expect(duelStakes(viewOf({ ...g0, overlords }), "beta", enemy))
      .toContain(third);
  });

  it("drops a land too far from the enemy to march on", () => {
    // A stake the player's own arrows cannot reach would be a bet on a fight
    // happening somewhere else. `marchHopsTo` and not a fourth spelling of
    // distance, so this is the same reach the aim and the source list use.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    // A line rather than a complete graph: `third` sits four lands from the
    // enemy, which is past MAX_MARCH_HOPS.
    const far = SIX.filter((f) => f !== enemy && f !== third);
    const adjacency: Record<string, string[]> = {
      [third]: [far[0]],
      [far[0]]: [third, far[1]],
      [far[1]]: [far[0], far[2]],
      [far[2]]: [far[1], far[3]],
      [far[3]]: [far[2], enemy],
      [enemy]: [far[3]],
    };
    const g = { ...g0, overlords, adjacency };
    expect(duelStakes(viewOf(g), "beta", enemy)).not.toContain(third);
  });
});

describe("a duel scopes the turn loop", () => {
  it("stills a third realm and nobody else", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy, staked: null, decided: null, boss: false
    });
    expect(takesNoTurn(duel, "beta")).toBe(false); // the person
    expect(takesNoTurn(duel, enemy)).toBe(false); // the other side
    expect(hasRuler(duel.rulers, third)).toBe(true);
    expect(takesNoTurn(duel, third)).toBe(true); // a chief, and no fight
  });

  it("keeps a vassal of either side in it", () => {
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    // Held UNDER its independence gate, which is what a vassal looks like:
    // an absent defense score means a land at its ceiling, and a vassal
    // standing there is one turn from winning its freedom - which takes it
    // out of both realms and out of the fight (see `overlordsAfterEscape`).
    const g = { ...g0, defense: { [third]: 10 } };
    const overlords = new Map(g.overlords);
    overlords.set(third, enemy);
    const duel = withGauntlet(
      { ...g, overlords },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
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
          { kind: "duel", enemy, staked: null, decided: null, boss: false},
        ),
        third,
      ),
    ).toBe(false);
  });

  it("does not leak for the one turn a vassal escapes on", () => {
    // `advance` asks this question on the board as it stands, and the
    // independence escape is the FIRST thing `beginTurn` does - so a vassal
    // standing at its gate is a seat that leaves the duelling realm before it
    // plays a card. Asked of the realm it is leaving, it played a turn the
    // scope forbids and corrected itself only at the next wrap.
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const overlords = new Map(g.overlords);
    overlords.set(third, "beta");
    // At its ceiling, so the gate stands open.
    const duel = withGauntlet(
      { ...g, overlords },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    expect(escapesVassalage(duel, third)).toBe(true);
    expect(takesNoTurn(duel, third)).toBe(true);
    expect(actedIn(duel)).not.toContain(third);
    // And nothing outside a duel reads the escape early: the world tick still
    // hands that seat its turn, and the turn is where it wins its freedom.
    const tick = withGauntlet(
      { ...g, overlords }, { kind: "world-tick", until: g.turn + 1 },
    );
    expect(takesNoTurn(tick, third)).toBe(false);
  });

  it("never stills a PERSON, whichever side they are on", () => {
    // A second person playing a seat in neither realm would otherwise be
    // frozen out for twenty rounds by a fight they are not in.
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(
      { ...g, humanSeats: [0, seatOf(g, third)] },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    expect(takesNoTurn(duel, third)).toBe(false);
  });

  it("still gives up an annexed seat - the run is over for them", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(
      { ...g, incorporated: { [enemy]: third } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    expect(takesNoTurn(duel, enemy)).toBe(true);
  });

  it("is only two realms round the table", () => {
    const g = playing();
    const [enemy] = ruledRivals(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy, staked: null, decided: null, boss: false
    });
    expect(new Set(actedIn(duel))).toEqual(new Set(["beta", enemy]));
  });

  it("does not exist for a board nobody is playing", () => {
    const g = playing();
    const [enemy, third] = ruledRivals(g);
    expect(
      outsideTheDuel(
        { kind: "duel", enemy, staked: null, decided: null, boss: false}, null, third,
        g.overlords, g.incorporated,
      ),
    ).toBe(false);
  });
});

describe("answering the pick", () => {
  it("opens a duel with nothing decided yet", () => {
    const g = playing();
    // Off the offer rather than named: which lands hold a chair is a seeded
    // roll, and the offer prefers the ones that do.
    const [enemy] = ruledRivals(g);
    // A fresh deal is a ONE-LAND realm, so it stakes nothing: there is nothing
    // to bet that is not the run itself.
    const after = pickDuel(g, enemy, null);
    expect(after.gauntlet).toEqual({
      kind: "duel", enemy, staked: null, decided: null, boss: false
    });
  });

  it("puts a land up when the realm has one to put up", () => {
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    const g = { ...g0, overlords };
    expect(duelStakes(viewOf(g), "beta", enemy)).toContain(third);
    expect(pickDuel(g, enemy, third).gauntlet)
      .toEqual({ kind: "duel", enemy, staked: third, decided: null, boss: false });
  });

  it("refuses a stake outside the realm, and one owed but not named", () => {
    // The stake is the losing condition, so a duel opened without one - on a
    // realm that has something to bet - would be a fight that cannot be lost.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, "beta");
    const g = { ...g0, overlords };
    expect(pickDuel(g, enemy, enemy)).toBe(g);
    expect(pickDuel(g, enemy, null)).toBe(g);
  });

  it("refuses anything the offer does not hold", () => {
    // An identity return is what `commitDecision` reads as refused, so a
    // stale modal or a wire message cannot scope the loop to a land the
    // player may not fight.
    const g = playing();
    expect(pickDuel(g, "beta", null)).toBe(g);
    expect(pickDuel(g, "nobody", null)).toBe(g);
    const [enemy, third] = ruledRivals(g);
    const duel = withGauntlet(g, {
      kind: "duel", enemy, staked: null, decided: null, boss: false
    });
    expect(pickDuel(duel, third, null)).toBe(duel);
  });

  it("takes declining as an answer, and spends the round on the world", () => {
    const g = playing();
    const once = declineDuel(g);
    // `turn + 2` and not `turn + 1`. A decline is answered MID-ROUND, on the
    // player's own turn, which is the turn just after the wrap - so a tick
    // ending at the next wrap would be over before a single unscoped round
    // had run.
    expect(once.gauntlet).toEqual({ kind: "world-tick", until: g.turn + 2 });
    // And there is nothing left to decline: the answer was given.
    expect(declineDuel(once)).toBe(once);
  });

  it("does not put the offer back on the very next turn", () => {
    // The bug this exists to keep out: eleven straight turns of the same four
    // tiles, because the tick was over at the wrap that immediately follows a
    // mid-round decline and the world round a decline costs was never spent.
    const g = declineDuel(playing());
    const next = nextRound(g);
    expect(next.turn).toBe(g.turn + 1);
    expect(next.gauntlet.kind).toBe("world-tick");
    // The round that just started is the price: everybody with a chair takes
    // a turn in it, and only THEN does the offer come back.
    expect(actedIn(next).length).toBeGreaterThan(2);
    const after = nextRound(next);
    expect(after.turn).toBe(g.turn + 2);
    expect(after.gauntlet.kind).toBe("picking");
  });
});

describe("the cycle turns at the round wrap", () => {
  /** A wrap onto seat 0 with nothing else moving - the same shape
   *  `landMarches` uses in tests/game.test.ts. */
  const wrap = (g: GameState): GameState =>
    beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());

  it("holds an undecided duel, however many rounds pass", () => {
    // There is no clock. A duel ends when ground moves and at no other time,
    // so a fight nobody can crack simply goes on - which is the risk the stake
    // was chosen to carry instead of a timer.
    const g = playing();
    let duel = withGauntlet(g, {
      kind: "duel", enemy: "gamma", staked: null, decided: null, boss: false
    });
    for (let i = 0; i < 25; i++) {
      duel = wrap(duel);
      expect(duel.gauntlet.kind).toBe("duel");
    }
  });

  it("retires a duel the moment one is recorded as decided", () => {
    const g = playing();
    const duel = withGauntlet(g, {
      kind: "duel", enemy: "gamma", staked: null, decided: "won", boss: false
    });
    // The wrap is one turn on, and the tick it opens is over by the wrap
    // after that: one whole unscoped round, which is what a retiring duel has
    // always spent.
    expect(wrap(duel).gauntlet)
      .toEqual({ kind: "world-tick", until: g.turn + 2 });
  });

  it("ends a duel the moment a land is taken from the enemy", () => {
    const g0 = playing();
    const [enemy] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, defense: { [enemy]: 0 } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), enemy, { sourceId: "beta" },
    );
    expect(declared.gauntlet.kind).toBe("duel"); // the arrow is not the taking
    const landed = beginTurn({ ...declared, turn: declared.turn + 1 }, rng());
    expect(landed.overlords.get(enemy)).toBe("beta");
    expect(landed.gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
  });

  it("does not end on any land of the enemy's - only the enemy's own", () => {
    // The fight is about two named polygons. A raid that takes the enemy's
    // VASSAL moves the board and leaves the duel running, which is what makes
    // the stake a bet rather than a label on whatever happened to fall.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const overlords = new Map(g0.overlords);
    overlords.set(third, enemy);
    const g = withGauntlet(
      { ...g0, overlords, defense: { [third]: 0 } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false },
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
    expect(landed.gauntlet).toMatchObject({ kind: "duel", decided: null });
  });

  it("ends a duel the enemy is winning, when the STAKE falls", () => {
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
      { kind: "duel", enemy, staked: third, decided: null, boss: false },
    );
    const taken = beginTurn({ ...g, current: seatOf(g, enemy) }, rng());
    expect(taken.overlords.get(third)).toBe(enemy);
    // The duel is decided but the round it was decided in stands: the cycle
    // turns at the wrap and nowhere else.
    expect(taken.gauntlet).toEqual({
      kind: "duel", enemy, staked: third, decided: "lost", boss: false
    });
    expect(wrap(taken).gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
  });

  it("does not end when a land of yours that is NOT the stake falls", () => {
    // The mirror of the vassal case above, and the half that makes the bet a
    // bet: a losing player can be pushed back without the fight being over.
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
      { kind: "duel", enemy, staked: "beta", decided: null, boss: false },
    );
    const taken = beginTurn({ ...g, current: seatOf(g, enemy) }, rng());
    expect(taken.overlords.get(third)).toBe(enemy);
    expect(taken.gauntlet).toMatchObject({ kind: "duel", decided: null });
  });

  it("does not end on a land taken from somebody else", () => {
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, defense: { [third]: 0 } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
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
    const base = playing();
    const g = withGauntlet(base, { kind: "world-tick", until: base.turn + 1 });
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
  it("voids when the enemy is swallowed by a third party", () => {
    // Only the two realms act, but a third party's arrow declared before the
    // duel still lands at the round wrap, so the enemy can stop existing
    // mid-duel. With no clock behind it this is the arm that stops such a duel
    // running for the rest of the run: an annexed people has no seat, takes no
    // turn and can lose no land, so nothing could ever decide the fight.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, incorporated: { [enemy]: third } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false },
    );
    expect(actedIn(g)).toEqual(["beta"]);
    const after = nextRound(g);
    expect(after.gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
  });

  it("voids when the stake leaves the realm without the enemy taking it", () => {
    // The bet cannot be settled once what was wagered is gone. A vassal that
    // wins its independence is the reachable shape - it walks out of the realm
    // at its own turn start and the enemy never touched it.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      g0, { kind: "duel", enemy, staked: third, decided: null, boss: false },
    );
    // `third` is nobody's vassal here, so it was never in beta's realm - the
    // same shape a stake that has already left produces.
    const after = nextRound(g);
    expect(after.gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
  });

  it("does not void a duel that has already been decided", () => {
    // What the board looks like afterwards does not get to relabel a fight the
    // ground already settled.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, incorporated: { [enemy]: third } },
      { kind: "duel", enemy, staked: null, decided: "won", boss: false },
    );
    const after = nextRound(g);
    expect(after.log.filter((e) => e.type === "duel-won")).toHaveLength(1);
  });
});

describe("the reward is what the land IS", () => {
  const view = (
    siteCaps: Record<string, number>, passives: Record<string, string[]>,
  ) => ({ siteCaps, passives });

  it("pays growth for a big land", () => {
    expect(rewardFor(view({ gamma: BIG_LAND_SITES }, {}), "gamma"))
      .toEqual({ kind: "growth", amount: LAND_GROWTH });
  });

  it("pays defense for ground that does its own defending", () => {
    expect(rewardFor(view({}, { gamma: ["hill-country"] }), "gamma"))
      .toEqual({ kind: "defense", amount: DUEL_DEFENSE_REWARD });
  });

  it("pays coin everywhere else", () => {
    expect(rewardFor(view({ gamma: BIG_LAND_SITES - 1 }, {}), "gamma"))
      .toEqual({ kind: "wealth", amount: DUEL_WEALTH_REWARD });
  });

  it("lets size win the one tie there is", () => {
    // A big land in hill country is worth growing into. The arms have to be
    // exclusive somewhere, and the rarer prize is the one worth keeping.
    expect(
      rewardFor(
        view({ gamma: BIG_LAND_SITES }, { gamma: ["hill-country"] }), "gamma",
      ).kind,
    ).toBe("growth");
  });
});

/** What beta's own settlements pay it at a turn start. The spoils land on top
 *  of the ordinary income, so the coin assertions below have to name it. */
const BETA_INCOME = 2;

describe("a won duel cashes its reward, and a lost one pays nothing", () => {
  /** The human takes the enemy's own land at the wrap that retires the duel.
   *  The arrow lands at seat 0's turn start, which IS the round wrap, so the
   *  line that decided the duel is still in the batch being written when the
   *  spoils are read off it - the case `duelWon`'s doc calls out. */
  function win(
    over: (enemy: string) => Partial<GameState> = () => ({}),
  ): { after: GameState; enemy: string } {
    const g0 = playing();
    const [enemy] = ruledRivals(g0);
    const g = withGauntlet(
      {
        // A quiet board: no statuses, so nothing raids or mends itself at the
        // wrap, and no arrow in flight but the one this fixture sends. What
        // is being measured is a single reward landing on a single land.
        ...g0, defense: { [enemy]: 0, beta: 10 }, marches: {}, passives: {},
        ...over(enemy),
      },
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), enemy, { sourceId: "beta" },
    );
    return {
      after: beginTurn({ ...declared, turn: declared.turn + 1 }, rng()),
      enemy,
    };
  }

  const spoils = (g: GameState) => g.log.filter((e) => e.type === "duel-won");

  it("pays the reward the OFFER named, not one read off the winner", () => {
    // The one property that matters: the picker quotes `rewardFor(enemy)` and
    // so does the cashing, so the two cannot promise different things.
    const { after, enemy } = win((e) => ({ siteCaps: { [e]: BIG_LAND_SITES } }));
    expect(rewardFor(after, enemy)).toEqual({ kind: "growth", amount: LAND_GROWTH });
    expect(after.defenseMax.beta).toBe(61);
    expect(spoils(after)).toHaveLength(1);
  });

  it("grows the winner's home on a big land", () => {
    const { after } = win((e) => ({ siteCaps: { [e]: BIG_LAND_SITES } }));
    // beta went in at 10 and paid 1 for the raid; the ceiling rose by one and
    // the score climbed with it.
    expect(after.defense.beta).toBe(10);
    expect(after.wealth.beta).toBe(BETA_INCOME);
    expect(after.defenseMax.beta).toBe(61);
    expect(spoils(after)[0]).toMatchObject({
      targetFactionId: "beta", amount: LAND_GROWTH,
    });
  });

  it("fortifies the winner's home on hill country", () => {
    const { after } = win((e) => ({ passives: { [e]: ["hill-country"] } }));
    expect(after.defense.beta).toBe(9 + DUEL_DEFENSE_REWARD);
    expect(after.defenseMax.beta).toBe(60);
    expect(spoils(after)[0]).toMatchObject({ amount: DUEL_DEFENSE_REWARD });
  });

  it("pays coin everywhere else, and moves no defense doing it", () => {
    const { after, enemy } = win();
    expect(after.wealth.beta).toBe(BETA_INCOME + DUEL_WEALTH_REWARD);
    expect(after.defense.beta).toBe(9);
    expect(spoils(after)[0]).toMatchObject({
      targetFactionId: "beta", sourceFactionId: enemy,
      wealth: DUEL_WEALTH_REWARD,
    });
    expect(spoils(after)[0].amount).toBeUndefined();
  });

  it("pays nothing when the duel settles nothing", () => {
    // The void arm: the enemy was annexed by somebody else, so no ground could
    // move between the two named lands and neither side takes anything.
    const g = withGauntlet(
      { ...playing(), incorporated: { gamma: "delta" } },
      { kind: "duel", enemy: "gamma", staked: null, decided: null, boss: false },
    );
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());
    expect(after.gauntlet)
      .toEqual({ kind: "world-tick", until: g.turn + 2 });
    expect(spoils(after)).toHaveLength(0);
    // Its own settlement income and not one coin more.
    expect(after.wealth.beta).toBe(BETA_INCOME);
  });

  it("pays nothing when the ENEMY is the one who took a land", () => {
    // The duel ends either way - a losing player is not trapped in the scope
    // beating them - but only taking a land off the enemy is winning it.
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
      { kind: "duel", enemy, staked: third, decided: null, boss: false },
    );
    const taken = beginTurn({ ...g, current: seatOf(g, enemy) }, rng());
    const after = beginTurn({ ...taken, current: 0, turn: taken.turn + 1 }, rng());
    expect(after.gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
    expect(spoils(after)).toHaveLength(0);
  });

  /** Every line a retiring duel writes about itself, whichever way it went. */
  const endings = (g: GameState) =>
    g.log.filter((e) => e.type.startsWith("duel-"));

  it("says so when the duel settles nothing, and names the enemy", () => {
    // The silence this exists to end: a duel that ended with no ground moved
    // produced no event, no line and no sound, and the only signal it was over
    // was the next offer appearing a turn later.
    const g = withGauntlet(
      { ...playing(), incorporated: { gamma: "delta" } },
      { kind: "duel", enemy: "gamma", staked: null, decided: null, boss: false },
    );
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());
    expect(endings(after).map((e) => e.type)).toEqual(["duel-void"]);
    expect(endings(after)[0]).toMatchObject({
      playerId: 1, targetFactionId: "beta", sourceFactionId: "gamma",
    });
  });

  it("says so when the ENEMY is the one who took a land", () => {
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
      { kind: "duel", enemy, staked: third, decided: null, boss: false },
    );
    const taken = beginTurn({ ...g, current: seatOf(g, enemy) }, rng());
    const after = beginTurn({ ...taken, current: 0, turn: taken.turn + 1 }, rng());
    // The staked land going the other way is not the same news as a fight that
    // settled nothing, and the player is owed the difference.
    expect(endings(after).map((e) => e.type)).toEqual(["duel-lost"]);
    expect(endings(after)[0]).toMatchObject({ sourceFactionId: enemy });
  });

  it("says it once when the duel is won", () => {
    const { after, enemy } = win();
    expect(endings(after).map((e) => e.type)).toEqual(["duel-won"]);
    expect(endings(after)[0]).toMatchObject({ sourceFactionId: enemy });
  });

  it("pays nothing for a land taken off a third party", () => {
    // Neither of the two named lands moved, so the duel is still running and
    // nothing is owed. Before the stake this ended the fight and paid nothing;
    // now it does not even end it, which is the stronger version of the rule.
    const g0 = playing();
    const [enemy, third] = ruledRivals(g0);
    const g = withGauntlet(
      { ...g0, defense: { [third]: 0, beta: 10 } },
      { kind: "duel", enemy, staked: null, decided: null, boss: false },
    );
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), third, { sourceId: "beta" },
    );
    const after = beginTurn({ ...declared, turn: declared.turn + 1 }, rng());
    expect(after.overlords.get(third)).toBe("beta");
    expect(after.gauntlet).toMatchObject({ kind: "duel", decided: null });
    expect(spoils(after)).toHaveLength(0);
  });
});

describe("a duel enemy fights, chief or no chief", () => {
  /** A land nobody leads, named off the board rather than hardcoded: which
   *  lands are dealt a chair is a seeded roll. */
  function chiefless(g: GameState): string {
    const id = SIX.find((f) => f !== "beta" && !hasRuler(g.rulers, f));
    expect(id).toBeDefined();
    return id as string;
  }

  const duelWith = (g: GameState, enemy: string): GameState =>
    withGauntlet(g, { kind: "duel", enemy, staked: null, decided: null, boss: false});

  it("sits the enemy down at the table with an empty chair", () => {
    const g = playing();
    const enemy = chiefless(g);
    // Outside a duel the same land takes no turn at all. This is the ONLY
    // bypass of the leaderless arm - the grey middle is still the grey
    // middle - and without it the map stands still for twenty rounds while
    // the player fights something that never answers.
    expect(takesNoTurn(g, enemy)).toBe(true);
    expect(takesNoTurn(duelWith(g, enemy), enemy)).toBe(false);
    expect(new Set(actedIn(duelWith(g, enemy)))).toEqual(
      new Set(["beta", enemy]),
    );
  });

  /** The human's arrow lands on the chiefless enemy at the wrap that retires
   *  the duel - the same shape the reward tests use. */
  function beat(g0: GameState, enemy: string, gauntlet: Gauntlet): GameState {
    const g = withGauntlet(
      { ...g0, defense: { [enemy]: 0, beta: 10 }, marches: {}, passives: {} },
      gauntlet,
    );
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), enemy, { sourceId: "beta" },
    );
    return beginTurn({ ...declared, turn: declared.turn + 1 }, rng());
  }

  it("absorbs a beaten one rather than swearing it", () => {
    const g0 = playing();
    const enemy = chiefless(g0);
    const after = beat(
      g0, enemy,
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    // A people who follow nobody are taken outright: annexed, not sworn, so
    // there is no independence gate for them to walk back out through.
    expect(after.incorporated[enemy]).toBe("beta");
    expect(after.overlords.has(enemy)).toBe(false);
    expect(hasRuler(after.rulers, enemy)).toBe(false);
    expect(
      after.log.some(
        (e) => e.type === "incorporated" && e.targetFactionId === enemy,
      ),
    ).toBe(true);
  });

  it("still pays the duel it won, off the line absorption writes", () => {
    // Absorption is the other allegiance door - an absorbed land says
    // `incorporated` rather than `subjugated` - and `duelDecidedBy` is asked
    // at the move rather than off the log, so both doors record the same win.
    const g0 = playing();
    const enemy = chiefless(g0);
    const after = beat(
      g0, enemy,
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    expect(after.gauntlet)
      .toEqual({ kind: "world-tick", until: g0.turn + 2 });
    expect(after.log.filter((e) => e.type === "duel-won")).toHaveLength(1);
    expect(after.log.filter((e) => e.type === "duel-void")).toHaveLength(0);
  });

  it("swears a chiefless land taken OUTSIDE a duel, which is the asymmetry", () => {
    // Stated so nobody reads it as an oversight. Every quiet land is
    // leaderless, so universal absorption would mean a conquest never wakes
    // anybody and the acting map would never grow.
    const g0 = playing();
    const enemy = chiefless(g0);
    const after = beat(g0, enemy, { kind: "world-tick", until: g0.turn + 1 });
    expect(after.overlords.get(enemy)).toBe("beta");
    expect(after.incorporated[enemy]).toBeUndefined();
    expect(hasRuler(after.rulers, enemy)).toBe(true);
  });

  it("swears a duel enemy that HAS a chief", () => {
    const g0 = playing();
    const [enemy] = ruledRivals(g0);
    const after = beat(
      g0, enemy,
      { kind: "duel", enemy, staked: null, decided: null, boss: false},
    );
    expect(after.overlords.get(enemy)).toBe("beta");
    expect(after.incorporated[enemy]).toBeUndefined();
  });
});

describe("the balance suite plays the loop", () => {
  it("answers the offer, so a sim game is scoped the way a run is", () => {
    // `runGame` never answered the pick, so every sim and scenario game ran
    // unscoped from end to end and the whole balance suite was measuring the
    // pre-gauntlet game. Read through the human-turn hook because a summary
    // says nothing about the cycle - and this is the real `runGame`, not a
    // copy of its loop.
    const seen = new Set<string>();
    runGame({
      seed: 3,
      humanFaction: SIM_FACTION_IDS[0],
      turnCap: 20,
      humanTurn: (s, r) => {
        seen.add(s.gauntlet.kind);
        return naiveHumanTurn(s, r);
      },
    });
    expect(seen).toContain("duel");
  });
});

describe("the run is three acts, and each closes with a boss", () => {
  /** A wrap onto seat 0 with nothing else moving. */
  const wrap = (g: GameState): GameState =>
    beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());

  /** Beta's realm widened to `size` lands by annexation, which is how the
   *  `realm=` boot param reaches the same states: a vassal would come apart
   *  under its own independence gate while the test watched. */
  function realmOf(g: GameState, size: number): GameState {
    const take = g.factionIds.filter((f) => f !== "beta").slice(0, size - 1);
    return {
      ...g,
      incorporated: Object.fromEntries(take.map((f) => [f, "beta"])),
    };
  }

  it("derives its boundaries from the bar, never from a literal", () => {
    // The 26-land Baltic map and the 24-land Iberian one, at the bars they
    // actually produce. Written out so a map change that moves the bar shows
    // up here rather than in a playtest.
    expect([1, 2, 3].map((a) => actExitSize(a, 13))).toEqual([5, 9, 13]);
    expect([1, 2, 3].map((a) => actExitSize(a, 12))).toEqual([4, 8, 12]);
    // The last act's exit is the bar EXACTLY, whatever the rounding would say.
    expect(actExitSize(ACTS, 7)).toBe(7);
    // And an early act's exit is never at or below the one land a run opens
    // on, which is what a small bar would otherwise produce.
    expect(actExitSize(1, 3)).toBe(2);
    expect(actExitSize(1, 2)).toBe(2);
  });

  it("opens on act 1 and summons nothing", () => {
    const g = playing();
    expect(g.act).toBe(1);
    expect(g.gauntlet.kind).toBe("picking");
  });

  it("summons the act's boss once the realm reaches its share of the bar", () => {
    // Two lands on the six-land fixture, whose bar is three.
    const g = wrap(realmOf(playing(), 2));
    expect(g.gauntlet.kind).toBe("rest");
    const boss = g.gauntlet.kind === "rest" ? g.gauntlet.boss : null;
    expect(boss).not.toBeNull();
    expect(boss).not.toBe("beta");
    // The prophecy is the whole of "unmissable": it names the boss and the act
    // it closes before a single arrow is sent.
    const foretold = g.log.filter((e) => e.type === "boss-foretold");
    expect(foretold).toHaveLength(1);
    expect(foretold[0]).toMatchObject({ targetFactionId: boss, amount: 1 });
  });

  it("does NOT advance the act on reaching the exit - only on beating it", () => {
    // These were one number first, and the run then skipped its own boss the
    // moment a duel won two lands at once.
    const g = wrap(realmOf(playing(), 2));
    expect(g.act).toBe(1);
  });

  it("holds the rest until the boon is answered", () => {
    const g = wrap(realmOf(playing(), 2));
    // The world keeps turning - the engine never blocks on a question - but
    // the cycle does not move past the rest on its own.
    const after = nextRound(g);
    expect(after.gauntlet.kind).toBe("rest");
  });

  it("turns the rest into a frozen one-candidate offer", () => {
    const g = wrap(realmOf(playing(), 2));
    if (g.gauntlet.kind !== "rest") throw new Error("expected a rest");
    const boss = g.gauntlet.boss;
    const after = pickBoon(g, "mend", rng());
    expect(after.gauntlet).toEqual({
      kind: "picking", candidates: [boss], boss: true,
    });
    // Frozen: a wrap re-reads an ordinary offer and must not re-read this one,
    // or the enemy the prophecy named would be swapped under the modal.
    expect(wrap(after).gauntlet).toEqual({
      kind: "picking", candidates: [boss], boss: true,
    });
  });

  it("has no way past a boss offer", () => {
    const g = pickBoon(wrap(realmOf(playing(), 2)), "mend", rng());
    // The act does not close until its boss is fought, so declining would be
    // declining the act - and the offer would come straight back.
    expect(declineDuel(g)).toBe(g);
  });

  it("carries the act forward when the boss is beaten, and not otherwise", () => {
    const g0 = pickBoon(wrap(realmOf(playing(), 2)), "mend", rng());
    if (g0.gauntlet.kind !== "picking") throw new Error("expected an offer");
    const boss = g0.gauntlet.candidates[0];
    const g = {
      ...g0,
      defense: { ...g0.defense, [boss]: 0 },
      gauntlet: {
        kind: "duel" as const, enemy: boss, staked: null, decided: null,
        boss: true,
      },
    };
    const declared = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), boss, { sourceId: "beta" },
    );
    const after = beginTurn({ ...declared, turn: declared.turn + 1 }, rng());
    expect(after.act).toBe(2);
    expect(after.log.filter((e) => e.type === "duel-won")).toHaveLength(1);
  });

  it("leaves the act where it stands when the boss duel is not won", () => {
    // A losing boss duel is a retry, not a rule invented for the failure: the
    // act holds and the boss is summoned again at the next wrap.
    const g = withGauntlet(
      { ...realmOf(playing(), 2), incorporated: { gamma: "delta" } },
      { kind: "duel", enemy: "gamma", staked: null, decided: null, boss: true },
    );
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());
    expect(after.act).toBe(1);
    expect(after.log.filter((e) => e.type === "duel-void")).toHaveLength(1);
  });

  it("never walks the act back when the realm shrinks", () => {
    // A high-water mark: an act is earned by beating the boss that closes the
    // one before it, and losing ground afterwards does not un-earn it.
    const g = beginTurn(
      { ...playing(), act: 2, current: 0, turn: 2 }, rng(),
    );
    expect(g.act).toBe(2);
  });
});

describe("the rest hands out one boon", () => {
  const wrap = (g: GameState): GameState =>
    beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());

  function resting(): GameState {
    const base = playing();
    const take = base.factionIds.filter((f) => f !== "beta").slice(0, 1);
    const g = wrap({
      ...base,
      incorporated: Object.fromEntries(take.map((f) => [f, "beta"])),
      // Both lands wounded, so a mend has something to move.
      defense: { beta: 1, [take[0]]: 1 },
    });
    if (g.gauntlet.kind !== "rest") throw new Error("expected a rest");
    return g;
  }

  it("offers the two board boons always, and the card one when the build has something", () => {
    const g = resting();
    const boons = g.gauntlet.kind === "rest" ? g.gauntlet.boons : [];
    expect(boons).toContain("mend");
    expect(boons).toContain("growth");
  });

  it("mends every land of the realm, and logs what actually moved", () => {
    const g = resting();
    const after = pickBoon(g, "mend", rng());
    for (const land of ["beta", ...Object.keys(g.incorporated)]) {
      expect(after.defense[land] ?? after.defenseMax[land])
        .toBe(after.defenseMax[land]);
    }
    // One `healed` per land that moved, which is what carries the numbers -
    // the boon itself moves no score of its own.
    const healed = after.log.filter((e) => e.type === "healed");
    expect(healed.length).toBeGreaterThan(0);
    for (const e of healed) expect(e.amount).toBeGreaterThan(0);
  });

  it("grows the home land's ceiling and the score with it", () => {
    const g = resting();
    const before = g.defenseMax.beta;
    const after = pickBoon(g, "growth", rng());
    expect(after.defenseMax.beta).toBe(before + BOON_GROWTH_AMOUNT);
  });

  it("refuses a boon the offer does not hold", () => {
    // The identity return `commitDecision` reads as refused.
    const g = resting();
    const boons = g.gauntlet.kind === "rest" ? g.gauntlet.boons : [];
    const missing = (["mend", "growth", "card"] as const)
      .find((b) => !boons.includes(b));
    if (missing !== undefined) expect(pickBoon(g, missing, rng())).toBe(g);
    // And nothing at all outside a rest.
    const notResting = playing();
    expect(pickBoon(notResting, "mend", rng())).toBe(notResting);
  });

  it("says what was taken, once", () => {
    const after = pickBoon(resting(), "mend", rng());
    expect(after.log.filter((e) => e.type === "boon-taken")).toHaveLength(1);
  });
});

describe("an act's champion is made ready to be beaten", () => {
  const wrap = (g: GameState): GameState =>
    beginTurn({ ...g, current: 0, turn: g.turn + 1 }, rng());

  /** A board sitting on `act`'s exit, with the summon about to fire.
   *
   *  The realm size is asked for rather than derived, because the six-land
   *  fixture's bar is three: act 1 exits at two lands and act 3 at three, so a
   *  helper that widened to one number would summon nothing for the later act
   *  and quietly measure an empty board. */
  function summoned(
    act = 1, lands = 2,
  ): { before: GameState; after: GameState } {
    const base = { ...playing(), act };
    const take = base.factionIds
      .filter((f) => f !== "beta")
      .slice(0, lands - 1);
    const before = {
      ...base,
      incorporated: Object.fromEntries(take.map((f) => [f, "beta"])),
    };
    return { before, after: wrap(before) };
  }

  const bossOf = (g: GameState): string =>
    g.gauntlet.kind === "rest" ? g.gauntlet.boss : "";

  it("names the status the land hover reads, so the player can see it", () => {
    // A status does not ship until the hover names it, and the hover walks
    // PASSIVES generically - so what this pins is that the row EXISTS with a
    // name and a line, which is what that walk needs.
    const { after } = summoned();
    const boss = bossOf(after);
    expect(boss).not.toBe("");
    expect(after.passives[boss]).toContain("regional-leader");
    expect(PASSIVES["regional-leader"].name.length).toBeGreaterThan(0);
    expect(PASSIVES["regional-leader"].text.length).toBeGreaterThan(0);
  });

  it("raises its ceiling by the act and heals it there", () => {
    const { before, after } = summoned();
    const boss = bossOf(after);
    expect(after.defenseMax[boss])
      .toBe(before.defenseMax[boss] + BOSS_CEILING_PER_ACT);
    // At its ceiling, so the number the prophecy sends the player to look at
    // is the number they have to get through.
    expect(after.defense[boss] ?? after.defenseMax[boss])
      .toBe(after.defenseMax[boss]);
  });

  it("scales with the act, so the third boss is a different problem", () => {
    const one = summoned(1, 2);
    const three = summoned(3, 3);
    const gainOne =
      one.after.defenseMax[bossOf(one.after)] -
      one.before.defenseMax[bossOf(one.after)];
    const gainThree =
      three.after.defenseMax[bossOf(three.after)] -
      three.before.defenseMax[bossOf(three.after)];
    expect(gainThree).toBeGreaterThan(gainOne);
  });

  it("gives a chiefed champion the ability AND the leadership behind it", () => {
    // `war-leader` adds the leader's LEADERSHIP to every raid. Granted alone,
    // to a chief seated at 0, it is a rule that does nothing - which is what
    // the first version shipped.
    const { after } = summoned();
    const boss = bossOf(after);
    if (!hasRuler(after.rulers, boss)) return;
    expect(after.rulers[boss].abilities).toContain("war-leader");
    expect(after.rulers[boss].leadership)
      .toBeGreaterThanOrEqual(BOSS_LEADERSHIP_PER_ACT);
  });

  it("shrugs off part of every blow, and stacks with the ground", () => {
    // The reductions COMPOSE: a champion raised on hill country takes both,
    // which the version naming `hill-country` by literal would have missed.
    const plain = damageAfterTerrain({ passives: {} }, "x", 8);
    const champion = damageAfterTerrain(
      { passives: { x: ["regional-leader"] } }, "x", 8,
    );
    const both = damageAfterTerrain(
      { passives: { x: ["regional-leader", "hill-country"] } }, "x", 8,
    );
    expect(champion).toBeLessThan(plain);
    expect(both).toBeLessThan(champion);
    // Never below 1, and never above what was coming.
    expect(damageAfterTerrain(
      { passives: { x: ["regional-leader", "hill-country"] } }, "x", 1,
    )).toBe(1);
  });

  it("puts more of its own raids in its deck", () => {
    const { before, after } = summoned();
    const boss = bossOf(after);
    const raidsIn = (g: GameState): number => {
      const seat = g.players.find((pl) => pl.factionId === boss);
      return (seat?.deck ?? []).filter((c) => c === "raid").length;
    };
    expect(raidsIn(after)).toBeGreaterThan(raidsIn(before));
  });

  it("keeps the same champion when a boss duel is not won", () => {
    // The retry is the SAME fight. Without this the next summon would raise a
    // second champion and leave the first carrying a boss's ceiling for the
    // rest of the run.
    const { after } = summoned();
    const boss = bossOf(after);
    const view = viewOf(after);
    expect(bossFor(view, "beta")).toBe(boss);
  });

  it("ends the elevation when the champion is taken", () => {
    // `strippedOnCapture`, so a land the player now holds does not carry a
    // boss's defenses into every fight after.
    const { after } = summoned();
    const boss = bossOf(after);
    expect(stripOnCapture(after.passives, boss)).not.toContain(
      "regional-leader",
    );
  });

  it("pays a bigger reward the deeper the act", () => {
    const view = { siteCaps: {}, passives: {} };
    const one = rewardFor(view, "gamma", 1);
    const three = rewardFor(view, "gamma", 3);
    expect(one.kind).toBe(three.kind);
    expect(three.amount).toBeGreaterThan(one.amount);
    // An act nobody named reads as the first one, so every older caller and
    // every test built before acts existed still means what it meant.
    expect(rewardFor(view, "gamma")).toEqual(one);
  });
});
