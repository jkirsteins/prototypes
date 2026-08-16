import { describe, it, expect } from "vitest";
import { POLICY_COVERAGE, chooseAction, aiTakeTurn } from "../src/ai";
import {
  advance, chooseBuild, chooseRules, newGame, pickFaction, startGame, turnOpen,
  type GameState,
} from "../src/game";
import { CARDS, type Strategy } from "../src/cards";
import {
  HILLFORT_HEAL, INDEPENDENCE_GATE, PLAGUE_DAMAGE_PER_STACK,
  SUBJUGATION_GATE, WAR_COUNCIL_LEADERSHIP,
} from "../src/defense";
import { DEFAULT_RULES } from "../src/rules";
import { seededRng } from "../src/rng";

// Six factions on a complete graph (newGame's default adjacency): everything
// is in everything's reach, so the tests are about the POLICY, not distance.
// The human sits on zeta; the actor is alpha at index 1 throughout.
const FACTIONS = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

/** A roomy polygon, well above the shipped map's 2..18: the policy is
 *  scale-free and the heals are not, so at a shipped max of 6 every "does
 *  this heal reach the gate" branch would be a question about the cap
 *  instead. tests/playability.test.ts works at 600 for the same reason. */
const FIXTURE_MAX = 60;
const MAXES = Object.fromEntries(FACTIONS.map((id) => [id, FIXTURE_MAX]));

/** The two gate lines of a FIXTURE_MAX polygon, spelled once: it opens to
 *  Subjugate at 15 and crosses back to freedom at 45. */
const SUBJUGATE_LINE = Math.floor(SUBJUGATION_GATE * FIXTURE_MAX);
const INDEPENDENCE_LINE = Math.ceil(INDEPENDENCE_GATE * FIXTURE_MAX);

function base(): GameState {
  const g = pickFaction(
    chooseBuild(
      startGame(newGame(FACTIONS, undefined, {}, undefined, MAXES)),
      "warpath", seededRng(1),
    ),
    "zeta", seededRng(1),
  );
  // Every faction acts here. These tests are about the policy, not about who
  // is quiet, and a quiet rival would drop out of the candidate sets the
  // branches sort over without the test ever saying so.
  return { ...g, current: 1, passives: {} };
}

function withHand(g: GameState, hand: string[]): GameState {
  const p = { ...g.players[1], hand };
  return { ...g, players: g.players.map((pl, i) => (i === 1 ? p : pl)) };
}

/** pickFaction rolls each AI seat's build, seeded; a test about one branch
 *  stamps the branch it means to exercise. */
function asStrategy(g: GameState, strategy: Strategy): GameState {
  return {
    ...g,
    players: g.players.map((pl, i) => (i === 1 ? { ...pl, strategy } : pl)),
  };
}

function withLeadership(g: GameState, lead: Record<string, number>): GameState {
  const rulers = { ...g.rulers };
  for (const [f, n] of Object.entries(lead)) {
    rulers[f] = { ...rulers[f], leadership: n };
  }
  return { ...g, rulers };
}

describe("POLICY_COVERAGE", () => {
  it("names a policy branch for every card in the game", () => {
    expect(Object.keys(POLICY_COVERAGE).sort()).toEqual(Object.keys(CARDS).sort());
  });

  it("names a non-empty branch for each", () => {
    for (const [id, step] of Object.entries(POLICY_COVERAGE)) {
      expect(step, id).not.toBe("");
    }
  });
});

