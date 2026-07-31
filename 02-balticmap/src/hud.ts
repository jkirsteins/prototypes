import { CARDS } from "./cards";
import {
  isHumanTurn, victoryRealmSize, viewOf, type GameEvent, type GameState,
} from "./game";
import { flyCard, runAnimation, type Flight } from "./animate";
import { allianceActive, allianceKey, fullRealmOf, leadsOf } from "./relations";
import {
  buildRoundSummary, isNoticeWorthy, walkCtxOf,
  type NoticeCtx, type RoundSummary,
} from "./notices";
import { walkStandings, type StandingChange } from "./standings";
import {
  passiveFortifyFor, subjugationGripOn, subjugationRequirement,
} from "./playability";
import {
  multipliedWord, type TargetExplanation,
} from "./target-explanations";
import type { TooltipLine } from "./panel";
import { memoryStorage, type MetaStorage } from "./meta";
import { levelWindow, runXp } from "./xp";
import { standingChangeText, standingsFor } from "./view";
import {
  card, cardName, faction, factionIds, optionalPhrase, possessive, renderSegments,
  t, theFaction, verb,
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
  /** Renders the main-menu Reset progress control when provided. */
  onResetProgress?(): void;
  /** Lifetime XP after this run was banked, for the postmortem progress bar.
   *  Absent where there is no persistent progress to report (tests), in which
   *  case the bar is hidden and only the "+N XP earned" line shows. */
  lifetimeXp?(): number;
  /** Lights this faction's realm on the map, exactly as hovering its land
   *  does; null clears. Absent where there is no map (tests), in which case
   *  a hovered faction name in prose is inert. */
  onHighlightFaction?(factionId: string | null): void;
  /** The shared, coordinate-driven map tooltip - used to explain a card or
   *  name a faction hovered inline in prose (the log, the round summary,
   *  the scoreboard). Absent where there is no map. */
  onShowTip?(lines: TooltipLine[], clientX: number, clientY: number): void;
  onHideTip?(): void;
}

