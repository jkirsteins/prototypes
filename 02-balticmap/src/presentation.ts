/** What one event is SHOWN as, on THIS screen, and nothing else: the camera
 *  and the label a land gets, the badge stepping from the score it had to the
 *  score it has, the card flying out of the hand, the arrows a landing takes
 *  off the board and what it leaves on the border to say what got through.
 *
 *  Pure data out - no DOM, no rng, no clock - so the executor only spends
 *  queue steps on what this hands back, and the whole classification is
 *  testable in the default node environment.
 *
 *  `PRESENTATION_RULES` is exhaustive over `GameEventType`, the `NOTICE_RULES`
 *  shape: a new event type does not compile until somebody decides, and a type
 *  that is never presented writes the sentence saying why - which is also
 *  where the reader learns which surface owns that event's moment and its
 *  sound instead.
 *
 *  **A rule returns a LIST.** One event can owe more than one beat: a play is
 *  a card leaving the hand AND, a line later, an arrow on a border; a conquest
 *  is a land changing colour AND a question this screen owes an answer to.
 *  `beats()` returning `[]` is the event-level answer "not for this screen";
 *  `kind: "never"` is the type-level answer with the written sentence.
 *
 *  **Scope: transient presentation only.** What belongs in the permanent
 *  record is `isObservable`, and what deserves a modal is `NOTICE_RULES` /
 *  `isNoticeWorthy`. Those answer different questions and stay where they are.
 *  This table answers "what moves on screen while this move is being shown".
 *
 *  **Every score move is a badge walk.** A score change has exactly one way of
 *  being shown, and this is where it is decided: a `presented` rule that can
 *  move a score returns a `BadgeWalk` for it, and that is the only reason this
 *  table knows about scores at all. A second way - a coloured number floating
 *  off the polygon for the events the camera did not visit - is two answers to
 *  one question, and the answer that gets skipped is the one with the gate. */

import { metNothing, type GameEvent, type GameEventType } from "./game";
import { walkCtxOf, type NoticeCtx } from "./notices";
import { walkStandings, type StandingChange } from "./standings";
import { card, faction, passive, t, type Segment } from "./rich-text";
import { EVENT_SOUNDS, type SoundName } from "./audio-manifest";

/** One badge stepping from the score it HAD to the score it has.
 *
 *  The defense track is one walk per polygon per event, which is what the
 *  badge's number shows. The disease track can be SEVERAL on one polygon in
 *  one beat - a claim on the sickness moves the actor's stacks up and every
 *  other owner's down - so `owner` is what says whose pips each walk is
 *  about. Without it two walks on one polygon are two contradictory numbers
 *  for one badge. Defense belongs to the polygon alone and carries none,
 *  which is `StandingChange`'s own rule, kept. */
export interface BadgeWalk {
  polygon: string;
  track: "defense" | "disease";
  /** disease only: whose stacks. */
  owner?: string;
  before: number;
  after: number;
}

/** The force one resolution leaves on the border, drawn for the length of the
 *  beat and then gone.
 *
 *  Keyed by transition and event rather than by any march, because a clash
 *  retires two arrows and produces a force whose strength is neither side's
 *  and whose direction may be the opposite of either. The key is built from
 *  the ids the landing retired plus the land it leaves, which are allocated
 *  once and never reissued, so it is unique for the run - and it is
 *  namespaced away from the `march:<id>` keys of the arrows still standing,
 *  because this arrow is none of them. */
export interface ResolutionArrow {
  key: string;
  from: string;
  to: string;
  strength: number;
  label: string;
  tone: "ours" | "hostile" | "other";
}

