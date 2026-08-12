import type { Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createTooltip, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction, DRAG_THRESHOLD_PX, landAtPoint } from "./interaction";
// No playCard, discardCard, endTurn, transferDefense or surrender here, and
// no advance, startGame, chooseBuild, chooseRules, pickFaction or
// applyBootParams either - the root biome.json refuses all of them. What the
// LOCAL player decides goes through `commitDecision`; every other move that
// appends events to a `GameState` goes through `./moves`, whose wrappers are
// shaped for `apply` so there is no local path around either door.
import {
  newGame, viewOf, repeatOnlyOf, takesNoTurn, turnOpen, transferLimit,
  type GameEvent, type GameState,
} from "./game";
import { fullRealmOf, isUnheld, realmOf, realmRootOf } from "./relations";
import { playsTurns } from "./passives";
import { hasRuler, rulerNameOf } from "./rulers";
import {
  ability, abilityName, faction, plainText, renderSegments, t, term,
  type NameLookup, type RichTextHooks, type Segment,
} from "./rich-text";
import { termName } from "./glossary";
import { abilitiesOf } from "./abilities";
import { count } from "./plural";
import {
  handBlockReason, marchSourcesAgainst, marchSourcesFor, marchTargetsFrom,
  claimWouldLand, playableSet, respiteExpiry, validTargetsFor,
  targetEligibilityFor,
  armyCapOn, attackDamageFor, attackImpactOn, freeArmiesFor,
  miasmaHeld, omensHeld, freeSettlementsIn, settlementsIn,
} from "./playability";
import { armiesOn, axesOf, type March } from "./marches";
import { clashFraction } from "./arrows";
import { crossingBetween, ringsOf, type Crossing, type Pt } from "./borders";
import { renderArrowScene, type ArrowSpec, type SceneCtx } from "./arrow-scene";
import { animations, runAnimation } from "./animate";
import {
  defenseMaxOf, defenseOf, gateBandOf, type GateBand,
} from "./defense";
import {
  cardBlockLine, cardModifierLines, cardRiskLine, defenseBreakdown,
  diseaseBreakdown, explainTargetEligibility, landFactsLines, multipliedWord,
  passiveLines, plaguePreviewLines, respiteLines, settlementBlock,
  targetImpactLines, targetOddsLines,
} from "./target-explanations";
import {
  ATTACK_CARDS, CARDS, isInwardCard, isMarchCard, type Strategy,
} from "./cards";
import { buildListing, destroyOffer, type HarvestChoice } from "./harvest";
import { changeImpact, createHud, LOG_PREFS_KEY, type HudCallbacks } from "./hud";
import {
  presentCtxOf, presentEvents,
  type BadgeWalk, type Beat, type ResolutionArrow,
} from "./presentation";
import { createAudioEngine } from "./audio";
import { createDeckScreen } from "./deck-screen";
import { createRegionsScreen } from "./regions-screen";
import { createHostSession, type HostSession } from "./net-host";
import { createGuestSession, type GuestSession } from "./net-guest";
import { hostPeer, joinPeer } from "./net";
import { createNetPanel } from "./net-ui";
import {
  dealNetGame, guestPhaseView, seatOfFaction,
  type NetAction, type Wire,
} from "./net-protocol";
import {
  commitDecision, controllerOf as controllerOfSeat, decidedHere, oneAiSeat,
  MAX_AI_TURNS,
  type Controller, type Decision, type DecisionResult, type Seats,
} from "./decisions";
import {
  loadBuildPref, loadRegionPref, memoryStorage, REGION_PREF_KEY,
  saveBuildPref, saveRegionPref, type MetaStorage,
} from "./meta";
import { createRunClock } from "./run-clock";
import {
  createTransitionQueue, type Stages, type Transition,
} from "./transitions";
import { parseBootParams } from "./boot-params";
import {
  advanceMove, bootGame, chooseBuildMove, pickFactionMove, startGameMove,
} from "./moves";
import { REGIONS, setActiveRegion, type RegionId } from "./regions";
import {
  forcesDiscardWhenStuck, RULES_PREFS_KEY, loadRulesPrefs,
  saveRulesPrefs, type RuleSelections,
} from "./rules";
import { seededRng } from "./rng";
import {
  holderOf, politicalFactionForPolygon, realmHoldingLine, relationshipLine,
} from "./view";
import { defenseMaxOf as mapDefenseMax, factionAdjacencyOf, siteCapsOf, siteListsOf } from "./adjacency";
import "./style.css";

const app = document.getElementById("app")!;

// No browser context menu anywhere, and no text selection anywhere. Right
// click is a game input - it cancels an aim - and a menu opening over the map
// instead is an input the player cannot take back. Selection is the same kind
// of accident: a drag across the board that highlights a settlement label
// instead of aiming an army. The CSS in style.css already forbids selection;
// these two catch what CSS cannot, a drag that has already begun and the menu
// itself.
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => e.preventDefault());

/** Null unless the URL names a boot param, in which case every branch below
 *  reading it takes the testing path. See src/boot-params.ts. */
const boot = parseBootParams(window.location.search);

/** The host id an invite link carries, or null. Read here beside `boot`
 *  because the two are mutually exclusive: a join link must not also boot a
 *  rigged state, or the guest's staging screens would disagree with the
 *  snapshot the host is about to send. */
const joinId = new URLSearchParams(window.location.search).get("join");

/** How long this run has been played, for the line under the result on the
 *  ending overlay. Driven off the phase alone by `refresh`, which is why
 *  nothing else here has to remember to start or stop it - a guest's run and a
 *  booted run come in by doors the New game click never passes through. See
 *  src/run-clock.ts for why this is not on the state. */
const runClock = createRunClock();

