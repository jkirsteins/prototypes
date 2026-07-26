import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor } from "./map-render";
import { createPanel, createTooltip, tooltipText, settlementTooltipText } from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, endTurn, isHumanTurn,
  overlordsOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { getRel, realmOf, validTargets } from "./relations";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots } = renderMap(data, app);
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

function inPlay(): boolean {
  return game.phase === "playing" || game.phase === "defeat";
}

function relationsInfo(region: Region): string[] {
  const human = game.players[0];
  if (!inPlay() || !human || region.faction === human.factionId) return [];
  const overlords = overlordsOf(game);
  const f = region.faction;
  const mine = getRel(game.relations, human.factionId, f);
  const theirs = getRel(game.relations, f, human.factionId);
  const lines = [
    `Status: yours ${mine.status} / theirs ${theirs.status}`,
    `Might: yours ${mine.might} / theirs ${theirs.might}`,
  ];
  const owner = game.incorporated[f];
  const lord = overlords.get(f);
  if (owner === human.factionId) lines.push("Part of your realm (incorporated)");
  else if (owner !== undefined) lines.push(`Incorporated into ${factionById.get(owner)!.name}`);
  else if (lord === human.factionId) lines.push("Your vassal");
  else if (overlords.get(human.factionId) === f) lines.push("Your overlord");
  else if (lord === undefined) lines.push("Independent");
  else lines.push(`Vassal of ${factionById.get(lord)!.name}`);
  return lines;
}

const panel = createPanel(
  app, () => interaction.deselect(), data.peoples, data.factions,
  data.settlements, relationsInfo,
);

function applyOwnership(): void {
  const overlords = inPlay() ? overlordsOf(game) : new Map<string, string>();
  const human = game.players[0];
  const humanRealm = new Set(
    inPlay() && human ? realmOf(human.factionId, overlords, game.incorporated) : [],
  );
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective =
      game.incorporated[region.faction] ??
      overlords.get(region.faction) ??
      region.faction;
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
  }
}

function armedTargets(): string[] {
  const human = game.players[0];
  if (armed === null || !human) return [];
  return validTargets(
    human.factionId, human.hand[armed], overlordsOf(game),
    game.incorporated, game.adjacency, game.factionIds,
  );
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

function refresh(): void {
  applyOwnership();
  applyTargeting();
  hud.update(game);
}

/** Runs every AI turn back to back. The setTimeout(0) lets the HUD paint
 *  the waiting label first; there is no artificial per-turn delay. */
function runAiTurns(): void {
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    while (game.phase === "playing" && !isHumanTurn(game)) {
      game = endTurn(aiTakeTurn(game, rng), rng);
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
      refresh();
    },
    onPlayCard(index) {
      if (!isHumanTurn(game)) return;
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
      refresh();
    },
    onEndTurn() {
      if (!isHumanTurn(game)) return;
      disarm();
      game = endTurn(game, rng);
      refresh();
      runAiTurns();
    },
    canPlayCard(cardId) {
      const human = game.players[0];
      const card = CARDS[cardId];
      if (!human || !card?.targeted) return true;
      return validTargets(
        human.factionId, cardId, overlordsOf(game),
        game.incorporated, game.adjacency, game.factionIds,
      ).length > 0;
    },
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
);
hud.update(game);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && armed !== null) disarm();
});

const interaction = attachInteraction(svg, regionPaths, settlementDots, data, {
  onHover(region, clientX, clientY) {
    if (region) {
      tooltip.show(
        tooltipText(region, factionById.get(region.faction)!),
        clientX,
        clientY,
      );
    } else tooltip.hide();
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
        refresh();
      }
      return true;
    }
    return false;
  },
});
