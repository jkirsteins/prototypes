import { CARDS, isTributeCard, type Rng } from "./cards";
import { fullRealmOf, incorporatedRealmOf, realmOf } from "./relations";
import {
  defenseMaxOf, defenseOf, HILLFORT_HEAL, independenceGateOpen,
  INDEPENDENCE_GATE, PLAGUE_DAMAGE_PER_STACK, SUBJUGATION_GATE,
  WAR_COUNCIL_LEADERSHIP,
} from "./defense";
import {
  attackDamageFor, attackReach, borderPolygonsOf, holdsGuard,
  marchSourcesAgainst, plagueMultiplier, playableSet,
  validTargetsFor, type RulesView,
} from "./playability";
import { axesOf, freeArmiesOn } from "./marches";
import { discardCard, endTurn, playCard, viewOf, type GameState } from "./game";

export type AiAction =
  /** `sourceId` is Raid's tail - the land the army marches out of. Omitted by
   *  every other card, and by a Raid whose branch has no opinion, in which
   *  case `playCard` takes the first legal source in faction order. */
  | { type: "play"; cardIndex: number; targetId?: string; sourceId?: string }
  | { type: "discard"; cardIndex: number };

/** Which branch of `chooseAction` decides each card. Keyed on every id in
 *  CARDS, not only the deck-buildable ones: tribute is injection-only yet
 *  reaches hands and has a real branch, so keying on `deckBuildable` would
 *  leave the most forced card in the game unguarded.
 *
 *  A card with no branch here fails a test rather than passing review. That
 *  is deliberate: falling through to the first playable card is not AI
 *  support - see the card rule in AGENTS.md and the 27.7% fallthrough
 *  measurement that put it there. */
export const POLICY_COVERAGE: Record<string, string> = {
  "pay-military-tribute": "1: forced tribute",
  "subjugate": "2: subjugate any faction whose gate is open",
  "incorporate": "3: incorporate the best permanent gain net of freed vassals",
  "assassinate-ruler":
    "4: assassinate the highest leadership in reach, bodyguard risk unknown",
  "hillfort": "5: heal toward a gate - escape as a vassal, repair while free",
  "harvest-feast": "5: heal toward a gate, realm-wide arm",
  "fortify": "5: heal toward a gate - the weaker of the two single-land heals, taken when no Hillfort is in hand",
  "raid":
    "5A: counter a march that would break one of our lands, or that we out-" +
    "muscle; 6W: suppress a vassal nearing its gate or finish an opening; " +
    "11W: build toward the nearest gate. Source: the land the counter must " +
    "leave from, else the one whose own defenses best survive being counter-" +
    "raided back",
  "great-raid":
    "6W: fan damage when 2+ borders would reach their gates; 11W: pressure " +
    "when a stacked council faces 3+ border rivals",
  "create-army":
    "12: garrison the frontier land with the most rivals on it and no army " +
    "left to send - both builds, since it is a neutral",
  "favourable-omens": "6W: read the omens when the doubled attack opens a gate",
  "war-council": "11W: build leadership while no gate is within 2 attacks",
  "plague": "6P: cash stacks when a gate opens or the damage beats a raid",
  "foul-winds": "6P: claim the board's stacks while rivals hold more than us",
  "miasma": "6P: double the stacks when the doubled plague opens a gate",
  "localized-outbreak": "6P: seed the junction with the most non-own neighbours",
  "spread-disease":
    "6P: suppress a vassal nearing its gate; 11P: stack the polygon nearest " +
    "its gate",
  "bodyguard": "7: post the guard while own leadership is the board's highest",
  "found-settlement": "8: settle a spare turn (income)",
  "turnip-harvest": "9: cash the harvest whenever held (auto-picks by build)",
  "grow-crops": "10: grow turnips whenever held (feeds the harvest loop)",
};

/** The subjugation-gate line of a polygon, and how far above it the score
 *  sits. Positive gap = closed by that much. */
function gateGap(v: RulesView, polygon: string): number {
  return (
    defenseOf(v, polygon) -
    Math.floor(SUBJUGATION_GATE * defenseMaxOf(v, polygon))
  );
}

