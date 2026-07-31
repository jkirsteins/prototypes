import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createTooltip, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, chooseDeck, pickFaction, playCard, discardCard, advance,
  isHumanTurn, surrender, viewOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import {
  allianceActive, allianceKey, fullRealmOf, leadsOf, realmOf, realmRootOf,
} from "./relations";
import {
  handBlockReason, playableSet, validTargetsFor, targetEligibilityFor,
  subjugationRaceFor, raidGainFor,
} from "./playability";
import {
  cardBlockLine, cardModifierLines, explainTargetEligibility, targetImpactLines,
  targetOddsLines, subjugationBreakdown,
} from "./target-explanations";
import { ACQUIRABLE_CARDS, CARDS } from "./cards";
import { createHud } from "./hud";
import { createDeckScreen } from "./deck-screen";
import {
  applyPack, bankRun, buildPlayerDeck, collectedCount, loadMeta, memoryStorage,
  pendingPacks, resetMeta, saveMeta, type MetaRecord, type MetaStorage,
} from "./meta";
import { runTurnips, runXp } from "./xp";
import { openPack } from "./packs";
import {
  formatLead, holderOf, leadClass, politicalFactionForPolygon, relationshipLine,
} from "./view";
import { factionAdjacencyOf } from "./adjacency";
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
const realmEdgeObserver = new MutationObserver(() => syncRealmEdges());

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
/** The one further site each land can settle: its locked settlement, if the
 *  land has one. Lands with no spare slot have none and can never be built in,
 *  which is exactly what `sites` tells the rules.
 *
 *  Keyed by FACTION id, not region id. Every land has one faction and every
 *  faction one land, but the two id spaces are different words ("ugandi" the
 *  land, "ugandians" the faction) and the rules speak faction ids throughout.
 *  Keying this by `settlement.land` made the card permanently unplayable, since
 *  no region id is ever a member of a realm. */
const siteByFaction = new Map(
  data.settlements
    .filter((s) => !s.unlocked)
    .flatMap((s) => {
      const faction = factionByRegion.get(s.land);
      return faction === undefined ? [] : [[faction, s] as const];
    }),
);
const SITE_LANDS = [...siteByFaction.keys()];
const factionAdjacency = factionAdjacencyOf(data);
const factionEthnicities: Record<string, string> = Object.fromEntries(
  data.factions.map((f) => [f.id, f.ethnicity]),
);

const rng = Math.random;
const { storage, storageIsPersistent } = ((): {
  storage: MetaStorage;
  storageIsPersistent: boolean;
} => {
  try {
    const probe = "balticmap-meta-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, storageIsPersistent: true };
  } catch {
    return { storage: memoryStorage(), storageIsPersistent: false };
  }
})();
let meta: MetaRecord = loadMeta(storage);
let runBanked = false;
/** The pack currently revealed on the deck screen, or null when none is open.
 *  A fresh array per pack: the deck screen compares identity to decide whether
 *  to replay the reveal animation. */
let packReveal: { id: string; isNew: boolean }[] | null = null;
let game: GameState = newGame(
  data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
  SITE_LANDS,
);
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

function inPlay(): boolean {
  return (
    game.phase === "playing" ||
    game.phase === "victory" ||
    game.phase === "defeat"
  );
}

function humanPlayableSet() {
  const human = game.players[0];
  return playableSet(viewOf(game), human.factionId, human.hand);
}

/** Why the human cannot play this card this turn, or null when they can. The
 *  gate on the click and the line on the hover come from this one call. */