export interface Hud {
  update(state: GameState): void;
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

const LOG_PREFS_KEY = "balticmap-log-prefs-v1";
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
function actorOf(e: GameEvent, state: GameState): Speaker {
  if (e.playerId === 1) return { segments: [t("You")], person: "second" };
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

/** One log/postmortem line as segments. Exported (not just used by
 *  createHud) so tests/naming-convention.test.ts can drive every event type
 *  through it directly. */
export function eventSegments(e: GameEvent, state: GameState): Segment[] {
  const you = e.playerId === 1;
  const actor = actorOf(e, state);
  const humanFactionId = state.players.find((pl) => pl.id === 1)?.factionId;
  switch (e.type) {
    case "draw":
      // Content differs, not agreement: you see WHICH card you drew and they
      // do not. That is a different sentence, so it branches - the verb is the
      // same either way and comes from the same place.
      return clause(actor, "draw", you ? [t(" "), card(e.cardId ?? "")] : [t(" a card")], "past");
    case "play": {
      // rulerSuffix takes precedence over the readings marker: safe only
      // because assassinate-ruler (the only card rulerSuffix fires for) is not
      // in DOUBLABLE_CARDS (src/cards.ts). If it were ever added there, a
      // multiplied assassination would silently lose its "- doubled" marker
      // on this line.
      const suffix =
        rulerSuffix(e) ??
        (e.prevented
          ? " - prevented"
          : e.readings ? ` - ${multipliedWord(2 ** e.readings)}` : "");
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
    case "reclaimed":
      return clause(named(e.targetFactionId), "reclaim", [
        t(" independence from "), faction(e.overlordFactionId ?? ""),
      ]);
    case "tribute":
      return clause(named(e.targetFactionId), "pay", [
        t(" tribute to "), faction(e.overlordFactionId ?? ""),
      ]);
    case "settled":
      return clause(named(e.targetFactionId), "found", [t(" a new settlement")]);
    case "seeded":
      return clause(named(e.targetFactionId), "sow", [
        t(" the seeds of revolt against "), faction(e.overlordFactionId ?? ""),
      ]);
    case "subjugate-failed":
      // `formerOverlordFactionId` is set only when the target had a lord, so
      // the "from X" phrase is optional - see `optionalPhrase` for what went
      // wrong when three call sites each decided that for themselves.
      return clause(actor, "fail", [
        t(" to prise "), faction(e.targetFactionId ?? ""),
        ...optionalPhrase(" from ", e.formerOverlordFactionId),
      ]);
    case "incorporate-failed":
      return clause(named(e.targetFactionId), "resist", [
        t(" incorporation into "), faction(e.overlordFactionId ?? ""),
      ]);
    case "garrisoned": {
      // The one line whose subject is not the actor: the garrisons are, and
      // they are plural, so the verb is invariant and `clause` has nothing to
      // agree. That is the NUMBER axis (plural.ts), not the person axis this
      // helper owns, and forcing it through `verb` would claim an agreement
      // that is not the one in play.
      //
      // "Your" here is a genitive on the actor rather than a determiner, so it
      // is not `possessive` either: "Your garrisons" against "Nadruvians's
      // garrisons".
      const whose: Segment[] = you ? [t("Your")] : [...actor.segments, t("'s")];
      return [
        ...whose,
        t(` garrisons stand watch (+${e.amount} Might against all)`),
      ];
    }
    case "surrendered":
      return clause(actor, "concede", [t(" the Baltic")], "past");
    case "victory":
      return clause(actor, "rule", [t(" the Baltic")]);
    case "defeat":
      return [t("Your realm has been incorporated by "), faction(e.overlordFactionId ?? "")];
    case "unified":
      return clause(named(e.overlordFactionId), "unify", [t(" the Balts")]);
    case "stranded":
      return [
        t("Your people have no way out of vassalage to "),
        faction(e.overlordFactionId ?? ""),
      ];
  }
}

/** What one log line's event actually did, as a suffix in parentheses: the
 *  human's signed lead before -> after, `standingChangeText`'s one format, the
 *  same convention as the map badges, the map hover preview and the round
 *  summary. Null where the human can see no number - a card that moves no
 *  track, a prevented assassination, an AI hitting another AI.
 *
 *  Not a Segment: it names no card and no faction (see the rule in AGENTS.md),
 *  and keeping it out of `eventSegments` is what lets the postmortem log render
 *  the same lines without a batch to walk.
 *
 *  `changes` is one event's slice of `walkStandings`. */
export function impactText(
  e: GameEvent,
  changes: StandingChange[],
): { text: string; tone: "good" | "bad" | "even" } | null {
  // The garrison line states its own "+N Might against all" inside its
  // segments, because the postmortem log renders those segments with no suffix
  // beside them. Adding one here would print the number twice in the activity
  // log; removing it from the segments would blank it in the postmortem.
  if (e.type === "garrisoned") return null;

  const fanOut = (): { text: string; tone: "good" } | null => {
    if (e.amount === undefined || e.track === undefined) return null;
    const label = e.track === "might" ? "Might" : "Status";
    return { text: `+${e.amount} ${label} against all`, tone: "good" };
  };

  const factions = new Set(changes.map((c) => c.factionId));
  // Your own Fortify: one card, +1 Might against every living faction, so
  // there is no single pair to quote. `leadMovesOf` deliberately returns
  // nothing for it (see the doc comment in standings.ts), so the amount comes
  // off the event, exactly as the garrison line's does.
  if (factions.size === 0) {
    return e.type === "play" && e.cardId === "fortify" ? fanOut() : null;
  }
  if (factions.size > 1) return fanOut();

  const net = changes.reduce((sum, c) => sum + (c.after - c.before), 0);
  return {
    text: changes.map(standingChangeText).join(", "),
    tone: net > 0 ? "good" : net < 0 ? "bad" : "even",
  };
}

export function createHud(
  container: HTMLElement,
  cb: HudCallbacks,
  factionNames: Map<string, string> = new Map(),
  placeNameFactionIds: Set<string> = new Set(),
  logStorage: MetaStorage = memoryStorage(),
): Hud {
  const factionName = (id: string | undefined): string =>
    (id !== undefined ? factionNames.get(id) : undefined) ?? id ?? "";

  const richTextHooks: RichTextHooks = {
    factionName,
    isPlaceName: (id) => placeNameFactionIds.has(id),
    showTip: cb.onShowTip,
    hideTip: cb.onHideTip,
    highlightFaction: cb.onHighlightFaction,
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
  function isObservable(e: GameEvent, humanFactionId: string | undefined): boolean {
    // A draw happens for every seat, every turn, without exception - it is
    // never news, only noise, so it never reaches the log regardless of whose
    // turn it was.
    if (e.type === "draw") return false;
    // A garrison gain is public in principle, but it fires every turn for every
    // realm past the threshold. Left unfiltered, the late-game log is nothing
    // but garrison lines from both surviving blocs and the events that actually
    // matter scroll away. The player's own is kept, because that is where they
    // learn the rule exists; a rival's shows up in the Might lead on the badge.
    if (e.type === "garrisoned") return e.playerId === 1;
    if (e.type !== "seeded") return true;
    return e.playerId === 1 || e.overlordFactionId === humanFactionId;
  }

  /** What you played or discarded, and the events your own play caused. Never
   *  hidden by the "Targeting me" filter: a filter that removes the line you
   *  just made is a filter that lies about your own turn.
   *
   *  The automatic garrison tick and the deck reshuffle are excluded. You did
   *  not choose either, and both fire every round for the whole late game -
   *  which is exactly the noise the filter exists to remove. */
  function isYourDoing(e: GameEvent): boolean {
    return e.playerId === 1 && e.type !== "garrisoned" && e.type !== "reshuffle";
  }

  function involvesHuman(e: GameEvent, humanFactionId: string | undefined): boolean {
    if (humanFactionId === undefined) return false;
    return (
      e.playerId === 1 ||
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
  const pmXp = document.createElement("p");
  pmXp.className = "pm-xp";
  // The bar fills from where the run started to where it ended, so the run's
  // contribution is the part that moves. A flat "+17 XP earned" left a first
  // run looking like it had achieved nothing; what it had actually done was
  // get two thirds of the way to a pack.
  const pmXpTrack = document.createElement("div");
  pmXpTrack.className = "pm-xp-track";
  const pmXpFill = document.createElement("div");
  pmXpFill.className = "pm-xp-fill";
  pmXpTrack.appendChild(pmXpFill);
  const pmXpToNext = document.createElement("p");
  pmXpToNext.className = "pm-xp-next";
  const pmNewGame = document.createElement("button");
  pmNewGame.className = "menu-new-game";
  pmNewGame.textContent = "New game";
  pmNewGame.addEventListener("click", () => cb.onNewGame());
  pmSummary.append(
    pmTitle, pmCause, pmDeltas, pmBuildup,
    pmXp, pmXpTrack, pmXpToNext, pmNewGame,
  );
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

  const status = document.createElement("div");
  status.className = "status-bar hidden";
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  status.append(statusText);

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
    const human = state.players[0];
    if (!human) return null;
    return {
      humanFactionId: human.factionId,
      factionOf: (playerId) =>
        state.players.find((pl) => pl.id === playerId)?.factionId,
      leads: (other) => leadsOf(state.relations, human.factionId, other),
      subjugationGrip: () => subjugationGripOn(viewOf(state), human.factionId),
      subjugationBarAgainstYou: (other) =>
        subjugationRequirement(viewOf(state), other, human.factionId),
      allianceExpiry: (other) =>
        allianceActive(state, human.factionId, other)
          ? state.alliances[allianceKey(human.factionId, other)]
          : undefined,
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
    });
    if (summary === null) return;
    // A live flight means one thing only: the human's own played card is on
    // screen. `animateEvents` skips every event with `playerId !== 1` and the
    // draw is deliberately untracked, so this is the honest test for "the turn
    // this summary describes is not over yet" - read off the animation rather
    // than from a predicate that re-guesses which events animate.
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
    menu, postmortem, status, scoreboard, surrenderBtn, deckPile.root,
    discardPile.root, hand, logPanel, noticeOverlay,
  );

  let pendingPlayRect: DOMRect | null = null;
  let renderedEvents = 0;
  let lastRenderedTurn = 0;
  /** The faction the map is currently lighting, so the log can agree with it.
   *  Held rather than read back off the DOM because entries appended while a
   *  hover is live have to arrive already dimmed. */
  let highlightedFaction: string | null = null;
  /** The faction whose highlight the map is holding pinned, for the status bar.
   *  Separate from `highlightedFaction`: that one is the log's dimming, which a
   *  pin and a plain hover drive alike, while this is only ever set by a click
   *  and is what the bar has to announce. */
  let pinnedFaction: string | null = null;

  /** Sets one entry's dimming from `highlightedFaction`. An entry is lit when
   *  it names that faction - `data-factions`, written in renderLog. */
  function applyLogHighlight(entry: HTMLElement): void {
    entry.classList.toggle(
      "log-lit",
      highlightedFaction !== null &&
        (entry.dataset.factions ?? "").split(" ").includes(highlightedFaction),
    );
  }

  /** Appends entries for events not yet rendered; returns those events so
   *  animations can key off the same diff. */
  /** Cancels the in-flight postmortem bar fill, if any. A second postmortem
   *  (a new run ending) must not have two fills racing on the same element. */
  let xpFill: { cancel(): void } | null = null;

  /** Fills the postmortem bar from where this run started to where it ended.
   *
   *  Crossing a level is animated as a run to full, a reset to empty, and a
   *  fresh fill into the new band - chained on each leg reporting itself
   *  finished, never on a timer set to the same number (the rule in
   *  AGENTS.md). Without the chaining a crossing would slide the fill
   *  backwards, which reads as losing progress at the exact moment a pack
   *  was won.
   *
   *  Falls back to the finished state with no animation when the caller
   *  supplies no lifetime context, which is every test that does not opt in
   *  and any run banked outside a seat. */
  function renderXpBar(earned: number): void {
    xpFill?.cancel();
    xpFill = null;
    const total = cb.lifetimeXp?.();
    const hasContext = typeof total === "number";
    pmXpTrack.classList.toggle("hidden", !hasContext);
    pmXpToNext.classList.toggle("hidden", !hasContext);
    if (!hasContext) return;

    const after = levelWindow(total);
    const startXp = Math.max(0, total - Math.max(0, earned));
    const before = levelWindow(startXp);
    // Crossing at all is the headline, not landing exactly on the threshold:
    // a run that ended at 26 has WON a pack, and telling it "49 XP to your
    // next pack" buries that under a number about the pack after it.
    pmXpToNext.textContent =
      after.level > before.level
        ? `Level ${after.level} reached - a pack is waiting`
        : `${after.toNext} XP to your next pack`;

    const pct = (w: { into: number; span: number }): number =>
      w.span === 0 ? 100 : (w.into / w.span) * 100;

    // One leg per band the run passed through: the first runs from where the
    // run started, every later one from empty.
    const legs: { from: number; to: number }[] = [];
    for (let lvl = before.level; lvl < after.level; lvl++) {
      legs.push({ from: lvl === before.level ? pct(before) : 0, to: 100 });
    }
    legs.push({
      from: after.level === before.level ? pct(before) : 0,
      to: pct(after),
    });

    const LEG_MS = 650;
    const run = (i: number): void => {
      const leg = legs[i];
      if (leg === undefined) {
        xpFill = null;
        return;
      }
      pmXpFill.style.width = `${leg.from}%`;
      pmXpFill.classList.toggle("pm-xp-levelled", leg.to === 100 && i < legs.length - 1);
      xpFill = runAnimation(
        pmXpFill,
        [{ width: `${leg.from}%` }, { width: `${leg.to}%` }],
        LEG_MS,
        () => {
          pmXpFill.style.width = `${leg.to}%`;
          run(i + 1);
        },
      );
    };
    run(0);
  }

  function renderLog(state: GameState): GameEvent[] {
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
      hideSummary();
    }
    const fresh = state.log.slice(renderedEvents);
    const humanFactionId = state.players[0]?.factionId;
    const noticeCtx = buildNoticeCtx(state);
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
      if (e.turn !== lastRenderedTurn) {
        const sep = document.createElement("div");
        sep.className = "log-turn";
        sep.textContent = `Turn ${e.turn}`;
        logEntries.appendChild(sep);
        lastRenderedTurn = e.turn;
      }
      if (!isObservable(e, humanFactionId)) return;
      const entry = document.createElement("div");
      entry.className = "log-entry log-new";
      const segs = eventSegments(e, state);
      entry.replaceChildren(renderSegments(segs, richTextHooks));
      // Which factions this line is about, for the highlight. Read off the
      // segments, so a line lights exactly when it visibly names the faction -
      // plus the actor when that is you, because your own actions render as
      // "You" and name no faction at all.
      const named = factionIds(segs);
      if (e.playerId === 1 && humanFactionId !== undefined && !named.includes(humanFactionId)) {
        named.push(humanFactionId);
      }
      entry.dataset.factions = named.join(" ");
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
        "notice-worthy", noticeCtx !== null && isNoticeWorthy(e, noticeCtx),
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
      logEntries.appendChild(entry);
    });
    renderedEvents = state.log.length;
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
    const human = state.players[0];
    if (!human) return;
    const n = human.hand.length;
    const canPlay = isHumanTurn(state) && !state.playedThisTurn;
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
      if (e.playerId !== 1) continue;
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
    if (state.phase === "pick-faction") {
      statusText.textContent = "Choose your faction";
    } else if (state.phase === "playing") {
      // The pin outranks the turn prompt: while it is up, the one thing the
      // player needs from this bar is what is pinned and how to let go of it.
      // A segment, not a string - the name lights its realm here too.
      if (pinnedFaction !== null) {
        statusText.replaceChildren(
          renderSegments(
            [t("Pinned: "), faction(pinnedFaction), t(" - Esc to clear")],
            richTextHooks,
          ),
        );
      } else if (isHumanTurn(state)) {
        statusText.textContent = (cb.isDiscardMode?.() ?? false)
          ? "No playable card - discard one"
          : `Turn ${state.turn} - play a card`;
      } else {
        statusText.textContent = "Waiting on other players...";
      }
    }
  }

  function renderScoreboard(state: GameState): void {
    const human = state.players[0];
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
      passiveFor: (f) => passiveFortifyFor(viewOf(state), f),
    });
    scoreboard.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement("div");
        row.className = "sb-row";
        row.classList.toggle("sb-you", r.isHuman);
        const who = document.createElement("span");
        who.className = "sb-who";
        if (r.isHuman) who.textContent = "You";
        else who.replaceChildren(renderSegments([faction(r.factionId)], richTextHooks));
        const lands = document.createElement("span");
        lands.className = "sb-lands";
        lands.textContent = `${r.lands}/${r.needed} lands`;
        const pct = document.createElement("span");
        pct.className = "sb-pct";
        pct.textContent = `${r.percent}%`;
        row.append(who, lands, pct);
        // The one place the passive garrison rule is stated outright. Without
        // it a player watching their Might climb every turn has no way to learn
        // why, since the log line alone does not say where the number comes from.
        if (r.passivePerTurn !== undefined && r.passivePerTurn > 0) {
          const passive = document.createElement("span");
          passive.className = "sb-passive";
          passive.textContent = `garrisons +${r.passivePerTurn} Might/turn`;
          row.appendChild(passive);
        }
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

