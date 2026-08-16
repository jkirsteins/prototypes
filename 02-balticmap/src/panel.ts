import type { Settlement } from "./types";
import type { Segment } from "./segments";
import { leadClass } from "./view";

/** The one place the settlement tooltip's shape is decided: the place name,
 *  then what it is in 1100. Every site on the map is named, so there is no
 *  one-line form. */
export function settlementTooltipText(s: Settlement): string {
  return `${s.name}\n${s.note}`;
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
  /** The same line as nodes, for a surface that can be hovered - the pinned
   *  land panel. The floating tooltip renders `text`, because a tip that
   *  follows the cursor cannot be pointed at. `text` must stay the plain-text
   *  equivalent, the rule `spans` already keeps. */
  segments?: Segment[];
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

/** Turns one line's `segments` into nodes. Supplied only by a surface the
 *  pointer can reach - the pinned panel - because a card or faction name is
 *  worth marking up only where it can be hovered. */
export type SegmentRenderer = (segments: Segment[]) => Node;

/** Renders a tooltip's lines into `el`. The ONE renderer: the floating tip and
 *  the pinned land panel are the same box in two places, so a line laid out one
 *  way in the tip and another in the panel is a bug rather than a choice. The
 *  two differ in exactly one thing, which is this function's only parameter. */
export function fillTooltipLines(
  el: HTMLElement, lines: TooltipLine[], segmentsAs?: SegmentRenderer,
): void {
  el.replaceChildren(
    ...lines.map((l) => {
      const div = document.createElement("div");
      div.className = `tooltip-line tone-${l.tone ?? "neutral"}`;
      if (l.blockStart === true) div.classList.add("block-start");
      if (segmentsAs !== undefined && l.segments !== undefined) {
        // Nodes win over `text` and over `spans`: `text` is the same sentence
        // flat, and a producer that offers segments has already said which
        // words in it are worth pointing at.
        const text = document.createElement("span");
        text.className = "tooltip-text";
        text.appendChild(segmentsAs(l.segments));
        if (l.amount === undefined) {
          div.appendChild(text);
          return div;
        }
        div.classList.add("has-amount");
        div.append(amountEl(l.amount), text);
        return div;
      }
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
      div.append(amountEl(l.amount), text);
      return div;
    }),
  );
}

function amountEl(amount: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "tooltip-amount";
  el.textContent = amount;
  return el;
}

export interface Tooltip {
  /** No cursor: the tip is parked, not placed. See `place` below. */
  show(text: string): void;
  showLines(lines: TooltipLine[]): void;
  /** The lowest edge the tip must open below: the pinned land panel's, when
   *  one is up. Null for the tip's own resting height. The tip is parked at
   *  the left, which is where that panel lives, so without this the two dark
   *  boxes stack on each other. */
  clearTop(px: number | null): void;
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

export function createTooltip(container: HTMLElement): Tooltip {
  const el = document.createElement("div");
  el.className = "tooltip hidden";
  container.appendChild(el);
  /** Bottom of the pinned land panel while one is up, or null. */
  let below: number | null = null;

  /** Parks the tip at the top left. The CSS owns the horizontal offset; the
   *  only thing decided here is how far down, and only because a pinned land
   *  panel of unknown height may already be sitting there. */
  const place = (): void => {
    // Parked at the left edge, never under the pointer and never on the right.
    // A tip that follows the cursor sits on top of the very land being pointed
    // at - unreadable while aiming, because the arrow's head and the numbers
    // deciding where to send it are the same few pixels. The right side is
    // the activity log's, and a tip that crossed to it to dodge the cursor
    // covered it.
    //
    // Vertically it is fixed, because a tip that also moved up and down would
    // still be chasing - except under a pinned panel, which is the same dark
    // box and would otherwise be hidden underneath this one.
    el.classList.add("tip-left");
    el.classList.remove("tip-right");
    el.style.left = "";
    el.style.top = below === null ? "" : `${Math.round(below)}px`;
  };

  // No segment renderer: a tip that parks at the edge while the pointer is
  // somewhere else cannot be hovered, so a name marked up inside it would be
  // marked up for nobody.
  const fill = (lines: TooltipLine[]): void => fillTooltipLines(el, lines);

  return {
    clearTop(px) {
      if (px === below) return;
      below = px;
      if (!el.classList.contains("hidden")) place();
    },
    show(text) {
      el.textContent = text;
      el.classList.remove("hidden");
      place();
    },
    showLines(lines) {
      fill(lines);
      el.classList.remove("hidden");
      place();
    },
    redraw(lines) {
      if (el.classList.contains("hidden")) return;
      fill(lines);
      place();
    },
    hide() {
      el.classList.add("hidden");
    },
  };
}