/** Outward gate-hunting candidates: polygons in reach that are rival faction
 *  HOMES with their gate still CLOSED - not the actor's own realm, not
 *  annexed lands (no gate to open), and not a gate already standing open.
 *  The last filter is load-bearing: an open gate's gap is negative, so
 *  without it the "finishing hit" condition matched every already-broken
 *  polygon forever, every raid read as decisive, and a 150-turn all-warpath
 *  world starved its turnip loop to 13 plays and zero subjugations. An open
 *  gate wants Subjugate, not more damage. Sorted nearest-gate-first, ties by
 *  faction order. */
function gateCandidates(
  state: GameState, v: RulesView, actor: string, targets: string[],
): string[] {
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  return targets
    .filter(
      (t) => !realm.has(t) && !(t in v.incorporated) && gateGap(v, t) > 0,
    )
    .sort(
      (a, b) =>
        gateGap(v, a) - gateGap(v, b) ||
        state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
    );
}

/** The actor's own vassal (any depth) within one Hillfort of its independence
 *  gate - the seat to suppress before any outward play. Both strategy
 *  branches put this first: a rival's play is worth less than keeping a
 *  vassal. */
function vassalNearingEscape(
  state: GameState, v: RulesView, actor: string,
): string | undefined {
  const own = incorporatedRealmOf(actor, v.incorporated);
  const members = [...fullRealmOf(actor, v.overlords, v.incorporated)]
    .filter((m) => !own.has(m) && !(m in v.incorporated));
  return members
    .filter(
      (m) =>
        defenseOf(v, m) + HILLFORT_HEAL >=
        Math.ceil(INDEPENDENCE_GATE * defenseMaxOf(v, m)),
    )
    .sort(
      (a, b) => state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
    )[0];
}

/** Damage already in the air at a polygon, net of what the polygon's own side
 *  has aimed back down the same axis. What `gateGap` arithmetic has to net out
 *  now that an attack is visible a turn before it lands: a heal that ignores
 *  an incoming march heals a land that is about to be broken anyway. */
function incomingAt(v: RulesView, polygon: string): number {
  let net = 0;
  for (const axis of axesOf(v.marches)) {
    if (axis.a !== polygon && axis.b !== polygon) continue;
    const [at, back] = axis.a === polygon
      ? [axis.fromB, axis.fromA]
      : [axis.fromA, axis.fromB];
    net += Math.max(
      0,
      at.reduce((s, m) => s + m.damage, 0) -
        back.reduce((s, m) => s + m.damage, 0),
    );
  }
  return net;
}

/** Which land to march a Raid out of, given where it is aimed.
 *
 *  The tail is now a real decision: whatever land the army leaves from is the
 *  land a counter-raid comes back at, so the pick is the source that best
 *  survives being answered. Highest defense first - a land near its own
 *  subjugation gate is the worst place to expose - ties by faction order so a
 *  seeded run marches out of the same land every time. */
function marchSourceFor(
  state: GameState, v: RulesView, actor: string, target: string,
): string | undefined {
  return [...marchSourcesAgainst(v, actor, target)].sort(
    (a, b) =>
      defenseOf(v, b) - defenseOf(v, a) ||
      state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
  )[0];
}

/** A raid play with its tail chosen. Every raid the policy returns goes
 *  through here, so no branch can forget the source and quietly fall back on
 *  `playCard`'s first-legal default. */
function raidAt(
  state: GameState, v: RulesView, actor: string,
  cardIndex: number, target: string,
): AiAction {
  const sourceId = marchSourceFor(state, v, actor, target);
  return {
    type: "play", cardIndex, targetId: target,
    ...(sourceId !== undefined ? { sourceId } : {}),
  };
}

/** Which land of the realm to settle: a land held outright is yours for
 *  good, while a vassal walks off with the settlement the moment it frees
 *  itself. Ties break on faction order, so the pick is deterministic. */
function settlementTarget(
  state: GameState,
  actorFactionId: string,
  targets: string[],
): string | undefined {
  const rank = (id: string): number => {
    if (id === actorFactionId) return 0;
    if (state.incorporated[id] === actorFactionId) return 1;
    return 2; // a vassal's land: settle it last
  };
  return [...targets].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
  )[0];
}