export type Beat =
  | {
      kind: "map";
      polygon: string;
      /** What the label says, or null when this screen is owed no sentence -
       *  see `beatLabels`. A beat with no label is not framed at all: no
       *  camera, no glow and no hold, only the badges walking where they
       *  stand. */
      label: Segment[] | null;
      /** The label held in reserve for exactly one gap: a caused beat whose
       *  news would otherwise ride the badge alone, on a land that carries no
       *  badge at all (annexed, full defense, disease-free -
       *  `renderThreatBadges` draws it nothing). Null whenever `label` is not
       *  null - there is nothing to fall back FROM. `effectiveBeatLabel` is
       *  the one reader, because knowing whether the badge exists is a DOM
       *  fact this module does not have. */
      causedLabel: Segment[] | null;
      sound: SoundName | null;
      badges: BadgeWalk[];
      /** Arrows this beat takes off the board. They exit plain: a fade out
       *  and no label. A departed arrow is not the outcome - see
       *  `ResolutionArrow`. */
      retires: number[];
      /** What the landing left on the border, drawn together so they take
       *  their lanes side by side the way they stood while they were live.
       *  One arrow where one side got through, TWO where neither did, and
       *  none at all for a landing no army caused. */
      resolutions: ResolutionArrow[];
    }
  | {
      kind: "hud";
      motion: "draw" | "play" | "pulse" | "reveal";
      cardId?: string;
      sound: SoundName | null;
    }
  /** A question this screen owes about a land, raised after the commit and
   *  framed on the land it asks about. */
  | { kind: "ask"; polygon: string };

/** How one event is presented. Exhaustive over GameEventType, the
 *  NOTICE_RULES shape: a new event type does not compile until somebody
 *  decides, and a type that is never presented writes the sentence saying
 *  why. */
export type PresentationRule =
  | { kind: "presented"; beats(e: GameEvent, ctx: PresentCtx): Beat[] }
  | { kind: "never"; reason: string };

/** The play or status a consequence answers to - read off the batch's shape,
 *  exactly as `appendEvents` stamps `consequence`: a `play` opens a cause, a
 *  `passive-fired` names one for the line under it, and any other
 *  non-consequence event closes it. */
export interface PresentCause {
  kind: "card" | "passive";
  id: string;
  playerId: number;
}

/** What this SCREEN is, as far as presentation is concerned. Per-screen and
 *  not per-human: `humanSeats` is plural and a guest plays one of them, so
 *  the question here is always "does this screen have business with the
 *  event", never "is a person involved somewhere". */
export interface PresentView {
  /** The seats a person at THIS screen plays. */
  seats: ReadonlySet<number>;
  /** Their full realm - `fullRealmOf`, so a grand-vassal's land counts. */
  realm: ReadonlySet<string>;
  /** The lands this screen has a LINE to right now: the realm, plus every
   *  land at the far end of an arrow or a demand between them and it, either
   *  way round.
   *
   *  A line, not a reach. A wild land mending itself matters while an arrow
   *  of yours is in the air toward it, because it changes what that arrow
   *  will do; the same land mending itself with nothing between you is a log
   *  line. Realm-plus-`attackReach` was the version that walked the camera
   *  around a wide ring of business that was none of the player's. */
  linked: ReadonlySet<string>;
  notice: NoticeCtx;
}

/** Everything a rule may read. The screen's view, plus the two derivations
 *  that belong to the BATCH rather than to any one event and so cannot be
 *  recomputed inside a rule:
 *
 *  - the standings walk, because a before -> after runs backwards from the
 *    post-batch scores and is only meaningful over the whole batch. It is the
 *    same walk the log and the round summary render, so a badge and a log
 *    line cannot quote different numbers for one event;
 *  - the cause, because "what caused this" is the shape of the events ABOVE
 *    it, and a rule is handed one event.
 *
 *  Both are functions of an event rather than arrays because `beats` is
 *  handed the event and not its index. Build one with `presentCtxOf`; nothing
 *  else may, or the walk stops being the log's. */
export interface PresentCtx extends PresentView {
  changes(e: GameEvent): StandingChange[];
  causeOf(e: GameEvent): PresentCause | null;
}

