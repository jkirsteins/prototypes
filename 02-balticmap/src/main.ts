import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createTooltip, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction, DRAG_THRESHOLD_PX } from "./interaction";
import {
  newGame, startGame, chooseBuild, chooseRules, pickFaction, playCard,
  discardCard, advance, surrender, viewOf, endTurn,
  type GameEvent, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { fullRealmOf, realmOf, realmRootOf } from "./relations";
import {
  handBlockReason, marchSourcesAgainst, marchSourcesFor, marchTargetsFrom,
  playableSet, respiteExpiry, validTargetsFor, targetEligibilityFor,
  attackDamageFor,
} from "./playability";
import { armiesOn, axesOf, freeArmiesOn, type March } from "./marches";
import {
  clashFraction, insetSegment, offsetSegment, pointAlong, scaleSpear,
  spearPolygon, SPEAR,
} from "./arrows";
import { runAnimation } from "./animate";
import {
  defenseMaxOf, defenseOf, gateBandOf, type GateBand,
} from "./defense";
import {
  cardBlockLine, cardModifierLines, cardRiskLine, defenseBreakdown,
  diseaseBreakdown, explainTargetEligibility, multipliedWord,
  plaguePreviewLines, respiteLines, settlementBlock, targetImpactLines,
  targetOddsLines,
} from "./target-explanations";
import { ATTACK_CARDS, CARDS, type Strategy } from "./cards";
import { rollHarvestOffer, type HarvestChoice } from "./harvest";
import { createHud, LOG_PREFS_KEY } from "./hud";
import { createDeckScreen } from "./deck-screen";
import { createHostSession, type HostSession } from "./net-host";
import { createGuestSession, type GuestSession } from "./net-guest";
import { hostPeer, joinPeer } from "./net";
import { createNetPanel } from "./net-ui";
import {
  guestPhaseView, seatOfFaction, type NetAction, type Wire,
} from "./net-protocol";
import {
  loadBuildPref, memoryStorage, saveBuildPref, type MetaStorage,
} from "./meta";
import { applyBootParams, parseBootParams } from "./boot-params";
import {
  allowsDiscards, RULES_PREFS_KEY, loadRulesPrefs,
  saveRulesPrefs, type RuleSelections,
} from "./rules";
import { seededRng } from "./rng";
import {
  holderOf, politicalFactionForPolygon, relationshipLine,
} from "./view";
import { defenseMaxOf as mapDefenseMax, factionAdjacencyOf, siteCapsOf, siteListsOf } from "./adjacency";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

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
const vassalStripes: { path: SVGPathElement; lord: string }[] = [];

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

/** Null unless the URL names a boot param, in which case every branch below
 *  reading it takes the testing path. See src/boot-params.ts. */
const boot = parseBootParams(window.location.search);

/** The host id an invite link carries, or null. Read here beside `boot`
 *  because the two are mutually exclusive: a join link must not also boot a
 *  rigged state, or the guest's staging screens would disagree with the
 *  snapshot the host is about to send. */
const joinId = new URLSearchParams(window.location.search).get("join");

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
/** The build the last game confirmed, seeding the build screen. A
 *  preference, like the rules - the meta progression retired with the
 *  defense-score design. */
let buildPref: Strategy = loadBuildPref(storage);
/** The rule picks the next game starts with. Loaded once and kept in sync
 *  with storage on every change; a booted page's memory storage was seeded
 *  from `rules=` above, so this needs no boot special case. */
let rulesPrefs: RuleSelections = loadRulesPrefs(storage);
let game: GameState = newGame(
  data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
  SITE_CAPS, DEFENSE_MAX,
);
if (boot !== null) {
  // Nothing here may render: `hud` does not exist yet, and a throw at module
  // scope would abort evaluation and leave a blank page with no menu and no
  // map - the one failure a test hook must not be able to cause. So the boot
  // is state-only, and a bad param falls back to the ordinary main menu.
  try {
    game = applyBootParams(game, boot, rng);
  } catch (err) {
    console.error("boot params ignored:", err);
  }
}
let armed: number | null = null; // hand index of the armed targeted card
/** The land an armed Raid will march out of, once the player has clicked it.
 *
 *  Raid is the one card aimed twice: an arrow has a tail as well as a head,
 *  and which of your lands the army leaves from is a real decision, because
 *  that is the land a counter-raid comes back at. Null means the first click
 *  is still to come and the map is lighting SOURCES; set means it is lighting
 *  the targets that source can reach. Cleared by `disarm` along with `armed`,
 *  so the two can never disagree about which step is live. */
let armedSource: string | null = null;
/** The Turnip harvest's rolled offer, cached from the first click on the
 *  card until any play commits. Cancelling the modal keeps it, so closing
 *  and reopening cannot fish for a better roll. */
let harvestRoll: string[] | null = null;
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
// True from a committed human action until the AI chain has resolved and the
// round summary (if any) is on screen. The hand is already inert in this
// window (renderHand disables it whenever it is not the human's turn), so
// this exists for the map and the menu buttons: nothing must act while the
// human's card is still flying or the AI is still resolving behind it.
let resolving = false;

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

/** Who decides this seat's turn. The AI chain runs on `ai` seats only, and
 *  `remote` is the one answer that locks this screen without ending the
 *  round: the other human is thinking. */
function controllerOf(seat: number): "local" | "remote" | "ai" {
  if (seat === localSeat) return "local";
  if (net.role === "host" && seat === net.guestSeat) return "remote";
  return "ai";
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
    return game.players[net.guestSeat]?.factionId === factionId
      ? (net.session?.guestName() ?? "Guest")
      : null;
  }
  if (net.role === "guest") {
    return game.players[HOST_SEAT]?.factionId === factionId
      ? (net.session?.hostName() ?? "Host")
      : null;
  }
  return null;
}

function localHuman() {
  return game.players[localSeat];
}

function isLocalTurn(): boolean {
  return game.phase === "playing" && game.current === localSeat;
}

function inPlay(): boolean {
  return (
    game.phase === "playing" ||
    game.phase === "victory" ||
    game.phase === "defeat"
  );
}

function humanPlayableSet() {
  const human = localHuman();
  return playableSet(viewOf(game), human.factionId, human.hand, {
    discards: allowsDiscards(game.rules),
  });
}

/** Why the human cannot play this card this turn, or null when they can. The
 *  gate on the click and the line on the hover come from this one call. */
function humanBlockReason(cardId: string) {
  const human = localHuman();
  if (!human) return null;
  return handBlockReason(viewOf(game), human.factionId, human.hand, cardId, {
    discards: allowsDiscards(game.rules),
  });
}

