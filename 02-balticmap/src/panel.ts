import type { Faction, FactionType, People, Region, Settlement } from "./types";
import { leadClass } from "./view";

export interface Panel {
  show(region: Region): void;
  hide(): void;
}

function formatPeoples(ids: string[], peoples: People[]): string {
  const names = ids.map(
    (id) => peoples.find((p) => p.id === id)?.name ?? id,
  );
  if (names.length === 1) return names[0];
  return `Predominantly ${names[0]}, with ${names.slice(1).join(" and ")}`;
}

export function formatPopulation(population: number): string {
  return `~${population / 1000}k`;
}

export function formatFactionType(type: FactionType): string {
  return type.replace(/-/g, " ");
}

/** Growth sites carry no name on purpose (the map invents no place names), so
 *  their tooltip is the note alone rather than a blank first line. */
export function settlementTooltipText(s: Settlement): string {
  return s.name === "" ? s.note : `${s.name}\n${s.note}`;
}

export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
  factions: Faction[],
  settlements: Settlement[],
  relationsInfo?: (region: Region) => string[],
  /** Whether a settlement has been founded in this land during the game. The
   *  panel is otherwise built from static map data, and the count on this line
   *  is the one place play changes it. */
  settledIn: (regionId: string) => boolean = () => false,
): Panel {
  const root = document.createElement("aside");
  root.className = "panel hidden";

  const close = document.createElement("button");
  close.className = "panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "x";
  close.addEventListener("click", onClose);

  const name = document.createElement("h2");
  name.className = "panel-name";
  const factionLine = document.createElement("p");
  factionLine.className = "panel-faction";
  const relations = document.createElement("p");
  relations.className = "panel-relations hidden";
  const peoplesLine = document.createElement("p");
  peoplesLine.className = "panel-peoples";
  const population = document.createElement("p");
  population.className = "panel-population";
  const cohesion = document.createElement("p");
  cohesion.className = "panel-cohesion";
  const settlementsLine = document.createElement("p");
  settlementsLine.className = "panel-settlements";
  const flavor = document.createElement("p");
  flavor.className = "panel-flavor";
  const places = document.createElement("p");
  places.className = "panel-places";

  const factionById = new Map(factions.map((f) => [f.id, f]));

  root.append(close, name, factionLine, relations, peoplesLine, population, cohesion, settlementsLine, flavor, places);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      const faction = factionById.get(region.faction);
      factionLine.textContent = faction
        ? `Faction: ${faction.name} (${formatFactionType(faction.type)})`
        : "";
      const lines = relationsInfo?.(region) ?? [];
      relations.textContent = lines.join("\n");
      relations.classList.toggle("hidden", lines.length === 0);
      peoplesLine.textContent = formatPeoples(region.peoples, peoples);
      population.textContent = `Population: ${formatPopulation(region.population)}`;
      cohesion.textContent = `Cohesion: ${region.cohesion}`;
      const home = settlements.find((s) => s.land === region.id && s.unlocked);
      const founded = settledIn(region.id) ? 1 : 0;
      settlementsLine.textContent = home
        ? `Settlements: ${home.name}${founded === 1 ? " and one new settlement" : ""} ` +
          `(${1 + founded}/${region.maxSettlements})`
        : "";
      flavor.textContent = region.flavor;
      places.textContent = `Notable places: ${region.places.join(", ")}`;
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
  };
}

/** A run inside a tooltip line that carries its own colour. `lead` marks it as
 *  a standing value and colours it by sign, the same scale the map badges and
 *  the activity log use - so a preview of a lead moving from -2 to -1 reads as
 *  two bad numbers rather than as one good line. */
export interface TooltipSpan {
  text: string;
  lead?: number;
}

export interface TooltipLine {
  text: string;
  /** "info" is the armed card's own colour: a preview of what a card would do
   *  is not a verdict, and giving the whole block one scannable amber keeps it
   *  from competing with the red/green that means threshold direction. */
  tone?: "good" | "bad" | "neutral" | "info";
  /** Rendered in place of `text` when present, so single values inside a line
   *  can carry their own colour. Build one with `spanLine`, never by hand:
   *  `text` has to stay the plain-text equivalent and that is the one place
   *  the two cannot drift apart. */
  spans?: TooltipSpan[];
  /** A short figure in its own right-aligned column, for a line that is a row
   *  of a table rather than a sentence ("4", "+1"). It needs its own element
   *  because `.tooltip` is `white-space: pre-line` and collapses the runs of
   *  spaces a padded column would need. */
  amount?: string;
  /** Opens a new block: gets space above it, so a tip carrying two tables is
   *  read as two rather than as one long list. A blank `TooltipLine` would not
   *  do - an empty div has no height. */
  blockStart?: true;
}

