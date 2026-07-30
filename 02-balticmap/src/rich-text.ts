import { CARDS } from "./cards";
import { withArticle } from "./view";
import type { TooltipLine } from "./panel";

/** A run of player-facing prose. Card and faction names are nodes, never
 *  text - see the naming rule in AGENTS.md. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "card"; cardId: string }
  | { kind: "faction"; factionId: string; article?: true };

export const t = (text: string): Segment => ({ kind: "text", text });
export const card = (cardId: string): Segment => ({ kind: "card", cardId });
export const faction = (factionId: string): Segment => ({ kind: "faction", factionId });
/** "the Selonians", but "Lietuva" for the one faction named for a land.
 *  Mid-sentence only - write lines so a faction never opens a sentence. */
export const theFaction = (factionId: string): Segment =>
  ({ kind: "faction", factionId, article: true });

/** The single card-name resolver. Was written twice (hud.ts, deck-screen.ts). */
export const cardName = (id: string | undefined): string =>
  (id !== undefined ? CARDS[id]?.name : undefined) ?? id ?? "";

export interface NameLookup {
  factionName(id: string): string;
  /** Faction ids that take no article ("Lietuva"). */
  isPlaceName(id: string): boolean;
}

export interface RichTextHooks extends NameLookup {
  /** The shared, coordinate-driven map tooltip. Optional: a HUD built with no
   *  map (tests) renders inert nodes rather than crashing. */
  showTip?(lines: TooltipLine[], clientX: number, clientY: number): void;
  hideTip?(): void;
  /** Lights this faction's realm up on the map, exactly as hovering its land
   *  does; null clears. Optional for the same reason as showTip/hideTip. */
  highlightFaction?(id: string | null): void;
}

function factionText(seg: { factionId: string; article?: true }, names: NameLookup): string {
  const name = names.factionName(seg.factionId);
  return seg.article ? withArticle(name, names.isPlaceName(seg.factionId)) : name;
}

/** Flat text, for tests, for `title` attributes, and for any surface not yet
 *  converted to `renderSegments`. The one legitimate way to get a string out
 *  of segments. */
export function plainText(segs: Segment[], names: NameLookup): string {
  return segs
    .map((seg) => {
      if (seg.kind === "text") return seg.text;
      if (seg.kind === "card") return cardName(seg.cardId);
      return factionText(seg, names);
    })
    .join("");
}

/** One `DocumentFragment` per run. Named segments become
 *  `<span class="rt-card">` / `<span class="rt-faction">` with hover handlers,
 *  so `element.textContent` still reads as the whole sentence - which is what
 *  keeps every activity-log test that only checks `textContent` passing
 *  unchanged after a surface converts to segments. */
export function renderSegments(segs: Segment[], hooks: RichTextHooks): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const seg of segs) {
    if (seg.kind === "text") {
      frag.appendChild(document.createTextNode(seg.text));
      continue;
    }
    const span = document.createElement("span");
    if (seg.kind === "card") {
      span.className = "rt-card";
      span.textContent = cardName(seg.cardId);
      const cardDef = CARDS[seg.cardId];
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(
          cardDef === undefined
            ? [{ text: span.textContent ?? "" }]
            : [{ text: cardDef.name }, { text: cardDef.text }],
          e.clientX, e.clientY,
        );
      });
      span.addEventListener("mouseleave", () => hooks.hideTip?.());
    } else {
      span.className = "rt-faction";
      span.textContent = factionText(seg, hooks);
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.([{ text: hooks.factionName(seg.factionId) }], e.clientX, e.clientY);
        hooks.highlightFaction?.(seg.factionId);
      });
      span.addEventListener("mouseleave", () => {
        hooks.hideTip?.();
        hooks.highlightFaction?.(null);
      });
    }
    frag.appendChild(span);
  }
  return frag;
}
