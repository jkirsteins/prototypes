import { CARDS, guardAgainst } from "./cards";
import {
  TURNIP_HARVEST_THRESHOLD, victoryRealmSize, viewOf,
  type GameEvent, type GameState,
} from "./game";
import { flyCard, runAnimation, type Flight } from "./animate";
import { fullRealmOf, incorporatedRealmOf } from "./relations";
import {
  buildRoundSummary, isNoticeWorthy, walkCtxOf,
  type NoticeCtx, type RoundSummary,
} from "./notices";
import {
  defenseMaxOf, defenseOf, diseaseOn, subjugationGateOpen,
} from "./defense";
import { walkStandings, type StandingChange } from "./standings";
import { wealthIncomeFor, wealthOf } from "./playability";
import {
  multipliedWord, type TargetExplanation,
} from "./target-explanations";
import type { TooltipLine } from "./panel";
import { memoryStorage, type MetaStorage } from "./meta";
import { standingChangeText, standingsFor } from "./view";
import {
  card, cardName, cardTextSegments, faction, factionIds, possessive,
  renderSegments, t, theFaction, verb,
  type RichTextHooks, type Segment, type Speaker, type Verb,
} from "./rich-text";

export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  /** Concede the run. Absent in contexts with no seat to concede (tests). */
  onSurrender?(): void;
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
}