/** Deterministic policy v3 - the defense-score spine; see the 2026-08-08
 *  design doc, "AI: two known strategies". Calls `playableSet` with no
 *  `discards` option on purpose: the "discard" verdict it can then return
 *  means "nothing playable" under any rule set, and `aiTakeTurn`'s unlimited
 *  loop relies on exactly that verdict as its stop signal. */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(v, p.factionId, p.hand);
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);
  const order = (id: string): number => state.factionIds.indexOf(id);

  // 1: forced tribute. Forced cards leave no real choice; play the demand.
  const lord = state.overlords.get(p.factionId);
  if (lord !== undefined) {
    const tribute = set.cardIndexes.find((i) => isTributeCard(p.hand[i]));
    if (tribute !== undefined) return { type: "play", cardIndex: tribute };
  }

  // 2: subjugate any faction whose gate is open - the certain gain outranks
  // everything voluntary. Legality owns the gate, the respite and the liege
  // rule; the pick among several open gates is the biggest full realm, since
  // taking a lord takes its pyramid.
  const subjugate = idxOf("subjugate");
  if (subjugate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "subjugate");
    if (targets.length > 0) {
      const best = [...targets].sort(
        (a, b) =>
          fullRealmOf(b, state.overlords, state.incorporated).size -
            fullRealmOf(a, state.overlords, state.incorporated).size ||
          order(a) - order(b),
      )[0];
      return { type: "play", cardIndex: subjugate, targetId: best };
    }
  }

  // 3: incorporate the vassal whose digestion nets the most permanent land.
  // The scoring keeps the kept-lands-minus-freed-subtrees arithmetic and has
  // no odds discount - the roll no longer exists.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    let best: string | null = null;
    let bestScore = 0; // a digest that nets nothing is never picked
    for (const t of targets) {
      const vassalsOfT = state.factionIds.filter(
        (f) => state.overlords.get(f) === t,
      );
      const kept =
        realmOf(t, state.overlords, state.incorporated).length -
        vassalsOfT.length;
      const freed = vassalsOfT.reduce(
        (sum, f) =>
          sum + fullRealmOf(f, state.overlords, state.incorporated).size,
        0,
      );
      const score = kept - freed;
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (best !== null) {
      return { type: "play", cardIndex: incorporate, targetId: best };
    }
  }

  // 4: assassinate the rival with the highest leadership, when that
  // leadership makes them a threat in reach and no bodyguard risk is known.
  // Both strategies share this branch; it is the check on Warpath. A ruler
  // with a posted guard is skipped: trading the card for the guard leaves
  // the leadership standing.
  const assassinate = idxOf("assassinate-ruler");
  if (assassinate !== undefined) {
    const pick = validTargetsFor(v, p.factionId, "assassinate-ruler")
      .filter(
        (t) =>
          (v.leadership[t] ?? 0) >= WAR_COUNCIL_LEADERSHIP &&
          !holdsGuard(v, t, "bodyguard"),
      )
      .sort(
        (a, b) => (v.leadership[b] ?? 0) - (v.leadership[a] ?? 0) ||
          order(a) - order(b),
      )[0];
    if (pick !== undefined) {
      return { type: "play", cardIndex: assassinate, targetId: pick };
    }
  }

  // 5: heal toward a gate. While a vassal, heal the HOME polygon toward the
  // 75% independence line - escape outranks aggression, as Revolt used to.
  // While free and the realm's worst polygon sits under 50%, repair it.
  // The two single-land heals in strength order: spend the big one first while
  // a land is worth it. Fortify is the weaker, and the one every deck starts
  // holding five of.
  const hillfort = idxOf("hillfort");
  const fortify = idxOf("fortify");
  const feast = idxOf("harvest-feast");
  /** The strongest heal in hand that this land is a legal target for. */
  const healAt = (land: string): AiAction | null => {
    for (const [index, cardId] of [
      [hillfort, "hillfort"] as const, [fortify, "fortify"] as const,
    ]) {
      if (index === undefined) continue;
      if (validTargetsFor(v, p.factionId, cardId).includes(land)) {
        return { type: "play", cardIndex: index, targetId: land };
      }
    }
    return null;
  };
  const home = p.factionId;
  if (lord !== undefined && !independenceGateOpen(v, home)) {
    const heal = healAt(home);
    if (heal !== null) return heal;
    if (feast !== undefined && defenseOf(v, home) < defenseMaxOf(v, home)) {
      return { type: "play", cardIndex: feast };
    }
  }
  if (lord === undefined) {
    const realmPolys = [
      ...fullRealmOf(p.factionId, state.overlords, state.incorporated),
    ];
    // Braced: a land reads as damaged by what has already landed PLUS what is
    // in the air at it, netted against our own counter on the same axis. An
    // arrow is visible a turn ahead, so a heal that ignores it repairs a land
    // that is about to be knocked straight back down.
    const braced = (m: string): number =>
      Math.max(0, defenseOf(v, m) - incomingAt(v, m));
    const worst = realmPolys
      .filter((m) => braced(m) < 0.5 * defenseMaxOf(v, m))
      .sort(
        (a, b) =>
          braced(a) / defenseMaxOf(v, a) - braced(b) / defenseMaxOf(v, b) ||
          order(a) - order(b),
      )[0];
    if (worst !== undefined) {
      const heal = healAt(worst);
      if (heal !== null) return heal;
      if (feast !== undefined) return { type: "play", cardIndex: feast };
    }
  }

  // 5A: answer a march. An arrow is visible for exactly one turn, so this is
  // the most perishable move on the spine and sits directly under the heals it
  // competes with - a Hillfort on a land about to be broken is worth less than
  // the counter that stops it being broken.
  //
  // Both strategies, not just Warpath: every seat starts holding Raids
  // whatever build it picked, and a march is aimed at the land, not the plan.
  const counter = counterRaid(state, v, p.factionId, idxOf);
  if (counter !== null) return counter;

  // 6: the strategy branch's DECISIVE moves - the ones whose moment passes:
  // vassal suppression, a finishing hit, a fan that opens gates, a reserve
  // that unlocks one. The always-available build moves (raid the nearest
  // gate, war council, spread on the nearest gate) live BELOW the harvest
  // steps instead: measured with them up here, a warpath seat always had a
  // raid to prefer, never played a turnip, never earned the harvest that is
  // its only route to Subjugate - and a 150-turn all-warpath world ended
  // with zero subjugations.
  const branch =
    p.strategy === "warpath"
      ? warpathDecisive(state, v, p.factionId, idxOf)
      : pestilenceDecisive(state, v, p.factionId, idxOf);
  if (branch !== null) return branch;

  // 7: bodyguard while own leadership is the highest on the board - you are
  // now the assassination target step 4 hunts.
  const bodyguard = idxOf("bodyguard");
  if (bodyguard !== undefined) {
    const own = v.leadership[p.factionId] ?? 0;
    const highest =
      own > 0 &&
      state.factionIds.every(
        (f) => f === p.factionId || (v.leadership[f] ?? 0) < own,
      );
    if (highest) return { type: "play", cardIndex: bodyguard };
  }

  // 8: found a settlement on a spare turn - permanent income.
  const settle = idxOf("found-settlement");
  if (settle !== undefined) {
    const target = settlementTarget(
      state, p.factionId, validTargetsFor(v, p.factionId, "found-settlement"),
    );
    if (target !== undefined) {
      return { type: "play", cardIndex: settle, targetId: target };
    }
  }

  // 9: cash the harvest whenever held. Above turnips, or a hand holding both
  // would grow turnips forever and never spend the harvest they earned. The
  // pick itself needs no policy here: a choiceless playCard auto-resolves
  // through autoHarvestChoice, which ranks by the seat's build.
  const harvest = idxOf("turnip-harvest");
  if (harvest !== undefined) return { type: "play", cardIndex: harvest };

  // 10: grow turnips whenever held. Above the build moves, not below them:
  // the deck holds one turnip against five build cards, so this costs about
  // one turn in six and is the only thing that keeps the harvest loop - and
  // with it the whole card economy - turning.
  const grow = idxOf("grow-crops");
  if (grow !== undefined) return { type: "play", cardIndex: grow };

  // 11: the strategy branch's build moves - always-available progress toward
  // the next gate.
  const build =
    p.strategy === "warpath"
      ? warpathBuild(state, v, p.factionId, idxOf)
      : pestilenceBuild(state, v, p.factionId, idxOf);
  if (build !== null) return build;

  // 12: garrison a frontier land with no army left to send. Both strategies:
  // Create army is a neutral, so a pestilence seat can hold one too.
  const garrisoned = garrison(state, v, p.factionId, idxOf);
  if (garrisoned !== null) return garrisoned;

  // 13: first playable card as a last resort.
  const i0 = set.cardIndexes[0];
  const cardId = p.hand[i0];
  if (CARDS[cardId]?.targeted) {
    const legal = validTargetsFor(v, p.factionId, cardId);
    return { type: "play", cardIndex: i0, targetId: legal[0] };
  }
  return { type: "play", cardIndex: i0 };
}

