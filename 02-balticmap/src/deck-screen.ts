import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE } from "./cards";
import { runAnimation } from "./animate";
import { count } from "./plural";
import { cardName, cardTextSegments, renderSegments, type RichTextHooks } from "./rich-text";
import { applyRarityBand } from "./rarity-band";
import {
  copiesAllowed, DEFAULT_RULES, RULE_AXES, summarizeRules,
  type RuleSelections,
} from "./rules";
import type { TooltipLine } from "./panel";

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
  /** The rule picks to display - the owner's saved preference. */
  rules: RuleSelections;
}

export interface DeckScreenCallbacks {
  onStart(selectedIds: string[]): void;
  onOpenPack(): void; // player clicked the sealed pack
  onDismissReveal(): void; // player clicked Continue on the reveal
  /** The shared map tooltip, for a tile whose rules text outgrows its box.
   *  Optional for the same reason RichTextHooks' pair is: a screen built with
   *  no tooltip renders inert tiles rather than crashing. */
  onShowTip?(lines: TooltipLine[], clientX: number, clientY: number): void;
  onHideTip?(): void;
  /** A radio pick in the rules modal. Fired per change, not on Done, so the
   *  pick is remembered even if the player closes the screen another way.
   *  Optional like the tip pair: a screen built without it renders the
   *  summary and an inert modal rather than crashing. */
  onRulesChange?(next: RuleSelections): void;
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

  /** Rules text renders through `renderSegments`, so a card the text names
   *  (Seeds of revolt's Revolt) is a hoverable node here like everywhere
   *  else. Card rules text names no factions by design; a faction segment
   *  here would render its raw id, which the browser pass shows immediately. */
  const rtHooks: RichTextHooks = {
    factionName: (id) => id,
    isPlaceName: () => false,
    showTip: (lines, x, y) => cb.onShowTip?.(lines, x, y),
    hideTip: () => cb.onHideTip?.(),
  };

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

  // Text set in update(): the copy cap is a rule pick, not a constant.
  const deckLabel = document.createElement("p");
  deckLabel.className = "ds-label";
  const deckRow = document.createElement("div");
  deckRow.className = "ds-deck";
  const counter = document.createElement("p");
  counter.className = "ds-counter";

  const undiscovered = document.createElement("p");
  undiscovered.className = "ds-undiscovered";

  const start = document.createElement("button");
  start.className = "menu-new-game ds-start";
  start.textContent = "Choose your lands";

  // The pick that applies to the next game, stated without its alternatives:
  // the options live in the modal alone, so the screen stays a deck picker.
  const rulesRow = document.createElement("div");
  rulesRow.className = "ds-rules-row";
  const rulesBtn = document.createElement("button");
  rulesBtn.className = "ds-rules-btn";
  rulesBtn.textContent = "Rules";
  const rulesSummary = document.createElement("span");
  rulesSummary.className = "ds-rules-summary";
  rulesRow.append(rulesBtn, rulesSummary);

  const rulesOverlay = document.createElement("div");
  rulesOverlay.className = "ds-rules-overlay hidden";
  const rulesInner = document.createElement("div");
  rulesInner.className = "ds-rules-inner";
  /** What the view last reported, so a radio change can report a complete
   *  RuleSelections rather than a lone axis. */
  let currentRules: RuleSelections = { ...DEFAULT_RULES };
  const radios: {
    axisId: keyof RuleSelections; optionId: string; input: HTMLInputElement;
  }[] = [];
  // Built once: RULE_AXES is static, so update() only syncs checked state.
  for (const axis of RULE_AXES) {
    const axisName = document.createElement("div");
    axisName.className = "ds-rules-axis-name";
    axisName.textContent = axis.name;
    rulesInner.appendChild(axisName);
    for (const option of axis.options) {
      const label = document.createElement("label");
      label.className = "ds-rules-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `ds-rules-${axis.id}`;
      input.value = option.id;
      input.addEventListener("change", () => {
        // option.id is a validated member of axis.options, so it is a legal
        // value for this axis - but RuleSelections types each axis as a
        // literal union, which a computed property assignment cannot narrow.
        currentRules = { ...currentRules, [axis.id]: option.id } as RuleSelections;
        cb.onRulesChange?.(currentRules);
      });
      const optionName = document.createElement("span");
      optionName.className = "ds-rules-option-name";
      optionName.textContent = option.name;
      const optionText = document.createElement("span");
      optionText.className = "ds-rules-option-text";
      optionText.textContent = option.text;
      label.append(input, optionName, optionText);
      rulesInner.appendChild(label);
      radios.push({ axisId: axis.id, optionId: option.id, input });
    }
  }
  const rulesDone = document.createElement("button");
  rulesDone.className = "notice-continue ds-rules-done";
  rulesDone.textContent = "Done";
  rulesInner.appendChild(rulesDone);
  rulesOverlay.appendChild(rulesInner);
  rulesBtn.addEventListener("click", () =>
    rulesOverlay.classList.remove("hidden"),
  );
  rulesDone.addEventListener("click", () =>
    rulesOverlay.classList.add("hidden"),
  );

  root.append(
    title, deckLabel, deckRow, counter, undiscovered, rulesRow, start,
    packOverlay, rulesOverlay,
  );
  container.appendChild(root);

  /** Pick state survives update() calls; pruned to known cards and clamped to
   *  the copies rule's cap each render. Counts rather than a Set: the double
   *  rule lets one card be picked twice. The only thing ever selected for the
   *  player is the loadout they last confirmed themselves - the game still
   *  picks nothing on their behalf. */
  let selected = new Map<string, number>();