export interface Hud {
  /** `animate: false` renders the state as already-settled: no card flies, no
   *  line flashes, and no round summary is raised. It exists for the first
   *  paint of a state the player did not play into - a `?turns=` boot - where
   *  the whole log is "fresh" by definition, and the ordinary path would fly a
   *  card per human event at once and then drop a round-summary modal over the
   *  board a second after load, unasked. Every later update animates normally,
   *  because `renderedEvents` has caught up by then. */
  update(state: GameState, opts?: { animate?: boolean }): void;
  setArmed(index: number | null, cardName?: string): void;
  /** Runs `fn` once the play flight started by the most recent `update()` has
   *  landed. Fires exactly once, always:
   *   - nothing in the air (a forced discard animates nothing, and an AI
   *     action never animates) -> next macrotask, so the caller cannot
   *     re-enter the click handler whose `renderHand` just replaced the
   *     button it came from;
   *   - a flight is in the air -> when it reports itself finished;
   *   - a flight is cancelled (a new game, the run ending) -> immediately.
   *  The HUD holds no duration of its own: it counts live flights and waits
   *  for each one to report itself done, per the rule in AGENTS.md. A second
   *  call replaces a still-pending one - only one human turn can be
   *  resolving at a time, and the replaced continuation is by definition
   *  stale. */
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
  showHarvestOffer(
    offer: string[],
    hooks: { onPick(cardId: string): void; onSkip(): void; onCancel(): void },
  ): void;
  /** Closes the harvest overlay. Safe when none is up. */
  hideHarvestUi(): void;
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
      return clause(actor, "play", [
        t(" "), card(e.cardId ?? ""),
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
    case "damaged":
      // Invariant subject - the defenses are what the line is about, and the
      // actor is already named on the play this nests under. The numbers ride
      // in the impactText suffix, the same division of labour as ever.
      return [t("The defenses of "), faction(e.targetFactionId ?? ""), t(" are battered")];
    case "healed":
      return [t("The defenses of "), faction(e.targetFactionId ?? ""), t(" are restored")];
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
    case "march-resolved":
      // Invariant subject like `damaged`, and for a stronger reason: this line
      // does not nest under a play, so it has to name both ends of the arrow
      // itself. `sourceFactionId` is the land the winning army came out of,
      // which on a won counter is the land that was being attacked - so the
      // sentence stays true whichever way the clash went. The numbers ride in
      // the impactText suffix as always.
      return e.clash === undefined
        ? [
            card(e.cardId ?? ""), t(" out of "), faction(e.sourceFactionId ?? ""),
            t(" falls on "), faction(e.targetFactionId ?? ""),
          ]
        : [
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
    case "harvest-picked":
      // Public by decision - see NOTICE_RULES["harvest-picked"]: the pick is
      // drafting, and every seat's log says what every seat kept.
      return clause(actor, "keep", [
        t(" "), card(e.cardId ?? ""), t(" from the harvest"),
      ], "past");
    case "surrendered":
      return clause(actor, "concede", [t(" the Baltic")], "past");
    case "victory":
      return clause(actor, "rule", [t(" the Baltic")]);
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
    return e.type !== "draw";
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
  title.textContent = "Baltic Tribes";
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "menu-new-game";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => cb.onNewGame());
  menu.append(title, newGameBtn);

  if (cb.onResetProgress) {
    const reset = document.createElement("button");
    reset.className = "menu-reset";
    reset.textContent = "Reset progress";
    let armedReset = false;
    const disarmReset = () => {
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
  const pmDeltas = document.createElement("p");
  pmDeltas.className = "pm-deltas";
  const pmBuildup = document.createElement("div");
  pmBuildup.className = "pm-buildup";
  const pmNewGame = document.createElement("button");
  pmNewGame.className = "menu-new-game";
  pmNewGame.textContent = "New game";
  pmNewGame.addEventListener("click", () => cb.onNewGame());
  pmSummary.append(pmTitle, pmCause, pmDeltas, pmBuildup, pmNewGame);
  const pmLog = document.createElement("div");
  pmLog.className = "pm-log";
  postmortem.append(pmSummary, pmLog);

  // Top-right scoreboard: who is closest to ending the run, and where you sit.
  const scoreboard = document.createElement("div");
  scoreboard.className = "scoreboard hidden";

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
  // The player's own ruler's leadership, hidden until a War council play
  // buys the first stack. Attack damage adds it, and it dies with the ruler.
  const leadershipChip = document.createElement("span");
  leadershipChip.className = "status-prowess hidden";
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
  status.append(statusText, wealthChip, leadershipChip, turnipChip);

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

  function hideHarvestUi(): void {
    harvestOverlay.classList.add("hidden");
    harvestOnCancel = null;
    // Same hygiene as dismissSummary: a close with the cursor on a name must
    // not strand its tip or its map halo.
    cb.onHideTip?.();
    cb.onHighlightFaction?.(null);
  }

  function showHarvestOffer(
    offer: string[],
    hooks: { onPick(cardId: string): void; onSkip(): void; onCancel(): void },
  ): void {
    harvestTitle.textContent = "Turnip harvest - keep one card, or none";
    harvestOnCancel = hooks.onCancel;
    const skipBtn = document.createElement("button");
    skipBtn.className = "harvest-option harvest-skip";
    const skipLabel = document.createElement("div");
    skipLabel.className = "harvest-option-label";
    skipLabel.textContent = "Keep nothing - a lean deck draws its best cards sooner";
    skipBtn.appendChild(skipLabel);
    skipBtn.addEventListener("click", () => hooks.onSkip());
    harvestOptions.replaceChildren(
      ...offer.map((cardId) => {
        const btn = document.createElement("button");
        btn.className = "harvest-option";
        const label = document.createElement("div");
        label.className = "harvest-option-label";
        label.appendChild(renderSegments([card(cardId)], richTextHooks));
        btn.appendChild(label);
        // The rules text under the name, like a picker tile: the choice is
        // about what the card does, and a hover-only answer defeats a list.
        const text = document.createElement("div");
        text.className = "harvest-option-text";
        text.appendChild(renderSegments(cardTextSegments(cardId), richTextHooks));
        btn.appendChild(text);
        btn.addEventListener("click", () => hooks.onPick(cardId));
        return btn;
      }),
      skipBtn,
    );
    harvestOverlay.classList.remove("hidden");
  }

  window.addEventListener("keydown", (e) => {
    if (harvestOverlay.classList.contains("hidden")) return;
    if (e.key !== "Escape") return;
    e.preventDefault();
    harvestOnCancel?.();
  });

  /** Shows the round's summary and hides it again on Continue/Escape/Enter -
   *  there is no queue: one AI round is one modal (see AGENTS.md). */
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

  function dismissSummary(): void {
    noticeOverlay.classList.add("hidden");
    // A dismiss with the cursor still over a name must not leave its tip or
    // its map halo stuck on screen.
    cb.onHideTip?.();
    cb.onHighlightFaction?.(null);
    // Releases the AI round a fizzle modal was holding. Unconditional is safe:
    // an AI-round modal has no pending continuation and this no-ops, as does a
    // second dismiss.
    settleTurn();
  }

  function hideSummary(): void {
    noticeOverlay.classList.add("hidden");
    // Torn down rather than shown later. Both callers are ends - the run
    // finishing, and a new game shrinking the log - and a summary about the
    // previous run has nothing to say about either.
    pendingSummary = null;
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

  /** Player-affecting events interrupt once per AI round: build the whole
   *  batch into a single summary and show it, if it has anything to say.
   *
   *  Muting the popup (LogPrefs.showPopups) narrows this rather than silencing
   *  it. A critical event - one that changes what the player is allowed to do
   *  next, see NoticeRule.critical - still interrupts, but alone: the summary
   *  is built from the critical events only, so the mute costs the round's
   *  other news and nothing more. The activity log carries everything either
   *  way. Without this, a player who muted popups could be made someone's
   *  vassal and find out only by noticing their cards had stopped working. */
  function showRoundSummaryIfAny(state: GameState, fresh: GameEvent[]): void {
    if (state.phase !== "playing") return;
    const ctx = buildNoticeCtx(state);
    if (ctx === null) return;
    const summary = buildRoundSummary(fresh, ctx, {
      criticalOnly: !logPrefs.showPopups,
    }, localPlayerId());
    if (summary === null) return;
    // A live flight means one thing only: the local player's own played card
    // is on screen. `animateEvents` skips every event with
    // `playerId !== localPlayerId()` and the draw is deliberately untracked,
    // so this is the honest test for "the turn this summary describes is not
    // over yet" - read off the animation rather than from a predicate that
    // re-guesses which events animate.
    if (liveFlights.size > 0) {
      pendingSummary = summary;
      return;
    }
    showRoundSummary(summary);
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

  container.append(
    menu, postmortem, status, scoreboard, surrenderBtn, endTurnBtn, deckPile.root,
    discardPile.root, hand, logPanel, noticeOverlay, harvestOverlay,
  );

  let pendingPlayRect: DOMRect | null = null;
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
    const noticeCtx = buildNoticeCtx(state);
    // Over the WHOLE log, not just `fresh`: the play a reveal makes public is
    // by definition an older one, and the event that reveals it is the fresh
    // one. Cheap - one pass over an append-only array, once per render.
    const revealed = revealedSecrets(state, localPlayerId());
    // Index-parallel to `fresh`, INCLUDING the events isObservable drops: the
    // walk runs backwards from the leads as they stand now, so a hidden event
    // that moved a counter (a rival's garrison, a draw's reshuffle) has to be
    // stepped back over or every line above it is out by its amount. Which is
    // also why this is indexed by the loop's position in `fresh` and not by
    // how many entries have been appended.
    const changes =
      noticeCtx === null ? [] : walkStandings(fresh, walkCtxOf(noticeCtx));
    // The entry a consequence indents under. A local is enough: the log only
    // ever grows by a whole `appendEvents` batch and `renderedEvents` is set to
    // the full length after every render, so a play and the events it caused are
    // never split across two calls. Assigned only from entries that were
    // actually appended, so a consequence dropped by isObservable (a vassal's
    // hidden `seeded`) leaves the cause standing for the next one.
    let cause: HTMLElement | null = null;
    fresh.forEach((e, i) => {
      const logIndex = base + i;
      if (e.turn !== lastRenderedTurn) {
        const sep = document.createElement("div");
        sep.className = "log-turn";
        sep.textContent = `Turn ${e.turn}`;
        logEntries.appendChild(sep);
        lastRenderedTurn = e.turn;
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

  function renderHand(state: GameState): void {
    hand.replaceChildren();
    const human = humanPlayer(state);
    if (!human) return;
    const n = human.hand.length;
    const canPlay =
      isLocalTurn(state) && !state.playedThisTurn &&
      !(cb.isResolving?.() ?? false);
    const canPlayCardCb = cb.canPlayCard ?? (() => true);
    human.hand.forEach((cardId, i) => {
      const card = document.createElement("button");
      card.className = "card";
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = CARDS[cardId]?.name ?? cardId;
      const tip = document.createElement("div");
      tip.className = "card-tip";
      tip.addEventListener("click", (event) => event.stopPropagation());
      const blocked = canPlay ? cb.cardBlocked?.(cardId) ?? null : null;
      if (blocked !== null) {
        const line = document.createElement("div");
        line.className = "card-tip-blocked";
        line.textContent = blocked;
        tip.appendChild(line);
      }
      for (const text of cb.cardModifiers?.(cardId) ?? []) {
        const modifier = document.createElement("div");
        modifier.className = "card-tip-modifier";
        modifier.textContent = text;
        tip.appendChild(modifier);
      }
      const description = document.createElement("div");
      description.className = "card-tip-description";
      description.textContent = CARDS[cardId]?.text ?? "";
      tip.appendChild(description);
      // Under the description, above the targets: the card's own failure mode
      // is a fact about the card, so it reads with the card's text, and it has
      // to be there before the player starts comparing candidates.
      const risk = cb.cardRisk?.(cardId) ?? null;
      if (risk !== null) tip.appendChild(riskBand(risk));
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
        tip.appendChild(targets);
      }
      card.append(name, tip);
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
      card.classList.toggle(
        "unplayable", canPlay && !discardMode && !cardAllowed,
      );
      if (playable)
        card.addEventListener("click", () => {
          pendingPlayRect = card.getBoundingClientRect();
          cb.onPlayCard(i);
        });
      hand.appendChild(card);
    });
  }

  const center = (r: DOMRect): { x: number; y: number } => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });

  // --- the turn gate: waits for the human's play flight, never a timer that
  // guesses its length. See afterPlayAnimation's doc comment and AGENTS.md. --

  const liveFlights = new Set<Flight>();
  let pendingContinuation: (() => void) | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  /** A summary the human's OWN turn raised, held back until their card lands.
   *  Null whenever nothing is waiting.
   *
   *  The wait is on `liveFlights`, never on a duration - the same clock
   *  `afterPlayAnimation` runs on, per the rule in AGENTS.md. Raising it any
   *  earlier fails twice over: `.notice-overlay` sits above `.flying-card`, so
   *  the modal would cover the very card it is talking about; and the AI round
   *  that follows calls `showRoundSummary` again, which would either overwrite
   *  this one within the same tick or leave it standing after the opponents had
   *  already moved. */
  let pendingSummary: RoundSummary | null = null;

  function settleTurn(): void {
    if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    if (pendingSummary !== null) {
      const summary = pendingSummary;
      pendingSummary = null;
      showRoundSummary(summary);
      // The continuation stays armed on purpose. The AI must not take its turns
      // behind a modal about the turn before it - `dismissSummary` calls back
      // in here once the player has read it, and that is what releases them.
      return;
    }
    const fn = pendingContinuation;
    pendingContinuation = null;
    fn?.();
  }

  function cancelLiveFlights(): void {
    // Copy first: a flight's own onDone removes itself from liveFlights, so
    // mutating the Set while iterating it would skip entries.
    for (const flight of [...liveFlights]) flight.cancel();
  }

  function animateDraw(): void {
    const from = deckPile.root.getBoundingClientRect();
    const newest = hand.lastElementChild;
    newest?.classList.add("card-incoming");
    // Deliberately not tracked in liveFlights: the draw is short, concurrent
    // with any play flight, and gating the turn on it would add nothing.
    flyCard(
      container,
      "back",
      "",
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [{ to: center(hand.getBoundingClientRect()), scale: 1, durationMs: DRAW_MS }],
      () => newest?.classList.remove("card-incoming"),
    );
  }

  function animatePlay(cardId: string): void {
    const from = pendingPlayRect ?? hand.getBoundingClientRect();
    pendingPlayRect = null;
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
        liveFlights.delete(flight);
        if (liveFlights.size === 0) settleTurn();
      },
    );
    liveFlights.add(flight);
  }

  function pulseDeck(): void {
    deckPile.root.classList.add("pulse");
    runAnimation(
      deckPile.stack,
      [
        { offset: 0, transform: "scale(1)" },
        { offset: 0.5, transform: "scale(1.12)" },
        { offset: 1, transform: "scale(1)" },
      ],
      RESHUFFLE_PULSE_MS,
      () => deckPile.root.classList.remove("pulse"),
    );
  }

  /** Human-only: AI actions surface as log entries, nothing moves on screen. */
  function animateEvents(fresh: GameEvent[]): void {
    for (const e of fresh) {
      if (e.playerId !== localPlayerId()) continue;
      if (e.type === "draw") animateDraw();
      else if (e.type === "play") animatePlay(e.cardId ?? "");
      else if (e.type === "reshuffle") pulseDeck();
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
      const leadership = view.leadership[humanFaction] ?? 0;
      leadershipChip.classList.toggle("hidden", leadership === 0);
      if (leadership > 0) {
        leadershipChip.textContent =
          `Leadership ${leadership} (added to every attack)`;
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
        const span = TURNIP_HARVEST_THRESHOLD;
        turnipCount.textContent = `Turnips ${into}/${span}`;
        turnipFill.style.width = `${Math.round((into / span) * 100)}%`;
      }
    } else {
      leadershipChip.classList.add("hidden");
      turnipChip.classList.add("hidden");
    }
    if (state.phase === "pick-faction") {
      statusText.textContent = "Choose your faction";
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
      factionIds: state.factionIds,
      humanFactionId: human?.factionId,
      // `fullRealmOf`, the same count the win condition applies: a land a vassal
      // annexed already sits inside its lord's outline on the map, so a
      // scoreboard that walked one level was quoting a smaller realm than the
      // one the player could see.
      realmSize: (f) => fullRealmOf(f, state.overlords, state.incorporated).size,
      incorporated: state.incorporated,
      needed: victoryRealmSize(state.factionIds.length),
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
    pmTitle.textContent = won ? "Victory" : "Game over";
    if (won) {
      const size = fullRealmOf(
        human.factionId, state.overlords, state.incorporated,
      ).size;
      setCause([
        t(`You rule the Baltic - ${size} of ${state.factionIds.length} lands`),
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
      pmTitle.textContent = "Surrendered";
      setCause([
        t(mine
          ? `You conceded with ${size} of the ` +
            `${victoryRealmSize(state.factionIds.length)} lands needed`
          : `Your opponent conceded, ending the game. You held ${size} of ` +
            `the ${victoryRealmSize(state.factionIds.length)} lands needed`),
      ]);
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else {
      // A rival unification ends the game the same way an incorporation does,
      // but there is no killer-vs-you comparison to show - just name the winner.
      const unified = [...state.log].reverse().find((e) => e.type === "unified");
      if (unified !== undefined) {
        setCause([
          faction(unified.overlordFactionId ?? ""), t(" unified the Balts"),
        ]);
        pmDeltas.textContent = "";
        pmBuildup.replaceChildren();
      } else {
        const defeatEvent = [...state.log].reverse().find((e) => e.type === "defeat");
        const killer = defeatEvent?.overlordFactionId;
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
        settleTurn();
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
      postmortem.classList.toggle("hidden", !ended);
      scoreboard.classList.toggle("hidden", state.phase !== "playing");
      surrenderBtn.classList.toggle(
        "hidden",
        state.phase !== "playing" || cb.onSurrender === undefined,
      );
      if (state.phase !== "playing") disarmSurrender();
      endTurnBtn.classList.toggle(
        "hidden",
        state.phase !== "playing" || state.rules.turn !== "unlimited" ||
          cb.onEndTurn === undefined,
      );
      endTurnBtn.disabled =
        !isLocalTurn(state) || state.playedThisTurn ||
        (cb.isResolving?.() ?? false);
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
        const fresh = renderLog(state, animate);
        // Animate first, decide second. `showRoundSummaryIfAny` asks whether a
        // flight is in the air to know whether the turn it is describing has
        // finished, and the flight this batch starts has to exist by then or
        // the answer is stale by one update.
        if (animate) {
          animateEvents(fresh);
          showRoundSummaryIfAny(state, fresh);
        }
      } else if (ended) {
        renderPostmortem(state);
      }
    },
    setArmed(index, cardNameText) {
      armedIndex = index;
      [...hand.children].forEach((el, i) => {
        el.classList.toggle("card-armed", i === index);
      });
      if (index !== null && cardNameText !== undefined) {
        statusText.textContent = `Choose a target for ${cardNameText}`;
      } else if (lastState) {
        renderStatus(lastState);
      }
    },
    afterPlayAnimation(fn) {
      if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
      pendingContinuation = fn;
      if (liveFlights.size === 0) {
        setTimeout(settleTurn, 0);
        return;
      }
      const longestMs = Math.max(...[...liveFlights].map((f) => f.totalMs));
      watchdog = setTimeout(settleTurn, longestMs + FLIGHT_WATCHDOG_SLACK_MS);
    },
    setPinned(factionId) {
      if (factionId === pinnedFaction) return;
      pinnedFaction = factionId;
      applyRealmFilter(lastState);
      // An armed card owns the bar - it is asking for a target, and a click on
      // the map answers it rather than pinning. setArmed(null) renders again.
      if (lastState !== null && armedIndex === null) renderStatus(lastState);
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
      logPanel.classList.toggle("log-highlighting", factionId !== null);
      for (const entry of logEntries.children) {
        if (entry instanceof HTMLElement && entry.classList.contains("log-entry")) {
          applyLogHighlight(entry);
        }
      }
    },
    showHarvestOffer,
    hideHarvestUi,
  };
}