/** Step 5A: raid back down an axis somebody is marching along.
 *
 *  A counter is a Raid like any other - the clash is recognised by the axis,
 *  not by a card - so the whole move is "aim a raid at the land the arrow came
 *  out of". Worth a turn on two conditions, either alone:
 *
 *  - the incoming would push one of our lands to or under its subjugation
 *    gate, which is the only damage that costs more than a card; or
 *  - our raid is at least as strong as theirs, so the clash cancels their
 *    attack outright and may throw the difference back.
 *
 *  Without the second condition a weak seat would trade its army for nothing;
 *  without the first, a seat about to be broken would sit and take it because
 *  the arithmetic said its counter was too small to win. */
function counterRaid(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const raid = idxOf("raid");
  if (raid === undefined) return null;
  const { damage } = attackDamageFor(v, actor, "raid");
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  const targets = new Set(validTargetsFor(v, actor, "raid"));

  const answerable = axesOf(v.marches)
    .flatMap((axis) => [
      { under: axis.a, from: axis.b, incoming: axis.fromB, ours: axis.fromA },
      { under: axis.b, from: axis.a, incoming: axis.fromA, ours: axis.fromB },
    ])
    .filter(
      (x) =>
        realm.has(x.under) && !realm.has(x.from) &&
        x.incoming.length > 0 && targets.has(x.from) &&
        // Only from the land actually under threat: a counter declared from
        // anywhere else is a fresh attack on a different axis and does not
        // meet this one at all.
        marchSourcesAgainst(v, actor, x.from).includes(x.under),
    )
    .map((x) => {
      const at = x.incoming.reduce((s, m) => s + m.damage, 0);
      const back = x.ours.reduce((s, m) => s + m.damage, 0);
      return { ...x, net: Math.max(0, at - back) };
    })
    .filter(
      (x) => x.net > 0 && (damage >= x.net || gateGap(v, x.under) <= x.net),
    );
  if (answerable.length === 0) return null;

  // The land in the most trouble first: nearest its gate after the hit it is
  // about to take, ties by faction order.
  const worst = answerable.sort(
    (a, b) =>
      gateGap(v, a.under) - a.net - (gateGap(v, b.under) - b.net) ||
      state.factionIds.indexOf(a.under) - state.factionIds.indexOf(b.under),
  )[0];
  return {
    type: "play", cardIndex: raid, targetId: worst.from, sourceId: worst.under,
  };
}

