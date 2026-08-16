import {
  CARDS, KEYWORDS, keywordsOf, type KeywordDef, type UpgradeCost,
} from "./cards";
import { PASSIVES } from "./passives";
import { LEADER_ABILITIES } from "./abilities";
import { TERMS, termName } from "./glossary";
import { t, card, faction } from "./segments";
import { withArticle } from "./view";
import type { Segment } from "./segments";
import type { TooltipLine } from "./panel";

// The segment type and constructors live in segments.ts (a leaf module, so
// cards.ts can author them too); re-exported here so every prose surface keeps
// one import for the whole vocabulary.
export {
  t, ability, card, faction, keyword, passive, term, theFaction,
} from "./segments";
export type { Segment } from "./segments";

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
  burn: { third: "burns", past: "burned" },
  concede: { third: "concedes", past: "conceded" },
  discard: { third: "discards", past: "discarded" },
  draw: { third: "draws", past: "drew" },
  earn: { third: "earns", past: "earned" },
  empower: { third: "empowers", past: "empowered" },
  fail: { third: "fails", past: "failed" },
  found: { third: "founds", past: "founded" },
  gain: { third: "gains", past: "gained" },
  incorporate: { third: "incorporates", past: "incorporated" },
  keep: { third: "keeps", past: "kept" },
  lose: { third: "loses", past: "lost" },
  move: { third: "moves", past: "moved" },
  pass: { third: "passes", past: "passed" },
  pay: { third: "pays", past: "paid" },
  play: { third: "plays", past: "played" },
  reclaim: { third: "reclaims", past: "reclaimed" },
  reshuffle: { third: "reshuffles", past: "reshuffled" },
  resist: { third: "resists", past: "resisted" },
  rule: { third: "rules", past: "ruled" },
  run: { third: "runs", past: "ran" },
  send: { third: "sends", past: "sent" },
  sow: { third: "sows", past: "sowed" },
  stand: { third: "stands", past: "stood" },
  submit: { third: "submits", past: "submitted" },
  trade: { third: "trades", past: "traded" },
  unify: { third: "unifies", past: "unified" },
  win: { third: "wins", past: "won" },
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

/** How a keyword titles itself, wherever it is shown. The word "Keyword" is
 *  part of the title and not decoration: a block headed just "Raid" under a
 *  card called Raid reads as a second card, which is how it read.
 *
 *  One spelling, so the popup and the two element surfaces cannot title the
 *  same keyword differently. */
const keywordHeading = (keyword: KeywordDef): string =>
  `Keyword: ${keyword.name}`;

/** A card's keyword, as the block every surface shows it in. Null where the
 *  card carries none.
 *
 *  ONE builder, because the alternative was three: the build screen, the hand's
 *  card tip and the hover popup all have to teach the same rule, and the first
 *  version had two of them doing it and the third quietly not. A surface that
 *  renders a card renders this under its text; nothing else decides how a
 *  keyword looks.
 *
 *  DOM here rather than a `TooltipLine[]` because two of the three consumers
 *  are building elements anyway; `cardTipLines` below is the line-shaped form
 *  for the one that is not. */
export function keywordBlock(cardId: string): DocumentFragment | null {
  const keywords = keywordsOf(cardId);
  if (keywords.length === 0) return null;
  const frag = document.createDocumentFragment();
  for (const keyword of keywords) {
    const block = document.createElement("section");
    block.className = "card-keyword";
    const heading = document.createElement("div");
    heading.className = "card-keyword-heading";
    heading.textContent = keywordHeading(keyword);
    const text = document.createElement("div");
    text.textContent = keyword.text;
    block.append(heading, text);
    frag.appendChild(block);
  }
  return frag;
}

/** A card's popup as tooltip lines: its name, its rules text, and its keyword
 *  where it has one. What the hover on a `card()` segment shows, and the same
 *  three facts `keywordBlock`'s consumers render as elements. */
export function cardTipLines(cardId: string): TooltipLine[] {
  const def = CARDS[cardId];
  if (def === undefined) return [{ text: cardName(cardId) }];
  return [
    { text: def.name },
    { text: def.text },
    ...keywordsOf(cardId).flatMap((keyword) => [
      { text: keywordHeading(keyword), blockStart: true as const },
      { text: keyword.text },
    ]),
  ];
}

/** The single passive-name resolver, beside the card one. */
export const passiveName = (id: string): string => PASSIVES[id]?.name ?? id;

/** The same, for a leader's abilities. */
export const abilityName = (id: string): string =>
  LEADER_ABILITIES[id]?.name ?? id;

/** The single card-name resolver. Was written twice (hud.ts, deck-screen.ts). */
export const cardName = (id: string | undefined): string =>
  (id !== undefined ? CARDS[id]?.name : undefined) ?? id ?? "";

