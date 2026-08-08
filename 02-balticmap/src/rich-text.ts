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

/** "A", "A and B", "A, B and C" - the one place a run of names becomes a
 *  sentence. Was written three times in notices.ts, twice byte-identically,
 *  each with its own `events.length === 1` branch beside it. Callers that
 *  need a verb to agree with the run take it from `plural` in plural.ts. */
export function joinSegments(items: Segment[][]): Segment[] {
  return items.flatMap((item, i) => {
    if (i === 0) return item;
    return [t(i === items.length - 1 ? " and " : ", "), ...item];
  });
}

/** Who a clause is about, grammatically. English agrees a present-tense verb on
 *  this and on number, and `plural` in plural.ts already owns number - this is
 *  the other axis, and the one that broke.
 *
 *  `third` means third person treated SINGULAR, even for a people. That is the
 *  standing convention on the allegiance lines ("Vironians submits to",
 *  "pays tribute to"): a faction is one actor with one name, not a crowd. */
export type Person = "second" | "third";

/** The subject of a log line: how it reads, and what it agrees with. Returned
 *  as a pair rather than as bare segments because separating the two is exactly
 *  how "You fails to prise Curonians" shipped - `actorSegments` yielded "You"
 *  and the verb beside it was written in third person only. */
export interface Speaker {
  segments: Segment[];
  person: Person;
}

/** Every verb a log line uses, with the forms English needs.
 *
 *  A table and not a rule, because the rule has too many exceptions to be worth
 *  guessing at: `draw`/`drew`, `break`/`broke`, `pay`/`paid` and `stand`/`stood`
 *  are all irregular, and a `+s`/`+ed` helper would silently produce "drawed"
 *  the first time somebody reached for it. Every entry here is a decision taken
 *  once, in one place, instead of at each of twenty call sites.
 *
 *  Keyed, so `verb(person, "fial")` does not compile. That is the whole point:
 *  the bug this replaces was a plain string in a template, which nothing could
 *  have caught. */
const VERBS = {
  break: { third: "breaks", past: "broke" },
  concede: { third: "concedes", past: "conceded" },
  discard: { third: "discards", past: "discarded" },
  draw: { third: "draws", past: "drew" },
  fail: { third: "fails", past: "failed" },
  found: { third: "founds", past: "founded" },
  incorporate: { third: "incorporates", past: "incorporated" },
  lose: { third: "loses", past: "lost" },
  move: { third: "moves", past: "moved" },
  pass: { third: "passes", past: "passed" },
  pay: { third: "pays", past: "paid" },
  play: { third: "plays", past: "played" },
  reclaim: { third: "reclaims", past: "reclaimed" },
  reshuffle: { third: "reshuffles", past: "reshuffled" },
  resist: { third: "resists", past: "resisted" },
  rule: { third: "rules", past: "ruled" },
  send: { third: "sends", past: "sent" },
  sow: { third: "sows", past: "sowed" },
  stand: { third: "stands", past: "stood" },
  submit: { third: "submits", past: "submitted" },
  unify: { third: "unifies", past: "unified" },
} as const;

export type Verb = keyof typeof VERBS;

/** A verb that agrees with its subject. Present tense by default, since that is
 *  the only tense with anything to agree about; `"past"` is here so a line
 *  never has to step outside this helper and hand-write a form. */
export function verb(person: Person, lemma: Verb, tense: "present" | "past" = "present"): Segment {
  const forms = VERBS[lemma];
  if (tense === "past") return t(forms.past);
  return t(person === "third" ? forms.third : lemma);
}

/** The possessive determiner agreeing with the subject: "your" / "their". The
 *  second axis of the same problem - "You reshuffled their discard" is the same
 *  class of mistake as "You fails". */
export const possessive = (person: Person): Segment =>
  t(person === "second" ? "your" : "their");

/** A phrase that names a faction, or nothing at all when there is no faction to
 *  name. `lead` is the words that only make sense with the name attached - a
 *  preposition, or a whole clause.
 *
 *  A `faction` segment built from a missing id renders as the empty string, so
 *  a line that appends one unconditionally ends on its own preposition. That
 *  shipped as "You fail to prise Dainavians from", and the same optional field
 *  was being appended in three places - the activity log, the round summary's
 *  actor line and its self line - each deciding for itself whether to guard.
 *  Two of the three did not.
 *
 *  So the decision lives here instead: an absent faction takes its whole phrase
 *  with it, and no caller can forget. */
export const optionalPhrase = (
  lead: string,
  factionId: string | undefined,
): Segment[] =>
  factionId === undefined || factionId === "" ? [] : [t(lead), faction(factionId)];

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

/** Every faction a run of prose names, in order, deduplicated. The counterpart
 *  to `plainText`: what the line *says*, rather than how it reads. Callers that
 *  want to know which factions a line is about read it off the segments - the
 *  same description `renderSegments` turns into hoverable nodes - rather than
 *  re-deriving it from the event that produced them, which is how the two get
 *  to disagree. */
export function factionIds(segs: Segment[]): string[] {
  const ids: string[] = [];
  for (const seg of segs) {
    if (seg.kind === "faction" && !ids.includes(seg.factionId)) ids.push(seg.factionId);
  }
  return ids;
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