/** The factions the seats at this screen play. */
function screenFactions(ctx: PresentView): Set<string> {
  const out = new Set<string>();
  for (const seat of ctx.seats) {
    const id = ctx.notice.factionOf(seat);
    if (id !== undefined) out.add(id);
  }
  return out;
}

/** This screen owes an answer about the land: one of its own seats took it by
 *  conquest or by a demand coming due, which is the one route that queues a
 *  transfer question (`takeLand`). A land handed over by a status asks
 *  nobody, and neither does a conquest by a seat nobody at this screen sits
 *  in. */
function owesAnswer(e: GameEvent, ctx: PresentCtx): boolean {
  if (e.type !== "subjugated" || e.via === "passive") return false;
  const lord = e.overlordFactionId;
  return lord !== undefined && screenFactions(ctx).has(lord);
}

/** The one audience gate. An event is this screen's business when a seat it
 *  plays did it or stands at either end of it, when it lands on a land the
 *  screen has a line to, or when the screen owes an answer about it.
 *
 *  ONE function, and not one per surface. The camera, the badge, the card in
 *  flight and the arrow are four things the player watches at once, and four
 *  answers to "is this mine to see" is how a surface arrives that shows a land
 *  the player has never heard of while hiding the one they were watching.
 *
 *  "Either end" is read off every faction an event names, not only the land
 *  it happened to: a vassal winning its independence names the lord it left,
 *  and the lord losing it is exactly who has to be told.
 *
 *  **A LINE is asked about the land that will be framed, and nothing else.**
 *  `linked` holds the far end of every arrow standing between this screen and
 *  its realm, so a rival aiming at you puts THEIR land in the set - and a
 *  framed beat is drawn on `targetFactionId` whatever matched. Asked of the
 *  source as well, a raid that rival then made on a third party sent the
 *  camera to a land this screen has no relationship with at all. The realm
 *  arms stay on all four ends, because a land of your own at any end of an
 *  event is your business whichever end it is.
 *
 *  **A seat's own event passes on the seat alone.** An event this screen's
 *  own seat caused is this screen's business exactly as much as one done to
 *  it - a regrowth on your own land at your own turn start earns a beat, the
 *  same as any other move of a score, because a score moves on its badge or
 *  it moves invisibly. A play of your OWN is kept quiet separately, by
 *  `beatLabels`. */
export function involvesLocalSeats(e: GameEvent, ctx: PresentCtx): boolean {
  if (ctx.seats.has(e.playerId)) return true;
  const ends = [
    e.targetFactionId, e.sourceFactionId,
    e.overlordFactionId, e.formerOverlordFactionId,
  ];
  for (const id of ends) {
    if (id !== undefined && ctx.realm.has(id)) return true;
  }
  if (e.targetFactionId !== undefined && ctx.linked.has(e.targetFactionId)) {
    return true;
  }
  return owesAnswer(e, ctx);
}

/** A consequence of a card THIS SCREEN played: the card flew out of the hand
 *  and the click that aimed it landed, so the player watched it happen.
 *
 *  The one thing they did not watch is a NUMBER moving, because a badge is
 *  drawn as though it had always been that. So this suppresses a beat only
 *  when the event moved no score - a settlement founded, an arrow declared -
 *  and never when it did, which is what makes the badge walk the universal
 *  way a score change is shown. */
function causedHere(e: GameEvent, ctx: PresentCtx): boolean {
  const cause = ctx.causeOf(e);
  return cause !== null && cause.kind === "card" && ctx.seats.has(cause.playerId);
}

/** The label a beat shows up front, and the one it holds in reserve - the
 *  second half of `causedHere`.
 *
 *  A consequence of this screen's own card keeps its badge walk and loses
 *  everything else: the camera is already on the land the player aimed at,
 *  the label would name the card still under their cursor, and the hold
 *  behind it is a hand they cannot play out of while being told what they
 *  just did. The number is the whole of the news, and it moves where it
 *  stands - unless there is no badge for it to move on, which is a fact only
 *  the map knows. So a caused beat's sentence is not thrown away: it is kept
 *  as `causedLabel`, for `effectiveBeatLabel` to raise if the badge walk
 *  turns out to have nothing to walk.
 *
 *  One helper and not a flag per rule, because the rules that build a label
 *  are twelve and the question is the same for every one of them. */
