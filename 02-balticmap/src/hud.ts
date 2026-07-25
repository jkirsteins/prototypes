import { CARDS } from "./cards";
import { isHumanTurn, type GameEvent, type GameState } from "./game";

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

const cardName = (id: string | undefined): string =>
  (id && CARDS[id]?.name) ?? id ?? "";

function eventText(e: GameEvent): string {
  const you = e.playerId === 1;
  switch (e.type) {
    case "draw":
      return you ? `You drew ${cardName(e.cardId)}` : `Player ${e.playerId} drew a card`;
    case "play":
      return you
        ? `You played ${cardName(e.cardId)}`
        : `Player ${e.playerId} played ${cardName(e.cardId)}`;
    case "reshuffle":
      return you
        ? "You reshuffled your discard"
        : `Player ${e.playerId} reshuffled their discard`;
  }
}

/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4. */
function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}

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

  function makePile(kind: string, label: string) {
    const root = document.createElement("div");
    root.className = `pile pile-${kind} hidden`;
    const stack = document.createElement("div");
    stack.className = "pile-stack";
    const count = document.createElement("div");
    count.className = "pile-count";
    const lbl = document.createElement("div");
    lbl.className = "pile-label";
    lbl.textContent = label;
    root.append(stack, count, lbl);
    return { root, stack, count };
  }

  const deckPile = makePile("deck", "Deck");
  const discardPile = makePile("discard", "Discard");

  const hand = document.createElement("div");
  hand.className = "hand hidden";

  const logPanel = document.createElement("div");
  logPanel.className = "activity-log hidden";
  const logHeader = document.createElement("div");
  logHeader.className = "activity-log-header";
  const logTitle = document.createElement("span");
  logTitle.className = "activity-log-title";
  logTitle.textContent = "Activity";
  const logToggle = document.createElement("button");
  logToggle.className = "activity-log-toggle";
  logToggle.textContent = ">";
  logToggle.addEventListener("click", () => {
    const collapsed = logPanel.classList.toggle("collapsed");
    logToggle.textContent = collapsed ? "<" : ">";
  });
  logHeader.append(logTitle, logToggle);
  const logEntries = document.createElement("div");
  logEntries.className = "activity-log-entries";
  logPanel.append(logHeader, logEntries);

  container.append(menu, status, deckPile.root, discardPile.root, hand, logPanel);

  let renderedEvents = 0;
  let lastRenderedTurn = 0;

  /** Appends entries for events not yet rendered; returns those events so
   *  animations can key off the same diff. */
  function renderLog(state: GameState): GameEvent[] {
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
    }
    const fresh = state.log.slice(renderedEvents);
    for (const e of fresh) {
      if (e.turn !== lastRenderedTurn) {
        const sep = document.createElement("div");
        sep.className = "log-turn";
        sep.textContent = `Turn ${e.turn}`;
        logEntries.appendChild(sep);
        lastRenderedTurn = e.turn;
      }
      const entry = document.createElement("div");
      entry.className = "log-entry log-new";
      entry.textContent = eventText(e);
      logEntries.appendChild(entry);
    }
    renderedEvents = state.log.length;
    if (fresh.length > 0) logEntries.scrollTop = logEntries.scrollHeight;
    return fresh;
  }

  function renderPile(
    pile: { stack: HTMLElement; count: HTMLElement },
    n: number,
  ): void {
    pile.count.textContent = String(n);
    pile.stack.classList.toggle("empty", n === 0);
    pile.stack.replaceChildren();
    for (let i = 0; i < pileLayers(n); i++) {
      const back = document.createElement("div");
      back.className = "card-back";
      back.style.translate = `${-2 * i}px ${-2 * i}px`;
      pile.stack.appendChild(back);
    }
  }

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
      deckPile.root.classList.toggle("hidden", state.phase !== "playing");
      discardPile.root.classList.toggle("hidden", state.phase !== "playing");
      hand.classList.toggle("hidden", state.phase !== "playing");
      logPanel.classList.toggle("hidden", state.phase !== "playing");

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
        renderPile(deckPile, human.deck.length);
        renderPile(discardPile, human.discard.length);
        renderHand(state);
        renderLog(state);
      }
    },
  };
}
