# The card's rules text is read in one place, and it is never over the map

## The problem

A hand card's rules text is a `.card-tip` element built as a child of that
card's button, positioned `bottom: 100%` above the fan and shown by
`.card:hover` / `.card:focus-visible`. It is tall - blocked band, modifiers,
description, keyword block, risk band, and a "Potential targets" section with
one box per candidate - and the fan is at the bottom centre of the screen, so
the tip covers the middle of the map.

That is a nuisance while comparing cards and a real obstruction the moment a
targeted card is armed: the pointer is still on the card it just clicked, so
the tip is at its tallest exactly when the player needs to see the lands they
are about to aim at.

## The shape

One panel, in one place, for every card the player is looking at.

### It lives in the left column

`.card-panel` is a single element in `hud-left`, ordered between the
milestones drawer and the pinned-land panel. That column exists because three
panels each positioned from the top-left corner independently is three panels
drawn over each other; a fourth one gets the same treatment rather than a
fourth set of coordinates. It carries its own `max-height` and scroll, so a
long target list cannot push the pinned land off the bottom of the column.

The right edge is not available: the scoreboard holds the top of it and the
activity log the middle.

### One rule decides which card it shows

The card under the pointer or keyboard focus; failing that, the armed card;
failing both, hidden.

Hover outranks armed deliberately. While a Raid is armed the player may still
want to read another card in the fan, and moving off it returns the panel to
the Raid - the card the map is still asking about.

### It counts its own hover

The tip was a DOM child of the card button, so moving the pointer onto it kept
`.card:hover` true and the player could scroll it. Docked, it is not a child of
anything the hover rule names, so the panel treats a pointer over ITSELF as
hovering the card it is showing. Without that, a panel with a scrollbar closes
the moment somebody reaches for the scrollbar.

### The content is what it was, plus a name

Same builder, same class names - `card-tip-blocked`, `card-tip-modifier`,
`card-tip-description`, the keyword block, `card-tip-risk`,
`card-tip-targets` and its candidates - so every style already written for
them applies unchanged.

One addition: the panel opens with the card's **name**. Above the fan the tip
sat on top of the card face that named it; in the corner it would otherwise be
anonymous.

The panel is light-on-light like the pinned-land panel beside it, and states
its own `color` per the dark-box rule in AGENTS.md.

### Rebuild points

`renderCardPanel()` is called from `renderHand`, from the hover/focus change,
and from `setArmed`. Its content is read from the same callbacks the tip read -
`cardBlocked`, `cardModifiers`, `cardRisk`, `targetExplanations` - which are
answers about the state as it stands, so a panel left open across a repaint
must be rebuilt rather than left quoting the board before the play.

`scrollTop` is preserved when the card being redrawn is the card already
shown, and reset when it is a different one.

The hovered index is cleared by `renderHand`. A replaced element under the
pointer gets a fresh `pointerenter`; a detached one never gets a `leave`, so
holding the old index across a re-render is how the panel would end up showing
a card that is no longer in the hand.

### An immediate card needs no case

Clicking an untargeted card plays it, the hand re-renders without it, the
hover clears and the panel closes. Same gesture, same panel, no branch - which
is the consistency the change is for. A targeted card's click arms it, so the
panel stays on the strength of the armed arm of the same rule.

## Out of scope

- `targetExplanations` still lists a march card's targets generally rather than
  narrowing to the source the player has already picked. Existing behaviour,
  its own fix.
- The status bar keeps saying "Choose a target for X". The panel does not
  repeat it.

## Tests

`tests/hud.test.ts` queries `.card-tip` inside a card element in several
places (the targets section, the click-through guard, the blocked band, the
modifier band). Those move to the panel. The click-through guard changes
meaning: the panel is no longer inside a button, so what it now has to show is
that a click on the panel does not play the card under it.