function beatLabels(
  e: GameEvent, ctx: PresentCtx, label: Segment[],
): { label: Segment[] | null; causedLabel: Segment[] | null } {
  return causedHere(e, ctx)
    ? { label: null, causedLabel: label }
    : { label, causedLabel: null };
}

/** What a map beat actually shows: its own label, or - only when that label
 *  was withheld for being caused - the one held in reserve, but only again
 *  when `badgeExists` says false. A caused beat with a badge to walk still
 *  shows nothing: the number is the whole of the news there, per
 *  `beatLabels`. `badgeExists` is a DOM fact and the one thing this function
 *  takes as given rather than computes - see the caller in src/main.ts. */
export function effectiveBeatLabel(
  beat: Extract<Beat, { kind: "map" }>, badgeExists: boolean,
): Segment[] | null {
  if (beat.label !== null) return beat.label;
  return badgeExists ? null : beat.causedLabel;
}

/** This event's slice of the batch's walk, as badge walks. A change that
 *  moved nothing is dropped rather than drawn as a number stepping to
 *  itself. */
function badgeWalks(e: GameEvent, ctx: PresentCtx): BadgeWalk[] {
  return ctx.changes(e)
    .filter((c) => c.before !== c.after)
    .map((c) => ({
      polygon: c.polygon,
      track: c.track,
      ...(c.owner === undefined ? {} : { owner: c.owner }),
      before: c.before,
      after: c.after,
    }));
}

/** The shape shared by every rule that frames a land: what the label says and
 *  what it sounds like. The land itself is the one the event names, for every
 *  rule there is - a beat about a land the event does not name would be a
 *  label the log could not be checked against. */
interface MapFrame {
  label(e: GameEvent, cause: PresentCause | null): Segment[];
  /** Absent means `EVENT_SOUNDS[e.type]`. */
  sound?(e: GameEvent, cause: PresentCause | null): SoundName | null;
}

/** One map beat, or none, under the two gates every framed rule shares. Kept
 *  as a function rather than folded into `framed` because a rule can owe a
 *  map beat AND something else - a conquest owes its question beside it. */
function framedBeats(e: GameEvent, ctx: PresentCtx, frame: MapFrame): Beat[] {
  const polygon = e.targetFactionId;
  if (polygon === undefined) return [];
  if (!involvesLocalSeats(e, ctx)) return [];
  const badges = badgeWalks(e, ctx);
  if (badges.length === 0 && causedHere(e, ctx)) return [];
  const cause = ctx.causeOf(e);
  return [{
    kind: "map",
    polygon,
    ...beatLabels(e, ctx, frame.label(e, cause)),
    sound: frame.sound === undefined
      ? EVENT_SOUNDS[e.type]
      : frame.sound(e, cause),
    badges,
    retires: [],
    resolutions: [],
  }];
}

const framed = (frame: MapFrame): PresentationRule => ({
  kind: "presented",
  beats: (e, ctx) => framedBeats(e, ctx, frame),
});

/** A motion in the hand, for the seat holding it. Every other screen sees the
 *  consequences on the map and nothing here: a rival's deck is not on screen
 *  to pulse. */
const handMotion = (
  motion: "draw" | "play" | "pulse" | "reveal",
): PresentationRule => ({
  kind: "presented",
  beats(e, ctx) {
    if (!ctx.seats.has(e.playerId)) return [];
    return [{
      kind: "hud",
      motion,
      ...(e.cardId === undefined ? {} : { cardId: e.cardId }),
      sound: EVENT_SOUNDS[e.type],
    }];
  },
});

