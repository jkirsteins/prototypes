import rawData from "./data/map.json";
import type { MapData } from "./types";
import { renderMap } from "./map-render";
import { createPanel, createTooltip, tooltipText, settlementTooltipText } from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, endTurn, aiTurn, isHumanTurn,
  type GameState,
} from "./game";
import { createHud } from "./hud";
import "./style.css";

const AI_TURN_MS = 300;

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots } = renderMap(data, app);
const tooltip = createTooltip(app);
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const regionById = new Map(data.regions.map((r) => [r.id, r]));
const panel = createPanel(app, () => interaction.deselect(), data.peoples, data.factions, data.settlements);

const rng = Math.random;
let game: GameState = newGame(data.factions.map((f) => f.id));

function applyOwnership(): void {
  const human = game.players[0];
  for (const [id, el] of regionPaths) {
    const owned = human !== undefined && regionById.get(id)!.faction === human.factionId;
    el.classList.toggle("dimmed", game.phase === "playing" && !owned);
  }
}

function runAiTurns(): void {
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    game = endTurn(aiTurn(game), rng);
    hud.update(game);
    runAiTurns();
  }, AI_TURN_MS);
}

const hud = createHud(app, {
  onNewGame() {
    game = startGame(game);
    hud.update(game);
  },
  onPlayCard(index) {
    if (!isHumanTurn(game)) return;
    game = playCard(game, index);
    hud.update(game);
  },
  onEndTurn() {
    if (!isHumanTurn(game)) return;
    game = endTurn(game, rng);
    hud.update(game);
    runAiTurns();
  },
});
hud.update(game);

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
    if (game.phase !== "pick-faction") return false;
    if (regionId === null) return true;
    game = pickFaction(game, regionById.get(regionId)!.faction, rng);
    applyOwnership();
    hud.update(game);
    return true;
  },
});