/** The only way to build a line with coloured runs: `text` is derived from the
 *  spans rather than written twice, so the plain-text form and the rendered one
 *  are the same string by construction. */
export function spanLine(
  spans: TooltipSpan[],
  rest: Omit<TooltipLine, "text" | "spans"> = {},
): TooltipLine {
  return { ...rest, text: spans.map((s) => s.text).join(""), spans };
}

export interface Tooltip {
  show(text: string, clientX: number, clientY: number): void;
  showLines(lines: TooltipLine[], clientX: number, clientY: number): void;
  /** Re-render what is already on screen, at the cursor it was opened at.
   *  No-op while hidden. The tip outlives the state it describes - it stays up
   *  through a card being played and the AI answering - and without this it
   *  goes on quoting leads and thresholds that have already moved. */
  redraw(lines: TooltipLine[]): void;
  hide(): void;
}

/** Fills one line's text element: a single node for plain text, or one span per
 *  run when the line colours its own values. */
function fillText(parent: HTMLElement, line: TooltipLine): void {
  if (line.spans === undefined) {
    parent.textContent = line.text;
    return;
  }
  for (const s of line.spans) {
    if (s.lead === undefined) {
      parent.appendChild(document.createTextNode(s.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = `tooltip-value ${leadClass(s.lead)}`;
    span.textContent = s.text;
    parent.appendChild(span);
  }
}

/** Gap between the cursor and the tip, and the smallest margin the tip is
 *  allowed to keep from the edge of the window. */
const TIP_GAP_PX = 12;
const TIP_MARGIN_PX = 4;

export function createTooltip(container: HTMLElement): Tooltip {
  const el = document.createElement("div");
  el.className = "tooltip hidden";
  container.appendChild(el);
  /** Where the tip was last opened. `redraw` has no cursor of its own - it is
   *  driven by the game changing, not by the mouse moving - and re-placing from
   *  this keeps the flip and the clamp right as the content grows or shrinks. */
  let lastX = 0;
  let lastY = 0;

  /** Below and right of the cursor, flipped to the other side when that would
   *  run off the window, then clamped so it can never be pushed off the near
   *  edge either. Must run AFTER the tip is unhidden and filled: a hidden
   *  element measures 0 and would never flip. Under happy-dom every measurement
   *  is 0, so the flip is simply a no-op there - the tests assert placement,
   *  Chrome is where the flip is confirmed. */
  const place = (clientX: number, clientY: number): void => {
    const axis = (
      cursor: number,
      size: number,
      limit: number,
    ): number => {
      const after = cursor + TIP_GAP_PX;
      const start = after + size > limit ? cursor - TIP_GAP_PX - size : after;
      return Math.max(TIP_MARGIN_PX, Math.min(start, limit - size - TIP_MARGIN_PX));
    };
    el.style.left = `${axis(clientX, el.offsetWidth, window.innerWidth)}px`;
    el.style.top = `${axis(clientY, el.offsetHeight, window.innerHeight)}px`;
  };

  const fill = (lines: TooltipLine[]): void => {
    el.replaceChildren(
      ...lines.map((l) => {
        const div = document.createElement("div");
        div.className = `tooltip-line tone-${l.tone ?? "neutral"}`;
        if (l.blockStart) div.classList.add("block-start");
        // A line with no amount and no spans keeps its single text node, so
        // every sentence-shaped producer renders exactly as it did before.
        if (l.amount === undefined && l.spans === undefined) {
          div.textContent = l.text;
          return div;
        }
        const text = document.createElement("span");
        text.className = "tooltip-text";
        fillText(text, l);
        if (l.amount === undefined) {
          div.appendChild(text);
          return div;
        }
        div.classList.add("has-amount");
        const amount = document.createElement("span");
        amount.className = "tooltip-amount";
        amount.textContent = l.amount;
        div.append(amount, text);
        return div;
      }),
    );
  };

  return {
    show(text, clientX, clientY) {
      el.textContent = text;
      el.classList.remove("hidden");
      lastX = clientX;
      lastY = clientY;
      place(clientX, clientY);
    },
    showLines(lines, clientX, clientY) {
      fill(lines);
      el.classList.remove("hidden");
      lastX = clientX;
      lastY = clientY;
      place(clientX, clientY);
    },
    redraw(lines) {
      if (el.classList.contains("hidden")) return;
      fill(lines);
      place(lastX, lastY);
    },
    hide() {
      el.classList.add("hidden");
    },
  };
}