/** What a resolution leaves on the border it crossed: what got through out of
 *  what was thrown, with the word so the number is not read as a score.
 *  Neutral ink, no leading sign, no colour - the tone is the arrow's and the
 *  label is arithmetic.
 *
 *  A standoff draws TWO, one each way, because that is what a standoff is:
 *  both armies in the field and neither of them through. It is drawn off the
 *  strengths and not off the ends, which is the trap here - the event's
 *  `targetFactionId` and `sourceFactionId` are the axis's own SORTED ends
 *  when nobody won, so one arrow built from them is aimed by an alphabetic
 *  accident and carries one side's strength as if it were the whole story.
 *  What is not sorted is the pair of numbers: `incoming` is always the
 *  strength thrown at the target and `counter` what the target threw back, so
 *  each arrow is drawn with its own, and neither is called the winner. The
 *  alternative is a border with nothing on it while a label talks about a
 *  fight that happened there. */
function resolutionsOf(e: GameEvent, ctx: PresentCtx): ResolutionArrow[] {
  const target = e.targetFactionId;
  const source = e.sourceFactionId;
  const ids = e.marchIds;
  // `incoming` rides on every `march-resolved` an army caused, and an event
  // without one is a demand coming due - which throws no strength and draws
  // no arrow.
  if (target === undefined || source === undefined) return [];
  if (e.incoming === undefined || ids === undefined || ids.length === 0) {
    return [];
  }
  const arrow = (
    from: string, to: string, strength: number, through: number,
  ): ResolutionArrow => ({
    // The land it leaves is part of the key: a standoff draws two arrows off
    // one event, and they retired the same pair of ids between them.
    key: `resolution:${e.turn}:${ids.join("-")}:${from}`,
    from,
    to,
    strength,
    label: `${through}/${strength} DMG`,
    tone: ctx.realm.has(from)
      ? "ours"
      : ctx.realm.has(to)
        ? "hostile"
        : "other",
  });
  if (e.amount === undefined) {
    // Nothing moved a score, so nothing got through: both arrows are drawn
    // spent, each at the strength its own side threw. `counter` rides only
    // alongside a contested landing, and an arrival that met nothing never
    // reaches here - its beat is the subjugation it caused.
    if (e.counter === undefined) return [];
    return [
      arrow(source, target, e.incoming, 0),
      arrow(target, source, e.counter, 0),
    ];
  }
  // Winner at loser, which the engine already decided: it names the land
  // that gave ground as the target, so a counter that won points BACK down
  // the border the attack came along.
  return [arrow(source, target, e.incoming, e.amount)];
}

