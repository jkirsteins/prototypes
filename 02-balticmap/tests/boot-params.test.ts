import { describe, it, expect } from "vitest";
import {
  applyBootParams, parseBootParams, type BootParams,
} from "../src/boot-params";
import {
  newGame, isHumanTurn, OPENING_HAND, TURNIP_HARVEST_THRESHOLD,
  type GameState,
} from "../src/game";
import { defenseOf, RAID_DAMAGE } from "../src/defense";
import { rulerOf } from "../src/rulers";
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

/** A roomy polygon, well above the shipped map's 2..18: these cases are about
 *  a URL's number surviving the clamp, and at a max of 6 every interesting
 *  value would clamp to the same handful. */
const FIXTURE_MAX = 60;

const fresh = (): GameState =>
  newGame(
    FACTIONS, LINE_ADJ, {}, undefined,
    Object.fromEntries(FACTIONS.map((id) => [id, FIXTURE_MAX])),
  );

/** `fresh()`, but one faction's ceiling is shrunk so its army cap (`armyCapFor`)
 *  reads as something smaller than the roomy fixture default - needed wherever
 *  a test means to exhaust a land's free armies. */
const freshCapped = (factionId: string, defenseMax: number): GameState =>
  newGame(
    FACTIONS, LINE_ADJ, {}, undefined,
    Object.fromEntries(
      FACTIONS.map((id) => [id, id === factionId ? defenseMax : FIXTURE_MAX]),
    ),
  );

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

  it("no longer recognises the retired meta params as boot keys", () => {
    // deck=, known=, xp= and rel= died with the meta progression and the
    // Might bar. A pre-flip URL naming only them is an ordinary URL now.
    expect(parseBootParams("?deck=raid")).toBeNull();
    expect(parseBootParams("?known=raid")).toBeNull();
    expect(parseBootParams("?xp=25")).toBeNull();
    expect(parseBootParams("?rel=alpha:might=3")).toBeNull();
  });

  it("recognises each param on its own", () => {
    expect(parseBootParams("?seed=7")).not.toBeNull();
    expect(parseBootParams("?build=pestilence")).not.toBeNull();
    expect(parseBootParams("?screen=deck")).not.toBeNull();
    expect(parseBootParams("?faction=beta")).not.toBeNull();
    expect(parseBootParams("?hand=raid")).not.toBeNull();
    expect(parseBootParams("?turns=3")).not.toBeNull();
    expect(parseBootParams("?defense=alpha:100")).not.toBeNull();
    expect(parseBootParams("?disease=alpha:beta:2")).not.toBeNull();
    expect(parseBootParams("?leadership=alpha:100")).not.toBeNull();
    expect(parseBootParams("?turnips=3")).not.toBeNull();
    expect(parseBootParams("?wealth=2")).not.toBeNull();
    expect(parseBootParams("?popups=off")).not.toBeNull();
    expect(parseBootParams("?armies=alpha:3")).not.toBeNull();
    expect(parseBootParams("?march=alpha>beta")).not.toBeNull();
  });

  it("defaults everything the URL does not name", () => {
    expect(params("?seed=7")).toEqual({
      seed: 7, build: null, screen: null, faction: null, hand: null, turns: 0,
      defense: {}, disease: {}, leadership: {}, armies: {}, marches: [],
      turnips: null, wealth: null, popups: null, rules: null,
    });
  });

  it("reads build as one of the two builds, and drops anything else", () => {
    expect(params("?build=warpath").build).toBe("warpath");
    expect(params("?build=pestilence").build).toBe("pestilence");
    // Dropped rather than thrown, like every parser here: a typo lands in the
    // warpath default, which beats a page that will not build.
    expect(params("?build=turnip-maxxing").build).toBeNull();
    expect(params("?build=").build).toBeNull();
  });

  it("reads screen as the one stop it knows, and drops anything else", () => {
    expect(params("?screen=deck").screen).toBe("deck");
    expect(params("?screen=deckk").screen).toBeNull();
    expect(params("?screen=").screen).toBeNull();
  });

  it("splits and trims the hand list", () => {
    expect(params("?hand=raid, subjugate ,hillfort").hand)
      .toEqual(["raid", "subjugate", "hillfort"]);
    expect(params("?hand=").hand).toEqual([]);
  });

  it("caps the hand so a long list cannot overrun the hand row", () => {
    const long = Array.from({ length: 40 }, () => "raid").join(",");
    // HAND_LIMIT in src/boot-params.ts.
    expect(params(`?hand=${long}`).hand).toHaveLength(10);
  });

  it("clamps turns to a sane range", () => {
    expect(params("?turns=-5").turns).toBe(0);
    expect(params("?turns=99999").turns).toBe(200);
    expect(params("?turns=banana").turns).toBe(0);
  });

  it("parses and clamps wealth", () => {
    expect(params("?wealth=3").wealth).toBe(3);
    expect(params("?wealth=-2").wealth).toBe(0);
    expect(params("?wealth=junk").wealth).toBeNull();
  });

  it("clamps turnips UNDER the threshold, a state the game can actually hold", () => {
    // The crossing play resets the counter and injects, so a counter at or
    // past the threshold is a state no real game ever holds.
    expect(params("?turnips=1").turnips).toBe(1);
    expect(params("?turnips=9").turnips).toBe(TURNIP_HARVEST_THRESHOLD - 1);
    expect(params(`?turnips=${TURNIP_HARVEST_THRESHOLD}`).turnips)
      .toBe(TURNIP_HARVEST_THRESHOLD - 1);
    expect(params("?turnips=-2").turnips).toBe(0);
    expect(params("?turnips=junk").turnips).toBeNull();
  });

  it("parses defense clauses and drops the unparseable ones", () => {
    expect(params("?defense=alpha:100;beta:0").defense)
      .toEqual({ alpha: 100, beta: 0 });
    // A boot param runs before the HUD exists, so there is nothing to report
    // an error on: anything nonsensical has to be silently ignored.
    expect(params("?defense=alpha").defense).toEqual({});
    expect(params("?defense=:100").defense).toEqual({});
    expect(params("?defense=alpha:junk").defense).toEqual({});
    expect(params("?defense=;;;").defense).toEqual({});
    // Negative values clamp to 0 at parse time, the store's own floor.
    expect(params("?defense=alpha:-50").defense).toEqual({ alpha: 0 });
  });

  it("parses armies as polygon:count, on the defense clamp", () => {
    expect(params("?armies=alpha:3;beta:0").armies).toEqual({ alpha: 3, beta: 0 });
    expect(params("?armies=alpha:-2").armies).toEqual({ alpha: 0 });
    expect(params("?armies=alpha").armies).toEqual({});
  });

  it("parses marches as from>to, dropping a clause missing either end", () => {
    expect(params("?march=alpha>beta;gamma>delta").marches)
      .toEqual([{ from: "alpha", to: "beta" }, { from: "gamma", to: "delta" }]);
    expect(params("?march=alpha").marches).toEqual([]);
    expect(params("?march=>beta").marches).toEqual([]);
    expect(params("?march=alpha>").marches).toEqual([]);
  });

  it("parses disease as polygon:owner:count, dropping empty stacks", () => {
    expect(params("?disease=alpha:beta:2;gamma:delta:1").disease)
      .toEqual({ alpha: { beta: 2 }, gamma: { delta: 1 } });
    // Two owners on one polygon - stacks are owned, and the grammar carries it.
    expect(params("?disease=alpha:beta:2;alpha:gamma:1").disease)
      .toEqual({ alpha: { beta: 2, gamma: 1 } });
    // A zero or negative count is an absent owner, per the store convention.
    expect(params("?disease=alpha:beta:0").disease).toEqual({});
    expect(params("?disease=alpha:beta").disease).toEqual({});
    expect(params("?disease=alpha").disease).toEqual({});
  });

  it("parses leadership clauses", () => {
    expect(params("?leadership=alpha:100;beta:50").leadership)
      .toEqual({ alpha: 100, beta: 50 });
    expect(params("?leadership=alpha").leadership).toEqual({});
    expect(params("?leadership=alpha:junk").leadership).toEqual({});
  });

  it("reads popups as the log pref, on or off", () => {
    expect(params("?popups=off").popups).toBe(false);
    expect(params("?popups=false").popups).toBe(false);
    expect(params("?popups=0").popups).toBe(false);
    expect(params("?popups=on").popups).toBe(true);
  });

  it("a URL naming only join is not a boot param - the player's page stays untouched", () => {
    expect(parseBootParams("?join=abc123")).toBeNull();
  });
});