/** A card's rules text as segments: the authored cross-references where the
 *  text names another card (`CardDef.textSegments`), or the whole text as one
 *  plain run. Surfaces that show rules text render this, so a mentioned card
 *  is a hoverable node like everywhere else. */
export const cardTextSegments = (id: string): Segment[] => {
  const def = CARDS[id];
  return def?.textSegments ?? [t(def?.text ?? "")];
};

/** What an upgrade costs, as prose the player can point at: "Costs Raid x2 -
 *  you hold 4". `held` is omitted before a game starts, where nobody holds
 *  anything yet and the price is the whole of what the build tile can say.
 *
 *  The currency is a `card()` segment and the count is a bare "x2" beside it,
 *  not "2 Raids". Pluralising a card's name would put a word in the player's
 *  prose that no rename in src/cards.ts could ever follow, and the segment rule
 *  in AGENTS.md exists to stop exactly that. */
export const priceSegments = (
  cost: UpgradeCost, held?: number,
): Segment[] => [
  t("Costs "), card(cost.from), t(` x${cost.count}`),
  ...(held === undefined ? [] : [t(` - you hold ${held}`)]),
];

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
  /** The display name of the human playing this faction, or null when nobody
   *  is - every AI seat, and every faction in a solo game. Absent entirely
   *  outside a network game, which is why every existing surface renders
   *  exactly as it did.
   *
   *  Rendered as plain text beside the name, never as part of it: a player's
   *  name is neither a card nor a faction, the only two things the naming
   *  rule covers, and the faction stays the hoverable node it always was. */
  playerNameOf?(factionId: string): string | null;
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
      if (seg.kind === "passive") return passiveName(seg.passiveId);
      if (seg.kind === "ability") return abilityName(seg.abilityId);
      if (seg.kind === "term") return termName(seg.termId);
      if (seg.kind === "keyword") {
        return KEYWORDS[seg.keywordId]?.noun ?? seg.keywordId;
      }
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
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(cardTipLines(seg.cardId), e.clientX, e.clientY);
      });
      span.addEventListener("mouseleave", () => hooks.hideTip?.());
    } else if (seg.kind === "term") {
      // The passive pattern again: the label is the node, the number beside it
      // is the surface's own, and the hover says what the number means.
      span.className = "rt-passive";
      const def = TERMS[seg.termId];
      span.textContent = def?.name ?? seg.termId;
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(
          def === undefined
            ? [{ text: span.textContent ?? "" }]
            : [{ text: def.name }, { text: def.text }],
          e.clientX, e.clientY,
        );
      });
      span.addEventListener("mouseleave", () => hooks.hideTip?.());
    } else if (seg.kind === "keyword") {
      // The keyword's own block, the same one every card carrying it shows.
      span.className = "rt-passive";
      const def = KEYWORDS[seg.keywordId];
      span.textContent = def?.noun ?? seg.keywordId;
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(
          def === undefined
            ? [{ text: span.textContent ?? "" }]
            : [{ text: keywordHeading(def) }, { text: def.text }],
          e.clientX, e.clientY,
        );
      });
      span.addEventListener("mouseleave", () => hooks.hideTip?.());
    } else if (seg.kind === "ability") {
      // The passive pattern exactly, one table over.
      span.className = "rt-passive";
      const def = LEADER_ABILITIES[seg.abilityId];
      span.textContent = def?.name ?? seg.abilityId;
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(
          def === undefined
            ? [{ text: span.textContent ?? "" }]
            : [{ text: def.name }, { text: def.text }],
          e.clientX, e.clientY,
        );
      });
      span.addEventListener("mouseleave", () => hooks.hideTip?.());
    } else if (seg.kind === "passive") {
      // The card pattern exactly: the name is the node, the rule is the tip.
      span.className = "rt-passive";
      span.textContent = passiveName(seg.passiveId);
      const def = PASSIVES[seg.passiveId];
      span.addEventListener("mousemove", (e) => {
        hooks.showTip?.(
          def === undefined
            ? [{ text: span.textContent ?? "" }]
            : [{ text: def.name }, { text: def.text }],
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
    // "Curonians (Bela)" - who is behind that faction, wherever its name is
    // rendered. Here, at the one place a faction segment becomes a node, so
    // the round summary, the activity log, the postmortem and
    // any inline prose all get it from one decision rather than each
    // remembering to ask. Outside the span, so the hoverable name is still
    // exactly the faction's own.
    if (seg.kind === "faction") {
      const playerName = hooks.playerNameOf?.(seg.factionId);
      if (playerName !== null && playerName !== undefined && playerName !== "") {
        frag.appendChild(document.createTextNode(` (${playerName})`));
      }
    }
  }
  return frag;
}
