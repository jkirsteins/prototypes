import { CARDS, guardAgainst, KEYWORDS, repeatGroupOf } from "./cards";
import {
  metNothing, turnOpen, viewOf, winSizeFor,
  type GameEvent, type GameState,
} from "./game";
import { animations, flyCard, runAnimation, type Flight } from "./animate";
import { fullRealmOf, incorporatedRealmOf } from "./relations";
import {
  buildRoundSummary, isNoticeWorthy, walkCtxOf,
  type NoticeCtx, type RoundSummary,
} from "./notices";
import {
  defenseMaxOf, defenseOf, diseaseOn, subjugationGateOpen,
} from "./defense";
import { walkStandings, type StandingChange } from "./standings";
import {
  handLimitFor, MAX_HAND, miasmaHeld, MIN_HAND, omensHeld, turnipThresholdOn,
  wealthIncomeFor, wealthOf,
  type RulesView,
} from "./playability";
import { abilitiesOf, LEADER_ABILITIES } from "./abilities";
import { milestonePoints, milestoneStandings } from "./milestones";
import { count } from "./plural";
import { TERMS } from "./glossary";
import {
  multipliedWord, type TargetExplanation,
} from "./target-explanations";
import { fillTooltipLines, type TooltipLine } from "./panel";
import { memoryStorage, type MetaStorage } from "./meta";
import { formatElapsed } from "./run-clock";
import { standingChangeText, standingsFor } from "./view";
import { hasRuler, rulerNameOf } from "./rulers";
import {
  card, cardName, cardTextSegments, faction, factionIds, keywordBlock,
  passive, possessive, priceSegments, renderSegments, t, theFaction, verb,
  type RichTextHooks, type Segment, type Speaker, type Verb,
} from "./rich-text";
import type { BuildOption } from "./harvest";
import { EVENT_SOUNDS, type SoundName } from "./audio-manifest";
import { PRESENTATION_RULES, type Beat } from "./presentation";

export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  /** Concede the run. Absent in contexts with no seat to concede (tests). */
  onSurrender?(): void;
  /** Decline a won ending and hold out for the whole map. Absent where nobody
   *  may take it - a guest's screen, and tests - and the button then never
   *  renders, the same gating `onSurrender` uses. */
  onKeepPlaying?(): void;
  /** How long this run has been played, for the line under the result. A
   *  callback and not a field on the state: wall-clock has no business in the
   *  reducer or on the wire, and src/run-clock.ts says why at length. Absent
   *  where nothing is timing (tests), and the line then does not render. */
  elapsedMs?(): number;
  /** Optional gate for cards that need a valid target; default: playable. */
  canPlayCard?(cardId: string): boolean;
  targetExplanations?(cardId: string): TargetExplanation[];
  /** How this card can come back with nothing, or null when the rules can
   *  never refuse it. Target-independent: what a *particular* aim risks rides
   *  on `TargetExplanation.risk` instead. */
  cardRisk?(cardId: string): string | null;
  /** Lines describing modifiers currently affecting this card, shown at the
   *  top of its hover tip. */
  cardModifiers?(cardId: string): string[];
  /** Why this card cannot be played this turn, or null when it can. Shown at
   *  the very top of its hover tip, above the modifiers - it is the reason the
   *  card is greyed out, so it is the first thing the player came to read. */
  cardBlocked?(cardId: string): string | null;
  isDiscardMode?(): boolean;
  /** Close an unlimited-rules turn. Absent where no such turn exists
   *  (standard rules, tests): the button then never renders. */
  onEndTurn?(): void;
  /** True while a committed action is still resolving - a card in flight or
   *  the AI chain behind it. The unlimited hand stays open between plays, so
   *  `playedThisTurn` alone no longer covers the flight window. */
  isResolving?(): boolean;
  /** Renders the main-menu Reset progress control when provided. */
  onResetProgress?(): void;
  /** Renders the main-menu Regions button when provided; the click opens
   *  the Regions page. */
  onOpenRegions?(): void;
  /** The era line shown under the menu title when provided - the active
   *  region's own, so the menu says which map is about to load. */
  regionSubtitle?(): string;
  /** Lights this faction's realm on the map, exactly as hovering its land
   *  does; null clears. Absent where there is no map (tests), in which case
   *  a hovered faction name in prose is inert. */
  onHighlightFaction?(factionId: string | null): void;
  /** The shared, coordinate-driven map tooltip - used to explain a card or
   *  name a faction hovered inline in prose (the log, the round summary,
   *  the scoreboard). Absent where there is no map. */
  onShowTip?(lines: TooltipLine[], clientX: number, clientY: number): void;
  onHideTip?(): void;
  /** The player id of the seat this screen belongs to. Absent means 1
   *  (seat 0), which is every solo game and the host. The guest's
   *  screen passes its own seat's player id so "You", the secrecy
   *  rules, the log filters and the standings all pivot on the right
   *  seat. A callback, not a constant: the guest learns its seat from
   *  the start snapshot, after createHud has run. */
  localPlayerId?(): number;
  /** The display name of the human behind this faction, or null. Drawn
   *  beside the faction in the scoreboard. Plain text, not a segment -
   *  the rich-text rule covers card and faction names only. */
  playerNameOf?(factionId: string): string | null;
  /** Plays one sound now, if the player's ears are on. Absent in tests and
   *  anywhere else without an audio engine; every call site is optional. */
  cue?(name: SoundName): void;
  /** The "Sound" checkbox beside the log filters: current state and the
   *  toggle. Both present or both absent - the checkbox renders only when
   *  `onToggleSound` exists. */
  soundMuted?(): boolean;
  onToggleSound?(muted: boolean): void;
}

export interface Hud {
  /** `animate: false` renders the state as already-settled: no card flies, no
   *  line flashes, and the batch is dropped rather than folded into the round's
   *  news. It exists for the first paint of a state the player did not play
   *  into - a `?turns=` boot - where the whole log is "fresh" by definition,
   *  and the ordinary path would fly a card per human event at once and then
   *  drop a round-summary modal over the board a second after load, unasked.
   *  Every later update animates normally, because `renderedEvents` has caught
   *  up by then.
   *
   *  An update NEVER raises a modal of its own. The round summary is
   *  `raiseRoundSummary` and the postmortem is `showPostmortem`, both called by
   *  the transition that caused them - a repaint happens several times per move
   *  and cannot say which of them the player is owed an interruption for. */
  update(state: GameState, opts?: { animate?: boolean }): void;
  /** Raises the one modal that speaks for everything folded in since the last
   *  one, and answers whether anything went up. `onDismiss` fires when the
   *  player closes it, and only then - it is the caller's stage releasing, so
   *  nothing resolves behind the modal.
   *
   *  Every `update` FOLDS its batch in; this is what SHOWS it. The two are
   *  separate because a round arrives as several moves - one per acting seat -
   *  and the player is owed one modal for the round rather than one per seat.
   *  See `roundEvents`. */
  raiseRoundSummary(onDismiss: () => void): boolean;
  /** Takes down a modal raised about a world that no longer exists, and
   *  forgets everything folded in for the next one. For history arriving
   *  whole: a snapshot exchanges the board, and news about the board it
   *  replaced is a modal the player can neither check nor act on. */
  dropRoundNews(): void;
  /** Throws away every flight this HUD has in the air or queued behind one,
   *  empties the animation queue under them, and releases whoever was waiting
   *  on the play to land. The same errand as `dropRoundNews`, one layer down:
   *  a card flown into a board that no longer exists is owed nothing, and a
   *  waiter still holding for it holds the transition it belongs to open for
   *  good.
   *
   *  It is one call and not three because the queue and the count of plays
   *  waiting on it are halves of one fact, and only this module holds the
   *  count. Clearing the queue alone drops a play step that had not started
   *  while the count goes on remembering it, and `afterPlayAnimation` is then
   *  a callback that never fires: no card can be played, no turn ended, and
   *  nothing on screen says why. The phase check inside `update` is no safety
   *  net for it - a world arriving whole is usually still "playing". */
  dropFlights(): void;
  /** One `hud` beat of a transition's presentation: a motion that belongs to
   *  the hand and the piles rather than to the map. Each takes a step on the
   *  animation queue, so a card never flies over a land being framed.
   *
   *  The beat carries its own sound, from the one table that says what an
   *  event sounds like, and the motion cues it inside its step. A duration is
   *  never handed over: what the caller waits on is the queue draining. */
  runHudBeat(beat: Extract<Beat, { kind: "hud" }>): void;
  /** Draws the run's ending and puts it on screen. Asked for explicitly rather
   *  than derived from `state.phase` inside `update`, so an ending rises when
   *  the move that ended the run has finished being shown - not on whichever
   *  repaint first notices the phase, which is a repaint with beats, questions
   *  and a summary still to come, and a board behind "View the map" that still
   *  has marches standing on it. */
  showPostmortem(state: GameState): void;
  /** The standings walk and the notice context for one batch of events.
   *
   *  Exists so the surface that PRESENTS a batch - the transition's present
   *  stage, which runs before the commit this batch will be logged by - can
   *  read its numbers off the same walk, through the same context, that the
   *  log renders its `(Defense -1 -> 5)` suffixes from. `queueBeats` threads
   *  `changes` straight into `presentCtxOf`, so the two are not merely two
   *  calls that happen to agree - they are one walk read twice. Two separate
   *  walks over the same batch would still agree, since `walkStandings` is
   *  pure, but a second call is a second computation for a number this one
   *  has already produced. */
  noticeWalk(state: GameState, events: GameEvent[]): {
    changes: StandingChange[][];
    ctx: NoticeCtx | null;
  };
  /** `prompt` overrides the "Choose a target for X" line. Raid is aimed
   *  twice - the land the army leaves from, then the land it is sent at - and
   *  a first click labelled "target" would send the player at the enemy. */
  setArmed(index: number | null, cardName?: string, prompt?: string): void;
  /** Runs `fn` once the play flight started by the most recent `update()` has
   *  landed. Fires exactly once, always:
   *   - nothing in the air (a forced discard animates nothing, and an AI
   *     action never animates) -> next macrotask, so the caller cannot
   *     re-enter the click handler whose `renderHand` just replaced the
   *     button it came from;
   *   - a flight is in the air -> when it reports itself finished;
   *   - a flight is cancelled (a new game, the run ending) -> immediately.
   *  The HUD holds no duration of its own: it counts live flights and waits
   *  for each one to report itself done, plus a last-resort watchdog derived
   *  from the flight's own `totalMs`, per the rule in AGENTS.md.
   *
   *  The card's flight and NOTHING else. Whether the round may resolve, and
   *  what the player has read, are the transition lifecycle's questions -
   *  this one is only "has the card landed", which is what stage 4 asks
   *  before raising a modal that would otherwise cover it. Waiters queue, so
   *  two callers both get their answer. */
  afterPlayAnimation(fn: () => void): void;
  /** Dims the activity log to the lines that name this faction; null clears.
   *  The mirror of `HudCallbacks.onHighlightFaction`, which lights the map from
   *  a name in prose: one hover, two views of it, and the caller sets both. */
  highlightFaction(factionId: string | null): void;
  /** Names the faction whose highlight is pinned in the status bar; null when
   *  nothing is pinned. The pin is the map's state, not the HUD's - this only
   *  says so, and says how to clear it, since a held highlight with nothing
   *  explaining it reads as the game being stuck. */
  setPinned(factionId: string | null): void;
  /** The pinned land's own tooltip, held still down the left; null hides it.
   *  The lines are the ones the floating tip would have shown - main.ts owns
   *  what a land says about itself - but rendered through the HUD's rich-text
   *  hooks, so a faction or a status named in them is a node with its own tip
   *  and its own map highlight. That is the whole point of pinning: a tip that
   *  follows the cursor cannot be pointed at. */
  setPinnedLand(lines: TooltipLine[] | null): void;
  /** Where the pinned land panel ends, in client pixels, or null while none is
   *  up. The floating tip parks at the same edge and needs somewhere to start
   *  that is not on top of it. */
  pinnedLandBottom(): number | null;
  /** Renders "Waiting for <faction>..." in the status bar while a remote
   *  seat holds the turn; null clears it. The faction is a segment, which
   *  is also where the player's name comes from: `renderSegments` appends
   *  "(Bela)" beside every faction it draws that a human is playing, so
   *  this takes no name of its own. Passing one is how the line came to
   *  read "Waiting for Curonians (Bela) (Bela)...". */
  setWaiting(factionId: string | null): void;
  /** The Turnip harvest offer modal: up to three rolled cards, keep one or
   *  skip. Dumb render - the roll, its caching and what a pick means live in
   *  main.ts. `onCancel` fires on the Cancel button and Escape; the modal
   *  stays up until `hideHarvestUi` or another show call replaces it. Skip
   *  is its own button, distinct from Cancel: skipping commits the play and
   *  keeps nothing, cancelling backs out of playing the card at all. */
  /** The harvest's three ways to spend it. `buildCards` is what the "take a
   *  card from your build" option opens onto - the seat's own build, and
   *  nothing else - each row PRICED, including the rows the seat cannot pay
   *  for yet. Those render greyed rather than absent: see `buildListing`. */
  showHarvestOffer(
    offer: { buildCards: BuildOption[]; heldCards: string[] },
    hooks: {
      onGrowth(): void;
      onBuild(cardId: string): void;
      onRandom(): void;
      onDestroy(cardId: string): void;
      onSkip(): void;
      onCancel(): void;
    },
  ): void;
  /** Closes the harvest overlay. Safe when none is up. */
  hideHarvestUi(): void;
  /** Shows each card a harvest just put in the deck, one at a time: it fades
   *  in over the board with a line saying what it is, holds, then flies into
   *  the deck pile. `onDone` fires once, after the last one lands - callers
   *  wait on it rather than on a duration of their own. */
  revealGainedCards(cardIds: string[], onDone?: () => void): void;
  /** Asks how much defense to send from the land a conquest was made with
   *  into the land taken. `max` is already clamped by the rules - what the
   *  origin holds and what the destination has room for - so the slider can
   *  offer everything it shows. */
  showTransferOffer(
    offer: {
      from: string; to: string; max: number;
      /** What each land holds now, and its ceiling: the modal states where
       *  BOTH ends finish, because moving defenders is a trade and a slider
       *  that showed only the amount asked the player to do the arithmetic. */
      fromHas: number; toHas: number; toMax: number; fromMax: number;
    },
    hooks: { onConfirm(amount: number): void },
  ): void;
}

const FAN_ANGLE_DEG = 5;
const FAN_DROP_PX = 6;

const CARD_W = 88; // matches .card in style.css
const CARD_H = 126;
const DRAW_MS = 350;
const PLAY_TO_CENTER_MS = 350;
const PLAY_HOLD_MS = 700;
const PLAY_TO_DISCARD_MS = 350;
const PLAY_CENTER_SCALE = 1.6;
const RESHUFFLE_PULSE_MS = 450;
// Last-resort net for afterPlayAnimation, in case a flight's onDone is lost
// outright. Derived from each live flight's own totalMs, never a duration
// copied by hand - see the rule in AGENTS.md.
const FLIGHT_WATCHDOG_SLACK_MS = 500;

/** Activity-log display preferences: neither affects the rules, only what
 *  the player is shown, so they persist independently of game/meta save
 *  data - but through the SAME storage abstraction meta.ts already defined
 *  (MetaStorage / memoryStorage), rather than reaching for `localStorage`
 *  directly a second time. main.ts passes its own already-probed storage
 *  (real localStorage where available, an in-memory stand-in otherwise -
 *  private browsing, disabled storage, or a test with no browser storage at
 *  all); createHud defaults to a private memoryStorage() so a caller that
 *  does not care about persistence (tests) never touches real storage. */
export interface LogPrefs {
  /** Show only entries that would have raised a round-summary line. */
  targetingMe: boolean;
  /** Whether the round summary modal interrupts play at all. */
  showPopups: boolean;
}

/** Exported so a `?popups=off` boot can seed the pref into its own memory
 *  storage before `createHud` reads it - the param sets the toggle the player
 *  can set themselves rather than adding a second, hidden way to mute the
 *  summary. */
