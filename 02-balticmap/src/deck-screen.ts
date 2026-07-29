import { CARDS, DECK_SIZE } from "./cards";

export interface DeckScreenView {
  visible: boolean;
  knownCards: string[];
  seenPool: string[];
  /** One unlock per game: hides the unlock row once spent. */
  unlockUsed: boolean;
}

export interface DeckScreenCallbacks {
  onUnlock(cardId: string): void;
  onStart(selectedIds: string[]): void;
}

export interface DeckScreen {
  update(view: DeckScreenView): void;
}

const cardName = (id: string): string => CARDS[id]?.name ?? id;

const nonBasics = (ids: string[]): string[] =>
  ids.filter((id) => CARDS[id]?.maxPerDeck !== null);

/** Every deck-buildable non-basic card id, in stable CARDS order. */
const ALL_DECK_BUILDABLE_NON_BASICS = Object.values(CARDS)
  .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
  .map((c) => c.id);

export function createDeckScreen(
  container: HTMLElement,
  cb: DeckScreenCallbacks,
): DeckScreen {
  const root = document.createElement("div");
  root.className = "deck-screen hidden";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Prepare your deck";

  const unlockSection = document.createElement("div");
  unlockSection.className = "ds-unlock-section";
  const unlockLabel = document.createElement("p");
  unlockLabel.className = "ds-label";
  unlockLabel.textContent = "Learned from your defeats - unlock one:";
  const unlockRow = document.createElement("div");
  unlockRow.className = "ds-unlock";
  unlockSection.append(unlockLabel, unlockRow);

  const deckLabel = document.createElement("p");
  deckLabel.className = "ds-label";
  deckLabel.textContent =
    `Choose the cards you take (up to ${DECK_SIZE}, 1 copy each):`;
  const deckRow = document.createElement("div");
  deckRow.className = "ds-deck";
  const counter = document.createElement("p");
  counter.className = "ds-counter";

  const undiscovered = document.createElement("p");
  undiscovered.className = "ds-undiscovered";

  const start = document.createElement("button");
  start.className = "menu-new-game ds-start";
  start.textContent = "Choose your lands";

  root.append(title, unlockSection, deckLabel, deckRow, counter, undiscovered, start);
  container.appendChild(root);

  /** Toggle state survives update() calls; pruned to known cards each render.
   *  Nothing is ever selected for the player: the loadout is their call. */
  let selected = new Set<string>();

  start.addEventListener("click", () => cb.onStart([...selected]));

  function renderCounter(pickCount: number): void {
    counter.textContent =
      `${pickCount} picked + ${DECK_SIZE - pickCount} ${cardName("grow-crops")} = ${DECK_SIZE}`;
  }

  return {
    update(view) {
      root.classList.toggle("hidden", !view.visible);
      if (!view.visible) return;

      const known = nonBasics(view.knownCards);
      selected = new Set(known.filter((id) => selected.has(id)));

      const discovered = new Set([...view.knownCards, ...view.seenPool]);
      const undiscoveredCount = ALL_DECK_BUILDABLE_NON_BASICS.filter(
        (id) => !discovered.has(id),
      ).length;
      undiscovered.classList.toggle("hidden", undiscoveredCount === 0);
      undiscovered.textContent =
        `${undiscoveredCount} ${undiscoveredCount === 1 ? "card" : "cards"} still undiscovered`;

      unlockSection.classList.toggle(
        "hidden", view.seenPool.length === 0 || view.unlockUsed,
      );
      unlockRow.replaceChildren(
        ...view.seenPool.map((id) => {
          const card = document.createElement("button");
          card.className = "ds-card ds-locked";
          const name = document.createElement("span");
          name.className = "ds-card-name";
          name.textContent = cardName(id);
          const text = document.createElement("span");
          text.className = "ds-card-text";
          text.textContent = CARDS[id]?.text ?? "";
          card.append(name, text);
          card.addEventListener("click", () => cb.onUnlock(id));
          return card;
        }),
      );

      const filler = document.createElement("div");
      filler.className = "ds-card ds-filler";
      const cards = known.map((id) => {
        const card = document.createElement("button");
        card.className = "ds-card";
        const name = document.createElement("span");
        name.className = "ds-card-name";
        name.textContent = cardName(id);
        const text = document.createElement("span");
        text.className = "ds-card-text";
        text.textContent = CARDS[id]?.text ?? "";
        card.append(name, text);
        card.addEventListener("click", () => {
          if (selected.has(id)) selected.delete(id);
          else if (selected.size < DECK_SIZE) selected.add(id);
          renderPicks();
        });
        return { id, card };
      });

      /** Repaints every toggle: the cap has to read as "swap one out", not
       *  as a dead click. */
      function renderPicks(): void {
        const atCap = selected.size >= DECK_SIZE;
        for (const { id, card } of cards) {
          const taken = selected.has(id);
          card.classList.toggle("selected", taken);
          card.classList.toggle("deck-full", atCap && !taken);
        }
        filler.textContent = `${cardName("grow-crops")} x${DECK_SIZE - selected.size}`;
        renderCounter(selected.size);
      }

      deckRow.replaceChildren(...cards.map((c) => c.card), filler);
      renderPicks();
    },
  };
}
