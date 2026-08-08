import { BUILDS, CARDS, NEUTRAL_POOL, startingDeck, type Strategy } from "./cards";
import { cardName, cardTextSegments, renderSegments, type RichTextHooks } from "./rich-text";
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

  const intro = document.createElement("p");
  intro.className = "ds-label";
  intro.textContent =
    `Every realm starts with the same ${startingDeck().length} cards. ` +
    "Turnip harvests grow your deck from your build's pool plus the neutral cards.";

  const buildRow = document.createElement("div");
  buildRow.className = "ds-builds";

  let current: Strategy = "warpath";
  const tiles = (Object.keys(BUILDS) as Strategy[]).map((build) => {
    const tile = document.createElement("button");
    tile.className = "ds-build";
    const name = document.createElement("span");
    name.className = "ds-card-name";
    name.textContent = BUILD_COPY[build].title;
    const blurb = document.createElement("span");
    blurb.className = "ds-build-blurb";
    blurb.textContent = BUILD_COPY[build].blurb;
    tile.append(name, blurb);
    for (const id of BUILDS[build]) {
      const line = document.createElement("span");
      line.className = "ds-build-card";
      const cardTitle = document.createElement("strong");
      cardTitle.textContent = cardName(id);
      const text = document.createElement("span");
      text.className = "ds-card-text";
      text.appendChild(renderSegments(cardTextSegments(id), rtHooks));
      line.append(cardTitle, text);
      tile.appendChild(line);
    }
    tile.addEventListener("click", () => {
      current = build;
      renderPicks();
      cb.onBuildChange?.(build);
    });
    return { build, tile };
  });
  buildRow.append(...tiles.map((t) => t.tile));

  // The neutral pool, stated once under the tiles: both builds harvest from
  // it, so it belongs to neither tile.
  const neutrals = document.createElement("p");
  neutrals.className = "ds-neutrals";
  neutrals.textContent =
    `Both builds also harvest from the neutral pool: ${
      NEUTRAL_POOL.map((id) => CARDS[id].name).join(", ")}.`;

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

  root.append(title, intro, buildRow, neutrals, rulesRow, start, rulesOverlay);
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
