import type { GameEvent, GameEventType } from "./game";
import { ESCAPE_RESPITE_TURNS } from "./playability";
import { TRIBUTE_CARDS } from "./cards";
import { count, plural } from "./plural";
import {
  card, faction, joinSegments, optionalPhrase, t, theFaction, type Segment,
} from "./rich-text";
import { walkStandings, type StandingChange, type WalkCtx } from "./standings";
import { untilTurn } from "./timed";

/** One notice-worthy event, rendered as one line: the card, who did it, and
 *  the standing it moved. See the rule in AGENTS.md - no second modal, no
 *  three-paragraph notices. */
export interface SummaryLine {
  text: Segment[];
  /** Before -> after for every track this event moved, in the human's signed
   *  view. Empty for events that move nothing (an alliance, a release, a
   *  failed poach). */
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
   *  shrunk-realm subjugation bar. Deduplicated by rendered text and shown as
   *  a footer block, NOT appended to a line: they carry no before/after, and
   *  three vassals lost must not print the same warning three times. */
  footnotes: Segment[][];
}

export interface NoticeCtx {
  humanFactionId: string;
  factionOf(playerId: number): string | undefined;
  /** The human's Might lead over otherFactionId; positive = you lead. */
  leads(otherFactionId: string): number;
  /** The lead an enemy needs over the human to subjugate them (scaled by the
   *  human realm's size and its settlements). No particular rival in mind -
   *  used only where the human's own realm shrinking is the point, not who
   *  threatens them. */
  subjugationGrip(): number;
  /** The lead this rival needs to subjugate the human, or null when the rules
   *  forbid it outright - they already hold the human, or they are somebody's
   *  vassal themselves. The map's danger marker uses the same numbers, so the
   *  two surfaces cannot disagree. */
  subjugationBarAgainstYou(otherFactionId: string): number | null;
  /** Expiry turn of an active alliance between the human and otherFactionId;
   *  undefined when no pact is active. */
  allianceExpiry(otherFactionId: string): number | undefined;
}

/** Every GameEventType must decide: a line in the round summary, or silence
 *  with a written reason. The exhaustive Record makes adding an event type a
 *  compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      /** One call per group (same type + card + prevented + human role).
       *  `changes` is index-parallel to `events`, from a walk over the WHOLE
       *  batch - so a line's numbers are that event's own, not the round's
       *  total. */
      lines(events: GameEvent[], changes: StandingChange[][], ctx: NoticeCtx): SummaryLine[];
      /** What this group contributes to the footer, if anything. */
      footnotes?(events: GameEvent[], ctx: NoticeCtx): Segment[][];
      /** Returns the modal heading when this event must interrupt even though
       *  the player has muted popups (`LogPrefs.showPopups`), or null when it
       *  may be swallowed. Reserve it for changes the player would otherwise
       *  play on without knowing - not for merely important news, or the mute
       *  stops meaning anything. Three kinds qualify, and BOTH directions of
       *  the first two do: a change the player is never told about is no less
       *  disorienting for having been in their favour.
       *
       *  - What the player IS. Subjugation walls off their own plays and forces
       *    tribute into their deck; release takes both back. A muted player
       *    never told either way discovers it by noticing their cards have
       *    stopped working, or that cards they were holding are gone.
       *  - What the player HOLDS. Every vassal lost shrinks the realm, and a
       *    smaller realm lowers the bar the next rival needs to subjugate them -
       *    the number `realmShrunkFootnote` prints. Losing one silently means
       *    playing on against a bar that has moved.
       *  - What the player SPENT. The other two are things done TO them; this
       *    is the one they did themselves, and it is here because a roll that
       *    missed moves NOTHING on the map. A landed Subjugate and a missed one
       *    leave the board in states a muted player cannot tell apart, while
       *    the card and the turn are gone either way. It is the narrowest of
       *    the three: only when the human is the actor, and only when their
       *    play bought nothing at all.
       *
       *  It returns the TITLE rather than a boolean so a rule cannot be marked
       *  critical without saying what happened: a modal that pierced a mute
       *  and then announced itself as "What happened during their turns" would
       *  bury the one thing it exists to say.
       *
       *  A function rather than a constant because one event type can be
       *  critical in different ways by role: `subjugated` fires both when the
       *  player becomes a vassal and when a rival poaches a vassal from them,
       *  which are the two kinds above and take different titles. A round can
       *  hold several critical events at once - see `buildRoundSummary` for
       *  which of their titles becomes the heading, and `CriticalTitle` for
       *  why the heading is a spec rather than a finished string. */
      critical?(e: GameEvent, ctx: NoticeCtx): CriticalTitle | null;
    }
  | { kind: "silent"; reason: string };