/** Step 6, Warpath: the decisive moves, every one condition-gated so a quiet
 *  board falls through to the harvest steps. */
function warpathDecisive(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const raid = idxOf("raid");
  const greatRaid = idxOf("great-raid");
  const omens = idxOf("favourable-omens");
  const raidTargets =
    raid === undefined ? [] : validTargetsFor(v, actor, "raid");

  // 6W-1: vassal suppression - raid the vassal one heal from its gate.
  const restive = vassalNearingEscape(state, v, actor);
  if (raid !== undefined && restive !== undefined && raidTargets.includes(restive)) {
    return raidAt(state, v, actor, raid, restive);
  }

  const { damage } = attackDamageFor(v, actor, "raid");
  const candidates = gateCandidates(state, v, actor, raidTargets);

  // 6W-2: the finishing hit - a polygon whose gate this one raid opens.
  // Netted against what is already in the air at that polygon: a march
  // already aimed there does part of the work, and one aimed the other way
  // will eat part of ours. Both are known a turn ahead now, so a "finisher"
  // that ignores them is the raid-status-rider bug again - a decisive branch
  // firing at a target it cannot actually finish.
  if (raid !== undefined) {
    const finish = candidates.find(
      (t) => gateGap(v, t) - incomingAt(v, t) <= damage,
    );
    if (finish !== undefined) return raidAt(state, v, actor, raid, finish);
  }

  // 6W-3: great raid when 2 or more bordering home polygons would be pushed
  // at or under their gates by its damage.
  if (greatRaid !== undefined) {
    const fan = attackDamageFor(v, actor, "great-raid").damage;
    const border = borderPolygonsOf(v, actor);
    const opened = [...border].filter(
      (t) => !(t in v.incorporated) && gateGap(v, t) > 0 &&
        gateGap(v, t) <= fan,
    );
    if (opened.length >= 2) return { type: "play", cardIndex: greatRaid };
  }

  // 6W-4: read the omens when the doubled attack would open a gate this
  // plain raid cannot, or one-shot a small polygon outright.
  if (omens !== undefined && (raid !== undefined || greatRaid !== undefined)) {
    const doubled = candidates.some(
      (t) =>
        (gateGap(v, t) > damage && gateGap(v, t) <= damage * 2) ||
        defenseOf(v, t) <= damage * 2,
    );
    if (doubled) return { type: "play", cardIndex: omens };
  }
  return null;
}

