import {
  armyCapOn, attackImpactOn, omensMultiplier,
  failureRiskOf, freeSettlementsIn, freeSitesIn,
  holdsGuard, miasmaHeld, omensHeld, outbreakPolygons, plagueDamageOn,
  plagueMultiplier, respiteExpiry, settlementsIn, subjugationGateOn,
  targetEligibilityFor,
  type CardBlockReason,
  type FailureRisk,
  type Guards,
  type Omens,
  type RulesView,
  type TargetBlockReason,
  type TargetEligibility,
} from "./playability";
import {
  capturesOnArrival, defenseMaxOf, defenseOf, INDEPENDENCE_GATE,
  SINGLE_LAND_HEAL,
} from "./defense";
import {
  ATTACK_CARDS, CARDS, isGuardCard, isInwardCard, isSingleLandHeal,
} from "./cards";
import {
  damageAfterTerrain, PASSIVES, passivesOn, type Passives,
} from "./passives";
import { passive } from "./segments";
import { count, plural } from "./plural";
import { spanLine, type TooltipLine, type TooltipSpan } from "./panel";
import { untilTurn } from "./timed";

/** How much a reserve stack multiplies by, in words. One table, two
 *  grammatical forms: the adjective for a promise ("counts double") and the
 *  participle for a resolution ("- doubled"). English runs out at two
 *  readings, so a three-deep stack falls back to the plain multiple. */
const MULTIPLE_WORDS: Readonly<Record<number, readonly [string, string]>> = {
  2: ["double", "doubled"],
  4: ["quadruple", "quadrupled"],
};

/** "double", "quadruple", "x8" - what the card counts as. */
export const multipleWord = (multiplier: number): string =>
  MULTIPLE_WORDS[multiplier]?.[0] ?? `x${multiplier}`;

/** "doubled", "quadrupled", "x8" - what happened to the numbers. */
export const multipliedWord = (multiplier: number): string =>
  MULTIPLE_WORDS[multiplier]?.[1] ?? `x${multiplier}`;

export interface TargetExplanation {
  factionId: string;
  lines: string[];
  /** How this target could come back with nothing, for the amber band. Kept
   *  apart from `lines` because the two are not the same kind of statement:
   *  `lines` say what the card would do, and this says it might do none of
   *  it. Empty for a target that cannot fail. */
  risk: string[];
  available: boolean;
}