export const PRESENTATION_RULES: Record<GameEventType, PresentationRule> = {
  draw: handMotion("draw"),
  // Your own play flies its card. A rival's play earns nothing here: it is
  // the cause line over its consequences, and those get the beats - a play
  // with none moved nothing the camera could frame.
  play: handMotion("play"),
  reshuffle: handMotion("pulse"),
  discard: {
    kind: "never",
    reason: "the hand is its surface, not the map; cued beside the piles",
  },
  subjugated: {
    kind: "presented",
    beats(e, ctx) {
      const beats = framedBeats(e, ctx, {
        label: (ev) => {
          if (ev.overlordFactionId === undefined) {
            return [t("The land changes hands")];
          }
          const lord = faction(ev.overlordFactionId);
          switch (ev.via) {
            case "claim":
              return [t("The demand is met - this land now answers to "), lord];
            case "conquest":
              return [t("Taken - this land now answers to "), lord];
            default:
              return [t("The land falls to "), lord];
          }
        },
      });
      // The question follows the picture of the thing it asks about, and it
      // is owed whether or not the land earned a beat of its own: a conquest
      // this screen made is a conquest this screen must answer for.
      if (owesAnswer(e, ctx) && e.targetFactionId !== undefined) {
        beats.push({ kind: "ask", polygon: e.targetFactionId });
      }
      return beats;
    },
  },
  released: framed({
    label: () => [t("Freed - this land answers to nobody now")],
  }),
  incorporated: framed({
    label: () => [t("Annexed - its people fold into their lord's realm")],
  }),
  independence: framed({
    label: () => [t("The lord's grip slips - independent again")],
  }),
  tribute: {
    kind: "never",
    reason: "routine coins every round; the log carries the amount, and your " +
      "own tribute cues its sound beside the hand",
  },
  settled: framed({
    label: () => [t("A new settlement founded")],
  }),
  healed: framed({
    label: (_e, cause) => {
      if (cause?.kind === "passive") {
        return [passive(cause.id), t(" - the land grows its defenses back")];
      }
      if (cause?.kind === "card") {
        return [card(cause.id), t(" - defenses restored")];
      }
      return [t("Defenses restored")];
    },
    // The regrowth nobody ordered sounds like ground, not like repair work.
    sound: (_e, cause) =>
      cause?.kind === "passive" && cause.id === "wild-lands" ? "rustle" : "hammer",
  }),
  transferred: framed({
    label: (e) =>
      e.sourceFactionId === undefined
        ? [t("Defenders arrive")]
        : [t("Defenders arrive from "), faction(e.sourceFactionId)],
  }),
  "disease-spread": framed({
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - sickness seeded here")]
        : [t("Sickness seeded here")],
  }),
  plagued: framed({
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - the sickness takes its toll")]
        : [t("The sickness takes its toll")],
  }),
  "winds-shifted": framed({
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - the sickness changes hands")]
        : [t("The sickness changes hands")],
  }),
  "passive-fired": {
    kind: "never",
    reason: "it explains the line under it; that line carries the camera and " +
      "the sound, and two beats for one moment would say two things happened",
  },
  "march-declared": framed({
    label: (e) =>
      e.cardId === undefined
        ? [t("An army marches on this land")]
        : [card(e.cardId), t(" - an army marches on this land")],
    // `EVENT_SOUNDS` is silent here because the seat that declared the march
    // watched its own card fly and heard that. This beat is only ever built
    // for a screen that did NOT declare it - a declaration of this screen's
    // own is suppressed by `causedHere`, having moved no score - and on that
    // screen no card flew, so an arrow arriving on the border in silence is
    // the rival's attack the player is never told about.
    sound: () => "march",
  }),
  "march-resolved": {
    kind: "presented",
    beats(e, ctx) {
      const polygon = e.targetFactionId;
      if (polygon === undefined) return [];
      if (!involvesLocalSeats(e, ctx)) return [];
      // `metNothing` is left out for the reason `NOTICE_RULES` leaves it out
      // of the modal: an arrival that found nothing to fight is answered by
      // the `subjugated` it caused, which names the same card and says what
      // became of the land. Two beats would be one arrival shown twice, and
      // the camera would visit the same polygon twice in a row to do it. The
      // arrow it spent still leaves the board, at the commit behind this.
      if (metNothing(e)) return [];
      const name = e.cardId === undefined ? [t("The army")] : [card(e.cardId)];
      // A standoff is the one landing with a `counter` and no `amount`: both
      // sides spent and nothing got through. Asked as "no amount" alone this
      // also caught the arrival that met nothing, and called an army walking
      // into an empty land a raid that had been answered.
      const label = e.amount === undefined
        ? [...name, t(" was answered in the field")]
        : [...name, t(" lands here")];
      return [{
        kind: "map",
        polygon,
        ...beatLabels(e, ctx, label),
        sound: EVENT_SOUNDS[e.type],
        badges: badgeWalks(e, ctx),
        // The arrows this landing spent, taken off the board while the beat
        // that explains them is on screen rather than at the repaint behind
        // it. They exit plain: the outcome is the resolution arrows' to say.
        retires: e.marchIds ?? [],
        resolutions: resolutionsOf(e, ctx),
      }];
    },
  },
  "march-lapsed": {
    kind: "never",
    reason: "nothing arrived and no score moved; the log explains the " +
      "vanished arrow, and the arrow itself leaves at the commit",
  },
  "harvest-earned": {
    kind: "never",
    reason: "the turnip bar is its surface; cued beside the hand when it is " +
      "your own",
  },
  "harvest-picked": handMotion("reveal"),
  "harvest-burned": {
    kind: "never",
    reason: "a pile getting thinner has no land to frame; cued beside the hand",
  },
  victory: {
    kind: "never",
    reason: "the ending owns the whole screen; its jingle cues where the " +
      "ending is raised, which is the transition that ended the run rather " +
      "than any beat inside it",
  },
  "played-on": {
    kind: "never",
    reason: "the player clicked it - there is no land to fly to and nothing " +
      "they have not just been shown; the run simply carries on",
  },
  defeat: {
    kind: "never",
    reason: "the ending owns the whole screen; its jingle cues where the " +
      "ending is raised, which is the transition that ended the run rather " +
      "than any beat inside it",
  },
  unified: {
    kind: "never",
    reason: "the ending owns the whole screen; its jingle cues where the " +
      "ending is raised, which is the transition that ended the run rather " +
      "than any beat inside it",
  },
  surrendered: {
    kind: "never",
    reason: "the ending owns the whole screen; its jingle cues where the " +
      "ending is raised, which is the transition that ended the run rather " +
      "than any beat inside it",
  },
};

