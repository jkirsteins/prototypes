import { describe, it, expect } from "vitest";
import {
  applyBootParams, BOOT_KNOWN_CARDS, parseBootParams, type BootParams,
} from "../src/boot-params";
import {
  newGame, isHumanTurn, OPENING_HAND, type GameState,
} from "../src/game";
import { CARDS, DECK_SIZE } from "../src/cards";
import { leadsOf } from "../src/relations";
import { seededRng } from "../src/rng";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A line, so "in reach" means something and the AI has real choices to make
 *  during a fast-forward. */
const LINE_ADJ: Record<string, string[]> = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};

const fresh = (): GameState => newGame(FACTIONS, LINE_ADJ);

const params = (search: string): BootParams => {
  const p = parseBootParams(search);
  if (p === null) throw new Error(`expected boot params from ${search}`);
  return p;
};

const boot = (search: string, seed = 1): GameState =>
  applyBootParams(fresh(), params(search), seededRng(seed));

describe("parseBootParams", () => {
  it("returns null when the URL names no boot param", () => {
    expect(parseBootParams("")).toBeNull();
    expect(parseBootParams("?")).toBeNull();
    // The property the whole design rests on: a player's ordinary URL, and any
    // unrelated param on it, must leave every boot line on its normal path.
    expect(parseBootParams("?utm_source=x&fbclid=y")).toBeNull();
  });

  it("recognises each param on its own", () => {
    expect(parseBootParams("?seed=7")).not.toBeNull();
    expect(parseBootParams("?deck=raid")).not.toBeNull();
    expect(parseBootParams("?faction=beta")).not.toBeNull();
    expect(parseBootParams("?hand=raid")).not.toBeNull();
    expect(parseBootParams("?rel=alpha:might=1")).not.toBeNull();
    expect(parseBootParams("?turns=3")).not.toBeNull();
    expect(parseBootParams("?popups=off")).not.toBeNull();
  });

  it("defaults everything the URL does not name", () => {
    expect(params("?seed=7")).toEqual({
      seed: 7, deck: null, faction: null, hand: null, rel: [], turns: 0,
      popups: null,
    });
  });

  it("splits and trims id lists", () => {
    expect(params("?deck=raid, subjugate ,fortify").deck)
      .toEqual(["raid", "subjugate", "fortify"]);
    expect(params("?deck=").deck).toEqual([]);
  });

  it("caps the hand so a long list cannot overrun the hand row", () => {
    const long = Array.from({ length: 40 }, () => "raid").join(",");
    expect(params(`?hand=${long}`).hand).toHaveLength(DECK_SIZE);
  });

  it("clamps turns to a sane range", () => {
    expect(params("?turns=-5").turns).toBe(0);
    expect(params("?turns=99999").turns).toBe(200);
    expect(params("?turns=banana").turns).toBe(0);
  });

  it("reads popups as the log pref, on or off", () => {
    expect(params("?popups=off").popups).toBe(false);
    expect(params("?popups=false").popups).toBe(false);
    expect(params("?popups=0").popups).toBe(false);
    expect(params("?popups=on").popups).toBe(true);
  });

  it("parses relation clauses, both tracks and both signs", () => {
    expect(params("?rel=alpha:might=3,status=-2;gamma:status=1").rel).toEqual([
      { factionId: "alpha", status: -2, might: 3 },
      { factionId: "gamma", status: 1, might: null },
    ]);
  });

  it("drops unparseable relation clauses rather than throwing", () => {
    // A boot param runs before the HUD exists, so there is nothing to report an
    // error on: anything nonsensical has to be silently ignored.
    expect(params("?rel=alpha").rel).toEqual([]);
    expect(params("?rel=:might=1").rel).toEqual([]);
    expect(params("?rel=alpha:vibes=9").rel).toEqual([]);
    expect(params("?rel=alpha:might=nope").rel).toEqual([]);
    expect(params("?rel=;;;").rel).toEqual([]);
  });
});

describe("BOOT_KNOWN_CARDS", () => {
  it("is every deck-buildable card, so ?deck= means the same thing anywhere", () => {
    const buildable = Object.values(CARDS).filter((c) => c.deckBuildable);
    expect(BOOT_KNOWN_CARDS).toHaveLength(buildable.length);
    expect(BOOT_KNOWN_CARDS).toContain("raid");
    // Revolt is reached by playing Seeds of revolt, never built.
    expect(BOOT_KNOWN_CARDS).not.toContain("revolt");
  });
});

