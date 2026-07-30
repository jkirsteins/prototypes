import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createPanel, createTooltip, tooltipText, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, chooseDeck, pickFaction, playCard, discardCard, advance,
  isHumanTurn, surrender, viewOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { allianceActive, allianceKey, getRel, leadsOf, realmOf } from "./relations";
import { rulerOf } from "./rulers";
import {
  playableSet, validTargetsFor, targetEligibilityFor, subjugationRequirement,
  gripPartsOn,
  borderStrength,
  raidYield,
} from "./playability";
import {
  cardModifierLines, explainTargetEligibility, targetOddsLines,
} from "./target-explanations";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import { createDeckScreen } from "./deck-screen";
import {
  buildPlayerDeck, loadMeta, memoryStorage, mergeSeen,
  resetMeta, saveMeta, unlockAllSeen, type MetaRecord, type MetaStorage,
} from "./meta";
import {
  barFor, formatLead, holderOf, hoverRelationLines, politicalFactionForPolygon,
  relationshipLine,
} from "./view";
import { factionAdjacencyOf } from "./adjacency";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const {
  svg, regionPaths, revealSettlement, clearFoundedSettlements,
  realmOutlineGroup, realmHoverGroup, vassalOverlayGroup, peopleLabels,
} = renderMap(data, app);

// map-render.ts doesn't expose a badge group; appended here, last in the SVG
// (after realm-outline/vassal-overlay, on top of the whole map stack).
const badgeGroup = document.createElementNS(
  "http://www.w3.org/2000/svg", "g",
) as SVGGElement;
badgeGroup.classList.add("threat-badges");
svg.appendChild(badgeGroup);
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
let seenMerged = false;
let poolAtRunStart: string[] = meta.seenPool;
/** Cards learned on the way into this deck screen, awaiting acknowledgement. */
let learnedToShow: string[] = [];
let game: GameState = newGame(
  data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
  SITE_LANDS,
);
let armed: number | null = null; // hand index of the armed targeted card
let pendingTribute: number | null = null; // hand index awaiting a track choice
let hoveredRegion: Region | null = null; // region under the cursor, for hover re-apply on refresh

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

function discardMode(): boolean {
  return (
    isHumanTurn(game) &&
    !game.playedThisTurn &&
    humanPlayableSet().mode === "discard"
  );
}

function relationsInfo(region: Region): string[] {
  const human = game.players[0];
  const f = politicalFactionForPolygon(region.faction, game.incorporated);
  if (!inPlay() || !human || f === human.factionId) return [];
  const mine = getRel(game.relations, human.factionId, f);
  const theirs = getRel(game.relations, f, human.factionId);
  const lines = [
    `Status: yours ${mine.status} / theirs ${theirs.status}`,
    `Might: yours ${mine.might} / theirs ${theirs.might}`,
  ];
  lines.push(allegianceOf(region.faction, human.factionId));
  const pact = allianceLine(f, human.factionId);
  if (pact !== null) lines.push(pact);
  if (validTargetsFor(viewOf(game), human.factionId, "subjugate").includes(f)) {
    lines.push("Subjugate available");
  }
  return lines;
}

/** `polygonFaction` is the land's OWN faction, not the resolved one - see
 *  relationshipLine in view.ts. */
