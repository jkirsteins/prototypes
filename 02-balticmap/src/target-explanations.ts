import {
  INCORPORATE_RAMP, gripPartsOn, incorporationChance,
  loyaltyOf, omenMultiplier, omensHeld, poachSurchargeOn, raidGainFor,
  subjugationChance,
  subjugationRaceFor, targetEligibilityFor,
  type CardBlockReason,
  type Omens,
  type RulesView,
  type TargetBlockReason,
  type TargetEligibility,
} from "./playability";
import { CARDS, DOUBLABLE_CARDS } from "./cards";
import { count } from "./plural";
import { leadsOf } from "./relations";
import { formatLead } from "./view";
import { spanLine, type TooltipLine, type TooltipSpan } from "./panel";

/** How much a Favourable omens stack multiplies by, in words. One table, two
 *  grammatical forms: the adjective for a promise ("counts double") and the
 *  participle for a resolution ("- doubled").
 *
 *  Here rather than at each surface because four of them say it - the card tip,
 *  the map preview, the activity log and the round summary - and the repo rule
 *  is that one change is never phrased more than one way. English runs out at
 *  two readings, so a three-deep stack falls back to the plain multiple; that
 *  is honest rather than reaching for "octupled".
 *
 *  A multiplier of 1 has no word: callers must not ask, since "counts single"
 *  is not a thing anyone says. */
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
  available: boolean;
}

