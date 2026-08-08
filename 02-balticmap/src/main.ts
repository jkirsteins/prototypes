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
  discardCard, advance, isHumanTurn, surrender, viewOf, endTurn,
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
import { ACQUIRABLE_CARDS, CARDS } from "./cards";
import {
  empowerableCards, harvestChosenMightTargets, harvestEligibility,
  harvestIncorporateTargets, harvestSubjugateTargets, rollHarvestOptions,
  type HarvestChoice, type HarvestEffectId,
} from "./harvest";
import { createHud, LOG_PREFS_KEY } from "./hud";
import { createDeckScreen } from "./deck-screen";
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
/** The Turnip harvest flow's rolled effect ids, cached from the first click
 *  on the card until any play commits. Cancelling the modal keeps it, so
 *  closing and reopening cannot fish for a better roll; eligibility (and so
 *  what is greyed out) is re-derived on every open. */
let harvestRoll: HarvestEffectId[] | null = null;
/** Non-null while the harvest flow owns the input: the three-boon modal is
 *  up, the map is choosing a boon's target, or the empower picker is up.
 *  `index` is the harvest card's hand index, held so every step can commit
 *  the same play. */
let pendingHarvest:
  | { step: "modal"; index: number }
  | {
      step: "target";
      index: number;
      effect: "might-chosen" | "subjugate" | "incorporate";
      targets: string[];
    }
  | { step: "card"; index: number }
  | null = null;
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

function inPlay(): boolean {
  return (
    game.phase === "playing" ||
    game.phase === "victory" ||
    game.phase === "defeat"
  );
}

function humanPlayableSet() {
  const human = game.players[0];
  return playableSet(viewOf(game), human.factionId, human.hand, {
    discards: allowsDiscards(game.rules),
  });
}

/** Why the human cannot play this card this turn, or null when they can. The
 *  gate on the click and the line on the hover come from this one call. */
function humanBlockReason(cardId: string) {
  const human = game.players[0];
  if (!human) return null;
  return handBlockReason(viewOf(game), human.factionId, human.hand, cardId, {
    discards: allowsDiscards(game.rules),
  });
}