/** Step 11, Warpath: the always-available build moves, below the harvest
 *  steps so they cannot starve the turnip loop. */
function warpathBuild(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const raid = idxOf("raid");
  const greatRaid = idxOf("great-raid");
  const council = idxOf("war-council");
  const raidTargets =
    raid === undefined ? [] : validTargetsFor(v, actor, "raid");
  const { damage } = attackDamageFor(v, actor, "raid");
  const candidates = gateCandidates(state, v, actor, raidTargets);

  // 11W-1: war council while no target's gate is within 2 attacks - build
  // first, strike once the striking is worth it.
  if (council !== undefined) {
    const near = candidates.some((t) => gateGap(v, t) <= 2 * damage);
    if (!near) return { type: "play", cardIndex: council };
  }

  // 11W-2: raid the polygon nearest its subjugation gate.
  if (raid !== undefined && candidates.length > 0) {
    return raidAt(state, v, actor, raid, candidates[0]);
  }

  // 11W-3: great raid as pressure - 3 or more rivals border the realm and
  // leadership is stacked, so the fan is worth more than one aim.
  if (greatRaid !== undefined) {
    const border = borderPolygonsOf(v, actor);
    const rivals = new Set(
      [...border].map((t) => v.incorporated[t] ?? t),
    );
    if (
      rivals.size >= 3 &&
      (v.leadership[actor] ?? 0) >= 2 * WAR_COUNCIL_LEADERSHIP
    ) {
      return { type: "play", cardIndex: greatRaid };
    }
  }

  return null;
}

/** Step 12: garrison a frontier land that has nothing left to send.
 *
 *  Shared by both strategies rather than living in `warpathBuild`, because
 *  Create army is a NEUTRAL - a pestilence seat can harvest it too, and a card
 *  a seat can hold with no branch to decide it is exactly the fallthrough the
 *  POLICY_COVERAGE rule exists to stop.
 *
 *  Below the build moves, because an army raised is a turn that hit nothing.
 *  It only pays where the realm is actually attack-starved: a land on the
 *  frontier whose army is already out. The land facing the most rivals goes
 *  first, ties by faction order. */
function garrison(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const army = idxOf("create-army");
  if (army === undefined) return null;
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  const reach = attackReach(v, actor);
  const frontage = (land: string): number =>
    (v.adjacency[land] ?? []).filter((adj) => reach.has(adj)).length;
  const starved = state.factionIds
    .filter(
      (land) =>
        realm.has(land) &&
        freeArmiesOn(v.armies, v.marches, land) === 0 &&
        frontage(land) > 0,
    )
    .sort(
      (a, b) =>
        frontage(b) - frontage(a) ||
        state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
    )[0];
  return starved === undefined
    ? null
    : { type: "play", cardIndex: army, targetId: starved };
}

/** Step 6, Pestilence: the decisive moves - cashing a gate open outranks
 *  stacking further, and everything here is condition-gated. */