describe("applyBootParams", () => {
  it("stops at the faction prompt when no faction is named", () => {
    const g = boot("?deck=raid,subjugate");
    expect(g.phase).toBe("pick-faction");
    expect(g.humanDeck).toHaveLength(DECK_SIZE);
    expect(g.humanDeck).toContain("raid");
  });

  it("takes the standard deck when ?deck= is absent", () => {
    // Not the ten-turnip filler `buildPlayerDeck([])` would give: a boot with no
    // opinion about the deck should deal a hand worth testing with.
    const g = boot("?faction=beta");
    expect(g.humanDeck).toHaveLength(DECK_SIZE);
    expect(new Set(g.humanDeck).size).toBeGreaterThan(1);
  });

  it("boots into a playable run on the human's turn", () => {
    const g = boot("?faction=beta&deck=raid,subjugate,fortify");
    expect(g.phase).toBe("playing");
    expect(g.players[0].factionId).toBe("beta");
    expect(g.current).toBe(0);
    expect(g.playedThisTurn).toBe(false);
    // pickFaction ends in beginTurn, which draws: the opening hand plus one.
    expect(g.players[0].hand).toHaveLength(OPENING_HAND + 1);
  });

  it("stops short - it does not half-build a run - on an unknown faction id", () => {
    const g = boot("?faction=atlantis");
    expect(g.phase).toBe("pick-faction");
    expect(g.players).toEqual([]);
  });

  it("still reaches a legal deck when ?deck= names cards that do not exist", () => {
    // chooseDeck no-ops on anything but exactly DECK_SIZE cards, so a typo here
    // used to be a page stuck on a hidden deck screen.
    const g = boot("?faction=beta&deck=raid,notacard,alsonot");
    expect(g.phase).toBe("playing");
    expect(g.humanDeck).toHaveLength(DECK_SIZE);
  });

  describe("?turns", () => {
    it("advances whole rounds and hands back on the human's turn", () => {
      const g = boot("?faction=beta&turns=3");
      expect(g.phase === "playing" || g.phase === "victory" ||
        g.phase === "defeat").toBe(true);
      if (g.phase !== "playing") return;
      expect(g.turn).toBe(4);
      // The invariant the whole hook depends on. afterHumanAction is the only
      // thing that ever runs an AI turn, and it only runs once the human
      // commits an action - so a state handed over mid-round, or with
      // playedThisTurn still set, disables every card forever.
      expect(isHumanTurn(g)).toBe(true);
      expect(g.playedThisTurn).toBe(false);
      expect(g.log.length).toBeGreaterThan(0);
    });

    it("leaves the run untouched at turns=0", () => {
      expect(boot("?faction=beta&turns=0").turn).toBe(1);
    });

    it("is deterministic under the same seed", () => {
      const a = boot("?seed=42&faction=beta&turns=5", 42);
      const b = boot("?seed=42&faction=beta&turns=5", 42);
      expect(a.log).toEqual(b.log);
      expect(a.players).toEqual(b.players);
      expect(a.relations).toEqual(b.relations);
    });
  });

  describe("?hand", () => {
    it("replaces the hand, and does so after the fast-forward", () => {
      // Staged after the rounds are played, or the policy plays the very cards
      // that were put there for the player to play.
      const g = boot("?faction=beta&turns=4&hand=alliance,raid");
      if (g.phase !== "playing") throw new Error("run ended during the boot");
      expect(g.players[0].hand).toEqual(["alliance", "raid"]);
    });

    it("ignores card ids that do not exist", () => {
      const g = boot("?faction=beta&hand=raid,notacard");
      expect(g.players[0].hand).toEqual(["raid"]);
    });

    it("leaves the dealt hand alone when every id is unknown", () => {
      const dealt = boot("?faction=beta").players[0].hand;
      expect(boot("?faction=beta&hand=nope,alsonope").players[0].hand)
        .toEqual(dealt);
    });
  });

  describe("?rel", () => {
    const lead = (g: GameState, other: string) =>
      leadsOf(g.relations, g.players[0].factionId, other);

    it("sets the human's signed lead on both tracks and both signs", () => {
      const g = boot("?faction=beta&rel=alpha:might=3,status=-2");
      expect(lead(g, "alpha")).toEqual({ might: 3, status: -2 });
    });

    it("reaches the asked-for lead over relations a fast-forward already moved", () => {
      // Counters only grow, so this has to bump whichever direction is short
      // rather than assign - and after four rounds both directions are dirty.
      const g = boot("?faction=beta&turns=4&rel=alpha:might=2,status=0");
      if (g.phase !== "playing") throw new Error("run ended during the boot");
      expect(lead(g, "alpha")).toEqual({ might: 2, status: 0 });
    });

    it("ignores a faction that is not on the map, and the human themselves", () => {
      const g = boot("?faction=beta&rel=atlantis:might=3;beta:might=9");
      expect(g.relations).toEqual({});
    });
  });
});