export const LOG_PREFS_KEY = "balticmap-log-prefs-v1";
const DEFAULT_LOG_PREFS: LogPrefs = { targetingMe: false, showPopups: true };

function loadLogPrefs(storage: MetaStorage): LogPrefs {
  try {
    const raw = storage.getItem(LOG_PREFS_KEY);
    if (raw === null) return { ...DEFAULT_LOG_PREFS };
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as Partial<LogPrefs>;
    return {
      targetingMe:
        typeof rec.targetingMe === "boolean"
          ? rec.targetingMe : DEFAULT_LOG_PREFS.targetingMe,
      showPopups:
        typeof rec.showPopups === "boolean"
          ? rec.showPopups : DEFAULT_LOG_PREFS.showPopups,
    };
  } catch {
    return { ...DEFAULT_LOG_PREFS };
  }
}

function saveLogPrefs(storage: MetaStorage, prefs: LogPrefs): void {
  try {
    storage.setItem(LOG_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable or full: the toggle still works for the session,
    // it just does not survive a reload - same tradeoff meta.ts accepts.
  }
}

/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4. */
function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}

/** Who is speaking in a log line. A player's faction never changes, so it is
 *  safe to resolve from state; the ruler's name is not, so it comes off the
 *  event, where it was stamped when the event happened. Ruler names stay
 *  plain text - there is no hover target for a person. */
function actorOf(e: GameEvent, state: GameState, localPlayerId: number): Speaker {
  if (e.playerId === localPlayerId) return { segments: [t("You")], person: "second" };
  const factionId = state.players.find((pl) => pl.id === e.playerId)?.factionId;
  const segments =
    factionId === undefined
      ? [t("")]
      : e.actorRuler === undefined || e.actorRuler === ""
        ? [faction(factionId)]
        : [t(`${e.actorRuler} of `), theFaction(factionId)];
  return { segments, person: "third" };
}

/** A faction named as the subject of its own line, rather than as the player
 *  who acted. Always third person - these lines never say "You", they say the
 *  people's name even when those people are the player's, which is the
 *  allegiance-line convention `Person` documents. */
const named = (factionId: string | undefined): Speaker =>
  ({ segments: [faction(factionId ?? "")], person: "third" });

/** Subject, agreeing verb, then the rest of the sentence. Every line in
 *  `eventSegments` is built through this, including the ones whose subject can
 *  never be "You": one path means the next line added cannot pick a form by
 *  hand, which is how "You fails to prise" got in. */
const clause = (
  subject: Speaker,
  lemma: Verb,
  rest: Segment[],
  tense: "present" | "past" = "present",
): Segment[] => [...subject.segments, t(" "), verb(subject.person, lemma, tense), ...rest];

/** Assassinate ruler is the only card that changes who rules, so it is the
 *  only line that names rulers on the target side. */
function rulerSuffix(e: GameEvent): string | null {
  if (e.cardId !== "assassinate-ruler" || e.targetRuler === undefined) return null;
  return e.prevented
    ? ` - prevented, ${e.targetRuler} survives`
    : e.successorRuler === undefined
      ? null
      : ` - ${e.targetRuler} killed, ${e.successorRuler} succeeds`;
}

/** Whether this event is a play the log hides the card of: a secret card (see
 *  `CardDef.secret` in src/cards.ts) played by somebody who is not you. You see
 *  what you played - the same asymmetry the `draw` line carries.
 *
 *  One predicate, because `eventSegments` (which hides) and `revealedSecrets`
 *  (which un-hides) answering it separately is exactly how the first browser
 *  pass ended up flashing "You played Bodyguard" as a reveal: the reveal walk
 *  counted the player's own guard as a secret, so spending it rewrote and
 *  flashed a line the player had never been shown a hidden version of. */
function hidesItsCard(e: GameEvent, localPlayerId: number): boolean {
  return (
    e.type === "play" && e.playerId !== localPlayerId &&
    e.cardId !== undefined && CARDS[e.cardId]?.secret === true
  );
}

/** One log/postmortem line as segments. Exported (not just used by
 *  createHud) so tests/naming-convention.test.ts can drive every event type
 *  through it directly.
 *
 *  `reveal` names a secret card (see `CardDef.secret` in src/cards.ts) that
 *  would otherwise be hidden. Two callers pass it: the postmortem, where the run
 *  is over and there is nothing left to protect, and `renderLog` for a play
 *  whose secret `revealedSecrets` says has since become public. */
export function eventSegments(
  e: GameEvent,
  state: GameState,
  reveal = false,
  localPlayerId = 1,
): Segment[] {
  const you = e.playerId === localPlayerId;
  const actor = actorOf(e, state, localPlayerId);
  const humanFactionId =
    state.players.find((pl) => pl.id === localPlayerId)?.factionId;
  const actorFactionId =
    state.players.find((pl) => pl.id === e.playerId)?.factionId;
  switch (e.type) {
    case "draw":
      // Content differs, not agreement: you see WHICH card you drew and they
      // do not. That is a different sentence, so it branches - the verb is the
      // same either way and comes from the same place.
      return clause(actor, "draw", you ? [t(" "), card(e.cardId ?? "")] : [t(" a card")], "past");
    case "play": {
      // A secret play hides the WHOLE of the rest of the sentence - the card,
      // its target and its suffix all describe the card, and a target alone
      // would often name it by elimination.
      //
      // Plain text, deliberately, and not a violation of the naming rule in
      // CLAUDE.md: that rule makes a NAME a node the player can point at, and
      // there is no name here to point at. Nothing in "a secret card" can fall
      // behind a rename in src/cards.ts.
      if (!reveal && hidesItsCard(e, localPlayerId)) {
        return clause(actor, "play", [t(" a secret card")], "past");
      }
      // rulerSuffix takes precedence over the readings marker: safe only
      // because assassinate-ruler (the only card rulerSuffix fires for) is
      // not an attack card (src/cards.ts). A prevented play resolved
      // nothing, so it can carry no other mark.
      const marks = e.prevented
        ? ["prevented"]
        : e.readings
          ? [multipliedWord(2 ** e.readings)]
          : [];
      const suffix =
        rulerSuffix(e) ?? (marks.length > 0 ? ` - ${marks.join(", ")}` : "");
      // "on you", not "on Beta": the target is a name to look up everywhere
      // else, but the human already knows which faction they are.
      const targetedYou = !you && e.targetFactionId !== undefined
        && e.targetFactionId === humanFactionId;
      // "out of X", the same words the landing says a turn later, so a
      // declaration and the `march-resolved` it becomes read as one arrow
      // rather than two unrelated lines about the same land. Only a march
      // carries a source, so its presence IS the question and no card is
      // named here.
      //
      // Unless it would print the sentence's own subject twice. A third-person
      // line opens with the faction's name, so an army out of that faction's
      // home reads "Semigallians played Raid out of Semigallians" - and a
      // restless raid is ALWAYS out of the land that declared it, so every one
      // of them read that way. Your own line opens with "You", a different
      // word, so it keeps the tail and always says which land the army left.
      const source = !you && e.sourceFactionId === actorFactionId
        ? undefined
        : e.sourceFactionId;
      return clause(actor, "play", [
        t(" "), card(e.cardId ?? ""),
        ...(source !== undefined
          ? [t(" out of "), faction(source)]
          : []),
        ...(targetedYou
          ? [t(" on you")]
          : e.targetFactionId !== undefined
            ? [t(" on "), faction(e.targetFactionId)]
            : []),
        t(suffix),
      ], "past");
    }
    case "reshuffle":
      return clause(actor, "reshuffle", [
        t(" "), possessive(actor.person), t(" discard"),
      ], "past");
    case "subjugated":
      return clause(named(e.targetFactionId), "submit", [
        t(" to "), faction(e.overlordFactionId ?? ""),
      ]);
    case "released":
      return clause(named(e.targetFactionId), "break", [t(" free")]);
    case "incorporated":
      return [
        faction(e.targetFactionId ?? ""), t(" is incorporated into "),
        faction(e.overlordFactionId ?? ""),
      ];
    case "discard":
      return clause(actor, "discard", [t(" a card")], "past");
    case "independence":
      // The gate, not a play: the vassal's home defenses recovered and the
      // clock noticed at its own turn start. Third-person by name even for
      // the player, like `subjugated` - it happened to them.
      return clause(named(e.targetFactionId), "reclaim", [
        t(" independence from "), faction(e.overlordFactionId ?? ""),
      ]);
    case "tribute":
      return clause(named(e.targetFactionId), "pay", [
        t(" tribute to "), faction(e.overlordFactionId ?? ""),
      ]);
    case "settled":
      return clause(named(e.targetFactionId), "found", [t(" a new settlement")]);
    case "passive-fired":
      // "Status", the word the land hover's own heading uses - one word for
      // one thing. The name is a node and the rule waits on its hover, the
      // card pattern exactly, so the line that says a status acted is also the
      // line that says what the status does.
      return [
        t("The "), passive(e.passiveId ?? ""), t(" status triggers on "),
        faction(e.targetFactionId ?? ""),
      ];
    case "healed":
      return [t("The defenses of "), faction(e.targetFactionId ?? ""), t(" are restored")];
    case "transferred":
      return [
        t("Defenders march from "), faction(e.sourceFactionId ?? ""),
        t(" into "), faction(e.targetFactionId ?? ""),
      ];
    case "disease-spread":
      return [t("Disease takes root in "), faction(e.targetFactionId ?? "")];
    case "plagued":
      // The card as a segment, not the word as text: the capitalized "Plague"
      // is the card, and the naming-convention sweep holds this line to that.
      return [card("plague"), t(" ravages "), faction(e.targetFactionId ?? "")];
    case "winds-shifted":
      return [
        t("The disease on "), faction(e.targetFactionId ?? ""),
        t(" changes hands"),
      ];
    case "march-declared":
      // Same "out of X" shape the play line above prints for its own arrow,
      // so a declaration and the play that caused it read as one arrow named
      // twice rather than two unrelated lines about the same land.
      return [
        card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
        t(" sets out for "), faction(e.targetFactionId ?? ""),
      ];
    case "march-resolved":
      // Invariant subject like `damaged`, and for a stronger reason: this line
      // does not nest under a play, so it has to name both ends of the arrow
      // itself. `sourceFactionId` is the land the winning army came out of,
      // which on a won counter is the land that was being attacked - so the
      // sentence stays true whichever way the clash went. The numbers ride in
      // the impactText suffix as always.
      //
      // "reaches", not "falls on": this one met nobody and broke nothing, and
      // the line under it says what became of the land.
      if (metNothing(e)) {
        return [
          card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
          t(" reaches "), faction(e.targetFactionId ?? ""),
        ];
      }
      if (e.counter === undefined) {
        return [
          card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
          t(" falls on "), faction(e.targetFactionId ?? ""),
        ];
      }
      // A standoff moves no score, so it carries no `amount` - and neither
      // end is the loser, so the line names them as equals rather than
      // picking one to have been struck.
      if (e.amount === undefined) {
        return [
          card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
          t(" and the counter from "), faction(e.targetFactionId ?? ""),
          t(" cancel each other"),
        ];
      }
      return [
        card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
        t(" breaks through against "), faction(e.targetFactionId ?? ""),
      ];
    case "march-lapsed":
      return [
        card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
        t(" against "), faction(e.targetFactionId ?? ""), t(" comes to nothing"),
      ];
    case "harvest-earned":
      // The bar crossing. "a" reads oddly against a plural-looking name, but
      // the card is one card, and the article is what says a COPY arrived.
      return clause(actor, "earn", [t(" a "), card("turnip-harvest")], "past");
    case "harvest-burned":
      // `possessive` and not a literal "their": the actor may be "You", and
      // "You burned Fortify from their deck" is the exact class of mistake
      // src/rich-text.ts exists to stop.
      return clause(actor, "burn", [
        t(" "), card(e.cardId ?? ""), t(" from "),
        possessive(actor.person), t(" deck"),
      ], "past");
    case "harvest-picked":
      // Public by decision - see NOTICE_RULES["harvest-picked"]: the pick is
      // drafting, and every seat's log says what every seat kept. The card
      // that comes WITH a harvest is not a keep, and saying "kept" for both
      // read as the player having chosen twice.
      return e.bonus === true
        ? [...actor.segments, t(" also found "), card(e.cardId ?? ""), t(" in the harvest")]
        : clause(actor, "keep", [
            t(" "), card(e.cardId ?? ""), t(" from the harvest"),
          ], "past");
    case "surrendered":
      return clause(actor, "concede", [t(" the Baltic")], "past");
    case "victory":
      // `e.playOn` and never `state.playingOn`: the flag on the state
      // describes the run as it stands, so reading it here would go back and
      // relabel the FIRST victory - honestly won at half the map - as a
      // whole-map conquest, on the strength of a decision taken after it.
      return clause(
        actor, "rule", [t(e.playOn === true ? " every Baltic land" : " the Baltic")],
      );
    case "played-on":
      // No new verb: the player played ON, which is the existing lemma doing
      // the work the adverb needs.
      return clause(actor, "play", [t(" on for the whole map")]);
    case "defeat":
      return [t("Your realm has been incorporated by "), faction(e.overlordFactionId ?? "")];
    case "unified":
      return clause(named(e.overlordFactionId), "unify", [t(" the Balts")]);
  }
}

/** Indices into `state.log` of the secret plays whose card the player can now
 *  see. Everything else stays "a secret card".
 *
 *  The reveal registry: one clause per way a secret stops being one. Secrecy
 *  buys a rival the fact that you cannot tell which of them is guarded. It does
 *  not buy them a card that was visibly spent in front of you staying hidden
 *  afterwards - your blade turning on nothing tells you what they were holding
 *  whatever the log says, and a log that then kept insisting on "a secret card"
 *  would be the one thing lying to you.
 *
 *  There is exactly one clause: a `play` that came back `prevented` spent the
 *  guard of `targetFactionId`, revealing that faction's most recent
 *  not-yet-revealed play OF THE GUARD THAT STOPPED IT - `guardAgainst(cardId)`
 *  in src/cards.ts.
 *
 *  Matching on the card and not merely on the faction is load-bearing, because
 *  a faction may hold all three guards at once. A rival holding a Bodyguard and
 *  an Eloping heirs, whose Bodyguard is then spent, would otherwise have
 *  whichever they played LAST revealed - naming the wrong card on the wrong
 *  line, and giving away the guard they are still holding.
 *
 *  "Most recent not-yet-revealed of that card" is exact within a card:
 *  `cardBlockReason` in src/playability.ts refuses a second copy of any guard
 *  while the first is unspent, so a faction never has two of one kind in flight.
 *
 *  Derived from the log rather than stored on GameState, and living beside
 *  `isObservable` for the same reason: what the player has seen is a fact about
 *  the player, not about the board. The rules do not change. */
export function revealedSecrets(state: GameState, localPlayerId = 1): Set<number> {
  const out = new Set<number>();
  /** `${factionId}|${cardId}` -> the log indices of that faction's hidden plays
   *  of that card still unrevealed, oldest first. An array rather than a single
   *  index so that a future stacking secret degrades to "the newest one"
   *  instead of silently overwriting. */
  const pending = new Map<string, number[]>();
  const key = (factionId: string, cardId: string): string =>
    `${factionId}|${cardId}`;
  state.log.forEach((e, i) => {
    if (e.type !== "play") return;
    // `hidesItsCard`, not "is a secret card": only a play the log actually hid
    // has anything to reveal. Your own guard is on screen by name from the
    // moment you post it, and spending it must not rewrite or flash that line.
    if (hidesItsCard(e, localPlayerId)) {
      const factionId = state.players.find((pl) => pl.id === e.playerId)?.factionId;
      if (factionId === undefined || e.cardId === undefined) return;
      const k = key(factionId, e.cardId);
      pending.set(k, [...(pending.get(k) ?? []), i]);
      return;
    }
    if (e.prevented !== true || e.targetFactionId === undefined) return;
    const guard = e.cardId === undefined ? undefined : guardAgainst(e.cardId);
    if (guard === undefined) return;
    const revealed = pending.get(key(e.targetFactionId, guard))?.pop();
    if (revealed !== undefined) out.add(revealed);
  });
  return out;
}