const rng = boot?.seed != null ? seededRng(boot.seed) : Math.random;
const storage: MetaStorage = ((): MetaStorage => {
  // A booted run is sealed off from the player's real preferences in both
  // directions: it must not overwrite them, and it must not inherit them, or
  // the same URL would boot differently on a different machine. The probe
  // below is skipped rather than run-and-discarded because the probe itself
  // writes.
  if (boot !== null) {
    const mem = memoryStorage();
    if (boot.popups !== null) {
      mem.setItem(LOG_PREFS_KEY, JSON.stringify({ showPopups: boot.popups }));
    }
    if (boot.rules !== null) {
      mem.setItem(RULES_PREFS_KEY, JSON.stringify(boot.rules));
    }
    if (boot.build !== null) {
      mem.setItem("balticmap-build-pref-v1", boot.build);
    }
    if (boot.region !== null) {
      mem.setItem(REGION_PREF_KEY, boot.region);
    }
    return mem;
  }
  try {
    const probe = "balticmap-meta-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
})();
/** Where the net panel keeps the player's display name - session storage,
 *  deliberately NOT the profile storage above.
 *
 *  A name is who is at THIS screen, not progress: it belongs beside the seat,
 *  not beside the XP and the unlocked cards. And localStorage is shared by
 *  every tab on the origin, so two tabs of one browser - how this is tested,
 *  and how two people at one machine would play - each read back the name the
 *  other typed. That is not a hypothetical: it made both seats of a live
 *  two-tab run read "Bela".
 *
 *  Session storage rather than nothing at all, because it survives a reload of
 *  the same tab: a guest that refreshes mid-game rejoins under the name the
 *  host has been labelling that seat with all along, instead of silently
 *  becoming somebody else in the log and the scoreboard.
 *
 *  A booted page gets memory storage, like everything else it touches. */
const netStorage: MetaStorage = ((): MetaStorage => {
  if (boot !== null) return memoryStorage();
  try {
    const probe = "balticmap-net-probe";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return memoryStorage();
  }
})();

/** Resolved before the map renders: which region's data every reader below -
 *  `renderMap`, the faction/region lookups, `newGame` - is built from.
 *  Named `regionDef` rather than `region`: this file already spells `region`
 *  for a map POLYGON (the `Region` type) at every hover and click site, and
 *  the two must not collide. */
const regionId: RegionId = loadRegionPref(storage);
setActiveRegion(regionId);
const regionDef = REGIONS[regionId];
const data = regionDef.map;

const {
  svg, regionPaths, revealSettlement, clearFoundedSettlements,
  realmOutlineGroup, realmUnionGroup, realmHoverGroup, realmEdgeGroup,
  vassalOverlayGroup, peopleLabels, outerOutline, outsideMask,
} = renderMap(data, app);

/** The masked stroke-only copy of each land that sits in a realm of 2+, by
 *  region id. Rebuilt by `renderRealmUnions` whenever the realms change. */
const realmEdgePaths = new Map<string, SVGPathElement>();

/** Every vassal-stripe path with the overlord whose colour it carries, so the
 *  stripes can be held at that overlord's own intensity. Rebuilt by
 *  `renderVassalOverlay`. */
const vassalStripes: {
  path: SVGPathElement; lord: string; land: string;
}[] = [];

/** One path carrying `d`, clipped by `mask`, appended to `group`. */
function maskedPath(group: SVGGElement, d: string, mask: string): SVGPathElement {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("mask", mask);
  group.appendChild(p);
  return p;
}

// Every class toggled onto a region has to reach its edge copy, and the copy is
// what draws that land's threat/ownership/hover/targeting stroke now. Watching
// the attribute is what makes that unconditional: a future toggle added
// anywhere is carried across without knowing this exists. Only region paths are
// observed and only edge copies are written, so this cannot feed itself.
const realmEdgeObserver = new MutationObserver(() => {
  syncRealmEdges();
  syncVassalStripes();
});

// map-render.ts doesn't expose either of these; appended here, last in the SVG
// (after realm-outline/vassal-overlay, on top of the whole map stack). Arrows
// go on FIRST so the badges sit above them: an arrow crossing a land must not
// bury the defense number that decides whether the arrow matters.
const arrowGroup = document.createElementNS(
  "http://www.w3.org/2000/svg", "g",
) as SVGGElement;
arrowGroup.classList.add("march-arrows");
svg.appendChild(arrowGroup);

// The ghosts of marches that have already landed, fading. Their own group and
// not `arrowGroup`, because the two have different lifetimes: a ghost outlives
// the state it was drawn from, and a live rebuild landing mid-fade would wipe
// it off the screen halfway through the one thing the beat is showing.
const ghostGroup = document.createElementNS(
  "http://www.w3.org/2000/svg", "g",
) as SVGGElement;
ghostGroup.classList.add("march-ghosts");
svg.appendChild(ghostGroup);

// The arrow being aimed has no group of its own. It is a lane in `arrowGroup`
// beside the arrows already crossing that border, because a preview laid out
// on its own takes the whole border and covers them - and what a preview is
// FOR is the board the play would make. The dashed outline is what keeps it
// from being read as something the game has promised.

const badgeGroup = document.createElementNS(
  "http://www.w3.org/2000/svg", "g",
) as SVGGElement;
badgeGroup.classList.add("threat-badges");
svg.appendChild(badgeGroup);
for (const region of regionPaths.values()) {
  realmEdgeObserver.observe(region, {
    attributes: true, attributeFilter: ["class", "style"],
  });
}
const tooltip = createTooltip(app);
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const regionById = new Map(data.regions.map((r) => [r.id, r]));
const factionByRegion = new Map(data.regions.map((r) => [r.id, r.faction]));
const regionByFaction = new Map(data.regions.map((r) => [r.faction, r.id]));
/** The further sites each land can settle: its locked settlements, in the order
 *  the map authors them. A land is settled into these one at a time, so the Nth
 *  founding reveals the Nth dot and the drawing follows the count in state
 *  rather than keeping a parallel record of which dot went where.
 *
 *  Lands with no spare slot have an empty list and can never be built in, which
 *  is exactly what `siteCaps` tells the rules.
 *
 *  Keyed by FACTION id, not region id. Every land has one faction and every
 *  faction one land, but the two id spaces are different words ("ugandi" the
 *  land, "ugandians" the faction) and the rules speak faction ids throughout.
 *  Keying this by `settlement.land` made the card permanently unplayable, since
 *  no region id is ever a member of a realm. */
const sitesByFaction = siteListsOf(data);
const SITE_CAPS = siteCapsOf(data);
const DEFENSE_MAX = mapDefenseMax(data);
const factionAdjacency = factionAdjacencyOf(data);
const factionEthnicities: Record<string, string> = Object.fromEntries(
  data.factions.map((f) => [f.id, f.ethnicity]),
);

/** The game's ears. Inert until the first real gesture (`unlock` - autoplay
 *  policy and the test environments both require that), muted through its own
 *  storage key so a `?popups=` boot cannot reset it. A booted run gets the
 *  same memory storage as every other pref it touches. */
const audio = createAudioEngine(storage);
window.addEventListener("pointerdown", () => audio.unlock(), { once: true });
window.addEventListener("keydown", () => audio.unlock(), { once: true });

/** The build the last game confirmed, seeding the build screen. A
 *  preference, like the rules - the meta progression retired with the
 *  defense-score design. */
let buildPref: Strategy = loadBuildPref(storage);
/** The rule picks the next game starts with. Loaded once and kept in sync
 *  with storage on every change; a booted page's memory storage was seeded
 *  from `rules=` above, so this needs no boot special case. */
let rulesPrefs: RuleSelections = loadRulesPrefs(storage);
/** The world this page opens on, boot params and all.
 *
 *  A rigged state is folded in HERE rather than submitted to the queue below,
 *  for two reasons that both stand on their own. Nothing at module scope may
 *  render: `hud` is declared much further down, and a throw here would abort
 *  evaluation and leave a blank page with no menu and no map - the one
 *  failure a test hook must not be able to cause, which is why a bad param
 *  falls back to the ordinary main menu. And a booted state is HISTORY, never
 *  a move this screen played into: presenting it would replay every round the
 *  URL fast-forwarded through. */
const initialGame: GameState = (() => {
  const fresh = newGame(
    data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
    SITE_CAPS, DEFENSE_MAX,
  );
  if (boot === null) return fresh;
  try {
    return bootGame(fresh, boot, rng);
  } catch (err) {
    console.error("boot params ignored:", err);
    return fresh;
  }
})();

/** What a transition does to this screen.
 *
 *  `present` is the beats: the camera, the labels, the badge walks, the card
 *  flights and the sounds `PRESENTATION_RULES` gives the events THIS
 *  transition appended, run against the board as it stood, and finished
 *  before the commit repaints it. It reports
 *  itself done when the animation queue drains, so a transition with nothing
 *  to show completes inside `submit` and one with a round to show holds the
 *  next one off for as long as it takes.
 *
 *  `commit` is the whole of `refresh`, and it raises nothing: the question
 *  this move asked is `ask`, the round's news is `summary` and the run's
 *  ending is `ending`, each held open until the player has answered or read
 *  it. A repaint happens several times per move and cannot say which of them
 *  the player is owed an interruption for. */
const stages: Stages = {
  present(t, done) {
    // This repaint moves nothing on the map - it draws the state already on
    // screen. What it moves is the HUD: `inputLocked` has answered true since
    // the move was submitted, and until something repaints, a hand about to
    // sit through a round of animation still looks live enough to click.
    //
    // It runs BEFORE the beats because a badge walk starts from the number
    // the badge is already showing, and this is the paint that guarantees
    // what that number is.
    refresh();
    queueBeats(t);
    animations.onIdle(done);
  },
  commit(t) {
    refresh(t.paint);
  },
  ask(t, done) {
    // A run that has ended has no board left to move defenders on: the phase
    // change takes the modal down with it, so a question raised here could
    // never be answered and would hold the queue - and the ending behind it -
    // for good. The unanswered conquest is picked up again by the transition
    // that hands the board back, which is `keep-playing`.
    if (t.next.phase !== "playing") {
      done();
      return;
    }
    askTransfer(done);
  },
  summary(t, done) {
    // Every commit folds its batch into the round's news; this is the stage
    // that shows it, and only on the move that hands the map back to a
    // person. A round is several transitions - the advance, then one per
    // acting seat - and "one modal, one line per event" is a promise about
    // the ROUND, so a seat mid-chain shows nothing and loses nothing.
    if (!handsBackToAPerson(t.next)) {
      done();
      return;
    }
    // `.notice-overlay` sits above `.flying-card`, so a modal raised while the
    // player's own card is still in the air covers the very card it is talking
    // about. The wait is on the flight reporting itself finished, never on a
    // duration copied from it.
    hud.afterPlayAnimation(() => {
      if (!hud.raiseRoundSummary(done)) done();
    });
  },
  ending(_t, done) {
    showEndingIfAny();
    done();
  },
  teardown() {
    // A world is being exchanged rather than moved on from, so everything the
    // move it replaces put in motion or put on screen belongs to a board that
    // no longer exists.
    //
    // The beats first: the steps of the superseded move are already on the
    // animation queue and would otherwise go on gliding the camera, fading
    // labels in and walking badges from scores this commit has just replaced -
    // over a board that has nothing to do with them, and with the live arrows
    // hidden until they drain. A step already RUNNING is left alone, because
    // it owns DOM that its own `done` has to take back down.
    //
    // Asked of the HUD rather than of the queue directly, because the queue is
    // half the fact: the HUD counts the plays waiting on it, and a step
    // dropped without its count is a turn gate that never opens.
    hud.dropFlights();
    // Then the questions. Each of these is a modal about the discarded world:
    // news the player can neither check nor act on, a boon offered for a play
    // resolved in a world that is gone, a conquest whose two lands may not be
    // where this state has them. The ask stage behind the commit raises again
    // whatever the NEW world still owes, which is why the key goes too - held
    // over, it would suppress the very question the exchange brings back.
    hud.dropRoundNews();
    hud.hideHarvestUi();
    pendingHarvest = null;
    transferAsked = null;
    // An armed card and a held map selection are handles into the old world
    // too - `armed`/`armedSource` index into the hand this exchange is about
    // to replace, and `interceptClick` reads `localHuman().hand[idx]` out of
    // whichever hand is current. A pin must not outlive the run it was set in
    // either: the new world re-colours every polygon, and a held highlight
    // would describe the last one.
    disarm();
    interaction.deselect();
  },
};

const transitions = createTransitionQueue(initialGame, stages);

/** The state ON SCREEN, which is what everything that DRAWS reads. Nothing in
 *  this file may assign it - `src/transitions.ts` owns it, so there is no
 *  local path that appends events without presenting them.
 *
 *  It lags: for the whole of a transition it answers with the board the player
 *  was last shown, not the one the move produced. Anything that MAKES a move,
 *  or hands a state to the wire, reads `world()` instead. */
const game = (): GameState => transitions.state();

/** The authoritative world: everything submitted, drawn or not.
 *
 *  **A mutation is made from `world()`; only rendering reads `game()`.** This
 *  is a standing rule and not a caution about a particular call site. A move
 *  made from the displayed state is made from a board that has already been
 *  overtaken, and committing it throws away every move submitted since - the
 *  play the player is at that moment watching land. The two answer the same
 *  object whenever the queue is idle, which is most of the time and is exactly
 *  why this has to be written down rather than noticed. */
const world = (): GameState => transitions.latest();

/** The one way this file moves the world. `events` is the slice this call
 *  appended, so nothing downstream has to diff cursors to learn what
 *  happened.
 *
 *  For a state this screen PLAYED INTO. A state that arrived WHOLE - a deal,
 *  a fresh run, a rejoin snapshot - is history: it goes through
 *  `transitions.replaceSettled` (or `adoptSnapshot`), which presents nothing,
 *  because nobody watched it happen. */
function apply(mutate: (g: GameState) => GameState): void {
  const before = world();
  const next = mutate(before);
  submitUpdate(next, next.log.slice(before.log.length));
}

/** A move to watch whose events are already known - the host's `update`
 *  message carries them. The slice `apply` takes is the right answer only
 *  while the log grows by exactly what the move appended, and a spliced
 *  update is the case where it does not.
 *
 *  Every live move ends with `refreshWhenSettled`, and that is here rather
 *  than at the call sites because it is owed by ALL of them: `inputLocked` is
 *  derived, every paint made inside a move draws a locked screen, and a move
 *  whose caller had nothing else to do afterwards - the faction pick, a state
 *  the host pushed - would otherwise leave the hand greyed with nothing left
 *  to repaint it. */
function submitUpdate(next: GameState, events: GameEvent[]): void {
  transitions.submit({ next, events, settled: false });
  refreshWhenSettled();
}

/** Takes on a whole game that arrived at once, painted as already-settled.
 *  The silence is the point: an animating paint flies every card in the log,
 *  so a guest rejoining a run twenty turns old would watch all of it. */
function adoptSnapshot(state: GameState): void {
  // The teardown and the ask both ride the replacement itself: a world
  // arriving whole takes down the modals raised about the world it replaces,
  // and its ask stage raises whatever this one owes - a rejoin's whole purpose
  // is to bring back the question whose answer was lost with the connection.
  // Nothing is owed here beyond the exchange, which is the point of the hook.
  transitions.replaceSettled(state, { animate: false });
  // The commit inside that call painted whatever the screen was still busy
  // with; this is the paint that hands the board back. Same debt every live
  // move owes - see `submitUpdate`.
  refreshWhenSettled();
}
let armed: number | null = null; // hand index of the armed targeted card
/** The land an armed march card will send its army out of, once the player
 *  has clicked it.
 *
 *  A march card is aimed twice: an arrow has a tail as well as a head,
 *  and which of your lands the army leaves from is a real decision, because
 *  that is the land a counter-raid comes back at. Null means the first click
 *  is still to come and the map is lighting SOURCES; set means it is lighting
 *  the targets that source can reach. Cleared by `disarm` along with `armed`,
 *  so the two can never disagree about which step is live. */
let armedSource: string | null = null;
/** Non-null while the harvest offer modal owns the input. `index` is the
 *  harvest card's hand index, held so the pick commits the same play. */
let pendingHarvest: { index: number } | null = null;
let hoveredRegion: Region | null = null; // region under the cursor, for hover re-apply on refresh
/** The land clicked to hold its faction's highlight, or null. A pin outranks
 *  the cursor: it exists so the activity log can be read, and reaching the log
 *  means dragging the cursor across lines whose faction names would each steal
 *  the highlight back. Suppressed, not cleared, while a card is armed -
 *  targeting cues own the map, and disarming brings the pin back. */
let pinnedRegion: Region | null = null;
/** True while this screen must not act for a reason no queue can see: a
 *  guest's move gone to the host and not yet answered, and either side of a
 *  session that has dropped, where the two can no longer agree on what
 *  happened. Everything else `inputLocked` asks about is derived - see there.
 *  Set only by the network callbacks, and cleared by the answer they were
 *  waiting for. */
let awaitingWire = false;

/** Whether the local player may act right now.
 *
 *  One question with three sources, and none of them is a flag somebody has to
 *  remember to clear: the transition queue is showing a move (so the board is
 *  mid-explanation, or about to be), an animation of this screen's own is
 *  still running (the played card is in the air), the other human holds the
 *  turn, or the wire owes this screen an answer. The hand is already inert
 *  whenever it is not the human's turn - `renderHand` sees to that - so this
 *  is what the map, the arrows and the menu buttons ask.
 *
 *  Every paint made while this is true draws a locked screen, so every path
 *  that leaves the locked window repaints on its way out: `finishChain` and
 *  `afterHumanPlay` wait for the animation queue and then refresh. */
function inputLocked(): boolean {
  return (
    transitions.busy() || animations.busy() || awaitingWire || remoteHoldsTurn()
  );
}

/** True while the OTHER human's seat is on turn. A different fact from the
 *  queue being busy: nothing is in flight here, and nothing will be until
 *  they play. */
function remoteHoldsTurn(): boolean {
  return game().phase === "playing" && controllerOf(game().current) === "remote";
}

/** Repaints once the screen is the player's again: after the queue has
 *  finished showing whatever it was showing, and after the animation under it
 *  has ended.
 *
 *  This is the counterpart every path out of the locked window owes.
 *  `inputLocked` is derived rather than stored, so nothing repaints when it
 *  goes false on its own - and the paint that drew the hand greyed is the one
 *  that would stay on screen. Fires on the spot when neither queue is busy,
 *  which is most calls. */
function refreshWhenSettled(): void {
  transitions.onIdle(() => {
    animations.onIdle(() => {
      refresh();
      updateWaitingStatus();
    });
  });
}

/** The seat this screen plays. 0 for solo and host; the guest learns its
 *  seat from the start snapshot. Presentation only - the engine's humanSeat
 *  stays the host's seat 0. */
let localSeat = 0;

/** The seat the HOST plays, which is 0 in every dealt game: `pickFaction`
 *  seats the picking player first and the guest is one of the others.
 *
 *  Deliberately NOT `localSeat`, and deliberately named rather than left as
 *  a bare literal index. "The host sits at seat 0" is a fact about how a
 *  game is dealt; "the local player sits at seat 0" is the assumption the
 *  localSeat refactor removed, and which a guest's screen breaks. The two
 *  look identical on the page and only one of them is still true, so the
 *  surviving one says its own name. */
const HOST_SEAT = 0;

/** Which of the three lives this page is leading. `solo` is the shipped
 *  single-player game and every branch below reading `net` must leave it
 *  exactly as it was. The two network roles hold their session, which is
 *  null between a drop and a rejoin - the one state in which nothing may
 *  act, since the two sides can no longer agree on what happened. */
type NetState =
  | { role: "solo" }
  | {
      role: "host";
      session: HostSession | null;
      /** The host's own faction, held rather than dealt: in a net game the
       *  map click cannot deal, because the guest has not picked yet. */
      hostPick: string | null;
      /** The guest's seat index, set at deal time. Null until then. */
      guestSeat: number | null;
      peerId: string | null;
    }
  | {
      role: "guest";
      session: GuestSession | null;
      hostId: string;
      /** The build the guest confirmed, until the host deals with it. */
      build: Strategy | null;
      /** The guest's faction, set by the start snapshot. */
      faction: string | null;
      /** The land the host has taken, from the lobby. Marked unpickable on
       *  the guest's map: the host's reject is a backstop, not the way a
       *  player should learn a land is gone. */
      taken: string | null;
    };

let net: NetState = { role: "solo" };
/** The PeerJS peer behind the current role, kept so abandoning a net game
 *  can hand the broker id back rather than leaving it registered. */
let netPeer: { close(): void } | null = null;

/** The seats this screen can tell apart, as `src/decisions.ts` asks for
 *  them. Only the host holds a remote seat: a guest runs no turn but its
 *  own, so the AI chain and the waiting line are questions it never asks. */
function seats(): Seats {
  return {
    localSeat,
    remoteSeat: net.role === "host" ? net.guestSeat : null,
  };
}

/** Who decides this seat's turn. The AI chain runs on `ai` seats only, and
 *  `remote` is the one answer that locks this screen without ending the
 *  round: the other human is thinking. */
function controllerOf(seat: number): Controller {
  return controllerOfSeat(seat, seats());
}

/** True once the network game has been dealt - the host knows the guest's
 *  seat, the guest knows its faction. Until then the lobby is still
 *  talking, and the panel's status line is the only place it can. */
function netStarted(): boolean {
  if (net.role === "host") return net.guestSeat !== null;
  if (net.role === "guest") return net.faction !== null;
  return false;
}

/** The display name of the OTHER human behind this faction, or null when
 *  nobody is - every AI seat, and every seat in a solo game. Written once
 *  and read by both surfaces that show it, the scoreboard row (through the
 *  hud callback) and the map hover, so the two cannot disagree.
 *
 *  Plain text, deliberately: a player's name is neither a card name nor a
 *  faction name, so there is nothing here for the rich-text rule to point
 *  at. The faction beside it stays a segment wherever it is drawn. */
function playerNameOfFaction(factionId: string): string | null {
  if (net.role === "host" && net.guestSeat !== null) {
    return game().players[net.guestSeat]?.factionId === factionId
      ? (net.session?.guestName() ?? "Guest")
      : null;
  }
  if (net.role === "guest") {
    return game().players[HOST_SEAT]?.factionId === factionId
      ? (net.session?.hostName() ?? "Host")
      : null;
  }
  return null;
}

function localHuman() {
  return game().players[localSeat];
}

function isLocalTurn(): boolean {
  return game().phase === "playing" && game().current === localSeat;
}

function inPlay(): boolean {
  return (
    game().phase === "playing" ||
    game().phase === "victory" ||
    game().phase === "defeat"
  );
}

/** What this screen's seat may play right now.
 *
 *  `repeatOnlyOf` is what carries the re-opened turn in: it answers null while
 *  the turn is unspent, so this one call covers a fresh turn, a turn re-opened
 *  by a card that plays again, and a turn spent for good - and the screen never
 *  learns which card did the re-opening. */
function humanPlayableSet() {
  const human = localHuman();
  return playableSet(
    viewOf(game()), human.factionId, human.hand, { repeatOnly: repeatOnlyOf(game()) },
  );
}

/** Why the human cannot play this card this turn, or null when they can. The
 *  gate on the click and the line on the hover come from this one call. */
function humanBlockReason(cardId: string) {
  const human = localHuman();
  if (!human) return null;
  return handBlockReason(
    viewOf(game()), human.factionId, human.hand, cardId,
    { repeatOnly: repeatOnlyOf(game()) },
  );
}

/** Whether the LOCAL player owes an answer about a conquest. Asked wherever
 *  input has to wait on the modal, so the wait is the same question the modal
 *  is raised on rather than a second reading of the same store. */
function localTransferPending(): boolean {
  return (localPendingTransfers()?.length ?? 0) > 0;
}

/** The local player's unanswered conquests, oldest first. A queue because a
 *  turn can take more than one land - see GameState.pendingTransfers. */
function localPendingTransfers(): { from: string; to: string }[] | undefined {
  const me = localHuman()?.factionId;
  return me === undefined ? undefined : game().pendingTransfers[me];
}

/** The conquest already asked about, `from>to`, or null when the local seat
 *  owes nothing. Cleared the moment the queue's front is a different pair or
 *  the queue is empty, so a land taken twice in one run is asked about twice.
 *
 *  The guard is for the GUEST, where "a stage runs once per transition" is not
 *  enough. A guest's answer crosses the wire while its own replica still
 *  carries the question, and the host pushes on every decision - so an update
 *  built before that answer was processed still says a conquest is pending,
 *  and its stage 3 would raise the same modal a second time. The host has by
 *  then popped its queue, so the second answer would move defenders into the
 *  NEXT conquest, whose numbers the player was never shown. */
let transferAsked: string | null = null;

/** Stage 3: the conquest question, if this move left the local seat owing
 *  one. `done` fires on the answer, so nothing resolves - and no summary
 *  rises - over a question the player has not answered.
 *
 *  Keyed by the LOCAL player's faction, which is the whole of the check: the
 *  store replicates whole, so a screen reading it without asking whose
 *  question it is raised the other human's conquest modal and answered it
 *  into a copy the next update threw away. */
function askTransfer(done: () => void): void {
  // The front of the queue: one pair of lands per modal, in the order the
  // lands fell. Answering pops it and the next conquest raises its own.
  const pending = localPendingTransfers()?.[0];
  if (pending === undefined) {
    transferAsked = null;
    done();
    return;
  }
  const key = `${pending.from}>${pending.to}`;
  if (transferAsked === key) {
    // Already asked, and answered as far as this screen knows - see the key's
    // own comment. Releasing rather than holding: the stage owes its `done`
    // whether or not it had anything to put on screen.
    done();
    return;
  }
  transferAsked = key;
  const v = viewOf(game());
  hud.showTransferOffer(
    {
      ...pending,
      max: transferLimit(game(), pending.from, pending.to),
      fromHas: defenseOf(v, pending.from),
      fromMax: defenseMaxOf(v, pending.from),
      toHas: defenseOf(v, pending.to),
      toMax: defenseMaxOf(v, pending.to),
    },
    {
      onConfirm(amount) {
        hud.hideHarvestUi();
        decide({ kind: "transfer", amount });
        done();
      },
    },
  );
}

/** Whether the hand is a forced discard rather than a play. Reads
 *  `playedThisTurn` and not `turnOpen`, deliberately: the forced discard exists
 *  to unstick a turn that has done nothing, and a turn re-opened by its own
 *  play has already done something. Ending it is the way out of a re-opened
 *  turn with nothing left to repeat. */
function discardMode(): boolean {
  return (
    isLocalTurn() &&
    !game().playedThisTurn &&
    forcesDiscardWhenStuck(game().rules) &&
    humanPlayableSet().mode === "discard"
  );
}

/** `polygonFaction` is the land's OWN faction, not the resolved one - see
 *  relationshipLine in view.ts. `humanFaction` is null on the faction picker,
 *  where no seat has been dealt yet and the fealty is spelled in the third
 *  person. */
function allegianceOf(
  polygonFaction: string,
  humanFaction: string | null,
): Segment[] | null {
  return relationshipLine(
    polygonFaction, humanFaction, game().overlords, game().incorporated,
  );
}

/** Names for the plain-text half of a segment line. The HUD owns the hoverable
 *  half through its own `richTextHooks`; this is only what a floating tooltip,
 *  which cannot be pointed at, falls back to. */
const richTextNames: NameLookup = {
  factionName: (id) => factionById.get(id)?.name ?? id,
  isPlaceName: (id) => factionById.get(id)?.placeName === true,
};

function effectiveFaction(f: string): string {
  return game().incorporated[f] ?? f;
}

/** The faction whose COLOUR a land is painted in.
 *
 *  An annexed land is its annexer's outright - one hue, no stripes. A land
 *  held as a vassal keeps its own hue and wears its lord's stripes, because
 *  there is still a people and a chief there with a claim to be named.
 *
 *  Unless nobody leads it. A conquest takes the land, not its people's
 *  allegiance to a chief who does not exist (`vacateRulers`), and a hue is
 *  about somebody: a leaderless vassal has nobody left for its own colour to
 *  be about, so it is painted its lord's. That is most conquests, which is why
 *  a realm built out of them read as a patchwork rather than as one realm.
 *
 *  Walked UP the chain, so a leaderless land held by another leaderless land
 *  reads as the nearest lord that still has a chief - resolving one link at a
 *  time would have painted the middle land's hue onto the bottom one while the
 *  middle itself was painted somebody else's. */
function fillFactionFor(factionId: string): string {
  let at = effectiveFaction(factionId);
  for (let step = 0; step < game().players.length; step++) {
    const lord = game().overlords.get(at);
    if (lord === undefined || hasRuler(game().rulers, at)) break;
    at = effectiveFaction(lord);
  }
  return at;
}

/** What a land nobody plays and nobody holds is painted. One flat grey for all
 *  of them: twenty-one peoples' hues, none of them playing, was the map
 *  describing a game that was not happening. Darker than the off-map neighbour
 *  grey, so the coast still reads as the edge of the world. */
const UNOWNED_FILL = "#c3bfb6";

function applyOwnership(): void {
  const human = localHuman();
  const humanOverlord = human ? game().overlords.get(human.factionId) : undefined;
  // `fullRealmOf`, the same count the scoreboard and the win condition apply. A
  // land a vassal annexed already sits inside the realm outline and wears the
  // stripes; shading it as somebody else's left one land of your own total
  // greyed out and outside the halo.
  const humanRealm =
    inPlay() && human
      ? fullRealmOf(human.factionId, game().overlords, game().incorporated)
      : new Set<string>();
  const overlordRealm =
    inPlay() && humanOverlord !== undefined
      ? fullRealmOf(humanOverlord, game().overlords, game().incorporated)
      : new Set<string>();
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective = inPlay() ? fillFactionFor(region.faction) : region.faction;
    // Grey is "keeps to itself, and nothing answers to it". The first half is
    // the status, and it comes off the moment somebody takes the land, so a
    // conquest turns its own hue under the vassal stripes without this having
    // to ask who holds it.
    //
    // The second half is for a region that opens with realms already standing
    // (`seedRealms` in src/game.ts). A realm's root may perfectly well keep to
    // itself - the status is about answering to nobody, and holding vassals is
    // not answering to anybody - but its lands are held, so they are painted
    // its hue while it took the flat grey, and a kingdom read as four counties
    // around a hole where its capital sits. Grey means unclaimed ground, and a
    // land four others answer to is not that.
    const realmSize =
      fullRealmOf(region.faction, game().overlords, game().incorporated).size;
    const grey =
      inPlay() && !playsTurns(game().passives, region.faction) && realmSize === 1;
    el.setAttribute(
      "fill", grey ? UNOWNED_FILL : factionById.get(effective)!.color,
    );
    const owned = humanRealm.has(region.faction);
    el.classList.toggle(
      "dimmed",
      inPlay() && !owned && !overlordRealm.has(region.faction),
    );
    // A land that belongs to a rival PLAYER's realm, by its realm root rather
    // than by itself: a quiet land somebody has subjugated is part of that
    // player's showing on the map, and reading it off the land's own faction
    // would leave every conquest looking like unheld ground.
    el.classList.toggle(
      "in-play",
      inPlay() &&
        playsTurns(
          game().passives,
          realmRootOf(region.faction, game().overlords, game().incorporated),
        ),
    );
    el.classList.toggle("owned", owned);
    if (owned) {
      // The REALM's colour, not this land's. The outline runs around the whole
      // realm, and taking each land's own hue made one continuous border
      // change colour part-way along it and vanish where it met a fill of the
      // same family - which reads as an outline with holes in it.
      el.style.setProperty(
        "--owned-stroke",
        darkenColor(
          factionById.get(
            realmRootOf(region.faction, game().overlords, game().incorporated),
          )!.color,
          0.55,
        ),
      );
    } else {
      el.style.removeProperty("--owned-stroke");
    }
  }
  renderRealmHalo(human?.factionId, humanRealm);
  renderVassalOverlay();
  applyPeopleLabels();
}

/** Every vassal's whole realm (itself plus lands it has incorporated) gets a
 *  stripe overlay in its overlord's color - not just the human's realm. */
function renderVassalOverlay(): void {
  vassalOverlayGroup.replaceChildren();
  vassalStripes.length = 0;
  if (!inPlay()) return;
  for (const [vassal, lord] of game().overlords) {
    // A leaderless vassal wears no stripes: `fillFactionFor` has already
    // painted it its lord's colour outright, and striping a land that is
    // already the lord's hue with the lord's hue says nothing.
    if (!hasRuler(game().rulers, vassal)) continue;
    for (const factionId of realmOf(vassal, game().overlords, game().incorporated)) {
      const regionId = regionByFaction.get(factionId);
      const region = regionId !== undefined ? regionById.get(regionId) : undefined;
      if (!region) continue;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", region.path);
      p.setAttribute("fill", `url(#vassal-stripes-${lord})`);
      p.setAttribute("pointer-events", "none");
      vassalOverlayGroup.appendChild(p);
      vassalStripes.push({ path: p, lord, land: factionId });
    }
  }
  syncVassalStripes();
}

/** The stripes are the OVERLORD's colour, so they carry the overlord's
 *  intensity - dimmed when its land is dimmed, full when a hover or a targeting
 *  cue lifts it. They live in their own group, outside the regions, so
 *  `.region.dimmed` never reached them: a dimmed overlord kept full-strength
 *  stripes on its vassal and the vassal read as the loudest thing on the map.
 *
 *  Read off the lord's COMPUTED opacity rather than mirrored with a class,
 *  because "how visible is that land right now" is the answer of a dozen rules
 *  interacting - dimmed, realm-hover, holder-hover, target-invalid - and this
 *  wants the result, not a second copy of the reasoning. */
function syncVassalStripes(): void {
  // While a pin holds or an arrow hover narrows the map, a stripe follows the
  // LAND it is drawn on rather than its lord: the land the map has narrowed to
  // is the one thing that must stay legible, and taking its lord's opacity
  // would strip it of the very marking that says whose it is.
  const focused = svg.classList.contains("arrow-focused");
  const narrowed = svg.classList.contains("pinning") || focused;
  for (const { path, lord, land } of vassalStripes) {
    const source = narrowed ? land : lord;
    const regionId = regionByFaction.get(source);
    const el = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!el) continue;
    // An arrow hover REPAINTS the lands it is not about instead of fading
    // them, so there is no opacity left to read: a stripe would keep its
    // overlord's colour on a land that has gone off the map. It comes off
    // explicitly, and only there.
    path.style.opacity = focused && !el.classList.contains("arrow-end")
      ? "0"
      : getComputedStyle(el).opacity;
  }
}

/** A people's label hides once every faction of that ethnicity is
 *  incorporated - the polity is gone and its fill has flipped to its
 *  owner's color, so the ethnonym stops floating over another realm. */
function applyPeopleLabels(): void {
  for (const [peopleId, labels] of peopleLabels) {
    const hidden =
      inPlay() &&
      data.factions
        .filter((f) => f.ethnicity === peopleId)
        .every((f) => f.id in game().incorporated);
    for (const label of labels) label.classList.toggle("hidden", hidden);
  }
}

