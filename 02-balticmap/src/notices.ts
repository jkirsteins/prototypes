import { metNothing, type GameEvent, type GameEventType } from "./game";
import { ESCAPE_RESPITE_TURNS } from "./playability";
import { TRIBUTE_CARDS } from "./cards";
import { count, plural } from "./plural";
import {
  card, faction, joinSegments, passive, t, type Segment,
} from "./rich-text";
import { walkStandings, type StandingChange, type WalkCtx } from "./standings";
import { untilTurn } from "./timed";

/** One notice-worthy event, rendered as one line: the card, who did it, and
 *  the score it moved. See the rule in AGENTS.md - no second modal, no
 *  three-paragraph notices. */
export interface SummaryLine {
  text: Segment[];
  /** Before -> after for every score this event moved. Empty for events that
   *  move nothing (a subjugation, a prevented play). */
  changes: StandingChange[];
  /** "bad" = done to you, "good" = you gained or held, "neutral" = a fact
   *  with no clear direction. */
  tone: "good" | "bad" | "neutral";
}

/** Everything the AI round did to the human: one modal, one Continue. */
export interface RoundSummary {
  title: string;
  lines: SummaryLine[];
  /** Rules consequences not tied to one line - the tribute injection, the
   *  open home gate. Deduplicated by rendered text and shown as a footer
   *  block, NOT appended to a line. */
  footnotes: Segment[][];
}

export interface NoticeCtx {
  humanFactionId: string;
  factionOf(playerId: number): string | undefined;
  /** The polygon's defense NOW - the post-batch truth walkStandings runs
   *  backwards from. */
  defense(polygon: string): number;
  defenseMax(polygon: string): number;
  /** `owner`'s disease stacks on `polygon` NOW - same convention. */
  diseaseOf(polygon: string, owner: string): number;
  /** Is this polygon part of the human's FULL realm right now? What decides
   *  whether a damage or disease line is the human's business. */
  inHumanRealm(polygon: string): boolean;
  /** The human's HOME subjugation gate stands open: any rival in reach can
   *  take them. The footnote every damage line must be able to raise. */
  homeGateOpen(): boolean;
}

/** Every GameEventType must decide: a line in the round summary, or silence
 *  with a written reason. The exhaustive Record makes adding an event type a
 *  compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx, localPlayerId?: number): boolean;
      /** One call per group (same type + card + prevented + human role).
       *  `changes` is index-parallel to `events`, from a walk over the WHOLE
       *  batch - so a line's numbers are that event's own, not the round's
       *  total. */
      lines(
        events: GameEvent[], changes: StandingChange[][], ctx: NoticeCtx,
        localPlayerId?: number,
      ): SummaryLine[];
      /** What this group contributes to the footer, if anything. */
      footnotes?(events: GameEvent[], ctx: NoticeCtx, localPlayerId?: number): Segment[][];
      /** Returns the modal heading when this event must interrupt even though
       *  the player has muted popups (`LogPrefs.showPopups`), or null when it
       *  may be swallowed. Reserve it for changes the player would otherwise
       *  play on without knowing. Three kinds qualify:
       *
       *  - What the player IS. Subjugation walls off their own plays and
       *    forces tribute into their deck; independence and release take both
       *    back. A muted player never told either way discovers it by
       *    noticing their cards have stopped working.
       *  - What the player STANDS ON. Their home gate falling open means any
       *    rival in reach can take them on its next turn - playing on without
       *    knowing that is playing a different game. A card entering their
       *    deck (the harvest, the tribute injection) is the same kind.
       *  - What the player SPENT. A play a guard turned aside moves NOTHING;
       *    the board cannot tell them their card is gone.
       *
       *  It returns the TITLE rather than a boolean so a rule cannot be
       *  marked critical without saying what happened. */
      critical?(e: GameEvent, ctx: NoticeCtx, localPlayerId?: number): CriticalTitle | null;
    }
  | { kind: "silent"; reason: string };

/** A critical heading, before the round is counted. A heading that can only
 *  ever describe one thing is a plain string. A heading describing something
 *  the round can do more than once carries both forms plus a `family`, and
 *  every rule returning the same family is counted TOGETHER. */
export type CriticalTitle =
  | string
  | { family: string; one: string; many: (n: number) => string };

/** A `CriticalTitle` and the round's count for its family, read as one
 *  heading. The single place a title becomes words. */
export function resolveTitle(title: CriticalTitle, n: number): string {
  return typeof title === "string" ? title : plural(n, title.one, title.many(n));
}

/** The ways a vassal leaves you - the independence gate, poached, released
 *  when its lord fell - are one heading, because they are one loss to the
 *  player and the line underneath already says which it was. */
