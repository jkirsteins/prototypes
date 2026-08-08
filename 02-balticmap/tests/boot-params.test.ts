import { describe, it, expect } from "vitest";
import {
  applyBootMeta, applyBootParams, BOOT_KNOWN_CARDS, parseBootParams,
  type BootParams,
} from "../src/boot-params";
import {
  chooseDeck, newGame, isHumanTurn, OPENING_HAND, type GameState,
} from "../src/game";
import { buildPlayerDeck, pendingPacks } from "../src/meta";
import { CARDS, DECK_SIZE, STARTING_KNOWN_CARDS } from "../src/cards";
import { leadOf } from "../src/relations";
import { seededRng } from "../src/rng";
import { DEFAULT_RULES } from "../src/rules";

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
    expect(parseBootParams("?screen=deck")).not.toBeNull();
    expect(parseBootParams("?faction=beta")).not.toBeNull();
    expect(parseBootParams("?hand=raid")).not.toBeNull();
    expect(parseBootParams("?rel=alpha:might=1")).not.toBeNull();
    expect(parseBootParams("?turns=3")).not.toBeNull();
    expect(parseBootParams("?known=alliance")).not.toBeNull();
    expect(parseBootParams("?xp=25")).not.toBeNull();
    expect(parseBootParams("?popups=off")).not.toBeNull();
  });

  it("defaults everything the URL does not name", () => {
    expect(params("?seed=7")).toEqual({
      seed: 7, deck: null, screen: null, faction: null, hand: null, rel: [],
      turns: 0, known: null, xp: null, wealth: null, popups: null, rules: null,
    });
  });

  it("parses and clamps wealth", () => {
    expect(params("?wealth=3").wealth).toBe(3);
    expect(params("?wealth=-2").wealth).toBe(0);
    expect(params("?wealth=junk").wealth).toBeNull();
  });

  it("wealth= sets the human treasury as it stands after the fast-forward", () => {
    const g = boot("?faction=beta&turns=2&wealth=5");
    expect(g.wealth.beta).toBe(5);
    // absent, the treasury is whatever the run banked - never zeroed
    const banked = boot("?faction=beta&turns=2");
    expect(banked.wealth.beta).toBeGreaterThan(0);
  });

  it("splits and trims id lists", () => {
    expect(params("?deck=raid, subjugate ,fortify").deck)
      .toEqual(["raid", "subjugate", "fortify"]);
    expect(params("?deck=").deck).toEqual([]);
    expect(params("?known=alliance, bodyguard ").known)
      .toEqual(["alliance", "bodyguard"]);
    // An absence and an empty list are different answers: null means "every
    // card", [] means "only what everyone starts with".
    expect(params("?known=").known).toEqual([]);
    expect(params("?seed=1").known).toBeNull();
  });

  it("reads screen as the one stop it knows, and drops anything else", () => {
    expect(params("?screen=deck").screen).toBe("deck");
    // Dropped rather than thrown, like an unparseable rel clause: a typo lands
    // in the ordinary run, which beats a page that will not build.
    expect(params("?screen=deckk").screen).toBeNull();
    expect(params("?screen=").screen).toBeNull();
  });

  it("clamps xp, so a URL cannot spin levelForXp the way a bad record could", () => {
    expect(params("?xp=25").xp).toBe(25);
    expect(params("?xp=0").xp).toBe(0);
    expect(params("?xp=-5").xp).toBe(0);
    // The freeze src/meta.ts records: 1e30 sent levelForXp counting for ~2.8e14
    // iterations. Spelled in digits, not exponent notation - parseInt stops at
    // the "e", so "1e30" would clamp to 1 and prove nothing.
    expect(params(`?xp=${"9".repeat(30)}`).xp).toBeLessThanOrEqual(1e9);
    expect(params("?xp=nonsense").xp).toBeNull();
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

  it("parses relation clauses, both signs", () => {
    expect(params("?rel=alpha:might=3;gamma:might=-1").rel).toEqual([
      { factionId: "alpha", might: 3 },
      { factionId: "gamma", might: -1 },
    ]);
  });

  it("drops a pre-removal status= pair but keeps the clause's might", () => {
    // Old URLs named a second track; the unknown-track rule swallows it so
    // the page still boots.
    expect(params("?rel=alpha:might=3,status=-2;gamma:status=1").rel).toEqual([
      { factionId: "alpha", might: 3 },
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

  it("caps a duplicate deck pick by the copies rule", () => {
    // The rules are stamped before the deck, so the same URL grammar carries
    // both: one Raid by default, two under rules=copies:double.
    const single = boot("?deck=raid,raid,subjugate");
    expect(single.humanDeck.filter((id) => id === "raid")).toHaveLength(1);
    const double = boot("?deck=raid,raid,subjugate&rules=copies:double");
    expect(double.humanDeck.filter((id) => id === "raid")).toHaveLength(2);
    expect(double.humanDeck).toHaveLength(DECK_SIZE);
  });

  it("stops at the deck screen when ?screen=deck", () => {
    // The only stop that has to be asked for. chooseDeck runs whether or not
    // ?deck= was named and buildPlayerDeck always returns a legal deck, so
    // without this the phase could never be left at deck-building.
    const g = boot("?screen=deck&deck=raid,subjugate");
    expect(g.phase).toBe("deck-building");
    // newGame seeds a default humanDeck, so "chooseDeck was withheld" is that
    // the deck is still that default rather than the one ?deck= asked for.
    expect(g.humanDeck).toEqual(fresh().humanDeck);
  });

  it("lets the booted deck screen continue into a run", () => {
    // Withholding the click, not a dead end: the phase it stops in is the one
    // "Choose your lands" runs chooseDeck from.
    const g = chooseDeck(boot("?screen=deck"), buildPlayerDeck(
      BOOT_KNOWN_CARDS, ["raid", "subjugate"],
    ));
    expect(g.phase).toBe("pick-faction");
    expect(g.humanDeck).toHaveLength(DECK_SIZE);
  });

  it("ignores the params past the stop, rather than half-applying them", () => {
    const g = boot("?screen=deck&faction=beta&turns=3");
    expect(g.phase).toBe("deck-building");
    expect(g.players).toEqual([]);
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

    it("accepts injection-only ids - the browser route to a Turnip harvest", () => {
      // Same route hand=revolt uses: any id in CARDS boots, deck-buildable or
      // not, so a harvest check is one navigation.
      expect(boot("?faction=beta&hand=turnip-harvest").players[0].hand)
        .toEqual(["turnip-harvest"]);
    });
  });

  describe("?rel", () => {
    const lead = (g: GameState, other: string) =>
      leadOf(g.relations, g.players[0].factionId, other);

    it("sets the human's signed lead, both signs", () => {
      const g = boot("?faction=beta&rel=alpha:might=3");
      expect(lead(g, "alpha")).toBe(3);
      const behind = boot("?faction=beta&rel=alpha:might=-2");
      expect(lead(behind, "alpha")).toBe(-2);
    });

    it("reaches the asked-for lead over relations a fast-forward already moved", () => {
      // Counters only grow, so this has to bump whichever direction is short
      // rather than assign - and after four rounds both directions are dirty.
      const g = boot("?faction=beta&turns=4&rel=alpha:might=2");
      if (g.phase !== "playing") throw new Error("run ended during the boot");
      expect(lead(g, "alpha")).toBe(2);
    });

    it("ignores a faction that is not on the map, and the human themselves", () => {
      const g = boot("?faction=beta&rel=atlantis:might=3;beta:might=9");
      expect(g.relations).toEqual({});
    });
  });
});

describe("rules=", () => {
  it("parses axis:option pairs and drops unknown ones", () => {
    expect(parseBootParams("?rules=turn:unlimited")?.rules)
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
    expect(parseBootParams("?rules=turn:unlimited;bogus:x")?.rules)
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
    expect(parseBootParams("?rules=turn:unlimited;copies:double")?.rules)
      .toEqual({ turn: "unlimited", copies: "double" });
    expect(parseBootParams("?rules=turn:gone")?.rules).toEqual(DEFAULT_RULES);
    // Strict two-part clauses: a third segment makes the whole pair
    // malformed, so it drops and the axis falls back rather than parsing
    // "turn:unlimited:junk" as "turn:unlimited".
    expect(parseBootParams("?rules=turn:unlimited:junk")?.rules)
      .toEqual(DEFAULT_RULES);
  });

  it("is null when absent, so a bare URL is untouched", () => {
    expect(parseBootParams("?seed=1")?.rules).toBeNull();
    expect(parseBootParams("")).toBeNull();
  });

  it("stamps the picks into the booted state", () => {
    const params = parseBootParams("?rules=turn:unlimited&faction=beta&seed=1");
    const g = applyBootParams(
      newGame(["alpha", "beta", "gamma"]), params!, seededRng(1),
    );
    expect(g.rules.turn).toBe("unlimited");
    expect(g.phase).toBe("playing");
  });

  it("reaches a booted deck screen too", () => {
    const params = parseBootParams("?rules=turn:unlimited&screen=deck");
    const g = applyBootParams(
      newGame(["alpha", "beta", "gamma"]), params!, seededRng(1),
    );
    expect(g.phase).toBe("deck-building");
    expect(g.rules.turn).toBe("unlimited");
  });
});

describe("applyBootMeta", () => {
  const metaOf = (search: string) => applyBootMeta(params(search));

  it("knows every deck-buildable card when ?known= is absent", () => {
    expect(metaOf("?screen=deck").knownCards).toEqual(BOOT_KNOWN_CARDS);
  });

  it("adds ?known= to what every player starts with, rather than replacing it", () => {
    // The union loadMeta applies to a stored record. A booted collection has to
    // be one a real player could hold, or the deck screen is being asked to
    // render a state the game cannot produce.
    const known = metaOf("?known=alliance").knownCards;
    expect(known).toEqual(expect.arrayContaining(
      [...STARTING_KNOWN_CARDS, "alliance"],
    ));
    expect(known).not.toContain("incorporate");
  });

  it("gives the starting collection for an empty ?known=", () => {
    expect(new Set(metaOf("?known=").knownCards))
      .toEqual(new Set(["grow-crops", ...STARTING_KNOWN_CARDS]));
  });

  it("drops ids that are not deck-buildable", () => {
    const known = metaOf("?known=revolt,notacard,alliance").knownCards;
    expect(known).toContain("alliance");
    expect(known).not.toContain("revolt");
    expect(known).not.toContain("notacard");
    // Deduped: a starting card named again must not appear twice.
    expect(new Set(known).size).toBe(known.length);
  });

  it("owes packs through the xp derivation, not a granted count", () => {
    expect(pendingPacks(metaOf("?screen=deck"))).toBe(0);
    // xpThresholdForLevel(1) is 20, so one level is one pack.
    expect(pendingPacks(metaOf("?xp=20"))).toBe(1);
    expect(pendingPacks(metaOf("?xp=40"))).toBe(2);
  });
});