function renderRealmHalo(
  humanFaction: string | undefined,
  humanRealm: Set<string>,
): void {
  realmOutlineGroup.replaceChildren();
  if (!inPlay() || humanFaction === undefined) return;
  const color = brightenColor(factionById.get(humanFaction)!.color, 0.35);
  for (const factionId of humanRealm) {
    const regionId = regionByFaction.get(factionId);
    const region = regionId !== undefined ? regionById.get(regionId) : undefined;
    if (!region) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", region.path);
    p.setAttribute("stroke", color);
    p.setAttribute("fill", color);
    realmOutlineGroup.appendChild(p);
  }
}

/** One outline around every realm that spans two or more polygons, always on.
 *  Same trick as the hover halo: `outerOutline` masks away everything inside
 *  the realm, so the lines between its own lands are not drawn at all and only
 *  its outer edge survives.
 *
 *  A realm of one polygon gets nothing - its own border already is its outline.
 *  The human's own realm gets nothing either: `renderRealmHalo` is this outline
 *  in brighter form, and drawing both would ring it twice. An overlord the
 *  human is vassal to is not the human's root, so it still gets one. */
function renderRealmUnions(): void {
  realmUnionGroup.replaceChildren();
  const human = localHuman();
  // while a card is armed the targeting cues own the map, the same reason
  // applyRealmHover drops the hover halo
  const live = inPlay() && armed === null;
  const byRoot = new Map<string, string[]>();
  if (live) {
    for (const factionId of game().factionIds) {
      const root = realmRootOf(factionId, game().overlords, game().incorporated);
      const members = byRoot.get(root) ?? [];
      members.push(factionId);
      byRoot.set(root, members);
    }
  }
  realmEdgeGroup.replaceChildren();
  realmEdgePaths.clear();
  const seamed = new Set<string>();
  for (const [root, members] of byRoot) {
    const regions = members
      .map((f) => regionByFaction.get(f))
      .map((id) => (id !== undefined ? regionById.get(id) : undefined))
      .filter((r): r is Region => r !== undefined);
    if (regions.length < 2) continue;
    for (const region of regions) seamed.add(region.id);
    // The edge copies come first, and unlike the band they are built for the
    // human's realm too: `.owned` is the heaviest stroke on the map and its
    // seams were the most visible of the lot.
    const mask = outsideMask(
      realmEdgeGroup, `realm-edge-mask-${root}`, regions.map((r) => r.path),
    );
    for (const region of regions) {
      realmEdgePaths.set(region.id, maskedPath(realmEdgeGroup, region.path, mask));
    }
    if (root === human?.factionId) continue;
    const unionMask = outsideMask(
      realmUnionGroup, `realm-union-mask-${root}`, regions.map((r) => r.path),
    );
    const d = regions.map((r) => r.path).join(" ");
    // Band first, casing over it. Everything here is clipped to OUTSIDE the
    // realm, so there is no room on the inner side of the band to put a casing
    // - the only way to hold the band off the boundary is to draw it wide and
    // then paint the innermost slice of it pale. Widths in the CSS.
    const band = maskedPath(realmUnionGroup, d, unionMask);
    band.classList.add("ru-band");
    band.setAttribute("stroke", darkenColor(factionById.get(root)!.color, 0.5));
    maskedPath(realmUnionGroup, d, unionMask).classList.add("ru-casing");
  }
  // The pale dashed seam goes on the members themselves: a region's own stroke
  // draws its whole outline, inner edges included, and that is now ALL it is
  // allowed to draw - see the `.region.realm-member` rule. Everything the land
  // says about itself is on its edge copy above, clipped to the realm's outer
  // boundary.
  for (const [id, el] of regionPaths) {
    el.classList.toggle("realm-member", seamed.has(id));
  }
  syncRealmEdges();
}

/** Copies each region's classes and inline style onto its edge copy, so the
 *  copy is styled by the very same `.region.*` rules and cannot fall behind
 *  them. A copy is not a mirror: there is no second list of colours anywhere,
 *  only this one assignment, and the one rule that must NOT reach the copy
 *  excludes it by name (`.region.realm-member:not(.realm-edge)`).
 *
 *  Driven by an observer rather than by calls at each of the four places that
 *  toggle a region class (`applyOwnership`, `applyTargeting`, `applyRealmHover`
 *  and `renderRealmUnions`). Four call sites nobody may forget is the shape of
 *  drift this codebase keeps writing tests against, and there is no test that
 *  can reach main.ts - so the sync is wired to the mutation itself. */
function syncRealmEdges(): void {
  for (const [id, edge] of realmEdgePaths) {
    const region = regionPaths.get(id);
    if (region === undefined) continue;
    edge.setAttribute("class", `${region.getAttribute("class")} realm-edge`);
    // The inline style comes too, because a class is not always the whole
    // answer: `.region.owned` paints `var(--owned-stroke)`, and that custom
    // property is set per land in applyOwnership. Without it the copy resolved
    // an undefined var, which for an inherited property means `stroke` falls
    // back to none - the copy carried the class and drew nothing.
    edge.setAttribute("style", region.getAttribute("style") ?? "");
  }
}

/** One countdown tspan on a badge: a timed status's letter and the turns it
 *  has left, in that status's colour. Every timed status the badge counts
 *  down (a respite's R) goes through here, so they all share the
 *  `expiry - turn` arithmetic and the 9px gap. */
function appendCountdown(
  text: SVGTextElement, letter: string, turnsLeft: number, className: string,
): void {
  const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
  tspan.classList.add(className);
  tspan.setAttribute("dx", "9");
  tspan.textContent = `${letter}${turnsLeft}`;
  text.appendChild(tspan);
}

const BAND_CLASS: Record<GateBand, string> = {
  high: "band-high",
  middle: "band-middle",
  open: "band-open",
};

/** One badge per living polygon: its `defense/max`, coloured by the band it
 *  sits in - at or above the independence line, between the gates, or at or
 *  under the subjugation gate, which is the state that must pop. Disease
 *  shows as one pip per stack in the owner's faction colour under the
 *  number.
 *
 *  While a card is armed the board narrows to what the card can be aimed at:
 *  badges survive only on the legal targets, so a number floating over an
 *  excluded polygon never reads as a live option. */
/** A polygon's drawing anchor, in the map's own 1000x1400 user space: the
 *  centre of its bounding box where that lands ON the polygon, and otherwise
 *  the land's own town nearest to it.
 *
 *  Shared by the badge, the floating marks and the camera deliberately. Two
 *  anchors computed two ways would drift, and a label that lands somewhere
 *  other than the badge it is about is a label the player has to guess at.
 *  Undefined for a faction with no region, and zeros under happy-dom, where
 *  `getBBox` is a stub - which is why arrow GEOMETRY is tested against
 *  src/arrows.ts and src/borders.ts with injected points rather than through
 *  this.
 *
 *  **A bounding-box centre is not a place**: these polygons are long and bent
 *  around coastline, so the centre of the box around one sits outside it often
 *  enough to matter - arrows anchored on box centres were starting out at sea.
 *  A town is guaranteed to be inside its own land because the map drew it
 *  there, which is why `sceneCtx.freeAnchor` prefers one.
 *
 *  The box centre is still preferred where it lands on the polygon, and that
 *  is not timidity about churn. A town sits where a town sits - often against
 *  a coast or a border - and moving every badge onto one pushed anchors that
 *  were already central out to the edges, where a badge overhangs its
 *  neighbour and buys back the very problem this fixes. Only the lands the
 *  box actually fails get moved.
 *
 *  This is a hit-testing rule, not decoration. Nothing on the badge layer
 *  takes the pointer - `.threat-badges` is `pointer-events: none` - so a click
 *  on a badge passes straight through to whatever land lies under it. A badge
 *  drawn outside its own land therefore aims at a land the player is not
 *  pointing at, and says nothing: the Warmians' number sat over Pamede, so
 *  clicking it answered for the Pomesanians. */
function regionCenter(factionId: string): { x: number; y: number } | undefined {
  const regionId = regionByFaction.get(factionId);
  const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
  if (!pathEl) return undefined;
  const bbox = pathEl.getBBox();
  const box = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
  const towns = townsByFaction.get(factionId) ?? [];
  // No towns to fall back on, or no way to ask - happy-dom implements neither
  // `isPointInFill` nor `DOMPoint`, and there is no layout there to ask about.
  if (
    towns.length === 0 ||
    typeof pathEl.isPointInFill !== "function" ||
    typeof DOMPoint !== "function"
  ) {
    return box;
  }
  if (pathEl.isPointInFill(new DOMPoint(box.x, box.y))) return box;
  // Nearest the box centre, so a moved anchor lands as close as it can to
  // where the eye already looks. In map order, so a tie picks the same town on
  // every redraw.
  let best = towns[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const t of towns) {
    const d = (t.x - box.x) ** 2 + (t.y - box.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return { x: best.x, y: best.y };
}

function renderThreatBadges(): void {
  badgeGroup.replaceChildren();
  const human = localHuman();
  if (!inPlay() || !human) return;
  const v = viewOf(game());
  const targets = targetingLive() ? new Set(armedTargets()) : null;
  for (const factionId of game().factionIds) {
    // An annexed polygon still has a defense score a card can hit, so it keeps
    // its badge while targeting narrows the map to it - but at rest it is part
    // of a realm, and a full-strength badge on every dead land buries the live
    // ones.
    const annexedAndWhole =
      factionId in game().incorporated &&
      defenseOf(v, factionId) >= defenseMaxOf(v, factionId) &&
      game().disease[factionId] === undefined;
    // Aiming does NOT take the numbers away. The badges used to narrow to the
    // legal targets, which meant that while picking the land a raid marches
    // OUT of, every land it could be sent AT lost the one number that decides
    // where to send it.
    if (annexedAndWhole && (targets === null || !targets.has(factionId))) {
      continue;
    }
    const centre = regionCenter(factionId);
    if (centre === undefined) continue;
    const { x: cx, y: cy } = centre;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("threat-badge");
    // Which land's number this is, for the surfaces that narrow the map to a
    // land or two and have to take the rest of the numbers away.
    g.dataset.faction = factionId;
    const band = gateBandOf(v, factionId);
    g.classList.add(BAND_CLASS[band]);
    g.setAttribute("transform", `translate(${cx}, ${cy})`);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("badge-bg");
    rect.setAttribute("rx", "4");
    g.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("badge-text");
    const score = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    score.classList.add("badge-defense");
    score.textContent = `${defenseOf(v, factionId)}/${defenseMaxOf(v, factionId)}`;
    text.appendChild(score);
    // A faction under its post-escape respite cannot be subjugated even at an
    // open gate: the countdown says for how long.
    const respite = respiteExpiry(game(), factionId);
    if (respite !== undefined) {
      appendCountdown(text, "R", respite - game().turn, "lead-respite");
    }
    g.appendChild(text);

    // The disease pips: one circle per stack, in the owner's colour, in
    // faction order so a seeded run draws deterministically. Public state,
    // per the design - counts live in the hover's disease block.
    //
    // Each pip says WHOSE it is, because a badge walk is per owner: one
    // `winds-shifted` moves two owners' stacks on one polygon in opposite
    // directions, and a walk that could not tell the pips apart would be one
    // number for two facts - see `walkBadgePips`.
    const owners = game().disease[factionId];
    if (owners !== undefined) {
      let pip = 0;
      for (const owner of game().factionIds) {
        const stacks = owners[owner] ?? 0;
        for (let s = 0; s < stacks; s++) {
          g.appendChild(diseasePip(owner, pip));
          pip++;
        }
      }
    }
    // The army pips, above the number where the disease pips sit below it: a
    // hollow one is an army already out on a march and a filled one is an army
    // that can still be sent. Capped at ARMY_PIPS_SHOWN and then counted,
    // because Create army is uncapped and a land holding six would otherwise
    // grow a badge wider than the land it sits on.
    const stationed = armiesOn(game().armies, factionId, armyCapOn(v, factionId));
    const free = freeArmiesFor(v, factionId);
    if (stationed > 0) {
      const shown = Math.min(stationed, ARMY_PIPS_SHOWN);
      for (let i = 0; i < shown; i++) {
        const pip = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        pip.classList.add("badge-army", i < free ? "army-free" : "army-away");
        pip.setAttribute("width", "4");
        pip.setAttribute("height", "6");
        pip.setAttribute("rx", "1");
        pip.setAttribute("x", String(i * 6 - (shown * 6 - 2) / 2));
        pip.setAttribute("y", "-19");
        g.appendChild(pip);
      }
      if (stationed > shown) {
        const more = document.createElementNS("http://www.w3.org/2000/svg", "text");
        more.classList.add("badge-army-more");
        more.setAttribute("x", String((shown * 6 - 2) / 2 + 2));
        more.setAttribute("y", "-13");
        more.textContent = `x${stationed}`;
        g.appendChild(more);
      }
    }
    // The settlement pips, one row above the armies and read exactly the same
    // way: filled is a settlement a fortify can still be called on, hollow is
    // one already called on this turn. Wide where an army pip is tall, so the
    // two rows are told apart at a glance - a settlement sits, an army stands.
    // No overflow count: `settlementAllowance` caps a land at two.
    const sites = settlementsIn(v, factionId);
    const freeSites = freeSettlementsIn(v, factionId);
    for (let i = 0; i < sites; i++) {
      const pip = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      pip.classList.add("badge-site", i < freeSites ? "site-free" : "site-spent");
      pip.setAttribute("width", "6");
      pip.setAttribute("height", "4");
      pip.setAttribute("rx", "1");
      pip.setAttribute("x", String(i * 8 - (sites * 8 - 2) / 2));
      pip.setAttribute("y", "-27");
      g.appendChild(pip);
    }
    badgeGroup.appendChild(g);

    const textBox = text.getBBox();
    const pad = 6;
    rect.setAttribute("x", String(textBox.x - pad));
    rect.setAttribute("y", String(textBox.y - pad));
    rect.setAttribute("width", String(textBox.width + pad * 2));
    rect.setAttribute("height", String(textBox.height + pad * 2));
  }
  // The group was rebuilt from nothing, so whatever an arrow hover had taken
  // away is back. Re-asked here rather than at every caller: a refresh landing
  // mid-hover would otherwise restore every number on the map.
  applyArrowFocus();
}

/** One disease stack on a badge: a dot in its owner's colour, at the `index`th
 *  slot of the pip row. The row runs left to right across every owner in
 *  faction order, so the slot is a position in the whole row rather than in
 *  one owner's share of it. */
function diseasePip(owner: string, index: number): SVGCircleElement {
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.classList.add("badge-pip");
  dot.dataset.owner = owner;
  dot.setAttribute("r", "3.5");
  dot.setAttribute("cx", String(index * 9));
  dot.setAttribute("cy", "14");
  dot.setAttribute("fill", factionById.get(owner)?.color ?? "#000");
  return dot;
}

/** Army pips drawn before the badge falls back to a count. Five is what fits
 *  beside the widest defense number without overhanging its box. */
const ARMY_PIPS_SHOWN = 5;

/** Every town the map actually DRAWS in each land, by faction id.
 *
 *  Unlocked only. A locked site is authored but never rendered, and an arrow
 *  anchored on one points at a place the player cannot see: the head stopped
 *  in open country dozens of units from the town it was supposed to bite,
 *  which reads as an arrow aimed at nothing. An anchor has to be somewhere
 *  there is a dot.
 *
 *  Deliberately not `sitesByFaction`, which answers the opposite question -
 *  where can this land still build - and therefore drops exactly the towns
 *  that are standing there. */
const townsByFaction = ((): Map<string, { x: number; y: number }[]> => {
  const out = new Map<string, { x: number; y: number }[]>();
  for (const s of data.settlements) {
    if (!s.unlocked) continue;
    const faction = factionByRegion.get(s.land);
    if (faction === undefined) continue;
    out.set(faction, [...(out.get(faction) ?? []), { x: s.x, y: s.y }]);
  }
  return out;
})();

/** The rings of every land on this map, parsed once. `crossingBetween` is
 *  cached per border because the walk is over a thousand vertices a side. */
const ringsByFaction = new Map<string, Pt[][]>(
  data.regions.map((r) => [r.faction, ringsOf(r.path)]),
);
const crossings = new Map<string, Crossing | null>();

/** The border between two lands, from the first's side. `renderArrowScene`
 *  always asks for it in the sorted pair's order and reads direction off
 *  `forward: s.from === a`, so one entry per unordered pair is what gets
 *  read; caching it saves recomputing `crossingBetween`, which is a walk
 *  over a thousand vertices a side. */
function crossingFor(from: string, to: string): Crossing | null {
  const key = `${from}>${to}`;
  const hit = crossings.get(key);
  if (hit !== undefined) return hit;
  const a = ringsByFaction.get(from);
  const b = ringsByFaction.get(to);
  const value = a === undefined || b === undefined
    ? null
    : crossingBetween(a, b);
  crossings.set(key, value);
  return value;
}

/** What the arrow scene needs from the map to place a spec: where a border is,
 *  and where an arrow that crosses none starts.
 *
 *  The free anchor is a TOWN, not a bounding-box centre. These polygons are
 *  long and bent around coastline, so the centre of the box around one can sit
 *  in a bay - arrows were starting out at sea. A town is guaranteed to be
 *  inside its own land because the map drew it there. The box centre is only
 *  the fallback for a land the map gave no town, and for the test environment,
 *  where `getBBox` is a stub anyway. */
const sceneCtx: SceneCtx = {
  crossingFor,
  freeAnchor: (from) =>
    townsByFaction.get(from)?.[0] ?? regionCenter(from) ?? null,
};

/** How many turns until this faction acts again, from where the round stands.
 *  A seat whose turn is happening NOW is a full lap away from its next one,
 *  which is why 0 reads as `players.length` rather than as "immediately". */
function turnsUntilActs(factionId: string): number {
  const n = game().players.length;
  const seat = game().players.findIndex((p) => p.factionId === factionId);
  if (seat < 0) return Number.POSITIVE_INFINITY;
  const steps = (seat - game().current + n) % n;
  return steps === 0 ? n : steps;
}

/** Everything in flight at each land, in the order it will resolve.
 *
 *  A march and a claim both land at the start of their actor's next turn, so
 *  the order is "whose turn comes first", and the answer decides whether a
 *  second raid finds a land already flat - or whether a subjugation arrives
 *  before the raids that would have answered it. The player cannot work that
 *  out from the board, so the arrows carry it.
 *
 *  Grouped by TARGET, and only by target: an ordinal answers "who gets there
 *  first" between things racing for the SAME land.
 *
 *  Deliberately NOT by axis. Two arrows pointing at each other do not take
 *  turns - `resolveAxis` takes both off the board together and lands only the
 *  difference - so numbering them 1st and 2nd described a sequence that never
 *  happens. That pair gets a clash marker instead (`drawClash`). */
function landingOrder(): Map<string, { order: number; clash: boolean }> {
  const axisOf = (a: string, b: string): string => [a, b].sort().join("|");
  const pending: {
    key: string; to: string; from: string; axis: string; at: number;
  }[] = [];
  for (const [key, m] of Object.entries(game().marches)) {
    pending.push({
      key, to: m.to, from: m.from, axis: axisOf(m.from, m.to),
      at: m.expiry * 100 + turnsUntilActs(m.actor),
    });
  }
  for (const [key, c] of Object.entries(game().claims)) {
    pending.push({
      key: `claim:${key}`, to: c.to, from: c.from, axis: axisOf(c.from, c.to),
      at: c.expiry * 100 + turnsUntilActs(c.actor),
    });
  }
  // A clash is one arrow meeting one pointing the other way. They do not take
  // turns - `resolveAxis` takes the pair off the board together and lands only
  // its difference - so they share a rank and say so.
  //
  // PAIRED, not "any two arrows on the axis". The armies pair off one for one
  // in declaration order, so on an axis carrying two arrows one way and one
  // back, the leftover meets nobody and is not in a clash at all. Marking it
  // as one promised the player an answer that was never going to arrive.
  const keyOfMarch = new Map<March, string>(
    Object.entries(game().marches).map(([key, m]) => [m, key]),
  );
  const clashing = new Set<string>();
  for (const axis of axesOf(game().marches)) {
    for (let i = 0; i < Math.min(axis.fromA.length, axis.fromB.length); i++) {
      for (const m of [axis.fromA[i], axis.fromB[i]]) {
        const key = keyOfMarch.get(m);
        if (key !== undefined) clashing.add(key);
      }
    }
  }
  const out = new Map<string, { order: number; clash: boolean }>();
  const byTarget = new Map<string, typeof pending>();
  for (const item of pending) {
    byTarget.set(item.to, [...(byTarget.get(item.to) ?? []), item]);
  }
  for (const group of byTarget.values()) {
    [...group]
      .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
      .forEach((item, i) => {
        const clash = clashing.has(item.key);
        // A lone arrow at a land needs no ordinal, but one locked in a clash
        // does: the label is the only thing saying the two answer each other.
        if (group.length < 2 && !clash) return;
        out.set(item.key, { order: i + 1, clash });
      });
  }
  return out;
}

/** An aim in progress: the land an army would march out of, and where the
 *  pointer is now. Only ever set while a Raid is armed - the same gesture
 *  pans the map otherwise, and a map that moved under a half-drawn arrow
 *  would be answering a question nobody asked. */
interface AimDrag {
  from: string;
  at: { x: number; y: number };
  over: string | null;
}
let aiming: AimDrag | null = null;
/** True while the pointer is down on an aim-drag. The hover preview below
 *  must not touch `aiming` then: the drag owns the arrow until it is let go. */
let aimDragging = false;

/** The arrow the two-click flow draws once a source is picked. Same preview
 *  the drag shows, driven by the pointer instead of by a held button - after
 *  the first click the game is asking "at what", and an answer with no arrow
 *  in it makes the player aim at a status line. */
function updateAimPreview(clientX: number, clientY: number): void {
  if (aimDragging) return;
  const human = localHuman();
  if (armed === null || armedSource === null || !human) {
    if (aiming !== null) {
      aiming = null;
      refreshAim();
    }
    return;
  }
  // The point, not the hovered region. A land is still the land being aimed at
  // when an arrow, a strength label or a settlement dot is drawn on top of it,
  // and the click resolves it exactly that way - but the hover is bound per
  // region path, so those elements took the pointer and the preview read "no
  // land". The marker went dark over a band of the target while the click
  // underneath stayed live, which is the whole disagreement.
  const regionId = landAtPoint(clientX, clientY);
  const faction = regionId === null ? undefined : factionByRegion.get(regionId);
  const legal =
    faction !== undefined &&
    marchTargetsFrom(viewOf(game()), human.factionId, armedSource).includes(faction)
      ? faction
      : null;
  aiming = {
    from: armedSource,
    at: interaction.toMapPoint(clientX, clientY),
    over: legal,
  };
  refreshAim();
}

/** The arrow an armed card would declare, or null while nothing is aimed.
 *
 *  Its strength is the card's own, because the preview's WIDTH is a promise:
 *  it goes into the same lane packing as the arrows already on that border, so
 *  what the player sees is the block the play is about to make. */
function aimSpec(): ArrowSpec | null {
  if (aiming === null) return null;
  const human = localHuman();
  const armedCard = armed === null || !human ? undefined : human.hand[armed];
  const strength = armedCard === undefined
    ? 1
    : attackDamageFor(viewOf(game()), human.factionId, armedCard).damage;
  return {
    id: "aim",
    kind: "aim",
    from: aiming.from,
    // A legal target crosses the real border; a drag over open map runs to the
    // pointer, which is the one arrow in the game with no border to cross.
    to: aiming.over ?? "",
    at: aiming.over === null ? aiming.at : undefined,
    strength,
    tone: "ours",
  };
}

/** The aim, repainted for where the pointer now is: the land it would land on,
 *  and the whole arrow layer under it.
 *
 *  The layer and not a preview of its own, and that is the point. The preview
 *  is a lane in the same scene as the live arrows, so pointing back down a
 *  border re-packs the block and the preview stands BESIDE the arrow it
 *  answers. Drawn alone it took the whole block and was painted straight over
 *  that arrow, which is the commonest aim there is - a counter-raid. */
function refreshAim(): void {
  // The land the arrow would land on, marked on the map itself. An arrow
  // ending near a border is ambiguous at any zoom, and the answer to "which
  // land is this aimed at" must not be the player's guess.
  for (const [id, el] of regionPaths) {
    el.classList.toggle(
      "aim-target",
      aiming !== null && aiming.over !== null &&
        factionByRegion.get(id) === aiming.over,
    );
  }
  renderMarchArrows();
}

/** Everything in flight, described rather than drawn: one spec per march and
 *  per claim, handed to the arrow scene, which owns where each one goes and how
 *  wide it is. What is left here is what an arrow MEANS - whose it is, what it
 *  carries, when it lands - and the behaviour bound to the group the scene
 *  gives back. */
function renderMarchArrows(): void {
  const human = localHuman();
  if (!inPlay() || !human) {
    arrowGroup.replaceChildren();
    // The ghosts go with them. A run that has ended is not a run with a march
    // still landing on it, and a fade left running paints over the postmortem.
    ghostGroup.replaceChildren();
    syncArrowFocus();
    return;
  }
  // Aiming does NOT take the arrows away, for the same reason it does not take
  // the badges away: what is already flying at a land is half of what decides
  // whether to send an army there, and a map that hid it had the player choose
  // a target against a board it was not showing them. An enemy raid a round
  // from landing went invisible at exactly the moment it mattered, and the
  // land it was about to take looked free.
  //
  // Inert rather than absent: no counter click, no hover focus, so while an
  // aim is live the only thing a click on the map can mean is still "this
  // land". `.aiming` in src/style.css is the pointer half.
  const targeting = targetingLive();
  arrowGroup.classList.toggle("aiming", targeting);
  const realm = fullRealmOf(human.factionId, game().overlords, game().incorporated);
  const order = landingOrder();
  const specs: ArrowSpec[] = [];
  for (const [key, m] of Object.entries(game().marches)) {
    const against = realm.has(m.to);
    const ours = realm.has(m.from);
    specs.push({
      id: key, kind: "march", from: m.from, to: m.to, strength: m.damage,
      // Against you first: an arrow between your own two lands cannot happen
      // (attackReach excludes what you hold outright, and a raid on your own
      // vassal IS aimed at your realm), so the order only decides how a lord's
      // raid on its own vassal reads - and that is an attack on your realm.
      tone: against ? "hostile" : ours ? "ours" : "other",
      // A quarrel between two rivals is drawn in the attacker's own colour, so
      // whose army it is can be read off the map without hovering it.
      fill: against || ours
        ? undefined
        : factionById.get(m.actor)?.color ?? "#7a6a55",
      label: `${m.damage} STR`,
      chip: order.get(key),
      dataset: {
        actor: m.actor, target: m.to,
        // The two ENDS, which is what the hover lights. Not the same question
        // as `actor`: a lord marches out of a land its vassal holds, so who
        // sent the army and where it left from are different lands.
        from: m.from,
      },
    });
  }
  // Claims LAST, so on a border carrying both the demand takes its lane after
  // the spears and is drawn over them wherever they meet. A demand of fealty
  // decides who owns a land; a raid decides a number on it, and the more
  // consequential of the two must not end up under the other.
  for (const [key, claim] of Object.entries(game().claims)) {
    const against = realm.has(claim.to);
    const ours = realm.has(claim.from);
    // Says so when it is already going to come to nothing. The demand rides
    // for a whole turn and the board moves under it - a heal past the gate is
    // the ordinary answer to one - so an arrow that still reads as a threat
    // after it has been answered is the map lying about the one thing it is
    // for.
    const doomed = !claimWouldLand(viewOf(game()), claim.actor, claim.to);
    specs.push({
      id: `claim:${key}`, kind: "claim", from: claim.from, to: claim.to,
      // A claim has no strength of its own: it is one declared thing, and the
      // lane split is only dividing the border between the arrows on it.
      strength: 1,
      tone: against ? "hostile" : ours ? "ours" : "other",
      label: doomed ? "SUBJUGATE (will fail)" : "SUBJUGATE",
      doomed,
      chip: order.get(`claim:${key}`),
      dataset: { actor: claim.actor, target: claim.to, from: claim.from },
    });
  }
  // The aim preview LAST of all, so it is appended over whatever it shares a
  // border with - and in THIS scene rather than a layer of its own, so the
  // block re-packs around it as the player aims. That re-pack is the preview's
  // whole job: an arrow drawn alone takes the full block, and pointing back
  // down a border painted the preview straight over the raid it was answering.
  const preview = aimSpec();
  if (preview !== null) specs.push(preview);
  const drawn = renderArrowScene(arrowGroup, specs, sceneCtx);
  drawn.get("aim")?.classList.toggle(
    "aim-valid", aiming !== null && aiming.over !== null,
  );
  // An arrow you could answer right now is a button. Picking a source and a
  // target by hand to aim a counter back down an arrow already on the screen
  // is the game asking the player to restate something it can see, so the
  // arrow takes the click itself.
  //
  // Never while an aim is live: the arrow is on screen to be READ then, and an
  // arrow that is also a button would answer a click the player meant for the
  // land under it.
  for (const [key, m] of Object.entries(game().marches)) {
    const g = drawn.get(key);
    if (g === undefined) continue;
    const counterIndex = targeting ? null : counterFor(m);
    if (counterIndex === null) continue;
    g.classList.add("march-counterable");
    armArrowAsCounter(g, m, counterIndex);
  }
  // Every arrow on the map is new, including the one the pointer is resting
  // on. Nothing will announce that, so the focus is re-derived here rather
  // than waiting for a pointer event that may never come.
  syncArrowFocus();
}

/** The hand index of a Raid that could answer this march right now, or null.
 *
 *  Every condition the two-step targeting flow would have applied, asked in
 *  one place: it is this screen's turn to act, the arrow is aimed at a land of
 *  ours, and that land itself has a free army to send back down the axis. The
 *  last one is what makes the click a real shortcut rather than a guess - a
 *  counter declared from anywhere else is a fresh attack on a different axis
 *  and would not meet this one at all. */
function counterFor(m: March): number | null {
  const human = localHuman();
  if (!human || !isLocalTurn() || !turnOpen(game()) || inputLocked()) return null;
  if (pendingHarvest !== null || discardMode()) return null;
  const realm = fullRealmOf(human.factionId, game().overlords, game().incorporated);
  if (!realm.has(m.to) || realm.has(m.from)) return null;
  const v = viewOf(game());
  if (!marchSourcesAgainst(v, human.factionId, m.from).includes(m.to)) return null;
  // The same narrowed set the hand renders from, so a turn re-opened by a raid
  // offers the counter-click and a turn spent for good does not.
  const set = playableSet(
    v, human.factionId, human.hand, { repeatOnly: repeatOnlyOf(game()) },
  );
  if (set.mode !== "play") return null;
  // What the card IS, never its name: Strong raid counters exactly as Raid
  // does, and a literal here left a player holding only the stronger one with
  // an arrow that simply would not click, and nothing to say why.
  const counters = set.cardIndexes.filter((i) => isMarchCard(human.hand[i]));
  if (counters.length === 0) return null;
  // The heaviest one held. A counter is subtracted from the raid coming the
  // other way, so offering the weaker of two is never what the click meant.
  return counters.sort((a, b) =>
    attackDamageFor(v, human.factionId, human.hand[b]).damage -
    attackDamageFor(v, human.factionId, human.hand[a]).damage
  )[0];
}

/** Make one arrow answer a click by countering it.
 *
 *  Listens on the arrow rather than routing through `interceptClick`, which
 *  only ever learns a region id and could not tell which of two arrows over
 *  the same land was meant. The press is measured against the map's own drag
 *  threshold, so dragging the board from on top of an arrow still pans -
 *  swallowing that would put a dead zone over the most interesting part of
 *  the map. Only a real click stops propagation. */
function armArrowAsCounter(g: SVGGElement, m: March, cardIndex: number): void {
  let start: { x: number; y: number } | null = null;
  g.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY };
  });
  g.addEventListener("pointerup", (e) => {
    const from = start;
    start = null;
    if (from === null) return;
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) >= DRAG_THRESHOLD_PX) {
      return; // a pan that happened to begin here; let the map have it
    }
    e.stopPropagation();
    // Re-asked, not trusted: this listener was attached on the last render and
    // the board may have moved since - a guest's update, an AI round.
    if (counterFor(m) === null) return;
    disarm();
    // The card at that index, not a name: the pair is what gets validated,
    // and a hand holding Strong raid was being announced as a Raid.
    const cardId = localHuman()?.hand[cardIndex];
    if (cardId === undefined) return;
    decide({
      kind: "play", cardIndex, cardId, targetId: m.from, sourceId: m.to,
    });
  });
}