/** The context a batch is classified under: the screen's view plus the two
 *  per-batch derivations a rule cannot make for itself.
 *
 *  `events` must be the WHOLE batch a transition appended, in order.
 *  Consequences resolve their cause from the events above them, and a
 *  before -> after runs backwards from the scores the batch left behind, so
 *  half a batch produces wrong numbers rather than fewer of them. */
export function presentCtxOf(events: GameEvent[], view: PresentView): PresentCtx {
  const walked = walkStandings(events, walkCtxOf(view.notice));
  const changes = new Map<GameEvent, StandingChange[]>();
  events.forEach((e, i) => {
    changes.set(e, walked[i] ?? []);
  });

  // Two causes with two lifetimes, both read off the batch's shape. A play's
  // cause covers every `consequence: true` event under it - the indentation
  // rule. A passive's covers exactly the ONE line under it, the way the log
  // renders a `passive-fired` as the explanation of what follows.
  const causes = new Map<GameEvent, PresentCause | null>();
  let playCause: PresentCause | null = null;
  let passiveCause: PresentCause | null = null;
  for (const e of events) {
    if (e.type === "play" && e.cardId !== undefined) {
      playCause = { kind: "card", id: e.cardId, playerId: e.playerId };
      passiveCause = null;
    } else if (e.type === "passive-fired" && e.passiveId !== undefined) {
      passiveCause = { kind: "passive", id: e.passiveId, playerId: e.playerId };
    }
    causes.set(
      e,
      e.type === "play" || e.type === "passive-fired"
        ? null
        : passiveCause ?? (e.consequence === true ? playCause : null),
    );
    if (e.type !== "play" && e.type !== "passive-fired") {
      passiveCause = null;
      if (e.consequence !== true) playCause = null;
    }
  }

  return {
    ...view,
    changes: (e) => changes.get(e) ?? [],
    causeOf: (e) => causes.get(e) ?? null,
  };
}

/** The beats a transition's events earn, in order: every beat of the first
 *  event before every beat of the second, and a rule's own list in the order
 *  it returned it - a map beat before the question it raises.
 *
 *  Flat rather than partitioned by kind, because the partition belongs to
 *  whoever runs them: the lifecycle plays the map and hud beats at its first
 *  stage and the questions at its third, and a classifier that pre-sorted
 *  them would be stating the lifecycle's order twice. */
export function presentEvents(events: GameEvent[], ctx: PresentCtx): Beat[] {
  const beats: Beat[] = [];
  for (const e of events) {
    const rule = PRESENTATION_RULES[e.type];
    if (rule.kind !== "presented") continue;
    beats.push(...rule.beats(e, ctx));
  }
  return beats;
}