/** A critical heading, before the round is counted. A heading that can only
 *  ever describe one thing is a plain string - there is exactly one human, so
 *  "You were subjugated" can never need a plural. A heading describing
 *  something the round can do more than once carries both forms plus a
 *  `family`, and every rule returning the same family is counted TOGETHER:
 *  a round where one vassal is poached and another revolts lost two vassals,
 *  not one of each. `critical` sees a single event and so can never resolve
 *  this itself; `buildRoundSummary` holds the batch and does it there.
 *
 *  This shipped as a plain string and was wrong in both directions at once -
 *  "A vassal was taken" over a poach plus a revolt, and a hardcoded "You lost
 *  your vassals" over a single release. */
export type CriticalTitle =
  | string
  | { family: string; one: string; many: (n: number) => string };

/** A `CriticalTitle` and the round's count for its family, read as one
 *  heading. The single place a title becomes words, so no caller can pick the
 *  singular form by forgetting to count. */
export function resolveTitle(title: CriticalTitle, n: number): string {
  return typeof title === "string" ? title : plural(n, title.one, title.many(n));
}

/** The three ways a vassal leaves you - poached, revolted, released when you
 *  fell - are one heading, because they are one loss to the player and the
 *  line underneath already says which it was. Shared rather than repeated so
 *  the family key cannot be typed differently in one of the three. */
const VASSAL_LOST: CriticalTitle = {
  family: "vassal-lost",
  one: "A vassal was lost",
  many: (n) => `You lost ${count(n, "vassal")}`,
};

/** Which side of an allegiance change the human is on: the faction that
 *  changed hands (`self`), or the overlord that lost it (`lord`). Null when
 *  the event misses the human, or when the human caused it and already knows.
 *
 *  A round can contain both - a rival can subjugate you and poach a different
 *  vassal in the same round - so the role is part of the batch key and is
 *  never inferred from the event type alone. */
export type HumanRole = "self" | "lord";

function humanRoleIn(e: GameEvent, ctx: NoticeCtx): HumanRole | null {
  if (e.playerId === 1) return null;
  if (e.targetFactionId === ctx.humanFactionId) return "self";
  // `subjugate-failed` names the incumbent lord in `formerOverlordFactionId`,
  // the same field `subjugated` uses, so both must read it there. Without this
  // a failed poach of the human's vassal fell through to the "self" role and
  // would be described with the wording meant for an attempt on the human.
  const lostTo =
    e.type === "subjugated" || e.type === "subjugate-failed"
      ? e.formerOverlordFactionId
      : e.overlordFactionId;
  return lostTo === ctx.humanFactionId ? "lord" : null;
}

/** `HumanRole` plus the one case it deliberately refuses to name: `actor`, the
 *  human's own play.
 *
 *  A wrapper and not a widening of `humanRoleIn`, which is load-bearing.
 *  `subjugated`, `released` and `reclaimed` use `humanRoleIn(e, ctx) !== null`
 *  as their ENTIRE `appliesToHuman`, so a `humanRoleIn` that answered for the
 *  human's own actions would pop a modal on their own Subjugate, their own
 *  Revolt and the vassals their own conquest scattered - three regressions,
 *  none of them anywhere near the line that caused them.
 *
 *  Only the three fizzle rules ask for `actor`, and the type is what keeps it
 *  that way: the line builders that must never see one still take `HumanRole`,
 *  so handing them this stops compiling. */
export type NoticeRole = HumanRole | "actor";

function noticeRoleOf(e: GameEvent, ctx: NoticeCtx): NoticeRole {
  // Falls back to "self" exactly as the call sites did when this was written
  // out inline. It is not a membership test: every `appliesToHuman` must still
  // check the human is actually named on the event.
  return e.playerId === 1 ? "actor" : humanRoleIn(e, ctx) ?? "self";
}

/** Every way a vassal leaves the human shrinks the realm, which lowers the
 *  bar rivals need to subjugate the human in turn.
 *
 *  The number is the actor-less grip - what ANYONE needs. A rival whose
 *  ruler carries prowess needs less, and that lower figure is quoted by the
 *  per-rival lines instead (`subjugationBarAgainstYou`), which know who is
 *  asking. */
function realmShrunkFootnote(ctx: NoticeCtx): Segment[] {
  return [
    t(`Your realm is smaller: a lead of ${ctx.subjugationGrip()} over `),
    t("you is now enough to subjugate you."),
  ];
}

/** Their lead over the human meets the bar for THIS rival specifically -
 *  false when the bar is null (they could never subjugate the human this way
 *  round) as well as when the lead falls short. */
function subjugationRisk(ctx: NoticeCtx, otherId: string): boolean {
  const bar = ctx.subjugationBarAgainstYou(otherId);
  if (bar === null) return false;
  return -ctx.leads(otherId) >= bar;
}

