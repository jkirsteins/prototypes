import { CARDS } from "./cards";
import { isHumanTurn, type GameState } from "./game";

export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  onEndTurn(): void;
}

export interface Hud {
  update(state: GameState): void;
}

const FAN_ANGLE_DEG = 5;
const FAN_DROP_PX = 6;

export function createHud(container: HTMLElement, cb: HudCallbacks): Hud {
  const menu = document.createElement("div");
  menu.className = "menu-overlay";
  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Baltic Lands";
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "menu-new-game";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => cb.onNewGame());
  menu.append(title, newGameBtn);

  const status = document.createElement("div");
  status.className = "status-bar hidden";
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "end-turn hidden";
  endTurnBtn.textContent = "End turn";
  endTurnBtn.addEventListener("click", () => cb.onEndTurn());
  status.append(statusText, endTurnBtn);

  const piles = document.createElement("div");
  piles.className = "piles hidden";
  const deckPile = document.createElement("div");
  deckPile.className = "pile pile-deck";
  const discardPile = document.createElement("div");
  discardPile.className = "pile pile-discard";
  piles.append(deckPile, discardPile);

  const hand = document.createElement("div");
  hand.className = "hand hidden";

  container.append(menu, status, piles, hand);

  function renderHand(state: GameState): void {
    hand.replaceChildren();
    const human = state.players[0];
    if (!human) return;
    const n = human.hand.length;
    const canPlay = isHumanTurn(state) && !state.playedThisTurn;
    human.hand.forEach((cardId, i) => {
      const card = document.createElement("button");
      card.className = "card";
      card.textContent = CARDS[cardId]?.name ?? cardId;
      const offset = i - (n - 1) / 2;
      card.style.transform =
        `rotate(${offset * FAN_ANGLE_DEG}deg) ` +
        `translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
      card.disabled = !canPlay;
      if (canPlay) card.addEventListener("click", () => cb.onPlayCard(i));
      hand.appendChild(card);
    });
  }

  return {
    update(state) {
      menu.classList.toggle("hidden", state.phase !== "main-menu");
      status.classList.toggle("hidden", state.phase === "main-menu");
      piles.classList.toggle("hidden", state.phase !== "playing");
      hand.classList.toggle("hidden", state.phase !== "playing");

      if (state.phase === "pick-faction") {
        statusText.textContent = "Choose your faction";
        endTurnBtn.classList.add("hidden");
      } else if (state.phase === "playing") {
        if (isHumanTurn(state)) {
          statusText.textContent = `Turn ${state.turn} - your turn`;
          endTurnBtn.classList.remove("hidden");
        } else {
          const player = state.players[state.current];
          statusText.textContent = `Waiting on player ${player.id}...`;
          endTurnBtn.classList.add("hidden");
        }
        const human = state.players[0];
        deckPile.textContent = `Deck: ${human.deck.length}`;
        discardPile.textContent = `Discard: ${human.discard.length}`;
        renderHand(state);
      }
    },
  };
}
