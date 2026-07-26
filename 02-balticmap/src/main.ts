import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createPanel, createTooltip, tooltipText, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, discardCard, advance,
  isHumanTurn, viewOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { getRel, leadsOf, realmOf } from "./relations";
import { playableSet, validTargetsFor } from "./playability";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots, realmOutlineGroup } = renderMap(data, app);
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
let game: GameState = newGame(data.factions.map((f) => f.id), factionAdjacency);
let armed: number | null = null; // hand index of the armed targeted card
let pendingTribute: number | null = null; // hand index awaiting a track choice

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
  if (!inPlay() || !human || region.faction === human.factionId) return [];
  const f = region.faction;
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

function effectiveFaction(regionFaction: string): string {
  const owner = game.incorporated[regionFaction];
  if (owner !== undefined) return game.overlords.get(owner) ?? owner;
  return game.overlords.get(regionFaction) ?? regionFaction;
}

function applyOwnership(): void {
  const human = game.players[0];
  const humanRealm = new Set(
    inPlay() && human
      ? realmOf(human.factionId, game.overlords, game.incorporated)
      : [],
  );
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective = inPlay() ? effectiveFaction(region.faction) : region.faction;
    el.setAttribute("fill", factionById.get(effective)!.color);
    const owned = humanRealm.has(region.faction);
    el.classList.toggle("dimmed", inPlay() && !owned);
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

function hoverLines(region: Region): TooltipLine[] {
  const human = game.players[0];
  const base: TooltipLine[] = tooltipText(
    region, factionById.get(region.faction)!,
  )
    .split("\n")
    .map((text) => ({ text }));
  if (!inPlay() || !human || region.faction === human.factionId) return base;
  const f = region.faction;
  const delta = (label: string, n: number): TooltipLine =>
    n > 0
      ? { text: `${label}: +${n} (you lead)`, tone: "good" }
      : n < 0
        ? { text: `${label}: ${n} (they lead)`, tone: "bad" }
        : { text: `${label}: even`, tone: "neutral" };
  const yours = leadsOf(game.relations, human.factionId, f);
  base.push(delta("Might", yours.might), delta("Status", yours.status));
  base.push({ text: relationshipLine(f, human.factionId) });
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
  const targets = new Set(armedTargets().map((f) => regionByFaction.get(f)!));
  for (const [id, el] of regionPaths) {
    el.classList.toggle("target-valid", armed !== null && targets.has(id));
    el.classList.toggle("target-invalid", armed !== null && !targets.has(id));
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
  hud.update(game);
}

/** After a completed human action: advance, then run every AI turn back to
 *  back (each AI plays or discards; the loop stops on an ending phase). */
function afterHumanAction(): void {
  game = advance(game, rng);
  refresh();
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    while (game.phase === "playing" && !isHumanTurn(game)) {
      game = advance(aiTakeTurn(game, rng), rng);
    }
    refresh();
  }, 0);
}

const hud = createHud(
  app,
  {
    onNewGame() {
      game = startGame(newGame(data.factions.map((f) => f.id), factionAdjacency));
      armed = null;
      pendingTribute = null;
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
    isDiscardMode() {
      return game.players.length > 0 && discardMode();
    },
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
);
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
      const faction = regionId !== null ? factionByRegion.get(regionId) : undefined;
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