/** How long a resolved march is shown before the map moves on. One number,
 *  handed to `runAnimation`, which reports back when it is actually over -
 *  never copied into a second timer. */
const CLASH_FLASH_MS = 1200;

/** How long a beat's label holds the screen. One number, handed to
 *  `runAnimation`, which reports back when it is actually over - never copied
 *  into a second timer. */
const BEAT_LABEL_MS = 1700;

/** Half of a badge's number swap - out on the old, in on the new. Short
 *  against the label it happens under, so the number has settled by the time
 *  the player has finished reading what moved it. */
const BADGE_WALK_MS = 220;

const factionNameById = new Map(data.factions.map((f) => [f.id, f.name]));
const placeNameFactionIds = new Set(
  data.factions.filter((f) => f.placeName).map((f) => f.id),
);

/** The hooks a beat label's segments render through - the same tooltip the
 *  HUD's prose uses, so a card name in a label tips its rules and a faction
 *  name lights its realm, exactly as everywhere else. */
const beatLabelHooks: RichTextHooks = {
  factionName: (id) => factionNameById.get(id) ?? id,
  isPlaceName: (id) => placeNameFactionIds.has(id),
  showTip: (lines) => tooltip.showLines(lines),
  hideTip: () => tooltip.hide(),
  highlightFaction: (id) =>
    applyHighlight(hoveredRegion, id ?? hoveredRegion?.faction ?? null),
};

/** What a landing left on the border, drawn for the length of the beat and
 *  then gone: an arrow for each force that crossed it, and over each one what
 *  actually got through out of what was thrown.
 *
 *  Every number and every end of them comes off the beat's `ResolutionArrow`s,
 *  which the classifier built from the event - never from `game.marches`,
 *  which the landing has already emptied, and never from the arrows on the
 *  board, which a clash retires two of to produce these.
 *
 *  A landing somebody won points winner at loser, so a counter that won is
 *  drawn pointing BACK, which is the whole story of the clash in one shape. A
 *  standoff hands over two, and they are drawn in ONE scene so the border's
 *  lane packing puts them side by side exactly as the live arrows stood. The
 *  labels are neutral ink and read as arithmetic - "1/3 DMG", no sign and no
 *  colour - because a signed green number beside a spear is read as a score,
 *  and the scores on this map are the badges'. */
function flashResolutions(
  list: readonly ResolutionArrow[], onDone: () => void,
): void {
  // Redrawn on the border they crossed, alone in a layer of their own: a live
  // rebuild landing mid-fade would take them off the screen halfway through
  // the one thing the beat is showing. One `renderArrowScene` call for the
  // whole list, because the scene replaces the layer's children - a second
  // call would wipe the arrow the first one drew.
  const drawn = renderArrowScene(ghostGroup, list.map((res) => ({
    id: res.key, kind: "ghost" as const,
    from: res.from, to: res.to, strength: res.strength,
    tone: res.tone === "ours" ? "ours" : res.tone === "hostile" ? "hostile" : "other",
    fill: res.tone === "ours"
      ? "#d4af37"
      : res.tone === "hostile" ? "#992f27" : "#6b5d49",
    label: res.label,
    // Near the head. What a counter took off the top is in the label's own
    // denominator, so the shaft has no second place to say it from.
    labelAt: clashFraction(res.strength, 0),
  })), sceneCtx);
  let pending = 1;
  const one = (): void => {
    pending -= 1;
    if (pending === 0) onDone();
  };
  for (const res of list) {
    const g = drawn.get(res.key);
    const poly = g?.querySelector("polygon") ?? null;
    const label = g?.querySelector("text") ?? null;
    if (g === undefined || poly === null || label === null) continue;
    poly.setAttribute("stroke", "#fdfaf4");
    poly.setAttribute("stroke-width", "1.2");
    pending += 1;
    runAnimation(poly, [{ opacity: 1 }, { opacity: 0 }], CLASH_FLASH_MS);
    runAnimation(
      label,
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)", offset: 0.2 },
        { opacity: 1, transform: "translateY(0)", offset: 0.7 },
        { opacity: 0, transform: "translateY(-8px)" },
      ],
      CLASH_FLASH_MS,
      () => {
        g.remove();
        one();
      },
    );
  }
  // Nothing drawn - a border the scene could not find a crossing for. The
  // layer is cleared rather than left holding a half-built arrow.
  if (pending === 1) ghostGroup.replaceChildren();
  one();
}

/** The realm, plus every land at the far end of an arrow or a demand standing
 *  between it and them - see `PresentView.linked`.
 *
 *  Read off the arrows STILL IN FLIGHT in the state the batch landed in, which
 *  is the honest reading of "there is something between us": an arrow that has
 *  already landed is the event being presented, and it comes in through the
 *  realm gate on its own. */
function linkedLands(
  state: GameState, realm: ReadonlySet<string>,
): Set<string> {
  const linked = new Set(realm);
  for (const march of Object.values(state.marches)) {
    if (realm.has(march.from) || realm.has(march.actor)) linked.add(march.to);
    if (realm.has(march.to)) linked.add(march.from);
  }
  for (const claim of Object.values(state.claims)) {
    if (realm.has(claim.actor)) linked.add(claim.to);
    if (realm.has(claim.to)) linked.add(claim.actor);
  }
  return linked;
}

/** Stage 1 of a transition: everything this move earns on screen, one beat at
 *  a time, against the board the player was last shown - the camera glides to
 *  the land, a label says what happened, the badges walk from the scores they
 *  had, the card leaves the hand. The commit that repaints the board waits
 *  behind all of it.
 *
 *  What earns a beat is `PRESENTATION_RULES` and nothing here. There is one
 *  table and one audience gate, so a fact cannot be shown twice by two
 *  surfaces that each thought the other had passed on it.
 *
 *  Everything it reads comes off the transition rather than off the displayed
 *  state: the events are the ones this move appended, and the realm, the
 *  arrows still standing and the standings walk are all read from the state
 *  those events land in - which is not the one under the map yet.
 *
 *  It asks nothing about the phase the move ENDS in. The play that wins or
 *  loses the run is the most dramatic card in it, and a phase gate here was
 *  swallowing that one card's flight, its sound and the score moves beside
 *  it: the card vanished from the hand and the postmortem rose over a board
 *  nobody had been shown. Whether a beat still has a board to draw on is
 *  `inPlay()`'s question, asked in `runMapBeat` at the moment the step runs. */
function queueBeats(t: Transition): void {
  const state = t.next;
  const human = state.players[localSeat];
  if (human === undefined) return;
  const { ctx } = hud.noticeWalk(state, t.events);
  if (ctx === null) return;
  const realm = fullRealmOf(human.factionId, state.overlords, state.incorporated);
  const beats = presentEvents(t.events, presentCtxOf(t.events, {
    // The seat THIS SCREEN plays, which on a guest's screen is not the
    // host's - the audience gate asks whether this screen has business with
    // the event, never whether some person somewhere does.
    seats: new Set([human.id]),
    realm,
    linked: linkedLands(state, realm),
    notice: ctx,
  }));
  let framesALand = false;
  for (const beat of beats) {
    // The questions are stage 3's, raised after the commit that makes them
    // answerable. A beat list is flat on purpose and the lifecycle partitions
    // it - see `presentEvents`.
    if (beat.kind === "ask") continue;
    if (beat.kind === "hud") {
      hud.runHudBeat(beat);
      continue;
    }
    // A beat with no label frames nothing: it walks a badge where it stands
    // and never takes the screen, so it has no claim on the arrows either.
    if (beat.label !== null) framesALand = true;
    animations.push((done) => runMapBeat(beat, done));
  }
  // While a land is being framed, the map shows THAT land's business and no
  // other arrow. A transition at a time keeps a LATER seat's declarations off
  // the board, but a seat declares its own march in the same breath as it
  // resolves the one before - so the arrow it just drew would stand over the
  // landing of the arrow it drew last turn. One event at a time means one
  // arrow at a time. Armed before the stage's own waiter, so the class is off
  // by the time the commit repaints the arrows.
  //
  // Only for a map beat: a card of the player's own flying to the discard pile
  // has no business taking the arrows off the board underneath it, and a batch
  // whose only beat is that flight would otherwise clear the map for as long
  // as the card was in the air.
  if (!framesALand) return;
  svg.classList.add("replaying");
  animations.onIdle(() => svg.classList.remove("replaying"));
}

