import {
  BUILDS, NEUTRAL_POOL, startingDeck, upgradeCostOf, type Strategy,
} from "./cards";
import { BUILD_ABILITIES, LEADER_ABILITIES } from "./abilities";
import {
  card, cardName, cardTextSegments, keywordBlock, priceSegments,
  renderSegments, t, type RichTextHooks,
} from "./rich-text";
import {
  DEFAULT_RULES, RULE_AXES, summarizeRules,
  type RuleSelections,
} from "./rules";
import type { TooltipLine } from "./panel";

/** The build screen - the deck picker's successor. Decks are no longer
 *  chosen: every seat starts with the same six cards and grows through
 *  harvest picks, so the one choice left is WHICH pool those picks come
 *  from. Two tiles, each naming its build's cards in full, plus the rules
 *  picker and Choose your lands. */
export interface DeckScreenView {
  visible: boolean;
  /** The build currently selected - the saved preference on arrival, then
   *  whatever the player last clicked. */
  build: Strategy;
  /** The rule picks to display - the owner's saved preference. */
  rules: RuleSelections;
  /** True when the picks are somebody else's to make: a network guest plays
   *  the HOST's rules, because there is one engine and it is the host's. The
   *  radios go read-only and the summary says whose they are. */
  rulesLocked?: boolean;
}

export interface DeckScreenCallbacks {
  onStart(build: Strategy): void;
  /** A build tile click. Fired per change, like `onRulesChange`, so the pick
   *  is remembered even if the player leaves another way. */
  onBuildChange?(build: Strategy): void;
  /** The shared map tooltip, for a card reference inside a tile's rules
   *  text. Optional: a screen built with no tooltip renders inert text. */
  onShowTip?(lines: TooltipLine[], clientX: number, clientY: number): void;
  onHideTip?(): void;
  /** A radio pick in the rules modal. Fired per change, not on Done. */
  onRulesChange?(next: RuleSelections): void;
}

export interface DeckScreen {
  update(view: DeckScreenView): void;
}

const BUILD_COPY: Record<Strategy, { title: string; blurb: string }> = {
  warpath: {
    title: "Warpath",
    blurb: "Batter defenses down by force: raids that scale with your ruler's leadership.",
  },
  pestilence: {
    title: "Pestilence",
    blurb: "Seed disease and cash it all at once: stacks are yours alone, and a plague spends them.",
  },
};