describe("applyBootParams", () => {
  it("stops at the faction prompt when no faction is named", () => {
    const g = boot("?build=pestilence");
    expect(g.phase).toBe("pick-faction");
    expect(g.humanStrategy).toBe("pestilence");
  });

  it("defaults the build to warpath", () => {
    expect(boot("?faction=beta").humanStrategy).toBe("warpath");
  });

  it("stops at the build screen when ?screen=deck", () => {
    // The only stop that has to be asked for. chooseBuild runs whether or not
    // ?build= was named, so without this the phase could never be left at
    // deck-building.
    const g = boot("?screen=deck&build=pestilence");
    expect(g.phase).toBe("deck-building");
    // Withheld, not applied early: the build is chosen by the click this URL
    // is withholding, so the state still carries the newGame default.
    expect(g.humanStrategy).toBe("warpath");
  });

  it("stations armies, and declares a march through the real rules", () => {
    // The line is alpha - beta - gamma - delta and the human sits on beta.
    const g = boot("?faction=beta&armies=beta:2&march=beta>alpha;beta>gamma");
    expect(g.armies.beta).toBe(2);
    expect(Object.values(g.marches).map((m) => [m.from, m.to]))
      .toEqual([["beta", "alpha"], ["beta", "gamma"]]);
    // Damage is not settable: a booted arrow promises what a played one would.
    expect(Object.values(g.marches)[0].damage).toBe(RAID_DAMAGE);
  });

  it("drops a march the rules would refuse, rather than conjuring one", () => {
    // beta does not border delta, and a URL that could draw an impossible
    // arrow would be checking a state the game cannot reach.
    expect(boot("?faction=beta&march=beta>delta").marches).toEqual({});
    // Nor can one land send more armies than it has: shrink beta's ceiling so
    // its army cap (armyCapFor) reads as one, then ask for two marches.
    const one = applyBootParams(
      freshCapped("beta", 3),
      params("?faction=beta&march=beta>alpha;beta>gamma"),
      seededRng(1),
    );
    expect(Object.keys(one.marches)).toHaveLength(1);
    // Nor can an unknown land send anything.
    expect(boot("?faction=beta&march=atlantis>alpha").marches).toEqual({});
  });

  it("ignores the params past the stop, rather than half-applying them", () => {
    const g = boot("?screen=deck&faction=beta&turns=3");
    expect(g.phase).toBe("deck-building");
    expect(g.players).toEqual([]);
  });

  it("boots into a playable run on the human's turn", () => {
    const g = boot("?faction=beta&build=pestilence");
    expect(g.phase).toBe("playing");
    expect(g.players[0].factionId).toBe("beta");
    expect(g.players[0].strategy).toBe("pestilence");
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
      expect(a.defense).toEqual(b.defense);
      expect(a.disease).toEqual(b.disease);
    });
  });

  describe("?hand", () => {
    it("replaces the hand, and does so after the fast-forward", () => {
      // Staged after the rounds are played, or the policy plays the very cards
      // that were put there for the player to play.
      const g = boot("?faction=beta&turns=4&hand=subjugate,raid");
      if (g.phase !== "playing") throw new Error("run ended during the boot");
      expect(g.players[0].hand).toEqual(["subjugate", "raid"]);
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
      // Any id in CARDS boots, deck-buildable or not, so a harvest check is
      // one navigation.
      expect(boot("?faction=beta&hand=turnip-harvest").players[0].hand)
        .toEqual(["turnip-harvest"]);
    });
  });

  describe("?wealth", () => {
    it("sets the human treasury as it stands after the fast-forward", () => {
      const g = boot("?faction=beta&turns=2&wealth=5");
      expect(g.wealth.beta).toBe(5);
      // absent, the treasury is whatever the run banked - never zeroed
      const banked = boot("?faction=beta&turns=2");
      expect(banked.wealth.beta).toBeGreaterThan(0);
    });
  });

  describe("?defense", () => {
    const dv = (g: GameState) => ({ defense: g.defense, defenseMax: g.defenseMax });

    it("writes the store, clamped into [0, max]", () => {
      const g = boot("?faction=beta&defense=alpha:20;gamma:0");
      expect(g.defense.alpha).toBe(20);
      expect(g.defense.gamma).toBe(0);
      expect(defenseOf(dv(g), "alpha")).toBe(20);
    });

    it("deletes the key at or above max - absent means pristine", () => {
      // The store's own convention: a key present at max would be a no-op
      // entry every walk and every badge has to special-case.
      const g = boot("?faction=beta&defense=alpha:999");
      expect("alpha" in g.defense).toBe(false);
      expect(defenseOf(dv(g), "alpha")).toBe(60);
    });

    it("deletes a key the fast-forward had damaged, not only fresh ones", () => {
      const ran = boot("?seed=5&faction=beta&turns=4", 5);
      const damaged = Object.keys(ran.defense)[0];
      // Four rounds of 5-Raid starting decks always draw blood somewhere; if
      // this ever fails, raise turns= rather than weakening the test.
      expect(damaged).toBeDefined();
      const g = boot(`?seed=5&faction=beta&turns=4&defense=${damaged}:999`, 5);
      expect(damaged in g.defense).toBe(false);
    });

    it("drops a polygon that is not on the map", () => {
      const g = boot("?faction=beta&defense=atlantis:100");
      expect(g.defense).toEqual({});
    });
  });

  describe("?disease", () => {
    it("writes owned stacks onto the store", () => {
      const g = boot("?faction=beta&disease=alpha:gamma:2;alpha:delta:1");
      expect(g.disease.alpha).toEqual({ gamma: 2, delta: 1 });
    });

    it("drops unknown polygons and unknown owners", () => {
      const g = boot("?faction=beta&disease=atlantis:alpha:2;alpha:atlantis:2");
      expect(g.disease).toEqual({});
    });
  });

  describe("?leadership", () => {
    it("sets the named ruler's leadership", () => {
      const g = boot("?faction=beta&leadership=beta:100;gamma:50");
      expect(rulerOf(g.rulers, "beta").leadership).toBe(100);
      expect(rulerOf(g.rulers, "gamma").leadership).toBe(50);
    });

    it("drops a faction that is not on the map", () => {
      const g = boot("?faction=beta&leadership=atlantis:100");
      for (const id of FACTIONS) {
        expect(rulerOf(g.rulers, id).leadership).toBe(0);
      }
    });
  });

  describe("?turnips", () => {
    it("sets the human's counter", () => {
      // Under the threshold, which is what the parse clamps to.
      const g = boot("?faction=beta&turnips=1");
      expect(g.turnips.beta).toBe(1);
    });
  });
});

describe("rules=", () => {
  it("parses axis:option pairs and drops unknown ones", () => {
    expect(parseBootParams("?rules=turn:unlimited")?.rules)
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
    expect(parseBootParams("?rules=turn:unlimited;bogus:x")?.rules)
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
    // The retired copies axis: a pre-flip URL still boots, the pair dropped.
    expect(parseBootParams("?rules=turn:unlimited;copies:double")?.rules)
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
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
    const g = boot("?rules=turn:unlimited&faction=beta&seed=1");
    expect(g.rules.turn).toBe("unlimited");
    expect(g.phase).toBe("playing");
  });

  it("reaches a booted build screen too", () => {
    const g = boot("?rules=turn:unlimited&screen=deck");
    expect(g.phase).toBe("deck-building");
    expect(g.rules.turn).toBe("unlimited");
  });
});