/** The tribute cards named in a row - "A and B", "A, B and C" - as segments,
 *  so each stays a card the player can point at. Built from TRIBUTE_CARDS
 *  rather than written out, so the footnotes cannot fall behind the set. */
const tributeCardList = (): Segment[] =>
  joinSegments(TRIBUTE_CARDS.map((id) => [card(id)]));

/** How many cards the two footnotes below are talking about. They used to read
 *  "were ... While either is in hand", which is only English while
 *  TRIBUTE_CARDS holds exactly two - the same assumption `tributeCardList`
 *  was built to avoid. */
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

/** Segment-key for footnote dedup: two "your realm is smaller" lines from two
 *  different lost vassals must collapse to one, so this compares rendered
 *  shape rather than object identity. Cards/factions key by id, not by their
 *  (possibly not-yet-resolved) display name. */
function footnoteKey(segs: Segment[]): string {
  return segs
    .map((s) => {
      if (s.kind === "text") return `t:${s.text}`;
      if (s.kind === "card") return `card:${s.cardId}`;
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

function raidLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      card(e.cardId ?? ""), t(" played against you by "), faction(actorId(e, ctx) ?? ""),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function raidFootnotes(events: GameEvent[], ctx: NoticeCtx): Segment[][] {
  const seen = new Set<string>();
  const out: Segment[][] = [];
  for (const e of events) {
    const id = actorId(e, ctx);
    // The human is never their own danger cue. Unreachable today - the `play`
    // rule branches to a different footnote before it gets here - but this
    // reads `ctx.subjugationBarAgainstYou(id)` below, which has no meaning for
    // the human against themselves, so the guard belongs where the assumption
    // is rather than one level up where it happens to hold.
    if (id === undefined || id === ctx.humanFactionId) continue;
    if (seen.has(id) || !subjugationRisk(ctx, id)) continue;
    seen.add(id);
    const bars = ctx.subjugationBarAgainstYou(id);
    if (bars === null) continue;
    out.push([
      theFaction(id), t(` can subjugate you at a lead of ${bars}.`),
    ]);
  }
  return out;
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
      // is structurally unreachable for a blade that landed - which is the only
      // other way the human's own Assassinate ruler could get here.
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

function allianceLines(
  events: GameEvent[],
  _changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e) => {
    const id = actorId(e, ctx);
    const expiry = id !== undefined ? ctx.allianceExpiry(id) : undefined;
    return {
      text: [
        card("alliance"), t(" sealed with you by "), faction(id ?? ""),
        ...(expiry !== undefined ? [t(`, ${untilTurn(expiry)}`)] : []),
      ],
      changes: [],
      tone: "good" as const,
    };
  });
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
        card("subjugate"), t(" by "), faction(actorId(e, ctx) ?? ""),
        t(" took your vassal "), faction(e.targetFactionId ?? ""),
      ],
      changes: changesFor(i, changes),
      tone: "bad",
    }));
  }
  return events.map((e, i) => ({
    text: [
      card("subjugate"), t(" by "), faction(actorId(e, ctx) ?? ""),
      ...(e.formerOverlordFactionId !== undefined
        ? [t(" - your allegiance shifts from "), faction(e.formerOverlordFactionId), t(" to them")]
        : [t(" - you owe fealty to them")]),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}

function reclaimedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  _ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      card("revolt"), t(" by "), faction(e.targetFactionId ?? ""),
      t(" cast off your overlordship, and they cannot be subjugated again "),
      t(untilTurn(e.turn + ESCAPE_RESPITE_TURNS)),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
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

function unrestLines(events: GameEvent[]): SummaryLine[] {
  return [{
    text: [
      ...joinSegments(events.map((e) => [faction(e.targetFactionId ?? "")])),
      t(` ${plural(events.length, "is", "are")} preparing a revolt against you`),
    ],
    changes: [],
    tone: "bad",
  }];
}

/** The pact that just lapsed, from the human's side: the OTHER ally. Read off
 *  the two ids the event carries rather than off `playerId`, which is only
 *  whose clock tick noticed the expiry and is nobody's doing. */
function otherAllyIn(e: GameEvent, ctx: NoticeCtx): string | undefined {
  const [a, b] = [e.targetFactionId, e.overlordFactionId];
  if (a === ctx.humanFactionId) return b;
  if (b === ctx.humanFactionId) return a;
  return undefined;
}

function pactLapsedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      t("Your pact with "), faction(otherAllyIn(e, ctx) ?? ""),
      t(" has run out"),
    ],
    changes: changesFor(i, changes),
    // Neutral, not bad. The Might it bought is gone, and so is the truce that
    // stopped you reaching for them - which of those matters more is the
    // player's read of the board, not this line's to declare.
    tone: "neutral",
  }));
}

