import { describe, it, expect, afterEach } from "vitest";
import {
  hasRuler, initialRulers, replaceRuler, rulerNameFor, rulerOf, vacateRulers,
} from "../src/rulers";
import raw from "../src/data/baltic.json";
import pools from "../src/data/ruler-names.json";
import iberiaPools from "../src/data/ruler-names-iberia.json";
import genericNames from "../src/data/ruler-names-generic.json";
import type { MapData } from "../src/types";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, beginTurn, MAX_ACTIVE,
  type GameState,
} from "../src/game";
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
  // Six lands on a complete graph: MAX_ACTIVE caps the table at five, so
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
    expect(Object.keys(g.rulers)).toHaveLength(MAX_ACTIVE);
    expect(leaderless(g)).toHaveLength(SIX.length - MAX_ACTIVE);
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
    // The table is still MAX_ACTIVE wide: a reservation displaces a drawn
    // land rather than seating one more.
    expect(Object.keys(g.rulers)).toHaveLength(MAX_ACTIVE);
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
          damage: 6, holdsArmy: true, expiry: g.turn,
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
    // A run seats nobody new and vacates nobody: assassination replaces a
    // ruler, and a conquest wins the land rather than its people's allegiance.
    expect(Object.keys(state.rulers).sort()).toEqual(seatedAtDeal);
    for (const id of seatedAtDeal) {
      const ruler = rulerOf(state.rulers, id);
      expect(ruler.name.length, `ruler name for ${id}`).toBeGreaterThan(0);
      expect(ruler.since, `since for ${id}`).toBeLessThanOrEqual(state.turn);
    }
    for (const id of state.factionIds) {
      if (seatedAtDeal.includes(id)) continue;
      expect(() => rulerOf(state.rulers, id), id).toThrow(id);
    }
  });
});
