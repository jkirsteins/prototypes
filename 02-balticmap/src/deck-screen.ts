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
  deckLabel.textContent = "Your deck (click to include, max 1 each):";
  const deckRow = document.createElement("div");
  deckRow.className = "ds-deck";
  const counter = document.createElement("p");
  counter.className = "ds-counter";

  const start = document.createElement("button");
  start.className = "menu-new-game ds-start";
  start.textContent = "Choose your lands";

  root.append(title, unlockSection, deckLabel, deckRow, counter, start);
  container.appendChild(root);

  /** Toggle state survives update() calls; pruned to known cards each render. */
  let selected = new Set<string>();
  let everKnown = new Set<string>();

  start.addEventListener("click", () => cb.onStart([...selected]));

  function renderCounter(pickCount: number): void {
    counter.textContent =
      `${pickCount} picked + ${DECK_SIZE - pickCount} Grow Crops = ${DECK_SIZE}`;
  }

  return {
    update(view) {
      root.classList.toggle("hidden", !view.visible);
      if (!view.visible) return;

      const known = nonBasics(view.knownCards);
      // newly known cards arrive pre-selected; stale selections are pruned
      for (const id of known) {
        if (!everKnown.has(id)) {
          everKnown.add(id);
          selected.add(id);
        }
      }
      selected = new Set(known.filter((id) => selected.has(id)));

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
      deckRow.replaceChildren(
        ...known.map((id) => {
          const card = document.createElement("button");
          card.className = "ds-card";
          card.classList.toggle("selected", selected.has(id));
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
            card.classList.toggle("selected", selected.has(id));
            renderCounter(selected.size);
            filler.textContent = `Grow crops x${DECK_SIZE - selected.size}`;
          });
          return card;
        }),
        filler,
      );
      filler.textContent = `Grow crops x${DECK_SIZE - selected.size}`;
      renderCounter(selected.size);
    },
  };
}