/** One map beat: camera first, then the label, the badge walks, the
 *  resolution arrows and the sound together. `done` fires when the slowest of
 *  them reports itself finished - never on a timer.
 *
 *  A beat with NO label is the player's own play landing (`labelUnlessCaused`
 *  in src/presentation.ts). They are already looking at the land they clicked,
 *  so nothing frames it: no camera, no glow and no sentence, and the step is
 *  over as soon as the badges have settled. What that buys is the hand: the
 *  input gate waits on this queue, and a card the player aimed themselves must
 *  not cost them the length of a label to read about it afterwards. */
function runMapBeat(
  beat: Extract<Beat, { kind: "map" }>,
  done: () => void,
): void {
  // A new game, or the menu, replaced the board while this beat waited its
  // turn. The teardown paths clear the queue, but a beat already running when
  // they do must not draw over the wrong screen. Asked of the SCREEN and not
  // of the transition, because that is the question: whether there is still a
  // run under this label. Whether the beat was owed at all was settled by the
  // classifier, against the state those events land in.
  if (!inPlay()) {
    done();
    return;
  }
  const framed = beat.label !== null;
  const centre = regionCenter(beat.polygon);
  const show = (): void => {
    if (beat.sound !== null) audio.cue(beat.sound);
    // Lit for the whole beat, so the label always has a land to belong to
    // even when the camera holds still - which, on the whole-map view, is
    // most of the time. An unframed beat lights nothing: there is no sentence
    // for the glow to attach to.
    const unmark = framed ? markBeatLand(beat.polygon) : () => {};
    // `beat.retires` is not read here: the arrow layer is rebuilt wholesale on
    // every paint, so an arrow leaves at the commit behind this beat rather
    // than fading under it. It is unread rather than absent because the beat
    // states what a keyed scene will act on, and the classifier is where that
    // is decided either way.
    //
    // Everything below is started together and the beat hands back when the
    // slowest of them reports itself finished. The count starts at one for the
    // starter's own hold, released at the bottom, so a part that finishes
    // synchronously cannot end the beat before the rest have begun.
    let pending = 1;
    const one = (): void => {
      pending -= 1;
      if (pending > 0) return;
      unmark();
      done();
    };
    const waitFor = (): (() => void) => {
      pending += 1;
      return one;
    };
    walkBadges(beat.badges, waitFor());
    if (beat.resolutions.length > 0) flashResolutions(beat.resolutions, waitFor());
    if (beat.label !== null) showBeatLabel(beat.label, beat.badges, waitFor());
    one();
  };
  if (framed && centre !== undefined) {
    interaction.focusOn(centre, show);
  } else {
    show();
  }
}

/** Lights the land a beat is about, and answers how to put it out.
 *
 *  This is what keeps a label attached to a place. The camera holds still for
 *  anything already comfortably on screen (see `focusOn`), which on the
 *  default whole-map view is every land there is - so without a mark, a
 *  wild-lands regrowth read as a sentence about nowhere. */
function markBeatLand(polygon: string): () => void {
  const regionId = regionByFaction.get(polygon);
  const el = regionId === undefined ? undefined : regionPaths.get(regionId);
  if (el === undefined) return () => {};
  el.classList.add("replay-focus");
  return () => el.classList.remove("replay-focus");
}

/** Walks every score this beat moved from what it was to what it is: the
 *  badge's number, and the disease pips under it.
 *
 *  The badges are drawn from the displayed state, which is still the board
 *  before this event - the commit is waiting on this beat - so a walk starts
 *  where the number already stands and ends where the commit will repaint it.
 *  Each walk states its own start all the same: the `before` is what the walk
 *  was computed from, and what the badge shows must not be anything else.
 *
 *  This is the ONLY way a score change is shown on the map. There is no second
 *  mark rising off the polygon for the moves the camera did not visit: two
 *  ways of saying one thing is two gates, and the one that gets skipped is
 *  always the one with the gate on it.
 *
 *  `onDone` fires when every walk has settled, and it is what an unframed beat
 *  hands back on - a badge nobody drew (a land inside a realm's outline has no
 *  badge of its own) reports at once rather than holding the queue. */
function walkBadges(badges: BadgeWalk[], onDone: () => void): void {
  let pending = 1;
  const one = (): void => {
    pending -= 1;
    if (pending === 0) onDone();
  };
  for (const walk of badges) {
    if (walk.before === walk.after) continue;
    pending += 1;
    if (walk.track === "defense") walkBadgeScore(walk, one);
    else walkBadgePips(walk, one);
  }
  one();
}

function walkBadgeScore(walk: BadgeWalk, onDone: () => void): void {
  const el = badgeGroup.querySelector(
    `.threat-badge[data-faction="${walk.polygon}"] .badge-defense`,
  );
  if (el === null) {
    onDone();
    return;
  }
  // The ceiling off the badge as drawn, so this states only what it knows.
  const max = (el.textContent ?? "").split("/")[1] ?? "";
  el.textContent = `${walk.before}/${max}`;
  runAnimation(el, [{ opacity: 1 }, { opacity: 0 }], BADGE_WALK_MS, () => {
    el.textContent = `${walk.after}/${max}`;
    runAnimation(el, [{ opacity: 0 }, { opacity: 1 }], BADGE_WALK_MS, onDone);
  });
}

/** One owner's stacks on one land, as pips arriving or leaving.
 *
 *  Per OWNER, because that is what the walk is about: a single
 *  `winds-shifted` hands one faction's stacks to another and produces two
 *  walks on the same polygon in opposite directions. Drawn as one track they
 *  would be one row of dots twitching by the difference, which says the
 *  sickness eased when what happened is that it changed hands.
 *
 *  Stacks that leave fade out where they stand; stacks that arrive fade in at
 *  the end of the row, whichever owner they belong to, because the row is
 *  packed left to right and inserting mid-row would shove every pip after it
 *  sideways mid-fade. The commit behind this beat redraws the row in faction
 *  order, which is where a new pip takes its place for good. */
function walkBadgePips(walk: BadgeWalk, onDone: () => void): void {
  const badge = badgeGroup.querySelector(
    `.threat-badge[data-faction="${walk.polygon}"]`,
  );
  if (badge === null || walk.owner === undefined) {
    onDone();
    return;
  }
  let pending = 1;
  const one = (): void => {
    pending -= 1;
    if (pending === 0) onDone();
  };
  const all = badge.querySelectorAll(".badge-pip");
  if (walk.after < walk.before) {
    const theirs = [...badge.querySelectorAll(
      `.badge-pip[data-owner="${walk.owner}"]`,
    )];
    for (const pip of theirs.slice(walk.after)) {
      pending += 1;
      runAnimation(pip, [{ opacity: 1 }, { opacity: 0 }], BADGE_WALK_MS, one);
    }
    one();
    return;
  }
  for (let i = walk.before; i < walk.after; i++) {
    const pip = diseasePip(walk.owner, all.length + i - walk.before);
    badge.appendChild(pip);
    pending += 1;
    runAnimation(pip, [{ opacity: 0 }, { opacity: 1 }], BADGE_WALK_MS, one);
  }
  one();
}

/** The label itself: segments (a card name tips its rules, a faction lights
 *  its realm - the rich-text rule, nothing here is a template literal) plus
 *  the same walked suffix the log line and the summary carry. */
function showBeatLabel(
  segments: Segment[],
  badges: BadgeWalk[],
  onDone: () => void,
): void {
  const label = document.createElement("div");
  label.className = "replay-label";
  const text = document.createElement("span");
  text.className = "rl-text";
  text.appendChild(renderSegments(segments, beatLabelHooks));
  label.appendChild(text);
  // The walked half alone: the two suffixes that come off an event rather
  // than off the walk - a tribute's coins, a war council's leadership - belong
  // to events with no map beat to carry them.
  const impact = changeImpact(badges);
  if (impact !== null) {
    const suffix = document.createElement("span");
    suffix.className = `log-change lead-${impact.tone}`;
    suffix.textContent = ` (${impact.text})`;
    label.appendChild(suffix);
  }
  app.appendChild(label);
  runAnimation(
    label,
    [
      { opacity: 0, transform: "translate(-50%, 6px)" },
      { opacity: 1, transform: "translate(-50%, 0)", offset: 0.12 },
      { opacity: 1, transform: "translate(-50%, 0)", offset: 0.82 },
      { opacity: 0, transform: "translate(-50%, -10px)" },
    ],
    BEAT_LABEL_MS,
    () => {
      label.remove();
      onDone();
    },
  );
}

/** What a hover says: what this land is, who holds it, whether a pact stands
 *  between you, how many settlements stand on it, what an armed card would do
 *  here, and where the Subjugate bars on its badge come from.
 *
 *  A hover that recited everything the game knows about a land - population,
 *  cohesion, ruler - was seven lines wide and answered no question anybody was
 *  asking. What earns a line here is a figure the player can see on the map and
 *  cannot get the meaning of anywhere else, and the two blocks below are the
 *  only ones that qualify. The badge puts a "/6" on the map and nothing else on
 *  screen says what builds it, so the bar breakdown is gated on the badge
 *  showing that denominator. The settlement dots are drawn on the polygon and
 *  both Found a settlement and Population boom turn on how many a land holds
 *  and how many it still has room for, and nothing else states either. */
/** A land's name and its people's: the first line of every surface that
 *  describes it, and the plain-text half of that line's segments. */
function landTitle(region: Region): string {
  return `${region.name} (${factionById.get(region.faction)!.name})`;
}

/** The pinned land's readout, and the one thing that follows from it: the tip
 *  is the same dark box parked at the same left edge, so it has to open below
 *  the panel rather than on top of it. Measured rather than a constant - the
 *  panel is as tall as the land it describes. */
function showPinnedLand(region: Region | null): void {
  hud.setPinnedLand(region === null ? null : hoverLines(region));
  tooltip.clearTop(region === null ? null : hud.pinnedLandBottom());
}

/** A counter line: the term's label as a hoverable node, its figure in the
 *  amount column. Every number the hover prints beside a word goes through
 *  here, so none of them can ship without an explanation. */
function termLine(termId: string, amount: number): TooltipLine {
  return {
    text: termName(termId), segments: [term(termId)], amount: String(amount),
  };
}

function hoverLines(region: Region): TooltipLine[] {
  const human = localHuman();
  // The land's OWN faction, never the politically resolved one: an absorbed
  // land keeps its name here and the line below says who took it.
  const lines: TooltipLine[] = [
    {
      text: landTitle(region),
      // The people's name is a node wherever it is drawn: pointing at it lights
      // their whole realm on the map, which on a title line is exactly the
      // question being asked - "whose is this".
      segments: [
        t(`${region.name} (`), faction(region.faction), t(")"),
      ],
    },
  ];
  // Straight under the land's name, because "who is playing this" outranks
  // everything the rules have to say about it. A player name is plain text
  // and names no card or faction, so this line stays inside the naming rule.
  const otherHuman = playerNameOfFaction(region.faction);
  if (otherHuman !== null) lines.push({ text: `Played by ${otherHuman}` });
  // The picker asks one question - "what am I getting" - and it is the one
  // hover with no seat to answer from, so it gets the land's standing facts
  // and nothing that needs a human player to exist. Everything below this
  // point does.
  if (game().phase === "pick-faction") {
    // What this land already stands in, on a map that may open with realms on
    // it. Two different sentences and they are not interchangeable: who holds
    // this land, which is why the map greys it and the click does nothing; and
    // what it would bring with it, which is the whole difference between
    // beginning as a kingdom and beginning as one polygon. Every name in both
    // is a `faction()` segment - the naming rule holds on the one screen where
    // nobody has a seat yet.
    const segLine = (segs: Segment[]): void => {
      lines.push({ text: plainText(segs, richTextNames), segments: segs });
    };
    if (isUnheld(region.faction, game().overlords, game().incorporated)) {
      const holds = realmHoldingLine(
        region.faction, game().overlords, game().incorporated,
      );
      if (holds !== null) segLine(holds);
    } else {
      const sworn = allegianceOf(region.faction, null);
      if (sworn !== null) segLine(sworn);
      lines.push({ text: "Begin only in a land that answers to nobody" });
    }
    lines.push(...landFactsLines(viewOf(game()), region.faction));
  }
  if (!inPlay() || !human) return lines;
  const held = allegianceOf(region.faction, human.factionId);
  if (held !== null) {
    lines.push({ text: plainText(held, richTextNames), segments: held });
  }
  // The same resolution `interceptClick` uses, or the lines below would answer
  // for a different faction than the click aims at on an absorbed land.
  const f = politicalFactionForPolygon(region.faction, game().incorporated);
  // The respite note: part of what the badge implies - "this faction can be
  // taken at the gate" - is temporarily false, and this says until when. On
  // the human's own land it is the one surface carrying the fact at all.
  lines.push(...respiteLines(game(), human.factionId, f));
  // `region.faction`, not the resolved `f`: settlements belong to the land,
  // so an absorbed land must report its own count and not its absorber's.
  lines.push(...settlementBlock(viewOf(game()), region.faction));
  // An armed card's preview aims at the POLYGON for attack, disease and
  // inward cards, the resolved faction for the political ones - the same id
  // the click will commit, through the same predicate.
  if (armed !== null) {
    const cardId = human.hand[armed];
    const aim = aimsAtPolygons(cardId) || !CARDS[cardId]?.targeted
      ? region.faction
      : f;
    lines.push(...targetImpactLines(
      viewOf(game()), human.factionId, cardId, aim,
    ));
  }
  // The badge's numbers itemised: the score over its max and the two gate
  // lines. The polygon's own, like the settlements.
  //
  // The independence line reads "regains independence AT THEIR TURN", so it is
  // owed a land that gets one. `takesNoTurn` is the predicate the turn loop
  // itself asks, human arm and all - so an assassinated player still sees the
  // line they can act on, and a leaderless vassal does not see a freedom that
  // has no moment to arrive in. Without it the same tooltip promised a land
  // its independence three lines above "Nobody leads this land", on every land
  // a conquest had ever taken.
  lines.push(...defenseBreakdown(
    viewOf(game()), region.faction,
    game().overlords.has(region.faction) && !takesNoTurn(game(), region.faction),
  ));
  lines.push(...diseaseBreakdown(
    viewOf(game()), region.faction, (id) => factionById.get(id)?.name ?? id,
  ));
  // Who leads this land and what they have gathered. A vacant seat is the
  // whole reason a land takes no turn, so it is stated rather than left to be
  // inferred from the land never doing anything.
  const v = viewOf(game());
  const leader = rulerNameOf(game().rulers, region.faction);
  lines.push({ text: "Leader", blockStart: true });
  if (leader === null) {
    lines.push({ text: "Nobody leads this land" });
  } else {
    // The ruler's NAME on its own line. It used to carry the leadership as its
    // amount, which read as "1 Kyrian" - a figure with no label, no way to
    // learn what it was, and nothing saying it stacks.
    lines.push({ text: leader });
    lines.push(termLine("leadership", v.leadership[region.faction] ?? 0));
    // What this leader can do, named. A leadership figure beside a chief who
    // has no way to spend it is a number that does nothing, and an ability the
    // player cannot see is a rule they cannot play around - the same reason no
    // land status ships without its hover.
    for (const id of abilitiesOf(v.leaderAbilities, region.faction)) {
      lines.push({ text: abilityName(id), segments: [ability(id)] });
    }
    const omens = omensHeld(v, region.faction);
    if (omens > 0) lines.push(termLine("omens", omens));
    const miasma = miasmaHeld(v, region.faction);
    if (miasma > 0) lines.push(termLine("miasma", miasma));
  }
  // The land's standing properties, last: they are true of the ground whoever
  // holds it, so they read as the footnote to everything above rather than as
  // part of this turn's arithmetic.
  lines.push(...passiveLines(game().passives, region.faction));
  return lines;
}

/** True while a click on the map means "aim here": an armed targeted card.
 *  Every surface that yields the map to targeting cues - the halo, the log
 *  dimming, the valid/invalid classes - asks this one predicate. */
function targetingLive(): boolean {
  return armed !== null;
}

/** Whether the armed card aims at POLYGONS (a land's own id, annexed or not)
 *  rather than at politically resolved factions. Attack, disease and inward
 *  cards hit polygons; Subjugate, Incorporate and Assassinate ruler aim at
 *  factions. One predicate, shared by the hover preview, the targeting
 *  classes and the click, so the three cannot resolve a click differently -
 *  and it asks what the card IS, so a new heal or a new attack does not have
 *  to find this line. */
function aimsAtPolygons(cardId: string): boolean {
  return ATTACK_CARDS.has(cardId) || isInwardCard(cardId) ||
    cardId === "spread-disease" || cardId === "localized-outbreak";
}

/** Whether this card is aimed twice - source first, then target. The march
 *  cards, and only those: an arrow has a tail, and which land the army leaves
 *  from is the player's decision. Great raid assigns its own sources, and no
 *  other card sends an army. */
function needsSource(cardId: string): boolean {
  return isMarchCard(cardId);
}

/** The status line for the step the map is currently asking about, or
 *  undefined to leave `setArmed`'s "Choose a target" default. A first click
 *  labelled "target" would send the player at the enemy when the map is
 *  lighting their own lands. */
function armPrompt(cardId: string): string | undefined {
  return needsSource(cardId) && armedSource === null
    ? `Choose the land ${CARDS[cardId].name} marches out of`
    : undefined;
}

/** What the map is lighting right now. For a Raid on its first click that is
 *  the lands an army could march OUT of; after the source is picked, and for
 *  every other card, it is the ordinary target list. One function, because
 *  three surfaces ask it - the classes, the bail-on-empty in `onPlayCard`, and
 *  the click - and a step they disagreed on would be a click that does
 *  nothing. */
function armedTargets(): string[] {
  const human = localHuman();
  if (!human) return [];
  if (armed === null) return [];
  const cardId = human.hand[armed];
  const v = viewOf(game());
  if (needsSource(cardId)) {
    return armedSource === null
      ? marchSourcesFor(v, human.factionId)
      : marchTargetsFrom(v, human.factionId, armedSource);
  }
  return validTargetsFor(v, human.factionId, cardId);
}

function applyTargeting(): void {
  const targets = new Set(armedTargets());
  const live = targetingLive();
  const human = localHuman();
  const polygonAim =
    live && armed !== null && human !== undefined &&
    aimsAtPolygons(human.hand[armed]);
  // The lands a pick may not land on. Reuses the armed-card "you cannot aim
  // here" treatment rather than inventing a second vocabulary for the same
  // sentence - all of them mean "this click will do nothing".
  const picking = game().phase === "pick-faction";
  const takenByHost = picking && net.role === "guest" ? net.taken : null;
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    // A polygon card lights the polygon itself; a faction card lights every
    // land of the target's realm through the political resolution.
    const aim = polygonAim ? f : politicalFactionForPolygon(f, game().incorporated);
    const valid = live && targets.has(aim);
    // A land already inside a realm has no seat to offer: `pickFaction` refuses
    // it, and a refusal the map did not telegraph reads as the map being
    // broken. The same predicate the engine uses, so the grey and the refusal
    // cannot disagree about which lands they mean.
    const sworn =
      picking && !isUnheld(f, game().overlords, game().incorporated);
    el.classList.toggle("target-valid", valid);
    el.classList.toggle(
      "target-invalid", (live && !valid) || f === takenByHost || sworn,
    );
  }
  // Targeting cues win the map while armed - applyHighlight suppresses itself
  // then. Disarming lands here too, and brings the pin, or the live hover, back.
  applyHighlight(hoveredRegion, hoveredRegion?.faction ?? null);
  // Arming and disarming both land here without a full refresh, and the
  // badges, the arrows and the always-on realm outlines are all part of the
  // targeting picture - see renderThreatBadges, renderMarchArrows and
  // renderRealmUnions.
  renderThreatBadges();
  renderMarchArrows();
  renderRealmUnions();
}

/** The faction a pin answers for: the pinned land's owner when the land was
 *  incorporated, else its own faction - the same resolution card targeting
 *  applies, so a vassal's land still pins the vassal. Resolved at read time
 *  from the land the pin stores, never cached, so an incorporation landed
 *  while pinned moves the pin to the new owner on the next refresh. */