function discardMode(): boolean {
  return (
    isHumanTurn(game) &&
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
  const human = game.players[0];
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
  const human = game.players[0];
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
  const human = game.players[0];
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
  const human = game.players[0];
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
  const human = game.players[0];
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
  const human = game.players[0];
  // The land's OWN faction, never the politically resolved one: an absorbed
  // land keeps its name here and the line below says who took it.
  const lines: TooltipLine[] = [
    { text: `${region.name} (${factionById.get(region.faction)!.name})` },
  ];
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

/** True while a click on the map means "aim here": an armed targeted card,
 *  or a harvest boon choosing its target. Every surface that yields the map
 *  to targeting cues - the halo, the log dimming, the valid/invalid classes -
 *  asks this one predicate, so the two flows cannot diverge. */
function targetingLive(): boolean {
  return armed !== null || pendingHarvest?.step === "target";
}

function armedTargets(): string[] {
  const human = game.players[0];
  if (!human) return [];
  // The harvest boon's target set is the flow's own (frozen when the boon was
  // picked), not a card's validTargetsFor - the card itself is untargeted.
  if (pendingHarvest?.step === "target") return pendingHarvest.targets;
  if (armed === null) return [];
  return validTargetsFor(viewOf(game), human.factionId, human.hand[armed]);
}

function applyTargeting(): void {
  const targets = new Set(armedTargets());
  const live = targetingLive();
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    const political = politicalFactionForPolygon(f, game.incorporated);
    const valid = live && targets.has(political);
    el.classList.toggle("target-valid", valid);
    el.classList.toggle("target-invalid", live && !valid);
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
  const human = game.players[0];
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

// --- the Turnip harvest flow: roll, pick, sub-pick, commit -----------------

/** The acquirable cards the player actually owns - what the swap-known boon
 *  trades for. The one place meta touches the harvest; game.ts only ever
 *  sees the pool riding on the choice. */
function knownPool(): string[] {
  return meta.knownCards.filter((id) => ACQUIRABLE_CARDS.includes(id));
}

/** Opens (or re-opens) the three-boon modal for the harvest at `index`.
 *  Rolls once per cached roll - see `harvestRoll` - and re-derives
 *  eligibility every time, so a boon that has since died greys out rather
 *  than resolving on stale facts. */
function openHarvestModal(index: number): void {
  const human = game.players[0];
  const pool = knownPool();
  harvestRoll ??= rollHarvestOptions(viewOf(game), human, rng, pool)
    .map((o) => o.effect);
  const eligibility = harvestEligibility(viewOf(game), human, pool);
  const options = harvestRoll.map((id) => eligibility[id]);
  // The roll guaranteed a live slot at roll time and no play has happened
  // since (any commit clears the cache), so this swap is belt-and-braces
  // against an eligibility rule that moves between the two calls.
  if (!options.some((o) => o.eligible)) {
    options[2] = eligibility["wealth-1"];
  }
  pendingHarvest = { step: "modal", index };
  hud.showHarvestChoice(options, {
    onPick(effect) {
      pickHarvestBoon(index, effect);
    },
    onCancel() {
      pendingHarvest = null;
      hud.hideHarvestUi();
    },
  });
}

/** A boon was picked off the modal: simple boons commit at once, the rest
 *  step into their sub-pick - the map for a target, the picker for a card. */
function pickHarvestBoon(index: number, effect: HarvestEffectId): void {
  const human = game.players[0];
  switch (effect) {
    case "might-chosen":
    case "subjugate":
    case "incorporate": {
      const targets =
        effect === "might-chosen"
          ? harvestChosenMightTargets(viewOf(game), human.factionId)
          : effect === "subjugate"
            ? harvestSubjugateTargets(viewOf(game), human.factionId)
            : harvestIncorporateTargets(viewOf(game), human.factionId);
      pendingHarvest = { step: "target", index, effect, targets };
      hud.hideHarvestUi();
      // The armed-card cues, reused: armedTargets reads the frozen set above
      // while the harvest owns targeting, and the status line says what is
      // being aimed.
      applyTargeting();
      hud.setArmed(index, CARDS["turnip-harvest"].name);
      return;
    }
    case "empower": {
      pendingHarvest = { step: "card", index };
      hud.showCardPicker(empowerableCards(human), {
        onPick(cardId) {
          commitHarvest(index, { effect: "empower", cardId });
        },
        onCancel() {
          openHarvestModal(index);
        },
      });
      return;
    }
    case "swap-known":
      commitHarvest(index, { effect: "swap-known", pool: knownPool() });
      return;
    case "swap-common":
      commitHarvest(index, { effect: "swap-common" });
      return;
    case "might-random":
      commitHarvest(index, { effect: "might-random" });
      return;
    case "might-all":
      commitHarvest(index, { effect: "might-all" });
      return;
    case "wealth-1":
      commitHarvest(index, { effect: "wealth-1" });
      return;
    case "wealth-income":
      commitHarvest(index, { effect: "wealth-income" });
      return;
  }
}

/** The one exit of the flow that plays the card. Every step funnels here, so
 *  the teardown - overlay, cues, cache - cannot be forgotten by one of them. */
function commitHarvest(index: number, choice: HarvestChoice): void {
  hud.hideHarvestUi();
  hud.setArmed(null);
  pendingHarvest = null;
  harvestRoll = null;
  applyTargeting();
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

function refresh(): void {
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
  hud.update(game);
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
  meta = bankRun(meta, runXp(game.log), runTurnips(game.log));
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
function afterHumanAction(): void {
  // Any committed action invalidates the cached harvest roll: the play it
  // priced is no longer the next play. Cancelling a modal never comes here,
  // so the anti-fishing cache survives exactly the closes it should.
  harvestRoll = null;
  game = advance(game, rng);
  if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
  refresh();
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  resolving = true;
  hud.afterPlayAnimation(() => {
    let iterations = 0;
    while (game.phase === "playing" && !isHumanTurn(game)) {
      if (++iterations > 1000) {
        console.error("AI chain stalled - breaking");
        break;
      }
      game = advance(aiTakeTurn(game, rng), rng);
    }
    if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
    resolving = false;
    refresh();
  });
}

/** After a completed human PLAY. An unlimited turn stays open: wait out the
 *  flight with input locked, then hand the turn back to the player rather
 *  than to the AI chain. A standard turn - or a play that ended the run -
 *  falls through to afterHumanAction as before. */
function afterHumanPlay(): void {
  harvestRoll = null; // see afterHumanAction; unlimited turns return early
  if (game.rules.turn === "unlimited" && game.phase === "playing") {
    resolving = true;
    refresh();
    hud.afterPlayAnimation(() => {
      resolving = false;
      refresh();
    });
    return;
  }
  afterHumanAction();
}

const hud = createHud(
  app,
  {
    onNewGame() {
      bankRunProgress();
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
      // The harvest flow must not outlive its run: the overlay itself hides
      // on the phase change, this is the state behind it.
      pendingHarvest = null;
      harvestRoll = null;
      disarm();
      // A pin must not outlive the run it was set in: the fresh game re-colours
      // every polygon, and the held highlight would describe the last one.
      interaction.deselect();
      runBanked = false;
      packReveal = null;
      deckScreen.update(deckScreenView(true));
      refresh();
    },
    onSurrender() {
      if (game.phase !== "playing" || resolving || pendingHarvest !== null) {
        return;
      }
      disarm();
      game = surrender(game);
      bankRunProgress();
      refresh();
    },
    onPlayCard(index) {
      if (
        !isHumanTurn(game) || game.playedThisTurn || resolving ||
        pendingHarvest !== null
      ) {
        return;
      }
      if (discardMode()) {
        disarm();
        game = discardCard(game, index);
        afterHumanAction();
        return;
      }
      const human = game.players[0];
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
        hud.setArmed(index, card.name);
        return;
      }
      disarm();
      game = playCard(game, index, rng);
      afterHumanPlay();
    },
    onEndTurn() {
      if (
        !isHumanTurn(game) || game.playedThisTurn || resolving ||
        pendingHarvest !== null
      ) {
        return;
      }
      if (game.rules.turn !== "unlimited") return;
      disarm();
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
      const human = game.players[0];
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
      const human = game.players[0];
      const lines = human
        ? cardModifierLines(game, human.factionId, cardId)
        : [];
      // First, above the standing modifiers: the mark is the one thing the
      // glow on the card is asking about.
      return game.empoweredCardId === cardId
        ? ["Empowered - its next play resolves twice.", ...lines]
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
    game = chooseRules(game, rulesPrefs);
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
    deckScreen.update(deckScreenView(false));
    refresh();
  },
});

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
  // The harvest flow outranks everything: while it holds input, Escape steps
  // BACK - from a target pick to the modal - rather than falling through to
  // the disarm/unpin below. The modal and picker steps are handled by the
  // hud's own Escape handler (their overlay is up), so only the map step
  // acts here; the early return still keeps this Escape from also unpinning.
  if (pendingHarvest !== null) {
    if (pendingHarvest.step === "target") {
      hud.setArmed(null);
      openHarvestModal(pendingHarvest.index);
      applyTargeting();
    }
    return;
  }
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
      game = pickFaction(game, regionById.get(regionId)!.faction, rng);
      refresh();
      return true;
    }
    // Above the armed branch: while a harvest boon is aiming, the click is
    // its answer. A valid land commits the play; anything else steps back to
    // the modal, the armed-card disarm made recoverable.
    if (game.phase === "playing" && pendingHarvest?.step === "target") {
      const ph = pendingHarvest;
      const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
      const faction = raw === undefined
        ? undefined
        : politicalFactionForPolygon(raw, game.incorporated);
      if (faction !== undefined && ph.targets.includes(faction)) {
        const choice: HarvestChoice =
          ph.effect === "might-chosen"
            ? { effect: "might-chosen", targetId: faction }
            : ph.effect === "subjugate"
              ? { effect: "subjugate", targetId: faction }
              : { effect: "incorporate", targetId: faction };
        commitHarvest(ph.index, choice);
      } else {
        hud.setArmed(null);
        openHarvestModal(ph.index);
        applyTargeting();
      }
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
        game = playCard(game, idx, rng, faction);
        afterHumanPlay();
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