function explainReason(reason: TargetBlockReason): string[] {
  switch (reason.code) {
    case "alliance":
      return [`Blocked by Alliance until turn ${reason.expiresTurn}.`];
    case "insufficient-lead": {
      const lands = count(reason.realmSize, "land");
      const settled =
        reason.settlements === 0 ? "" : ` and ${count(reason.settlements, "settlement")}`;
      // The surcharge is named separately or the bar looks wrong: a one-land
      // vassal demanding a lead of 5 makes no sense until you are told that 2
      // of it is the price of prising it off its current lord.
      const poached =
        reason.poachSurcharge === 0
          ? ""
          : `, plus ${reason.poachSurcharge} to prise them off their overlord`;
      // Naming the tracks separately is the whole point once they diverge: the
      // shorter bar is the route to take, and a player told only the taller one
      // would read a settled realm as further out of reach than it is.
      const need =
        reason.required.might === reason.required.status
          ? `Need a Might or Status lead of ${reason.required.might}`
          : `Need a Might lead of ${reason.required.might} or a Status lead of ${reason.required.status}`;
      return [
        `${need} because their realm has ${lands}${settled}${poached}.`,
        `Current leads: Might ${reason.mightLead}, Status ${reason.statusLead}.`,
      ];
    }
    case "already-vassal":
      return ["Already your vassal."];
    case "actor-subjugated":
      return ["Unavailable while you are subjugated."];
    case "overlord-prohibited":
      return ["You cannot target your overlord."];
    case "incorporated":
      return ["Already incorporated."];
    case "self":
      return ["You cannot target yourself."];
    case "not-your-vassal":
      return ["Not your vassal."];
    case "already-settled":
      return ["Already settled this game."];
    case "no-free-site":
      return ["No room for another settlement."];
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
  /** Extra lines appended to available targets, e.g. what a Raid there gains.
   *  Blocked targets get none: the block reason is the useful answer. */
  annotate: (factionId: string) => string[] = () => [],
): TargetExplanation[] {
  return entries.flatMap((entry): TargetExplanation[] => {
    if (entry.state === "irrelevant") return [];
    if (entry.state === "available") {
      return [{
        factionId: entry.factionId,
        lines: [factionName(entry.factionId), "Available.", ...annotate(entry.factionId)],
        available: true,
      }];
    }
    return [{
      factionId: entry.factionId,
      lines: [
        factionName(entry.factionId),
        ...entry.reasons.flatMap(explainReason),
      ],
      available: false,
    }];
  });
}

/** Odds lines for a card whose resolution is a roll, for one candidate target.
 *  Empty for every deterministic card and for every deterministic target, so a
 *  player is never shown "100%" where no roll exists and never left guessing
 *  where one does.
 *
 *  Both rolls spend the card on a miss, which is the part a player must know
 *  BEFORE committing - so it is stated on every line rather than only on the
 *  long odds.
 *
 *  Lives here beside the block reasons because it answers the same question
 *  ("what happens if I aim here") and so that one test covers both halves of
 *  what a target tooltip says. */
export function targetOddsLines(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): string[] {
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  if (cardId === "subjugate") {
    const chance = subjugationChance(view, targetFactionId);
    if (chance >= 1) return [];
    return [
      `${pct(chance)} chance to succeed - they already have an overlord.`,
      "A failed attempt still spends the card.",
    ];
  }
  if (cardId === "incorporate") {
    const chance = incorporationChance(view, actorFactionId, targetFactionId);
    const held = loyaltyOf(view, targetFactionId, actorFactionId);
    if (chance >= 1) {
      return [`Certain: held ${held} turns, ${INCORPORATE_RAMP} needed.`];
    }
    return [
      `${pct(chance)} chance to succeed - held ${held} of the ${INCORPORATE_RAMP} turns needed.`,
      "A failed attempt still spends the card.",
    ];
  }
  return [];
}

/** One effect of the armed card, as a row of its block: the change in the left
 *  column, and what changes on the right. `NO_FIGURE` where the effect is not a
 *  number, so the column still lines up rather than leaving a hole. */
interface Impact {
  amount: string;
  spans: TooltipSpan[];
}

const NO_FIGURE = "--";

const prose = (text: string): Impact => ({ amount: NO_FIGURE, spans: [{ text }] });

/** What the armed card would do to one land's standing: the human's signed lead
 *  before and after, in `formatLead`'s convention - the same one the badges and
 *  the round summary use.
 *
 *  Both values are spans rather than text, because the sign of each is the
 *  point. A Raid that moves a lead from -2 to -1 is progress, but neither
 *  number is good news, and a line coloured green end to end said it was.
 *
 *  Building the pieces here means this no longer calls `standingChangeText`,
 *  which is what the activity log and the round summary say the same change
 *  with. The spans must still join to exactly that string, and a test asserts
 *  it - one change cannot end up phrased three ways across three surfaces. */
function standingMove(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
  track: "might" | "status",
  next: (before: number) => number,
  multiplier: number,
): Impact {
  const before = leadsOf(view.relations, actorFactionId, targetFactionId)[track];
  const after = next(before);
  const label = track === "might" ? "Might" : "Status";
  return {
    amount: formatLead("", after - before),
    spans: [
      // Bracketed, because the row already opens with the change in its own
      // column: "+1 Might -1 -> 0" reads as three loose numbers, and the
      // parentheses say which two are the before and after.
      { text: `${label} (` },
      { text: formatLead("", before), lead: before },
      { text: " -> " },
      { text: formatLead("", after), lead: after },
      { text: multiplier > 1 ? `, ${multipliedWord(multiplier)})` : ")" },
    ],
  };
}

/** What playing the armed card here would get you. Only ever called for a
 *  target the rules already allow, so every branch can quote a real number
 *  rather than hedging.
 *
 *  A list because a card may do more than one thing; every card does exactly
 *  one today, and the block around it is shaped to take more without moving. */
function availableImpacts(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): Impact[] {
  const multiplier = omenMultiplier(view, actorFactionId, cardId);
  if (cardId === "raid") {
    const { gain } = raidGainFor(view, actorFactionId, targetFactionId);
    return [standingMove(
      view, actorFactionId, targetFactionId, "might", (b) => b + gain,
      multiplier,
    )];
  }
  if (cardId === "shrewd-marriage") {
    return [standingMove(
      view, actorFactionId, targetFactionId, "status",
      (b) => b + multiplier, multiplier,
    )];
  }
  if (cardId === "assassinate-ruler") {
    // The card levels the Status lead rather than adding to it, so the "after"
    // is 0 whichever side was ahead. A Bodyguard on the target would nullify
    // it, and this deliberately does not say so: the guard is theirs to know.
    return [standingMove(
      view, actorFactionId, targetFactionId, "status", () => 0, 1,
    )];
  }
  if (cardId === "subjugate" || cardId === "incorporate") {
    const odds = targetOddsLines(view, actorFactionId, cardId, targetFactionId);
    if (odds.length > 0) return [prose(odds[0])];
    return [prose(
      cardId === "subjugate"
        ? "Becomes your vassal."
        : "Absorbed into your realm.",
    )];
  }
  if (cardId === "alliance") {
    const turns = view.diplomacyBoost.includes(actorFactionId) ? 10 : 5;
    return [prose(`No hostile cards between you for ${turns} turns.`)];
  }
  if (cardId === "found-settlement") {
    return [prose("+1 to the lead others need to subjugate you.")];
  }
  return [prose("Available.")];
}

/** What the armed card would do to this land, or why it cannot be aimed there.
 *  Empty for a card that takes no target, or a faction the rules have never
 *  heard of.
 *
 *  A legal target gets a block: a heading naming the card, then a row per
 *  effect, matching the threshold blocks below it. A refusal is not a list of
 *  effects and stays the single red line it has always been - the heading would
 *  otherwise promise a preview it cannot give.
 *
 *  The heading names the card, which the flat version of this line deliberately
 *  did not. The reasoning against it still stands and is worth stating: a name
 *  in prose ought to be a segment the player can point at (see AGENTS.md) and
 *  `TooltipLine` is plain text, so this one is inert. It is here because a
 *  block of effects with no subject reads as though the numbers belong to the
 *  land rather than to the card in your hand. */
export function targetImpactLines(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
  /** Drop the line when the only thing it would say is the lead shortfall.
   *  The map hover sets this because `subjugationBreakdown` prints the same
   *  shortfall itemised directly underneath, and the two together say it
   *  twice. Every other block reason still comes through. */
  omitInsufficientLead = false,
): TooltipLine[] {
  const card = CARDS[cardId];
  if (!card?.targeted) return [];
  const entry = targetEligibilityFor(view, actorFactionId, cardId).find(
    (e) => e.factionId === targetFactionId,
  );
  if (entry === undefined) return [];
  // Your own land, before anything else. The rules reach it two different ways
  // - "irrelevant" because a realm does not border itself, or a `self` block
  // once an annexation puts your own id back in your reach - and both would
  // otherwise print an answer ("Out of reach") that is nonsense for the land
  // you are standing on. Never reached by Found a settlement, which is aimed
  // at your own realm and comes back available.
  if (entry.state !== "available" && targetFactionId === actorFactionId) {
    return [{ text: "Your own land.", tone: "bad" }];
  }
  if (entry.state === "irrelevant") {
    return [{
      text:
        cardId === "found-settlement"
          ? "Not in your realm."
          : "Out of reach.",
      tone: "bad",
    }];
  }
  if (entry.state === "blocked") {
    // The first reason only. `targetEligibilityFor` pushes the structural
    // blocks (self, incorporated, subjugated, already a vassal) before the
    // lead shortfall, so the first is the one that has to be fixed first, and
    // a hover has room for one line. The card tip still lists them all.
    const first = entry.reasons[0];
    if (omitInsufficientLead && first.code === "insufficient-lead") return [];
    return [{ text: explainReason(first)[0], tone: "bad" }];
  }
  // The whole block is amber, heading and rows alike, so the armed card's
  // preview is one shape the eye can find. Red and green are already spoken
  // for: on the threshold blocks below they mean which realm is being counted,
  // and inside these rows they mean the sign of a standing value.
  return [
    { text: `If ${card.name} played here:`, tone: "info", blockStart: true },
    ...availableImpacts(view, actorFactionId, cardId, targetFactionId).map(
      (i) => spanLine(i.spans, { amount: i.amount, tone: "info" }),
    ),
  ];
}

type Track = "might" | "status";

const TRACK_LABEL: Record<Track, string> = { might: "Might", status: "Status" };

/** One track's block: the badge's own figure for that track, then a row per
 *  piece of the threshold behind it.
 *
 *  Every track gets its own block and its own rows even when the two tracks are
 *  racing the same realm and most of the rows repeat. The alternative was one
 *  block serving both bars with a "(Might only)" note on the settlement row,
 *  and there the column added up to neither number. Here each column sums to
 *  the figure in its own heading, which is the only version a player can check.
 *
 *  `mine` says the threshold being itemised is built from the human's own
 *  realm, which is the direction where they are the one being taken. */
function trackBlock(
  view: RulesView,
  track: Track,
  lead: number,
  bar: number,
  takenFactionId: string,
  mine: boolean,
): TooltipLine[] {
  const parts = gripPartsOn(view, takenFactionId);
  const surcharge = poachSurchargeOn(view, takenFactionId);
  const rows: TooltipLine[] = [
    {
      // `parts.status` IS the base - gripPartsOn defines it as
      // SUBJUGATE_THRESHOLD per land - so the column never repeats that
      // multiplication and cannot drift from the heading above it.
      amount: `${parts.status}`,
      text: `from realm size (${count(parts.lands, "land")})`,
    },
  ];
  // Settlements raise the Might threshold alone, so the Status block must not
  // list them: there they contribute nothing and the column would not add up.
  if (parts.settlements > 0 && track === "might") {
    rows.push({
      amount: `+${parts.settlements}`,
      text: `from ${count(parts.settlements, "settlement")}`,
    });
  }
  // Named separately or the threshold looks wrong: a one-land vassal demanding
  // a lead of 5 makes no sense until you are told what 2 of it buys.
  //
  // The possessive is not decoration. This row's surcharge belongs to whoever
  // is being taken, which on a "Your thresholds" block is the human - so a bare
  // "overlord support" on a tooltip titled with a rival's name reads as that
  // rival's overlord, and there may not be one.
  if (surcharge > 0) {
    rows.push({
      amount: `+${surcharge}`,
      text: mine
        ? "from your overlord's support"
        : "from their overlord's support",
    });
  }
  return [
    {
      // The same formatter the badge uses, so the heading is literally the
      // figure the player is pointing at.
      text: `${formatLead(`${TRACK_LABEL[track]} `, lead, bar)}. ${mine ? "Your" : "Opponent's"} thresholds:`,
      tone: mine ? "bad" : "good",
      blockStart: true,
    },
    ...rows,
  ];
}

/** Where the numbers on a rival's map badge come from: one block per track,
 *  itemising the threshold that track is racing.
 *
 *  Gated on the same `quiet` flag the badge is, so a block appears exactly
 *  where a denominator is on screen to be explained. A track whose leading side
 *  could never subjugate the other carries no denominator and gets no block:
 *  this explains the thresholds that are showing and never the absence of one,
 *  which is a different question and belongs to the card tip's block reasons.
 *
 *  Takes no faction-name lookup, which is how it satisfies the naming rule
 *  rather than by remembering to: it structurally cannot name anybody. A future
 *  change that wants a name here has to add a parameter and argue with this
 *  comment. `TooltipLine` is plain text and a name in prose has to be a segment
 *  the player can point at (see AGENTS.md); the land and its holder are already
 *  named on the lines above these blocks. */
export function subjugationBreakdown(
  view: RulesView,
  humanFactionId: string,
  rivalFactionId: string,
): TooltipLine[] {
  const race = subjugationRaceFor(view, humanFactionId, rivalFactionId);
  if (race.quiet) return [];
  const lines: TooltipLine[] = [];
  for (const track of ["might", "status"] as Track[]) {
    const { lead, bar, takenFactionId } = race[track];
    if (bar === null) continue;
    lines.push(
      ...trackBlock(
        view, track, lead, bar, takenFactionId,
        takenFactionId === humanFactionId,
      ),
    );
  }
  return lines;
}

/** Why a card in hand is greyed out, in one line, for its hover tip.
 *
 *  One line per rule, not per card: `cardBlockReason` already reduced fourteen
 *  cards to six answers, and this is the only place those six are put into
 *  words. A fifteenth card that reuses an existing rule needs nothing here.
 *
 *  Names no card. The forced card is the one still lit up in the hand, which
 *  says which it is better than a name in a tip the player has to hover a
 *  different card to read. */
export function cardBlockLine(reason: CardBlockReason): string {
  switch (reason.code) {
    case "forced-first":
      return "A forced card must be played first.";
    case "needs-overlord":
      return "Only while you are somebody's vassal.";
    case "already-held":
      return "You are already holding an unspent one.";
    case "revolt-live":
      return "A revolt is already sown in your deck.";
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
  diplomacyBoost: string[];
  bodyguards: string[];
}

/** What is currently affecting this card for this faction, in words, for the
 *  hover tip. Two of these were invisible before: a player could hold an
 *  Extended diplomacy or a Bodyguard and have no way to see it. */
export function cardModifierLines(
  view: ModifierView,
  factionId: string,
  cardId: string,
): string[] {
  const lines: string[] = [];
  const held = omensHeld(view, factionId);
  if (held > 0) {
    if (DOUBLABLE_CARDS.has(cardId)) {
      const word = multipleWord(omenMultiplier(view, factionId, cardId));
      lines.push(`Favourable omens: this card counts ${word}.`);
    }
    // The only route by which a player finds out readings stack. Nothing else
    // says so: the card's own text describes one reading, and a second one is
    // now legal rather than greyed out, so there is no block line to read
    // either. It names the payoff rather than the state for that reason.
    if (cardId === "favourable-omens") {
      lines.push(
        `${count(held, "reading")} already in hand: another makes the next ` +
        `gain count ${multipleWord(2 ** (held + 1))}.`,
      );
    }
  }
  if (cardId === "alliance" && view.diplomacyBoost.includes(factionId)) {
    lines.push("Extended diplomacy: this Alliance lasts 10 turns.");
  }
  if (cardId === "bodyguard" && view.bodyguards.includes(factionId)) {
    lines.push("A bodyguard is already posted.");
  }
  return lines;
}