function pinnedFactionId(): string | null {
  return pinnedRegion === null
    ? null
    : politicalFactionForPolygon(pinnedRegion.faction, game().incorporated);
}

/** The one place a faction highlight is applied. The map halo and the activity
 *  log are two views of the same hover, so they are always set together and a
 *  new call site cannot light one and leave the other stale. The log takes the
 *  faction id rather than the region because a name hovered in prose has an id
 *  and may have no polygon at all. */
function applyHighlight(region: Region | null, factionId: string | null): void {
  // A pin outranks whatever is being hovered, and is resolved here rather than
  // at the call sites so every route into the highlight - the map hover, a name
  // hovered in prose, refresh, arming a card, dismissing the round summary -
  // obeys it without a branch of its own.
  if (pinnedRegion !== null) {
    region = pinnedRegion;
    factionId = pinnedFactionId();
  }
  applyRealmHover(region);
  // The same suppression applyRealmHover applies to the map: while targeting
  // is live the cues own the screen, and a log dimmed to some faction
  // the player is only passing over would be reading as part of that.
  hud.highlightFaction(inPlay() && !targetingLive() ? factionId : null);
}

/** Every polygon belonging to the hovered region's realm root (owner if
 *  incorporated, else that faction's overlord), including vassals' own
 *  incorporated holdings that `realmOf` alone would miss. No-op (all
 *  classes cleared) when there is no hover or the phase is not in play. */
function applyRealmHover(region: Region | null): void {
  // A PIN is about one land, and the panel beside it describes that land
  // alone: it marks the polygon and nothing else. A hover still lights the
  // whole realm - that is the question a passing cursor is asking, and with
  // five players holding several lands each it is the more useful answer of
  // the two, which is exactly why the pin needs the narrower one.
  const pinned = pinnedRegion !== null && region === pinnedRegion;
  // while targeting is live, it owns the map: a realm halo here would
  // outrank the valid/invalid cues and make blocked targets look clickable
  const members =
    region && inPlay() && !targetingLive()
      ? pinned
        ? new Set([region.faction])
        : fullRealmOf(
            realmRootOf(region.faction, game().overlords, game().incorporated),
            game().overlords, game().incorporated,
          )
      : new Set<string>();
  // Everything else recedes while the pin holds. Without it the pin barely
  // reads: a rival player's lands sit at .in-play's opacity, which is bright
  // enough that four realms compete with the one land being asked about.
  svg.classList.toggle("pinning", pinned && inPlay() && !targetingLive());
  syncArrowDimming(pinned && inPlay() && !targetingLive() ? region : null);
  // The polygon of the faction that holds the hovered land - who took it -
  // marked on its own, not its whole realm. Suppressed while targeting is
  // live, for the same reason the realm halo is.
  const holder =
    region && inPlay() && !targetingLive()
      ? holderOf(region.faction, game().overlords, game().incorporated)
      : null;
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    el.classList.toggle("pinned-one", pinned && region !== null && id === region.id);
    el.classList.toggle("realm-hover", members.has(f));
    el.classList.toggle("holder-hover", holder !== null && f === holder);
    el.classList.toggle(
      "vassal-hover",
      region !== null &&
        id === region.id &&
        game().overlords.has(region.faction) &&
        !(region.faction in game().incorporated),
    );
  }
  renderRealmHoverHalo(members);
}

/** While a pin holds, the arrows that are not about the pinned LAND recede
 *  with everything else. An arrow belongs to the pin if that land sent it or
 *  is the land it is aimed at - studying a land means seeing both what it is
 *  doing and what is coming at it, and dimming the incoming half would hide
 *  the more urgent one.
 *
 *  The land, not its realm: the pin already narrows the map to one polygon,
 *  and reading this off the realm root lit every arrow in an empire when a
 *  single vassal was pinned. */
/** The two lands an arrow runs between, while the pointer is on it. Null when
 *  it is not, which is most of the time.
 *
 *  DERIVED from where the pointer is, and never remembered from an arrow's own
 *  enter and leave. `renderMarchArrows` destroys and rebuilds every arrow on
 *  every refresh, and a detached element is never sent the leave that would
 *  clear what its enter wrote - the fact src/deck-screen.ts dismisses its tip
 *  by hand for. A redraw that put an arrow back under the same point survived,
 *  because the browser hands the replacement an enter; a march that resolved
 *  away, or a bundle that re-laid out around the pointer, did not. Nothing on
 *  the map owned the focus any more, so moving the pointer anywhere fired
 *  nothing and the whole map stayed greyed for the rest of the run. A value
 *  re-read from the pointer cannot go stale, because nothing is holding it. */
let arrowFocus: { from: string; to: string } | null = null;

/** Where the pointer last was, null once it has left the map. Read by the
 *  rebuild, which has no event to ask: the svg is built once and never
 *  replaced, so its own boundary events are the only ones here that hold. */
let pointerAt: { x: number; y: number } | null = null;

/** The arrow an element is part of, walking up from a strength label or a
 *  claim's head. */
function arrowIn(target: EventTarget | null): { from: string; to: string } | null {
  const g = (target as Element | null)?.closest?.(".march-arrow, .claim-arrow") as
    | SVGGElement
    | null
    | undefined;
  const from = g?.dataset.from;
  const to = g?.dataset.target;
  return from !== undefined && to !== undefined ? { from, to } : null;
}

/** The arrow at a screen point - `landAtPoint`'s shape, for its reason: a
 *  rebuild has no event to read, so the question must be answerable from a
 *  point alone. Optional-chained because happy-dom hit-tests nothing, and "no
 *  arrow" is the right answer where there is no layout to be over. */
function arrowAt(x: number, y: number): { from: string; to: string } | null {
  return arrowIn(document.elementFromPoint?.(x, y) ?? null);
}

/** The same pair is no news, and saying so costs the whole map: this runs off
 *  every pointermove, and `applyArrowFocus` walks every region, arrow, badge
 *  and settlement dot. */
function setArrowFocus(next: { from: string; to: string } | null): void {
  if (next?.from === arrowFocus?.from && next?.to === arrowFocus?.to) return;
  arrowFocus = next;
  applyArrowFocus();
}

/** Re-asks the question after the arrows have been rebuilt. Nothing moved, so
 *  no pointer event is coming: the arrow the player was pointing at is now a
 *  different element or no element at all, and only the point still means
 *  anything. */
function syncArrowFocus(): void {
  setArrowFocus(pointerAt === null ? null : arrowAt(pointerAt.x, pointerAt.y));
}

// The move's own target, which the browser has already hit-tested - the order
// `landUnder` in src/interaction.ts reads a press in. Aiming needs no case of
// its own: `.aiming` takes the arrows out of hit-testing, so the answer under
// the pointer is the land, and the focus derives as none.
svg.addEventListener("pointermove", (e) => {
  pointerAt = { x: e.clientX, y: e.clientY };
  setArrowFocus(arrowIn(e.target));
});
svg.addEventListener("pointerleave", () => {
  pointerAt = null;
  setArrowFocus(null);
});

/** Paints the current arrow focus, or clears it. The pin owns the map when one
 *  is held and while a card is armed the targeting cues do, so this stands
 *  down for both rather than adding a third voice.
 *
 *  Everything drawn ON a land is asked the same question the land is, because a
 *  land repainted to the off-map grey with its defense number still crisp above
 *  it is not off the map - the numbers were the loudest thing on the board, and
 *  fading only the fills left them in sole possession of the eye. */
function applyArrowFocus(): void {
  const focus = pinnedRegion !== null || targetingLive() ? null : arrowFocus;
  svg.classList.toggle("arrow-focused", focus !== null);
  const isEnd = (factionId: string | undefined): boolean =>
    focus !== null &&
    (factionId === focus.from || factionId === focus.to);
  for (const [id, el] of regionPaths) {
    el.classList.toggle("arrow-end", isEnd(regionById.get(id)?.faction));
  }
  for (const g of arrowGroup.children) {
    if (!(g instanceof SVGGElement)) continue;
    g.classList.toggle(
      "arrow-faded",
      focus !== null &&
        !(g.dataset.from === focus.from && g.dataset.target === focus.to),
    );
  }
  for (const g of badgeGroup.children) {
    if (!(g instanceof SVGGElement)) continue;
    g.classList.toggle("focus-faded", focus !== null && !isEnd(g.dataset.faction));
  }
  // A settlement names its land by REGION id, and a queried list rather than a
  // cached one because founding one in play adds to this group.
  const ends = new Set(
    focus === null
      ? []
      : [regionByFaction.get(focus.from), regionByFaction.get(focus.to)],
  );
  for (const el of svg.querySelectorAll("[data-land]")) {
    el.classList.toggle(
      "focus-faded",
      focus !== null && !ends.has((el as SVGElement).dataset.land),
    );
  }
}

function syncArrowDimming(pinnedOn: Region | null): void {
  const land = pinnedOn?.faction ?? null;
  for (const g of arrowGroup.children) {
    if (!(g instanceof SVGGElement)) continue;
    g.classList.toggle(
      "arrow-dim",
      land !== null && g.dataset.actor !== land && g.dataset.target !== land,
    );
  }
}

/** One outline around the hovered realm: `outerOutline` masks away everything
 *  inside it, so only the realm's outer edge survives. */
function renderRealmHoverHalo(members: Set<string>): void {
  realmHoverGroup.replaceChildren();
  const human = localHuman();
  realmHoverGroup.classList.toggle(
    "own", human !== undefined && members.has(human.factionId),
  );
  const paths = [...members]
    .map((factionId) => regionByFaction.get(factionId))
    .map((id) => (id !== undefined ? regionById.get(id) : undefined))
    .filter((r): r is Region => r !== undefined)
    .map((r) => r.path);
  if (paths.length === 0) return;
  const p = outerOutline(realmHoverGroup, "realm-hover-mask", paths);
  p.setAttribute("pointer-events", "none");
}

function disarm(): void {
  armed = null;
  armedSource = null;
  aimDragging = false;
  aiming = null;
  refreshAim();
  applyTargeting();
  hud.setArmed(null);
}

// --- the Turnip harvest flow: roll the offer, keep one or skip -------------

/** Opens (or re-opens) the harvest modal for the play at `index`. Nothing is
 *  rolled here any more: the three options are fixed and the only randomness
 *  is inside the "from anywhere" option, drawn when the play resolves. */
function openHarvestModal(index: number): void {
  const human = localHuman();
  pendingHarvest = { index };
  hud.showHarvestOffer(
    { buildCards: buildListing(human), heldCards: destroyOffer(human) },
    {
      onGrowth() {
        commitHarvest(index, { kind: "growth" });
      },
      onBuild(cardId) {
        commitHarvest(index, { kind: "build", cardId });
      },
      onRandom() {
        commitHarvest(index, { kind: "random" });
      },
      onDestroy(cardId) {
        commitHarvest(index, { kind: "destroy", cardId });
      },
      onSkip() {
        commitHarvest(index, { kind: "skip" });
      },
      onCancel() {
        pendingHarvest = null;
        hud.hideHarvestUi();
      },
    },
  );
}

function commitHarvest(index: number, choice: HarvestChoice): void {
  hud.hideHarvestUi();
  pendingHarvest = null;
  // Where the log stood before this play, off the authoritative world: the
  // reveal below reads everything appended past it, and a cursor taken from
  // the screen would re-announce whatever the queue had not shown yet.
  const before = world().log.length;
  const result = decide({
    kind: "harvest", cardIndex: index,
    cardId: localHuman().hand[index], choice,
  });
  // The play first, then what it gave: the commit is what queues the card's
  // flight to the discard, and the reveal goes on the same queue behind it -
  // which is why this waits for the transition rather than reading the log
  // the moment the decision is made. A sent decision has given nothing yet:
  // the cards arrive with the host's update, and `onState` reveals them.
  if (result.outcome === "applied") {
    transitions.onIdle(() => revealHarvestGains(before));
  }
}

/** Draws the dot for every settlement founded so far, from state, on every
 *  refresh. The map itself is rendered once per page load, so starting a new
 *  game clears the previous game's settlements first.
 *
 *  A land can hold several now, so this reveals the FIRST N of its authored
 *  locked dots. Which dot is which is not recorded anywhere and does not need
 *  to be: the count is the state, and the map's own authoring order is a stable
 *  answer to "where does the next one go". */
function revealFoundedSettlements(): void {
  for (const [factionId, founded] of Object.entries(game().settlements)) {
    for (const site of (sitesByFaction.get(factionId) ?? []).slice(0, founded)) {
      revealSettlement(site);
    }
  }
}

/** The state to RENDER, which is the state to play only in a solo or host
 *  game. The engine's endings pivot on the host's seat, so a guest whose
 *  host has won holds a state that says "victory" and means the opposite -
 *  `guestPhaseView` maps it. Nothing but the hud reads this: the map draws
 *  the same board either way, and every rules question still asks `game`. */
function viewState(): GameState {
  if (net.role === "guest" && net.faction !== null) {
    return { ...game(), phase: guestPhaseView(game(), net.faction) };
  }
  return game();
}

/** The phase whose ending has already been given its jingle. Endings own the
 *  whole screen, so their sound cues on the phase change here rather than on
 *  a beat - see the `victory`/`defeat` rows of `PRESENTATION_RULES`. */
let cuedEndingPhase: GameState["phase"] | null = null;

/** Stage 5: the run's ending, sounded and put on screen, or nothing when the
 *  run is still going. The LOCAL seat's ending - a guest whose realm was
 *  swallowed is shown defeat while the host's screen plays victory.
 *
 *  Also the boot paint's, which is the one state on this page that runs no
 *  transition: a `?turns=` boot can hand the page a run that has already
 *  ended, and a map that has stopped with nothing over it saying why is worse
 *  than the ending arriving unasked. */
function showEndingIfAny(): void {
  const view = viewState();
  cueEndingIfAny();
  if (view.phase === "victory" || view.phase === "defeat") {
    hud.showPostmortem(view);
  }
}

function cueEndingIfAny(): void {
  // The LOCAL seat's ending, not the host's: a guest whose realm was
  // swallowed hears defeat while the host's screen plays victory -
  // `guestPhaseView` is the one mapper of that difference.
  const phase = viewState().phase;
  if (phase === cuedEndingPhase) return;
  if (phase === "victory") {
    cuedEndingPhase = phase;
    audio.cue(
      game().log.some((e) => e.type === "unified") ? "fanfare-grand" : "victory",
    );
  } else if (phase === "defeat") {
    cuedEndingPhase = phase;
    audio.cue("defeat");
  } else {
    cuedEndingPhase = null;
  }
}

/** `opts` is handed straight to `hud.update`: `{ animate: false }` paints a
 *  state as already-settled - no card flies. Wanted for a state this screen
 *  did not play into - the boot path's first paint, and a guest's start or
 *  rejoin snapshot, which arrives as a whole game at once and would otherwise
 *  replay every card in its log.
 *
 *  It says nothing about whether a round summary rises. That is stage 4's
 *  business, and a settled transition never reaches it - `SETTLED_STAGES` in
 *  `src/transitions.ts` leaves `summary` out of the list, whatever `opts`
 *  says here. */
function refresh(opts?: { animate?: boolean }): void {
  // First, before anything renders: the ending stage this move may be about to
  // reach reads a total that has to have stopped moving, and it reads it
  // through the overlay this repaint draws.
  runClock.sample(game().phase);
  applyOwnership();
  applyTargeting();
  revealFoundedSettlements();
  renderThreatBadges();
  renderMarchArrows();
  // Re-resolve the pin before the render it must agree with: an incorporation
  // this refresh carries can change who the pinned land answers for, and the
  // status bar and the log filter both read the pin. Free when nothing moved -
  // setPinned early-returns on an unchanged id.
  hud.setPinned(pinnedFactionId());
  // The pinned land's own tooltip, refreshed with the board: a panel quoting a
  // defense score from three plays ago is worse than no panel.
  showPinnedLand(pinnedRegion);
  hud.update(viewState(), opts);
  // The menu carries the panel; so does a network game that has lost its
  // session, or one whose lobby is still being filled in - the status line
  // is the only place either of those speaks.
  netPanel.setVisible(
    game().phase === "main-menu" ||
      (net.role !== "solo" && (net.session === null || !netStarted())),
  );
  applyHighlight(hoveredRegion, hoveredRegion?.faction ?? null);
  // The tip outlives the state it describes: it stays up while a card is
  // played and the AI answers behind it, and every number on it - the leads,
  // the thresholds, the preview of what the armed card would do - has just
  // moved. Guarded by hoveredRegion so a card or faction name being hovered
  // elsewhere keeps its own tip.
  if (hoveredRegion !== null) tooltip.redraw(hoverLines(hoveredRegion));
}

/** Walks the AI seats ONE AT A TIME, until a human-controlled seat - this
 *  screen's or the remote one's - is on turn or the run ends. The host pushes
 *  after every seat, so a guest watches the round unfold rather than receiving
 *  it finished.
 *
 *  A seat at a time and not the whole round, because the round used to be
 *  resolved in one statement and replayed afterwards out of a state that had
 *  already run to the end of it. What the player watched was the right
 *  sequence of events drawn over the wrong board: arrows declared two turns
 *  later stood on the map while a raid from before them was still landing.
 *
 *  Input stays locked the whole way, and the wait between seats is the
 *  TRANSITION queue draining: a seat is one `submit`, that transition shows
 *  what the seat did before it commits, and the seat after it is submitted by
 *  the waiter this one arms. Nothing here waits on an animation callback or a
 *  timer - the queue starts a waiter's own transition as a sibling iteration
 *  of its drain loop, so a round of seats that animate nothing is a loop
 *  rather than a stack. */
function resumeChain(): void {
  stepAiChain(0);
}

function stepAiChain(taken: number): void {
  // The authoritative world: a seat plays out of the board as it stands, not
  // out of the one the screen has caught up to.
  const next = taken > MAX_AI_TURNS ? null : oneAiSeat(world(), rng, seats());
  if (next === null) {
    if (taken > MAX_AI_TURNS) console.error("AI chain stalled - breaking");
    finishChain();
    return;
  }
  // One seat's whole turn, so the transition carries exactly what that seat
  // appended. The push goes out with it rather than behind the animation: the
  // wire carries the authoritative world, and holding it back would make the
  // other screen wait on this one's camera.
  apply(() => next);
  if (net.role === "host") net.session?.pushUpdate();
  // The seat AFTER this one waits, because a round resolved faster than it is
  // shown is a round drawn over the wrong board.
  transitions.onIdle(() => stepAiChain(taken + 1));
}

/** The round has come back to a human. Nothing left to lock the screen with,
 *  so the only job is the repaint that says so. A remote seat holding the turn
 *  keeps input locked all the same, because the round has not finished; it has
 *  moved elsewhere, and `inputLocked` reads that off the turn order rather
 *  than off a flag. */
function finishChain(): void {
  refreshWhenSettled();
}

/** After a completed human action: advance, then run every AI turn back to
 *  back (each AI plays or discards; the loop stops on an ending phase).
 *
 *  The AI chain does not start until the transition carrying the advance has
 *  finished every stage - the card in the air, the question it raised and the
 *  modal about the turn before it all sit between the click and the first AI
 *  seat, and they sit there because the lifecycle runs them, not because this
 *  function remembers to wait. */
function afterHumanAction(): void {
  // `advance` refuses while the turn is still open - a card that re-opened it
  // for another copy of itself has not finished - so this is safe to call from
  // every committed action rather than only from the ones that end a turn.
  //
  // Made from the authoritative world, which is what makes it safe to run
  // while the play it follows is still being shown: read off the screen it
  // would advance the board as it stood BEFORE the card, and committing that
  // would take the card back.
  apply(advanceMove(rng));
  if (net.role === "host") net.session?.pushUpdate();
  transitions.onIdle(() => {
    if (game().phase !== "playing" || controllerOf(game().current) === "local") {
      // No AI chain behind this: the next seat is the player's own and its
      // marches have just been shown landing.
      finishChain();
      return;
    }
    resumeChain();
  });
}

/** Whether this move hands the map back to a person - the local seat, or the
 *  other human's. The round's news is read at the moment somebody can act on
 *  it, so an AI seat mid-chain answers false and its news waits.
 *
 *  A person and not "the local player": on the host, a guest taking the turn
 *  ends the host's round as surely as its own turn does, and the host would
 *  otherwise hold a round of news until the other human had finished
 *  thinking. */
function handsBackToAPerson(next: GameState): boolean {
  return next.phase === "playing" && controllerOf(next.current) !== "ai";
}

