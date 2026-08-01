# Rarity ribbon on picker and pack cards

2026-08-01. Follows the 2026-07-31 card-rarity design, which introduced the
4px tier band. This spec upgrades that band into a labelled ribbon on the two
screens where rarity informs a decision.

## Problem

The tier band is a 4px colour strip at the bottom of a card tile. Playtesting
found it too subtle to notice and, once noticed, unexplained: nothing on
screen says what brown, blue or purple mean. A player picking a deck or
opening a pack cannot read the rarity system off the UI.

## Decision

On the deck picker tiles and the pack-opening reveal, the band grows into a
ribbon: a footer strip in the tier colour with the tier name inside it, white
small-caps text, centered. The band and the label are one element, so the
colour teaches its own meaning. Every acquirable card is labelled, all three
tiers - common included, because an unexplained brown band was the complaint.

The in-game hand keeps the plain 4px band. Mid-game rarity is trivia, hand
cards are small, and the player has already met the labels on the screens
where they chose the cards.

## Mechanics

- **No new data.** The displayed name is the tier id (`common` / `rare` /
  `epic`), uppercased by CSS. `applyRarityBand` already resolves the tier and
  its colour from `RARITY_TIERS`.
- **API.** `applyRarityBand(el, cardId, opts?)` gains `{ labelled?: boolean }`.
  When labelled it additionally sets `data-rarity="<tier id>"` on the element
  and adds the class `rarity-labelled`. The deck picker tiles and pack cards
  pass `labelled: true`; the hand call in `src/hud.ts` is unchanged. The one
  helper keeps owning all tier styling, for the reason recorded in
  `src/rarity-band.ts`.
- **CSS.** The ribbon reuses the existing `.rarity-band::after` pseudo-element.
  A `.rarity-labelled::after` rule sets `content: attr(data-rarity)`,
  `height: auto` with small vertical padding, and centered white uppercase
  text (~10px, letter-spaced) on the tier colour. Unlabelled surfaces render
  exactly as before. All three tier colours (#6d6355, #1f6fd0, #7b2fbf) are
  dark enough for white text.
- **Filler tiles.** Grow turnips and the other non-acquirable cards get no
  ribbon, because `applyRarityBand` already returns early for them. Rarity
  says how a card is acquired, and they are never in a pack.

## Layout consequence

The picker tile's bottom padding grows to clear the taller ribbon, which
shrinks the space for rules text. The measured `grid-auto-rows` height in
`src/style.css` must be re-checked in a browser with the spill snippet from
CLAUDE.md, on `?screen=deck` (full picker) and `?screen=deck&xp=25&known=`
(pack overlay). An empty spill array is the acceptance test; anything listed
means the row height needs raising.

## Tests

Extend the rarity-band coverage: a labelled call asserts the class and the
`data-rarity` attribute; an unlabelled call asserts neither appears; a
non-acquirable card stays bare either way. No convention test is touched -
tier ids are not card or faction names.