export function createDeckScreen(
  container: HTMLElement,
  cb: DeckScreenCallbacks,
): DeckScreen {
  const root = document.createElement("div");
  root.className = "deck-screen hidden";

  /** Rules text renders through `renderSegments`, so a card the text names
   *  (Miasma's Plague) is a hoverable node here like everywhere else. */
  const rtHooks: RichTextHooks = {
    factionName: (id) => id,
    isPlaceName: () => false,
    showTip: (lines, x, y) => cb.onShowTip?.(lines, x, y),
    hideTip: () => cb.onHideTip?.(),
  };

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Choose your build";

  const buildRow = document.createElement("div");
  buildRow.className = "ds-builds";

  let current: Strategy = "warpath";
  // Warpath only, for now. Pestilence is played by the AI seats - half of
  // them - and is not offered to the human until its cards have been through
  // a pass of their own. A build nobody can pick is still a build the player
  // meets on the board, which is the point of hiding it rather than cutting
  // it.
  const tiles = (Object.keys(BUILDS) as Strategy[])
    .filter((build) => build !== "pestilence")
    .map((build) => {
    const tile = document.createElement("button");
    tile.className = "ds-build";
    // The build's own blurb, with no title above it: `.ds-card-name` is the
    // heading a CARD line uses, so the build's name in it read as a card
    // called Warpath sitting above the real ones.
    const blurb = document.createElement("span");
    blurb.className = "ds-build-blurb";
    blurb.textContent = BUILD_COPY[build].blurb;
    tile.append(blurb);
    for (const id of BUILDS[build]) {
      const line = document.createElement("span");
      line.className = "ds-build-card";
      const cardTitle = document.createElement("strong");
      cardTitle.textContent = cardName(id);
      const text = document.createElement("span");
      text.className = "ds-card-text";
      text.appendChild(renderSegments(cardTextSegments(id), rtHooks));
      line.append(cardTitle, text);
      // What the card costs, where it is bought rather than given. The ladder
      // decides which cards a warpath deck opens with - the plain ones are the
      // currency - so it belongs on the screen where the build is chosen, not
      // only in the harvest that spends it. No held count: nobody holds
      // anything yet.
      const cost = upgradeCostOf(id);
      if (cost !== null) {
        const price = document.createElement("span");
        price.className = "ds-card-price";
        price.appendChild(renderSegments(priceSegments(cost), rtHooks));
        line.append(price);
      }
      // The keyword the card carries, from the one builder every surface that
      // renders a card uses - so this screen and the hand's tip cannot come to
      // explain the same rule two different ways.
      const keyword = keywordBlock(id);
      if (keyword !== null) line.appendChild(keyword);
      tile.appendChild(line);
    }
    // What the build gives the RULER, in a block of its own under the cards.
    // Not mixed in with them: an ability is not a card, cannot be drawn,
    // played or harvested, and a row that looked like the rows above would be
    // read as one more card in the deck.
    const abilities = (BUILD_ABILITIES[build] ?? [])
      .map((id) => LEADER_ABILITIES[id])
      .filter((def) => def !== undefined);
    if (abilities.length > 0) {
      const block = document.createElement("span");
      block.className = "ds-build-leader";
      const heading = document.createElement("span");
      heading.className = "ds-leader-heading";
      heading.textContent = "Your leader";
      block.appendChild(heading);
      for (const def of abilities) {
        const line = document.createElement("span");
        // Its own class, not the card rows': an ability is not a card, and a
        // `.ds-build-card` lookup that answered with one counted the build's
        // deck wrong everywhere it was asked.
        line.className = "ds-leader-line";
        const abilityTitle = document.createElement("strong");
        abilityTitle.textContent = def.name;
        const text = document.createElement("span");
        text.className = "ds-card-text";
        text.textContent = def.text;
        line.append(abilityTitle, text);
        block.appendChild(line);
      }
      tile.appendChild(block);
    }
    tile.addEventListener("click", () => {
      current = build;
      renderPicks();
      cb.onBuildChange?.(build);
    });
    return { build, tile };
  });
  buildRow.append(...tiles.map((t) => t.tile));

  // What every seat opens with and what every seat can reach whatever it
  // picked. Neither is on a tile: the deck is the same size either way, and
  // the neutrals belong to both builds, so a line under the tiles is where a
  // fact about ALL of them goes. The neutral line is also the only place a
  // player meets those cards before a harvest offers one.
  const deckLabel = document.createElement("div");
  deckLabel.className = "ds-label";
  deckLabel.textContent =
    `Every seat opens with the same ${startingDeck().length} cards.`;
  const neutrals = document.createElement("div");
  neutrals.className = "ds-neutrals";
  neutrals.append(document.createTextNode("Shared by both builds: "));
  neutrals.appendChild(renderSegments(
    NEUTRAL_POOL.flatMap((id, i) => (i === 0 ? [card(id)] : [t(", "), card(id)])),
    rtHooks,
  ));
  const start = document.createElement("button");
  start.className = "menu-new-game ds-start";
  start.textContent = "Choose your lands";

  // The pick that applies to the next game, stated without its alternatives:
  // the options live in the modal alone.
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
    title, buildRow, deckLabel, neutrals, rulesRow, start, rulesOverlay,
  );
  container.appendChild(root);

  start.addEventListener("click", () => cb.onStart(current));

  function renderPicks(): void {
    for (const { build, tile } of tiles) {
      tile.classList.toggle("selected", build === current);
    }
  }

  return {
    update(view) {
      root.classList.toggle("hidden", !view.visible);
      // A tile that disappears from under the cursor never fires mouseleave,
      // and the tip is coordinate-driven with no owner - so hiding the screen
      // has to dismiss it, or it strands over the map.
      if (!view.visible) {
        cb.onHideTip?.();
        return;
      }
      current = view.build;
      renderPicks();

      currentRules = view.rules;
      const locked = view.rulesLocked === true;
      rulesSummary.textContent = locked
        ? `${summarizeRules(view.rules)} (set by the host)`
        : summarizeRules(view.rules);
      for (const r of radios) {
        r.input.checked = view.rules[r.axisId] === r.optionId;
        // Read-only rather than hidden: a guest still needs to know which
        // rules it is about to play under.
        r.input.disabled = locked;
      }
    },
  };
}