describe("the spine, steps 1..5", () => {
  it("1: plays the forced tribute before anything else", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["raid", "pay-military-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("2A: walks an army into a flattened land, above every voluntary play", () => {
    // An army arriving where nothing is left to fight TAKES the land, and it
    // is the only way a land changes hands now - so the walk-in outranks the
    // Subjugate branch it replaced, which is what a seat holding both shows.
    let g = base();
    g = { ...g, defense: { beta: SUBJUGATE_LINE } };
    g = withHand(g, ["raid", "subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("2A: takes a land its raid overwhelms without flattening it first", () => {
    // Two lands one point above the line, gamma holding delta. 2A ranks by the
    // pyramid a conquest wins and takes gamma; the gate-hunting branches rank
    // by nearest gate and would take beta on faction order. So the target
    // names the branch, which is what a shared action shape cannot.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["delta", "gamma"]]),
      // alpha at 2: a Raid out of it reaches 1 and a Strong raid 2, which is
      // what the two cards used to be flat constants for.
      defense: { alpha: 2, beta: SUBJUGATE_LINE + 1, gamma: SUBJUGATE_LINE + 1 },
    };
    // Strong raid deals 2 into 1 standing: both are conquests, so the bigger
    // realm wins the pick.
    expect(chooseAction(withHand(g, ["strong-raid"]))).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma", sourceId: "alpha",
      spend: expect.any(Number),
    });
    // Raid deals exactly what is standing - a flattening, not a conquest - so
    // 2A passes and the finisher takes the nearest gate instead.
    expect(chooseAction(withHand(g, ["raid"]))).toMatchObject({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("2: subjugates through an open gate when no army can walk in", () => {
    // The Subjugate machinery is withdrawn, not deleted: with no march card in
    // hand the branch is still what answers an open gate.
    let g = base();
    g = { ...g, defense: { beta: SUBJUGATE_LINE } };
    g = withHand(g, ["grow-crops", "subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("2: among several open gates, takes the biggest full realm", () => {
    // gamma holds delta, so taking gamma takes the pyramid: 2 lands beat
    // beta's 1 even though beta sorts first.
    let g = base();
    g = { ...g, overlords: new Map([["delta", "gamma"]]) };
    g = { ...g, defense: { beta: SUBJUGATE_LINE, gamma: SUBJUGATE_LINE } };
    g = withHand(g, ["subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("2: honours the respite - the Subjugate branch finds no target", () => {
    // beta is flattened but its escape respite runs, so the claim is refused
    // and the turn falls through to the harvest loop.
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: SUBJUGATE_LINE }, respites: { beta: 5 }, turn: 2 };
    g = withHand(g, ["subjugate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
    // An army is not refused: a respite is a rule about DECLARING fealty, and
    // an army walking into an empty land answers to nothing but the map.
    const armed = withHand(g, ["subjugate", "raid"]);
    expect(chooseAction(armed)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("3: incorporates the vassal that nets the most permanent land", () => {
    // beta is a plain vassal (net 1); gamma is a mid-lord whose digestion
    // frees delta (net 0). The realm counts 4 with both pyramids, so the
    // gate is open and the scoring is what decides.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"], ["gamma", "alpha"], ["delta", "gamma"]]),
    };
    g = withHand(g, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("3: refuses a digest whose freed subtree cancels the land kept", () => {
    // Only vassal gamma is a mid-lord holding delta: kept 1, freed 1, net 0 -
    // never picked, so the turn grows a turnip. The annexed epsilon only
    // holds the realm gate open.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["gamma", "alpha"], ["delta", "gamma"]]),
      incorporated: { epsilon: "alpha" },
    };
    g = withHand(g, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("4: assassinates the highest leadership in reach", () => {
    let g = withLeadership(base(), { beta: 100, gamma: 50 });
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("4: skips a guarded ruler - the trade would leave the leadership standing", () => {
    let g = withLeadership(base(), { beta: 100, gamma: 50 });
    g = { ...g, guards: { bodyguard: ["beta"] } };
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("4: holds the card below one council's worth of leadership", () => {
    // Nothing on this board carries No successor, so the only reason to spend
    // the card is a ruler worth killing - one War council's worth of hardening
    // is the bar, and an unproven board sits under it.
    const unproven = withHand(base(), ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(unproven)).toEqual({ type: "play", cardIndex: 0 });
    const proven = withHand(
      withLeadership(base(), { beta: WAR_COUNCIL_LEADERSHIP }),
      ["grow-crops", "assassinate-ruler"],
    );
    expect(chooseAction(proven)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("4: takes a No successor land outright, whatever its ruler is worth", () => {
    // Killing the ruler of a land with nobody to take up the crown takes the
    // land: a card that wins a land beats a card that removes a leadership
    // stack, so the unproven gamma outranks the hardened beta.
    let g = withLeadership(base(), { beta: 100 });
    g = { ...g, passives: { gamma: ["no-successor"] } };
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: a vassal heals its home toward the independence gate", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, defense: { alpha: INDEPENDENCE_LINE - HILLFORT_HEAL } };
    expect(chooseAction(withHand(g, ["hillfort", "grow-crops"]))).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
    expect(chooseAction(withHand(g, ["harvest-feast", "grow-crops"]))).toEqual({
      type: "play", cardIndex: 0,
    });
  });

  it("5: stops healing once the home stands at the gate - beginTurn frees it", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, defense: { alpha: INDEPENDENCE_LINE } }; // gate open
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5: while free, repairs a realm polygon under half strength", () => {
    let g = base();
    g = { ...g, defense: { alpha: 25 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("5: leaves a scratch above half strength for the harvest loop", () => {
    let g = base();
    g = { ...g, defense: { alpha: 35 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("5A: answering a march", () => {
  /** One march aimed at `at`, out of `from`, by whoever holds `from`. */
  const incoming = (from: string, at: string, damage: number, id = 1) => ({
    [String(id)]: {
      id, actor: from, from, to: at, cardId: "raid", damage,
      holdsArmy: true, expiry: 3,
    },
  });

  it("5A: counters a march it out-muscles, out of the land under threat", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, marches: incoming("beta", "alpha", 1), turn: 2 };
    g = withHand(g, ["raid", "grow-crops"]);
    // The counter aims BACK at the source, and must march out of the land the
    // arrow is pointed at - anywhere else is a fresh attack on another axis.
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("5A: counters a march it cannot win when the hit would open its gate", () => {
    let g = asStrategy(base(), "warpath");
    // alpha sits 2 above its gate and 6 damage is coming: our raid deals 1,
    // which loses the clash outright but keeps the gate shut.
    g = {
      ...g, defense: { alpha: SUBJUGATE_LINE + 6 },
      marches: incoming("beta", "alpha", 6), turn: 2,
    };
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("5A: lets a march it neither survives nor loses to go by", () => {
    let g = asStrategy(base(), "warpath");
    // 40 incoming against a pristine land 45 above its gate, whose Raid
    // reaches half of what it holds - 30, which loses the clash outright.
    // Trading the army buys nothing the turn cannot buy elsewhere.
    //
    // The numbers had to grow with the card. A raid that dealt 1 could fail
    // to out-muscle almost anything; one that reaches half its source can
    // only lose a clash it would also survive when the blow is bigger than
    // half the land and smaller than the land's whole gap.
    g = {
      ...g,
      marches: incoming("beta", "alpha", 40), turn: 2,
    };
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).not.toMatchObject({ targetId: "beta" });
  });

  it("5A: ignores a march already answered by a counter of our own", () => {
    let g = asStrategy(base(), "warpath");
    g = {
      ...g, turn: 2,
      marches: {
        ...incoming("beta", "alpha", 4),
        "2": {
          id: 2, actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
          damage: 4, holdsArmy: true, expiry: 3,
        },
      },
    };
    g = withHand(g, ["raid", "grow-crops"]);
    // The axis already nets to nothing, and alpha's army is out anyway.
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5A: heals against the braced score, not the standing one", () => {
    let g = asStrategy(base(), "warpath");
    // alpha stands at 35 - above half of 60, so untouched it is a scratch the
    // policy leaves alone - but 10 is in the air, which puts it under.
    g = {
      ...g, defense: { alpha: 35 },
      marches: incoming("beta", "alpha", 10), turn: 2,
    };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });
});

describe("8R: raising a ceiling", () => {
  it("grows the realm's biggest land, ties by faction order", () => {
    let g = asStrategy(base(), "warpath");
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      defenseMax: { ...g.defenseMax, beta: FIXTURE_MAX + 10 },
    };
    g = withHand(g, ["prosperous-proliferation"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("takes the ceiling above the settlement - it buys an army as well", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, wealth: { alpha: 1 } };
    g = withHand(g, ["found-settlement", "prosperous-proliferation"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "alpha",
    });
  });
});

describe("6W: warpath decisive moves", () => {
  it("6W-1: raids its own vassal one heal from the independence gate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    // One Hillfort short of its own independence line, which is what "restive"
    // means to `vassalNearingEscape`.
    g = { ...g, defense: { beta: INDEPENDENCE_LINE - HILLFORT_HEAL } };
    g = withHand(g, ["raid", "grow-crops"]);
    // Out of alpha, not out of the vassal itself: no land borders itself, so
    // holding a vassal down always takes an army from next door.
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("6W-2: finishes a gate one raid can open - above the council", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: SUBJUGATE_LINE + 1 } }; // gap 1 <= raid damage 1
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("6W-3: aims a great raid where its arrows flatten the land outright", () => {
    // One target, several arrows: the question is the finisher's question with
    // a bigger number. alpha is the realm's only land, so it musters one arrow
    // out of one purse, and beta is exactly that far from falling. alpha at 1
    // is what makes that purse a single point.
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { alpha: 1, beta: SUBJUGATE_LINE + 1 } };
    g = withHand(g, ["great-raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
    // A land the arrows cannot flatten is not worth the card: the turn feeds
    // the harvest loop instead.
    const standing = withHand(
      { ...g, defense: { alpha: 1, beta: SUBJUGATE_LINE + 2 } },
      ["great-raid", "grow-crops"],
    );
    expect(chooseAction(standing)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6W-4: reads the omens when only the doubled raid opens a gate", () => {
    let g = asStrategy(base(), "warpath");
    // alpha at 2, so its Raid reaches 1 and the doubled one reaches 2.
    g = { ...g, defense: { alpha: 2, beta: SUBJUGATE_LINE + 1.5 } }; // gap 1.5: >1, <=2
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6W-4: never delays a finishing raid to stack a reading", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: SUBJUGATE_LINE + 1 } };
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });
});

describe("the strong pair: same branch, better card", () => {
  it("sends the strong raid where a plain raid would go", () => {
    // `marchPick` is the one lookup every branch that marches asks, so the
    // preference is not a branch of its own: the finishing hit reaches for
    // whichever of the two is in hand, and the stronger one when both are.
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: SUBJUGATE_LINE + 1 } };
    g = withHand(g, ["raid", "strong-raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("spends the strong fortify first while a land is worth it", () => {
    // Step 5's heals in strength order. Hillfort is stronger still, so the
    // pair only decides between themselves.
    let g = base();
    g = { ...g, defense: { alpha: 25 } };
    expect(chooseAction(withHand(g, ["fortify", "strong-fortify"]))).toEqual({
      type: "play", cardIndex: 1, targetId: "alpha",
    });
    expect(chooseAction(withHand(g, ["fortify", "hillfort"]))).toEqual({
      type: "play", cardIndex: 1, targetId: "alpha",
    });
    // And the weak one alone still heals: it is what every deck starts with.
    expect(chooseAction(withHand(g, ["grow-crops", "fortify"]))).toEqual({
      type: "play", cardIndex: 1, targetId: "alpha",
    });
  });

  it("2: subjugates a quiet land like any other faction in reach", () => {
    // Subjugate sits in every deck now, and a land that takes no turns is a
    // faction in reach like the rest - the branch asks the gate, not the seat.
    let g = base();
    g = {
      ...g,
      passives: { gamma: ["keeps-to-itself", "wild-lands", "no-successor"] },
      defense: { gamma: SUBJUGATE_LINE },
    };
    g = withHand(g, ["subjugate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });
});

describe("6P: pestilence decisive moves", () => {
  it("6P-1: plagues its restive vassal's stacks before any outward play", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = {
      ...g,
      defense: { beta: INDEPENDENCE_LINE - HILLFORT_HEAL },
      disease: { beta: { alpha: 1 } },
    };
    g = withHand(g, ["plague", "spread-disease"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-1: sickens the restive vassal when no stacks sit there yet", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: INDEPENDENCE_LINE - HILLFORT_HEAL } };
    g = withHand(g, ["spread-disease", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("6P-2: cashes the plague when it opens a gate", () => {
    let g = asStrategy(base(), "pestilence");
    // One stack short of the gate line, and one stack held: the cash-out
    // opens it exactly.
    g = {
      ...g,
      defense: { beta: SUBJUGATE_LINE + PLAGUE_DAMAGE_PER_STACK },
      disease: { beta: { alpha: 1 } },
    };
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-2: cashes when the total damage beats a raid, else waits", () => {
    // "A raid's worth" moves with leadership, so the waits-arm needs a proven
    // ruler: at leadership 1 a raid is worth 2, and two stacks sit level with
    // it while three beat it. No gate is near, so this is the total arm alone.
    let g = asStrategy(base(), "pestilence");
    g = withLeadership(g, { alpha: 1 });
    // alpha at 2, so the raid it could send reaches 1 and its ruler adds the
    // second point. "A raid's worth" is the best one actually available now,
    // and a 60-point land could pay for far more than two.
    g = { ...g, defense: { alpha: 2 } };
    const fat = { ...g, disease: { beta: { alpha: 3 } } };
    expect(chooseAction(withHand(fat, ["plague", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 0 });
    const thin = { ...g, disease: { beta: { alpha: 2 } } };
    expect(chooseAction(withHand(thin, ["plague", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-2: a rival's stacks feed nothing - ownership is per faction", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, disease: { beta: { gamma: 5 } } };
    g = withHand(g, ["plague", "grow-crops"]);
    // No own stacks anywhere: the card is not even legal (no-disease).
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-2: a stack on a peer land does not feed the cash-out total", () => {
    // beta is alpha's sibling under gamma - a plague cannot strike it, so its
    // stack must not count toward "does the total beat a raid's worth" any
    // more than it counts toward the damage the card would actually deal.
    // delta alone (2 stacks, legal) keeps the card playable and stays under
    // the raid's worth of 2; beta's 1 stack summed in on top of it was
    // enough to tip the total past that line.
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["alpha", "gamma"], ["beta", "gamma"]]) };
    g = withLeadership(g, { alpha: 1 });
    g = { ...g, defense: { alpha: 2 } };
    g = { ...g, disease: { delta: { alpha: 2 }, beta: { alpha: 1 } } };
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-2: a gate only a peer's stack would open is not a cash-out", () => {
    // beta's gate sits exactly one stack from opening, but beta is alpha's
    // sibling under gamma and a plague cannot land there. delta's own stack
    // opens nothing and the total is nowhere near a raid's worth at full
    // defense, so the only way this fires is counting beta's gate anyway.
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["alpha", "gamma"], ["beta", "gamma"]]) };
    g = {
      ...g,
      defense: { beta: SUBJUGATE_LINE + PLAGUE_DAMAGE_PER_STACK },
      disease: { beta: { alpha: 1 }, delta: { alpha: 1 } },
    };
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-3: claims the board with foul winds while rivals hold more stacks", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, disease: { beta: { gamma: 2 }, gamma: { alpha: 1 } } };
    g = withHand(g, ["foul-winds", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    const ahead = { ...g, disease: { beta: { alpha: 2 }, gamma: { delta: 1 } } };
    expect(chooseAction(withHand(ahead, ["foul-winds", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-3: a rival's stack on a peer land does not feed the winds tally", () => {
    // beta holds a rival's 5 stacks, but beta is alpha's sibling under gamma
    // and foul winds cannot claim what it cannot reach. epsilon's 1 stack
    // keeps the card legal; alpha's own 2 stacks elsewhere outweigh it, so
    // the honest tally waits. Only counting beta's unreachable 5 flips it.
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["alpha", "gamma"], ["beta", "gamma"]]) };
    g = {
      ...g,
      disease: {
        beta: { delta: 5 },
        epsilon: { delta: 1 },
        zeta: { alpha: 2 },
      },
    };
    g = withHand(g, ["foul-winds", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-4: reads the miasma when only the doubled plague opens a gate", () => {
    // A gap of two stacks' worth: one stack cashed plain leaves the gate shut,
    // and doubled it opens. An unproven ruler keeps a raid's worth at 1, so
    // the total arm of 6P-2 does not cash the stack before this step.
    let g = asStrategy(base(), "pestilence");
    g = {
      ...g,
      defense: { beta: SUBJUGATE_LINE + 2 * PLAGUE_DAMAGE_PER_STACK },
      disease: { beta: { alpha: 1 } },
    };
    g = withHand(g, ["miasma", "plague"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    // And with the gate already inside one plain cash-out, 6P-2 takes it
    // instead - the miasma is a reserve, not a habit.
    const nearer = withHand(
      { ...g, defense: { beta: SUBJUGATE_LINE + PLAGUE_DAMAGE_PER_STACK } },
      ["miasma", "plague"],
    );
    expect(chooseAction(nearer)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-5: seeds the junction with the most non-own neighbours", () => {
    // A little map with a real junction: beta touches two third parties,
    // gamma only one, so the outbreak goes to beta.
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "delta", "epsilon"],
      gamma: ["alpha", "zeta"],
      delta: ["beta"],
      epsilon: ["beta"],
      zeta: ["gamma"],
    };
    let g = pickFaction(
      chooseBuild(startGame(newGame(FACTIONS, ADJ)), "warpath", seededRng(1)),
      "zeta", seededRng(1),
    );
    g = asStrategy({ ...g, current: 1 }, "pestilence");
    g = withHand(g, ["localized-outbreak", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
    // On a line, no target splashes 2+ non-own neighbours: hold the card.
    const LINE = {
      alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
      delta: ["gamma", "epsilon"], epsilon: ["delta", "zeta"],
      zeta: ["epsilon"],
    };
    let flat = pickFaction(
      chooseBuild(startGame(newGame(FACTIONS, LINE)), "warpath", seededRng(1)),
      "zeta", seededRng(1),
    );
    flat = asStrategy({ ...flat, current: 1 }, "pestilence");
    flat = withHand(flat, ["localized-outbreak", "grow-crops"]);
    expect(chooseAction(flat)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("steps 7..10: guard, settle, harvest, turnips", () => {
  it("7: posts the bodyguard while own leadership is the board's highest", () => {
    let g = withLeadership(base(), { alpha: 50 });
    g = withHand(g, ["bodyguard", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("7: a tie is not highest, and unproven is nothing to guard", () => {
    let tied = withLeadership(base(), { alpha: 50, gamma: 50 });
    tied = withHand(tied, ["bodyguard", "grow-crops"]);
    expect(chooseAction(tied)).toEqual({ type: "play", cardIndex: 1 });
    const unproven = withHand(base(), ["bodyguard", "grow-crops"]);
    expect(chooseAction(unproven)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("8: settles a spare turn, preferring its own land", () => {
    let g = base();
    g = { ...g, wealth: { alpha: 1 } };
    g = withHand(g, ["found-settlement", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("8: settles an annexed land before a vassal's, which can walk off", () => {
    let g = base();
    g = {
      ...g,
      wealth: { alpha: 1 },
      overlords: new Map([["beta", "alpha"]]),
      incorporated: { gamma: "alpha" },
      settlements: { alpha: 1 },
      siteCaps: Object.fromEntries(FACTIONS.map((f) => [f, 1])),
    };
    g = withHand(g, ["found-settlement", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("9: cashes a held harvest above growing turnips", () => {
    const g = withHand(base(), ["grow-crops", "turnip-harvest"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("10: grows turnips above the build raid - the loop must keep turning", () => {
    // A quiet board: no gate within one raid, nothing restive. The old
    // policy raided here every turn and starved the harvest loop to zero
    // subjugations over 150 turns; the turnip now outranks the build move.
    let g = asStrategy(base(), "warpath");
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("10: grows turnips above the build spread, same reason", () => {
    let g = asStrategy(base(), "pestilence");
    g = withHand(g, ["spread-disease", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("step 11: build moves", () => {
  it("11W-1: councils while no gate is within two attacks", () => {
    let g = asStrategy(base(), "warpath");
    // alpha at 2, so one attack is worth 1 and two are worth 2.
    g = { ...g, defense: { alpha: 2 } };
    g = withHand(g, ["war-council", "raid"]); // every gap is 45 > 2 attacks
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("11W-2: raids the polygon nearest its gate once one is within reach", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { gamma: SUBJUGATE_LINE + 1.5 } }; // gap 1.5 <= 2 attacks (2)
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("11W-2: the build raid never reaches a flattened land - 2A took it", () => {
    // `gateCandidates` drops a land whose gate is already open, and step 2A
    // above has already walked into it, so the build raid - when it fires at
    // all - is aimed at something still standing.
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { gamma: SUBJUGATE_LINE + 2 } };
    g = withHand(g, ["raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma", sourceId: "alpha",
      spend: expect.any(Number),
    });
  });

  it("11P: spreads disease on the polygon nearest its closed gate", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, defense: { beta: 40, gamma: 20 } };
    g = withHand(g, ["spread-disease"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });
});

describe("fallthrough and dead hands", () => {
  it("12: plays the first playable card with its first legal target", () => {
    // A damaged-but-healthy home: step 5 refuses (above half), the branches
    // hold nothing else, so the hillfort lands as the last resort.
    let g = base();
    g = { ...g, defense: { alpha: 50 } };
    g = withHand(g, ["hillfort"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("discards leftmost when nothing is playable", () => {
    const g = withHand(base(), ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({ type: "discard", cardIndex: 0 });
  });
});

describe("aiTakeTurn on a turn a card re-opened", () => {
  /** Two Raids and the armies to send them, under the standard one-card turn.
   *  The raid keyword repeats, so the first one leaves the turn open. */
  function twoArmyRaider(): GameState {
    const g = asStrategy(base(), "warpath");
    return { ...withHand(g, ["raid", "raid"]), armies: { alpha: 2 } };
  }

  it("keeps raiding while it has armies, under one-card-per-turn rules", () => {
    const before = twoArmyRaider();
    expect(before.rules.turn).toBe("standard");
    const after = aiTakeTurn(before, seededRng(1));
    expect(Object.values(after.marches).length).toBeGreaterThan(1);
    expect(after.players[1].hand).toEqual([]);
  });

  it("stops when the armies run out, not when the hand does", () => {
    // One army to send: the second Raid is legal by name and refused by the
    // rules, and the turn ends holding it.
    const before = { ...twoArmyRaider(), armies: { alpha: 1 } };
    const after = aiTakeTurn(before, seededRng(1));
    // The ACTOR's arrows: the round wrap lets the quiet lands take their own
    // restless swings, and those are not what this branch decides.
    expect(Object.values(after.marches).filter((m) => m.actor === "alpha"))
      .toHaveLength(1);
    expect(after.players[1].hand).toEqual(["raid"]);
    expect(after.playedThisTurn).toBe(true);
  });

  /** alpha holding beta as a vassal, both lands under the half-defense line
   *  step 5 heals at, and two Fortifies in hand. */
  function twoDamagedLands(): GameState {
    const g = asStrategy(base(), "warpath");
    return {
      ...withHand(g, ["fortify", "fortify"]),
      overlords: new Map([["beta", "alpha"]]),
      defense: { alpha: 10, beta: 10 },
    };
  }

  it("moves to the next damaged land when the worst one's settlement is out", () => {
    // The worst land stays the worst after it has been healed once, so a step
    // that only ever looked at `worst[0]` would keep re-aiming at a land that
    // can no longer answer and end the run on its second play.
    const g = twoDamagedLands();
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
    expect(chooseAction({ ...g, settlementsSpent: { alpha: 1 } })).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("keeps fortifying across the realm, under one-card-per-turn rules", () => {
    const after = aiTakeTurn(twoDamagedLands(), seededRng(1));
    expect(after.settlementsSpent).toEqual({ alpha: 1, beta: 1 });
    expect(after.players[1].hand).toEqual([]);
  });

  it("stops when the settlements run out, not when the hand does", () => {
    // One damaged land, two Fortifies: the second is legal by name and
    // refused by the board, and the turn ends holding it.
    const g = asStrategy(base(), "warpath");
    const before = {
      ...withHand(g, ["fortify", "fortify"]), defense: { alpha: 10 },
    };
    const after = aiTakeTurn(before, seededRng(1));
    expect(after.settlementsSpent).toEqual({ alpha: 1 });
    expect(after.players[1].hand).toEqual(["fortify"]);
    expect(after.playedThisTurn).toBe(true);
  });

  it("still spends one card on a turn nothing re-opened", () => {
    // Grow turnips declares nothing, so the turn closes behind it and the
    // second copy stays in hand - the ordinary standard turn, unchanged.
    const before = withHand(base(), ["grow-crops", "grow-crops"]);
    const after = aiTakeTurn(before, seededRng(1));
    expect(after.players[1].hand).toEqual(["grow-crops"]);
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatGroup).toBe(null);
  });
});

function unlimitedAiPlaying(): GameState {
  const g = chooseRules(startGame(newGame(FACTIONS)), {
    ...DEFAULT_RULES,
    turn: "unlimited",
  });
  return pickFaction(chooseBuild(g, "warpath", seededRng(1)), "zeta", seededRng(1));
}

describe("aiTakeTurn under unlimited rules", () => {
  it("plays multiple cards, then ends the turn without discarding", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0
          ? { ...pl, hand: ["grow-crops", "grow-crops", "pay-military-tribute"] }
          : pl,
      ),
    };
    const before = g.log.length;
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    const fresh = after.log.slice(before);
    expect(fresh.filter((e) => e.type === "play")).toHaveLength(2);
    expect(fresh.some((e) => e.type === "discard")).toBe(false);
  });

  it("a dead hand ends the turn with no discard and the hand intact", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: ["pay-military-tribute"] } : pl,
      ),
    };
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    expect(after.players[0].hand).toEqual(["pay-military-tribute"]);
  });
});

describe("no seat can hang the run", () => {
  // The freeze this guards against is the worst failure this app has: nothing
  // is persisted, so a player whose board stops has lost the run. The chain is
  // `chooseAction` proposes something the rules refuse -> `playCard` or
  // `discardCard` hands the state straight back -> `endTurn` refuses a standard
  // turn that played nothing -> `advance` will not move past an open turn.
  //
  // The instance that made this reachable was `greatRaidPick` scoring the bare
  // border, and it is fixed at the source. This pins the CLASS instead, through
  // the one pathological state still constructible: an empty hand. There is
  // nothing to play, so `playableSet` reports a discard of no cards,
  // `chooseAction` proposes index 0 and `discardCard` refuses on the index. A
  // seat with a REFUSED PLAY cannot be built any more - `cardBlockReason` keeps
  // a targeted card with no legal target out of the playable set, so step 12's
  // last resort cannot propose one - and that is the point of guarding on "the
  // turn could not be ended" rather than on "a play was refused".
  const emptyHanded = (): GameState => {
    const g = base();
    return {
      ...g,
      players: g.players.map((pl, i) =>
        i === 1 ? { ...pl, hand: [], deck: [], discard: [] } : pl,
      ),
    };
  };

  it("a seat that cannot end its turn gives it up rather than freezing", () => {
    const g = emptyHanded();
    expect(g.rules.turn).not.toBe("unlimited");
    const errors: unknown[][] = [];
    const real = console.error;
    console.error = (...args: unknown[]): void => void errors.push(args);
    let after: GameState;
    try {
      after = aiTakeTurn(g, seededRng(1));
    } finally {
      console.error = real;
    }
    // The turn is spent, so `advance` can move on: this is the whole of it.
    expect(after.playedThisTurn).toBe(true);
    expect(turnOpen(after)).toBe(false);
    expect(advance(after, seededRng(1)).current).not.toBe(g.current);
    // And it SHOUTED. A silent give-up turns the next picker bug into
    // mysteriously skipped turns nobody can diagnose.
    expect(errors).toHaveLength(1);
    expect(String(errors[0][0])).toContain("cannot end its turn");
    expect(String(errors[0][0])).toContain(g.players[1].factionId);
  });

  it("says nothing when a seat legitimately has nothing to do", () => {
    // A dead hand is not a hung seat: `chooseAction` returns a discard and
    // `discardCard` spends the turn. The guard must not fire here, or the
    // console fills with errors on an ordinary board.
    const g = withHand(base(), ["pay-military-tribute"]);
    const errors: unknown[][] = [];
    const real = console.error;
    console.error = (...args: unknown[]): void => void errors.push(args);
    let after: GameState;
    try {
      after = aiTakeTurn(g, seededRng(1));
    } finally {
      console.error = real;
    }
    expect(after.playedThisTurn).toBe(true);
    expect(errors).toHaveLength(0);
    // Ended by a real discard through the engine, not by the guard.
    expect(after.log.some((e) => e.type === "discard")).toBe(true);
  });
});
