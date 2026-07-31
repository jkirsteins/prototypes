import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE } from "./cards";
import { runAnimation } from "./animate";
import { count } from "./plural";
import { cardName } from "./rich-text";
import { applyRarityBand } from "./rarity-band";

export interface PackReveal {
  id: string;
  isNew: boolean;
}

export interface DeckScreenView {
  visible: boolean;
  knownCards: string[];
  collected: number; // owned acquirable cards
  pendingPacks: number; // packs waiting to be opened
  reveal: PackReveal[] | null; // non-null once the owner has drawn a pack
  savedPicks: string[]; // the last confirmed loadout, to select on arrival
}

export interface DeckScreenCallbacks {
  onStart(selectedIds: string[]): void;
  onOpenPack(): void; // player clicked the sealed pack
  onDismissReveal(): void; // player clicked Continue on the reveal
}

export interface DeckScreen {
  update(view: DeckScreenView): void;
}

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

  // The pack is the only place a card's rules are stated before it is played,
  // so a revealed card carries its full text, not just a name.
  const packOverlay = document.createElement("div");
  packOverlay.className = "ds-pack-overlay hidden";
  const packInner = document.createElement("div");
  packInner.className = "ds-pack-inner";
  const packCount = document.createElement("p");
  packCount.className = "ds-pack-count";
  const packSealed = document.createElement("button");
  packSealed.className = "ds-pack-sealed";
  packSealed.textContent = "Open";
  const packHint = document.createElement("p");
  packHint.className = "ds-pack-hint";
  packHint.textContent = "Click to open";
  const packCards = document.createElement("div");
  packCards.className = "ds-pack-cards";
  const packContinue = document.createElement("button");
  packContinue.className = "notice-continue ds-pack-continue hidden";
  packContinue.textContent = "Continue";
  packSealed.addEventListener("click", () => cb.onOpenPack());
  packContinue.addEventListener("click", () => cb.onDismissReveal());
  packInner.append(packCount, packSealed, packHint, packCards, packContinue);
  packOverlay.appendChild(packInner);

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

  root.append(title, deckLabel, deckRow, counter, undiscovered, start, packOverlay);
  container.appendChild(root);

  /** Toggle state survives update() calls; pruned to known cards each render.
   *  The only thing ever selected for the player is the loadout they last
   *  confirmed themselves - the game still picks nothing on their behalf. */
  let selected = new Set<string>();

  start.addEventListener("click", () => cb.onStart([...selected]));

  /** The reveal currently on screen, so `update()` re-rendering for an
   *  unrelated reason does not replay the burst. Compared by identity: the
   *  owner hands over a fresh array per pack. */
  let animatedReveal: unknown = null;

  /** The saved loadout already adopted into `selected`. Compared by identity,
   *  like the reveal above: the owner hands over a fresh array exactly when the
   *  selection should change under the player - on load, and on Reset progress -
   *  and the same array otherwise, so an update() for an unrelated reason
   *  (opening a pack, dismissing a reveal) never undoes a pick made since. */
  let seededPicks: unknown = null;

  function renderCounter(pickCount: number): void {
    counter.textContent =
      `${pickCount} picked + ${DECK_SIZE - pickCount} ${cardName("grow-crops")} = ${DECK_SIZE}`;
  }

  return {
    update(view) {
      root.classList.toggle("hidden", !view.visible);
      if (!view.visible) return;

      if (view.savedPicks !== seededPicks) {
        seededPicks = view.savedPicks;
        selected = new Set(view.savedPicks);
      }

      const known = nonBasics(view.knownCards);
      selected = new Set(known.filter((id) => selected.has(id)));

      const opening = view.pendingPacks > 0 || view.reveal !== null;
      packOverlay.classList.toggle("hidden", !opening);
      packCount.textContent = `${count(view.pendingPacks, "pack")} to open`;
      // applyPack has already decremented pendingPacks by the time the reveal
      // for that pack is on screen, so the count would contradict what the
      // player is looking at ("0 packs to open" over an open pack). Hide it
      // for the same window the sealed pack and its hint are hidden.
      packCount.classList.toggle("hidden", view.reveal !== null);
      packSealed.classList.toggle("hidden", view.reveal !== null);
      packHint.classList.toggle("hidden", view.reveal !== null);
      packContinue.classList.toggle("hidden", view.reveal === null);

      for (const el of [deckLabel, deckRow, counter, start]) {
        el.classList.toggle("hidden", opening);
      }

      if (view.reveal === null) {
        packCards.replaceChildren();
        animatedReveal = null;
      } else if (view.reveal !== animatedReveal) {
        animatedReveal = view.reveal;
        packCards.replaceChildren(
          ...view.reveal.map((r, i) => {
            const el = document.createElement("div");
            el.className = "ds-pack-card";
            applyRarityBand(el, r.id);
            const name = document.createElement("span");
            name.className = "ds-card-name";
            name.textContent = cardName(r.id);
            const text = document.createElement("span");
            text.className = "ds-card-text";
            text.textContent = CARDS[r.id]?.text ?? "";
            const tag = document.createElement("span");
            if (r.isNew) {
              tag.className = "ds-pack-new";
              tag.textContent = "NEW";
            } else {
              tag.className = "ds-pack-dupe";
              tag.textContent = "already known";
            }
            el.append(name, tag, text);
            // Each card flips in after the one before it. The stagger is the
            // whole beat of a pack opening; the animation reports its own end
            // and nothing re-derives its length.
            runAnimation(
              el,
              [
                { offset: 0, opacity: 0, transform: "rotateY(90deg) scale(0.8)" },
                { offset: i === 0 ? 0 : 0.4, opacity: 0, transform: "rotateY(90deg) scale(0.8)" },
                { offset: 1, opacity: 1, transform: "rotateY(0deg) scale(1)" },
              ],
              i === 0 ? 420 : 700,
            );
            return el;
          }),
        );
      }

      undiscovered.classList.remove("hidden");
      undiscovered.textContent =
        `${view.collected} of ${ACQUIRABLE_CARDS.length} collected`;

      const filler = document.createElement("div");
      filler.className = "ds-card ds-filler";
      const cards = known.map((id) => {
        const card = document.createElement("button");
        card.className = "ds-card";
        applyRarityBand(card, id);
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