  /** Where the two of you stood, and the last five things they aimed at you.
   *  Shared by the endings that have a faction to blame - an incorporation and
   *  a vassalage with no way out. */
  function renderEnderComparison(state: GameState, ender: string): void {
    const human = state.players[0];
    const l = leadsOf(state.relations, ender, human.factionId);
    const line = (label: string, n: number) =>
      `${label}: ${n > 0 ? `they led by ${n}` : n < 0 ? `you led by ${-n}` : "even"}`;
    pmDeltas.textContent = `${line("Might", l.might)} / ${line("Status", l.status)}`;
    const enderPlayer = state.players.find((p) => p.factionId === ender);
    const plays = state.log
      .filter(
        (e) =>
          e.type === "play" &&
          e.playerId === enderPlayer?.id &&
          e.targetFactionId === human.factionId,
      )
      .slice(-5);
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
    const human = state.players[0];
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
      const size = fullRealmOf(
        human.factionId, state.overlords, state.incorporated,
      ).size;
      pmTitle.textContent = "Surrendered";
      setCause([
        t(`You conceded with ${size} of the ` +
          `${victoryRealmSize(state.factionIds.length)} lands needed`),
      ]);
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else {
      // A dead-end vassalage: the map never moved, so the cause has to say
      // outright what was missing, and it names both cards so the player can
      // read what they should have carried and go build it next run.
      const stranded = [...state.log].reverse().find((e) => e.type === "stranded");
      // A rival unification ends the game the same way an incorporation does,
      // but there is no killer-vs-you comparison to show - just name the winner.
      const unified = [...state.log].reverse().find((e) => e.type === "unified");
      if (stranded !== undefined) {
        const lord = stranded.overlordFactionId;
        setCause([
          t("Vassal of "), faction(lord ?? ""), t(" with no way out - no "),
          card("seeds-of-revolt"), t(" and no "), card("revolt"),
          t(" anywhere in your deck"),
        ]);
        if (lord !== undefined) renderEnderComparison(state, lord);
      } else if (unified !== undefined) {
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
    // XP is derived from the log, never a counter carried on state - see
    // src/xp.ts. The number here is the same one that gets banked.
    const earned = runXp(state.log);
    pmXp.textContent = `+${earned} XP earned`;
    renderXpBar(earned);
    pmLog.replaceChildren(
      ...state.log.filter((e) => e.type !== "draw").map((e) => {
        const d = document.createElement("div");
        d.className = "log-entry";
        d.replaceChildren(renderSegments(eventSegments(e, state), richTextHooks));
        d.classList.toggle("log-you", involvesHuman(e, human?.factionId));
        // Same nesting as the activity log. No cause to tag here: the
        // postmortem has no filter to hide one.
        d.classList.toggle("log-consequence", e.consequence === true);
        return d;
      }),
    );
  }

  return {
    update(state) {
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

      renderStatus(state);

      if (state.phase === "playing") {
        const human = state.players[0];
        renderPile(deckPile, human.deck.length);
        renderPile(discardPile, human.discard.length);
        renderHand(state);
        renderScoreboard(state);
        const fresh = renderLog(state);
        // Animate first, decide second. `showRoundSummaryIfAny` asks whether a
        // flight is in the air to know whether the turn it is describing has
        // finished, and the flight this batch starts has to exist by then or
        // the answer is stale by one update.
        animateEvents(fresh);
        showRoundSummaryIfAny(state, fresh);
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
      // An armed card owns the bar - it is asking for a target, and a click on
      // the map answers it rather than pinning. setArmed(null) renders again.
      if (lastState !== null && armedIndex === null) renderStatus(lastState);
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
  };
}