function discardMode(): boolean {
  return (
    isLocalTurn() &&
    !game.playedThisTurn &&
    humanPlayableSet().mode === "discard"
  );
}

/** `polygonFaction` is the land's OWN faction, not the resolved one - see
 *  relationshipLine in view.ts. */
function allegianceOf(
  polygonFaction: string,
  humanFaction: string,
): string | null {
  return relationshipLine(
    polygonFaction, humanFaction, game.overlords, game.incorporated,
    (id) => factionById.get(id)!.name,
  );
}

function effectiveFaction(f: string): string {
  return game.incorporated[f] ?? f;
}

function applyOwnership(): void {
  const human = localHuman();
  const humanOverlord = human ? game.overlords.get(human.factionId) : undefined;
  // `fullRealmOf`, the same count the scoreboard and the win condition apply. A
  // land a vassal annexed already sits inside the realm outline and wears the
  // stripes; shading it as somebody else's left one land of your own total
  // greyed out and outside the halo.
  const humanRealm =
    inPlay() && human
      ? fullRealmOf(human.factionId, game.overlords, game.incorporated)
      : new Set<string>();
  const overlordRealm =
    inPlay() && humanOverlord !== undefined
      ? fullRealmOf(humanOverlord, game.overlords, game.incorporated)
      : new Set<string>();
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective = inPlay() ? effectiveFaction(region.faction) : region.faction;
    el.setAttribute("fill", factionById.get(effective)!.color);
    const owned = humanRealm.has(region.faction);
    el.classList.toggle(
      "dimmed",
      inPlay() && !owned && !overlordRealm.has(region.faction),
    );
    el.classList.toggle("owned", owned);
    if (owned) {
      el.style.setProperty(
        "--owned-stroke",
        darkenColor(factionById.get(effective)!.color, 0.55),
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
  for (const [vassal, lord] of game.overlords) {
    for (const factionId of realmOf(vassal, game.overlords, game.incorporated)) {
      const regionId = regionByFaction.get(factionId);
      const region = regionId !== undefined ? regionById.get(regionId) : undefined;
      if (!region) continue;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", region.path);
      p.setAttribute("fill", `url(#vassal-stripes-${lord})`);
      p.setAttribute("pointer-events", "none");
      vassalOverlayGroup.appendChild(p);
      vassalStripes.push({ path: p, lord });
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
  for (const { path, lord } of vassalStripes) {
    const regionId = regionByFaction.get(lord);
    const el = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (el) path.style.opacity = getComputedStyle(el).opacity;
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
        .every((f) => f.id in game.incorporated);
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
    for (const factionId of game.factionIds) {
      const root = realmRootOf(factionId, game.overlords, game.incorporated);
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
/** A polygon's drawing anchor: the centre of its bounding box, in the map's
 *  own 1000x1400 user space.
 *
 *  Shared by the badge and the march arrows deliberately. Two anchors computed
 *  two ways would drift, and an arrow whose head lands somewhere other than
 *  the badge it is about is an arrow the player has to guess at. Undefined for
 *  a faction with no region, and zeros under happy-dom, where `getBBox` is a
 *  stub - which is why arrow GEOMETRY is tested against src/arrows.ts with
 *  injected points rather than through this. */
function regionCenter(factionId: string): { x: number; y: number } | undefined {
  const regionId = regionByFaction.get(factionId);
  const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
  if (!pathEl) return undefined;
  const bbox = pathEl.getBBox();
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function renderThreatBadges(): void {
  badgeGroup.replaceChildren();
  const human = localHuman();
  if (!inPlay() || !human) return;
  const v = viewOf(game);
  const targets = targetingLive() ? new Set(armedTargets()) : null;
  for (const factionId of game.factionIds) {
    if (factionId in game.incorporated && targets === null) {
      // An annexed polygon still has a defense score a card can hit, so it
      // keeps its badge while targeting narrows the map to it - but at rest
      // it is part of a realm, and a full-strength badge on every dead land
      // buries the live ones.
      const undamaged = defenseOf(v, factionId) >= defenseMaxOf(v, factionId);
      const noDisease = game.disease[factionId] === undefined;
      if (undamaged && noDisease) continue;
    }
    if (targets !== null && !targets.has(factionId)) continue;
    const centre = regionCenter(factionId);
    if (centre === undefined) continue;
    const { x: cx, y: cy } = centre;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("threat-badge");
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
    const respite = respiteExpiry(game, factionId);
    if (respite !== undefined) {
      appendCountdown(text, "R", respite - game.turn, "lead-respite");
    }
    g.appendChild(text);

    // The disease pips: one circle per stack, in the owner's colour, in
    // faction order so a seeded run draws deterministically. Public state,
    // per the design - counts live in the hover's disease block.
    const owners = game.disease[factionId];
    if (owners !== undefined) {
      let pip = 0;
      for (const owner of game.factionIds) {
        const stacks = owners[owner] ?? 0;
        for (let s = 0; s < stacks; s++) {
          const dot = document.createElementNS(
            "http://www.w3.org/2000/svg", "circle",
          );
          dot.classList.add("badge-pip");
          dot.setAttribute("r", "3.5");
          dot.setAttribute("cx", String(pip * 9));
          dot.setAttribute("cy", "14");
          dot.setAttribute("fill", factionById.get(owner)?.color ?? "#000");
          g.appendChild(dot);
          pip++;
        }
      }
    }
    // The army pips, above the number where the disease pips sit below it: a
    // hollow one is an army already out on a march and a filled one is an army
    // that can still be sent. Capped at ARMY_PIPS_SHOWN and then counted,
    // because Create army is uncapped and a land holding six would otherwise
    // grow a badge wider than the land it sits on.
    const stationed = armiesOn(game.armies, factionId);
    const free = freeArmiesOn(game.armies, game.marches, factionId);
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
    badgeGroup.appendChild(g);

    const textBox = text.getBBox();
    const pad = 6;
    rect.setAttribute("x", String(textBox.x - pad));
    rect.setAttribute("y", String(textBox.y - pad));
    rect.setAttribute("width", String(textBox.width + pad * 2));
    rect.setAttribute("height", String(textBox.height + pad * 2));
  }
}

/** Army pips drawn before the badge falls back to a count. Five is what fits
 *  beside the widest defense number without overhanging its box. */
const ARMY_PIPS_SHOWN = 5;

/** How far an arrow's ends are pulled in from the two region centres, so the
 *  shaft leaves the source's edge and the head bites the target's rather than
 *  both ends sitting under a badge. User space, like every other length here.
 *
 *  Capped at a share of the axis, because a march always runs between two
 *  NEIGHBOURING lands and their centres can be close together. A flat 34 at
 *  each end left a short axis about twenty units of arrow, which the head then
 *  ate: two small lands got a triangle between them rather than a spear
 *  pointing one way. */
const ARROW_INSET = 34;
const ARROW_INSET_SHARE = 0.2;

/** The head is pulled in less than the tail. The tail has to clear the town
 *  dot and its name; the head only has to stop short of the target's, and an
 *  arrow that gives up a fifth of the way out from where it is aimed reads as
 *  pointing at nothing in particular. */
const ARROW_HEAD_INSET_SHARE = 0.45;

function insetFor(length: number): number {
  return Math.min(ARROW_INSET, length * ARROW_INSET_SHARE);
}

/** Every town the map draws in each land, by faction id - the starting one and
 *  the locked sites alike. Deliberately not `sitesByFaction`, which drops the
 *  unlocked starting settlement because it answers a different question (where
 *  can this land still build). Here any real place will do. */
const townsByFaction = ((): Map<string, { x: number; y: number }[]> => {
  const out = new Map<string, { x: number; y: number }[]>();
  for (const s of data.settlements) {
    const faction = factionByRegion.get(s.land);
    if (faction === undefined) continue;
    out.set(faction, [...(out.get(faction) ?? []), { x: s.x, y: s.y }]);
  }
  return out;
})();

/** Where an arrow between two lands starts and ends: the closest pair of towns
 *  across the border, one in each land.
 *
 *  A bounding-box centre is not a place. These polygons are long and bent
 *  around coastline, so the centre of the box around one can sit in a bay -
 *  arrows were starting out at sea. A town is guaranteed to be inside its own
 *  land because the map drew it there, and taking the closest pair points the
 *  arrow along the border the two lands actually share instead of across
 *  whatever the boxes happened to line up.
 *
 *  Purely presentational: nothing in the rules knows about it. Falls back to
 *  the box centre for a land the map gave no town, and for the test
 *  environment, where `getBBox` is a stub anyway. */
function marchAnchors(
  from: string, to: string,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const fallbackFrom = regionCenter(from);
  const fallbackTo = regionCenter(to);
  if (fallbackFrom === undefined || fallbackTo === undefined) return null;
  const a = townsByFaction.get(from) ?? [];
  const b = townsByFaction.get(to) ?? [];
  if (a.length === 0 || b.length === 0) {
    return { from: fallbackFrom, to: fallbackTo };
  }
  let best = { from: a[0], to: b[0] };
  let bestDist = Number.POSITIVE_INFINITY;
  // In map order both ways, so a tie picks the same pair on every redraw.
  for (const p of a) {
    for (const q of b) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { from: p, to: q };
      }
    }
  }
  return best;
}

/** Gap between two arrows of the same bundle, wide enough that their barbs
 *  clear each other: a side may field several armies at once, and stacking
 *  them on one line would say "one attack" when there are three. */
const MAIN_GAP = 30;
const COUNTER_GAP = 20;

/** How much smaller the answering side is drawn, and the clear air between
 *  the two bundles. The counter is a reply to the attack, so it reads as the
 *  smaller shape beside it rather than an equal one nose to nose.
 *
 *  Length as well as width. Scaling only the widths made no visible
 *  difference: a spear's size on this map is mostly its LENGTH, which is the
 *  axis, and the axis is the same for both sides. The counter therefore runs
 *  only the last stretch toward its target - shorter, thinner, and plainly
 *  the answer to the arrow beside it. */
const COUNTER_SCALE = 0.62;
const COUNTER_LENGTH_SHARE = 0.62;
const COUNTER_CLEARANCE = 8;

/** One tapered spear per march in flight, plus the strength it carries.
 *
 *  Laid out per AXIS, not per march, because a quarrel has two sides and
 *  several armies may be on each. The side that opened is drawn full size
 *  centred on the line between the two lands; the side answering it is drawn
 *  smaller and clear of it, so which is the attack and which the counter is
 *  readable at a glance. Within each side the arrows fan out side by side -
 *  three armies marching the same way are three arrows, not one dark smear.
 *
 *  Rebuilt whole on every refresh, the `renderThreatBadges` shape: a march
 *  store this small is cheaper to redraw than to diff, and a stale arrow is a
 *  lie about what is coming. Colour says whose it is at a glance - red for one
 *  aimed into your realm, gold for one of yours, the attacker's own colour
 *  faded for a quarrel between two rivals.
 *
 *  Hidden entirely while a card is armed: targeting cues own the map then, the
 *  same rule `renderThreatBadges` and `renderRealmUnions` already follow. */
function renderMarchArrows(): void {
  arrowGroup.replaceChildren();
  const human = localHuman();
  if (!inPlay() || !human || targetingLive()) return;
  const realm = fullRealmOf(human.factionId, game.overlords, game.incorporated);
  for (const axis of axesOf(game.marches)) {
    const opening = axis.opening === "a" ? axis.fromA : axis.fromB;
    const answer = axis.opening === "a" ? axis.fromB : axis.fromA;
    // Half the width the opening bundle occupies, so the answer can be placed
    // clear of ALL of it rather than clear of one arrow.
    const openingHalf = ((opening.length - 1) / 2) * MAIN_GAP + SPEAR.headHalf;
    const answerBase =
      openingHalf + SPEAR.headHalf * COUNTER_SCALE + COUNTER_CLEARANCE;
    opening.forEach((m, i) => {
      drawMarch(m, ((i - (opening.length - 1) / 2) * MAIN_GAP), realm, 1, 1);
    });
    answer.forEach((m, i) => {
      // Negated: the answer runs the other way, so its own "left" is the
      // opening side's "right". Both bundles are measured in one world
      // direction, which is what keeps the counter consistently on one side.
      const within = (i - (answer.length - 1) / 2) * COUNTER_GAP;
      drawMarch(
        m, -(answerBase + within), realm, COUNTER_SCALE, COUNTER_LENGTH_SHARE,
      );
    });
  }
}

/** One arrow, `lateral` user-units to the left of its own direction of travel,
 *  at `scale` of full width and covering `lengthShare` of the axis - measured
 *  back from the head, so a shortened arrow still bites the same land. */
function drawMarch(
  m: March, lateral: number, realm: ReadonlySet<string>,
  scale: number, lengthShare: number,
): void {
  const anchors = marchAnchors(m.from, m.to);
  if (anchors === null) return;
  const { from, to } = anchors;
  const pull = insetFor(Math.hypot(to.x - from.x, to.y - from.y));
  const head = pull * ARROW_HEAD_INSET_SHARE;
  const usable = Math.hypot(to.x - from.x, to.y - from.y) - pull - head;
  const inset = insetSegment(
    from.x, from.y, to.x, to.y,
    pull + Math.max(0, usable) * (1 - lengthShare), head,
  );
  const seg = offsetSegment(inset.ax, inset.ay, inset.bx, inset.by, lateral);
  const opts = scale === 1 ? SPEAR : scaleSpear(SPEAR, scale);
  const points = spearPolygon(seg.ax, seg.ay, seg.bx, seg.by, opts);
  if (points === "") return;

  const against = realm.has(m.to);
  const ours = realm.has(m.from);
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.classList.add("march-arrow");
  // Against you first: an arrow between your own two lands cannot happen
  // (attackReach excludes what you hold outright, and a raid on your own
  // vassal IS aimed at your realm), so the order only decides how a lord's
  // raid on its own vassal reads - and that is an attack on your realm.
  g.classList.add(against ? "march-hostile" : ours ? "march-ours" : "march-other");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("points", points);
  if (!against && !ours) {
    poly.setAttribute("fill", factionById.get(m.actor)?.color ?? "#7a6a55");
  }
  g.appendChild(poly);

  // The strength, on the arrow. The player was promised source, target and
  // number when the arrow appeared; the number is the half they cannot read
  // off the map. On the shaft rather than above it, so a bundle's labels sit
  // apart exactly as far as its arrows do.
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.classList.add("march-strength");
  const mid = pointAlong(seg.ax, seg.ay, seg.bx, seg.by, 0.5);
  label.setAttribute("x", String(mid.x));
  label.setAttribute("y", String(mid.y));
  label.textContent = String(m.damage);
  g.appendChild(label);

  // An arrow you could answer right now is a button. Picking a source and a
  // target by hand to aim a counter back down an arrow already on the screen
  // is the game asking the player to restate something it can see, so the
  // arrow takes the click itself.
  const counterIndex = counterFor(m);
  if (counterIndex !== null) {
    g.classList.add("march-counterable");
    armArrowAsCounter(g, m, counterIndex);
  }
  arrowGroup.appendChild(g);
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
  if (!human || !isLocalTurn() || game.playedThisTurn || resolving) return null;
  if (pendingHarvest !== null || discardMode()) return null;
  const realm = fullRealmOf(human.factionId, game.overlords, game.incorporated);
  if (!realm.has(m.to) || realm.has(m.from)) return null;
  const v = viewOf(game);
  if (!marchSourcesAgainst(v, human.factionId, m.from).includes(m.to)) return null;
  const set = playableSet(v, human.factionId, human.hand, {
    discards: allowsDiscards(game.rules),
  });
  if (set.mode !== "play") return null;
  return set.cardIndexes.find((i) => human.hand[i] === "raid") ?? null;
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
    if (net.role === "guest") {
      sendGuestAction({
        type: "play", cardIndex, cardId: "raid",
        targetId: m.from, sourceId: m.to,
      });
      return;
    }
    game = playCard(game, cardIndex, rng, m.from, { sourceId: m.to });
    afterHumanPlay();
  });
}

/** How long a resolved march is shown before the map moves on. One number,
 *  handed to `runAnimation`, which reports back when it is actually over -
 *  never copied into a second timer. */
const CLASH_FLASH_MS = 1200;

/** Log entries whose resolutions have already been flashed. Advanced whenever
 *  the flash runs, and jumped to the end for a state this screen did not play
 *  into - a boot, or a guest's snapshot - so history is never replayed. */
let animatedLog = 0;

/** Show one march landing: a ghost of the arrow fading out, and over it the
 *  damage that actually got through.
 *
 *  The ghost is rebuilt from the event rather than kept alive from
 *  `game.marches`, which is already empty by the time this runs - the event
 *  carries both ends of the axis precisely so the picture can be redrawn from
 *  the log alone.
 *
 *  The arrow points from the winner's land at the loser's, so a counter that
 *  won is drawn pointing BACK - which is the whole story of the clash in one
 *  shape. The label reads what landed out of what was thrown: "-3/10" in red
 *  when it was your land, "+7/10" in green when it was theirs. */
function flashMarchResolution(
  e: GameEvent, realm: ReadonlySet<string>, onDone: () => void,
): void {
  // The same anchors the live arrow used, so the ghost fades out where the
  // arrow actually was rather than jumping to the middle of the two lands.
  const anchors = e.sourceFactionId !== undefined && e.targetFactionId !== undefined
    ? marchAnchors(e.sourceFactionId, e.targetFactionId)
    : null;
  if (anchors === null) {
    onDone();
    return;
  }
  const { from, to } = anchors;
  const pull = insetFor(Math.hypot(to.x - from.x, to.y - from.y));
  const seg = insetSegment(
    from.x, from.y, to.x, to.y, pull, pull * ARROW_HEAD_INSET_SHARE,
  );
  // A standoff has no loser, so it is neither your bad news nor your good.
  const standoff = e.amount === undefined;
  const struckUs = e.targetFactionId !== undefined && realm.has(e.targetFactionId);
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.classList.add(
    "clash-flash",
    standoff ? "clash-even" : struckUs ? "clash-bad" : "clash-good",
  );

  const points = spearPolygon(seg.ax, seg.ay, seg.bx, seg.by);
  if (points !== "") {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", points);
    poly.setAttribute(
      "fill", standoff ? "#6b5d49" : struckUs ? "#992f27" : "#d4af37",
    );
    poly.setAttribute("stroke", "#fdfaf4");
    poly.setAttribute("stroke-width", "1.2");
    g.appendChild(poly);
    runAnimation(poly, [{ opacity: 1 }, { opacity: 0 }], CLASH_FLASH_MS);
  }

  const amount = e.amount ?? 0;
  // Where the two forces met, biased toward the side that gave ground. With no
  // counter there is no meeting point, so the label sits near the head.
  const t = clashFraction(e.clash?.incoming ?? 1, e.clash?.counter ?? 0);
  const at = pointAlong(seg.ax, seg.ay, seg.bx, seg.by, t);
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.classList.add("clash-label");
  label.setAttribute("x", String(at.x));
  label.setAttribute("y", String(at.y));
  // The denominator is what a counter took off the top, so an uncontested
  // landing has none: there is nothing for the number to be a fraction OF.
  label.textContent = standoff
    ? `0/${e.clash?.incoming ?? 0}`
    : e.clash === undefined
      ? `${struckUs ? "-" : "+"}${amount}`
      : `${struckUs ? "-" : "+"}${amount}/${e.clash.incoming}`;
  g.appendChild(label);
  arrowGroup.appendChild(g);
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
      onDone();
    },
  );
}

/** Flash every march that landed since the last time this ran and touched the
 *  human's realm, then call back. Concurrent, not queued: marches that resolve
 *  in the same turn start resolve at the same moment, and showing them one
 *  after another would say otherwise. */
function flashResolutions(then: () => void): void {
  const fresh = game.log.slice(animatedLog);
  animatedLog = game.log.length;
  const human = localHuman();
  if (!human) {
    then();
    return;
  }
  const realm = fullRealmOf(human.factionId, game.overlords, game.incorporated);
  const mine = fresh.filter(
    (e) =>
      e.type === "march-resolved" &&
      ((e.targetFactionId !== undefined && realm.has(e.targetFactionId)) ||
        (e.sourceFactionId !== undefined && realm.has(e.sourceFactionId))),
  );
  if (mine.length === 0) {
    then();
    return;
  }
  let pending = mine.length;
  for (const e of mine) {
    flashMarchResolution(e, realm, () => {
      if (--pending === 0) then();
    });
  }
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
function hoverLines(region: Region): TooltipLine[] {
  const human = localHuman();
  // The land's OWN faction, never the politically resolved one: an absorbed
  // land keeps its name here and the line below says who took it.
  const lines: TooltipLine[] = [
    { text: `${region.name} (${factionById.get(region.faction)!.name})` },
  ];
  // Straight under the land's name, because "who is playing this" outranks
  // everything the rules have to say about it. A player name is plain text
  // and names no card or faction, so this line stays inside the naming rule.
  const otherHuman = playerNameOfFaction(region.faction);
  if (otherHuman !== null) lines.push({ text: `Played by ${otherHuman}` });
  if (!inPlay() || !human) return lines;
  const held = allegianceOf(region.faction, human.factionId);
  if (held !== null) lines.push({ text: held });
  // The same resolution `interceptClick` uses, or the lines below would answer
  // for a different faction than the click aims at on an absorbed land.
  const f = politicalFactionForPolygon(region.faction, game.incorporated);
  // The respite note: part of what the badge implies - "this faction can be
  // taken at the gate" - is temporarily false, and this says until when. On
  // the human's own land it is the one surface carrying the fact at all.
  lines.push(...respiteLines(game, human.factionId, f));
  // `region.faction`, not the resolved `f`: settlements belong to the land,
  // so an absorbed land must report its own count and not its absorber's.
  lines.push(...settlementBlock(viewOf(game), region.faction));
  // An armed card's preview aims at the POLYGON for attack and disease
  // cards, the resolved faction for the political ones - the same id the
  // click will commit.
  if (armed !== null) {
    const cardId = human.hand[armed];
    const aim = ATTACK_CARDS.has(cardId) || !CARDS[cardId]?.targeted ||
      cardId === "spread-disease" || cardId === "localized-outbreak" ||
      cardId === "hillfort"
        ? region.faction
        : f;
    lines.push(...targetImpactLines(
      viewOf(game), human.factionId, cardId, aim,
    ));
  }
  // The badge's numbers itemised: the score over its max and the two gate
  // lines. The polygon's own, like the settlements.
  lines.push(...defenseBreakdown(
    viewOf(game), region.faction, game.overlords.has(region.faction),
  ));
  lines.push(...diseaseBreakdown(
    viewOf(game), region.faction, (id) => factionById.get(id)?.name ?? id,
  ));
  return lines;
}

/** True while a click on the map means "aim here": an armed targeted card.
 *  Every surface that yields the map to targeting cues - the halo, the log
 *  dimming, the valid/invalid classes - asks this one predicate. */
function targetingLive(): boolean {
  return armed !== null;
}

/** Whether the armed card aims at POLYGONS (a land's own id, annexed or not)
 *  rather than at politically resolved factions. Attack, disease and heal
 *  cards hit polygons; Subjugate, Incorporate and Assassinate ruler aim at
 *  factions. One predicate, shared by the hover preview, the targeting
 *  classes and the click, so the three cannot resolve a click differently. */
function aimsAtPolygons(cardId: string): boolean {
  return ATTACK_CARDS.has(cardId) || cardId === "spread-disease" ||
    cardId === "localized-outbreak" || cardId === "hillfort";
}

/** Whether this card is aimed twice - source first, then target. Only Raid:
 *  Great raid assigns its own sources, and no other card sends an army. */
function needsSource(cardId: string): boolean {
  return cardId === "raid";
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
  const v = viewOf(game);
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
  // The one land a guest may not pick. Reuses the armed-card "you cannot aim
  // here" treatment rather than inventing a second vocabulary for the same
  // sentence - both mean "this click will do nothing".
  const takenByHost =
    net.role === "guest" && game.phase === "pick-faction" ? net.taken : null;
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    // A polygon card lights the polygon itself; a faction card lights every
    // land of the target's realm through the political resolution.
    const aim = polygonAim ? f : politicalFactionForPolygon(f, game.incorporated);
    const valid = live && targets.has(aim);
    el.classList.toggle("target-valid", valid);
    el.classList.toggle(
      "target-invalid", (live && !valid) || f === takenByHost,
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
    : politicalFactionForPolygon(pinnedRegion.faction, game.incorporated);
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
  // while targeting is live, it owns the map: a realm halo here would
  // outrank the valid/invalid cues and make blocked targets look clickable
  const members =
    region && inPlay() && !targetingLive()
      ? fullRealmOf(
          realmRootOf(region.faction, game.overlords, game.incorporated),
          game.overlords, game.incorporated,
        )
      : new Set<string>();
  // The polygon of the faction that holds the hovered land - who took it -
  // marked on its own, not its whole realm. Suppressed while targeting is
  // live, for the same reason the realm halo is.
  const holder =
    region && inPlay() && !targetingLive()
      ? holderOf(region.faction, game.overlords, game.incorporated)
      : null;
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    el.classList.toggle("realm-hover", members.has(f));
    el.classList.toggle("holder-hover", holder !== null && f === holder);
    el.classList.toggle(
      "vassal-hover",
      region !== null &&
        id === region.id &&
        game.overlords.has(region.faction) &&
        !(region.faction in game.incorporated),
    );
  }
  renderRealmHoverHalo(members);
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
  applyTargeting();
  hud.setArmed(null);
}

// --- the Turnip harvest flow: roll the offer, keep one or skip -------------

/** Opens (or re-opens) the offer modal for the harvest at `index`. Rolls
 *  once per cached roll - see `harvestRoll` - so closing and reopening
 *  cannot fish for a better offer. */
function openHarvestModal(index: number): void {
  const human = localHuman();
  harvestRoll ??= rollHarvestOffer(human, rng);
  pendingHarvest = { index };
  hud.showHarvestOffer(harvestRoll, {
    onPick(cardId) {
      commitHarvest(index, { cardId });
    },
    onSkip() {
      commitHarvest(index, { skip: true });
    },
    onCancel() {
      pendingHarvest = null;
      hud.hideHarvestUi();
    },
  });
}

/** The one exit of the flow that plays the card, so the teardown - overlay,
 *  cache - cannot be forgotten. A guest's pick rides the wire instead of
 *  resolving locally: the host is the only place a card is really played. */
function commitHarvest(index: number, choice: HarvestChoice): void {
  hud.hideHarvestUi();
  pendingHarvest = null;
  harvestRoll = null;
  if (net.role === "guest") {
    sendGuestAction({
      type: "play", cardIndex: index,
      cardId: localHuman().hand[index], harvest: choice,
    });
    return;
  }
  game = playCard(game, index, rng, undefined, { harvest: choice });
  afterHumanPlay();
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
  for (const [factionId, founded] of Object.entries(game.settlements)) {
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
    return { ...game, phase: guestPhaseView(game, net.faction) };
  }
  return game;
}

/** `opts` is handed straight to `hud.update`, so `{ animate: false }` paints
 *  a state as already-settled: no card flies and no round summary rises.
 *  Wanted for a state this screen did not play into - the boot path's first
 *  paint, and a guest's start or rejoin snapshot, which arrives as a whole
 *  game at once and would otherwise replay every card in its log. */
function refresh(opts?: { animate?: boolean }): void {
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
  hud.update(viewState(), opts);
  // The menu carries the panel; so does a network game that has lost its
  // session, or one whose lobby is still being filled in - the status line
  // is the only place either of those speaks.
  netPanel.setVisible(
    game.phase === "main-menu" ||
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

/** After a completed human action: advance, then run every AI turn back to
 *  back (each AI plays or discards; the loop stops on an ending phase).
 *
 *  The AI chain does not start until the human's played card has finished
 *  flying (`hud.afterPlayAnimation`) - resolving it on a bare `setTimeout(0)`
 *  used to put the round-summary modal over a card the player was still
 *  watching move. The human's own effect is revealed immediately below,
 *  while their card is still in the air: the card flies over the board it
 *  just changed, and the "before" of every summary line is then the number
 *  the player was looking at while it flew. Revealing the AI round early
 *  would make that "before" a lie. */
/** Runs AI seats back to back until a human-controlled seat - this screen's
 *  or the remote one's - is on turn or the run ends, then settles the
 *  screen. The host also pushes the settled state to the guest and says who
 *  it is waiting for; a remote seat holding the turn keeps input locked
 *  here, because the round has not finished, it has moved elsewhere. */
function resumeChain(): void {
  let iterations = 0;
  while (game.phase === "playing" && controllerOf(game.current) === "ai") {
    if (++iterations > 1000) {
      console.error("AI chain stalled - breaking");
      break;
    }
    game = advance(aiTakeTurn(game, rng), rng);
  }
  if (net.role === "host") net.session?.pushUpdate();
  const remoteHolds =
    game.phase === "playing" && controllerOf(game.current) === "remote";
  // Input stays locked through the clash flash. A march landing is the one
  // thing that moved while the player was not being shown a play, so it gets
  // its moment before the map is handed back - the same reason the AI chain
  // waits out the played card's flight.
  resolving = true;
  refresh();
  flashResolutions(() => {
    resolving = remoteHolds;
    refresh();
    updateWaitingStatus();
  });
}

function afterHumanAction(): void {
  // Any committed action invalidates the cached harvest roll: the play it
  // priced is no longer the next play. Cancelling a modal never comes here,
  // so the anti-fishing cache survives exactly the closes it should.
  harvestRoll = null;
  game = advance(game, rng);
  if (net.role === "host") net.session?.pushUpdate();
  refresh();
  if (game.phase !== "playing" || controllerOf(game.current) === "local") {
    // No AI chain behind this, so the flash is the only thing left to wait
    // for - the next seat is the player's own and its marches just landed.
    resolving = true;
    flashResolutions(() => {
      resolving = false;
      refresh();
      updateWaitingStatus();
    });
    return;
  }
  resolving = true;
  hud.afterPlayAnimation(() => {
    resumeChain();
  });
}

/** The status bar's "waiting for the other human" line. Only the host draws
 *  one: it is the seat it knows a name for. Everything between a guest's own
 *  turns is the host's whole world moving - several seats, several plays -
 *  and the activity log already says what each of them did. */
function updateWaitingStatus(): void {
  const remote =
    game.phase === "playing" && controllerOf(game.current) === "remote";
  if (remote && net.role === "host") {
    // The faction alone: the name beside it comes from `playerNameOf`, the
    // same hook that names it in the log and the scoreboard.
    hud.setWaiting(game.players[game.current].factionId);
    return;
  }
  hud.setWaiting(null);
}

/** After a completed human PLAY. An unlimited turn stays open: wait out the
 *  flight with input locked, then hand the turn back to the player rather
 *  than to the AI chain. A standard turn, a play that ended the run, or a
 *  play that emptied the hand (playCard closes the turn itself then) falls
 *  through to afterHumanAction as before. */
function afterHumanPlay(): void {
  harvestRoll = null; // see afterHumanAction; unlimited turns return early
  if (
    game.rules.turn === "unlimited" && game.phase === "playing" &&
    !game.playedThisTurn
  ) {
    resolving = true;
    // Nothing else will push this play: the turn stays open, so there is no
    // advance behind it and no AI chain to settle. Without this the guest
    // would not see the host's card until the whole turn finally ended.
    if (net.role === "host") net.session?.pushUpdate();
    refresh();
    hud.afterPlayAnimation(() => {
      resolving = false;
      refresh();
    });
    return;
  }
  afterHumanAction();
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
  // once the run has ended), but a stray call must not leave a stale
  // continuation armed against the fresh game that follows.
  resolving = false;
  game = startGame(newGame(
    data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
    SITE_CAPS, DEFENSE_MAX,
  ));
  clearFoundedSettlements();
  // The harvest flow must not outlive its run: the overlay itself hides
  // on the phase change, this is the state behind it.
  pendingHarvest = null;
  harvestRoll = null;
  disarm();
  // A pin must not outlive the run it was set in: the fresh game re-colours
  // every polygon, and the held highlight would describe the last one.
  interaction.deselect();
  deckScreen.update(deckScreenView(true));
  refresh();
}

const hud = createHud(
  app,
  {
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
    onSurrender() {
      // Ending the run is a host-seat privilege: the engine's endings pivot
      // on that seat, and a guest surrendering would have to end the host's
      // game too. The button is hidden from the guest as well (`.net-guest`
      // in style.css); this is the gate that does not depend on CSS.
      if (net.role === "guest") return;
      if (game.phase !== "playing" || resolving || pendingHarvest !== null) {
        return;
      }
      disarm();
      game = surrender(game);
      // The run is over for both of them, and this is the only push that
      // will ever carry that - nothing advances behind a surrender.
      if (net.role === "host") net.session?.pushUpdate();
      refresh();
    },
    onPlayCard(index) {
      if (
        !isLocalTurn() || game.playedThisTurn || resolving ||
        pendingHarvest !== null
      ) {
        return;
      }
      // Ahead of the harvest branch below, and gated on the role so it can
      // never swallow it: a guest holds no turnip-harvest (the injection is
      // humanSeat-gated, the same host-seat privilege the spec describes), and
      // this ordering makes that structural rather than incidental.
      if (net.role === "guest") {
        if (discardMode()) {
          disarm();
          sendGuestAction({
            type: "discard", cardIndex: index,
            cardId: localHuman().hand[index],
          });
          return;
        }
        const guestCard = CARDS[localHuman().hand[index]];
        if (guestCard?.targeted) {
          // Arming stays local - it is a question about this screen's map,
          // and only the answer, the commit, has to cross the wire.
          if (armed === index) {
            disarm();
            return;
          }
          armed = index;
          if (armedTargets().length === 0) {
            disarm();
            return;
          }
          applyTargeting();
          hud.setArmed(index, guestCard.name, armPrompt(guestCard.id));
          return;
        }
        disarm();
        sendGuestAction({
          type: "play", cardIndex: index, cardId: localHuman().hand[index],
        });
        return;
      }
      if (discardMode()) {
        disarm();
        game = discardCard(game, index);
        afterHumanAction();
        return;
      }
      const human = localHuman();
      if (human.hand[index] === "turnip-harvest") {
        // The harvest's pre-play choice, the targeting flow's shape: nothing
        // is committed until a boon (and its sub-pick) is settled.
        disarm();
        openHarvestModal(index);
        return;
      }
      const card = CARDS[human.hand[index]];
      if (card?.targeted) {
        if (armed === index) {
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
      game = playCard(game, index, rng);
      afterHumanPlay();
    },
    onEndTurn() {
      if (
        !isLocalTurn() || game.playedThisTurn || resolving ||
        pendingHarvest !== null
      ) {
        return;
      }
      if (game.rules.turn !== "unlimited") return;
      disarm();
      if (net.role === "guest") {
        sendGuestAction({ type: "end-turn" });
        return;
      }
      game = endTurn(game);
      afterHumanAction();
    },
    isResolving() {
      return resolving;
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
      const view = viewOf(game);
      return explainTargetEligibility(
        targetEligibilityFor(view, human.factionId, cardId),
        (id) => factionById.get(id)?.name ?? id,
        // A card that can fail must say so before it is aimed, on every target
        // that can fail, or the roll reads as a bug. Its own band in the tip,
        // not another annotation line: the two say opposite things.
        (id) => targetOddsLines(view, human.factionId, cardId, id),
        () => {
          if (!ATTACK_CARDS.has(cardId)) return [];
          // Quote the resolved damage, readings included - the same call
          // `playCard` resolves the attack with, so the number the player is
          // shown before aiming is the number they get.
          const { damage, multiplier } = attackDamageFor(
            view, human.factionId, cardId,
          );
          return [multiplier > 1
            ? `-${damage} defense (${multipliedWord(multiplier)})`
            : `-${damage} defense`];
        },
      );
    },
    cardRisk(cardId) {
      return cardRiskLine(cardId);
    },
    cardModifiers(cardId) {
      const human = localHuman();
      const lines = human
        ? cardModifierLines(game, human.factionId, cardId)
        : [];
      // What a Plague is worth right now rides with its modifiers: the
      // stacks are on the map, the sum is not.
      return human && cardId === "plague"
        ? [...plaguePreviewLines(viewOf(game), human.factionId), ...lines]
        : lines;
    },
    isDiscardMode() {
      return game.players.length > 0 && discardMode();
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
      return game.players[localSeat]?.id ?? 1;
    },
    playerNameOf(factionId) {
      return playerNameOfFaction(factionId);
    },
    onShowTip(lines, clientX, clientY) {
      tooltip.showLines(lines, clientX, clientY);
    },
    onHideTip() {
      tooltip.hide();
    },
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
  new Set(data.factions.filter((f) => f.placeName).map((f) => f.id)),
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
  onShowTip(lines, clientX, clientY) {
    tooltip.showLines(lines, clientX, clientY);
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
      game = chooseRules(game, rulesPrefs);
      game = chooseBuild(game, build);
      deckScreen.update(deckScreenView(false));
      netPanel.setStatus("Pick your land on the map.");
      refresh();
      return;
    }
    game = chooseRules(game, rulesPrefs);
    game = chooseBuild(game, build);
    deckScreen.update(deckScreenView(false));
    refresh();
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
    net.guestSeat !== null ? game.players[net.guestSeat].factionId : null;
  session = createHostSession(
    wire,
    {
      getGame: () => game,
      setGame: (g) => {
        game = g;
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
        if (!netStarted() && game.phase === "main-menu") startStagingRun();
        // A drop froze this screen (see onClosed); the rejoin thaws it back
        // to whatever the turn order actually says, which is the same rule
        // resumeChain settles on.
        resolving =
          game.phase === "playing" && controllerOf(game.current) === "remote";
        refresh();
        updateWaitingStatus();
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
        game = advance(game, rng);
        resumeChain();
      },
      onClosed() {
        // Not `net.role !== "host"` alone: a wire that died after its
        // replacement was live would otherwise null the session in force.
        if (net.role !== "host" || net.session !== session) return;
        net.session = null;
        // Nothing may act while the two sides cannot agree on what happened.
        resolving = game.phase === "playing";
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

/** Deals once both humans have picked. Every seat gets the same starting
 *  deck now, so the guest's pick carries only its BUILD: the deal rolls the
 *  guest's seat a strategy like any AI seat (keeping the rng draw count a
 *  frozen contract) and the chosen build is stamped over it after. */
function tryDeal(): void {
  if (net.role !== "host" || net.session === null) return;
  const pick = net.session.guestPick();
  if (net.hostPick === null || pick === null) return;
  if (game.phase !== "pick-faction") return;
  game = pickFaction(game, net.hostPick, rng);
  const guestSeat = seatOfFaction(game, pick.factionId);
  net.guestSeat = guestSeat;
  game = {
    ...game,
    players: game.players.map((p, i) =>
      i === guestSeat ? { ...p, strategy: pick.build } : p,
    ),
  };
  net.session.markStarted(pick.factionId);
  netPanel.setVisible(false);
  refresh();
  updateWaitingStatus();
}

/** The guest's move goes to the host, which is the only place a card is
 *  ever really played. The screen locks until the host answers with the
 *  state that followed - or refuses it, which unlocks without moving. */
function sendGuestAction(a: NetAction): void {
  if (net.role !== "guest" || net.session === null) return;
  resolving = true;
  refresh();
  net.session.sendAction(a);
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
      resolving = netStarted() && game.phase === "playing";
      // The staging screens are for a guest that arrived before the deal.
      // A rejoin mid-game must not walk them: the snapshot is the game, and
      // starting a local one here put the deck picker over the top of it.
      if (!netStarted() && game.phase === "main-menu") {
        game = startGame(game);
        deckScreen.update(deckScreenView(true));
      }
      refresh();
    },
    onLobby(info) {
      if (net.role !== "guest" || net.session !== session) return;
      // The host's rules are the game's rules - there is one engine and it
      // is theirs. The deck screen redraws so the picker shows them.
      rulesPrefs = info.rules;
      deckScreen.update(deckScreenView(game.phase === "deck-building"));
      net.taken = info.takenFactionId;
      if (info.takenFactionId !== null) {
        netPanel.setStatus("Host has picked their land.");
      }
      // The map has to show which land went, not just say that one did -
      // applyTargeting greys it. Cheap and safe at any phase: it is a class
      // toggle per polygon, and it reads `game.phase` itself.
      applyTargeting();
    },
    onState(g, fid, source) {
      if (net.role !== "guest" || net.session !== session) return;
      game = g;
      net.faction = fid;
      localSeat = Math.max(0, seatOfFaction(g, fid));
      resolving = false;
      netPanel.setVisible(false);
      // A whole game arriving at once - the deal, or a rejoin - is not a
      // state this screen played into, so it is painted already-settled:
      // an animating render flew every card in the log and dropped a round
      // summary over a game that had been running for twenty turns.
      // The local staging screens go with it; the snapshot IS the game.
      deckScreen.update(deckScreenView(false));
      // The hello could not know a snapshot was coming, so it left the lobby
      // line up. Correct it now: the panel is hidden here, but a later drop
      // shows it again and it must not be advertising the deck screen.
      netPanel.setStatus(`Playing with ${net.session?.hostName() ?? "the host"}.`);
      // The guest's run ends the same way its every other turn arrives - as a
      // message - so this is the ONLY route by which a finished game reaches
      // this screen. Without banking here a guest that closed the tab after a
      // full game kept none of its XP or turnips, and the postmortem's bar
      // derived the run's start from a lifetime total this run was missing
      // from. `runBanked` is still the once-per-run guard, so the several
      // updates an ending can arrive in bank once between them.
      // A snapshot is a whole game arriving at once, so its log is history,
      // not this screen's round: mark every march in it as already shown or
      // the guest would watch twenty turns of arrows land.
      if (source !== "update") animatedLog = game.log.length;
      refresh(source === "update" ? undefined : { animate: false });
      if (source === "update") flashResolutions(() => refresh());
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
      resolving = false;
      refresh();
    },
    onRefused(reason) {
      if (net.role !== "guest" || net.session !== session) return;
      netPanel.setStatus(reason);
    },
    onClosed() {
      // Not `net.role !== "guest"` alone - see attachHostWire's onClosed.
      if (net.role !== "guest" || net.session !== session) return;
      net.session = null;
      resolving = true; // nothing can act until the host is back
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
netPanel.setVisible(game.phase === "main-menu");

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

hud.update(game, { animate: boot === null });
// A boot that stopped short - an unknown faction id - leaves the phase at
// deck-building, whose screen is hidden from page load. Without this the
// page is a bare map with no way forward.
if (boot !== null) {
  deckScreen.update(deckScreenView(game.phase === "deck-building"));
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  // The harvest offer outranks everything while it holds input; its Escape
  // is the hud's own handler (the overlay is up), and the early return keeps
  // this one from also unpinning underneath it.
  if (pendingHarvest !== null) return;
  // An armed card goes first, so one Escape never both disarms and unpins.
  if (armed !== null) disarm();
  else if (pinnedRegion !== null) interaction.deselect();
});

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    if (region) tooltip.showLines(hoverLines(region), clientX, clientY);
    else tooltip.hide();
    hoveredRegion = region;
    applyHighlight(region, region?.faction ?? null);
  },
  onHoverSettlement(settlement, clientX, clientY) {
    if (settlement) {
      tooltip.show(settlementTooltipText(settlement), clientX, clientY);
    } else tooltip.hide();
  },
  onSelect(region) {
    pinnedRegion = region;
    hud.setPinned(pinnedFactionId());
    applyHighlight(region, region?.faction ?? null);
  },
  interceptClick(regionId) {
    if (resolving) return true; // swallow: no selection while the round resolves
    if (game.phase === "pick-faction") {
      if (regionId === null) return true;
      const picked = regionById.get(regionId)!.faction;
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
      game = pickFaction(game, picked, rng);
      refresh();
      return true;
    }
    if (game.phase === "playing" && armed !== null) {
      const idx = armed;
      const cardId = localHuman().hand[idx];
      const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
      // Raid's first click picks the tail, not the head. It commits nothing -
      // the card is still in hand, and clicking the same land again, or the
      // card again, backs out - so the step is safe to explore.
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
          : politicalFactionForPolygon(raw, game.incorporated);
      const valid = faction !== undefined && armedTargets().includes(faction);
      const sourceId = armedSource;
      disarm();
      if (valid) {
        if (net.role === "guest") {
          sendGuestAction({
            type: "play", cardIndex: idx,
            cardId, targetId: faction,
            ...(sourceId !== null ? { sourceId } : {}),
          });
        } else {
          game = playCard(game, idx, rng, faction, {
            ...(sourceId !== null ? { sourceId } : {}),
          });
          afterHumanPlay();
        }
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
if (boot !== null) refresh();