/** The status bar's "waiting for the other human" line. Only the host draws
 *  one: it is the seat it knows a name for. Everything between a guest's own
 *  turns is the host's whole world moving - several seats, several plays -
 *  and the activity log already says what each of them did. */
function updateWaitingStatus(): void {
  const remote =
    game().phase === "playing" && controllerOf(game().current) === "remote";
  if (remote && net.role === "host") {
    // The faction alone: the name beside it comes from `playerNameOf`, the
    // same hook that names it in the log and the scoreboard.
    hud.setWaiting(game().players[game().current].factionId);
    return;
  }
  hud.setWaiting(null);
}

/** Shows every card a harvest just added to the LOCAL player's deck, in the
 *  order the log recorded them: the pick first, then the one that came with
 *  it. Read off the log rather than handed down from the play, so a card
 *  granted by any future route is announced too. */
function revealHarvestGains(since: number): void {
  const human = localHuman();
  if (!human) return;
  const gained = game().log
    .slice(since)
    .filter((e) => e.type === "harvest-picked" && e.playerId === human.id)
    .map((e) => e.cardId)
    .filter((id): id is string => id !== undefined);
  if (gained.length > 0) hud.revealGainedCards(gained);
}

/** What follows the player's own card, under EVERY rule set: the board
 *  updates, the card flies, and nothing else happens.
 *
 *  A standard turn used to hand over here, the instant the card landed. It
 *  does not any more - End turn is the only thing that resolves a round, so
 *  the player reads what their play did before the world answers. `endTurn`
 *  itself refuses a spent standard turn, so the button's handler advances
 *  directly; this function's whole job is the animation and the repaint. */
function afterHumanPlay(): void {
  // No push here: `commitDecision` made it the moment the play landed, which
  // is the earliest the other screen could have been told - and doing it from
  // one place is what stops a route forgetting.
  //
  // The repaint waits for the card to land and for the queue behind it to
  // empty: `inputLocked` counts a flight in the air, so a paint made under
  // one would draw a live hand over a card the player is still watching.
  refreshWhenSettled();
}

/** A fresh world on the deck screen: everything the New game click does once
 *  this run's progress has been banked and any network game settled.
 *
 *  Extracted because the HOST runs the identical flow unasked, the moment a
 *  guest connects. A host left sitting on the main menu while its friend is
 *  already picking a deck is a lobby that looks broken from both ends - the
 *  guest is waiting on a pick the host has not been offered the screen to
 *  make. Two copies of this would be two chances to forget the pin, the
 *  settlements or the stale continuation. */
function startStagingRun(): void {
  // Belt-and-braces: onNewGame is unreachable mid-resolution in practice
  // (the menu is hidden while playing, and the postmortem appears only
  // once the run has ended), but a stray call must not leave the screen
  // frozen against a session the fresh game does not have.
  awaitingWire = false;
  // A whole new world rather than a move played into the old one. Nobody
  // watched it happen, so it commits with nothing presented - and it drops
  // whatever the run being abandoned still had in flight, waiters and all.
  transitions.replaceSettled(startGameMove(newGame(
    data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
    SITE_CAPS, DEFENSE_MAX,
  )), { animate: false });
  clearFoundedSettlements();
  deckScreen.update(deckScreenView(true));
  refreshWhenSettled();
}

/** The HUD's callbacks, held in a name so a keyboard shortcut can invoke the
 *  same handler the button does rather than keeping a second copy of the
 *  rules about when a turn may end. */
const hudCallbacks: HudCallbacks = {
    onNewGame() {
      // A DEALT network game cannot be restarted for one seat, so New game
      // abandons it outright: say so on the wire and hand the broker id back
      // rather than leave a half-live session behind. A game still in the
      // lobby is the opposite case - "Host a game" and then New game to reach
      // the deck screen is the ordinary way in, and tearing the session down
      // there would make hosting impossible.
      if (net.role !== "solo" && netStarted()) {
        net.session?.close();
        netPeer?.close();
        netPeer = null;
        net = { role: "solo" };
        localSeat = 0;
        app.classList.remove("net-guest");
        hud.setWaiting(null);
        netPanel.setConnected(false);
        // A guest's rulesPrefs was overwritten by the host's lobby and is not
        // this player's preference at all. Re-read the saved one, or the next
        // solo game in this tab would silently be played under the rules of a
        // host who has gone.
        rulesPrefs = loadRulesPrefs(storage);
      } else if (net.role === "host") {
        // The fresh game holds no pick, so the lobby must stop reporting one
        // or the guest's map keeps a land marked as taken.
        net.hostPick = null;
        net.session?.sendLobby();
      }
      startStagingRun();
    },
    onKeepPlaying() {
      // Host-only for the reason DECISION_ROUTES writes down, gated here as
      // well as in CSS - the same pair Surrender uses.
      if (!decidedHere("keep-playing", net.role)) return;
      if (game().phase !== "victory" || inputLocked() || pendingHarvest !== null) {
        return;
      }
      disarm();
      // A conquest that WON the run leaves its defender transfer unanswered -
      // the ask stage stands down on an ended run, since there is no board to
      // move them on. This decision is the move that gives one back, and its
      // own ask stage puts the question the player still owes back on screen.
      decide({ kind: "keep-playing" });
    },
    onSurrender() {
      // Host-only, and `DECISION_ROUTES` is where the reason is written down.
      // The button is hidden from a guest as well (`.net-guest` in
      // style.css); this is the gate that does not depend on CSS.
      if (!decidedHere("surrender", net.role)) return;
      if (game().phase !== "playing" || inputLocked() || pendingHarvest !== null) {
        return;
      }
      disarm();
      // The run is over for both of them, and the push `decide` makes is the
      // only one that will ever carry that - nothing advances behind it.
      decide({ kind: "surrender" });
    },
    elapsedMs: () => runClock.elapsedMs(),
    onPlayCard(index) {
      // `turnOpen`, not `playedThisTurn`: a play that re-opened the turn leaves
      // a live hand behind it, and which card that hand still accepts is
      // `humanPlayableSet`'s answer rather than this gate's.
      if (
        !isLocalTurn() || !turnOpen(game()) || inputLocked() ||
        pendingHarvest !== null || localTransferPending()
      ) {
        return;
      }
      const human = localHuman();
      const cardId = human.hand[index];
      if (discardMode()) {
        disarm();
        decide({ kind: "discard", cardIndex: index, cardId });
        return;
      }
      // The harvest's pre-play choice, the targeting flow's shape: nothing is
      // committed until a boon (and its sub-pick) is settled. Every seat
      // earns harvests, so every seat is asked - and `decidedHere` is what
      // says so, rather than an ordering that once put a role check above
      // this line and made a second person's boon the host's to guess.
      if (cardId === "turnip-harvest" && decidedHere("harvest", net.role)) {
        disarm();
        openHarvestModal(index);
        return;
      }
      const card = CARDS[cardId];
      if (card?.targeted) {
        // Arming stays local whoever is playing - it is a question about this
        // screen's map, and only the answer, the commit, is routed.
        if (armed === index) {
          disarm();
          return;
        }
        // One legal target is not a decision. Fortify with a single damaged
        // land, Incorporate with one vassal: the click that armed the card
        // already said everything the game was going to ask.
        if (autoAimIfOnlyOne(index)) {
          disarm();
          return;
        }
        armed = index;
        if (armedTargets().length === 0) {
          disarm();
          return;
        }
        applyTargeting();
        hud.setArmed(index, card.name, armPrompt(card.id));
        return;
      }
      disarm();
      decide({ kind: "play", cardIndex: index, cardId });
    },
    onEndTurn() {
      // The conquest question holds the turn the same way the harvest offer
      // does, and for a harder reason: it is answered by the seat on turn, so
      // a turn handed over with it open is a question nothing can answer.
      if (
        !isLocalTurn() || inputLocked() || pendingHarvest !== null ||
        localTransferPending()
      ) {
        return;
      }
      disarm();
      // A turn with nothing left to close - a spent standard one - just HANDS
      // OVER: the round resolves on this click rather than the moment the card
      // landed, so nothing on the board moves without the player asking. A
      // turn still open is closed first, and that includes one a card
      // re-opened: `turnOpen`, never `playedThisTurn`, or giving up a granted
      // second raid would leave the turn open and `advance` refusing it.
      if (!turnOpen(game())) {
        afterHumanAction();
        return;
      }
      decide({ kind: "end-turn" });
    },
    isResolving() {
      return inputLocked();
    },
    canPlayCard(cardId) {
      return humanBlockReason(cardId) === null;
    },
    cardBlocked(cardId) {
      const reason = humanBlockReason(cardId);
      return reason === null ? null : cardBlockLine(reason);
    },
    targetExplanations(cardId) {
      const human = localHuman();
      if (!human || !CARDS[cardId]?.targeted) return [];
      const view = viewOf(game());
      return explainTargetEligibility(
        targetEligibilityFor(view, human.factionId, cardId),
        (id) => factionById.get(id)?.name ?? id,
        // A card that can fail must say so before it is aimed, on every target
        // that can fail, or the roll reads as a bug. Its own band in the tip,
        // not another annotation line: the two say opposite things.
        (id) => targetOddsLines(view, human.factionId, cardId, id),
        (id) => {
          if (!ATTACK_CARDS.has(cardId)) return [];
          // Per TARGET, not per card: a Great raid takes a different number off
          // a land three of your own border than off one that only touches
          // one. Through `attackImpactOn`, which the land hover also asks, so
          // the two previews of the same play cannot disagree.
          const { damage, multiplier, arrows } = attackImpactOn(
            view, human.factionId, cardId, id,
          );
          const suffix = multiplier > 1
            ? ` (${multipliedWord(multiplier)})`
            : "";
          return [arrows > 1
            ? `-${damage} defense, ${count(arrows, "arrow")}${suffix}`
            : `-${damage} defense${suffix}`];
        },
      );
    },
    cardRisk(cardId) {
      return cardRiskLine(cardId);
    },
    cardModifiers(cardId) {
      const human = localHuman();
      const lines = human
        ? cardModifierLines(game(), human.factionId, cardId)
        : [];
      // What a Plague is worth right now rides with its modifiers: the
      // stacks are on the map, the sum is not.
      return human && cardId === "plague"
        ? [...plaguePreviewLines(viewOf(game()), human.factionId), ...lines]
        : lines;
    },
    isDiscardMode() {
      return game().players.length > 0 && discardMode();
    },
    onHighlightFaction(factionId) {
      // Segments carry FACTION ids; applyRealmHover takes a Region, and the
      // two id spaces are different words - see the comment above
      // regionByFaction. Deliberately does not touch hoveredRegion: that
      // tracks the cursor on the map and is what refresh() re-asserts, while
      // a name hover here is transient and must not survive the next refresh.
      const regionId = factionId === null ? undefined : regionByFaction.get(factionId);
      const region = regionId === undefined ? null : regionById.get(regionId) ?? null;
      // The id goes to the log directly rather than being read back off the
      // region: the lookup above can miss, and a name with no polygon must
      // still dim the log to the lines that name it.
      applyHighlight(region, factionId);
    },
    // The seat this screen plays, as a player id. Seat 0 in a solo or host
    // game; the guest learns its own seat from the start snapshot, which is
    // why this is a callback rather than a constant handed to createHud.
    localPlayerId() {
      return game().players[localSeat]?.id ?? 1;
    },
    playerNameOf(factionId) {
      return playerNameOfFaction(factionId);
    },
    onShowTip(lines) {
      tooltip.showLines(lines);
    },
    onHideTip() {
      tooltip.hide();
    },
    cue(name) {
      audio.cue(name);
    },
    soundMuted() {
      return audio.muted();
    },
    onToggleSound(muted) {
      audio.setMuted(muted);
    },
    regionSubtitle() {
      return regionDef.era;
    },
    onOpenRegions() {
      // The button lives on the menu overlay, which is only shown at
      // `game.phase === "main-menu"` - so that phase is the guard, and the
      // querySelector below only needs to stop a second click from stacking
      // a second screen on top of the first.
      if (app.querySelector(".regions-screen")) return;
      const screen = createRegionsScreen(app, {
        activeId: regionId,
        onPick(id) {
          saveRegionPref(storage, id);
          // The whole app is wired to one map at module scope; a reload IS
          // the rebuild, and the menu phase has no run to lose.
          window.location.reload();
        },
        onClose() {
          screen.remove();
        },
      });
    },
};

const hud = createHud(
  app,
  hudCallbacks,
  factionNameById,
  placeNameFactionIds,
  storage,
);

function deckScreenView(visible: boolean) {
  return {
    visible,
    build: buildPref,
    rules: rulesPrefs,
    // A guest plays the host's rules - `onLobby` overwrites `rulesPrefs` with
    // them, and the start snapshot carries them inside the state regardless.
    // So the picker shows them and refuses to pretend otherwise.
    rulesLocked: net.role === "guest",
  };
}

const deckScreen = createDeckScreen(app, {
  onShowTip(lines) {
    tooltip.showLines(lines);
  },
  onHideTip() {
    tooltip.hide();
  },
  onBuildChange(build) {
    // Saved per change, like the rules, so the pick is remembered even if
    // the player leaves the screen another way.
    buildPref = build;
    saveBuildPref(storage, buildPref);
  },
  onRulesChange(next) {
    // A guest's radios are disabled, so this is unreachable there - but the
    // rules are the host's and a stray call must not pretend otherwise.
    if (net.role === "guest") return;
    rulesPrefs = next;
    saveRulesPrefs(storage, rulesPrefs);
    // The lobby carries the rules, so a host that changes its mind after the
    // guest arrived has to say so - otherwise the guest's picker goes on
    // showing the rules it was told about when it connected.
    if (net.role === "host") net.session?.sendLobby();
    deckScreen.update(deckScreenView(true));
  },
  onStart(build) {
    buildPref = build;
    saveBuildPref(storage, buildPref);
    if (net.role === "guest") {
      // The build the host will stamp on this seat, held until the map click
      // names the land it belongs to. The local transitions below it are a
      // staging area only - they carry the guest to the faction-pick screen,
      // and the host's start snapshot replaces every one of them.
      net.build = build;
      deckScreen.update(deckScreenView(false));
      netPanel.setStatus("Pick your land on the map.");
      // One transition, because the rules and the build are one answer to one
      // screen: two would repaint the staging state half-picked. The ground is
      // the host's to roll - a local roll would show this player hills and
      // rivers that the start snapshot then moves, so the staged state carries
      // none and the picker's hover simply says nothing about the ground here.
      apply((g) => ({
        ...chooseBuildMove(rulesPrefs, build, rng)(g), passives: {},
      }));
      return;
    }
    deckScreen.update(deckScreenView(false));
    apply(chooseBuildMove(rulesPrefs, build, rng));
  },
});

/** Creates the host's session on a fresh wire. Called for the first
 *  connection and for every rejoin after a drop, and the two differ by one
 *  thing: once the game has been dealt this seat's faction is known, so the
 *  session resumes with it and answers the next hello with a snapshot
 *  instead of a lobby. */
function attachHostWire(wire: Wire): void {
  if (net.role !== "host") return;
  // The broker accepts any number of connections, and a half-dead WebRTC
  // wire declares itself dead on a 15s silence - which can land well after
  // its replacement is live. So the one being replaced is dropped here, and
  // every callback below checks that it is still the session in force. A
  // stale onClosed nulling the LIVE session froze this screen while the
  // guest played on, and each pushUpdate then quietly went nowhere.
  const stale = net.session;
  net.session = null;
  stale?.close();
  let session: HostSession | null = null;
  const startedFaction =
    net.guestSeat !== null ? world().players[net.guestSeat].factionId : null;
  session = createHostSession(
    wire,
    {
      // The AUTHORITATIVE world and never the drawn one. The session validates
      // the guest's action against this, applies it to this, and sends this -
      // all in one synchronous breath. Answering with the board on screen
      // would validate a move against a state the host has already moved past,
      // and then push that older board back at the guest with no events to
      // explain it, undoing on their screen the play they had just made.
      getGame: () => world(),
      // The guest's play, arriving as a state the host must watch: a move made
      // against the board this screen is showing, so it presents like any
      // other.
      setGame: (g) => {
        apply(() => g);
      },
      rng,
      name: netPanel.name(),
      rules: () => rulesPrefs,
      hostFactionId: () => (net.role === "host" ? net.hostPick : null),
      onGuestHello(name) {
        if (net.role !== "host" || net.session !== session) return;
        // Two different arrivals: a rejoin into a running game, and a friend
        // turning up to a lobby that has not dealt yet. Only the second has
        // anything to report about progress. A player name is plain text -
        // no faction is named on this line, and none should be.
        netPanel.setStatus(
          netStarted()
            ? `${name} is connected.`
            : `${name} is picking their deck and land...`,
        );
        netPanel.setConnected(true);
        netPanel.hideReconnect();
        // The guest is already on its deck screen, so the host cannot be left
        // on the main menu waiting to be told to press New game - it is the
        // one seat that has to pick before either of them can start.
        if (!netStarted() && game().phase === "main-menu") startStagingRun();
        // A drop froze this screen (see onClosed); the rejoin thaws it back
        // to whatever the turn order actually says, which `inputLocked` reads
        // for itself.
        awaitingWire = false;
        refreshWhenSettled();
      },
      onGuestPick() {
        if (net.role !== "host" || net.session !== session) return;
        // Only worth saying while the host still owes a pick of its own -
        // once both are in, tryDeal deals and the panel goes away.
        if (net.hostPick === null) {
          netPanel.setStatus(
            `${session?.guestName() ?? "Your friend"} has chosen their land.`,
          );
        }
        tryDeal();
      },
      onGuestAction() {
        if (net.role !== "host" || net.session !== session) return;
        // The guest's play is already committed and pushed; this runs the
        // world on past it. `advance` no-ops while an unlimited turn is
        // still open, so a guest playing twice is not cut short here.
        //
        // The advance is made from the authoritative world, so it needs no
        // wait; the CHAIN does, because a seat may not be played until the
        // one before it has been shown.
        apply(advanceMove(rng));
        transitions.onIdle(() => resumeChain());
      },
      onClosed() {
        // Not `net.role !== "host"` alone: a wire that died after its
        // replacement was live would otherwise null the session in force.
        if (net.role !== "host" || net.session !== session) return;
        net.session = null;
        // Nothing may act while the two sides cannot agree on what happened.
        awaitingWire = game().phase === "playing";
        hud.setWaiting(null);
        netPanel.setVisible(true);
        // The join controls come back with the drop: this is a lobby again
        // until somebody reconnects.
        netPanel.setConnected(false);
        netPanel.setStatus(
          "Your friend disconnected. The game is paused until they rejoin with the same link.",
        );
      },
    },
    startedFaction !== null ? { guestFactionId: startedFaction } : undefined,
  );
  net.session = session;
  netPanel.setStatus("Connected.");
}

/** Deals once both humans have picked. What the deal itself does - the
 *  reserved land, the stamped build - is `dealNetGame`; this is the screen's
 *  half, which is knowing when both picks are in. */
function tryDeal(): void {
  if (net.role !== "host" || net.session === null) return;
  const pick = net.session.guestPick();
  if (net.hostPick === null || pick === null) return;
  if (world().phase !== "pick-faction") return;
  const dealt = dealNetGame(world(), rng, {
    hostFactionId: net.hostPick,
    guestFactionId: pick.factionId,
    guestBuild: pick.build,
  });
  // The seat BEFORE the commit, which repaints inside that call: the deal's
  // own log lines are rendered by it, and `playerNameOfFaction` answers null
  // for every faction until the host knows which seat the guest took - so a
  // seat set afterwards leaves the guest's name off those lines for good,
  // since `renderedEvents` has caught up and no later paint rewrites them.
  net.guestSeat = dealt.guestSeat;
  // A dealt game is a world arriving whole rather than a move played into
  // the one before it, so it commits with nothing presented AND paints as
  // already-settled - the `adoptSnapshot` intent, and for the same reason:
  // the deal's own log lines are not this screen's round, so they neither
  // flash as new nor go into the news the first real modal speaks for.
  // Before `markStarted`, which builds the start snapshot out of the
  // committed state: the guest must be sent the game, not the lobby it
  // replaced.
  transitions.replaceSettled(dealt.state, { animate: false });
  net.session.markStarted(pick.factionId);
  netPanel.setVisible(false);
  refreshWhenSettled();
}