function pestilenceDecisive(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const spread = idxOf("spread-disease");
  const outbreak = idxOf("localized-outbreak");
  const miasma = idxOf("miasma");
  const plague = idxOf("plague");
  const winds = idxOf("foul-winds");
  const mult = plagueMultiplier(v, actor);
  const stacksOn = (polygon: string): number =>
    v.disease[polygon]?.[actor] ?? 0;
  const plagueDamageAt = (polygon: string, m: number): number =>
    stacksOn(polygon) * PLAGUE_DAMAGE_PER_STACK * m;
  const opensGate = (polygon: string, m: number): boolean =>
    !(polygon in v.incorporated) &&
    gateGap(v, polygon) > 0 &&
    gateGap(v, polygon) <= plagueDamageAt(polygon, m);

  // 6P-1: vassal suppression - plague the restive vassal's stacks, else
  // sicken it so the next plague can.
  const restive = vassalNearingEscape(state, v, actor);
  if (restive !== undefined) {
    if (plague !== undefined && stacksOn(restive) > 0) {
      return { type: "play", cardIndex: plague };
    }
    const spreadTargets =
      spread === undefined ? [] : validTargetsFor(v, actor, "spread-disease");
    if (spread !== undefined && spreadTargets.includes(restive)) {
      return { type: "play", cardIndex: spread, targetId: restive };
    }
  }

  // 6P-2: plague when it opens at least one gate, or when the total damage
  // beats a raid's worth - the cash-out test.
  if (plague !== undefined) {
    const total = state.factionIds.reduce(
      (sum, polygon) =>
        sum + Math.min(defenseOf(v, polygon), plagueDamageAt(polygon, mult)),
      0,
    );
    const opens = state.factionIds.some((polygon) => opensGate(polygon, mult));
    if (opens || total > attackDamageFor(v, actor, "raid").damage) {
      return { type: "play", cardIndex: plague };
    }
  }

  // 6P-3: foul winds when rivals' stacks exceed our own.
  if (winds !== undefined) {
    let own = 0;
    let theirs = 0;
    for (const owners of Object.values(v.disease)) {
      for (const [owner, n] of Object.entries(owners)) {
        if (owner === actor) own += n;
        else theirs += n;
      }
    }
    if (theirs > own) return { type: "play", cardIndex: winds };
  }

  // 6P-4: miasma when the doubled plague would push a gate open that the
  // plain one cannot.
  if (miasma !== undefined && plague !== undefined) {
    const unlocks = state.factionIds.some(
      (polygon) => !opensGate(polygon, mult) && opensGate(polygon, mult * 2),
    );
    if (unlocks) return { type: "play", cardIndex: miasma };
  }

  // 6P-5: localized outbreak on the junction whose non-own neighbour count
  // is highest, when that junction spreads further than a single stack.
  if (outbreak !== undefined) {
    const targets = validTargetsFor(v, actor, "localized-outbreak");
    const scored = targets
      .map((t) => ({
        t,
        n: (v.adjacency[t] ?? []).filter(
          (adj) =>
            !fullRealmOf(actor, v.overlords, v.incorporated).has(adj),
        ).length,
      }))
      .sort(
        (a, b) =>
          b.n - a.n ||
          state.factionIds.indexOf(a.t) - state.factionIds.indexOf(b.t),
      )[0];
    if (scored !== undefined && scored.n >= 2) {
      return { type: "play", cardIndex: outbreak, targetId: scored.t };
    }
  }
  return null;
}

/** Step 11, Pestilence: the always-available build move, below the harvest
 *  steps for the warpath reason. */
function pestilenceBuild(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const spread = idxOf("spread-disease");
  if (spread !== undefined) {
    const candidates = gateCandidates(
      state, v, actor, validTargetsFor(v, actor, "spread-disease"),
    );
    if (candidates.length > 0) {
      return { type: "play", cardIndex: spread, targetId: candidates[0] };
    }
  }
  return null;
}

/** Ceiling on plays per unlimited AI turn. The refill happens only at turn
 *  start, so the hand itself bounds the loop; the cap is belt-and-braces
 *  against a future card that adds cards to the hand mid-turn. */
const MAX_AI_PLAYS = 16;

/** One WHOLE turn for the current seat, in either mode - every caller wraps
 *  this in `advance`, so a partial turn here would stall the game. */
export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  if (state.rules.turn === "unlimited") {
    let g = state;
    for (let plays = 0; g.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
      const a = chooseAction(g);
      if (a.type === "discard") break;
      const next = playCard(g, a.cardIndex, rng, a.targetId, {
        ...(a.sourceId !== undefined ? { sourceId: a.sourceId } : {}),
      });
      if (next === g) break; // a refused play must not spin
      g = next;
    }
    return endTurn(g);
  }
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId, {
        ...(a.sourceId !== undefined ? { sourceId: a.sourceId } : {}),
      });
}