function humanBlockReason(cardId: string) {
  const human = game.players[0];
  if (!human) return null;
  return handBlockReason(viewOf(game), human.factionId, human.hand, cardId);
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

/** The pact line, when one binds the human and this faction. */
function allianceLine(f: string, humanFaction: string): string | null {
  if (!inPlay() || !allianceActive(game, humanFaction, f)) return null;
  const until = game.alliances[allianceKey(humanFaction, f)];
  return `Allied until turn ${until} - no hostile cards between you`;
}

function effectiveFaction(f: string): string {
  return game.incorporated[f] ?? f;
}

function applyOwnership(): void {
  const human = game.players[0];
  const humanOverlord = human ? game.overlords.get(human.factionId) : undefined;
  const humanRealm = new Set(
    inPlay() && human
      ? realmOf(human.factionId, game.overlords, game.incorporated)
      : [],
  );
  const overlordRealm = new Set(
    inPlay() && humanOverlord !== undefined
      ? realmOf(humanOverlord, game.overlords, game.incorporated)
      : [],
  );
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
    }
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
    const theirs = leadsOf(game.relations, faction, humanFaction);
    const yours = leadsOf(game.relations, humanFaction, faction);
    const theirBest = Math.max(theirs.status, theirs.might);
    const yourBest = Math.max(yours.status, yours.might);
    threat = Math.min(3, Math.max(0, theirBest));
    advantage = theirBest <= 0 && yourBest >= 1;
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
  const humanRealm = new Set(
    realmOf(human.factionId, game.overlords, game.incorporated),
  );
  const targets = armed === null ? null : new Set(armedTargets());
  for (const factionId of game.factionIds) {
    if (factionId in game.incorporated) continue; // dead (absorbed)
    if (humanRealm.has(factionId)) continue; // human, its vassals, its lands
    if (targets !== null && !targets.has(factionId)) continue;
    // Both tracks, both directions and the danger mark in one call, so the
    // badge and the hover breakdown cannot quote different numbers.
    const race = subjugationRaceFor(viewOf(game), human.factionId, factionId);
    if (race.quiet) continue;
    const regionId = regionByFaction.get(factionId);
    const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!pathEl) continue;
    const bbox = pathEl.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("threat-badge");
    if (race.danger) g.classList.add("danger");
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
    const mightTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    mightTspan.classList.add(leadClass(race.might.lead));
    mightTspan.textContent = formatLead("M", race.might.lead, race.might.bar);
    text.appendChild(mightTspan);
    const statusTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    statusTspan.classList.add(leadClass(race.status.lead));
    statusTspan.setAttribute("dx", "9");
    statusTspan.textContent = formatLead("S", race.status.lead, race.status.bar);
    text.appendChild(statusTspan);
    if (race.allied) {
      const turnsLeft = game.alliances[allianceKey(human.factionId, factionId)] - game.turn;
      const allyTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      allyTspan.classList.add("lead-ally");
      allyTspan.setAttribute("dx", "9");
      allyTspan.textContent = `A${turnsLeft}`;
      text.appendChild(allyTspan);
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
 *  between you, what an armed card would do here, and where the Subjugate bars
 *  on its badge come from.
 *
 *  Everything else the game knows about a land has a home already - population,
 *  cohesion, ruler and settlements are on the click-through panel - and a hover
 *  that recited all of it was seven lines wide and answered no question anybody
 *  was asking. The bar breakdown is the exception that rule allows: the badge
 *  puts a "/6" on the map and nothing else on screen says what builds it. It is
 *  gated on the badge showing that denominator, so it answers the question the
 *  badge raises and appears nowhere else. */
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
  // The same resolution `interceptClick` uses, or the lines below would answer
  // for a different faction than the click aims at on an absorbed land.
  const f = politicalFactionForPolygon(region.faction, game.incorporated);
  // The pact line is back now that the hover speaks with no card armed: without
  // it the breakdown reads as a plan you could act on against a faction you
  // cannot legally touch for another five turns.
  const pact = allianceLine(f, human.factionId);
  if (pact !== null) lines.push({ text: pact, tone: "good" });
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
  const human = game.players[0];
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
    factionId = pinnedRegion.faction;
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

/** Draws the dot for every settlement founded so far, from state, on every
 *  refresh. The map itself is rendered once per page load, so starting a new
 *  game clears the previous game's settlements first. */
function revealFoundedSettlements(): void {
  for (const factionId of game.settled) {
    const site = siteByFaction.get(factionId);
    if (site !== undefined) revealSettlement(site);
  }
}

function refresh(): void {
  applyOwnership();
  applyTargeting();
  revealFoundedSettlements();
  renderThreatBadges();
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
        SITE_LANDS,
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
    },
    onSurrender() {
      if (game.phase !== "playing" || resolving) return;
      disarm();
      game = surrender(game);
      bankRunProgress();
      refresh();
    },
    onPlayCard(index) {
      if (!isHumanTurn(game) || game.playedThisTurn || resolving) return;
      if (discardMode()) {
        disarm();
        game = discardCard(game, index);
        afterHumanAction();
        return;
      }
      const human = game.players[0];
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
      afterHumanAction();
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
        (id) => {
          // Odds first: a card that can fail must say so before it is aimed,
          // on every target that can fail, or the roll reads as a bug.
          const odds = targetOddsLines(view, human.factionId, cardId, id);
          if (cardId !== "raid") return odds;
          // Quote the convex yield, not the border count: the two diverge fast
          // (a 5-land border is worth 15), and the number the player is shown
          // before aiming has to be the number they get - which is why it comes
          // from the same call `playCard` resolves the raid with.
          const { gain, doubled } = raidGainFor(view, human.factionId, id);
          return [...odds, doubled ? `+${gain} Might (doubled)` : `+${gain} Might`];
        },
      );
    },
    cardModifiers(cardId) {
      const human = game.players[0];
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
    // Read after bankRunProgress() has folded this run in - the postmortem
    // only ever renders on an ended run, and every route that ends one banks
    // before refreshing. The bar derives the run's start from this minus the
    // run's own XP, so there is no second counter to drift.
    lifetimeXp() {
      return meta.xp;
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
  };
}

const deckScreen = createDeckScreen(app, {
  onOpenPack() {
    if (pendingPacks(meta) === 0 || packReveal !== null) return;
    const drawn = openPack(ACQUIRABLE_CARDS, rng);
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
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
    deckScreen.update(deckScreenView(false));
    refresh();
  },
});

hud.update(game);

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
    hud.setPinned(region?.faction ?? null);
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
        afterHumanAction();
      }
      return true;
    }
    return false;
  },
});