/** What one log line's event actually did, as a suffix in parentheses:
 *  `standingChangeText`'s one format - `(Defense -150 -> 450)`,
 *  `(Disease +1 -> 3)` - the same convention as the map badges and the round
 *  summary. Null where there is no number to show - a card that moves no
 *  score, a prevented assassination.
 *
 *  The tone is about the POLYGON the line names, not the human: its defenses
 *  falling is red on its line whoever benefits, which is also the only honest
 *  answer a suffix can give without knowing whose realm the polygon sits in.
 *
 *  Not a Segment: it names no card and no faction (see the rule in
 *  AGENTS.md), and keeping it out of `eventSegments` is what lets the
 *  postmortem log render the same lines without a batch to walk.
 *
 *  `changes` is one event's slice of `walkStandings`. */
export function impactText(
  e: GameEvent,
  changes: StandingChange[],
): { text: string; tone: "good" | "bad" | "even" } | null {
  return eventImpact(e) ?? changeImpact(changes);
}

/** The two suffixes that come off the EVENT rather than off the walk, because
 *  neither number is a walked score: a tribute's coins, and the leadership a
 *  war council puts on the ruler. */
function eventImpact(
  e: GameEvent,
): { text: string; tone: "good" | "bad" | "even" } | null {
  // The tribute's coins moved no score, so the walk has no line for them and
  // the amount comes off the event. Coins leaving a vassal are the neutral
  // cost of the card.
  if (e.type === "tribute" && e.wealth !== undefined) {
    return { text: `${e.wealth} wealth`, tone: "even" };
  }
  // War council: leadership is not a walked score - it lives on the ruler -
  // so the play line quotes its own amount, the tribute pattern.
  if (e.type === "play" && e.cardId === "war-council" && e.amount !== undefined) {
    return { text: `Leadership +${e.amount}`, tone: "good" };
  }
  return null;
}

/** The walked half of a suffix, over one event's slice of `walkStandings`.
 *
 *  Split out because a presentation beat carries the walk and not the event it
 *  came from: the label beside a badge walk quotes this, and the log line for
 *  the same event quotes `impactText`, so the two cannot state different
 *  numbers for one move. */
export function changeImpact(
  changes: StandingChange[],
): { text: string; tone: "good" | "bad" | "even" } | null {
  if (changes.length === 0) return null;
  const net = changes.reduce((sum, c) => sum + (c.after - c.before), 0);
  const tone =
    changes[0].track === "defense"
      ? net > 0 ? "good" : net < 0 ? "bad" : "even"
      // Disease climbing on a polygon is always pressure on it.
      : net > 0 ? "bad" : net < 0 ? "good" : "even";
  return {
    text: changes.map(standingChangeText).join(", "),
    tone,
  };
}

/** The status bar's leader tooltip: name, a stats block, then each ability
 *  explained. The stats are amount rows alone - no term texts, because the
 *  ability's own line already says what leadership does for THIS ruler, and
 *  quoting the term beside it said the same rule twice. The term texts stay
 *  a hover away on the land panel's Leader block. */
function rulerTipLines(
  name: string, view: RulesView, factionId: string,
): TooltipLine[] {
  const lines: TooltipLine[] = [{ text: name }];
  lines.push({
    text: TERMS.leadership.name,
    amount: String(view.leadership[factionId] ?? 0),
    blockStart: true,
  });
  const omens = omensHeld(view, factionId);
  if (omens > 0) {
    lines.push({ text: TERMS.omens.name, amount: String(omens) });
  }
  const miasma = miasmaHeld(view, factionId);
  if (miasma > 0) {
    lines.push({ text: TERMS.miasma.name, amount: String(miasma) });
  }
  for (const id of abilitiesOf(view.leaderAbilities, factionId)) {
    const def = LEADER_ABILITIES[id];
    if (def === undefined) continue;
    lines.push({ text: def.name, blockStart: true });
    lines.push({ text: def.text });
  }
  return lines;
}

