import { describe, it, expect, afterEach } from "vitest";
import {
  hasRuler, initialRulers, replaceRuler, rulerNameFor, rulerOf, seatRuler, vacateRulers,
} from "../src/rulers";
import { RAID_LEADERSHIP } from "../src/abilities";
import raw from "../src/data/baltic.json";
import pools from "../src/data/ruler-names.json";
import iberiaPools from "../src/data/ruler-names-iberia.json";
import genericNames from "../src/data/ruler-names-generic.json";
import type { MapData } from "../src/types";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, beginTurn, takesNoTurn,
  MIN_ACTING, type GameState,
} from "../src/game";
import {
  applyBootParams, parseBootParams, type BootParams,
} from "../src/boot-params";
import { playsTurns } from "../src/passives";
import { aiTakeTurn } from "../src/ai";
import { SIM_FACTION_IDS, SIM_ADJACENCY, seededRng } from "../src/sim";
import { DEFAULT_REGION, setActiveRegion } from "../src/regions";

const data = raw as MapData;
const POOLS = pools as Record<string, string[]>;
const IBERIA_POOLS = iberiaPools as Record<string, string[]>;
const GENERIC = genericNames as string[];

afterEach(() => setActiveRegion(DEFAULT_REGION));

describe("ruler name pools", () => {
  it("covers every ethnicity on the map", () => {
    for (const faction of data.factions) {
      expect(POOLS[faction.ethnicity], `pool for ${faction.ethnicity}`).toBeDefined();
    }
    expect(GENERIC.length).toBeGreaterThan(0);
  });

  it("has no duplicate names inside a pool", () => {
    for (const [ethnicity, names] of Object.entries(POOLS)) {
      expect(new Set(names).size, `pool for ${ethnicity}`).toBe(names.length);
    }
  });
});

describe("initialRulers", () => {
  const factionIds = data.factions.map((f) => f.id);
  const ethnicities = Object.fromEntries(
    data.factions.map((f) => [f.id, f.ethnicity]),
  );

  it("seats a ruler for every faction", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    for (const id of factionIds) {
      expect(rulerOf(rulers, id).name.length).toBeGreaterThan(0);
      expect(rulerOf(rulers, id).since).toBe(1);
    }
  });

  it("gives every faction a distinct name, across ethnicities too", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    const names = Object.values(rulers).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("draws from the faction's own ethnicity pool", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    expect(POOLS.livs).toContain(rulerOf(rulers, "lower-daugava-livs").name);
    expect(POOLS.estonians).toContain(rulerOf(rulers, "ugandians").name);
  });

  it("is deterministic - no rng, so the same world always seats the same rulers", () => {
    expect(initialRulers(factionIds, ethnicities)).toEqual(
      initialRulers(factionIds, ethnicities),
    );
  });

  it("falls back to the generic pool for a faction with no ethnicity", () => {
    const rulers = initialRulers(["alpha", "beta"]);
    expect(GENERIC).toContain(rulerOf(rulers, "alpha").name);
    expect(rulerOf(rulers, "alpha").name).not.toBe(rulerOf(rulers, "beta").name);
  });
});

describe("rulerOf", () => {
  it("throws rather than leaking undefined into the interface", () => {
    expect(() => rulerOf({}, "nobody")).toThrow(/nobody/);
  });
});