function explainReason(reason: TargetBlockReason): string[] {
  switch (reason.code) {
    case "gate-closed":
      // Both numbers, because together they are the decision: how much more
      // damage before the gate opens.
      return [
        `Their home defenses stand at ${reason.defense}; subjugation opens ` +
          `at ${reason.required} or less.`,
      ];
    case "respite":
      return [
        `Escaped vassalage recently; cannot be subjugated ${untilTurn(reason.expiresTurn)}.`,
      ];
    case "at-full-defense":
      return ["Defenses already stand at full strength."];
    case "already-vassal":
      return ["Already your vassal."];
    case "no-ruler":
      return ["Nobody leads this land."];
    case "liege":
      return ["You owe them fealty, directly or through your lords."];
    case "incorporated":
      return ["Already incorporated."];
    case "self":
      return ["You cannot target yourself."];
    case "not-your-vassal":
      return ["Not your vassal."];
    case "needs-population":
      return [
        `${count(reason.have, "settlement")} here already, and your people ` +
          `support ${reason.allowance}.`,
      ];
    case "no-free-site":
      return ["No room for another settlement."];
    case "no-army":
      return [
        "No free army borders this land. Your armies here are already out " +
          "on a march; one comes home when it lands.",
      ];
    case "no-settlement":
      return [
        "Every settlement on this land has already been called on this " +
          "turn. They answer again next turn.",
      ];
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
  /** How each available target can come back with nothing - `targetOddsLines`,
   *  at every call site that has a view to ask with. Required rather than
   *  defaulted: a missing risk tells the player a fallible play is certain. */
  risk: (factionId: string) => string[],
  /** Extra lines appended to available targets, e.g. what a Raid there deals.
   *  Blocked targets get none: the block reason is the useful answer. */
  annotate: (factionId: string) => string[] = () => [],
): TargetExplanation[] {
  return entries.flatMap((entry): TargetExplanation[] => {
    if (entry.state === "irrelevant") return [];
    if (entry.state === "available") {
      return [{
        factionId: entry.factionId,
        lines: [factionName(entry.factionId), "Available.", ...annotate(entry.factionId)],
        risk: risk(entry.factionId),
        available: true,
      }];
    }
    // A blocked target gets no risk band. The rules already refuse this aim,
    // so the odds of a play that cannot happen are noise on top of the answer.
    return [{
      factionId: entry.factionId,
      lines: [
        factionName(entry.factionId),
        ...entry.reasons.flatMap(explainReason),
      ],
      risk: [],
      available: false,
    }];
  });
}

/** The one sentence that has to survive every rewording below, because it is
 *  the part that costs a turn rather than a card. */
const SPENT_ANYWAY = "A failed attempt still spends the card.";

/** Per guard, the two things a player can be told about it: the warning
 *  before aiming a card it turns aside, and the line in hand saying you are
 *  already holding one. `tests/target-explanations.test.ts` checks both
 *  records cover every entry in `GUARDS`. */
export const GUARD_RISK: Readonly<Record<string, string>> = {
  "bodyguard":
    "A posted bodyguard would turn this aside, and you cannot tell in advance.",
};

export const GUARD_POSTED: Readonly<Record<string, string>> = {
  "bodyguard": "A bodyguard is already posted.",
};

/** How a card can come back with nothing, in words. Renders `FailureRisk`
 *  and decides nothing: whether a card is fallible at all is
 *  `failureRiskOf`'s question, answered once in the rules. */
export function riskLines(risk: FailureRisk): string[] {
  return [GUARD_RISK[risk.because], SPENT_ANYWAY];
}

/** Risk lines for one candidate target, or none where that aim cannot fail. */
export function targetOddsLines(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): string[] {
  const risk = failureRiskOf(view, actorFactionId, cardId, targetFactionId);
  return risk === null ? [] : riskLines(risk);
}

/** What a fallible card says about itself, before any target is chosen. Null
 *  for a card the rules can never refuse. A record rather than a switch so
 *  the omission is visible to a test. */
const CARD_RISK: Record<string, string> = {
  "assassinate-ruler":
    "Can fail: a posted bodyguard turns the blade aside, and nothing tells " +
    "you in advance which rivals have one.",
};

export const cardRiskLine = (cardId: string): string | null =>
  CARD_RISK[cardId] ?? null;

/** One effect of the armed card, as a row of its block: the change in the
 *  left column, and what changes on the right. `NO_FIGURE` where the effect
 *  is not a number, so the column still lines up. */
interface Impact {
  amount: string;
  spans: TooltipSpan[];
}

const NO_FIGURE = "--";

const prose = (text: string): Impact => ({ amount: NO_FIGURE, spans: [{ text }] });

const riskRows = (
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): Impact[] =>
  targetOddsLines(view, actorFactionId, cardId, targetFactionId).map(prose);

/** What an attack would do to one polygon's defense: the before and after,
 *  the same numbers the log suffix will quote. */
function defenseMove(
  view: RulesView,
  polygon: string,
  delta: number,
  multiplier: number,
  /** Whether the number is a CEILING rather than a promise. An attack's is:
   *  how hard a raid hits is chosen after the target is clicked, so this row
   *  is read while the amount is still open and every word of it has to say
   *  so. A heal's is not - the card's number is the card's number. */
  upTo = false,
): Impact {
  const before = defenseOf(view, polygon);
  const max = defenseMaxOf(view, polygon);
  const after = Math.max(0, Math.min(max, before + delta));
  const signed = delta > 0 ? `+${delta}` : `${delta}`;
  return {
    amount: upTo ? `up to ${signed}` : signed,
    spans: [
      { text: `Defense (${before} -> ${after}` },
      { text: multiplier > 1 ? `, ${multipliedWord(multiplier)})` : ")" },
    ],
  };
}

/** What playing the armed card here would get you. Only ever called for a
 *  target the rules already allow, so every branch can quote a real number. */
function availableImpacts(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): Impact[] {
  if (ATTACK_CARDS.has(cardId)) {
    const { damage, multiplier } = attackImpactOn(
      view, actorFactionId, cardId, targetFactionId,
    );
    // An army that deals more than the land has standing walks in over what is
    // left of it, and a land with nothing left to fight is taken by anything
    // that reaches it - so `defenseMove` alone describes the one play on the
    // board that changes who holds a land as a scratch, or as nothing at all.
    // The AI has ranked this as a first-class move all along; only the player
    // was not told.
    //
    // Asked through `capturesOnArrival`, the rule the resolution itself asks,
    // and against POST-TERRAIN damage: hill country shaving a 4 down to 3 is
    // the difference between taking a 3-defense land and bouncing off it, and
    // a preview reading the raw number would promise the conquest anyway.
    //
    // Conditional wording, and not hedging. The damage an arrow carries is
    // frozen at declaration, but the defense it lands against is read a turn
    // later, so a fortify in between is a real escape and this row must not
    // promise past it.
    //
    // The number is a CEILING as well - the most the deepest-pocketed land of
    // the realm could tear out of itself to pay for this - because the amount
    // is chosen after the click. So the capture row asks whether the play is
    // AVAILABLE, which is the honest question at aiming time, and the row
    // above it says "up to".
    //
    // Asked of `ATTACK_CARDS`, the class - every one of them sends an army,
    // Great raid through its own fan - so a new attack card is covered by
    // joining the set rather than by finding this line.
    const standing = defenseOf(view, targetFactionId);
    const dealt = damageAfterTerrain(view, targetFactionId, damage);
    return [
      defenseMove(view, targetFactionId, -damage, multiplier, true),
      ...(capturesOnArrival(dealt, standing)
        ? [prose(standing === 0
            ? "Takes the land, if it is still undefended when this lands"
            : "Takes the land, if it is no better defended when this lands")]
        : []),
    ];
  }
  if (isSingleLandHeal(cardId)) {
    const multiplier = omensMultiplier(view, actorFactionId, cardId);
    return [defenseMove(
      view, targetFactionId, SINGLE_LAND_HEAL[cardId] * multiplier, multiplier,
    )];
  }
  if (cardId === "spread-disease") {
    const held = view.disease[targetFactionId]?.[actorFactionId] ?? 0;
    return [{
      amount: "+1",
      spans: [{ text: `Disease (${held} -> ${held + 1})` }],
    }];
  }
  if (cardId === "localized-outbreak") {
    const splash = outbreakPolygons(view, actorFactionId, targetFactionId);
    return [prose(
      `+1 of your disease on each of its ${count(splash.length, "neighbour")}.`,
    )];
  }
  if (cardId === "subjugate" || cardId === "incorporate") {
    return [prose(
      cardId === "subjugate"
        ? "Becomes your vassal."
        : "Absorbed into your realm.",
    )];
  }
  if (cardId === "assassinate-ruler") {
    return [
      prose("Their ruler dies; the successor starts with no leadership."),
      ...riskRows(view, actorFactionId, cardId, targetFactionId),
    ];
  }
  if (cardId === "found-settlement") {
    return [prose("+1 wealth a turn to whoever holds this land's realm.")];
  }
  return [prose("Available.")];
}

/** What the armed card would do to this land, or why it cannot be aimed
 *  there. Empty for a card that takes no target, or a faction the rules have
 *  never heard of. */
export function targetImpactLines(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): TooltipLine[] {
  const card = CARDS[cardId];
  if (!card?.targeted) return [];
  const entry = targetEligibilityFor(view, actorFactionId, cardId).find(
    (e) => e.factionId === targetFactionId,
  );
  if (entry === undefined) return [];
  // Your own land, before anything else - unless the card is aimed inward,
  // where its own land is a real candidate and the block there (no dot left,
  // already at full defense) is the reason to print.
  const inwardCard = isInwardCard(cardId);
  if (
    entry.state !== "available" &&
    targetFactionId === actorFactionId &&
    !inwardCard
  ) {
    return [{ text: "Your own land.", tone: "bad" }];
  }
  if (entry.state === "irrelevant") {
    return [{
      text: inwardCard ? "Not in your realm." : "Out of reach.",
      tone: "bad",
    }];
  }
  if (entry.state === "blocked") {
    // The first reason only: `targetEligibilityFor` pushes the structural
    // blocks before the gate, so the first is the one to fix first, and a
    // hover has room for one line. The card tip still lists them all.
    return [{ text: explainReason(entry.reasons[0])[0], tone: "bad" }];
  }
  // The whole block is amber, heading and rows alike, so the armed card's
  // preview is one shape the eye can find.
  return [
    { text: `If ${card.name} played here:`, tone: "info", blockStart: true },
    ...availableImpacts(view, actorFactionId, cardId, targetFactionId).map(
      (i) => spanLine(i.spans, { amount: i.amount, tone: "info" }),
    ),
  ];
}

/** Where the numbers on a polygon's map badge come from: the defense over its
 *  max, and the two gate lines the bands are drawn at. On the human's own
 *  home the subjugation line is the one that bites; on a vassal's home the
 *  independence line is. Takes no faction-name lookup, so it structurally
 *  cannot violate the naming rule - the land is named on the lines above. */
/** Every passive status on a land, one line each: what it is and what it does.
 *  Public whoever holds the land - a status the player cannot see is a rule
 *  they cannot play around, which is why no status ships without this. */
export function passiveLines(
  passives: Passives, polygon: string,
): TooltipLine[] {
  const ids = passivesOn(passives, polygon);
  if (ids.length === 0) return [];
  // The NAME only, the card rule exactly: a card is named and its rules text
  // waits on the name's own hover, and a status is the same kind of thing.
  // Spelling every rule out inline made a land with three of them a wall of
  // prose over the two numbers the tip exists to show.
  return [
    { text: "Statuses", blockStart: true as const },
    ...ids.map((id) => ({ text: PASSIVES[id].name, segments: [passive(id)] })),
  ];
}

export function defenseBreakdown(
  view: RulesView,
  polygon: string,
  /** Whether the hovered land answers to an overlord, which decides whether
   *  the independence line is worth printing. */
  isVassalHome: boolean,
): TooltipLine[] {
  const gate = subjugationGateOn(view, polygon);
  const max = defenseMaxOf(view, polygon);
  const rows: TooltipLine[] = [
    {
      text: "Defenses",
      blockStart: true,
    },
    {
      amount: `${gate.defense}/${max}`,
      text: gate.open ? "standing - the gate is OPEN" : "standing",
      tone: gate.open ? "bad" : undefined,
    },
    {
      amount: `${gate.required}`,
      text: "or less opens subjugation",
    },
  ];
  if (isVassalHome) {
    rows.push({
      amount: `${Math.ceil(INDEPENDENCE_GATE * max)}`,
      text: "or more regains independence at their turn",
    });
  }
  return rows;
}

/** What a land IS, for a hover with no seat behind it - the faction picker's.
 *  Every figure here is a standing property of the ground: what it can absorb,
 *  what it can muster, what stands on it and what the ground itself does. None
 *  of it asks who holds the land, because at pick time nobody does.
 *
 *  Assembled out of the same blocks the in-play hover uses, so the land the
 *  player chose reads the same way the moment the game starts. The army count
 *  goes through `armyCapOn`, which is the rules' one answer, so a status that
 *  raises the divisor (`burden-of-bureaucracy`) is already in the number. */
export function landFactsLines(
  view: RulesView, polygon: string,
): TooltipLine[] {
  const cap = armyCapOn(view, polygon);
  return [
    // Never the independence line, even where a region opens with realms
    // already standing and the hovered land is somebody's vassal. That line
    // reads "regains independence at their turn", and the only vassals on this
    // screen are the seeded ones - which have no ruler, so no turn, so no
    // moment at which the gate is asked. Printing it would promise a land its
    // freedom on a screen where the player cannot even pick it. Who holds the
    // land is said once, by the allegiance line above this block.
    ...defenseBreakdown(view, polygon, false),
    // Inside the defense block rather than under a heading of its own, because
    // the cap is that ceiling divided: it belongs beside the number it is read
    // off, not in a second place the player has to relate back to it.
    {
      amount: `${cap}`,
      text: `${plural(cap, "army", "armies")} its defenses support`,
    },
    ...settlementBlock(view, polygon),
    ...passiveLines(view.passives, polygon),
  ];
}

/** The disease stacks sitting on one polygon, one row per owner, in faction
 *  order. Nothing else on screen states the counts; the pips only show
 *  presence. Owner names come from the caller so this stays plain data. */
export function diseaseBreakdown(
  view: RulesView,
  polygon: string,
  factionName: (id: string) => string,
): TooltipLine[] {
  const owners = view.disease[polygon];
  if (owners === undefined) return [];
  const rows = view.factionIds
    .filter((f) => (owners[f] ?? 0) > 0)
    .map((f) => ({
      amount: `${owners[f]}`,
      text: `disease held by ${factionName(f)}`,
    }));
  if (rows.length === 0) return [];
  return [{ text: "Disease", blockStart: true }, ...rows];
}

/** The respite note beside a hovered faction that escaped vassalage.
 *  Nameless prose: no faction-name lookup, no naming-rule risk. */
export function respiteLines(
  view: { respites: Record<string, number>; turn: number },
  humanFactionId: string,
  hoveredFactionId: string,
): TooltipLine[] {
  const expiry = respiteExpiry(view, hoveredFactionId);
  if (expiry === undefined) return [];
  if (hoveredFactionId === humanFactionId) {
    return [{
      text: `You escaped vassalage recently: none may subjugate you ${untilTurn(expiry)}`,
      tone: "good",
    }];
  }
  return [{
    text: `Escaped vassalage recently: none may subjugate them ${untilTurn(expiry)}`,
    tone: "info",
  }];
}

/** How many settlements stand on one land, over how many the map authors for
 *  it. Takes the land's OWN faction id, never the politically resolved one:
 *  a settlement stays with the land when the land is absorbed. */
export function settlementBlock(
  view: RulesView,
  landFactionId: string,
): TooltipLine[] {
  const standing = settlementsIn(view, landFactionId);
  const spent = standing - freeSettlementsIn(view, landFactionId);
  return [
    { text: "Settlements", blockStart: true },
    { amount: `${standing}/${standing + freeSitesIn(view, landFactionId)}`,
      text: "on this land" },
    // Only while it is true. A land nobody has fortified this turn says
    // nothing, so the line appearing IS the news - the same reason the badge
    // pips are the surface a player reads mid-turn.
    ...(spent > 0
      ? [{ amount: `${spent}`, text: "called on this turn" }]
      : []),
  ];
}

/** Why a card in hand is greyed out, in one line, for its hover tip. One line
 *  per rule, not per card: a new card that reuses an existing rule needs
 *  nothing here. */
export function cardBlockLine(reason: CardBlockReason): string {
  switch (reason.code) {
    case "forced-first":
      return "A forced card must be played first.";
    case "needs-overlord":
      return "Only while you are somebody's vassal.";
    case "already-held":
      return "You are already holding an unspent one.";
    case "cannot-afford":
      // Both numbers, because together they are the decision: income arrives
      // every turn, so "needs 2, you hold 1" says how long to wait.
      return `Needs ${reason.cost} wealth; you hold ${reason.held}.`;
    case "realm-too-small":
      return (
        `Your realm holds ${reason.held} of the ` +
        `${count(reason.required, "land")} needed.`
      );
    case "no-disease":
      return "No disease stacks stand anywhere for this to work on.";
    case "at-full-defense":
      return "Every land of your realm already stands at full defense.";
    case "no-army":
      return "Every army on your borders is already out on a march.";
    case "no-settlement":
      return "Every settlement in your realm has already been called on " +
        "this turn.";
    case "turn-spent":
      // Names no card: the cards that could follow are the ones still lit up
      // in the hand, and this line is read on the greyed-out ones. A class,
      // not a copy - a Raid may be followed by a Strong raid.
      return "Only another card of the kind you played may follow.";
    case "no-target":
      return "Nothing in reach is a legal target.";
    case "unavailable":
      return "Not playable now.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** The slice of state the modifier lines need. `GameState` satisfies this
 *  structurally, so the caller passes the game straight in. */
export interface ModifierView {
  omens: Omens;
  miasma: Readonly<Record<string, number>>;
  guards: Guards;
}

/** What is currently affecting this card for this faction, in words, for the
 *  hover tip. */
export function cardModifierLines(
  view: ModifierView,
  factionId: string,
  cardId: string,
): string[] {
  const lines: string[] = [];
  const readings = omensHeld(view, factionId);
  if (readings > 0) {
    // Whatever the readings double, not attacks alone: a heal carrying the
    // fortify keyword is doubled by the same reading, and a line that only
    // ever said "attack" would have hidden that.
    const multiplier = omensMultiplier(view, factionId, cardId);
    if (multiplier > 1) {
      lines.push(`Favourable omens: this counts ${multipleWord(multiplier)}.`);
    }
    // The only route by which a player finds out readings stack: the card's
    // own text describes one reading, and a second is legal rather than
    // greyed out, so there is no block line to read either.
    if (cardId === "favourable-omens") {
      lines.push(
        `${count(readings, "reading")} already in hand: another makes the ` +
        `next attack count ${multipleWord(2 ** (readings + 1))}.`,
      );
    }
  }
  const foulAir = miasmaHeld(view, factionId);
  if (foulAir > 0) {
    if (cardId === "plague") {
      const word = multipleWord(plagueMultiplier(view, factionId));
      lines.push(`Miasma: each of your stacks counts ${word}.`);
    }
    if (cardId === "miasma") {
      lines.push(
        `${count(foulAir, "reading")} already gathered: another makes the ` +
        `next plague count ${multipleWord(2 ** (foulAir + 1))}.`,
      );
    }
  }
  // One line per guard, from GUARD_POSTED, so a second guard cannot be added
  // to the rules and stay invisible in the hand.
  if (isGuardCard(cardId) && holdsGuard(view, factionId, cardId)) {
    lines.push(GUARD_POSTED[cardId]);
  }
  return lines;
}

/** What a Plague would deal right now, for its hover tip: the total across
 *  every polygon holding the actor's stacks, and the biggest single hit. */
export function plaguePreviewLines(
  view: RulesView,
  factionId: string,
): string[] {
  const polygons = view.factionIds.filter(
    (p) => (view.disease[p]?.[factionId] ?? 0) > 0,
  );
  if (polygons.length === 0) return [];
  const total = polygons.reduce(
    (sum, p) => sum + Math.min(defenseOf(view, p), plagueDamageOn(view, factionId, p)),
    0,
  );
  return [
    `Would deal ${total} damage across ${count(polygons.length, "land")}.`,
  ];
}
