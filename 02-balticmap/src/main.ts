import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createTooltip, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, chooseDeck, chooseRules, pickFaction, playCard,
  discardCard, advance, surrender, viewOf, endTurn,
  type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import {
  fullRealmOf, pactBetween, realmOf, realmRootOf,
} from "./relations";
import {
  allianceExpiry, handBlockReason, leadsIn, PACT_MIGHT_BONUS,
  pactBoostExpiriesOn, playableSet, respiteExpiry, seatOf,
  validTargetsFor, targetEligibilityFor, subjugationRaceFor, raidGainFor,
} from "./playability";
import { count } from "./plural";
import {
  cardBlockLine, cardModifierLines, cardRiskLine, explainTargetEligibility,
  multipliedWord, pactBoostLines, respiteLines, settlementBlock, targetImpactLines,
  targetOddsLines, subjugationBreakdown,
} from "./target-explanations";
import { ACQUIRABLE_CARDS, buildAiDeck, CARDS } from "./cards";
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
  applyPack, bankRun, buildPlayerDeck, collectedCount, loadMeta,
  memoryStorage, pendingPacks, resetMeta, saveMeta,
  type MetaRecord, type MetaStorage,
} from "./meta";
import {
  applyBootMeta, applyBootParams, parseBootParams,
} from "./boot-params";
import {
  allowsDiscards, RULES_PREFS_KEY, loadRulesPrefs, saveRulesPrefs,
  type RuleSelections,
} from "./rules";
import { seededRng } from "./rng";
import { untilTurn } from "./timed";
import { runTurnips, runXp } from "./xp";
import { openPack } from "./packs";
import {
  formatLead, holderOf, leadClass, politicalFactionForPolygon, relationshipLine,
  restiveVassalOf, seatHolderOf,
} from "./view";
import { factionAdjacencyOf, siteCapsOf, siteListsOf } from "./adjacency";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const {
  svg, regionPaths, revealSettlement, clearFoundedSettlements,
  realmOutlineGroup, realmUnionGroup, realmHoverGroup, realmEdgeGroup,
  vassalOverlayGroup, seatGroup, peopleLabels, outerOutline, outsideMask,
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

// map-render.ts doesn't expose a badge group; appended here, last in the SVG
// (after realm-outline/vassal-overlay, on top of the whole map stack).
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
const { storage, storageIsPersistent } = ((): {
  storage: MetaStorage;
  storageIsPersistent: boolean;
} => {
  // A booted run is sealed off from real progress in both directions: it must
  // not bank XP into the player's record, and it must not inherit whichever
  // cards this browser profile happens to have unlocked, or the same URL would
  // deal a different deck on a different machine. The probe below is skipped
  // rather than run-and-discarded because the probe itself writes.
  //
  // `storageIsPersistent` is reported as the probe would have found it, not
  // forced: it only decides whether the menu carries a "Reset progress"
  // button, and a booted page must show the DOM production shows.
  if (boot !== null) {
    const mem = memoryStorage();
    if (boot.popups !== null) {
      mem.setItem(LOG_PREFS_KEY, JSON.stringify({ showPopups: boot.popups }));
    }
    if (boot.rules !== null) {
      mem.setItem(RULES_PREFS_KEY, JSON.stringify(boot.rules));
    }
    return { storage: mem, storageIsPersistent: true };
  }
  try {
    const probe = "balticmap-meta-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, storageIsPersistent: true };
  } catch {
    return { storage: memoryStorage(), storageIsPersistent: false };
  }
})();
let meta: MetaRecord = boot === null ? loadMeta(storage) : applyBootMeta(boot);
/** The rule picks the next game starts with. Loaded once and kept in sync
 *  with storage on every change; a booted page's memory storage was seeded
 *  from `rules=` above, so this needs no boot special case. */
let rulesPrefs: RuleSelections = loadRulesPrefs(storage);
let runBanked = false;
/** The pack currently revealed on the deck screen, or null when none is open.
 *  A fresh array per pack: the deck screen compares identity to decide whether
 *  to replay the reveal animation. */
let packReveal: { id: string; isNew: boolean }[] | null = null;
let game: GameState = newGame(
  data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
  SITE_CAPS,
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
      /** The deck the guest confirmed, until the host deals with it. */
      deckCards: string[] | null;
      /** The guest's faction, set by the start snapshot. */
      faction: string | null;
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
    // The host is seat 0 in every dealt game - pickFaction seats the
    // picking player first and the guest's seat is one of the others.
    return game.players[0]?.factionId === factionId
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

/** The pact line, when one binds the human and this faction. Names the Might it
 *  is buying as well as the truce: the bonus is a term in every lead on screen
 *  (see `leadsIn`), and a player who could not see where it came from would read
 *  their own badges as a mystery. */
function allianceLine(f: string, humanFaction: string): string | null {
  if (!inPlay()) return null;
  const until = allianceExpiry(game, humanFaction, f);
  if (until === undefined) return null;
  const shared = pactBetween(game, humanFaction, f)?.against.length ?? 0;
  const bonus =
    shared === 0
      ? ""
      : `, +${PACT_MIGHT_BONUS} Might for you both against ${count(shared, "shared neighbour")}`;
  return `Allied ${untilTurn(until)} - no hostile cards between you${bonus}`;
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
    applyThreat(el, region.faction, human?.factionId, humanRealm);
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

/** A keep silhouette, 14x14 around the origin: three merlons over a solid
 *  body. A SHAPE, deliberately not another circle, so a seat can never be
 *  read as a settlement dot. Full opacity always, like the threat badges and
 *  unlike the vassal stripes: seats are public knowledge and the marker is
 *  UI chrome, not terrain - synced to a dimmed rival land it vanished at
 *  map rest, which contradicted the design's "the map says who sits
 *  where". */
const SEAT_GLYPH_D =
  "M-7,7 V-7 H-4.2 V-4.2 H-1.4 V-7 H1.4 V-4.2 H4.2 V-7 H7 V7 Z";

/** One marker per standing seat, the player's in its own class. Clear and
 *  redraw per refresh like the threat badges - seats move mid-game. Offset
 *  above the region's centre so the badge that renders AT the centre never
 *  sits on top of it. `pointer-events: none` comes from the CSS on the
 *  group, the vassal-overlay precedent, so the marker never steals the
 *  land's hover or click. */
function renderSeatMarkers(): void {
  seatGroup.replaceChildren();
  const human = localHuman();
  if (!inPlay() || !human) return;
  const v = viewOf(game);
  for (const owner of Object.keys(game.seats)) {
    const land = seatOf(v, owner);
    if (land === undefined) continue;
    const regionId = regionByFaction.get(land);
    const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!pathEl) continue;
    const bbox = pathEl.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("seat-marker");
    if (owner === human.factionId) g.classList.add("seat-mine");
    g.setAttribute("transform", `translate(${cx}, ${cy - 20})`);
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "path");
    glyph.setAttribute("d", SEAT_GLYPH_D);
    // A rival's keep wears its OWNER's colour, not the land's: a seat planted
    // on annexed land belongs to the conqueror, and the dark casing (CSS) is
    // what keeps it legible over a fill already in that colour. The player's
    // own keep takes its gold from the CSS class instead.
    if (owner !== human.factionId) {
      const colour = factionById.get(owner)?.color;
      if (colour !== undefined) glyph.style.fill = colour;
    }
    g.appendChild(glyph);
    seatGroup.appendChild(g);
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

function applyThreat(
  el: SVGPathElement,
  faction: string,
  humanFaction: string | undefined,
  humanRealm: Set<string>,
): void {
  let threat = 0;
  let advantage = false;
  if (
    inPlay() &&
    humanFaction !== undefined &&
    !humanRealm.has(faction) &&
    !(faction in game.incorporated)
  ) {
    const theirs = leadsIn(game, faction, humanFaction);
    const yours = leadsIn(game, humanFaction, faction);
    threat = Math.min(3, Math.max(0, theirs));
    advantage = theirs <= 0 && yours >= 1;
  }
  el.classList.toggle("threat-1", threat === 1);
  el.classList.toggle("threat-2", threat === 2);
  el.classList.toggle("threat-3", threat === 3);
  el.classList.toggle("advantage", advantage);
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

/** `restiveVassalOf` bound to the live game - the badge and the hover both ask
 *  it, and neither should have to assemble the arguments. */
function unrestOf(factionId: string): boolean {
  const human = localHuman();
  if (!human || !inPlay()) return false;
  return restiveVassalOf(
    factionId, human.factionId, game.overlords, viewOf(game).liveRevolts,
  );
}

/** One countdown tspan on a badge: a timed status's letter and the turns it
 *  has left, in that status's colour. Every timed status the badge counts
 *  down (a pact's A, a respite's R) goes through here, so they all share the
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

/** One badge per living faction outside the human's realm with a non-zero
 *  lead on either track, anchored at that faction's home region bbox.
 *
 *  While a card is armed the board narrows to what the card can be aimed at:
 *  badges survive only on the legal targets. A lead over a land this card
 *  cannot touch is not information the player needs while choosing, and it
 *  floats at full contrast above a polygon the targeting cues have deliberately
 *  greyed out - which reads as a live option rather than an excluded one. */
function renderThreatBadges(): void {
  badgeGroup.replaceChildren();
  const human = localHuman();
  if (!inPlay() || !human) return;
  // The full realm, like applyOwnership: a grand-vassal sits inside the human
  // realm's outline, and a badge floating on a land the outline claims reads
  // as a contradiction. Restive DIRECT vassals keep their unrest badge via
  // `restive` below, and while a card is armed `targets` re-narrows to what
  // is legal - so a poachable grand-vassal still badges when it matters.
  const humanRealm = fullRealmOf(
    human.factionId, game.overlords, game.incorporated,
  );
  const targets = armed === null ? null : new Set(armedTargets());
  for (const factionId of game.factionIds) {
    if (factionId in game.incorporated) continue; // dead (absorbed)
    // The one thing inside your own realm worth a badge. A vassal that has sown
    // its Revolt is holding a live card that ends your overlordship whenever it
    // surfaces, and until now the only word of it was a single modal on the
    // turn it was sown - which a muted player never saw at all. Every other
    // land of your realm stays badgeless: there is nothing to race there.
    const restive = unrestOf(factionId);
    if (humanRealm.has(factionId) && !restive) continue;
    if (targets !== null && !targets.has(factionId)) continue;
    // Both tracks, both directions and the danger mark in one call, so the
    // badge and the hover breakdown cannot quote different numbers.
    const race = subjugationRaceFor(viewOf(game), human.factionId, factionId);
    if (race.quiet && !restive) continue;
    const regionId = regionByFaction.get(factionId);
    const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!pathEl) continue;
    const bbox = pathEl.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("threat-badge");
    if (race.danger) g.classList.add("danger");
    if (restive) g.classList.add("restive");
    g.setAttribute("transform", `translate(${cx}, ${cy})`);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("badge-bg");
    rect.setAttribute("rx", "4");
    g.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("badge-text");
    if (race.danger) {
      const bang = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      bang.classList.add("badge-danger-mark");
      bang.textContent = "! ";
      text.appendChild(bang);
    }
    // Two bangs, not one, and its own colour: "!" already means a rival can
    // take YOU now, and this is the opposite direction - something of yours is
    // about to be taken. A doubled mark reads as louder rather than as a
    // different scale, which is right; they are the same size of bad news.
    if (restive) {
      const mark = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      mark.classList.add("badge-unrest-mark");
      mark.textContent = "!!";
      text.appendChild(mark);
    }
    // A restive vassal of yours has no race to show - you cannot subjugate what
    // you already hold - so the mark stands alone rather than beside a pair of
    // dashes. Any land you DO have a race with keeps its numbers.
    if (!race.quiet) {
      const mightTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      mightTspan.classList.add(leadClass(race.lead));
      // A live pact of yours is a term inside this figure, so the value wears
      // amber over its sign colour - the badge-level echo of the hover's amber
      // note, and the same gate, so the mark never appears where the hover
      // would not explain it.
      if (pactBoostExpiriesOn(game, human.factionId, factionId).length > 0) {
        mightTspan.classList.add("lead-boosted");
      }
      if (restive) mightTspan.setAttribute("dx", "9");
      mightTspan.textContent = formatLead("M", race.lead, race.bar);
      text.appendChild(mightTspan);
    }
    if (race.allied) {
      const expiry = allianceExpiry(game, human.factionId, factionId) ?? game.turn;
      appendCountdown(text, "A", expiry - game.turn, "lead-ally");
    }
    // A faction under its post-escape respite cannot be subjugated, so the
    // race its numbers describe is paused: the countdown says for how long,
    // the same treatment the pact's A gives an equally illegal attack.
    const respite = respiteExpiry(game, factionId);
    if (respite !== undefined) {
      appendCountdown(text, "R", respite - game.turn, "lead-respite");
    }
    g.appendChild(text);
    badgeGroup.appendChild(g);

    const textBox = text.getBBox();
    const pad = 6;
    rect.setAttribute("x", String(textBox.x - pad));
    rect.setAttribute("y", String(textBox.y - pad));
    rect.setAttribute("width", String(textBox.width + pad * 2));
    rect.setAttribute("height", String(textBox.height + pad * 2));
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
  // Straight after "Your vassal", because it is the rest of that sentence. The
  // card is not named: this line is plain text, and a card name the player
  // cannot point at is the inert kind AGENTS.md warns about - "a revolt" as an
  // ordinary English word says the same thing and reads better.
  if (unrestOf(region.faction)) {
    lines.push({
      text: "On the verge of revolt: it holds the card and can play it any turn",
      tone: "bad",
    });
  }
  // The seat only ever stands on a land its owner holds outright, so "this
  // realm" is already named by the lines above - no faction name needed,
  // which is what keeps this plain-text line inside the naming rule.
  const seatOwner = seatHolderOf(viewOf(game), region.faction);
  if (seatOwner !== null) {
    lines.push(
      seatOwner === human.factionId
        ? { text: "Your ruler's seat stands here.", tone: "good" }
        : { text: "The ruler's seat of this realm stands here." },
    );
  }
  // The same resolution `interceptClick` uses, or the lines below would answer
  // for a different faction than the click aims at on an absorbed land.
  const f = politicalFactionForPolygon(region.faction, game.incorporated);
  // The pact line is back now that the hover speaks with no card armed: without
  // it the breakdown reads as a plan you could act on against a faction you
  // cannot legally touch for another five turns.
  const pact = allianceLine(f, human.factionId);
  if (pact !== null) lines.push({ text: pact, tone: "good" });
  // A shared neighbour of a live pact instead gets the amber note: part of the
  // lead on their badge is temporary, and this says until when. Without it the
  // pact term is invisible wherever it does not change the sign - a boosted 0
  // reads as no bonus at all.
  lines.push(...pactBoostLines(game, human.factionId, f));
  // The respite note rides beside the pact note for the same reason: part of
  // what the bars imply - "this faction can be taken" - is temporarily false,
  // and this says until when. On the human's own land it is the one surface
  // carrying the fact at all, since their realm draws no badge.
  lines.push(...respiteLines(game, human.factionId, f));
  // `region.faction`, not the resolved `f`: settlements belong to the land, so
  // an absorbed land must report its own count and not its absorber's. First of
  // the blocks, so the sentence-shaped lines above stay one group.
  lines.push(...settlementBlock(viewOf(game), region.faction));
  const breakdown = subjugationBreakdown(viewOf(game), human.factionId, f);
  if (armed !== null) {
    lines.push(...targetImpactLines(
      viewOf(game), human.factionId, human.hand[armed], f, breakdown.length > 0,
    ));
  }
  lines.push(...breakdown);
  return lines;
}

function armedTargets(): string[] {
  const human = localHuman();
  if (armed === null || !human) return [];
  return validTargetsFor(viewOf(game), human.factionId, human.hand[armed]);
}

function applyTargeting(): void {
  const targets = new Set(armedTargets());
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    const political = politicalFactionForPolygon(f, game.incorporated);
    const valid = armed !== null && targets.has(political);
    el.classList.toggle("target-valid", valid);
    el.classList.toggle("target-invalid", armed !== null && !valid);
  }
  // Targeting cues win the map while armed - applyHighlight suppresses itself
  // then. Disarming lands here too, and brings the pin, or the live hover, back.
  applyHighlight(hoveredRegion, hoveredRegion?.faction ?? null);
  // Arming and disarming both land here without a full refresh, and the badges
  // and the always-on realm outlines are part of the targeting picture - see
  // renderThreatBadges and renderRealmUnions.
  renderThreatBadges();
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
  // The same suppression applyRealmHover applies to the map: while a card is
  // armed the targeting cues own the screen, and a log dimmed to some faction
  // the player is only passing over would be reading as part of that.
  hud.highlightFaction(inPlay() && armed === null ? factionId : null);
}

/** Every polygon belonging to the hovered region's realm root (owner if
 *  incorporated, else that faction's overlord), including vassals' own
 *  incorporated holdings that `realmOf` alone would miss. No-op (all
 *  classes cleared) when there is no hover or the phase is not in play. */
function applyRealmHover(region: Region | null): void {
  // while a card is armed, targeting owns the map: a realm halo here would
  // outrank the valid/invalid cues and make blocked targets look clickable
  const members =
    region && inPlay() && armed === null
      ? fullRealmOf(
          realmRootOf(region.faction, game.overlords, game.incorporated),
          game.overlords, game.incorporated,
        )
      : new Set<string>();
  // The polygon of the faction that holds the hovered land - who took it -
  // marked on its own, not its whole realm. Suppressed while a card is armed,
  // for the same reason the realm halo is.
  const holder =
    region && inPlay() && armed === null
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
  applyTargeting();
  hud.setArmed(null);
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
  renderSeatMarkers();
  renderThreatBadges();
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

/** Banks this run's XP and turnips into the persistent record, once per run.
 *  Both totals are derived from the log rather than carried on state, so this
 *  is the only place progress is written and it cannot double-count. */
function bankRunProgress(): void {
  if (runBanked || game.players.length === 0) return;
  runBanked = true;
  const me = localHuman();
  meta = bankRun(
    meta,
    runXp(game.log, me?.id ?? 1),
    runTurnips(game.log, me?.id ?? 1),
  );
  saveMeta(storage, meta);
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
  if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
  if (net.role === "host") net.session?.pushUpdate();
  resolving =
    game.phase === "playing" && controllerOf(game.current) === "remote";
  refresh();
  updateWaitingStatus();
}

function afterHumanAction(): void {
  game = advance(game, rng);
  if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
  if (net.role === "host") net.session?.pushUpdate();
  refresh();
  if (game.phase !== "playing" || controllerOf(game.current) === "local") {
    updateWaitingStatus();
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
    hud.setWaiting(
      game.players[game.current].factionId,
      net.session?.guestName() ?? undefined,
    );
    return;
  }
  hud.setWaiting(null);
}

/** After a completed human PLAY. An unlimited turn stays open: wait out the
 *  flight with input locked, then hand the turn back to the player rather
 *  than to the AI chain. A standard turn - or a play that ended the run -
 *  falls through to afterHumanAction as before. */
function afterHumanPlay(): void {
  if (game.rules.turn === "unlimited" && game.phase === "playing") {
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
    SITE_CAPS,
  ));
  clearFoundedSettlements();
  disarm();
  // A pin must not outlive the run it was set in: the fresh game re-colours
  // every polygon, and the held highlight would describe the last one.
  interaction.deselect();
  runBanked = false;
  packReveal = null;
  deckScreen.update(deckScreenView(true));
  refresh();
}

const hud = createHud(
  app,
  {
    onNewGame() {
      bankRunProgress();
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
      if (game.phase !== "playing" || resolving) return;
      disarm();
      game = surrender(game);
      bankRunProgress();
      // The run is over for both of them, and this is the only push that
      // will ever carry that - nothing advances behind a surrender.
      if (net.role === "host") net.session?.pushUpdate();
      refresh();
    },
    onPlayCard(index) {
      if (!isLocalTurn() || game.playedThisTurn || resolving) return;
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
          hud.setArmed(index, guestCard.name);
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
        hud.setArmed(index, card.name);
        return;
      }
      disarm();
      game = playCard(game, index, rng);
      afterHumanPlay();
    },
    onEndTurn() {
      if (!isLocalTurn() || game.playedThisTurn || resolving) return;
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
        (id) => {
          if (cardId !== "raid") return [];
          // Quote the convex yield, not the border count: the two diverge fast
          // (a 5-land border is worth 15), and the number the player is shown
          // before aiming has to be the number they get - which is why it comes
          // from the same call `playCard` resolves the raid with.
          const { gain, multiplier } = raidGainFor(view, human.factionId, id);
          return [multiplier > 1
            ? `+${gain} Might (${multipliedWord(multiplier)})`
            : `+${gain} Might`];
        },
      );
    },
    cardRisk(cardId) {
      return cardRiskLine(cardId);
    },
    cardModifiers(cardId) {
      const human = localHuman();
      return human ? cardModifierLines(game, human.factionId, cardId) : [];
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
    // Read after bankRunProgress() has folded this run in - the postmortem
    // only ever renders on an ended run, and every route that ends one banks
    // before refreshing. The bar derives the run's start from this minus the
    // run's own XP, so there is no second counter to drift.
    lifetimeXp() {
      return meta.xp;
    },
    // Named packsWaiting rather than pendingPacks so the callback cannot be
    // confused with the imported function it wraps.
    packsWaiting() {
      return pendingPacks(meta);
    },
    onShowTip(lines, clientX, clientY) {
      tooltip.showLines(lines, clientX, clientY);
    },
    onHideTip() {
      tooltip.hide();
    },
    ...(storageIsPersistent
      ? {
          onResetProgress() {
            meta = resetMeta(storage);
            packReveal = null;
            deckScreen.update(deckScreenView(game.phase === "deck-building"));
          },
        }
      : {}),
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
  new Set(data.factions.filter((f) => f.placeName).map((f) => f.id)),
  storage,
);

function deckScreenView(visible: boolean) {
  return {
    visible,
    knownCards: meta.knownCards,
    collected: collectedCount(meta),
    pendingPacks: pendingPacks(meta),
    reveal: packReveal,
    savedPicks: meta.lastPicks,
    rules: rulesPrefs,
  };
}

const deckScreen = createDeckScreen(app, {
  onShowTip(lines, clientX, clientY) {
    tooltip.showLines(lines, clientX, clientY);
  },
  onHideTip() {
    tooltip.hide();
  },
  onOpenPack() {
    if (pendingPacks(meta) === 0 || packReveal !== null) return;
    const drawn = openPack(ACQUIRABLE_CARDS, rng, {
      packIndex: meta.packsOpened,
      unknownIds: ACQUIRABLE_CARDS.filter((id) => !meta.knownCards.includes(id)),
    });
    const { meta: next, results } = applyPack(meta, drawn);
    meta = next;
    packReveal = results;
    saveMeta(storage, meta);
    deckScreen.update(deckScreenView(true));
  },
  onDismissReveal() {
    packReveal = null;
    deckScreen.update(deckScreenView(true));
  },
  onRulesChange(next) {
    rulesPrefs = next;
    saveRulesPrefs(storage, rulesPrefs);
    deckScreen.update(deckScreenView(true));
  },
  onStart(selectedIds) {
    // A pack still waiting is the screen's own business - it hides the deck
    // builder - but guard anyway so a stray call cannot skip the reveal.
    if (pendingPacks(meta) > 0 || packReveal !== null) return;
    // Remember the loadout on confirm rather than on every toggle: what is
    // worth restoring is the deck actually played, and it is one write a run.
    // This hands the screen a fresh array, so it re-seeds from it next time it
    // is shown - with the very picks it just reported, which is a no-op.
    meta = { ...meta, lastPicks: [...selectedIds] };
    saveMeta(storage, meta);
    if (net.role === "guest") {
      // The deck the host will deal this seat from, held until the map click
      // names the land it belongs to. The local transitions below it are a
      // staging area only - they carry the guest to the faction-pick screen,
      // and the host's start snapshot replaces every one of them.
      net.deckCards = buildPlayerDeck(meta.knownCards, selectedIds);
      game = chooseRules(game, rulesPrefs);
      game = chooseDeck(game, net.deckCards);
      deckScreen.update(deckScreenView(false));
      netPanel.setStatus("Pick your land on the map.");
      refresh();
      return;
    }
    game = chooseRules(game, rulesPrefs);
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
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

/** Deals once both humans have picked. The guest's deck rides in through
 *  pickFaction's `aiDeckFor` override: its seat is built from the deck the
 *  guest chose out of its own collection, and every other seat from the
 *  ordinary AI deck. */
function tryDeal(): void {
  if (net.role !== "host" || net.session === null) return;
  const pick = net.session.guestPick();
  if (net.hostPick === null || pick === null) return;
  if (game.phase !== "pick-faction") return;
  game = pickFaction(game, net.hostPick, rng, (r, fid) =>
    fid === pick.factionId ? pick.deck : buildAiDeck(r),
  );
  net.guestSeat = seatOfFaction(game, pick.factionId);
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
  if (net.deckCards === null) return;
  net.session.sendPick(net.deckCards, fid);
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
    deckCards: prev?.deckCards ?? null, faction: prev?.faction ?? null,
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
      if (info.takenFactionId !== null) {
        netPanel.setStatus("Host has picked their land.");
      }
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
      refresh(source === "update" ? undefined : { animate: false });
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
  storage,
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

// A run booted straight into an ending never passed through the code paths
// that bank it, and the postmortem's XP bar would animate up from zero.
if (boot !== null && (game.phase === "victory" || game.phase === "defeat")) {
  bankRunProgress();
}
hud.update(game, { animate: boot === null });
// A boot that stopped short - an unknown faction id, a deck of card ids that
// do not exist - leaves the phase at deck-building, whose screen is hidden
// from page load. Without this the page is a bare map with no way forward.
if (boot !== null) {
  deckScreen.update(deckScreenView(game.phase === "deck-building"));
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
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
        guestPickFaction(picked);
        return true;
      }
      game = pickFaction(game, picked, rng);
      refresh();
      return true;
    }
    if (game.phase === "playing" && armed !== null) {
      const idx = armed;
      const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
      const faction = raw === undefined
        ? undefined
        : politicalFactionForPolygon(raw, game.incorporated);
      const valid = faction !== undefined && armedTargets().includes(faction);
      disarm();
      if (valid) {
        if (net.role === "guest") {
          sendGuestAction({
            type: "play", cardIndex: idx,
            cardId: localHuman().hand[idx], targetId: faction,
          });
        } else {
          game = playCard(game, idx, rng, faction);
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