  const countsOf = (ids: string[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
    return out;
  };
  const totalPicked = (): number =>
    [...selected.values()].reduce((a, b) => a + b, 0);
  /** The confirmed loadout as a flat list, repeats included, in tile order. */
  const expandPicks = (): string[] =>
    [...selected].flatMap(([id, n]) => Array.from({ length: n }, () => id));

  start.addEventListener("click", () => cb.onStart(expandPicks()));

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
      // A tile that disappears from under the cursor never fires mouseleave,
      // and the tip is coordinate-driven with no owner - so both routes that
      // take tiles away have to dismiss it, or it strands over the map. The
      // other is the pack overlay, below.
      if (!view.visible) {
        cb.onHideTip?.();
        return;
      }

      if (view.savedPicks !== seededPicks) {
        seededPicks = view.savedPicks;
        selected = countsOf(view.savedPicks);
      }

      currentRules = view.rules;
      rulesSummary.textContent = summarizeRules(view.rules);
      for (const r of radios) {
        r.input.checked = view.rules[r.axisId] === r.optionId;
      }

      // Clamping to the cap here is what prunes second copies the moment the
      // copies rule flips back to single mid-screen - the pick a stricter rule
      // no longer allows goes the way of a pick for a card no longer known.
      const cap = copiesAllowed(view.rules);
      const known = nonBasics(view.knownCards);
      selected = new Map(
        known
          .filter((id) => selected.has(id))
          .map((id) => [id, Math.min(selected.get(id) ?? 0, cap)]),
      );
      deckLabel.textContent =
        `Choose the cards you take (up to ${DECK_SIZE}, ` +
        `${cap === 1 ? "1 copy" : `up to ${cap} copies`} each):`;

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

      for (const el of [deckLabel, deckRow, counter, rulesRow, start]) {
        el.classList.toggle("hidden", opening);
      }
      if (opening) cb.onHideTip?.();

      if (view.reveal === null) {
        // The third route that takes tiles away: Continue can be pressed from
        // the keyboard with the cursor resting on a card reference, and a span
        // replaced out from under the cursor never fires mouseleave.
        if (animatedReveal !== null) cb.onHideTip?.();
        packCards.replaceChildren();
        animatedReveal = null;
      } else if (view.reveal !== animatedReveal) {
        animatedReveal = view.reveal;
        packCards.replaceChildren(
          ...view.reveal.map((r, i) => {
            const el = document.createElement("div");
            el.className = "ds-pack-card";
            applyRarityBand(el, r.id, { labelled: true });
            const name = document.createElement("span");
            name.className = "ds-card-name";
            name.textContent = cardName(r.id);
            const text = document.createElement("span");
            text.className = "ds-card-text";
            text.appendChild(renderSegments(cardTextSegments(r.id), rtHooks));
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
        applyRarityBand(card, id, { labelled: true });
        const name = document.createElement("span");
        name.className = "ds-card-name";
        name.textContent = cardName(id);
        const text = document.createElement("span");
        text.className = "ds-card-text";
        text.appendChild(renderSegments(cardTextSegments(id), rtHooks));
        // The copy count, shown only under a rule allowing more than one:
        // under the default rule the outline alone says "in", as ever.
        const countPill = document.createElement("span");
        countPill.className = "ds-card-count hidden";
        card.append(name, countPill, text);
        // The tile states the card in full, so the tip is the exception and not
        // the reading surface: it opens only when the text actually spills past
        // the fixed tile height, which nothing in the pool does today. The
        // shared position: fixed tooltip rather than a .card-tip-style popup
        // inside the tile, because .ds-deck is a scroll container and an
        // absolutely positioned child of a tile would be clipped by it on every
        // row - the top one worst of all, where it sits entirely outside.
        //
        // No focus/blur counterpart on purpose: a focus event carries no
        // coordinates and would need a second placement path in createTooltip,
        // for no gain while the tile face already says everything the tip does.
        card.addEventListener("mousemove", (e) => {
          // A hovered card reference has its own tip; this same mousemove
          // bubbles here and would overwrite it with the tile's.
          if ((e.target as Element).closest(".rt-card") !== null) return;
          if (card.scrollHeight <= card.clientHeight) return;
          cb.onShowTip?.(
            [{ text: cardName(id) }, { text: CARDS[id]?.text ?? "" }],
            e.clientX, e.clientY,
          );
        });
        card.addEventListener("mouseleave", () => cb.onHideTip?.());
        // A click cycles the count: one more copy, wrapping to none when the
        // copies cap or the deck size blocks the increment. With a cap of 1
        // this is exactly the old toggle, dead click at deck cap included.
        card.addEventListener("click", () => {
          const next = (selected.get(id) ?? 0) + 1;
          if (next > cap || totalPicked() >= DECK_SIZE) selected.delete(id);
          else selected.set(id, next);
          renderPicks();
        });
        return { id, card, countPill };
      });

      /** Repaints every toggle: the cap has to read as "swap one out", not
       *  as a dead click. */
      function renderPicks(): void {
        const total = totalPicked();
        const atCap = total >= DECK_SIZE;
        for (const { id, card, countPill } of cards) {
          const copies = selected.get(id) ?? 0;
          card.classList.toggle("selected", copies > 0);
          card.classList.toggle("deck-full", atCap && copies === 0);
          countPill.textContent = `x${copies}`;
          countPill.classList.toggle("hidden", cap < 2 || copies === 0);
        }
        filler.textContent = `${cardName("grow-crops")} x${DECK_SIZE - total}`;
        renderCounter(total);
      }

      deckRow.replaceChildren(...cards.map((c) => c.card), filler);
      renderPicks();
    },
  };
}