function subjugateFailedLines(events: GameEvent[], _ctx: NoticeCtx, role: NoticeRole): SummaryLine[] {
  if (role === "actor") {
    return events.map((e) => ({
      text: [
        t("Your attempt on "), faction(e.targetFactionId ?? ""), t(" failed"),
        ...optionalPhrase(" - they still owe fealty to ", e.formerOverlordFactionId),
      ],
      changes: [],
      tone: "bad",
    }));
  }
  if (role === "lord") {
    return events.map((e) => ({
      text: [
        faction(e.overlordFactionId ?? ""), t(" failed to take "),
        faction(e.targetFactionId ?? ""), t(" from you"),
      ],
      changes: [],
      tone: "good",
    }));
  }
  return events.map((e) => ({
    text: [
      faction(e.overlordFactionId ?? e.targetFactionId ?? ""), t(" failed to take you"),
      ...optionalPhrase(" from ", e.formerOverlordFactionId),
    ],
    changes: [],
    tone: "good",
  }));
}

function incorporateFailedLines(events: GameEvent[], role: NoticeRole): SummaryLine[] {
  if (role === "actor") {
    return events.map((e) => ({
      text: [
        t("Your attempt to absorb "), faction(e.targetFactionId ?? ""),
        t(" failed - they are still only your vassal"),
      ],
      changes: [],
      tone: "bad",
    }));
  }
  return events.map((e) => ({
    text: [
      faction(e.overlordFactionId ?? ""), t(" failed to absorb your realm permanently"),
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
    // A ternary on actor-ness rather than another `||` on the shared condition,
    // so the two arms cannot leak into each other. The actor arm's entire
    // surface is one card id plus `prevented === true`: a raid you landed, an
    // alliance you sealed and an assassination that struck are all already
    // visible where you aimed them, and none of them belongs in a modal.
    appliesToHuman: (e, ctx) =>
      e.playerId === 1
        ? e.cardId === "assassinate-ruler" && e.prevented === true
        : (e.cardId === "raid" ||
            e.cardId === "assassinate-ruler" ||
            e.cardId === "alliance") &&
          e.targetFactionId === ctx.humanFactionId,
    // Only the actor arm returns a title, so a rival's raid - or a rival's
    // assassination your own bodyguard turned - stays mutable as it always was.
    // Your blade stopped by THEIR guard is the wasted turn: the card is gone,
    // nothing moved, and their guard is quietly gone too.
    //
    // A plain string, not a family: you play one card per turn and
    // `playedThisTurn` enforces it, so a batch can never hold two of your own
    // fizzles. A family that can never count past one is a plural that can
    // never fire.
    critical: (e, ctx) =>
      noticeRoleOf(e, ctx) === "actor" ? "A bodyguard stopped you" : null,
    lines: (events, changes, ctx) => {
      const cardId = events[0].cardId;
      if (cardId === "assassinate-ruler") {
        return assassinateLines(events, changes, ctx, noticeRoleOf(events[0], ctx));
      }
      if (cardId === "alliance") return allianceLines(events, changes, ctx);
      return raidLines(events, changes, ctx);
    },
    // Raid and Assassinate ruler are both hostile plays that move (or tried
    // to move) a lead against the human, so both carry the same danger cue:
    // is this actor now able to subjugate the human? That question is about
    // the actor's CURRENT standing, not this play's own effect, so a
    // prevented Assassinate ruler still asks it.
    footnotes: (events, ctx) => {
      // Except when the human IS the actor, where the cue has no answer. The
      // actor arm carries its own: what the turn actually bought. The guard
      // consumption in playCard is real and is recorded nowhere else in the UI,
      // so without this line the modal would say only that nothing happened.
      if (noticeRoleOf(events[0], ctx) === "actor") {
        return [[
          t("Their bodyguard is spent defending this. A second attempt has "),
          t("nothing left to turn it aside."),
        ]];
      }
      const cardId = events[0].cardId;
      if (cardId === "raid" || cardId === "assassinate-ruler") {
        return raidFootnotes(events, ctx);
      }
      return [];
    },
  },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) !== null,
    // Both roles pierce a muted popup, for the two different reasons in the
    // `critical` doc. Becoming someone's vassal takes your agency: a forced
    // tribute card enters your deck and your own plays are walled off until you
    // break free. A rival poaching a vassal leaves your agency alone but shrinks
    // your realm, which lowers the bar for whoever comes for you next - so it
    // interrupts too, under its own title rather than the alarming one.
    critical: (e, ctx) =>
      humanRoleIn(e, ctx) === "self" ? "You were subjugated" : VASSAL_LOST,
    lines: (events, changes, ctx) =>
      subjugatedLines(events, changes, ctx, humanRoleIn(events[0], ctx) ?? "self"),
    footnotes: (events, ctx) => {
      const role = humanRoleIn(events[0], ctx) ?? "self";
      return role === "self" ? [PAY_TRIBUTE_FOOTNOTE()] : [realmShrunkFootnote(ctx)];
    },
  },
  released: {
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) !== null,
    // Both roles are the mirror of `subjugated`, and both were being swallowed.
    // `lord` is what happens to YOUR vassals when their lord is digested -
    // `freeVassalsOf` in game.ts scatters a mid-lord's vassals on
    // incorporation (falling to a Subjugate keeps the pyramid intact now) -
    // so a muted player was told they owed fealty and never that their realm
    // had emptied. `self` is the release itself: the tribute cards leave your
    // deck, hand and discard and your own plays unlock again, which is
    // exactly the "what you ARE" change that makes subjugation critical, run
    // backwards.
    critical: (e, ctx) =>
      humanRoleIn(e, ctx) === "self" ? "Your overlord fell" : VASSAL_LOST,
    lines: (events, _changes, ctx) =>
      releasedLines(events, ctx, humanRoleIn(events[0], ctx) ?? "self"),
    footnotes: (events, ctx) => {
      const role = humanRoleIn(events[0], ctx) ?? "self";
      return role === "self" ? [RELEASE_FOOTNOTE()] : [];
    },
  },
  incorporated: {
    kind: "silent",
    reason: "human target always co-occurs with defeat; postmortem covers it",
  },
  reclaimed: {
    // Silent only when the human reclaims: they played the card. A vassal
    // walking out on the human is news, and used to pass unannounced.
    kind: "modal",
    appliesToHuman: (e, ctx) => humanRoleIn(e, ctx) === "lord",
    // The other way a vassal leaves you, and it shrinks the realm by exactly as
    // much as a poach does, so it pierces the mute on the same grounds, under
    // the same heading. The title could not name the card anyway: it is plain
    // text, not a Segment, and "Revolt" in plain text is what the naming
    // convention forbids.
    critical: (e, ctx) => (humanRoleIn(e, ctx) === "lord" ? VASSAL_LOST : null),
    lines: reclaimedLines,
    footnotes: (_events, ctx) => [realmShrunkFootnote(ctx)],
  },
  tribute: {
    kind: "silent",
    reason: "self-initiated (human pays) or human merely benefits",
  },
  settled: {
    kind: "silent",
    // A rival settling raises the lead the human needs against it, and a
    // settlement in the human's own realm raises the lead rivals need against
    // them. Neither moves a lead, so neither is an interruption: both numbers
    // are already on the map badge, the hover tooltip and the land panel, and
    // the activity log names the land.
    reason: "changes a bar the map and tooltip already show, never a lead",
  },
  "seat-moved": {
    kind: "silent",
    // The same grounds as `settled`: a seat raises a bar and colours future
    // raids, moves no lead, and the marker it plants is already on the map.
    reason: "changes a bar the map and tooltip already show, never a lead",
  },
  "seat-lost": {
    kind: "modal",
    // Only the owner. A rival's seat falling changes the bar against THEM,
    // which the badge and tooltip already restate - and it always rides along
    // with the subjugation or annexation that caused it, which has its own
    // notice where the human was involved.
    appliesToHuman: (e, ctx) => e.targetFactionId === ctx.humanFactionId,
    // Critical on the HOLDS ground: the seat is a thing the player built and
    // banked, its marker just vanished from the map, and unlike a pact there
    // was no expiry countdown warning them it could end.
    critical: (e, ctx) =>
      e.targetFactionId === ctx.humanFactionId ? "Your seat is lost" : null,
    lines: (events, changes) =>
      events.map((_e, i) => ({
        text: [t("Your ruler's seat is lost")],
        changes: changesFor(i, changes),
        tone: "bad",
      })),
    footnotes: (_events, ctx) => [[
      t(`The seat's bar is gone: a lead of ${ctx.subjugationGrip()} over `),
      t("you is now enough to subjugate you."),
    ]],
  },
  seeded: {
    kind: "modal",
    // Your own vassal sowing is the warning that starts the race: a Revolt is
    // now in their deck and will surface in a few turns. It is the only way to
    // learn this - you cannot see their hand - and it is what turns the
    // Incorporate odds into a decision rather than a readout.
    //
    // Only fires for the human's OWN vassal. The human's own sowing needs no
    // notice, and a rival's is genuinely unobservable - see the log filter in
    // hud.ts, which keeps other factions' sowings off the activity log for the
    // same reason.
    appliesToHuman: (e, ctx) =>
      e.overlordFactionId === ctx.humanFactionId && e.playerId !== 1,
    lines: (events) => unrestLines(events),
    footnotes: () => [[
      t("A "), card("revolt"), t(" is in their deck now. Incorporating them "),
      t("before it surfaces ends the threat for good."),
    ]],
  },
  "hostage-taken": {
    kind: "modal",
    // Only the human's own overlord can take one (targeting requires the
    // vassal bond), so the only role worth a line is the vassal's own: your
    // escape is locked. The human's own taking is their own aimed play, and a
    // rival locking a DIFFERENT vassal's Revolt is not observable news the way
    // the map changing is - the log carries it and nothing more.
    appliesToHuman: (e, ctx) =>
      e.playerId !== 1 && e.targetFactionId === ctx.humanFactionId,
    // Pierces a mute for the same reason subjugation does: what the player's
    // cards do changed. A Revolt they were holding - possibly in hand right
    // now - stopped working, and a muted player never told discovers it by
    // clicking a card that refuses. A plain string: one overlord, one hostage
    // at a time, so a round can never hold two of these for the human.
    critical: () => "A hostage was taken",
    lines: (events, _changes, ctx) =>
      events.map((e) => ({
        text: [
          t("A hostage from your camp is held by "),
          faction(actorId(e, ctx) ?? ""), t(" - "), card("revolt"),
          t(" cannot be played until you pay tribute twice"),
        ],
        changes: [],
        tone: "bad" as const,
      })),
  },
  "hostage-returned": {
    kind: "modal",
    // The lord's side only. The vassal paying its own second tribute is the
    // vassal's own play (the same reasoning that keeps `tribute` silent), and
    // when that vassal is the human the Revolt lighting up in hand plus the
    // log line say it. The lord, though, learns here or not at all: the threat
    // they paid a card to freeze is live again, on a turn they played nothing.
    appliesToHuman: (e, ctx) =>
      e.playerId !== 1 && e.overlordFactionId === ctx.humanFactionId,
    lines: (events, _changes, _ctx) =>
      events.map((e) => ({
        text: [
          t("The hostage from "), faction(e.targetFactionId ?? ""),
          t(" has gone home - their "), card("revolt"),
          t(" can surface again"),
        ],
        changes: [],
        tone: "bad" as const,
      })),
    footnotes: () => [[
      t("Another "), card("take-hostage"),
      t(" would lock it again; incorporating them before it surfaces ends "),
      t("the threat for good."),
    ]],
  },
  "subjugate-failed": {
    kind: "modal",
    // A rival trying and failing is exactly the kind of near-miss the player
    // must see: nothing on the map changed, so without a notice the attempt
    // leaves no trace at all. Three ways it can touch the human - they kept a
    // vassal somebody reached for, they were themselves the prize, or their own
    // poach missed - and the role split picks the wording.
    //
    // That same argument is why the actor arm exists. It does not get weaker
    // when the card spent was yours; it gets stronger, because you also lost
    // the turn.
    appliesToHuman: (e, ctx) =>
      noticeRoleOf(e, ctx) === "actor" ||
      e.formerOverlordFactionId === ctx.humanFactionId ||
      e.targetFactionId === ctx.humanFactionId,
    critical: (e, ctx) =>
      noticeRoleOf(e, ctx) === "actor" ? "Your subjugation failed" : null,
    lines: (events, _changes, ctx) =>
      subjugateFailedLines(events, ctx, noticeRoleOf(events[0], ctx)),
    footnotes: (events, ctx) => {
      const role = noticeRoleOf(events[0], ctx);
      if (role === "actor") {
        return [[
          t("Your card is spent, but the lead that justified it is untouched - "),
          t("the next copy you draw can try again."),
        ]];
      }
      return role === "self"
        ? [[t("Their card is spent. You are still your overlord's vassal, not theirs.")]]
        : [];
    },
  },
  "incorporate-failed": {
    kind: "modal",
    // Two roles. As TARGET: your overlord tried to annex you and the roll
    // missed - one failed roll from the run ending, and nothing on the map
    // records it. As ACTOR: your own roll on your own vassal missed.
    //
    // The second was silent, argued as "the hand and activity log already show
    // the card was spent, and a modal on your own failed gamble is a nag".
    // That mistook a spent turn for a non-event. The hand shows the card is
    // gone and never says why, and a vassal you failed to absorb looks
    // identical to one you never reached for.
    appliesToHuman: (e, ctx) =>
      // The actor arm needs no target check: an Incorporate is aimed at the
      // actor's own vassal by rule, so "the human acted" already places them.
      noticeRoleOf(e, ctx) === "actor" || e.targetFactionId === ctx.humanFactionId,
    critical: (e, ctx) =>
      noticeRoleOf(e, ctx) === "actor" ? "Your annexation failed" : null,
    lines: (events, _changes, ctx) =>
      incorporateFailedLines(events, noticeRoleOf(events[0], ctx)),
    footnotes: (events, ctx) =>
      noticeRoleOf(events[0], ctx) === "actor"
        ? [[
            t("Your card is spent. The vassalage survives and its loyalty clock "),
            t("keeps running, so your next attempt has better odds."),
          ]]
        : [[
            t("Their card is spent. The longer you stay their vassal, the better their "),
            t("next attempt's odds - breaking free resets that clock."),
          ]],
  },
  "pact-lapsed": {
    kind: "modal",
    // Only the human's own pacts. Two rivals' pact ending changes nothing the
    // human can see - the Might it bought was against factions bordering both
    // of THEIR realms, and if the human was one of those the standings line
    // says so by itself.
    appliesToHuman: (e, ctx) => otherAllyIn(e, ctx) !== undefined,
    // Not critical: the expiry turn has been on the card tip, the map badge and
    // the pact's own log line since it was sealed, so a muted player is not
    // being surprised by a number they were never shown. It is still a line,
    // because their Might lead against several factions moved on a turn they
    // played nothing.
    lines: pactLapsedLines,
    footnotes: (events, ctx) => {
      const other = otherAllyIn(events[0], ctx);
      if (other === undefined) return [];
      return [[
        t("Hostile cards between you and "), theFaction(other),
        t(" are legal again, in both directions."),
      ]];
    },
  },
  garrisoned: {
    kind: "silent",
    // A standing per-turn gain, not an event: every realm past the threshold
    // earns it every single turn, so a modal would fire continuously and mean
    // nothing. The player's own is in the activity log and stated as a standing
    // line on the scoreboard; a rival's shows up where it matters, in the Might
    // lead on their threat badge.
    reason: "continuous standing gain; log, scoreboard and badge all carry it",
  },
  "harvest-earned": {
    kind: "modal",
    // Human-only by construction - playCard's injection is gated on the human
    // seat - so the actor check is documentation more than a filter.
    appliesToHuman: (e) => e.playerId === 1,
    // Critical on the HOLDS ground: a card just entered the player's deck,
    // the same reasoning that makes the tribute injection interrupt. It is
    // also what keeps the heading honest - an actor-arm modal that is not
    // critical would fall to the "Opponents' turns" heading on the player's
    // own turn, which is exactly what that heading must never say.
    critical: (e) => (e.playerId === 1 ? "A harvest is ready" : null),
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
  "harvest-traded": {
    kind: "silent",
    reason: "the player picked it in the harvest modal; the log carries it",
  },
  "harvest-might": {
    kind: "silent",
    reason: "the player picked it in the harvest modal; the log carries it",
  },
  "harvest-wealth": {
    kind: "silent",
    reason: "the player picked it in the harvest modal; the log carries it",
  },
  empowered: {
    kind: "silent",
    reason: "the player picked it in the harvest modal; the hand glow shows it",
  },
  victory: { kind: "silent", reason: "postmortem overlay covers it" },
  defeat: { kind: "silent", reason: "postmortem overlay covers it" },
  surrendered: { kind: "silent", reason: "postmortem overlay covers it" },
  // hud.ts renders unification in the activity log and the post-mortem
  // overlay; no modal notice is needed on top of that.
  unified: { kind: "silent", reason: "postmortem overlay covers it" },
  // Worth being precise about, because it is not the same as the rules above
  // it: a modal here would never be seen. This ending sets phase to "defeat"
  // on the same play as the Subjugate that caused it, and hud.update only
  // builds a round summary while the phase is "playing" - so the round that
  // ends the run shows no modal at all, not even the critical `subjugated`
  // one. The postmortem is the whole explanation, which is why its cause line
  // names the lord AND both cards that were missing, and why the incorporated
  // ending has always worked the same way.
  stranded: { kind: "silent", reason: "postmortem overlay covers it" },
};

/** Whether a single event would raise a line in the round summary - the same
 *  test buildRoundSummary applies per-event, exposed so the activity log's
 *  "Targeting me" filter can tag entries without duplicating the registry
 *  lookup. */
export function isNoticeWorthy(e: GameEvent, ctx: NoticeCtx): boolean {
  const rule = NOTICE_RULES[e.type];
  return rule.kind === "modal" && rule.appliesToHuman(e, ctx);
}

/** The three fields `walkStandings` needs out of a full NoticeCtx. Shared by
 *  the round summary and the activity log so the two cannot walk a batch from
 *  different starting leads and quote different before -> after numbers for the
 *  same event. */
export function walkCtxOf(ctx: NoticeCtx): WalkCtx {
  return {
    humanFactionId: ctx.humanFactionId,
    factionOf: ctx.factionOf,
    leads: ctx.leads,
  };
}

/** The HUD's entry point: given a batch of fresh log events, walks the WHOLE
 *  batch for standings (see standings.ts - this needs the silent events too,
 *  not just the notice-worthy ones), groups the noticeable ones by event type
 *  + cardId + human role (so e.g. three Raids against the human in one AI
 *  round become three lines in one modal, ordered by first occurrence), and
 *  returns the round as one summary. Null when the round touched the human in
 *  no way worth interrupting for. */
/** Heading for the ordinary once-per-AI-round summary. A critical modal
 *  replaces it with the rule's own title - see NoticeRule.critical. */
export const ROUND_SUMMARY_TITLE = "Opponents' turns";

export interface RoundSummaryOptions {
  /** Keep only events whose rule marks them critical, dropping the rest.
   *  What the player sees when they have muted popups: the one thing they
   *  must not miss interrupts, and nothing rides along with it. The activity
   *  log still holds the whole round.
   *
   *  Note this filters the GROUPING, not the input - `walkStandings` below
   *  still walks the whole batch, so a surviving line's before -> after
   *  numbers are the same ones it would show unmuted. Filtering the input
   *  array instead would silently count only the events that survived. */
  criticalOnly?: boolean;
}

export function buildRoundSummary(
  events: GameEvent[],
  ctx: NoticeCtx,
  opts: RoundSummaryOptions = {},
): RoundSummary | null {
  const allChanges = walkStandings(events, walkCtxOf(ctx));

  const order: {
    type: GameEventType;
    events: GameEvent[];
    changes: StandingChange[][];
  }[] = [];
  const indexByKey = new Map<string, number>();
  /** The candidate titles by role, and only in criticalOnly mode does the
   *  winner become the modal's heading - a full round summary keeps its own
   *  heading even when a subjugation is one of the lines in it.
   *
   *  A batch is a whole AI round, so several critical events can land in one:
   *  one rival can subjugate your overlord (freeing you) while another
   *  subjugates you, and a third poaches a vassal. What the player needs in the
   *  heading is what they ARE at the end of it, so `self` roles are read to the
   *  LAST one - events arrive in play order, so that is the standing they wake
   *  up in. Only when nothing changed what they are does the heading fall to
   *  what they LOST, and there the FIRST one reads best: the rest are its
   *  equals and are all still listed as lines.
   *
   *  Which of them wins is settled here, but HOW IT READS is not: a title with
   *  a family is resolved against `familyCounts` below, so a round that lost
   *  two vassals cannot be headed by the wording for one. */
  const selfTitles: CriticalTitle[] = [];
  const lordTitles: CriticalTitle[] = [];
  /** What the player FAILED TO GAIN, and last of the three on purpose: a
   *  wasted turn is the only one that changed nothing about the position, so
   *  a round that also took something from them is headed by the taking. */
  const actorTitles: CriticalTitle[] = [];
  /** How many critical events in this batch belong to each title family -
   *  counted across event types, since that is the whole point of a family. */
  const familyCounts = new Map<string, number>();
  /** Whether anything in this batch happened on somebody else's turn. False
   *  only for a batch made entirely of the human's own play - see the heading
   *  choice at the end. */
  let sawOtherRole = false;
  events.forEach((e, i) => {
    const rule = NOTICE_RULES[e.type];
    if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) return;
    const criticalTitle = rule.critical?.(e, ctx) ?? null;
    if (opts.criticalOnly && criticalTitle === null) return;
    // The role is part of the key: being subjugated and having a different
    // vassal poached are both `subjugated` events, and merging them would
    // describe one with the other's wording.
    const role = noticeRoleOf(e, ctx);
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
    return rule.lines(groupEvents, groupChanges, ctx);
  });

  const footnoteSeen = new Set<string>();
  const footnotes: Segment[][] = [];
  for (const { type, events: groupEvents } of order) {
    const rule = NOTICE_RULES[type];
    if (rule.kind !== "modal" || rule.footnotes === undefined) continue;
    for (const fn of rule.footnotes(groupEvents, ctx)) {
      const key = footnoteKey(fn);
      if (footnoteSeen.has(key)) continue;
      footnoteSeen.add(key);
      footnotes.push(fn);
    }
  }

  // Last `self`, else first `lord`, else first `actor` - see the comment on the
  // three arrays. What you ARE, then what you LOST, then what you failed to gain.
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
    // summary is - so a batch describing ONLY the human's own turn cannot wear
    // it. That batch exists now: a fizzle modal is raised while the played card
    // is still in the air and before any rival has moved, and heading it
    // "Opponents' turns" would be plainly false whether or not popups are
    // muted. Hence the second clause, which is about what the batch IS rather
    // than about the mute.
    //
    // `title` cannot be null when `sawOtherRole` is false today: every actor
    // arm is critical. If one is ever added that is not, it needs a heading of
    // its own rather than this fallback.
    title:
      (opts.criticalOnly || !sawOtherRole) && title !== null
        ? title
        : ROUND_SUMMARY_TITLE,
    lines,
    footnotes,
  };
}