describe("replaceRuler", () => {
  const ethnicities = { alpha: "livs", beta: "livs" };

  it("seats a different ruler and reports both names", () => {
    const before = initialRulers(["alpha", "beta"], ethnicities);
    const out = replaceRuler(before, ethnicities, "alpha", 12);
    expect(out.killed).toBe(rulerOf(before, "alpha").name);
    expect(out.successor).not.toBe(out.killed);
    expect(rulerOf(out.rulers, "alpha").name).toBe(out.successor);
    expect(rulerOf(out.rulers, "alpha").since).toBe(12);
  });

  it("leaves every other faction untouched", () => {
    const before = initialRulers(["alpha", "beta"], ethnicities);
    const out = replaceRuler(before, ethnicities, "alpha", 12);
    expect(out.rulers.beta).toBe(before.beta);
  });

  it("never seats a name a living ruler already holds", () => {
    let rulers = initialRulers(["alpha", "beta"], ethnicities);
    for (let turn = 2; turn < 40; turn++) {
      rulers = replaceRuler(rulers, ethnicities, "alpha", turn).rulers;
      const names = Object.values(rulers).map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("seats every founding ruler unproven", () => {
    const rulers = initialRulers(["alpha", "beta"], ethnicities);
    expect(rulerOf(rulers, "alpha").leadership).toBe(0);
    expect(rulerOf(rulers, "beta").leadership).toBe(0);
  });

  it("seats the successor at leadership 0, never inheriting", () => {
    const before = initialRulers(["alpha", "beta"], ethnicities);
    const hardened = {
      ...before,
      alpha: { ...rulerOf(before, "alpha"), leadership: 150 },
    };
    const out = replaceRuler(hardened, ethnicities, "alpha", 12);
    // The WHOLE literal, so a future `...predecessor` spread in replaceRuler
    // fails here instead of quietly carrying a war-council stack across a
    // succession - the reset is what makes assassination worth a card.
    expect(rulerOf(out.rulers, "alpha")).toEqual({
      name: out.successor,
      since: 12,
      leadership: 0,
    });
  });

  it("takes a patronymic once the pool is spent", () => {
    // One faction per name in the pool leaves nothing free, so the successor
    // must be distinguished the way the chronicles do it.
    const pool = POOLS.livs;
    const ids = pool.map((_, i) => `f${i}`);
    const eth = Object.fromEntries(ids.map((id) => [id, "livs"]));
    const rulers = initialRulers(ids, eth);
    const out = replaceRuler(rulers, eth, "f0", 5);
    expect(out.successor).toMatch(/^.+, son of .+$/);
    const names = Object.values(out.rulers).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("rulerNameFor", () => {
  it("gives different factions of one ethnicity different names at setup", () => {
    const taken = new Set<string>();
    const a = rulerNameFor("alpha", "livs", 0, taken);
    taken.add(a);
    expect(rulerNameFor("beta", "livs", 0, taken)).not.toBe(a);
  });

  it("draws names from the ACTIVE region's pools", () => {
    setActiveRegion("iberia");
    const name = rulerNameFor("umayyads", "arabs", 0, new Set());
    expect(IBERIA_POOLS.arabs).toContain(name);
    const balticNames = new Set(Object.values(POOLS).flat());
    expect(balticNames.has(name)).toBe(false);
  });

  it("falls back to the generic pool for an unknown ethnicity", () => {
    const name = rulerNameFor("x", undefined, 0, new Set());
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("vacateRulers", () => {
  it("empties every seat except the ones named", () => {
    const rulers = initialRulers(["alpha", "beta", "gamma"]);
    const seated = vacateRulers(rulers, ["beta"]);
    expect(hasRuler(seated, "beta")).toBe(true);
    expect(hasRuler(seated, "alpha")).toBe(false);
    expect(hasRuler(seated, "gamma")).toBe(false);
    // The kept ruler is the same object: vacating is a filter, not a re-seat.
    expect(seated.beta).toBe(rulers.beta);
  });

  it("names a seat that never existed without inventing one", () => {
    expect(vacateRulers(initialRulers(["alpha"]), ["beta"])).toEqual({});
  });
});

describe("the leader gate", () => {
  // Six lands on a complete graph: `MIN_ACTING` is the floor under the quiet
  // draw, so the seeding may take exactly one land out of the table and
  // exactly one land ends up leaderless whatever the seed does.
  const SIX = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

  function dealt(): GameState {
    return pickFaction(
      chooseBuild(startGame(newGame(SIX)), "warpath", seededRng(1)),
      "alpha", seededRng(1),
    );
  }

  const leaderless = (g: GameState): string[] =>
    g.factionIds.filter((id) => !hasRuler(g.rulers, id));

  it("seats a leader on the acting factions alone", () => {
    const g = dealt();
    expect(Object.keys(g.rulers)).toHaveLength(MIN_ACTING);
    expect(leaderless(g)).toHaveLength(SIX.length - MIN_ACTING);
    // A land nobody leads is exactly a land that keeps to itself: one fact,
    // read two ways, never two conditions that could disagree.
    for (const id of leaderless(g)) {
      expect(playsTurns(g.passives, id), id).toBe(false);
    }
  });

  it("seats a leader on a reserved land - the multiplayer guest's pick", () => {
    // A guest picks its own land, and the deal must not then decide that land
    // takes no turns: the reservation is what makes the pick playable, and
    // without it a guest can sit through a whole game unable to act.
    const quiet = leaderless(dealt())[0];
    const g = pickFaction(
      chooseBuild(startGame(newGame(SIX)), "warpath", seededRng(1)),
      "alpha", seededRng(1), { reservedFactionIds: [quiet] },
    );
    expect(hasRuler(g.rulers, quiet)).toBe(true);
    expect(playsTurns(g.passives, quiet)).toBe(true);
    // The table is still the same width: a reservation is one of the lands
    // the quiet draw may not take, rather than a seat added beside it.
    expect(Object.keys(g.rulers)).toHaveLength(MIN_ACTING);
  });

  it("passes over a leaderless seat when the turn moves on", () => {
    let g = dealt();
    const quiet = new Set(leaderless(g));
    expect(quiet.size).toBeGreaterThan(0);
    for (let step = 0; step < SIX.length * 2; step++) {
      g = advance({ ...g, playedThisTurn: true }, seededRng(step + 1));
      expect(quiet.has(g.players[g.current].factionId)).toBe(false);
    }
  });

  it("resolves a leaderless faction's march at the round wrap", () => {
    // A march resolves in its actor's own beginTurn, and a leaderless actor
    // never gets one - so without the round-wrap sweep its arrow would stand
    // on the map for the rest of the game.
    const g = dealt();
    const quiet = leaderless(g)[0];
    const key = "1";
    const armed: GameState = {
      ...g,
      current: 0,
      defense: { alpha: 40 },
      defenseMax: Object.fromEntries(SIX.map((id) => [id, 60])),
      marches: {
        [key]: {
          id: 1, actor: quiet, from: quiet, to: "alpha", cardId: "raid",
          damage: 6, holdsArmy: true, declared: g.turn - 1, expiry: g.turn,
        },
      },
    };
    const after = beginTurn(armed, seededRng(4));
    expect(after.marches[key]).toBeUndefined();
    expect(after.defense.alpha).toBe(34);
    expect(after.log.some(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    )).toBe(true);
  });
});

describe("seatRuler", () => {
  const ethnicities = { selonians: "selonians", jersikans: "latgalians" };

  it("seats a ruler on a vacant chair at turn 0 leadership", () => {
    const seated = seatRuler({}, ethnicities, "selonians", 7, []);
    expect(hasRuler(seated, "selonians")).toBe(true);
    expect(rulerOf(seated, "selonians").since).toBe(7);
    expect(rulerOf(seated, "selonians").leadership).toBe(0);
    expect(rulerOf(seated, "selonians").abilities).toBeUndefined();
  });

  it("gives the new ruler the abilities it is handed", () => {
    const seated = seatRuler({}, ethnicities, "selonians", 3, [RAID_LEADERSHIP]);
    expect(rulerOf(seated, "selonians").abilities).toEqual([RAID_LEADERSHIP]);
  });

  it("does not take a name a living ruler already holds", () => {
    // The name seatRuler would pick for Selonians on an empty board - forced
    // into collision by seating a DIFFERENT faction under that exact name
    // first, so the assertion below fails if the `taken` set is ever dropped.
    const claimed = rulerNameFor("selonians", ethnicities.selonians, 1, new Set());
    const occupied = { jersikans: { name: claimed, since: 1, leadership: 0 } };
    const seated = seatRuler(occupied, ethnicities, "selonians", 1, []);
    expect(rulerOf(seated, "selonians").name).not.toBe(claimed);
  });

  it("leaves an occupied chair exactly as it found it", () => {
    const first = seatRuler({}, ethnicities, "selonians", 1, []);
    const again = seatRuler(first, ethnicities, "selonians", 9, [RAID_LEADERSHIP]);
    expect(again).toBe(first);
  });
});

describe("a conquest wakes the land", () => {
  const params = (search: string): BootParams => {
    const p = parseBootParams(search);
    if (p === null) throw new Error(`expected boot params from ${search}`);
    return p;
  };

  /** An attacker and a CHIEFLESS neighbour, both read out of a REAL deal on
   *  this seed rather than named here.
   *
   *  Two things would otherwise drift under it. `applyBootParams` silently
   *  drops a `march=` clause whose source does not border its target, so a
   *  hardcoded pair that stopped bordering would boot an ordinary game and
   *  leave the helper below spinning until it gave up on a conquest nobody
   *  declared. And only `QUIET_LANDS` lands are seeded without a chief now, so
   *  a neighbour picked off the adjacency alone is almost certainly led - and
   *  this whole block is about what happens when a LEADERLESS land is taken.
   *
   *  The probe deal names the same seed and the same faction as the real one,
   *  and the overrides land after the deal, so the land it finds chiefless is
   *  chiefless in the run under test too. */
  const dealtOn = (attacker: string): GameState =>
    applyBootParams(
      newGame(SIM_FACTION_IDS, SIM_ADJACENCY),
      params(`?seed=4&faction=${attacker}`), seededRng(4),
    );
  const pair = (): { attacker: string; victim: string } => {
    for (const attacker of SIM_FACTION_IDS) {
      const dealt = dealtOn(attacker);
      const victim = (SIM_ADJACENCY[attacker] ?? []).find(
        (id) => !hasRuler(dealt.rulers, id),
      );
      if (victim !== undefined) return { attacker, victim };
    }
    throw new Error("no land on seed 4 borders a chiefless neighbour");
  };
  const { attacker: ATTACKER, victim: VICTIM } = pair();
  const SEARCH =
    `?seed=4&faction=${ATTACKER}&defense=${VICTIM}:0&march=${ATTACKER}>${VICTIM}`;

  /** Plays until `VICTIM` has changed hands, and returns the state. The arrow
   *  is declared by the boot params through the real rules - `defense=...:0`
   *  makes it a land one army walks into - and lands at its actor's next turn.
   *  So what is under test is `takeLand` calling the new writer, rather than a
   *  fixture asserting itself.
   *
   *  `playedThisTurn` is forced because `advance` refuses an OPEN turn
   *  (`turnOpen`) and would otherwise hand the same seat straight back: this
   *  walk wants the seats to rotate, not the cards to be played. */
  const conquest = (): { booted: GameState; state: GameState } => {
    const booted = applyBootParams(
      newGame(SIM_FACTION_IDS, SIM_ADJACENCY), params(SEARCH), seededRng(4),
    );
    let g = booted;
    // Two whole rounds of a woken map and then some: the arrow lands at its
    // actor's NEXT turn, and a round is now most of the roster.
    for (let i = 0; i < 200 && g.overlords.get(VICTIM) === undefined; i++) {
      g = advance({ ...g, playedThisTurn: true }, seededRng(i + 1));
    }
    if (g.overlords.get(VICTIM) === undefined) {
      throw new Error(`${VICTIM} never fell`);
    }
    return { booted, state: g };
  };

  it("seats a ruler on a taken land, so it stops being skipped", () => {
    const { booted, state } = conquest();
    expect(hasRuler(booted.rulers, VICTIM)).toBe(false);
    expect(hasRuler(state.rulers, VICTIM)).toBe(true);
    expect(takesNoTurn(state, VICTIM)).toBe(false);
  });

  it("gives the woken people their own build's ability", () => {
    const { state } = conquest();
    const pl = state.players.find((p) => p.factionId === VICTIM);
    const expected = pl?.strategy === "warpath" ? [RAID_LEADERSHIP] : undefined;
    expect(rulerOf(state.rulers, VICTIM).abilities).toEqual(expected);
  });

  it("is warpath, because the quiet lands were never dealt pestilence", () => {
    // Which is why the pestilence arm of the seating is not reachable through
    // a conquest of a QUIET land: `pestilence` is dealt to the ACTING rivals
    // alone, and a land with no chief is by definition not one of them. The
    // arm itself is pinned by the `seatRuler` unit tests above.
    expect(conquest().state.players.find((p) => p.factionId === VICTIM)?.strategy)
      .toBe("warpath");
  });

  it("leaves every chair that was already occupied exactly as it found it", () => {
    const { booted, state } = conquest();
    // Object identity, not equality: a conquest is not a coup, and `seatRuler`
    // hands an occupied chair straight back. A `takeLand` that re-seated would
    // build a fresh literal here and reset the ruler's war-council stack.
    for (const [factionId, ruler] of Object.entries(booted.rulers)) {
      expect(state.rulers[factionId], factionId).toBe(ruler);
    }
    // And a pestilence build brings no ability, so no `abilities` key appears
    // out of nowhere on one of those seats.
    for (const pl of booted.players) {
      if (pl.strategy !== "pestilence") continue;
      if (!hasRuler(state.rulers, pl.factionId)) continue;
      expect(rulerOf(state.rulers, pl.factionId).abilities).toBeUndefined();
    }
  });
});

describe("ruler invariant over a full game", () => {
  // runGame (src/sim.ts) returns a GameSummary, not the state, so drive a
  // game by hand: deal a map and step turns with aiTakeTurn/advance directly.
  it("resolves every seated faction through rulerOf, with no since ahead of the current turn", () => {
    const TURN_CAP = 120;
    const rng = seededRng(1);
    let state: GameState = pickFaction(
      chooseBuild(
        startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY)),
        "warpath", seededRng(1),
      ),
      SIM_FACTION_IDS[0],
      rng,
    );
    const seatedAtDeal = Object.keys(state.rulers).sort();
    while (state.phase === "playing" && state.turn <= TURN_CAP) {
      const next = aiTakeTurn(state, rng);
      state = next.phase === "playing" ? advance(next, rng) : next;
    }
    // Sanity: the game actually progressed, so the invariant below is
    // exercised against successions, not just the untouched setup rulers.
    expect(state.turn).toBeGreaterThan(1);
    // A run vacates nobody, and the ONLY seats it fills are the lands that
    // changed hands: taking a land wakes its people up under their new lord.
    // Read off the log rather than off `overlords`, because a land that won
    // its independence back keeps the chief it was given.
    const woken = new Set(
      state.log
        .filter((e) => e.type === "subjugated")
        .map((e) => e.targetFactionId!),
    );
    expect(woken.size, "lands changed hands").toBeGreaterThan(0);
    for (const id of seatedAtDeal) expect(hasRuler(state.rulers, id), id).toBe(true);
    for (const id of Object.keys(state.rulers)) {
      if (seatedAtDeal.includes(id)) continue;
      expect(woken.has(id), `${id} was seated without being taken`).toBe(true);
    }
    // Every seat, dealt or woken, still answers the interface.
    for (const id of Object.keys(state.rulers)) {
      const ruler = rulerOf(state.rulers, id);
      expect(ruler.name.length, `ruler name for ${id}`).toBeGreaterThan(0);
      expect(ruler.since, `since for ${id}`).toBeLessThanOrEqual(state.turn);
    }
    // And a land nobody dealt a chief to and nobody took still has none.
    for (const id of state.factionIds) {
      if (seatedAtDeal.includes(id) || woken.has(id)) continue;
      expect(() => rulerOf(state.rulers, id), id).toThrow(id);
    }
  });
});