const VASSAL_LOST: CriticalTitle = {
  family: "vassal-lost",
  one: "A vassal was lost",
  many: (n) => `You lost ${count(n, "vassal")}`,
};

/** Which side of an allegiance change the human is on: the faction that
 *  changed hands (`self`), or the overlord that lost it (`lord`). Null when
 *  the event misses the human, or when the human caused it and already
 *  knows. */
export type HumanRole = "self" | "lord";

function humanRoleIn(e: GameEvent, ctx: NoticeCtx, localPlayerId = 1): HumanRole | null {
  if (e.playerId === localPlayerId && e.type !== "independence") return null;
  if (e.targetFactionId === ctx.humanFactionId) return "self";
  // `subjugated` names the incumbent lord in `formerOverlordFactionId`, so it
  // must be read there.
  const lostTo = e.type === "subjugated"
    ? e.formerOverlordFactionId
    : e.overlordFactionId;
  return lostTo === ctx.humanFactionId ? "lord" : null;
}

/** `HumanRole` plus the one case it deliberately refuses to name: `actor`,
 *  the human's own play. Only the fizzle rule - a play a guard turned aside -
 *  asks for `actor`. */
export type NoticeRole = HumanRole | "actor";

function noticeRoleOf(e: GameEvent, ctx: NoticeCtx, localPlayerId = 1): NoticeRole {
  return e.playerId === localPlayerId && e.type !== "independence"
    ? "actor"
    : humanRoleIn(e, ctx, localPlayerId) ?? "self";
}

/** The tribute cards named in a row, as segments, so each stays a card the
 *  player can point at. Built from TRIBUTE_CARDS rather than written out. */
const tributeCardList = (): Segment[] =>
  joinSegments(TRIBUTE_CARDS.map((id) => [card(id)]));

const tributeCount = (): number => TRIBUTE_CARDS.length;

const PAY_TRIBUTE_FOOTNOTE = (): Segment[] => {
  const n = tributeCount();
  return [
    ...tributeCardList(),
    t(` ${plural(n, "was", "were")} shuffled into your deck. `),
    t(`While ${plural(n, "it is", "any of them is")} in hand it must be played first.`),
  ];
};

const RELEASE_FOOTNOTE = (): Segment[] => [
  ...tributeCardList(),
  t(` ${plural(tributeCount(), "was", "were")} removed from your deck, hand and discard.`),
];

/** The one warning every source of damage to the human's home must be able to
 *  raise: the gate is open. */
const GATE_OPEN_FOOTNOTE = (): Segment[] => [
  t("Your home defenses are at or under a quarter of their strength: "),
  t("any rival in reach can subjugate you."),
];

/** Segment-key for footnote dedup: two gate warnings from two different hits
 *  must collapse to one, so this compares rendered shape rather than object
 *  identity. */
function footnoteKey(segs: Segment[]): string {
  return segs
    .map((s) => {
      if (s.kind === "text") return `t:${s.text}`;
      if (s.kind === "card") return `card:${s.cardId}`;
      if (s.kind === "passive") return `passive:${s.passiveId}`;
      if (s.kind === "ability") return `ability:${s.abilityId}`;
      if (s.kind === "keyword") return `keyword:${s.keywordId}`;
      if (s.kind === "term") return `term:${s.termId}`;
      return `faction:${s.factionId}`;
    })
    .join("|");
}

// -- per-type line builders --------------------------------------------

function actorId(e: GameEvent, ctx: NoticeCtx): string | undefined {
  return ctx.factionOf(e.playerId);
}

function changesFor(i: number, changes: StandingChange[][]): StandingChange[] {
  return changes[i] ?? [];
}

/** A hit on a polygon of the human's realm: what card, who, where, and the
 *  defense it moved (the suffix comes from `changes`). The polygon segment
 *  lights the land on the map, so "where" is something the player can point
 *  at. */
function damagedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      ...(e.cardId !== undefined ? [card(e.cardId)] : [t("An attack")]),
      t(" by "), faction(actorId(e, ctx) ?? ""),
      ...(e.targetFactionId === ctx.humanFactionId
        ? [t(" battered your home defenses")]
        : [t(" battered the defenses of "), faction(e.targetFactionId ?? ""), t(" in your realm")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad" as const,
  }));
}

function diseaseLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      ...(e.cardId !== undefined ? [card(e.cardId)] : [t("Disease")]),
      t(" by "), faction(actorId(e, ctx) ?? ""),
      ...(e.targetFactionId === ctx.humanFactionId
        ? [t(" set disease on your home")]
        : [t(" set disease on "), faction(e.targetFactionId ?? ""), t(" in your realm")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad" as const,
  }));
}

function windsLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      card("foul-winds"), t(" by "), faction(actorId(e, ctx) ?? ""),
      t(" claimed the disease on "),
      ...(e.targetFactionId === ctx.humanFactionId
        ? [t("your home")]
        : [faction(e.targetFactionId ?? ""), t(" in your realm")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad" as const,
  }));
}

function assassinateLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
  role: NoticeRole,
): SummaryLine[] {
  return events.map((e, i) => {
    if (e.prevented) {
      // Nested inside `prevented` rather than checked first, so the actor arm
      // is structurally unreachable for a blade that landed.
      if (role === "actor") {
        return {
          text: [
            card("assassinate-ruler"), t(" spent on "),
            faction(e.targetFactionId ?? ""), t(" - a bodyguard turned the blade"),
          ],
          changes: [],
          tone: "bad" as const,
        };
      }
      return {
        text: [
          card("assassinate-ruler"), t(" by "), faction(actorId(e, ctx) ?? ""),
          t(" - your bodyguard turned the blade"),
        ],
        changes: [],
        tone: "good" as const,
      };
    }
    const text: Segment[] = [card("assassinate-ruler")];
    if (e.targetRuler !== undefined) text.push(t(` took ${e.targetRuler}`));
    if (e.successorRuler !== undefined) text.push(t(`; ${e.successorRuler} now leads you`));
    text.push(t(" - by "), faction(actorId(e, ctx) ?? ""));
    return { text, changes: changesFor(i, changes), tone: "bad" as const };
  });
}

/** What took the land: the opening segment of every vassal-loss line.
 *
 *  This used to be a literal `card("subjugate")`, which made a raid walking
 *  into a flattened land - and an assassination a status answered for - read as
 *  a card that is withdrawn from every pool. So it reads the route off the
 *  event, exhaustively and with no `default`: a new `SubjugationVia` stops
 *  compiling here until somebody has decided what it says. */
function subjugationCauseSegment(e: GameEvent): Segment[] {
  switch (e.via) {
    // Which card sent the army, or which card made the demand. The two read
    // the same because the sentence they open already says what happened to
    // the land; what differs is the name, and the name is the whole point.
    case "conquest":
    case "claim":
      return [card(e.cardId ?? "")];
    // The status, not the card that set it off - that one is named on the
    // `passive-fired` line above, and the rule the player needs to be able to
    // point at is the status's.
    case "passive":
      return [passive(e.passiveId ?? "")];
    // An allegiance change from before the route was recorded. The same
    // shape `damagedLines` and `marchResolvedLines` fall back to rather than
    // naming a card they were not told about.
    case undefined:
      return [t("A conquest")];
  }
}

function subjugatedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
  role: HumanRole,
): SummaryLine[] {
  if (role === "lord") {
    return events.map((e, i) => ({
      text: [
        ...subjugationCauseSegment(e), t(" by "), faction(actorId(e, ctx) ?? ""),
        t(" took your vassal "), faction(e.targetFactionId ?? ""),
      ],
      changes: changesFor(i, changes),
      tone: "bad",
    }));
  }
  return events.map((e, i) => ({
    text: [
      ...subjugationCauseSegment(e), t(" by "), faction(actorId(e, ctx) ?? ""),
      ...(e.formerOverlordFactionId !== undefined
        ? [t(" - your allegiance shifts from "), faction(e.formerOverlordFactionId), t(" to them")]
        : [t(" - you owe fealty to them")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function independenceLines(
  events: GameEvent[],
  _changes: StandingChange[][],
  _ctx: NoticeCtx,
  role: HumanRole,
): SummaryLine[] {
  if (role === "lord") {
    return events.map((e) => ({
      text: [
        t("The defenses of "), faction(e.targetFactionId ?? ""),
        t(" recovered - they leave your service, and none may subjugate "),
        t("them "), t(untilTurn(e.turn + ESCAPE_RESPITE_TURNS)),
      ],
      changes: [],
      tone: "bad" as const,
    }));
  }
  return events.map((e) => ({
    text: [
      t("Your home defenses recovered - you are free of "),
      ...(e.overlordFactionId !== undefined
        ? [faction(e.overlordFactionId)]
        : [t("your overlord")]),
      t(", and none may subjugate you "),
      t(untilTurn(e.turn + ESCAPE_RESPITE_TURNS)),
    ],
    changes: [],
    tone: "good" as const,
  }));
}

/** A march landing, a turn after the card that sent it.
 *
 *  Unlike `damagedLines` this cannot lean on "by whoever just played": the
 *  play was a turn ago and the line stands on its own, so it names both ends
 *  of the arrow. Whether it reads as good or bad is not the actor's identity
 *  either - the human's own counter winning is reported on the RIVAL's turn,
 *  under the rival's player id - it is which end of the axis the human's realm
 *  was on. */
function marchResolvedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => {
    const struckUs = e.targetFactionId !== undefined
      && ctx.inHumanRealm(e.targetFactionId);
    const home = e.targetFactionId === ctx.humanFactionId;
    const cardSeg = e.cardId !== undefined ? [card(e.cardId)] : [t("An attack")];
    // A standoff: both sides spent an army and neither score moved. Neither
    // end is the loser, so it is neither good news nor bad, and the line
    // names the two as equals - but it is still a line, because a player
    // whose raid was answered exactly must not think the card did nothing.
    if (e.counter !== undefined && e.amount === undefined) {
      return {
        text: [
          ...cardSeg, t(" out of "), faction(e.sourceFactionId ?? ""),
          t(" and the counter from "), faction(e.targetFactionId ?? ""),
          t(" cancel each other"),
        ],
        changes: changesFor(i, changes),
        tone: "neutral" as SummaryLine["tone"],
      };
    }
    // "A counter out of X threw it back onto Y" only when the human's own
    // counter is what won: every event reaching this line already cleared
    // `appliesToHuman`'s `!metNothing(e)`, the one shape where two armies
    // meet and `counter` is absent - so here, `counter`'s presence is
    // exactly "both sides had armies," and it carries the loser's total
    // beside `incoming`.
    const text: Segment[] = struckUs
      ? [
          ...cardSeg, t(" out of "), faction(e.sourceFactionId ?? ""),
          ...(e.counter !== undefined
            ? [t(" broke through the counter from ")]
            : [t(" fell on ")]),
          // "your home defenses" for the home polygon, the land's own name
          // plus "in your realm" for anything else under you - the same
          // division `damagedLines` draws, because which land was hit is a
          // different fact from whether it was the seat of power.
          ...(home
            ? [t("your home defenses")]
            : [faction(e.targetFactionId ?? ""), t(" in your realm")]),
        ]
      : [
          ...cardSeg, t(" out of "), faction(e.sourceFactionId ?? ""),
          ...(e.counter !== undefined
            ? [t(" met their attack and threw it back onto ")]
            : [t(" fell on ")]),
          faction(e.targetFactionId ?? ""),
        ];
    return {
      text,
      changes: changesFor(i, changes),
      tone: (struckUs ? "bad" : "good") as SummaryLine["tone"],
    };
  });
}

function releasedLines(events: GameEvent[], ctx: NoticeCtx, role: HumanRole): SummaryLine[] {
  if (role === "lord") {
    return [{
      text: [
        t("Your subjugation released "),
        ...joinSegments(events.map((e) => [faction(e.targetFactionId ?? "")])),
        t(" from your service; none may subjugate them "),
        t(untilTurn(events[0].turn + ESCAPE_RESPITE_TURNS)),
      ],
      changes: [],
      tone: "neutral",
    }];
  }
  return events.map((e) => ({
    text: [
      t("The fall of "),
      ...(e.overlordFactionId !== undefined ? [faction(e.overlordFactionId)] : [t("your overlord")]),
      t(" to "), faction(actorId(e, ctx) ?? ""),
      t(" released you from vassalage, and none may subjugate you "),
      t(untilTurn(e.turn + ESCAPE_RESPITE_TURNS)),
    ],
    changes: [],
    tone: "good",
  }));
}

// -- the registry ---------------------------------------------------------

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: {
    kind: "modal",
    // The actor arm's entire surface is the fizzle: an Assassinate ruler a
    // bodyguard turned aside. Everything else the human plays is visible
    // where they aimed it. The non-actor arm is the assassination aimed at
    // the human - the damage and disease plays raise their lines through
    // their consequence events instead, which carry the numbers.
    appliesToHuman: (e, ctx, localPlayerId = 1) =>
      e.playerId === localPlayerId
        ? e.cardId === "assassinate-ruler" && e.prevented === true
        : e.cardId === "assassinate-ruler" &&
          e.targetFactionId === ctx.humanFactionId,
    // Your blade stopped by THEIR guard is the wasted turn: the card is gone,
    // nothing moved, and their guard is quietly gone too.
    critical: (e, ctx, localPlayerId = 1) =>
      noticeRoleOf(e, ctx, localPlayerId) === "actor" ? "A bodyguard stopped you" : null,
    lines: (events, changes, ctx, localPlayerId = 1) =>
      assassinateLines(
        events, changes, ctx, noticeRoleOf(events[0], ctx, localPlayerId),
      ),
    footnotes: (events, ctx, localPlayerId = 1) => {
      // The guard consumption in playCard is real and is recorded nowhere
      // else in the UI, so without this line the modal would say only that
      // nothing happened.
      if (noticeRoleOf(events[0], ctx, localPlayerId) === "actor") {
        return [[
          t("Their bodyguard is spent defending this. A second attempt has "),
          t("nothing left to turn it aside."),
        ]];
      }
      return [];
    },
  },
  discard: { kind: "silent", reason: "routine; visible in log" },
  levied: {
    kind: "silent",
    reason: "the actor chose it - a modal telling you what you just decided " +
      "teaches nothing. The `march-declared` beside it is the news, and the " +
      "log carries the number as the line's own suffix",
  },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  plagued: {
    kind: "modal",
    // A hit on any polygon of the human's realm, by somebody else. The human's
    // own Plague is visible where they aimed it. Marches are the other half of
    // this rule and answer it differently - see `march-resolved` below.
    appliesToHuman: (e, ctx, localPlayerId = 1) =>
      e.playerId !== localPlayerId &&
      e.targetFactionId !== undefined &&
      ctx.inHumanRealm(e.targetFactionId),
    // Critical exactly when the HOME gate now stands open: any rival in reach
    // can take the human on its next turn, and playing on without knowing
    // that is playing a different game. Post-batch truth is the right read -
    // what matters is the state the player wakes up in.
    critical: (e, ctx) =>
      e.targetFactionId === ctx.humanFactionId && ctx.homeGateOpen()
        ? "Your defenses are broken"
        : null,
    lines: damagedLines,
    footnotes: (_events, ctx) =>
      ctx.homeGateOpen() ? [GATE_OPEN_FOOTNOTE()] : [],
  },
  "march-resolved": {
    kind: "modal",
    // Either end of the arrow, and deliberately NOT gated on `playerId`: a
    // march resolves on its declarer's turn, so the human's own raid landing
    // and the human's own counter winning both arrive under somebody's turn
    // start rather than under a play the human just made. A turn has passed
    // since the card; if this is silent the player never learns how it went.
    //
    // The one exception is an arrival that met nothing: the `subjugated` line
    // it caused names the same card and says what became of the land, so a
    // line here would be the same news twice. The log still carries it - that
    // is the surface where the submission indents under its cause.
    appliesToHuman: (e, ctx) =>
      !metNothing(e) &&
      ((e.targetFactionId !== undefined && ctx.inHumanRealm(e.targetFactionId)) ||
        (e.sourceFactionId !== undefined && ctx.inHumanRealm(e.sourceFactionId))),
    // The `damaged` rule, for the same reason: waking up with the home gate
    // open is a different game, and a march is the one attack that can open it
    // while the player is not being shown a play.
    critical: (e, ctx) =>
      e.targetFactionId === ctx.humanFactionId && ctx.homeGateOpen()
        ? "Your defenses are broken"
        : null,
    lines: marchResolvedLines,
    footnotes: (events, ctx) =>
      ctx.homeGateOpen() &&
      events.some(
        (e) => e.targetFactionId !== undefined && ctx.inHumanRealm(e.targetFactionId),
      )
        ? [GATE_OPEN_FOOTNOTE()]
        : [],
  },
  "march-declared": {
    kind: "silent",
    reason: "the arrow is on the map for a whole turn and the play's own " +
      "line names both ends; a modal for a threat the player can see " +
      "coming and answer is the round summary shouting",
  },
  "march-lapsed": {
    kind: "silent",
    // The ground moved under a march in flight - its source left the realm, or
    // its target joined it - so nothing landed and no score moved. The log
    // carries the line for a player who wants to know why their arrow vanished;
    // a modal for an attack that did nothing is the noise the filter exists to
    // remove.
    reason: "moves no score; the arrow simply goes, and the log says why",
  },
  healed: {
    kind: "silent",
    // The map badge climbs where it lands, and every heal is either the
    // human's own play or a rival mending its own land - neither is done TO
    // the human. A vassal healing toward its gate is watched on the badge.
    reason: "visible on the map badge; never aimed at the human",
  },
  "passive-fired": {
    kind: "silent",
    // A cause, never news on its own: it explains the line under it, and the
    // modal already decides whether THAT is worth raising. Raising the status
    // instead would either double the entry or announce a wild land mending
    // itself on the far side of the map. The reason belongs where the player
    // goes looking for it, which is the log.
    reason: "explains the line it precedes; the caused event decides the modal",
  },
  "disease-spread": {
    kind: "modal",
    appliesToHuman: (e, ctx, localPlayerId = 1) =>
      e.playerId !== localPlayerId &&
      e.targetFactionId !== undefined &&
      ctx.inHumanRealm(e.targetFactionId),
    lines: diseaseLines,
    footnotes: () => [[
      t("Stacks sit harmless until a "), card("plague"),
      t(" cashes them - 100 damage each, all at once."),
    ]],
  },
  "winds-shifted": {
    kind: "modal",
    // Ownership of stacks ON THE HUMAN'S REALM changing hands is the same
    // news as a fresh stack: someone else can now cash them.
    appliesToHuman: (e, ctx, localPlayerId = 1) =>
      e.playerId !== localPlayerId &&
      e.targetFactionId !== undefined &&
      ctx.inHumanRealm(e.targetFactionId),
    lines: windsLines,
  },
  subjugated: {
    kind: "modal",
    appliesToHuman: (e, ctx, localPlayerId = 1) => humanRoleIn(e, ctx, localPlayerId) !== null,
    // Both roles pierce a muted popup. Becoming someone's vassal takes your
    // agency: a forced tribute card enters your deck. A rival poaching a
    // vassal shrinks your realm on a turn you played nothing.
    critical: (e, ctx, localPlayerId = 1) =>
      humanRoleIn(e, ctx, localPlayerId) === "self" ? "You were subjugated" : VASSAL_LOST,
    lines: (events, changes, ctx, localPlayerId = 1) =>
      subjugatedLines(
        events, changes, ctx, humanRoleIn(events[0], ctx, localPlayerId) ?? "self",
      ),
    footnotes: (events, ctx, localPlayerId = 1) => {
      const role = humanRoleIn(events[0], ctx, localPlayerId) ?? "self";
      return role === "self" ? [PAY_TRIBUTE_FOOTNOTE()] : [];
    },
  },
  released: {
    kind: "modal",
    appliesToHuman: (e, ctx, localPlayerId = 1) => humanRoleIn(e, ctx, localPlayerId) !== null,
    // `lord` is what happens to YOUR vassals when their lord is digested -
    // `freeVassalsOf` in game.ts scatters a mid-lord's vassals on
    // incorporation. `self` is the release itself: the tribute cards leave
    // your deck and your own plays unlock again.
    critical: (e, ctx, localPlayerId = 1) =>
      humanRoleIn(e, ctx, localPlayerId) === "self" ? "Your overlord fell" : VASSAL_LOST,
    lines: (events, _changes, ctx, localPlayerId = 1) =>
      releasedLines(events, ctx, humanRoleIn(events[0], ctx, localPlayerId) ?? "self"),
    footnotes: (events, ctx, localPlayerId = 1) => {
      const role = humanRoleIn(events[0], ctx, localPlayerId) ?? "self";
      return role === "self" ? [RELEASE_FOOTNOTE()] : [];
    },
  },
  independence: {
    kind: "modal",
    // Fired from `beginTurn` at the freed vassal's own turn start - a clock
    // tick, not a play, so the human's own freeing carries their playerId
    // and must NOT be swallowed as "their own act": they played nothing.
    // `humanRoleIn` special-cases this type for exactly that reason.
    appliesToHuman: (e, ctx, localPlayerId = 1) =>
      humanRoleIn(e, ctx, localPlayerId) !== null,
    // Both directions of the subjugation critical, run backwards: what the
    // player IS (free again - tribute cards leave the deck), or what they
    // HELD (a vassal walked).
    critical: (e, ctx, localPlayerId = 1) =>
      humanRoleIn(e, ctx, localPlayerId) === "self" ? "You are free" : VASSAL_LOST,
    lines: (events, changes, ctx, localPlayerId = 1) =>
      independenceLines(
        events, changes, ctx, humanRoleIn(events[0], ctx, localPlayerId) ?? "self",
      ),
    footnotes: (events, ctx, localPlayerId = 1) => {
      const role = humanRoleIn(events[0], ctx, localPlayerId) ?? "self";
      return role === "self"
        ? [RELEASE_FOOTNOTE()]
        : [[
            t("A vassal whose home defenses climb back to three quarters "),
            t("frees itself. Keep them beaten down, or let them go."),
          ]];
    },
  },
  incorporated: {
    kind: "silent",
    reason: "human target always co-occurs with defeat; postmortem covers it",
  },
  transferred: {
    kind: "silent",
    reason: "the player moved their own points, and the badges show both ends",
  },
  "harvest-burned": {
    kind: "silent",
    reason: "the player chose it and the deck count shows it; the log carries it",
  },
  tribute: {
    kind: "silent",
    reason: "self-initiated (human pays) or human merely benefits",
  },
  settled: {
    kind: "silent",
    // Income only now: a settlement moves no score, and the dot is already
    // on the map and in the activity log.
    reason: "income only; the map dot and the log already carry it",
  },
  "harvest-earned": {
    kind: "modal",
    // Every seat earns harvests now, and a rival's is its own business: only
    // the local player's bar crossing is news to them.
    appliesToHuman: (e, _ctx, localPlayerId = 1) => e.playerId === localPlayerId,
    // Critical on the deck-changed ground: a card just entered the player's
    // deck, the same reasoning that makes the tribute injection interrupt.
    critical: (e, _ctx, localPlayerId = 1) =>
      (e.playerId === localPlayerId ? "A harvest is ready" : null),
    lines: (events, changes) =>
      events.map((_e, i) => ({
        text: [
          t("Your turnip patch pays off - a "), card("turnip-harvest"),
          t(" is shuffled into your deck"),
        ],
        changes: changesFor(i, changes),
        tone: "good" as const,
      })),
  },
  "duel-won": {
    kind: "modal",
    // The local seat's own spoils and nobody else's. Not gated on
    // `e.playerId !== localPlayerId` the way the damage rules are, for the
    // reason `independence` is not: the player pressed nothing at this moment
    // - the duel retired itself at a round wrap - so this is news to them even
    // though the event carries their own id.
    appliesToHuman: (e, _ctx, localPlayerId = 1) => e.playerId === localPlayerId,
    lines: (events, changes, _ctx) =>
      events.map((e, i) => ({
        text: [
          t("The duel with "), faction(e.sourceFactionId ?? ""),
          t(" is won"),
          ...(e.wealth === undefined
            ? [t(" - the spoils come home")]
            : [t(` - ${e.wealth} wealth comes home`)]),
        ],
        changes: changesFor(i, changes),
        tone: "good" as const,
      })),
    footnotes: () => [[
      t("The whole map takes one turn now, and then a fresh offer comes "),
      t("round."),
    ]],
  },
  // The two un-won endings, in the same shape and the same footer as the win.
  // A duel is a promise the run settles, so every way it settles is news: the
  // player who is told nothing is left to infer that the last fight lapsed
  // from the next offer appearing, which is not a settlement at all.
  "duel-lost": {
    kind: "modal",
    // The local seat's own fight. Not gated on somebody else having acted,
    // for the reason the win is not: the duel retired itself at a round wrap,
    // so this is news even on the player's own id.
    appliesToHuman: (e, _ctx, localPlayerId = 1) => e.playerId === localPlayerId,
    lines: (events, changes) =>
      events.map((e, i) => ({
        text: [
          t("The duel with "), faction(e.sourceFactionId ?? ""),
          t(" is lost - a land of yours changed hands, and there are no "),
          t("spoils"),
        ],
        changes: changesFor(i, changes),
        tone: "bad" as const,
      })),
    footnotes: () => [[
      t("The whole map takes one turn now, and then a fresh offer comes "),
      t("round."),
    ]],
  },
  "duel-lapsed": {
    kind: "modal",
    appliesToHuman: (e, _ctx, localPlayerId = 1) => e.playerId === localPlayerId,
    lines: (events, changes) =>
      events.map((e, i) => ({
        text: [
          t("The duel with "), faction(e.sourceFactionId ?? ""),
          t(" runs out of time - no land changed hands, and there are no "),
          t("spoils"),
        ],
        changes: changesFor(i, changes),
        tone: "neutral" as const,
      })),
    footnotes: () => [[
      t("The whole map takes one turn now, and then a fresh offer comes "),
      t("round."),
    ]],
  },
  "harvest-picked": {
    kind: "silent",
    // The pick is public - the log names the card for every seat, the same
    // decision drafting games make - but it changes nothing on the map, so
    // it is never worth an interruption.
    reason: "the player picked it in the harvest modal; the log carries it",
  },
  victory: { kind: "silent", reason: "postmortem overlay covers it" },
  "played-on": {
    kind: "silent",
    reason:
      "the player clicked it - a modal telling them what they just chose is " +
      "the three-paragraph notice format coming back",
  },
  defeat: { kind: "silent", reason: "postmortem overlay covers it" },
  surrendered: { kind: "silent", reason: "postmortem overlay covers it" },
  // hud.ts renders unification in the activity log and the post-mortem
  // overlay; no modal notice is needed on top of that.
  unified: { kind: "silent", reason: "postmortem overlay covers it" },
};

/** Whether a single event would raise a line in the round summary - the same
 *  test buildRoundSummary applies per-event, exposed so the activity log's
 *  "Targeting me" filter can tag entries without duplicating the registry
 *  lookup. */
export function isNoticeWorthy(e: GameEvent, ctx: NoticeCtx, localPlayerId = 1): boolean {
  const rule = NOTICE_RULES[e.type];
  return rule.kind === "modal" && rule.appliesToHuman(e, ctx, localPlayerId);
}

/** The fields `walkStandings` needs out of a full NoticeCtx. Shared by the
 *  round summary and the activity log so the two cannot walk a batch from
 *  different starting scores and quote different before -> after numbers for
 *  the same event. */
export function walkCtxOf(ctx: NoticeCtx): WalkCtx {
  return {
    factionOf: ctx.factionOf,
    defense: ctx.defense,
    diseaseOf: ctx.diseaseOf,
  };
}

/** Heading for the ordinary once-per-AI-round summary. A critical modal
 *  replaces it with the rule's own title - see NoticeRule.critical. */
export const ROUND_SUMMARY_TITLE = "Opponents' turns";

export interface RoundSummaryOptions {
  /** Keep only events whose rule marks them critical, dropping the rest.
   *  What the player sees when they have muted popups. Note this filters the
   *  GROUPING, not the input - `walkStandings` below still walks the whole
   *  batch, so a surviving line's before -> after numbers are the same ones
   *  it would show unmuted. */
  criticalOnly?: boolean;
}

/** The HUD's entry point: given a batch of fresh log events, walks the WHOLE
 *  batch for scores (the silent events too - see standings.ts), groups the
 *  noticeable ones by event type + cardId + human role, and returns the
 *  round as one summary. Null when the round touched the human in no way
 *  worth interrupting for. */
export function buildRoundSummary(
  events: GameEvent[],
  ctx: NoticeCtx,
  opts: RoundSummaryOptions = {},
  localPlayerId = 1,
): RoundSummary | null {
  const allChanges = walkStandings(events, walkCtxOf(ctx));

  const order: {
    type: GameEventType;
    events: GameEvent[];
    changes: StandingChange[][];
  }[] = [];
  const indexByKey = new Map<string, number>();
  /** The candidate titles by role - see the heading choice at the end: what
   *  you ARE (last, since events arrive in play order), then what you LOST
   *  (first), then what you failed to gain. */
  const selfTitles: CriticalTitle[] = [];
  const lordTitles: CriticalTitle[] = [];
  const actorTitles: CriticalTitle[] = [];
  /** How many critical events in this batch belong to each title family -
   *  counted across event types, since that is the whole point of a family. */
  const familyCounts = new Map<string, number>();
  /** Whether anything in this batch happened on somebody else's turn. False
   *  only for a batch made entirely of the human's own play. */
  let sawOtherRole = false;
  events.forEach((e, i) => {
    const rule = NOTICE_RULES[e.type];
    if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx, localPlayerId)) return;
    const criticalTitle = rule.critical?.(e, ctx, localPlayerId) ?? null;
    if (opts.criticalOnly && criticalTitle === null) return;
    // The role is part of the key: being subjugated and having a different
    // vassal poached are both `subjugated` events, and merging them would
    // describe one with the other's wording.
    const role = noticeRoleOf(e, ctx, localPlayerId);
    if (role !== "actor") sawOtherRole = true;
    if (criticalTitle !== null) {
      const bucket =
        role === "self" ? selfTitles : role === "lord" ? lordTitles : actorTitles;
      bucket.push(criticalTitle);
      if (typeof criticalTitle !== "string") {
        const f = criticalTitle.family;
        familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);
      }
    }
    const key = `${e.type}:${e.cardId ?? ""}:${e.prevented ? "prevented" : ""}:${role}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = order.length;
      indexByKey.set(key, idx);
      order.push({ type: e.type, events: [], changes: [] });
    }
    order[idx].events.push(e);
    order[idx].changes.push(allChanges[i]);
  });

  if (order.length === 0) return null;

  const lines = order.flatMap(({ type, events: groupEvents, changes: groupChanges }) => {
    const rule = NOTICE_RULES[type];
    if (rule.kind !== "modal") return [];
    return rule.lines(groupEvents, groupChanges, ctx, localPlayerId);
  });

  const footnoteSeen = new Set<string>();
  const footnotes: Segment[][] = [];
  for (const { type, events: groupEvents } of order) {
    const rule = NOTICE_RULES[type];
    if (rule.kind !== "modal" || rule.footnotes === undefined) continue;
    for (const fn of rule.footnotes(groupEvents, ctx, localPlayerId)) {
      const key = footnoteKey(fn);
      if (footnoteSeen.has(key)) continue;
      footnoteSeen.add(key);
      footnotes.push(fn);
    }
  }

  // Last `self`, else first `lord`, else first `actor` - see the comment on
  // the three arrays. What you ARE, then what you LOST, then what you failed
  // to gain.
  const chosen: CriticalTitle | undefined =
    selfTitles[selfTitles.length - 1] ?? lordTitles[0] ?? actorTitles[0];
  const title =
    chosen === undefined
      ? null
      : resolveTitle(
          chosen,
          typeof chosen === "string" ? 1 : (familyCounts.get(chosen.family) ?? 1),
        );
  return {
    // ROUND_SUMMARY_TITLE names the opponents' turns, which is what a full
    // summary is - so a batch describing ONLY the human's own turn cannot
    // wear it. See the fizzle modal: it is raised before any rival has
    // moved, and heading it "Opponents' turns" would be plainly false.
    title:
      (opts.criticalOnly || !sawOtherRole) && title !== null
        ? title
        : ROUND_SUMMARY_TITLE,
    lines,
    footnotes,
  };
}