/** The guest's move goes to the host, which is the only place a card is
 *  ever really played. The screen locks until the host answers with the
 *  state that followed - or refuses it, which unlocks without moving. */
function sendGuestAction(a: NetAction): void {
  if (net.role !== "guest" || net.session === null) return;
  awaitingWire = true;
  refresh();
  net.session.sendAction(a);
}

/** The ONE place this screen turns a decision into a state change. Every
 *  handler builds a `Decision` and hands it here; none of them knows what
 *  `net.role` is, and none of them can reach the rules on its own - the root
 *  biome.json refuses main.ts the engine's mutators outright, so there is no
 *  local path around this for a new decision to forget the guest on.
 *
 *  Returns whether the decision landed here, which is what a caller with
 *  something to do afterwards asks: a harvest's reveal happens on this screen
 *  when this screen played it, and arrives with the update when it did not. */
function decide(d: Decision): DecisionResult {
  const result = commitDecision(
    {
      // The authoritative world, which is what the rules are applied to and
      // what a guest's copy is validated against. It is the displayed state
      // in every case a person can actually reach - input is locked while the
      // two differ - but a decision answered from a modal that outlived its
      // repaint (a conquest transfer) is the case that would not be, and
      // applying that answer to the older board would drop whatever the queue
      // had shown in between.
      role: net.role, localSeat, state: world(), rng,
      send: sendGuestAction,
      // The router decided what the world becomes; the queue is still how it
      // gets there, so a decision presents itself exactly like every other
      // move this screen makes.
      apply: (next) => { apply(() => next); },
      pushUpdate: () => {
        if (net.role === "host") net.session?.pushUpdate();
      },
    },
    d,
  );
  if (result.outcome === "refused") {
    // A refused move leaves the board exactly where it was, so the only thing
    // to undo is this screen's own arming. The panel is where a network game
    // already says why anything was refused.
    if (net.role !== "solo") netPanel.setStatus(result.reason);
    refreshWhenSettled();
    return result;
  }
  // A sent move already locked the screen in `sendGuestAction`; there is
  // nothing else to settle until the host answers.
  if (result.outcome === "sent") return result;
  switch (result.settle) {
    case "play": afterHumanPlay(); break;
    case "action": afterHumanAction(); break;
    // The repaint is owed AFTER the move has been presented and committed:
    // this one settles a question the player was asked, and the answer's own
    // transition is still in front of it.
    case "repaint": refreshWhenSettled(); break;
  }
  return result;
}

function guestPickFaction(fid: string): void {
  if (net.role !== "guest" || net.session === null) return;
  if (net.build === null) return;
  net.session.sendPick(net.build, fid);
  netPanel.setStatus("Waiting for the host to start the game...");
}

function attachGuestWire(wire: Wire, hostId: string): void {
  const prev = net.role === "guest" ? net : null;
  const stale = prev?.session ?? null;
  // The role is taken BEFORE the session exists, because createGuestSession
  // says hello on the spot and the host's answer can land in these callbacks
  // before this function has finished running.
  net = {
    role: "guest", session: null, hostId,
    build: prev?.build ?? null, faction: prev?.faction ?? null,
    // Dropped on a reconnect: the host re-sends its lobby on the next hello,
    // and a remembered pick could be one the host has since changed.
    taken: null,
  };
  app.classList.add("net-guest");
  // The wire being replaced is dropped, and every callback below checks it
  // is still the session in force - the same stale-wire rule attachHostWire
  // states at length.
  stale?.close();
  let session: GuestSession | null = null;
  session = createGuestSession(wire, {
    name: netPanel.name(),
    onHostHello(name) {
      if (net.role !== "guest" || net.session !== session) return;
      netPanel.setStatus(`Connected to ${name}. Pick your deck and land.`);
      netPanel.setConnected(true);
      netPanel.hideReconnect();
      // The reconnect thaws the freeze onClosed put on this screen. A game
      // already dealt has its snapshot on the way in the same breath as this
      // hello, so it stays locked the one moment longer that onState needs;
      // a lobby has no state coming at all, and leaving THAT locked stranded
      // the guest on the faction pick with every map click swallowed and no
      // menu at that phase to escape by.
      awaitingWire = netStarted() && game().phase === "playing";
      // The staging screens are for a guest that arrived before the deal.
      // A rejoin mid-game must not walk them: the snapshot is the game, and
      // starting a local one here put the deck picker over the top of it.
      if (!netStarted() && game().phase === "main-menu") {
        deckScreen.update(deckScreenView(true));
        apply(startGameMove);
      }
      refreshWhenSettled();
    },
    onLobby(info) {
      if (net.role !== "guest" || net.session !== session) return;
      // The host's rules are the game's rules - there is one engine and it
      // is theirs. The deck screen redraws so the picker shows them.
      rulesPrefs = info.rules;
      deckScreen.update(deckScreenView(game().phase === "deck-building"));
      net.taken = info.takenFactionId;
      if (info.takenFactionId !== null) {
        netPanel.setStatus("Host has picked their land.");
      }
      // The map has to show which land went, not just say that one did -
      // applyTargeting greys it. Cheap and safe at any phase: it is a class
      // toggle per polygon, and it reads `game.phase` itself.
      applyTargeting();
    },
    onState(g, fid, source, newEvents) {
      if (net.role !== "guest" || net.session !== session) return;
      // Where the log stood before this message, off the authoritative world
      // rather than off the screen: two updates can arrive while the first is
      // still being shown, and a cursor taken from the lagging state would
      // reveal the earlier one's harvest cards a second time.
      const before = world().log.length;
      net.faction = fid;
      localSeat = Math.max(0, seatOfFaction(g, fid));
      awaitingWire = false;
      netPanel.setVisible(false);
      // A whole game arriving at once - the deal, or a rejoin - is not a
      // state this screen played into. The local staging screens go with it;
      // the snapshot IS the game.
      deckScreen.update(deckScreenView(false));
      // The hello could not know a snapshot was coming, so it left the lobby
      // line up. Correct it now: the panel is hidden here, but a later drop
      // shows it again and it must not be advertising the deck screen.
      netPanel.setStatus(`Playing with ${net.session?.hostName() ?? "the host"}.`);
      if (source !== "update") {
        // A snapshot's log is history rather than this screen's round, so it
        // is taken on in silence - an animating paint flew every card in it
        // and dropped a round summary over a game twenty turns old.
        adoptSnapshot(g);
      } else {
        // An update is the host's world moving under this screen while the
        // player watches, so it presents: the events it carries are the ones
        // the replay walks and the round summary is built from.
        //
        // The events come off the MESSAGE and are not sliced out of the log
        // afterwards. `applyUpdate` splices at the host's own `logFrom`, so a
        // re-delivered or overlapping update grows this guest's log by less
        // than it carried - or by nothing at all - and a slice against the
        // previous length would hand the presenter a short tail of a round it
        // is about to show.
        submitUpdate(g, newEvents ?? g.log.slice(before));
        // What a harvest gave arrives here rather than at the play, because
        // the play was resolved on the other machine. `revealHarvestGains`
        // reads the log for the LOCAL seat's gains, so an update carrying
        // none shows nothing and this costs a filter. After the queue, since
        // it reads the log the update is still in the middle of showing.
        //
        // Input stays locked through the replay, the same as the host's own
        // chain: an update can hand the turn over in the same breath as the
        // round it is replaying, and without the wait the guest could play a
        // card into the middle of watching what happened - which also cancels
        // the camera mid-glide, since a press is the player taking the map
        // back.
        transitions.onIdle(() => revealHarvestGains(before));
      }
      updateWaitingStatus();
    },
    onReject(reason) {
      if (net.role !== "guest" || net.session !== session) return;
      // A refused move leaves the state exactly where it was, so the only
      // thing to undo is this screen's lock. The reason goes on the panel
      // as well as the console: a refused LOBBY pick (the land the host has
      // already taken) otherwise left "Waiting for the host to start the
      // game..." standing over a pick that was never going to be honoured,
      // and the panel is on screen for exactly that phase.
      console.error("host rejected the action:", reason);
      netPanel.setStatus(`That did not go through: ${reason}.`);
      awaitingWire = false;
      refreshWhenSettled();
    },
    onRefused(reason) {
      if (net.role !== "guest" || net.session !== session) return;
      netPanel.setStatus(reason);
    },
    onClosed() {
      // Not `net.role !== "guest"` alone - see attachHostWire's onClosed.
      if (net.role !== "guest" || net.session !== session) return;
      net.session = null;
      awaitingWire = true; // nothing can act until the host is back
      hud.setWaiting(null);
      netPanel.setVisible(true);
      // The join controls come back with the drop - the Join field is the
      // way to a DIFFERENT host, which Reconnect cannot offer.
      netPanel.setConnected(false);
      netPanel.setStatus("Connection lost.");
      netPanel.showReconnect(() => startJoin(hostId));
    },
  });
  if (net.role === "guest") net.session = session;
}

function startJoin(hostId: string): void {
  if (boot !== null) {
    netPanel.setStatus("Join links cannot carry test boot params.");
    return;
  }
  netPanel.setStatus("Connecting...");
  netPeer?.close();
  netPeer = joinPeer(hostId, {
    onWire(wire) {
      attachGuestWire(wire, hostId);
    },
    onError(reason) {
      netPanel.setStatus(`Could not connect: ${reason}`);
      netPanel.showReconnect(() => startJoin(hostId));
    },
  });
}

const netPanel = createNetPanel(
  app,
  {
    onHost() {
      if (net.role !== "solo") return;
      netPanel.setStatus("Getting an id from the broker...");
      netPeer = hostPeer({
        onOpen(id) {
          net = {
            role: "host", session: null, hostPick: null, guestSeat: null,
            peerId: id,
          };
          netPanel.showInvite(
            `${window.location.origin}${window.location.pathname}?join=${id}`,
            id,
          );
          netPanel.setStatus("Waiting for a friend to join...");
        },
        onWire(wire) {
          attachHostWire(wire);
        },
        onError(reason) {
          netPanel.setStatus(`Connection error: ${reason}`);
        },
      });
    },
    onJoin(hostId) {
      startJoin(hostId);
    },
  },
  netStorage,
  "Player",
);
netPanel.setVisible(game().phase === "main-menu");

// An invite link opens straight into the join, so the second player never
// has to find the panel. A booted URL is refused rather than half-honoured:
// the two would deal different games (see `joinId` above).
if (joinId !== null) {
  if (boot !== null) {
    netPanel.setVisible(true);
    netPanel.setStatus("Join links cannot carry test boot params.");
  } else {
    netPanel.setVisible(true);
    startJoin(joinId);
  }
}

hud.update(game(), { animate: boot === null });
// A boot that stopped short - an unknown faction id - leaves the phase at
// deck-building, whose screen is hidden from page load. Without this the
// page is a bare map with no way forward.
if (boot !== null) {
  deckScreen.update(deckScreenView(game().phase === "deck-building"));
}

window.addEventListener("keydown", (e) => {
  // E or Backspace hands the turn over, wherever the pointer is. Backspace
  // would otherwise navigate back in some browsers, so it is taken outright.
  if (e.key === "e" || e.key === "E" || e.key === "Backspace") {
    e.preventDefault();
    if (pendingHarvest !== null || localTransferPending()) return;
    hudCallbacks.onEndTurn?.();
    return;
  }
  if (e.key !== "Escape") return;
  // The harvest offer outranks everything while it holds input; its Escape
  // is the hud's own handler (the overlay is up), and the early return keeps
  // this one from also unpinning underneath it.
  if (pendingHarvest !== null) return;
  // An armed card goes first, so one Escape never both disarms and unpins.
  if (armed !== null) disarm();
  else if (pinnedRegion !== null) interaction.deselect();
});

/** Plays a targeted card that has exactly one legal target, without asking.
 *  A choice between one thing is not a choice - it is a click the game already
 *  knows the answer to. The march cards are excluded: their first pick is the
 *  land the army leaves from, and a realm with one legal SOURCE may still have
 *  several places to send it. */
function autoAimIfOnlyOne(index: number): boolean {
  const human = localHuman();
  if (!human) return false;
  const cardId = human.hand[index];
  if (!CARDS[cardId]?.targeted || needsSource(cardId)) return false;
  const targets = validTargetsFor(viewOf(game()), human.factionId, cardId);
  if (targets.length !== 1) return false;
  decide({ kind: "play", cardIndex: index, cardId, targetId: targets[0] });
  return true;
}

/** Commits the raid an aim-drag drew. The same call the two-click flow makes,
 *  so a raid aimed by dragging and one aimed by clicking are the same play. */
function commitRaid(from: string, to: string): void {
  const human = localHuman();
  if (!human || armed === null) return;
  const idx = armed;
  const cardId = human.hand[idx];
  disarm();
  decide({
    kind: "play", cardIndex: idx, cardId, targetId: to, sourceId: from,
  });
}

/** Ends an aim-drag without playing anything. */
function cancelAim(): void {
  aimDragging = false;
  aiming = null;
  refreshAim();
}

// Aiming a raid by dragging: press a land your army can leave from, pull the
// arrow to the land you mean, release. The two-click flow is untouched - this
// is a faster way to say the same thing, and a press that starts anywhere else
// still pans the map.
svg.addEventListener("pointermove", (e) => {
  if (aiming === null) return;
  const at = interaction.toMapPoint(e.clientX, e.clientY);
  // Through `landAtPoint`, the resolver the click itself uses. Asking what the
  // pointer is literally over answered "no land" across every arrow, strength
  // label and settlement dot lying on the target - so the marker went dark on
  // a wide band of the very land being aimed at, while the click underneath
  // stayed live.
  const regionId = landAtPoint(e.clientX, e.clientY);
  const faction = regionId === null ? null : factionByRegion.get(regionId) ?? null;
  // The targets of the land being dragged FROM, not `armedTargets()`: with no
  // source committed that still answers the first question - which lands an
  // army may leave from - and every land under the pointer would read as
  // illegal.
  const human = localHuman();
  const legal =
    faction !== null && human !== undefined &&
    marchTargetsFrom(viewOf(game()), human.factionId, aiming.from).includes(faction)
      ? faction
      : null;
  aiming = { ...aiming, at, over: legal };
  refreshAim();
});

svg.addEventListener("pointerup", (e) => {
  if (aiming === null) return;
  // ONLY a drag plays from here. An aim is live in the two-click flow too -
  // `updateAimPreview` sets it the moment a source is picked, so the arrow can
  // follow the pointer - and this listener is registered before
  // `attachInteraction`, so without the gate it ran FIRST on the second click
  // and played the card itself, at the land the aim happened to be holding
  // rather than the land under the click. Two committers reading two answers
  // to "which land": the click resolved the release point, the aim held
  // whatever the pointer last hovered, and a raid could land on a neighbour
  // the player never pointed at. The click path owns that play; this one owns
  // the drag, where there is no click to own it.
  const wasDrag = aimDragging;
  const target = aiming.over;
  const from = aiming.from;
  cancelAim();
  if (wasDrag && e.button === 0 && target !== null) commitRaid(from, target);
});

// Right click gives the aim up, wherever the pointer is and whichever way it
// was being aimed - mid-drag, or after a source was clicked. The browser menu
// is suppressed for the whole armed state rather than only while an arrow is
// on screen: a right click that opened a context menu over the map instead of
// cancelling is the one input the player cannot take back.
svg.addEventListener("contextmenu", (e) => {
  if (armed === null && aiming === null) return;
  e.preventDefault();
  cancelAim();
  disarm();
});

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    updateAimPreview(clientX, clientY);
    if (region) tooltip.showLines(hoverLines(region));
    else tooltip.hide();
    hoveredRegion = region;
    applyHighlight(region, region?.faction ?? null);
  },
  onHoverSettlement(settlement) {
    if (settlement) {
      tooltip.show(settlementTooltipText(settlement));
    } else tooltip.hide();
  },
  interceptPress(regionId, e) {
    // Only while a march card is armed and the press lands on a land its
    // armies can actually leave from. Everything else is a pan, as it always
    // was.
    const human = localHuman();
    if (!human || armed === null || regionId === null) return false;
    if (!needsSource(human.hand[armed])) return false;
    if (armedSource !== null) return false;
    const faction = factionByRegion.get(regionId);
    if (faction === undefined || !armedTargets().includes(faction)) return false;
    aimDragging = true;
    aiming = {
      from: faction,
      at: interaction.toMapPoint(e.clientX, e.clientY),
      over: null,
    };
    refreshAim();
    return true;
  },
  onSelect(region) {
    pinnedRegion = region;
    hud.setPinned(pinnedFactionId());
    showPinnedLand(region);
    applyHighlight(region, region?.faction ?? null);
  },
  interceptClick(regionId) {
    if (inputLocked()) return true; // swallow: no selection while the round resolves
    if (game().phase === "pick-faction") {
      if (regionId === null) return true;
      const picked = regionById.get(regionId)!.faction;
      // Before the role branches, because it is true in all three: a land
      // already sworn to a realm is refused by `pickFaction` whichever seat is
      // asking. The map has greyed it and the hover has said why, so the click
      // is dropped here rather than reaching an engine call that would return
      // the same state and look like nothing happened.
      if (!isUnheld(picked, game().overlords, game().incorporated)) return true;
      if (net.role === "host") {
        // A host cannot deal on the click: the other seat has not been
        // chosen yet. The pick is held, announced to the lobby, and the deal
        // happens in tryDeal whenever the second of the two picks lands.
        if (picked === net.session?.guestPick()?.factionId) {
          // Swallowing the click in silence read as the map being broken.
          netPanel.setStatus("Your friend has taken that land - pick another.");
          return true;
        }
        net.hostPick = picked;
        net.session?.sendLobby();
        tryDeal();
        return true;
      }
      if (net.role === "guest") {
        // The map already greys this land; refusing the click here is what
        // makes the grey mean something. The host's reject still stands
        // behind both, for the pick that crosses with the host's own.
        if (picked === net.taken) {
          netPanel.setStatus("The host has taken that land - pick another.");
          return true;
        }
        guestPickFaction(picked);
        return true;
      }
      apply(pickFactionMove(picked, rng));
      return true;
    }
    if (game().phase === "playing" && armed !== null) {
      const idx = armed;
      const cardId = localHuman().hand[idx];
      const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
      // A march card's first click picks the tail, not the head. It commits
      // nothing - the card is still in hand, and clicking the same land again,
      // or the card again, backs out - so the step is safe to explore.
      if (needsSource(cardId) && armedSource === null) {
        if (raw !== undefined && armedTargets().includes(raw)) {
          armedSource = raw;
          applyTargeting();
          const land = factionById.get(raw)?.name ?? raw;
          hud.setArmed(idx, `${CARDS[cardId].name} out of ${land}`);
        } else {
          disarm();
        }
        return true;
      }
      // A polygon card aims at the land itself, a faction card at whoever
      // holds it - the same resolution the targeting classes and the hover
      // preview use (`aimsAtPolygons`).
      const faction = raw === undefined
        ? undefined
        : aimsAtPolygons(cardId)
          ? raw
          : politicalFactionForPolygon(raw, game().incorporated);
      const valid = faction !== undefined && armedTargets().includes(faction);
      const sourceId = armedSource;
      disarm();
      if (valid) {
        decide({
          kind: "play", cardIndex: idx, cardId, targetId: faction,
          ...(sourceId !== null ? { sourceId } : {}),
        });
      }
      return true;
    }
    return false;
  },
});

// Last statement in the file, deliberately. A booted state needs the map
// painted - ownership, realm outlines, threat badges, settlements - which the
// first `hud.update` alone does not do. Running it here rather than beside
// that update keeps it clear of every binding declared between the two.
if (boot !== null) {
  refresh();
  showEndingIfAny();
  // A booted state runs NO transition at all - it is folded into
  // `initialGame`, ahead of the queue - so the ask stage every other world
  // arriving whole gets is the one thing this path cannot inherit, and a
  // `?turns=` fast-forward lands on an unanswered conquest about a third of
  // the time. Every gate that reads `localTransferPending` then returns in
  // silence: no card can be played, no turn ended, and nothing on screen says
  // why. Same rule as the settled stages, asked here because there is no
  // transition to ask it: a state nobody watched happen still owes its
  // questions.
  //
  // On the SAME condition stage 3 stands down on: a run that has ended has no
  // board to move defenders on, and the question would be a slider reading
  // `0 of 0` over the postmortem raised one line above - the overlay it sits
  // on outranks the result screen.
  if (game().phase === "playing") askTransfer(() => {});
}
