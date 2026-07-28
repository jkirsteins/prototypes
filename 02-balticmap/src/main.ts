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
  isHumanTurn, viewOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { allianceActive, allianceKey, getRel, leadsOf, realmOf } from "./relations";
import {
  playableSet, validTargetsFor, targetEligibilityFor, SUBJUGATE_THRESHOLD,
} from "./playability";
import { explainTargetEligibility } from "./target-explanations";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import { createDeckScreen } from "./deck-screen";
import {
  buildPlayerDeck, loadMeta, memoryStorage, mergeSeen,
  resetMeta, saveMeta, unlockCard, type MetaRecord, type MetaStorage,
} from "./meta";
import { hoverRelationLines, politicalFactionForPolygon } from "./view";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const {
  svg, regionPaths, settlementDots, realmOutlineGroup, realmHoverGroup,
  vassalOverlayGroup, peopleLabels,
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
const factionAdjacency = Object.fromEntries(
  data.regions.map((r) => [
    r.faction,
    r.adjacent.map((id) => factionByRegion.get(id)!),
  ]),
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
let unlockUsedThisGame = false;
let seenMerged = false;
let poolAtRunStart: string[] = meta.seenPool;
let game: GameState = newGame(data.factions.map((f) => f.id), factionAdjacency);
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
  lines.push(relationshipLine(f, human.factionId));
  if (validTargetsFor(viewOf(game), human.factionId, "subjugate").includes(f)) {
    lines.push("Subjugate available");
  }
  return lines;
}

function relationshipLine(f: string, humanFaction: string): string {
  const owner = game.incorporated[f];
  const lord = game.overlords.get(f);
  if (owner === humanFaction) return "Part of your realm (incorporated)";
  if (owner !== undefined) return `Incorporated into ${factionById.get(owner)!.name}`;
  if (lord === humanFaction) return "Your vassal";
  if (game.overlords.get(humanFaction) === f) return "Your overlord";
  if (lord === undefined) return "Independent";
  return `Vassal of ${factionById.get(lord)!.name}`;
}

const panel = createPanel(
  app, () => interaction.deselect(), data.peoples, data.factions,
  data.settlements, relationsInfo,
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

/** From the human's perspective: "M0" when even, else signed e.g. "M+2"/"M-1". */
function formatLead(label: string, n: number): string {
  if (n === 0) return `${label}0`;
  return n > 0 ? `${label}+${n}` : `${label}${n}`;
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
  const grip = SUBJUGATE_THRESHOLD * humanRealm.size;
  for (const factionId of game.factionIds) {
    if (factionId in game.incorporated) continue; // dead (absorbed)
    if (humanRealm.has(factionId)) continue; // human, its vassals, its lands
    const l = leadsOf(game.relations, human.factionId, factionId);
    const allied = allianceActive(game, human.factionId, factionId);
    if (l.might === 0 && l.status === 0 && !allied) continue;
    const regionId = regionByFaction.get(factionId);
    const pathEl = regionId !== undefined ? regionPaths.get(regionId) : undefined;
    if (!pathEl) continue;
    const bbox = pathEl.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const danger = Math.max(-l.might, -l.status) >= grip;

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
    mightTspan.textContent = formatLead("M", l.might);
    text.appendChild(mightTspan);
    const statusTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    statusTspan.classList.add(leadClass(l.status));
    statusTspan.setAttribute("dx", "9");
    statusTspan.textContent = formatLead("S", l.status);
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
  const base: TooltipLine[] = tooltipText(
    region, factionById.get(region.faction)!,
  )
    .split("\n")
    .map((text) => ({ text }));
  if (!inPlay() || !human || f === human.factionId) return base;
  base.push(...hoverRelationLines(
    game.relations,
    human.factionId,
    f,
    relationshipLine(f, human.factionId),
  ));
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
}

/** Every polygon belonging to the hovered region's realm root (owner if
 *  incorporated, else that faction's overlord), including vassals' own
 *  incorporated holdings that `realmOf` alone would miss. No-op (all
 *  classes cleared) when there is no hover or the phase is not in play. */
function applyRealmHover(region: Region | null): void {
  const members = new Set<string>();
  if (region && inPlay()) {
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
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    el.classList.toggle("realm-hover", members.has(f));
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

function refresh(): void {
  applyOwnership();
  applyTargeting();
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
      game = startGame(newGame(data.factions.map((f) => f.id), factionAdjacency));
      cancelTribute();
      disarm();
      unlockUsedThisGame = false;
      seenMerged = false;
      poolAtRunStart = meta.seenPool;
      deckScreen.update(deckScreenView(true));
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
      return explainTargetEligibility(
        targetEligibilityFor(viewOf(game), human.factionId, cardId),
        (id) => factionById.get(id)?.name ?? id,
      );
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
);

function deckScreenView(visible: boolean) {
  return {
    visible,
    knownCards: meta.knownCards,
    seenPool: meta.seenPool,
    unlockUsed: unlockUsedThisGame,
  };
}

const deckScreen = createDeckScreen(app, {
  onUnlock(cardId) {
    if (unlockUsedThisGame) return;
    const next = unlockCard(meta, cardId);
    if (next === meta) return;
    meta = next;
    unlockUsedThisGame = true;
    saveMeta(storage, meta);
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

const interaction = attachInteraction(svg, regionPaths, settlementDots, data, {
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