export function createHud(
  container: HTMLElement,
  cb: HudCallbacks,
  factionNames: Map<string, string> = new Map(),
  placeNameFactionIds: Set<string> = new Set(),
  logStorage: MetaStorage = memoryStorage(),
): Hud {
  // The one read for "who is the local player" - see HudCallbacks.localPlayerId.
  // Absent means seat 0 (player id 1), every solo game and the host.
  const localPlayerId = (): number => cb.localPlayerId?.() ?? 1;
  /** The local player's own PlayerState - the seat-0 lookup every one of
   *  these call sites used to do directly. Undefined only when the state
   *  has no players yet. */
  const humanPlayer = (state: GameState) =>
    state.players.find((pl) => pl.id === localPlayerId());
  /** Whether the seat on turn is the one this screen plays. The engine's
   *  own `isHumanTurn` answers "is it seat 0", which is the host's seat -
   *  true, and the wrong answer, on every screen but the host's. The hand,
   *  the End turn button and the status line all pivot on this, so a guest
   *  asking the engine's question could not play on its own turn and could
   *  click on the host's. Identical to `state.current === 0` wherever
   *  `localPlayerId` is left at its default. */
  const isLocalTurn = (state: GameState): boolean =>
    state.phase === "playing" &&
    state.players[state.current]?.id === localPlayerId();

  const factionName = (id: string | undefined): string =>
    (id !== undefined ? factionNames.get(id) : undefined) ?? id ?? "";

  const richTextHooks: RichTextHooks = {
    factionName,
    isPlaceName: (id) => placeNameFactionIds.has(id),
    showTip: cb.onShowTip,
    hideTip: cb.onHideTip,
    highlightFaction: cb.onHighlightFaction,
    // Every faction name the HUD renders carries who is playing it, from this
    // one wiring - see RichTextHooks.playerNameOf. Absent outside a network
    // game, so nothing but a multiplayer run renders any differently.
    playerNameOf: (id) => cb.playerNameOf?.(id) ?? null,
  };

  /** The same hooks for anything rendered inside the pinned panel, with the
   *  tip redirected to the box beneath it. Only the destination differs, so a
   *  name explains itself identically wherever it is read. */
  const pinnedHooks: RichTextHooks = {
    ...richTextHooks,
    showTip(lines) {
      fillTooltipLines(pinnedTip, lines);
      pinnedTip.classList.remove("hidden");
    },
    hideTip() {
      pinnedTip.classList.add("hidden");
    },
  };

  /** Whether the player could actually know this happened.
   *
   *  Almost every event is a public fact about the map - who submitted to whom,
   *  who founded a settlement - so the default is true. Sowing a revolt is the
   *  exception: it moves a card inside one faction's deck and nobody outside
   *  can see it. The player learns of it only for their own vassals, which is
   *  exactly the warning the Incorporate race is built on.
   *
   *  Without this the log would announce every faction's private preparations
   *  across the whole map. */
  function isObservable(e: GameEvent, _humanFactionId: string | undefined): boolean {
    // A draw happens for every seat, every turn, without exception - it is
    // never news, only noise, so it never reaches the log regardless of whose
    // turn it was. Everything else in this roster is a public fact about the
    // map, harvest picks included (a public draft - see NOTICE_RULES).
    //
    // A declaration says nothing the play line above it did not already say -
    // both ends of the arrow, in the same words - and for a restless raid it
    // would say more, reprinting the source that the `play` case deliberately
    // drops. The event stays in `state.log` for the presentation pipeline to
    // read; only its line in the ACTIVITY log is suppressed, by this
    // function's one caller, `renderLog`. The postmortem log filters
    // separately (`e.type !== "draw"` alone, where the postmortem is built)
    // and deliberately prints it - a finished run owes the player everything
    // that happened, declarations included.
    return e.type !== "draw" && e.type !== "march-declared";
  }

  /** What you played or discarded, and the events your own play caused. Never
   *  hidden by the "Targeting me" filter: a filter that removes the line you
   *  just made is a filter that lies about your own turn.
   *
   *  The deck reshuffle and the independence gate are excluded. You did not
   *  choose either - independence is the clock noticing your defenses
   *  recovered - and they are exactly the noise the filters exist to
   *  remove. */
  function isYourDoing(e: GameEvent): boolean {
    return e.playerId === localPlayerId() &&
      e.type !== "reshuffle" && e.type !== "independence";
  }

  function involvesHuman(e: GameEvent, humanFactionId: string | undefined): boolean {
    if (humanFactionId === undefined) return false;
    return (
      e.playerId === localPlayerId() ||
      e.targetFactionId === humanFactionId ||
      e.overlordFactionId === humanFactionId
    );
  }

  const menu = document.createElement("div");
  menu.className = "menu-overlay";
  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Petty Kingdoms";
  menu.appendChild(title);
  if (cb.regionSubtitle) {
    const subtitle = document.createElement("p");
    subtitle.className = "menu-subtitle";
    subtitle.textContent = cb.regionSubtitle();
    menu.appendChild(subtitle);
  }
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "menu-new-game";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => cb.onNewGame());
  menu.appendChild(newGameBtn);

  // Disarming the reset confirm lives on both buttons below, so it is
  // declared once here rather than duplicated - or omitted - into whichever
  // callback happens to be present.
  let disarmReset = () => {};

  if (cb.onOpenRegions) {
    const regions = document.createElement("button");
    regions.className = "menu-regions";
    regions.textContent = "Regions";
    regions.addEventListener("click", () => {
      disarmReset();
      cb.onOpenRegions!();
    });
    menu.appendChild(regions);
  }

  if (cb.onResetProgress) {
    const reset = document.createElement("button");
    reset.className = "menu-reset";
    reset.textContent = "Reset progress";
    let armedReset = false;
    disarmReset = () => {
      armedReset = false;
      reset.textContent = "Reset progress";
      reset.classList.remove("confirm");
    };
    reset.addEventListener("click", () => {
      if (!armedReset) {
        armedReset = true;
        reset.textContent = "Really reset?";
        reset.classList.add("confirm");
        return;
      }
      disarmReset();
      cb.onResetProgress!();
    });
    newGameBtn.addEventListener("click", disarmReset);
    menu.appendChild(reset);
  }

  const postmortem = document.createElement("div");
  postmortem.className = "postmortem-overlay hidden";
  const pmSummary = document.createElement("div");
  pmSummary.className = "pm-summary";
  const pmTitle = document.createElement("h1");
  pmTitle.className = "menu-title pm-title";
  const pmCause = document.createElement("p");
  pmCause.className = "pm-cause";
  /** How long the run took, its own element rather than a clause on the cause
   *  line: the cause says how the run ended and this says how long it ran, and
   *  a test asserting one has no business reading the other. */
  const pmElapsed = document.createElement("p");
  pmElapsed.className = "pm-elapsed";
  const pmDeltas = document.createElement("p");
  pmDeltas.className = "pm-deltas";
  const pmBuildup = document.createElement("div");
  pmBuildup.className = "pm-buildup";
  /** Declines the ending and holds out for the whole map. No two-click
   *  confirm, unlike Surrender: that one is armed twice because it is
   *  terminal, and this is the opposite - it is how a player refuses to be
   *  finished, and the run it resumes can still be won or lost the ordinary
   *  ways. */
  const pmKeepPlaying = document.createElement("button");
  pmKeepPlaying.className = "pm-keep-playing";
  pmKeepPlaying.textContent = "Keep playing";
  pmKeepPlaying.addEventListener("click", () => cb.onKeepPlaying?.());
  const pmNewGame = document.createElement("button");
  pmNewGame.className = "menu-new-game";
  pmNewGame.textContent = "New game";
  pmNewGame.addEventListener("click", () => cb.onNewGame());
  /** Stands the overlay aside so the finished map can be read. Nothing is
   *  playable behind it - the phase is over and every control is already
   *  hidden by phase - so this is a curtain and not a mode. */
  const pmViewMap = document.createElement("button");
  pmViewMap.className = "pm-view-map";
  pmViewMap.textContent = "View the map";
  pmViewMap.addEventListener("click", () => setPostmortemAside(true));
  pmSummary.append(
    pmTitle, pmCause, pmElapsed, pmDeltas, pmBuildup,
    pmKeepPlaying, pmViewMap, pmNewGame,
  );
  const pmLog = document.createElement("div");
  pmLog.className = "pm-log";
  postmortem.append(pmSummary, pmLog);
  /** The way back, which lives outside the overlay because the overlay is what
   *  it brings back. Hidden with the overlay and shown in its place. */
  const pmReturn = document.createElement("button");
  pmReturn.className = "pm-return hidden";
  pmReturn.textContent = "Back to the result";
  pmReturn.addEventListener("click", () => setPostmortemAside(false));

  function setPostmortemAside(aside: boolean): void {
    postmortem.classList.toggle("aside", aside);
    pmReturn.classList.toggle("hidden", !aside);
  }

  // Top-right scoreboard: who is closest to ending the run, and where you sit.
  const scoreboard = document.createElement("div");
  scoreboard.className = "scoreboard hidden";

  // The pinned land, down the left. What the floating tooltip says about a
  // land, held still so it can be READ - and, because it holds still, pointed
  // at: the faction and status names in it are nodes with their own tips,
  // which a tip chasing the cursor could never be.
  const pinnedPanel = document.createElement("div");
  // `tooltip` first: the pinned panel IS the hover tip, parked in the left
  // column instead of floating, and `pinned-panel` undoes only the floating.
  pinnedPanel.className = "tooltip pinned-panel hidden";
  /** What a name INSIDE the pinned panel explains itself in: the same box
   *  again, stacked directly under the panel. The floating tip is parked at
   *  whichever screen edge the panel is not on, and sending a status hovered
   *  in the left column all the way across the window to be read there is a
   *  answer nobody can follow back to the word they pointed at. */
  const pinnedTip = document.createElement("div");
  pinnedTip.className = "tooltip pinned-panel pinned-tip hidden";
  /** The gap `.hud-left` puts between its children, which the floating tip
   *  has to reproduce because it is not one of them. */
  const PINNED_STACK_GAP_PX = 8;

  // Victory milestones: a drawer rather than a panel, because it is a table
  // the player consults between decisions and not something to read the board
  // through. Collapsed by default for that reason.
  const milestonesBtn = document.createElement("button");
  milestonesBtn.className = "milestones-btn hidden";
  milestonesBtn.textContent = "Milestones";
  const milestonesDrawer = document.createElement("div");
  milestonesDrawer.className = "milestones-drawer hidden";
  let milestonesOpen = false;
  milestonesBtn.addEventListener("click", () => {
    milestonesOpen = !milestonesOpen;
    milestonesDrawer.classList.toggle("open", milestonesOpen);
    milestonesBtn.classList.toggle("on", milestonesOpen);
    if (lastState !== null) renderMilestones(lastState);
  });

  // Concede. Two-click confirm, the same shape the Reset progress control uses,
  // because it is terminal and a stray click must not end the run.
  const surrenderBtn = document.createElement("button");
  surrenderBtn.className = "surrender-btn hidden";
  surrenderBtn.textContent = "Surrender";
  let armedSurrender = false;
  const disarmSurrender = (): void => {
    armedSurrender = false;
    surrenderBtn.textContent = "Surrender";
    surrenderBtn.classList.remove("confirm");
  };
  surrenderBtn.addEventListener("click", () => {
    if (!armedSurrender) {
      armedSurrender = true;
      surrenderBtn.textContent = "Really surrender?";
      surrenderBtn.classList.add("confirm");
      return;
    }
    disarmSurrender();
    cb.onSurrender?.();
  });

  // Closes an unlimited-rules turn. No confirm step, unlike Surrender: ending
  // a turn is routine and reversible next turn, not terminal.
  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "end-turn-btn hidden";
  endTurnBtn.textContent = "End turn";
  endTurnBtn.addEventListener("click", () => cb.onEndTurn?.());

  const status = document.createElement("div");
  status.className = "status-bar hidden";
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  // The player's own treasury and its rate, beside the turn prompt. The rate
  // quotes `wealthIncomeFor` - the same call the beginTurn tick pays - so the
  // promise and the tick cannot drift. Rivals' treasuries appear nowhere.
  const wealthChip = document.createElement("span");
  wealthChip.className = "status-wealth hidden";
  // How many cards this seat's turn refills to. It is the only place in the
  // game the number is written down: the rules picker deliberately promises no
  // size, because the size grows with the realm and a static sentence would be
  // a lie by the third land. A rule the player cannot see reads as the game
  // cheating, and this one moves under them mid-run.
  const handChip = document.createElement("span");
  handChip.className = "status-hand hidden";
  handChip.addEventListener("mousemove", (e) => {
    cb.onShowTip?.(
      [
        { text: "Hand size" },
        {
          text:
            "How many cards your hand refills to when your turn begins. It " +
            `grows with your realm - one more card per 1.5 lands you hold, ` +
            `from ${MIN_HAND} up to ${MAX_HAND}.`,
        },
        {
          text:
            "Losing land never makes you discard: you keep what you are " +
            "holding, and simply draw nothing until you are back under it.",
        },
      ],
      e.clientX, e.clientY,
    );
  });
  handChip.addEventListener("mouseleave", () => cb.onHideTip?.());
  // The player's own ruler, by name; everything about them is the hover's
  // job. The tip is the land hover's Leader block with every hoverable
  // expanded: a floating tip cannot itself be hovered, so each term and
  // ability it names carries its full text inline, stacked.
  const rulerChip = document.createElement("span");
  rulerChip.className = "status-ruler hidden";
  let rulerTip: TooltipLine[] = [];
  rulerChip.addEventListener("mousemove", (e) => {
    if (rulerTip.length > 0) cb.onShowTip?.(rulerTip, e.clientX, e.clientY);
  });
  rulerChip.addEventListener("mouseleave", () => cb.onHideTip?.());
  // The turnip bar: how far the player's Grow turnips plays have filled
  // toward the next Turnip harvest. Count and fill both read the same stored
  // counter, so they cannot disagree; hidden entirely for a run that holds
  // no turnips, where the mechanic does not exist.
  const turnipChip = document.createElement("span");
  turnipChip.className = "status-turnips hidden";
  const turnipCount = document.createElement("span");
  turnipCount.className = "turnip-count";
  const turnipTrack = document.createElement("span");
  turnipTrack.className = "turnip-track";
  const turnipFill = document.createElement("span");
  turnipFill.className = "turnip-fill";
  turnipTrack.appendChild(turnipFill);
  turnipChip.append(turnipCount, turnipTrack);
  turnipChip.addEventListener("mousemove", (e) => {
    cb.onShowTip?.(
      [
        { text: "Turnip bar" },
        {
          text:
            "Every Grow turnips you play fills this bar. Filling it " +
            "shuffles a Turnip harvest into your deck - play that card to " +
            "keep one of three offered cards for good, or skip.",
        },
      ],
      e.clientX, e.clientY,
    );
  });
  turnipChip.addEventListener("mouseleave", () => cb.onHideTip?.());
  status.append(statusText, wealthChip, handChip, rulerChip, turnipChip);

  function makePile(kind: string, label: string) {
    const root = document.createElement("div");
    root.className = `pile pile-${kind} hidden`;
    const stack = document.createElement("div");
    stack.className = "pile-stack";
    const count = document.createElement("div");
    count.className = "pile-count";
    const lbl = document.createElement("div");
    lbl.className = "pile-label";
    lbl.textContent = label;
    root.append(stack, count, lbl);
    return { root, stack, count };
  }

  const deckPile = makePile("deck", "Deck");
  const discardPile = makePile("discard", "Discard");

  const hand = document.createElement("div");
  hand.className = "hand hidden";

  /** A hand card's rules text, read in the left column rather than over the
   *  map. One panel for the whole hand: the card it is about is whichever one
   *  the player is pointing at, or the armed one when they are pointing at
   *  nothing - see `shownCardIndex`. */
  const cardPanel = document.createElement("div");
  cardPanel.className = "card-panel hidden";
  /** The hand index the pointer or the keyboard is on, or null. Cleared by
   *  every `renderHand`: a replaced element under the pointer gets a fresh
   *  `pointerenter`, but a detached one never gets its `pointerleave`, so an
   *  index held across a re-render is how the panel ends up describing a card
   *  that has been played. */
  let hoveredCard: number | null = null;
  /** True while the pointer is on the PANEL. The tip used to be a child of the
   *  card button, so reaching for its scrollbar kept `.card:hover` true; in the
   *  column it has to keep itself open, or a panel long enough to need
   *  scrolling closes the moment somebody reaches for it. */
  let panelHovered = false;
  cardPanel.addEventListener("pointerenter", () => {
    panelHovered = true;
  });
  cardPanel.addEventListener("pointerleave", () => {
    panelHovered = false;
    renderCardPanel();
  });
  // The panel sits over the map and is not inside the card any more, so a
  // click on it is a click on neither - it must not fall through to the land
  // underneath.
  cardPanel.addEventListener("click", (event) => event.stopPropagation());

  let logPrefs = loadLogPrefs(logStorage);

  const logPanel = document.createElement("div");
  logPanel.className = "activity-log hidden";
  logPanel.classList.toggle("filter-targeting-me", logPrefs.targetingMe);
  const logHeader = document.createElement("div");
  logHeader.className = "activity-log-header";
  const logTitle = document.createElement("span");
  logTitle.className = "activity-log-title";
  logTitle.textContent = "Activity";
  const logToggle = document.createElement("button");
  logToggle.className = "activity-log-toggle";
  logToggle.textContent = ">";
  logToggle.addEventListener("click", () => {
    const collapsed = logPanel.classList.toggle("collapsed");
    logToggle.textContent = collapsed ? "<" : ">";
    // entries have display:none while collapsed, so scrolls no-op until now
    if (!collapsed) logEntries.scrollTop = logEntries.scrollHeight;
  });
  logHeader.append(logTitle, logToggle);

  /** One "Targeting me" / "Show popups" checkbox. Both are pure display
   *  preferences (see LogPrefs), applied and saved immediately on change -
   *  there is no separate "apply" step. */
  function makeLogFilterToggle(
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): HTMLLabelElement {
    const wrap = document.createElement("label");
    wrap.className = "activity-log-filter";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    wrap.append(input, document.createTextNode(label));
    return wrap;
  }

  const logFilters = document.createElement("div");
  logFilters.className = "activity-log-filters";
  logFilters.append(
    makeLogFilterToggle("Targeting me", logPrefs.targetingMe, (checked) => {
      logPrefs = { ...logPrefs, targetingMe: checked };
      saveLogPrefs(logStorage, logPrefs);
      // Every rendered entry was already tagged .notice-worthy (or not) at
      // render time, so toggling this class is enough to retroactively
      // show/hide the whole log - no re-render needed.
      logPanel.classList.toggle("filter-targeting-me", checked);
    }),
    makeLogFilterToggle("Show popups", logPrefs.showPopups, (checked) => {
      logPrefs = { ...logPrefs, showPopups: checked };
      saveLogPrefs(logStorage, logPrefs);
    }),
  );
  // The sound preference lives with the other display toggles, but its state
  // is the audio engine's (its own storage key - see AUDIO_PREFS_KEY), so the
  // checkbox only reads and forwards.
  if (cb.onToggleSound !== undefined) {
    logFilters.append(
      makeLogFilterToggle("Sound", !(cb.soundMuted?.() ?? false), (checked) => {
        cb.onToggleSound?.(!checked);
      }),
    );
  }
  /** Replaces the two checkboxes while a pin filters the log - the swap is
   *  the .filter-realm rules in style.css, the content applyRealmFilter's. */
  const logFiltered = document.createElement("span");
  logFiltered.className = "activity-log-filtered";
  logFilters.append(logFiltered);

  const logEntries = document.createElement("div");
  logEntries.className = "activity-log-entries";
  logPanel.append(logHeader, logFilters, logEntries);

  const noticeOverlay = document.createElement("div");
  noticeOverlay.className = "notice-overlay hidden";
  const noticeCard = document.createElement("div");
  noticeCard.className = "notice-card";
  const noticeTitle = document.createElement("h2");
  noticeTitle.className = "notice-title";
  const noticeLines = document.createElement("ul");
  noticeLines.className = "notice-lines";
  const noticeFootnotes = document.createElement("div");
  noticeFootnotes.className = "notice-footnotes";
  const noticeContinue = document.createElement("button");
  noticeContinue.className = "notice-continue";
  noticeContinue.textContent = "Continue";
  noticeContinue.addEventListener("click", () => dismissSummary());
  noticeCard.append(noticeTitle, noticeLines, noticeFootnotes, noticeContinue);
  noticeOverlay.appendChild(noticeCard);

  // The harvest overlays: the three-boon choice and the empower card picker,
  // one overlay element restyled per step. Same chrome and z-band as the
  // notice overlay so a modal above the hand is one look, not two.
  const harvestOverlay = document.createElement("div");
  harvestOverlay.className = "harvest-overlay hidden";
  const harvestBox = document.createElement("div");
  harvestBox.className = "harvest-card";
  const harvestTitle = document.createElement("h2");
  harvestTitle.className = "notice-title";
  const harvestOptions = document.createElement("div");
  harvestOptions.className = "harvest-options";
  const harvestCancel = document.createElement("button");
  harvestCancel.className = "notice-continue harvest-cancel";
  harvestCancel.textContent = "Cancel";
  harvestBox.append(harvestTitle, harvestOptions, harvestCancel);
  harvestOverlay.appendChild(harvestBox);
  let harvestOnCancel: (() => void) | null = null;
  harvestCancel.addEventListener("click", () => harvestOnCancel?.());

  /** Escape backs out of the harvest offer, the same answer its Cancel button
   *  gives. Held here so it can be taken off again: a listener that outlived
   *  its overlay would answer for whatever came next, and main.ts's own Escape
   *  handler stands down only while a harvest is pending. */
  let harvestEscape: ((e: KeyboardEvent) => void) | null = null;

  function armHarvestEscape(onEscape: () => void): void {
    releaseHarvestEscape();
    harvestEscape = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", harvestEscape);
  }

  function releaseHarvestEscape(): void {
    if (harvestEscape === null) return;
    window.removeEventListener("keydown", harvestEscape);
    harvestEscape = null;
  }

  function hideHarvestUi(): void {
    harvestOverlay.classList.add("hidden");
    releaseHarvestEscape();
    harvestOnCancel = null;
    // Same hygiene as dismissSummary: a close with the cursor on a name must
    // not strand its tip or its map halo.
    cb.onHideTip?.();
    cb.onHighlightFaction?.(null);
  }

  /** How long a revealed card is held still before it flies to the deck. Long
   *  enough to read the name and the rules text, short enough that two of them
   *  in a row is not a wait. */
  const REVEAL_HOLD_MS = 900;
  const REVEAL_FADE_MS = 220;
  const REVEAL_FLY_MS = 420;

  function revealGainedCards(cardIds: string[], onDone?: () => void): void {
    // One card per queue step, so a reveal never starts while the play that
    // earned it is still flying, and two cards never fade in together.
    for (const cardId of cardIds) {
      animations.push((done) => revealOneCard(cardId, done));
    }
    if (onDone !== undefined) animations.onIdle(onDone);
  }

  function revealOneCard(cardId: string, done: () => void): void {
      const wrap = document.createElement("div");
      wrap.className = "card-reveal";
      const label = document.createElement("div");
      label.className = "card-reveal-label";
      label.textContent = "Added to your deck";
      const face = document.createElement("div");
      face.className = "card-reveal-card";
      const name = document.createElement("div");
      name.className = "card-reveal-name";
      name.appendChild(renderSegments([card(cardId)], richTextHooks));
      const text = document.createElement("div");
      text.className = "card-reveal-text";
      text.appendChild(renderSegments(cardTextSegments(cardId), richTextHooks));
      face.append(name, text);
      wrap.append(label, face);
      container.appendChild(wrap);

      // Fade in, hold, then fly to the deck. Each leg waits on the one before
      // reporting itself finished - no leg is timed twice.
      runAnimation(
        wrap,
        [{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "scale(1)" }],
        REVEAL_FADE_MS,
        () => {
          runAnimation(wrap, [{ opacity: 1 }, { opacity: 1 }], REVEAL_HOLD_MS, () => {
            const from = face.getBoundingClientRect();
            const to = deckPile.root.getBoundingClientRect();
            const dx = to.left + to.width / 2 - (from.left + from.width / 2);
            const dy = to.top + to.height / 2 - (from.top + from.height / 2);
            runAnimation(
              wrap,
              [
                { transform: "translate(0, 0) scale(1)", opacity: 1 },
                {
                  transform: `translate(${dx}px, ${dy}px) scale(0.2)`,
                  opacity: 0.1,
                },
              ],
              REVEAL_FLY_MS,
              () => {
                wrap.remove();
                done();
              },
            );
          });
        },
      );
  }

  function showTransferOffer(
    offer: {
      from: string; to: string; max: number;
      fromHas: number; toHas: number; toMax: number; fromMax: number;
    },
    hooks: { onConfirm(amount: number): void },
  ): void {
    harvestTitle.textContent = "Send defenders with the conquest?";
    // No cancel: the land is already taken, and the only question is how many
    // defenders march over. Answering 0 is a real answer, so backing out and
    // the Confirm button lead to the same place.
    harvestOnCancel = () => hooks.onConfirm(0);
    // This overlay takes no key of its own, so any Escape armed for a harvest
    // offer goes with the offer it belonged to rather than answering here.
    releaseHarvestEscape();

    const line = document.createElement("div");
    line.className = "transfer-line";
    line.append(
      renderSegments([faction(offer.from)], richTextHooks),
      document.createTextNode(" -> "),
      renderSegments([faction(offer.to)], richTextHooks),
    );

    // One row per land, each naming the land and the score it would be left
    // with. The names are nodes, so pointing at either lights it on the map.
    const ends = document.createElement("div");
    ends.className = "transfer-ends";
    const endRow = (factionId: string): HTMLElement => {
      const el = document.createElement("div");
      el.className = "transfer-end";
      const who = document.createElement("span");
      who.appendChild(renderSegments([faction(factionId)], richTextHooks));
      const score = document.createElement("span");
      score.className = "transfer-score";
      el.append(who, score);
      return el;
    };
    const fromRow = endRow(offer.from);
    const toRow = endRow(offer.to);
    ends.append(fromRow, toRow);

    const row = document.createElement("div");
    row.className = "transfer-row";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(offer.max);
    slider.value = "0";
    slider.className = "transfer-slider";
    const figure = document.createElement("span");
    figure.className = "transfer-figure";
    const say = () => {
      const n = Number(slider.value);
      figure.textContent = `${n} of ${offer.max}`;
      fromRow.querySelector(".transfer-score")!.textContent =
        `keeps ${offer.fromHas - n} / ${offer.fromMax}`;
      toRow.querySelector(".transfer-score")!.textContent =
        `holds ${offer.toHas + n} / ${offer.toMax}`;
    };
    say();
    slider.addEventListener("input", say);
    row.append(slider, figure);

    const confirm = document.createElement("button");
    confirm.className = "harvest-option harvest-skip";
    confirm.textContent = "Send them";
    confirm.addEventListener("click", () => hooks.onConfirm(Number(slider.value)));

    harvestOptions.replaceChildren(line, ends, row, confirm);
    harvestOverlay.classList.remove("hidden");
  }

  function showHarvestOffer(
    offer: { buildCards: BuildOption[]; heldCards: string[] },
    hooks: {
      onGrowth(): void;
      onBuild(cardId: string): void;
      onRandom(): void;
      onDestroy(cardId: string): void;
      onSkip(): void;
      onCancel(): void;
    },
  ): void {
    harvestOnCancel = hooks.onCancel;
    armHarvestEscape(hooks.onCancel);

    /** One option button: a heading and a line saying what it does. */
    const option = (
      title: string, blurb: string, onPick: () => void,
    ): HTMLElement => {
      const btn = document.createElement("button");
      btn.className = "harvest-option";
      const label = document.createElement("div");
      label.className = "harvest-option-label";
      label.textContent = title;
      const text = document.createElement("div");
      text.className = "harvest-option-text";
      text.textContent = blurb;
      btn.append(label, text);
      btn.addEventListener("click", onPick);
      return btn;
    };

    /** A second screen listing cards by name with their rules text - the same
     *  reading the build tile gives, since these are the same decisions made
     *  later. Shared by "take one from your build" and "burn one", which are
     *  the same screen pointed at two different lists.
     *
     *  A row may carry a PRICE, which is what the build list has that the burn
     *  list does not: an option is priced, unaffordable, or free, and only the
     *  second of those is unclickable. */
    const showCardPicker = (
      title: string,
      rows: readonly { cardId: string; price?: BuildOption }[],
      onPick: (cardId: string) => void,
    ): void => {
      harvestTitle.textContent = title;
      const cards = rows.map(({ cardId, price }) => {
        const locked = price !== undefined && !price.affordable;
        const btn = document.createElement("button");
        btn.className = locked ? "harvest-option harvest-locked" : "harvest-option";
        const label = document.createElement("div");
        label.className = "harvest-option-label";
        label.appendChild(renderSegments([card(cardId)], richTextHooks));
        const text = document.createElement("div");
        text.className = "harvest-option-text";
        text.appendChild(renderSegments(cardTextSegments(cardId), richTextHooks));
        btn.append(label, text);
        if (price?.cost != null) {
          const line = document.createElement("div");
          line.className = "harvest-option-price";
          line.appendChild(renderSegments(
            priceSegments(price.cost, price.held), richTextHooks,
          ));
          btn.append(line);
        }
        btn.disabled = locked;
        btn.addEventListener("click", () => {
          if (!locked) onPick(cardId);
        });
        return btn;
      });
      const back = document.createElement("button");
      back.className = "harvest-option harvest-skip";
      back.textContent = "Back";
      back.addEventListener("click", showChoices);
      harvestOptions.replaceChildren(...cards, back);
    };

    function showChoices(): void {
      harvestTitle.textContent = "Turnip harvest - take one";
      const growth = option(
        "Grow your people",
        "A land of your realm grows: one more defense, ceiling and all.",
        hooks.onGrowth,
      );
      const build = option(
        "A card from your build",
        offer.buildCards.length === 0
          ? "Nothing left to take - your build is already in your deck."
          : "Choose one of your build's cards by name. The stronger ones are bought with the plainer ones.",
        // The whole build, priced - not only what is affordable. A rung the
        // seat cannot pay for is the next thing it is playing towards, and a
        // list that hid it would hide the reason to keep the plain cards.
        () => showCardPicker(
          "Take a card from your build",
          offer.buildCards.map((o) => ({ cardId: o.cardId, price: o })),
          hooks.onBuild,
        ),
      );
      (build as HTMLButtonElement).disabled = offer.buildCards.length === 0;
      const random = option(
        "A card from anywhere",
        "One card out of everything the game knows, sight unseen.",
        hooks.onRandom,
      );
      const destroy = option(
        "Burn a card",
        offer.heldCards.length === 0
          ? "Nothing to burn."
          : "Take a card out of your deck for good. A leaner deck draws its best cards sooner.",
        () => showCardPicker(
          "Burn a card for good",
          offer.heldCards.map((cardId) => ({ cardId })),
          hooks.onDestroy,
        ),
      );
      (destroy as HTMLButtonElement).disabled = offer.heldCards.length === 0;
      const skip = option(
        "Take nothing",
        "The harvest is spent and the deck is left exactly as it is.",
        hooks.onSkip,
      );
      // No Cancel among the options: `harvestCancel` sits in the box below
      // them and is on screen at both steps, so appending one here drew the
      // word twice, one above the other.
      harvestOptions.replaceChildren(growth, build, random, destroy, skip);
    }

    showChoices();
    harvestOverlay.classList.remove("hidden");
  }

  function showRoundSummary(summary: RoundSummary): void {
    noticeTitle.textContent = summary.title;
    noticeLines.replaceChildren(
      ...summary.lines.map((line) => {
        const li = document.createElement("li");
        li.className = `notice-line tone-${line.tone}`;
        li.appendChild(renderSegments(line.text, richTextHooks));
        if (line.changes.length > 0) {
          const span = document.createElement("span");
          const toneClass =
            line.tone === "bad" ? "lead-bad" : line.tone === "good" ? "lead-good" : "lead-even";
          span.className = `notice-change ${toneClass}`;
          span.textContent = ` (${line.changes.map(standingChangeText).join(", ")})`;
          li.appendChild(span);
        }
        return li;
      }),
    );
    noticeFootnotes.replaceChildren(
      ...summary.footnotes.map((fn) => {
        const p = document.createElement("p");
        p.className = "notice-footnote";
        p.appendChild(renderSegments(fn, richTextHooks));
        return p;
      }),
    );
    noticeFootnotes.classList.toggle("hidden", summary.footnotes.length === 0);
    noticeOverlay.classList.remove("hidden");
  }

  /** The stage waiting on the modal on screen, or null when none is up. Fired
   *  once, by the dismissal or by the teardown - a stage left holding is a
   *  transition queue that never runs again. */
  let summaryDismissed: (() => void) | null = null;

  function releaseSummaryStage(): void {
    const fn = summaryDismissed;
    summaryDismissed = null;
    fn?.();
  }

  function dismissSummary(): void {
    noticeOverlay.classList.add("hidden");
    // A dismiss with the cursor still over a name must not leave its tip or
    // its map halo stuck on screen.
    cb.onHideTip?.();
    cb.onHighlightFaction?.(null);
    // What the player has read is what releases the round: nothing resolves
    // behind a modal about the round before it.
    releaseSummaryStage();
  }

  function hideSummary(): void {
    noticeOverlay.classList.add("hidden");
    // Torn down rather than shown later. Both callers are ends - the run
    // finishing, and a new game shrinking the log - and news about the
    // previous run has nothing to say about either.
    roundEvents = [];
    // Belt and braces rather than a live case: every path that reaches here
    // with a modal up has replaced the whole world, which bumps the queue's
    // generation and makes the held `done` inert anyway. It stays because the
    // cost of a lost `done` is a queue that never runs again, and the cost of
    // an inert one is nothing.
    releaseSummaryStage();
  }

  /** Shared with the "Targeting me" log filter (isNoticeWorthy) so the two
   *  surfaces cannot disagree about which events matter to the human. */
  function buildNoticeCtx(state: GameState): NoticeCtx | null {
    const human = humanPlayer(state);
    if (!human) return null;
    const realm = fullRealmOf(
      human.factionId, state.overlords, state.incorporated,
    );
    return {
      humanFactionId: human.factionId,
      factionOf: (playerId) =>
        state.players.find((pl) => pl.id === playerId)?.factionId,
      defense: (polygon) => defenseOf(state, polygon),
      defenseMax: (polygon) => defenseMaxOf(state, polygon),
      diseaseOf: (polygon, owner) => diseaseOn(state.disease, polygon, owner),
      inHumanRealm: (polygon) => realm.has(polygon),
      homeGateOpen: () => subjugationGateOpen(state, human.factionId),
    };
  }

  /** Everything folded in since the last modal was raised, in log order.
   *
   *  A round arrives as several moves - the seat that played, the advance, and
   *  one per acting AI seat - and each is its own transition with its own
   *  commit. Accumulating is what keeps "the AI's round is one modal, one line
   *  per event" true across them: the alternative, a modal per move, either
   *  asks the player to dismiss five in a row or lets the fifth silently
   *  replace the first, which is what happened while the summary was raised
   *  from the repaint.
   *
   *  Raw events rather than built summaries, because `buildRoundSummary`
   *  groups, deduplicates and titles across a whole batch: merging five built
   *  summaries would have to re-do all of that, and its headline choice reads
   *  the batch as a whole. The numbers stay the log's own - `walkStandings`
   *  runs backwards from the state at raise time, and
   *  `tests/standings.test.ts` pins that walk against the real stores over
   *  exactly this batch, a whole AI round. */
  let roundEvents: GameEvent[] = [];

  /** Player-affecting events interrupt once per AI round: everything folded in
   *  becomes a single summary, shown if it has anything to say.
   *
   *  Muting the popup (LogPrefs.showPopups) narrows this rather than silencing
   *  it. A critical event - one that changes what the player is allowed to do
   *  next, see NoticeRule.critical - still interrupts, but alone: the summary
   *  is built from the critical events only, so the mute costs the round's
   *  other news and nothing more. The activity log carries everything either
   *  way. Without this, a player who muted popups could be made someone's
   *  vassal and find out only by noticing their cards had stopped working. */
  function raiseRoundSummary(onDismiss: () => void): boolean {
    const state = lastState;
    if (state === null || state.phase !== "playing") return false;
    const ctx = buildNoticeCtx(state);
    if (ctx === null) return false;
    // Taken, not read: a batch that has been made into a modal must not turn
    // up again in the next one, whether or not it had anything to say.
    const batch = roundEvents;
    roundEvents = [];
    const summary = buildRoundSummary(batch, ctx, {
      criticalOnly: !logPrefs.showPopups,
    }, localPlayerId());
    if (summary === null) return false;
    // Nothing on screen may be replaced by this: the caller is a stage, and a
    // stage runs only once the one before it released. A modal still up here
    // would mean two stages in flight at once, so its waiter is released
    // rather than dropped - a lost `done` wedges the queue for good.
    releaseSummaryStage();
    summaryDismissed = onDismiss;
    showRoundSummary(summary);
    return true;
  }

  // Return dismisses the summary as well as Escape. Handled here rather than
  // by focusing the button: focus on the overlay does not survive the AI
  // turns that ran to produce it.
  window.addEventListener("keydown", (e) => {
    if (noticeOverlay.classList.contains("hidden")) return;
    if (e.key !== "Escape" && e.key !== "Enter") return;
    e.preventDefault();
    dismissSummary();
  });

  // Everything down the left lives in ONE column, in flow. Three panels each
  // positioned from the top-left corner independently is three panels drawn
  // over each other the moment two of them are up - which is exactly how
  // pinning a land looked like it had closed the milestones drawer.
  const leftColumn = document.createElement("div");
  leftColumn.className = "hud-left";
  leftColumn.append(
    surrenderBtn, milestonesBtn, milestonesDrawer, cardPanel, pinnedPanel,
    pinnedTip,
  );

  container.append(
    menu, postmortem, pmReturn, status, scoreboard, leftColumn, endTurnBtn,
    deckPile.root, discardPile.root, hand, logPanel, noticeOverlay,
    harvestOverlay,
  );

  /** The card the player last clicked to play: where it sat, so the flight
   *  starts from the layout the click happened in, and WHICH slot of the hand
   *  it was, so that slot can be emptied for as long as the card is in the
   *  air. Both are needed because the beat runs BEFORE the commit that
   *  repaints the hand without the card - without the slot, the card flies out
   *  of a hand that is still holding it. */
  let pendingPlay: { rect: DOMRect; index: number } | null = null;
  let renderedEvents = 0;
  let lastRenderedTurn = 0;
  /** The rendered entry for each log index, so a secret play several screens up
   *  can be rewritten in place when its card becomes public. Sparse: an index
   *  `isObservable` dropped has no entry, and a rewrite for one simply finds
   *  nothing. Reset with `renderedEvents`, since a cleared panel invalidates
   *  every element in it. */
  const entryByIndex = new Map<number, HTMLElement>();
  /** Log indices already rendered with their secret revealed, so a reveal
   *  rewrites its entry once rather than on every subsequent render. */
  const shownRevealed = new Set<number>();
  /** The faction the map is currently lighting, so the log can agree with it.
   *  Held rather than read back off the DOM because entries appended while a
   *  hover is live have to arrive already dimmed. */
  let highlightedFaction: string | null = null;
  /** The faction whose highlight the map is holding pinned, for the status bar.
   *  Separate from `highlightedFaction`: that one is the log's dimming, which a
   *  pin and a plain hover drive alike, while this is only ever set by a click
   *  and is what the bar has to announce. */
  let pinnedFaction: string | null = null;
  /** The faction a remote seat is holding the turn on, for the status bar -
   *  see Hud.setWaiting. Just the faction: who is behind it is the segment
   *  renderer's business, not this line's. Null when nothing is waiting,
   *  which is every solo game: nobody outside the network wiring ever calls
   *  setWaiting at all. */
  let waitingFaction: string | null = null;

  /** Sets one entry's dimming from `highlightedFaction`. An entry is lit when
   *  it names that faction - `data-factions`, written in renderLog. */
  function applyLogHighlight(entry: HTMLElement): void {
    entry.classList.toggle(
      "log-lit",
      highlightedFaction !== null &&
        (entry.dataset.factions ?? "").split(" ").includes(highlightedFaction),
    );
  }

  /** Member set of the pinned realm as of `state` - the pinned faction plus
   *  the lands incorporated into it, never vassals: a vassal acts on its own
   *  and is watched by pinning it. Null when nothing is pinned. Derived on
   *  every application rather than frozen at pin time, so an incorporation
   *  landed while pinned re-files the log on the next render. */
  function pinnedRealmMembers(state: GameState | null): Set<string> | null {
    if (pinnedFaction === null || state === null) return null;
    return incorporatedRealmOf(pinnedFaction, state.incorporated);
  }

  /** Filters the log to the pinned realm: entries involving a member keep
   *  `.log-realm` and `.filter-realm` on the panel hides the rest (and swaps
   *  the filter checkboxes for the "Filtered to X" label). A play and its
   *  consequences show or hide as one unit - any line of the batch naming a
   *  member keeps the whole batch - so a consequence is never shown indented
   *  under nothing and a shown play never loses its effects. A walk over the
   *  rendered entries, like the highlight dim, because membership depends on
   *  who is pinned and on current incorporation - not render-time facts the
   *  way notice-worthiness is. */
  function applyRealmFilter(state: GameState | null): void {
    const members = pinnedRealmMembers(state);
    logPanel.classList.toggle("filter-realm", members !== null);
    logFiltered.replaceChildren(
      ...(pinnedFaction !== null && members !== null
        ? [renderSegments([t("Filtered to "), faction(pinnedFaction)], richTextHooks)]
        : []),
    );
    let batch: HTMLElement[] = [];
    const flush = () => {
      const keep =
        members !== null &&
        batch.some((el) =>
          (el.dataset.factions ?? "").split(" ").some((f) => members.has(f)),
        );
      for (const el of batch) el.classList.toggle("log-realm", keep);
      batch = [];
    };
    for (const el of logEntries.children) {
      if (!(el instanceof HTMLElement) || !el.classList.contains("log-entry")) {
        continue; // .log-turn separators pass through, as with every filter
      }
      if (!el.classList.contains("log-consequence")) flush();
      batch.push(el);
    }
    flush();
  }

  /** Which factions a line is about, for the highlight. Read off the segments,
   *  so a line lights exactly when it visibly names the faction - plus the actor
   *  when that is you, because your own actions render as "You" and name no
   *  faction at all. Not for an independence: its playerId is only the seat
   *  whose clock tick noticed it, the line never says "You", and both sides
   *  it IS about are already in the segments.
   *
   *  Shared by the first render and by a reveal's rewrite: revealing a secret
   *  play can add a faction to the line, so the two must agree on how the list
   *  is built. */
  function namedFactions(
    segs: Segment[],
    e: GameEvent,
    humanFactionId: string | undefined,
  ): string[] {
    const named = factionIds(segs);
    if (
      e.playerId === localPlayerId() && e.type !== "independence" &&
      humanFactionId !== undefined && !named.includes(humanFactionId)
    ) {
      named.push(humanFactionId);
    }
    return named;
  }

  /** Rewrites one already-rendered entry to name the secret card it was hiding.
   *
   *  The impact suffix is detached and re-appended rather than rebuilt: it comes
   *  from `walkStandings` over the batch that produced the event, and that batch
   *  is long gone by the time a reveal fires several turns later. A secret card
   *  moves no track by rule (see `CardDef.secret` in src/cards.ts) so there is
   *  never a suffix here to carry - but carrying it is two lines that cannot be
   *  wrong, where rebuilding it from a walk that no longer exists could be. */
  function revealEntry(entry: HTMLElement, e: GameEvent, state: GameState): void {
    const suffix = entry.querySelector(".log-change");
    const segs = eventSegments(e, state, true, localPlayerId());
    entry.replaceChildren(renderSegments(segs, richTextHooks));
    if (suffix !== null) entry.appendChild(suffix);
    entry.dataset.factions =
      namedFactions(segs, e, humanPlayer(state)?.factionId).join(" ");
    applyLogHighlight(entry);
    // A line that rewrites itself several screens up is silent otherwise. The
    // flash is one CSS animation and nothing waits on it - see the "never
    // re-derive an animation's duration" rule in CLAUDE.md.
    entry.classList.add("log-revealed");
  }

  /** What the log says about a turn in which nobody did anything worth a line.
   *
   *  Picked by turn number rather than at random: the log is rebuilt from
   *  scratch whenever it is cleared, and a phrase that changed under the
   *  player on a redraw would read as a second, different turn. */
  const QUIET_TURNS = [
    "eerily quiet",
    "nothing stirred",
    "a quiet season",
    "no smoke on the horizon",
    "the roads stayed empty",
    "word came of nothing at all",
  ];

  /** Opens a turn's block in the log. */
  function openTurn(turn: number): void {
    const sep = document.createElement("div");
    sep.className = "log-turn";
    sep.textContent = `Turn ${turn}`;
    logEntries.appendChild(sep);
    lastRenderedTurn = turn;
  }

  /** Headers and a line of flavour for every turn up to `through` that passed
   *  with nothing in it.
   *
   *  Without this a run where nobody acts shows no sign of time passing at
   *  all: the log's last entry stays on turn 4 while the status bar reads
   *  turn 17, which looks exactly like a game that has stopped working. */
  function markQuietTurns(through: number): void {
    for (let turn = lastRenderedTurn + 1; turn <= through; turn++) {
      openTurn(turn);
      const line = document.createElement("div");
      // Deliberately NOT a `.log-entry`: every filter in this panel works by
      // hiding entries, and a turn that passed is not something any filter
      // should be able to deny. Same reasoning as the `.log-turn` headers it
      // sits under.
      line.className = "log-quiet";
      line.textContent = QUIET_TURNS[turn % QUIET_TURNS.length];
      logEntries.appendChild(line);
    }
  }

  /** One batch's standings walk, through the notice context of the state it
   *  lands in. The log renders its suffixes from this, and `queueBeats` hands
   *  `changes` straight to `presentCtxOf` rather than asking it to walk the
   *  same batch again - one walk, read by both surfaces, so they cannot quote
   *  different numbers. */
  function noticeWalk(state: GameState, events: GameEvent[]): {
    changes: StandingChange[][];
    ctx: NoticeCtx | null;
  } {
    const ctx = buildNoticeCtx(state);
    return {
      ctx,
      changes: ctx === null ? [] : walkStandings(events, walkCtxOf(ctx)),
    };
  }

  /** Draws every log line this state has appended since the last render, and
   *  returns that batch - what `update` animates and decides the round
   *  summary from. The suffix beside each line comes from `noticeWalk`, the
   *  same call the presenter reads its labels off. */
  function renderLog(state: GameState, animate: boolean): GameEvent[] {
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
      entryByIndex.clear();
      shownRevealed.clear();
      hideSummary();
    }
    const base = renderedEvents;
    const fresh = state.log.slice(base);
    const humanFactionId = humanPlayer(state)?.factionId;
    const { ctx: noticeCtx, changes } = noticeWalk(state, fresh);
    // Over the WHOLE log, not just `fresh`: the play a reveal makes public is
    // by definition an older one, and the event that reveals it is the fresh
    // one. Cheap - one pass over an append-only array, once per render.
    const revealed = revealedSecrets(state, localPlayerId());
    // `changes` above is index-parallel to `fresh`, INCLUDING the events
    // isObservable drops: the walk runs backwards from the leads as they
    // stand now, so a hidden event that moved a counter (a rival's garrison,
    // a draw's reshuffle) has to be stepped back over or every line above it
    // is out by its amount. Which is also why it is indexed by the loop's
    // position in `fresh` and not by how many entries have been appended.
    // The entry a consequence indents under. A local is enough: the log only
    // ever grows by a whole `appendEvents` batch and `renderedEvents` is set to
    // the full length after every render, so a play and the events it caused are
    // never split across two calls. Assigned only from entries that were
    // actually appended, so a consequence dropped by isObservable (a vassal's
    // hidden `seeded`) leaves the cause standing for the next one.
    let cause: HTMLElement | null = null;
    fresh.forEach((e, i) => {
      const logIndex = base + i;
      // Every turn between the last one rendered and this event's had nothing
      // in it, so it gets a header and a line saying so.
      markQuietTurns(e.turn - 1);
      if (e.turn !== lastRenderedTurn) {
        openTurn(e.turn);
      }
      if (!isObservable(e, humanFactionId)) return;
      const entry = document.createElement("div");
      entry.className = animate ? "log-entry log-new" : "log-entry";
      // A secret play revealed by something in this same batch is rendered
      // revealed from the start rather than rewritten a line later - there is
      // nothing to flash at a player who has not seen the hidden version.
      const isRevealed = revealed.has(logIndex);
      if (isRevealed) shownRevealed.add(logIndex);
      const segs = eventSegments(e, state, isRevealed, localPlayerId());
      entry.replaceChildren(renderSegments(segs, richTextHooks));
      entry.dataset.factions = namedFactions(segs, e, humanFactionId).join(" ");
      applyLogHighlight(entry);
      const impact = impactText(e, changes[i] ?? []);
      if (impact !== null) {
        const span = document.createElement("span");
        span.className = `log-change lead-${impact.tone}`;
        span.textContent = ` (${impact.text})`;
        entry.appendChild(span);
      }
      entry.classList.toggle("log-you", involvesHuman(e, humanFactionId));
      // Tagged at render time, not re-evaluated on toggle: the "Targeting me"
      // filter just shows/hides by these classes, retroactively and instantly.
      entry.classList.toggle(
        "notice-worthy",
        noticeCtx !== null && isNoticeWorthy(e, noticeCtx, localPlayerId()),
      );
      entry.classList.toggle("log-mine", isYourDoing(e));
      if (e.consequence !== true) {
        cause = entry;
      } else {
        entry.classList.add("log-consequence");
        // The filter hides an entry that is neither notice-worthy nor yours, and
        // the play that caused a notice-worthy consequence is often neither - a
        // rival's Revolt is not aimed at you, the vassalage it broke was. Left
        // alone, the filter would show the consequence indented under nothing.
        // Optional chaining, not an assertion: a hand-built log with no play
        // above it degrades to a plain indented line rather than throwing.
        if (entry.classList.contains("notice-worthy")) {
          cause?.classList.add("notice-cause");
        }
      }
      entryByIndex.set(logIndex, entry);
      logEntries.appendChild(entry);
    });
    renderedEvents = state.log.length;
    // Turns that have finished with nothing in them get their line now rather
    // than waiting for the next event to arrive - which, in a run where every
    // seat is out of playable cards, may never happen. The turn in progress is
    // deliberately excluded: it has not finished being quiet yet.
    markQuietTurns(state.turn - 1);
    // Everything this batch made public that was already on screen hiding it.
    for (const idx of revealed) {
      if (shownRevealed.has(idx)) continue;
      shownRevealed.add(idx);
      const entry = entryByIndex.get(idx);
      // Absent when `isObservable` dropped the play, or when the panel was
      // cleared under it. Nothing to rewrite, and nothing to fix.
      if (entry === undefined) continue;
      revealEntry(entry, state.log[idx], state);
    }
    // After the reveal loop - a reveal rewrites data-factions - and before the
    // scroll, since hiding entries changes scrollHeight. One call classifies
    // the fresh entries and re-files the old ones after membership drift.
    applyRealmFilter(state);
    if (fresh.length > 0) logEntries.scrollTop = logEntries.scrollHeight;
    return fresh;
  }

  function renderPile(
    pile: { stack: HTMLElement; count: HTMLElement },
    n: number,
  ): void {
    pile.count.textContent = String(n);
    pile.stack.classList.toggle("empty", n === 0);
    pile.stack.replaceChildren();
    for (let i = 0; i < pileLayers(n); i++) {
      const back = document.createElement("div");
      back.className = "card-back";
      back.style.translate = `${-2 * i}px ${-2 * i}px`;
      pile.stack.appendChild(back);
    }
  }

  /** One amber "this can come back with nothing" line. The card's own failure
   *  mode and a candidate's odds are the same claim at two scales, so they are
   *  the same element: a player who has learnt to read the band once has learnt
   *  to read it everywhere it appears. */
  function riskBand(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "card-tip-risk";
    el.textContent = text;
    return el;
  }

  /** Whether the hand is taking plays at all. The turn is the player's and
   *  still open, which a spent turn can be (`turnOpen`), and nothing is
   *  resolving. Which of the cards it then accepts is `canPlayCard`'s answer
   *  per card, so a re-opened turn greys everything but the repeat and one
   *  holding no legal repeat greys the lot.
   *
   *  The card panel asks the same question the fan does: "you cannot play this"
   *  is a red band about THIS turn, and a hand nobody is being offered has no
   *  such answer to give - every card would wear the band while the AI plays. */
  function handLive(state: GameState): boolean {
    return isLocalTurn(state) && turnOpen(state) &&
      !(cb.isResolving?.() ?? false);
  }

  /** Which hand card the panel is about: the one being pointed at, else the
   *  armed one, else none.
   *
   *  Hover outranks armed deliberately. A player with a Raid armed may still
   *  want to read another card in the fan, and moving off it brings the panel
   *  back to the card the map is still asking about. `panelHovered` counts as
   *  hovering whatever the panel is already showing - see its declaration. */
  function shownCardIndex(): number | null {
    if (hoveredCard !== null) return hoveredCard;
    if (panelHovered) return shownCard;
    return armedIndex;
  }

  /** The hand index the panel is currently rendered for, so a repaint of the
   *  same card keeps its scroll position and a different card starts at the
   *  top. */
  let shownCard: number | null = null;

  /** Fills the left column's card panel from the hand as it stands now.
   *
   *  Called by `renderHand`, by the hover and focus changes, and by
   *  `setArmed`. Everything in it - the block reason, the modifiers, the
   *  odds, the target list - is an answer about the board as it stands, so a
   *  panel left open across a repaint is rebuilt rather than left quoting the
   *  board before the play. */
  function renderCardPanel(): void {
    const index = shownCardIndex();
    const human = lastState === null ? undefined : humanPlayer(lastState);
    const cardId = index === null ? undefined : human?.hand[index];
    if (index === null || cardId === undefined) {
      cardPanel.classList.add("hidden");
      cardPanel.replaceChildren();
      shownCard = null;
      return;
    }
    const scroll = shownCard === index ? cardPanel.scrollTop : 0;
    shownCard = index;
    cardPanel.classList.remove("hidden");
    cardPanel.replaceChildren(
      ...cardTipParts(cardId, lastState !== null && handLive(lastState)),
    );
    cardPanel.scrollTop = scroll;
  }

  /** A card's whole popup, in reading order. Docked in the column it opens
   *  with the card's NAME: above the fan it sat on the card face that named
   *  it, and in the corner it would otherwise be anonymous. */
  function cardTipParts(cardId: string, live: boolean): Node[] {
    const parts: Node[] = [];
    const title = document.createElement("div");
    title.className = "card-panel-name";
    title.textContent = CARDS[cardId]?.name ?? cardId;
    parts.push(title);
    const blocked = live ? cb.cardBlocked?.(cardId) ?? null : null;
    if (blocked !== null) {
      const line = document.createElement("div");
      line.className = "card-tip-blocked";
      line.textContent = blocked;
      parts.push(line);
    }
    for (const text of cb.cardModifiers?.(cardId) ?? []) {
      const modifier = document.createElement("div");
      modifier.className = "card-tip-modifier";
      modifier.textContent = text;
      parts.push(modifier);
    }
    const description = document.createElement("div");
    description.className = "card-tip-description";
    description.textContent = CARDS[cardId]?.text ?? "";
    parts.push(description);
    // The keyword the card carries, explained on the card that carries it.
    // A rule shared by three cards is a rule the player meets on whichever
    // of them they draw first, so it cannot live only in a rules screen.
    const keyword = keywordBlock(cardId);
    if (keyword !== null) parts.push(keyword);
    // Under the description, above the targets: the card's own failure mode
    // is a fact about the card, so it reads with the card's text, and it has
    // to be there before the player starts comparing candidates.
    const risk = cb.cardRisk?.(cardId) ?? null;
    if (risk !== null) parts.push(riskBand(risk));
    const explanations = CARDS[cardId]?.targeted
      ? cb.targetExplanations?.(cardId) ?? []
      : [];
    if (explanations.length > 0) {
      const targets = document.createElement("section");
      targets.className = "card-tip-targets";
      const heading = document.createElement("div");
      heading.className = "card-tip-targets-heading";
      heading.textContent = "Potential targets";
      targets.appendChild(heading);
      for (const explanation of explanations) {
        const candidate = document.createElement("div");
        candidate.className = explanation.available
          ? "card-tip-candidate available"
          : "card-tip-candidate blocked";
        for (const lineText of explanation.lines) {
          const line = document.createElement("div");
          line.className = "card-tip-candidate-line";
          line.textContent = lineText;
          candidate.appendChild(line);
        }
        // The same band as the card-level one, so "this can come back with
        // nothing" is one shape wherever it appears rather than a warning at
        // the top and an ordinary sentence down here.
        for (const lineText of explanation.risk) {
          candidate.appendChild(riskBand(lineText));
        }
        targets.appendChild(candidate);
      }
      parts.push(targets);
    }
    return parts;
  }

  function renderHand(state: GameState): void {
    hand.replaceChildren();
    // See `hoveredCard`: the elements the pointer and the focus were on are
    // about to be detached, and a detached element never reports that they
    // left it.
    hoveredCard = null;
    const human = humanPlayer(state);
    if (!human) {
      renderCardPanel();
      return;
    }
    const n = human.hand.length;
    const canPlay = handLive(state);
    const canPlayCardCb = cb.canPlayCard ?? (() => true);
    human.hand.forEach((cardId, i) => {
      const card = document.createElement("button");
      card.className = "card";
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = CARDS[cardId]?.name ?? cardId;
      card.append(name);
      // The rules text is read in the left column, not over the map. Pointing
      // at a card is what asks for it, and the panel is one element for the
      // whole hand - see `renderCardPanel`.
      card.addEventListener("pointerenter", () => {
        hoveredCard = i;
        renderCardPanel();
      });
      card.addEventListener("pointerleave", () => {
        if (hoveredCard === i) hoveredCard = null;
        renderCardPanel();
      });
      card.addEventListener("focus", () => {
        hoveredCard = i;
        renderCardPanel();
      });
      card.addEventListener("blur", () => {
        if (hoveredCard === i) hoveredCard = null;
        renderCardPanel();
      });
      const offset = i - (n - 1) / 2;
      card.style.transform =
        `rotate(${offset * FAN_ANGLE_DEG}deg) ` +
        `translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
      const discardMode = canPlay && (cb.isDiscardMode?.() ?? false);
      const cardAllowed = !canPlay || canPlayCardCb(cardId);
      const playable = canPlay && (discardMode || cardAllowed);
      card.disabled = !canPlay;
      card.setAttribute("aria-disabled", String(!playable));
      card.classList.toggle("discard-hint", discardMode);
      // Grey once the turn is spent, too - not only when the CARD is the
      // problem. A hand that looks live after its one play, under a status
      // line still reading "play a card", is the game telling the player to
      // do something it will refuse.
      card.classList.toggle(
        "unplayable", !canPlay || (!discardMode && !cardAllowed),
      );
      if (playable)
        card.addEventListener("click", () => {
          // A discard commits through this same listener, and earns no play
          // beat to consume what gets set here - `discard` is `never` in
          // `PRESENTATION_RULES`, cued beside the piles instead. Left set, a
          // discard's rect and slot would sit stale until the next play
          // overwrites them, which costs nothing while nothing else reads
          // `pendingPlay` - but the field is a hand INDEX now, not just a
          // flight origin, so a stale one would point a later flight at the
          // wrong card for as long as it took the next play to overwrite it.
          pendingPlay = discardMode
            ? null
            : { rect: card.getBoundingClientRect(), index: i };
          cb.onPlayCard(i);
        });
      hand.appendChild(card);
    });
    // Last, with the hand it describes rebuilt: the panel's block reason, its
    // modifiers and its target list are all answers about the board as it
    // stands now, not the board the panel was opened over.
    renderCardPanel();
  }

  const center = (r: DOMRect): { x: number; y: number } => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });

  // --- the turn gate: waits for the human's play flight, never a timer that
  // guesses its length. See afterPlayAnimation's doc comment and AGENTS.md. --

  const liveFlights = new Set<Flight>();
  /** Play flights asked for but not yet started.
   *
   *  The queue may not reach a play step until whatever was asked for before
   *  it has finished, so "no flight is live" is not the same question as "the
   *  player's card has landed" - between the two the card has not even left
   *  the hand. Reading `liveFlights` alone there released the turn before the
   *  play was drawn: the AI round resolved, and the summary went up, over a
   *  card the player had not been shown yet. */
  let queuedPlayFlights = 0;
  const playPending = (): boolean =>
    liveFlights.size > 0 || queuedPlayFlights > 0;
  /** Callers waiting for the played card to land - see `afterPlayAnimation`.
   *  A list and not a slot: two of them waiting is two answers owed, and a
   *  slot silently drops the first. */
  const playWaiters: (() => void)[] = [];
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function releasePlayWaiters(): void {
    if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    const waiting = playWaiters.splice(0, playWaiters.length);
    for (const fn of waiting) fn();
  }

  function cancelLiveFlights(): void {
    // Copy first: a flight's own onDone removes itself from liveFlights, so
    // mutating the Set while iterating it would skip entries.
    for (const flight of [...liveFlights]) flight.cancel();
    // A play still queued belongs to a run that has ended or a game that has
    // been replaced, so nothing is owed it. Dropping the queue's own pending
    // steps is `animations.clear()`'s job, not this counter's.
    queuedPlayFlights = 0;
    animations.clear();
  }

  /** Arms the last-resort net against the flights actually in the air. Called
   *  again when a queued play finally starts, because until then there is no
   *  `totalMs` to derive a deadline from - and deriving one any other way is
   *  the duration copy AGENTS.md forbids. */
  function armFlightWatchdog(): void {
    if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    if (playWaiters.length === 0 || liveFlights.size === 0) return;
    const longestMs = Math.max(...[...liveFlights].map((f) => f.totalMs));
    watchdog = setTimeout(() => {
      // A flight past its deadline never reported itself done, so its queue
      // step is wedged too - cancel it (which fires its onDone, releasing the
      // step) rather than settling around it, or every stage waiting behind
      // the animation queue would wait for good.
      for (const flight of [...liveFlights]) flight.cancel();
      releasePlayWaiters();
    }, longestMs + FLIGHT_WATCHDOG_SLACK_MS);
  }

  /** The card flying out of the deck and into the hand.
   *
   *  Nothing in the hand is hidden while it flies, and nothing needs to be:
   *  the beat runs before the commit that repaints the hand, so the card this
   *  flight is about is not on screen until it has landed. The hand it flies
   *  INTO is the one the player was already looking at. */
  function animateDraw(sound: SoundName | null): void {
    const from = deckPile.root.getBoundingClientRect();
    // Not tracked in liveFlights - the turn does not wait on a draw - but
    // queued like everything else, so it never plays over a card in flight.
    animations.push((done) => {
      cue(sound);
      flyCard(
        container,
        "back",
        "",
        { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
        [{ to: center(hand.getBoundingClientRect()), scale: 1, durationMs: DRAW_MS }],
        done,
      );
    });
  }

  function animatePlay(cardId: string, sound: SoundName | null): void {
    // The rect is read NOW, while the card is still where the player left it -
    // the queue may not reach this step until the hand has been re-rendered,
    // and a flight starting from a stale layout would jump.
    const from = pendingPlay?.rect ?? hand.getBoundingClientRect();
    const slot = pendingPlay?.index;
    pendingPlay = null;
    queuedPlayFlights += 1;
    animations.push((done) => {
      queuedPlayFlights -= 1;
      runPlayFlight(cardId, from, slot, sound, done);
      armFlightWatchdog();
    });
  }

  function runPlayFlight(
    cardId: string, from: DOMRect | { x: number; y: number },
    slot: number | undefined,
    sound: SoundName | null,
    done: () => void,
  ): void {
    cue(sound);
    // The slot the card left, emptied for the length of the flight. The commit
    // behind this beat renders the hand without the card for good; until then
    // the hand on screen is the one the player clicked in, and a card cannot
    // be both in it and flying out of it.
    const left = slot === undefined ? null : hand.children[slot] ?? null;
    left?.classList.add("card-outgoing");
    const flight = flyCard(
      container,
      "",
      cardName(cardId),
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [
        {
          to: center(container.getBoundingClientRect()),
          scale: PLAY_CENTER_SCALE,
          durationMs: PLAY_TO_CENTER_MS,
          holdMs: PLAY_HOLD_MS,
        },
        {
          to: center(discardPile.root.getBoundingClientRect()),
          scale: 0.6,
          durationMs: PLAY_TO_DISCARD_MS,
        },
      ],
      () => {
        left?.classList.remove("card-outgoing");
        liveFlights.delete(flight);
        if (!playPending()) releasePlayWaiters();
        done();
      },
    );
    liveFlights.add(flight);
  }

  function pulseDeck(sound: SoundName | null): void {
    animations.push((done) => {
      cue(sound);
      deckPile.root.classList.add("pulse");
      runAnimation(
        deckPile.stack,
        [
          { offset: 0, transform: "scale(1)" },
          { offset: 0.5, transform: "scale(1.12)" },
          { offset: 1, transform: "scale(1)" },
        ],
        RESHUFFLE_PULSE_MS,
        () => {
          deckPile.root.classList.remove("pulse");
          done();
        },
      );
    });
  }

  const cue = (sound: SoundName | null): void => {
    if (sound !== null) cb.cue?.(sound);
  };

  /** The local seat's events that earn NO beat at all: a discard, a tribute,
   *  a turnip earned, a card burned out of the piles. `PRESENTATION_RULES`
   *  calls each of them `never` because the hand or the turnip bar is its
   *  surface and there is no land to frame - so nothing on the queue carries
   *  their sound, and they cue here, immediately.
   *
   *  Every other sound rides the beat that draws its moment, so the ear and
   *  the eye agree on when. Asked of the table rather than listed here: a
   *  type that stops being presented must not go silent for the sake of a
   *  list somebody forgot. */
  function cueUnpresented(fresh: GameEvent[]): void {
    for (const e of fresh) {
      if (e.playerId !== localPlayerId()) continue;
      if (PRESENTATION_RULES[e.type].kind !== "never") continue;
      cue(EVENT_SOUNDS[e.type]);
    }
  }

  let lastState: GameState | null = null;
  /** The armed hand index, held only so the status bar knows the "choose a
   *  target" line is up and must not be overwritten from under the player. */
  let armedIndex: number | null = null;

  function renderStatus(state: GameState): void {
    const humanFaction = humanPlayer(state)?.factionId;
    const showWealth = state.phase === "playing" && humanFaction !== undefined;
    wealthChip.classList.toggle("hidden", !showWealth);
    if (showWealth) {
      const view = viewOf(state);
      wealthChip.textContent =
        `Wealth ${wealthOf(view, humanFaction)} ` +
        `(+${wealthIncomeFor(view, humanFaction)}/turn)`;
      // The same call `beginTurn` refills against, so the chip and the draw
      // cannot quote different numbers - the turnip bar's rule one chip over.
      handChip.classList.remove("hidden");
      handChip.textContent = `Hand ${handLimitFor(state, humanFaction)}`;
      const rulerName = rulerNameOf(state.rulers, humanFaction);
      rulerChip.classList.toggle("hidden", rulerName === null);
      if (rulerName !== null) {
        rulerChip.textContent = rulerName;
        rulerTip = rulerTipLines(rulerName, view, humanFaction);
      } else {
        rulerTip = [];
      }
      // Lowercase "turnips": the common noun, per the naming rule - the card
      // is named in the hover explanation, where it can be read in full.
      // The LOCAL seat's own counter - every seat counts now.
      const human = humanPlayer(state);
      const into = state.turnips[humanFaction] ?? 0;
      const holdsTurnip =
        human !== undefined && (
          human.deck.includes("grow-crops") ||
          human.hand.includes("grow-crops") ||
          human.discard.includes("grow-crops"));
      const showTurnips = into > 0 || holdsTurnip;
      turnipChip.classList.toggle("hidden", !showTurnips);
      if (showTurnips) {
        // The seat's OWN threshold: a big home land waits longer between
        // harvests, so a flat number here would be a bar that never filled
        // where it said it would.
        const span = turnipThresholdOn(view, humanFaction);
        turnipCount.textContent = `Turnips ${into}/${span}`;
        turnipFill.style.width = `${Math.round((into / span) * 100)}%`;
      }
    } else {
      handChip.classList.add("hidden");
      rulerChip.classList.add("hidden");
      rulerTip = [];
      turnipChip.classList.add("hidden");
    }
    if (state.phase === "pick-faction") {
      // On a map that opens with realms already standing, the greyed lands
      // need a reason before the player hovers one - a prompt that asks for
      // any faction while half the map refuses the click is the prompt lying.
      // Asked of the board, so a region with no seeded realms is unchanged.
      statusText.textContent = state.overlords.size > 0 ||
        Object.keys(state.incorporated).length > 0
        ? "Choose a faction that answers to nobody"
        : "Choose your faction";
    } else if (state.phase === "playing") {
      // A remote seat holding the turn outranks everything else here: while
      // it is up, nothing the player does locally (a pin, a target) changes
      // that they are waiting, and the bar has to say so plainly.
      if (waitingFaction !== null) {
        statusText.replaceChildren(
          renderSegments(
            // No name appended here: the faction segment brings its player's
            // name with it, like every other faction the HUD draws.
            [t("Waiting for "), faction(waitingFaction), t("...")],
            richTextHooks,
          ),
        );
      } else if (pinnedFaction !== null) {
        // The pin outranks the turn prompt: while it is up, the one thing the
        // player needs from this bar is what is pinned and how to let go of it.
        // A segment, not a string - the name lights its realm here too.
        statusText.replaceChildren(
          renderSegments(
            [t("Pinned: "), faction(pinnedFaction), t(" - Esc to clear")],
            richTextHooks,
          ),
        );
      } else if (isLocalTurn(state)) {
        if (state.rules.turn === "unlimited") {
          statusText.textContent =
            `Turn ${state.turn} - play cards, then end your turn`;
        } else if (state.playedThisTurn) {
          // A spent standard turn is asking for one thing only, and it is not
          // a card - unless the play that spent it re-opened it for another of
          // its own kind AND one is still legal. Saying "play a card" over a
          // hand the rules will refuse is the game giving an instruction it
          // will not honour; so is offering the repeat once the armies for it
          // have run out.
          //
          // The card is a segment, not a name spliced into the sentence: this
          // is the line that teaches the rule, so pointing at the name has to
          // say what the card does, here as everywhere else. Nothing here
          // knows WHICH cards - `repeatGroup` names a group, and the hand
          // answers which of its members are actually playable.
          const repeat = state.repeatGroup;
          const hand = humanPlayer(state)?.hand ?? [];
          const offers = [...new Set(hand.filter(
            (c) => repeatGroupOf(c) === repeat && (cb.canPlayCard?.(c) ?? true),
          ))];
          if (repeat !== null && offers.length > 0) {
            statusText.replaceChildren(
              renderSegments(
                // One card of the group left: name it, and the name teaches.
                // Several: the group's common noun, because picking one of
                // them to name would tell the player the wrong thing about
                // what the turn will take.
                offers.length === 1
                  ? [
                      t(`Turn ${state.turn} - `), card(offers[0]),
                      t(" again, or end your turn"),
                    ]
                  : [t(
                      `Turn ${state.turn} - another `
                      + `${KEYWORDS[repeat]?.noun ?? "card"}`
                      + ", or end your turn",
                    )],
                richTextHooks,
              ),
            );
          } else {
            statusText.textContent = `Turn ${state.turn} - end your turn`;
          }
        } else {
          statusText.textContent = (cb.isDiscardMode?.() ?? false)
            ? "No playable card - discard one"
            : `Turn ${state.turn} - play a card`;
        }
      } else {
        statusText.textContent = "Waiting on other players...";
      }
    }
  }

  function renderScoreboard(state: GameState): void {
    const human = humanPlayer(state);
    const rows = standingsFor({
      // One row per faction with a LEADER, in seat order. A land nobody leads
      // is ground, not a contender - and if a card ever seats a chief on one,
      // it joins the board the same turn it joins the game.
      acting: state.players
        .map((pl) => pl.factionId)
        .filter((f) => hasRuler(state.rulers, f)),
      humanFactionId: human?.factionId,
      // `fullRealmOf`, the same count the win condition applies: a land a vassal
      // annexed already sits inside its lord's outline on the map, so a
      // scoreboard that walked one level was quoting a smaller realm than the
      // one the player could see.
      realmSize: (f) => fullRealmOf(f, state.overlords, state.incorporated).size,
      incorporated: state.incorporated,
      // Per faction, because a player holding out for the whole map is
      // ranked here against rivals who still need only half.
      needed: (f) => winSizeFor(state, f),
    });
    scoreboard.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement("div");
        row.className = "sb-row";
        row.classList.toggle("sb-you", r.isHuman);
        const who = document.createElement("span");
        who.className = "sb-who";
        if (r.isHuman) who.textContent = "You";
        else {
          // The "(Bela)" beside the name comes from `renderSegments` itself
          // now - every faction name in the HUD carries it, not just this row
          // - so there is deliberately nothing to append here. A second append
          // would read "Curonians (Bela) (Bela)".
          who.replaceChildren(renderSegments([faction(r.factionId)], richTextHooks));
        }
        const lands = document.createElement("span");
        lands.className = "sb-lands";
        lands.textContent = `${r.lands}/${r.needed} lands`;
        const pct = document.createElement("span");
        pct.className = "sb-pct";
        pct.textContent = `${r.percent}%`;
        row.append(who, lands, pct);
        return row;
      }),
    );
  }

  /** The milestones table, for whichever faction the player is looking at:
   *  the highlighted one - a name hovered in prose, a land hovered or pinned -
   *  and otherwise your own. That is the whole interaction the drawer has:
   *  point at somebody and the bars answer for them. */
  function renderMilestones(state: GameState): void {
    if (!milestonesOpen) return;
    const acting = state.players
      .map((pl) => pl.factionId)
      .filter((f) => hasRuler(state.rulers, f));
    const focus = highlightedFaction ?? humanPlayer(state)?.factionId;
    const rows = milestoneStandings(state, acting, focus);

    const head = document.createElement("div");
    head.className = "ms-head";
    const title = document.createElement("span");
    title.textContent = "Victory milestones";
    const who = document.createElement("span");
    who.className = "ms-focus";
    if (focus !== undefined) {
      who.append(
        renderSegments([faction(focus)], richTextHooks),
        document.createTextNode(
          ` - ${count(milestonePoints(state, focus), "point")}`,
        ),
      );
    }
    head.append(title, who);

    const table = document.createElement("div");
    table.className = "ms-table";
    for (const row of rows) {
      const el = document.createElement("div");
      el.className = "ms-row";
      el.classList.toggle("ms-done", row.done);

      const name = document.createElement("div");
      name.className = "ms-name";
      name.textContent = row.milestone.name;
      const points = document.createElement("span");
      points.className = "ms-points";
      points.textContent = `${row.milestone.points} VP`;
      name.appendChild(points);

      const text = document.createElement("div");
      text.className = "ms-text";
      // Nodes where the line names a card, flat text where it names nothing.
      if (row.milestone.textSegments !== undefined) {
        text.appendChild(
          renderSegments(row.milestone.textSegments, richTextHooks),
        );
      } else {
        text.textContent = row.milestone.text;
      }

      const bar = document.createElement("div");
      bar.className = "ms-bar";
      const fill = document.createElement("div");
      fill.className = "ms-fill";
      fill.style.width = `${(row.progress / row.milestone.goal) * 100}%`;
      bar.appendChild(fill);
      const figure = document.createElement("span");
      figure.className = "ms-figure";
      figure.textContent = `${row.progress} / ${row.milestone.goal}`;

      const badges = document.createElement("div");
      badges.className = "ms-badges";
      // One badge per faction that has it, names as nodes: hovering a badge
      // lights that realm on the map, which is how the table answers "who".
      for (const f of row.achievedBy) {
        const badge = document.createElement("span");
        badge.className = "ms-badge";
        badge.appendChild(renderSegments([faction(f)], richTextHooks));
        badges.appendChild(badge);
      }

      el.append(name, text, bar, figure, badges);
      table.appendChild(el);
    }
    milestonesDrawer.replaceChildren(head, table);
  }

  /** The cause line is the one place the postmortem names a faction, so it is
   *  built from segments like every other named thing in the game (AGENTS.md):
   *  the name is a node the player can point at to light that realm up on the
   *  map, not inert text on a screen they see once. */
  function setCause(segments: Segment[]): void {
    pmCause.replaceChildren(renderSegments(segments, richTextHooks));
  }

  /** The last five things the ender aimed at you, for the postmortem's
   *  killer-versus-you block. */
  function renderEnderComparison(state: GameState, ender: string): void {
    const human = humanPlayer(state)!;
    pmDeltas.textContent = "";
    const enderPlayer = state.players.find((p) => p.factionId === ender);
    const plays = state.log
      .filter(
        (e) =>
          e.type === "play" &&
          e.playerId === enderPlayer?.id &&
          e.targetFactionId === human.factionId,
      )
      .slice(-5);
    // Names cards in plain text, and deliberately does not hide a secret one:
    // the postmortem reveals everything (see pmLog below). The filter above is
    // also why no secret card can reach here today - it keeps only plays aimed
    // at the human, and Bodyguard is untargeted. A future TARGETED secret card
    // would land here, and this is the second of the two places it must check.
    pmBuildup.replaceChildren(
      ...plays.map((e) => {
        const d = document.createElement("div");
        d.className = "pm-buildup-entry";
        d.textContent = `${cardName(e.cardId)} (turn ${e.turn})`;
        return d;
      }),
    );
  }

  function renderPostmortem(state: GameState): void {
    const human = humanPlayer(state)!;
    const won = state.phase === "victory";
    // The words themselves. "Game over" is the one thing a player reads on
    // this screen first, and it says nothing about which way it went - the
    // verdict was left to be inferred from a sentence naming somebody else.
    pmTitle.textContent = won ? "You won" : "You lost";
    // How long they have been at it, under the result on every ending. The
    // clock is the caller's - see `HudCallbacks.elapsedMs`.
    const elapsed = cb.elapsedMs?.();
    pmElapsed.textContent =
      elapsed === undefined ? "" : `Run time - ${formatElapsed(elapsed)}`;
    if (won) {
      const size = fullRealmOf(
        human.factionId, state.overlords, state.incorporated,
      ).size;
      setCause([
        t(state.playingOn
          // The whole map, which is what a run played on was held out for.
          // Off `playingOn` and not off the size: a first victory that
          // happened to sweep the board is still a run the player never
          // chose to extend, and saying otherwise would credit them with a
          // decision they were never offered.
          ? `The whole of the Baltic is yours - ${size} of ` +
            `${state.factionIds.length} lands`
          : `You rule the Baltic - ${size} of ${state.factionIds.length} lands`),
      ]);
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else if (state.log.some((e) => e.type === "surrendered")) {
      // Conceding has no killer and no buildup to explain. Say what happened
      // and how far off the pace they were, and leave it at that.
      //
      // Whose concession it was decides the sentence. Only the host seat can
      // surrender (the engine's endings pivot on it), so on a guest's screen
      // this run ended by somebody else's choice - and "You conceded" over a
      // game the player was still playing is simply a lie. The other party is
      // named by role, not by faction: the surrendering seat's faction is on
      // the map either way, and a name here would be inert text the naming
      // rule exists to prevent.
      const mine = state.log.some(
        (e) => e.type === "surrendered" && e.playerId === localPlayerId(),
      );
      const size = fullRealmOf(
        human.factionId, state.overlords, state.incorporated,
      ).size;
      pmTitle.textContent = mine ? "You conceded" : "You won";
      setCause([
        t(mine
          ? `You conceded with ${size} of the ` +
            `${winSizeFor(state, human.factionId)} lands needed`
          : `Your opponent conceded, ending the game. You held ${size} of ` +
            `the ${winSizeFor(state, human.factionId)} lands needed`),
      ]);
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else {
      // A rival unification ends the game the same way an incorporation does,
      // but there is no killer-vs-you comparison to show - just name the winner.
      const unified = [...state.log].reverse().find((e) => e.type === "unified");
      if (unified !== undefined) {
        // Named the way the log names an actor: a chief and their people. The
        // faction alone left the run ending at the hands of a map label.
        const chief = unified.actorRuler;
        setCause([
          ...(chief === undefined || chief === ""
            ? [faction(unified.overlordFactionId ?? "")]
            : [t(`${chief} of `), theFaction(unified.overlordFactionId ?? "")]),
          t(" unified the Balts"),
        ]);
        pmDeltas.textContent = "";
        pmBuildup.replaceChildren();
      } else {
        // The BOARD first, the log second. A second person annexed while the
        // host plays on has a defeat their own screen worked out from
        // `incorporated` (`guestPhaseView`), so there is no `defeat` event to
        // read and this line rendered an empty faction name. The store holds
        // the same answer for the host anyway; the event is the fallback for
        // an ending whose annexation has since been undone.
        const defeatEvent = [...state.log].reverse().find((e) => e.type === "defeat");
        const killer =
          state.incorporated[human.factionId] ?? defeatEvent?.overlordFactionId;
        setCause([t("Incorporated by "), faction(killer ?? "")]);
        if (killer !== undefined) {
          renderEnderComparison(state, killer);
        }
      }
    }
    pmLog.replaceChildren(
      ...state.log.filter((e) => e.type !== "draw").map((e) => {
        const d = document.createElement("div");
        d.className = "log-entry";
        // Reveal: the run is over, so there is no secret left to keep. A player
        // reading back a finished game is owed what everyone was holding.
        d.replaceChildren(
          renderSegments(eventSegments(e, state, true, localPlayerId()), richTextHooks),
        );
        d.classList.toggle("log-you", involvesHuman(e, human?.factionId));
        // Same nesting as the activity log. No cause to tag here: the
        // postmortem has no filter to hide one.
        d.classList.toggle("log-consequence", e.consequence === true);
        return d;
      }),
    );
    // The end of the run, not the start of it. This log is read backwards from
    // whatever just happened - the play that ended the game is its last line,
    // and opening at turn 1 buries it under a hundred others.
    pmLog.scrollTop = pmLog.scrollHeight;
  }

  return {
    update(state, opts) {
      const animate = opts?.animate !== false;
      lastState = state;
      if (state.phase !== "playing") {
        hideSummary();
        // A run that ended, or a fresh game, must never leave afterPlayAnimation's
        // caller waiting forever on a flight that will now never land.
        cancelLiveFlights();
        releasePlayWaiters();
      }
      const ended = state.phase === "victory" || state.phase === "defeat";
      menu.classList.toggle("hidden", state.phase !== "main-menu");
      status.classList.toggle(
        "hidden",
        state.phase === "main-menu" || state.phase === "deck-building" || ended,
      );
      deckPile.root.classList.toggle("hidden", state.phase !== "playing");
      discardPile.root.classList.toggle("hidden", state.phase !== "playing");
      hand.classList.toggle("hidden", state.phase !== "playing");
      logPanel.classList.toggle("hidden", state.phase !== "playing");
      // Taken DOWN here and put up only by `showPostmortem`: a repaint happens
      // several times per move, and the first one to notice the phase is the
      // commit - with the question this conquest raised, the round's summary
      // and the marches still to be shown all behind it.
      if (!ended) {
        postmortem.classList.add("hidden");
        // A run that is not over cannot have its result stood aside: without
        // this the toggle survives into the next game and hides the screen it
        // was meant to reveal.
        setPostmortemAside(false);
      }
      scoreboard.classList.toggle("hidden", state.phase !== "playing");
      milestonesBtn.classList.toggle("hidden", state.phase !== "playing");
      // Phase only: `.open` is what the button drives, and having the two
      // decide visibility together is what hid a drawer somebody had opened.
      milestonesDrawer.classList.toggle("hidden", state.phase !== "playing");
      surrenderBtn.classList.toggle(
        "hidden",
        state.phase !== "playing" || cb.onSurrender === undefined,
      );
      if (state.phase !== "playing") disarmSurrender();
      // The gate is the PHASE and not the title: the concede branch prints
      // "You won" over a `defeat` phase, and that run has nothing to resume.
      // `playingOn` is what makes the whole-map ending offer nothing - the
      // bar moves once.
      pmKeepPlaying.classList.toggle(
        "hidden",
        state.phase !== "victory" || state.playingOn ||
          cb.onKeepPlaying === undefined,
      );
      // Shown under EVERY rule set now: a turn never ends itself, so this is
      // the only way a round is handed over and it cannot be a control that
      // appears only for one turn structure.
      endTurnBtn.classList.toggle(
        "hidden",
        state.phase !== "playing" || cb.onEndTurn === undefined,
      );
      // Enabled when it can actually do something: a spent standard turn (the
      // hand-over it now owns), or an unlimited turn, which may be closed at
      // any point. A standard turn with the card still unplayed has no
      // hand-over to give - the turn IS the card - so the button is disabled
      // rather than left live and inert.
      endTurnBtn.disabled =
        !isLocalTurn(state) ||
        (cb.isResolving?.() ?? false) ||
        (state.rules.turn !== "unlimited" && !state.playedThisTurn);
      // A run ending or a new game must not leave a harvest choice hanging
      // over the wrong screen - the hideSummary reasoning, same shape.
      if (state.phase !== "playing") hideHarvestUi();

      renderStatus(state);

      if (state.phase === "playing") {
        const human = humanPlayer(state)!;
        renderPile(deckPile, human.deck.length);
        renderPile(discardPile, human.discard.length);
        renderHand(state);
        renderScoreboard(state);
        renderMilestones(state);
        const fresh = renderLog(state, animate);
        if (animate) {
          cueUnpresented(fresh);
          // Folded in, never shown here: which move the player is owed an
          // interruption for is the caller's question, and it asks it through
          // `raiseRoundSummary`. A silent paint is history arriving whole and
          // has nothing to interrupt for, so its batch is dropped rather than
          // kept for the next modal.
          roundEvents.push(...fresh);
        } else {
          roundEvents = [];
        }
      }
    },
    raiseRoundSummary,
    dropRoundNews: hideSummary,
    dropFlights() {
      cancelLiveFlights();
      releasePlayWaiters();
    },
    runHudBeat(beat) {
      switch (beat.motion) {
        case "draw":
          animateDraw(beat.sound);
          return;
        case "play":
          animatePlay(beat.cardId ?? "", beat.sound);
          return;
        case "pulse":
          pulseDeck(beat.sound);
          return;
        // The gained card's own reveal is raised by the harvest flow that
        // asked for it (`revealGainedCards`), which is a longer sequence than
        // one beat and outlives the transition that earned it. What the beat
        // owes is the moment in the round where the pick registers, and that
        // is its sound - queued rather than cued on the spot, so it lands in
        // the order the batch put it in.
        case "reveal":
          animations.push((done) => {
            cue(beat.sound);
            done();
          });
          return;
      }
    },
    showPostmortem(state) {
      renderPostmortem(state);
      postmortem.classList.remove("hidden");
    },
    noticeWalk,
    setArmed(index, cardNameText, prompt) {
      armedIndex = index;
      [...hand.children].forEach((el, i) => {
        el.classList.toggle("card-armed", i === index);
      });
      // The armed card keeps its own rules text up while the map is being
      // aimed at, with the pointer nowhere near the fan - which is the whole
      // reason the panel is in the column rather than over the map.
      renderCardPanel();
      if (index !== null && prompt !== undefined) {
        statusText.textContent = prompt;
      } else if (index !== null && cardNameText !== undefined) {
        statusText.textContent = `Choose a target for ${cardNameText}`;
      } else if (lastState) {
        renderStatus(lastState);
      }
    },
    afterPlayAnimation(fn) {
      // Nothing flew and nothing is coming - a forced discard, a play the
      // local seat did not make. Still asynchronous, so a caller's continuation
      // never runs inside its own call.
      if (!playPending()) {
        setTimeout(fn, 0);
        return;
      }
      playWaiters.push(fn);
      // A play still queued arms nothing yet: `animatePlay`'s step calls
      // `armFlightWatchdog` the moment its flight exists.
      armFlightWatchdog();
    },
    setPinned(factionId) {
      if (factionId === pinnedFaction) return;
      pinnedFaction = factionId;
      applyRealmFilter(lastState);
      // An armed card owns the bar - it is asking for a target, and a click on
      // the map answers it rather than pinning. setArmed(null) renders again.
      if (lastState !== null && armedIndex === null) renderStatus(lastState);
    },
    setPinnedLand(lines) {
      pinnedPanel.classList.toggle("hidden", lines === null);
      // The sub-box explains a word in the panel above it, so it cannot
      // outlive the panel, and it must not outlive a re-render either: the
      // node the pointer was over is gone.
      pinnedTip.classList.add("hidden");
      if (lines === null) {
        pinnedPanel.replaceChildren();
        return;
      }
      // The same renderer and the same classes the floating tip uses, so the
      // two boxes are one box in two places. The panel's only difference is
      // that the pointer can reach it, which is what earns the segments: a
      // faction the first line names lights its realm, exactly as in the log.
      fillTooltipLines(
        pinnedPanel, lines, (segs) => renderSegments(segs, pinnedHooks),
      );
    },
    pinnedLandBottom() {
      if (pinnedPanel.classList.contains("hidden")) return null;
      // Plus the column's own gap, so the tip sits in the stack rather than
      // flush against the panel.
      return pinnedPanel.getBoundingClientRect().bottom + PINNED_STACK_GAP_PX;
    },
    setWaiting(factionId) {
      waitingFaction = factionId;
      if (lastState !== null) renderStatus(lastState);
    },
    highlightFaction(factionId) {
      // The hover that drives this fires on mousemove, so it arrives once per
      // pixel of travel across the same name: everything below is skipped
      // while the answer cannot have changed.
      if (factionId === highlightedFaction) return;
      highlightedFaction = factionId;
      // The drawer answers for whoever is highlighted, so it moves with the
      // pointer exactly as the log dimming does.
      if (lastState !== null) renderMilestones(lastState);
      logPanel.classList.toggle("log-highlighting", factionId !== null);
      for (const entry of logEntries.children) {
        if (entry instanceof HTMLElement && entry.classList.contains("log-entry")) {
          applyLogHighlight(entry);
        }
      }
    },
    showHarvestOffer,
    revealGainedCards,
    showTransferOffer,
    hideHarvestUi,
  };
}