function allegianceOf(polygonFaction: string, humanFaction: string): string {
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

const panel = createPanel(
  app, () => interaction.deselect(), data.peoples, data.factions,
  data.settlements, relationsInfo,
  (regionId) => {
    const faction = factionByRegion.get(regionId);
    return faction !== undefined && game.settled.includes(faction);
  },
);

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

function leadClass(n: number): string {
  return n > 0 ? "lead-good" : n < 0 ? "lead-bad" : "lead-even";
}

/** One badge per living faction outside the human's realm with a non-zero
 *  lead on either track, anchored at that faction's home region bbox. */
function renderThreatBadges(): void {
  badgeGroup.replaceChildren();
  const human = game.players[0];
  if (!inPlay() || !human) return;
  const humanRealm = new Set(
    realmOf(human.factionId, game.overlords, game.incorporated),
  );
  for (const factionId of game.factionIds) {
    if (factionId in game.incorporated) continue; // dead (absorbed)
    if (humanRealm.has(factionId)) continue; // human, its vassals, its lands
    const l = leadsOf(game.relations, human.factionId, factionId);
    const allied = allianceActive(game, human.factionId, factionId);
    if (l.might === 0 && l.status === 0 && !allied) continue;
    // The bars are asymmetric: yours counts their realm, theirs counts yours.
    // Each track is measured against the bar of whichever side leads it.
    const yourBar = subjugationRequirement(viewOf(game), human.factionId, factionId);
    const theirBar = subjugationRequirement(viewOf(game), factionId, human.factionId);
    const mightBar = barFor(l.might, yourBar, theirBar);
    const statusBar = barFor(l.status, yourBar, theirBar);
    // Danger is now guarded by the same rule that decides legality: a faction
    // that could never subjugate the human - one that is itself a vassal, or
    // the human's own overlord - has a null bar and stops being marked.
    const danger =
      theirBar !== null && Math.max(-l.might, -l.status) >= theirBar;
    const regionId = regionByFaction.get(factionId);
    const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!pathEl) continue;
    const bbox = pathEl.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("threat-badge");
    if (danger) g.classList.add("danger");
    g.setAttribute("transform", `translate(${cx}, ${cy})`);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("badge-bg");
    rect.setAttribute("rx", "4");
    g.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("badge-text");
    if (danger) {
      const bang = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      bang.classList.add("badge-danger-mark");
      bang.textContent = "! ";
      text.appendChild(bang);
    }
    const mightTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    mightTspan.classList.add(leadClass(l.might));
    mightTspan.textContent = formatLead("M", l.might, mightBar);
    text.appendChild(mightTspan);
    const statusTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    statusTspan.classList.add(leadClass(l.status));
    statusTspan.setAttribute("dx", "9");
    statusTspan.textContent = formatLead("S", l.status, statusBar);
    text.appendChild(statusTspan);
    if (allied) {
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

function hoverLines(region: Region): TooltipLine[] {
  const human = game.players[0];
  const f = politicalFactionForPolygon(region.faction, game.incorporated);
  // An absorbed land is named for the realm that holds it now - its own
  // faction is gone as a polity - with a line recording who it used to be.
  const ruling = inPlay() ? f : region.faction;
  const base: TooltipLine[] = tooltipText(region, factionById.get(ruling)!)
    .split("\n")
    .map((text) => ({ text }));
  if (ruling !== region.faction) {
    base.push({ text: `Formerly ${factionById.get(region.faction)!.name}` });
  }
  // Every faction has a ruler, including yours - the model is total, and a
  // faceless neighbour is harder to remember than a named one.
  if (inPlay()) base.push({ text: `Ruled by ${rulerOf(game.rulers, ruling).name}` });
  if (!inPlay() || !human || f === human.factionId) return base;
  base.push(...hoverRelationLines(
    game.relations,
    human.factionId,
    f,
    allegianceOf(region.faction, human.factionId),
    {
      yours: subjugationRequirement(viewOf(game), human.factionId, f),
      theirs: subjugationRequirement(viewOf(game), f, human.factionId),
      yoursFrom: gripPartsOn(viewOf(game), f),
      theirsFrom: gripPartsOn(viewOf(game), human.factionId),
    },
  ));
  const pact = allianceLine(f, human.factionId);
  if (pact !== null) base.push({ text: pact, tone: "good" });
  if (validTargetsFor(viewOf(game), human.factionId, "subjugate").includes(f)) {
    base.push({ text: "Subjugate available", tone: "good" });
  }
  return base;
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
  if (armed !== null) applyRealmHover(null); // targeting cues win the map
}

/** Every polygon belonging to the hovered region's realm root (owner if
 *  incorporated, else that faction's overlord), including vassals' own
 *  incorporated holdings that `realmOf` alone would miss. No-op (all
 *  classes cleared) when there is no hover or the phase is not in play. */
function applyRealmHover(region: Region | null): void {
  const members = new Set<string>();
  // while a card is armed, targeting owns the map: a realm halo here would
  // outrank the valid/invalid cues and make blocked targets look clickable
  if (region && inPlay() && armed === null) {
    let root = game.incorporated[region.faction] ?? region.faction;
    root = game.overlords.get(root) ?? root;
    for (const member of realmOf(root, game.overlords, game.incorporated)) {
      members.add(member);
    }
    for (const member of [...members]) {
      for (const [land, owner] of Object.entries(game.incorporated)) {
        if (owner === member) members.add(land);
      }
    }
  }
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

/** One outline around the hovered realm: the paths sit under the region
 *  fills, so only the realm's outer edge survives. */
function renderRealmHoverHalo(members: Set<string>): void {
  realmHoverGroup.replaceChildren();
  const human = game.players[0];
  realmHoverGroup.classList.toggle(
    "own", human !== undefined && members.has(human.factionId),
  );
  for (const factionId of members) {
    const regionId = regionByFaction.get(factionId);
    const region = regionId !== undefined ? regionById.get(regionId) : undefined;
    if (!region) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", region.path);
    p.setAttribute("pointer-events", "none");
    realmHoverGroup.appendChild(p);
  }
}

function disarm(): void {
  armed = null;
  applyTargeting();
  hud.setArmed(null);
}

function cancelTribute(): void {
  pendingTribute = null;
  hud.setTributePrompt(false);
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
  applyRealmHover(hoveredRegion);
}

/** Banks this run's seen cards into the persistent pool, once per run. */
function bankSeen(): void {
  if (seenMerged || game.players.length === 0) return;
  seenMerged = true;
  const next = mergeSeen(meta, game.seenThisRun);
  if (next !== meta) {
    meta = next;
    saveMeta(storage, meta);
  }
}

/** After a completed human action: advance, then run every AI turn back to
 *  back (each AI plays or discards; the loop stops on an ending phase). */
function afterHumanAction(): void {
  game = advance(game, rng);
  if (game.phase === "victory" || game.phase === "defeat") bankSeen();
  refresh();
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    let iterations = 0;
    while (game.phase === "playing" && !isHumanTurn(game)) {
      if (++iterations > 1000) {
        console.error("AI chain stalled - breaking");
        break;
      }
      game = advance(aiTakeTurn(game, rng), rng);
    }
    if (game.phase === "victory" || game.phase === "defeat") bankSeen();
    refresh();
  }, 0);
}

const hud = createHud(
  app,
  {
    onNewGame() {
      bankSeen();
      game = startGame(newGame(
        data.factions.map((f) => f.id), factionAdjacency, factionEthnicities,
        SITE_LANDS,
      ));
      clearFoundedSettlements();
      cancelTribute();
      disarm();
      seenMerged = false;
      poolAtRunStart = meta.seenPool;
      learnSeenCards();
      deckScreen.update(deckScreenView(true));
      refresh();
    },
    onSurrender() {
      if (game.phase !== "playing") return;
      disarm();
      cancelTribute();
      game = surrender(game);
      bankSeen();
      refresh();
    },
    onPlayCard(index) {
      if (!isHumanTurn(game) || game.playedThisTurn) return;
      cancelTribute();
      if (discardMode()) {
        disarm();
        game = discardCard(game, index);
        afterHumanAction();
        return;
      }
      const human = game.players[0];
      const cardId = human.hand[index];
      const card = CARDS[cardId];
      if (cardId === "pay-tribute") {
        disarm();
        pendingTribute = index;
        hud.setTributePrompt(true);
        return;
      }
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
    onTributeTrack(track) {
      if (pendingTribute === null) return;
      const index = pendingTribute;
      cancelTribute();
      game = playCard(game, index, rng, undefined, track);
      afterHumanAction();
    },
    canPlayCard(cardId) {
      const human = game.players[0];
      if (!human) return true;
      const set = humanPlayableSet();
      if (set.mode === "discard") return true;
      return set.cardIndexes.some((i) => human.hand[i] === cardId);
    },
    targetExplanations(cardId) {
      const human = game.players[0];
      if (!human || !CARDS[cardId]?.targeted) return [];
      const view = viewOf(game);
      const doubled = game.omens.includes(human.factionId);
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
          // before aiming has to be the number they get.
          const n = raidYield(borderStrength(view, human.factionId, id));
          return [
            ...odds,
            doubled ? `+${n * 2} Might (doubled)` : `+${n} Might`,
          ];
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
    lootInfo() {
      return game.seenThisRun
        .filter((id) => !meta.knownCards.includes(id))
        .map((id) => ({ id, isNew: !poolAtRunStart.includes(id) }));
    },
    ...(storageIsPersistent
      ? {
          onResetProgress() {
            meta = resetMeta(storage);
            poolAtRunStart = meta.seenPool;
            deckScreen.update(deckScreenView(game.phase === "deck-building"));
          },
        }
      : {}),
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
  new Set(data.factions.filter((f) => f.placeName).map((f) => f.id)),
);

function deckScreenView(visible: boolean) {
  return {
    visible,
    knownCards: meta.knownCards,
    seenPool: meta.seenPool,
    learned: learnedToShow,
  };
}

/** Learns everything witnessed in past runs, on the way into the deck screen,
 *  and records what to announce. Called at every entry to deck-building so a
 *  pool banked by any route (a loss, a surrender, a fresh New game) is cashed
 *  in before the player picks a deck. */
function learnSeenCards(): void {
  const { meta: next, learned } = unlockAllSeen(meta);
  if (learned.length === 0) return;
  meta = next;
  learnedToShow = learned;
  saveMeta(storage, meta);
}

const deckScreen = createDeckScreen(app, {
  onDismissLearned() {
    learnedToShow = [];
    deckScreen.update(deckScreenView(true));
  },
  onStart(selectedIds) {
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
    deckScreen.update(deckScreenView(false));
    refresh();
  },
});

hud.update(game);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (armed !== null) disarm();
  if (pendingTribute !== null) {
    cancelTribute();
    hud.update(game);
  }
});

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    if (region) tooltip.showLines(hoverLines(region), clientX, clientY);
    else tooltip.hide();
    hoveredRegion = region;
    applyRealmHover(region);
  },
  onHoverSettlement(settlement, clientX, clientY) {
    if (settlement) {
      tooltip.show(settlementTooltipText(settlement), clientX, clientY);
    } else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
  interceptClick(regionId) {
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
