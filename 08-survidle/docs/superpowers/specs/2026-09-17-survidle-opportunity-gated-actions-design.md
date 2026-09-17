# Survidle: opportunity-gated actions

The Do panel shows 84 rows on day 1. Twelve of them can be started.

That is not an estimate. It is a count taken in Chrome at 1440 by 900 on
seed 17, walking every subtab and every purpose and reading each row for
a duration rather than a reason:

| Subtab | Rows | Startable |
| --- | --- | --- |
| Gather | 11 | 6 |
| Hunt | 6 | 1 |
| Explore | 3 | 2 |
| Camp | 24 | 1 |
| Make | 22 | **0** |
| Build | 18 | 2 |
| **Total** | **84** | **12** |

Two whole subtabs are dead on arrival. Make offers twenty-two recipes and
not one of them can be made; ten of those say `needs a knife` and eight
say `needs a bone needle`, for a knife and a needle the player has no
route to and no reason to want yet.

This pass gates a row on an opportunity. A row exists when the
opportunity that names it has been discovered, and not before.

## 1. This serves the overhaul's principle rather than overturning it

`2026-09-07-survidle-ui-overhaul-design.md` takes its brief from a tester
who refused the obvious lesson:

> "not necessarily in-game goals. It's just realizing all the things that
> are actions so to speak"
> "**discovering it is half the fun**"
> "and it's somewhat obscured in a long list of skills/actions"
> "**which is the bad part so to speak**"

Read that last pair again. The complaint is not that the game withheld
things. It is that the action space was **obscured in a long list**. The
overhaul answered it by making the long list scannable: subtabs,
purposes, two-line rows, a filter. Good changes, all of them kept here.

But a scannable list of eighty-four rows, seventy-two of which are
refusals, is still the long list. Discovery-by-revelation is the moment
he was protecting. Discovery-by-scrolling-past-twenty-two-refusals is the
chore he was complaining about. Gating is on his side of that line.

What we must not do is teach the answer. A revealed row still says what
it needs and never says how to get it. "Oh, I can build a fire?" survives.
"Here is how you build a fire" stays out, exactly as before.

## 2. The rule this replaces

`docs/ux.md` currently says:

> A subtab holds a handful of rows per purpose rather than a folded list
> of everything. Nothing sits behind a "more (N)": a row a survivor
> cannot start yet still shows and says why, because learning what is
> available is most of learning the game.

Half of that is right and stays. The new rule, which replaces the section
wholesale rather than being appended beside it:

> **The Do pane holds what the run has revealed, and hides nothing within
> it.** A row appears when the opportunity that names it is discovered,
> and from that moment it is always visible: nothing sits behind a
> "more (N)", and a row a survivor cannot start yet still shows and says
> why. What a run has not reached is not drawn, because a list of
> refusals for work the player has no concept of is the long list the
> overhaul set out to kill.

The ban on folding is untouched. Only the starting set changes.

## 3. The mechanism

### 3.1 The key namespace already matches

`src/sim/capabilities.ts`:

```ts
export type CapabilityKey = `rec:${string}` | `build:${StructureId}`
  | `craft:${RecipeId}` | `rung:${Rung}` | `skill:${SkillId}`;
```

`src/ui/purpose.ts` keys its `HOME` table with `rowKey(id, arg)`, which
produces `craft:fireDrill` and `build:leanTo`. Those are the same strings.
Sixteen of the seventy-seven rows in `HOME` are already named directly by
a `CapabilityKey`. The two halves have been spelled the same way since the
capability spine landed and have never been joined.

### 3.2 The REVEAL table

One new table in `src/ui/purpose.ts`, beside `HOME` and under the same
discipline:

```ts
/**
 * Which opportunity puts this row on the board. Exactly one per row: two
 * would mean a reader who saw it appear could not tell what they had
 * just learned.
 */
const REVEAL: Record<string, OpportunityKey> = {
  makeCamp:        "chooseWhereToLive",
  deadwood:        "chooseWhereToLive",
  "build:firePit": "firstFire",
  "craft:bow":     "aLastingFoodSource",
  // ...seventy-three more
};

export function revealOf(id: TaskId, arg?: string): OpportunityKey | null;
```

`mend` follows its structure, the way `home()` already does it: a mend row
is revealed by whatever revealed the thing it mends.

### 3.3 What "revealed" means

Revealed is not startable. `Light the fire` appears on day 1 and says
`needs tinder`. `Make camp here` appears on day 1 and is startable. Both
are revealed by the same day-1 opportunity. The distinction the player
reads is unchanged from today: a row with a duration can be clicked, a row
with a reason cannot.

Revelation is permanent within a run. A row never leaves the board once
shown, whatever happens to the opportunity that brought it. Rows
disappearing under the player is the failure `docs/ux.md`'s "nothing is
taken away by a redraw" section exists to prevent, and it applies here.

Revelation is a property of the **run**, not the survivor. An heir
inherits the board their ancestor uncovered. This matches the reasoning
already written into `opportunities.ts`, that goals outlive survivors and
must be readable off the world rather than off a life.

### 3.4 The day-1 set

The opportunities discovered at landing reveal roughly twelve rows:

```
Gather    deadwood, sticks, berries
Explore   explore this region
Build     make camp here
Camp      light the fire, rest, sleep, drink
```

Hunt and Make draw nothing until something opens them. That is the point.

## 4. The two tests

These are the instrument. They are written before the table they check,
and they are the reason the table is safe to author by hand.

**`tests/reveal.test.ts`, coverage.** Every row in `HOME` names exactly
one opportunity in `REVEAL`. A row naming none is an action no run can
reach, and fails the build. This is `tests/purpose.test.ts`'s rule applied
to a second axis, and it is enforced the same way.

**`tests/reveal.test.ts`, reachability.** Every opportunity named in
`REVEAL` is reachable from the day-1 set by some chain of discovery. An
opportunity nothing leads to strands every row it names, and fails the
build.

Together these answer a question the game currently cannot answer at all:
which opportunities are missing. Any row that cannot name one is a hole in
the opportunity catalogue, and the test prints it.

### What the tests cannot catch

A row revealed too early to be useful is structurally valid and reads as a
wall: `craft:bow` revealed before any cordage row is. Reachability proves
a path exists, not that the path is walkable in order. That is a playtest
finding, not a test finding, and this spec does not pretend otherwise.

## 5. The need chips

The verb tree cannot answer "I am cold". Measured over `VOCABULARY` in
`src/ui/dopanel.ts`:

| Concept | Rows | Subtabs it spans | Purposes |
| --- | --- | --- | --- |
| food | 22 | 5 | 8 |
| warmth | 16 | 3 | 4 |
| fire | 14 | 4 | 8 |
| water | 9 | 4 | 4 |
| shelter | 8 | 2 | 3 |

A cold player needs `Camp > Fire`, `Build > Shelter`, `Make > Clothing`
and `Camp > Tools`. The `kw:` concept filter already crosses subtabs and
already does exactly this. It is invisible until you happen to notice a
tag on a row you had already found.

So: render the concepts as a chip row above the subtab strip, each writing
`kw:<concept>` into the filter box that already handles it. No new
filtering, no taxonomy rewrite, no second home for any row. `HOME`'s
one-row-one-purpose invariant is untouched.

A chip is shown only when at least one revealed row carries its concept.
The chip row grows with the run, like the subtabs do.

## 6. Reset

Filter text, chip, subtab and purpose are four pieces of state today with
no single way out of them. One `clear` control beside the filter box
returns all four to the current opportunity's row.

That is also the fix for `src/ui/panes.ts:39`:

```ts
export function defaultPanes(): Panes {
  return { pane: "do", subtab: "Gather", purpose: PURPOSES.Gather[0] };
}
```

Every player, every run, every day lands on `Gather > Woodcutting`, which
holds one row, while the game's own stated first job is in `Build > Site`.
The default becomes the current opportunity's row, with the persisted
value winning once the player has moved it themselves.

## 7. The opportunity card becomes a door

`Current / Choose where to live / [ ] Make camp` is the game's only "what
next" affordance and it is a dead end. Verified: clicking it leaves
`#doitems` unchanged and opens the catalogue modal instead.

One click on the card routes the Do pane to the row the opportunity names
and scrolls it into view. `REVEAL` is the table that makes this possible,
read in the other direction.

Two smaller repairs in the same card:

- `[ ]` renders as a checkbox and is inert. Either it toggles or it stops
  being drawn as one.
- The `FIELD NOTES - PAUSED` modal pauses the sim. The catalogue it links
  to does not: the clock ran 08:03 to 08:50 while it was open, and Risk
  went from `...` to `10/10: cold, day 8` behind it. The catalogue pauses.

## 8. Flattening

There is no cascade column in this pass, and the reason is a measurement.
Across 77 rows, `HOME` produces 27 leaf groups with a maximum of 7 rows and
5 leaves holding exactly one. The third level of a verb / modifier / final
modifier cascade already exists as the row list, and it is flat because it
is small. Turning it into a column would add a click that reveals, five
times over, a single item.

The level that can actually be removed is a different one. `#panetabs`
holds `Do / Camp / Inventory / Gear / Log / Journal`; directly beneath it
`#dosubs` holds `Gather / Hunt / Explore / Camp / Make / Build`. Two tab
strips, stacked, with `Camp` appearing in both meaning different things.
Merging them into one strip removes a real level and one naming collision.

This is separable from the gating work and should land after it.

## 9. Out of scope

- **The map.** It holds `height: 50vh` against the Do pane's 195px, and
  that is a real imbalance, but the map's size is the game's atmosphere
  and is staying as it is by decision.
- **The Skills panel**, 1121px of ten identical constant blocks in an
  844px column. A separate pass.
- **The idle strip's tone.** "Counting birds in the sky..." reads as
  whimsy while Risk says `10/10: cold, day 8`. A separate pass.

## 10. Order of work

1. `tests/reveal.test.ts`, both rules, against an empty `REVEAL`. Red.
2. `REVEAL` authored to green, 77 entries.
3. The Do pane draws only revealed rows; `docs/ux.md` section rewritten.
4. `defaultPanes` reads the current opportunity; `clear` control.
5. The opportunity card routes; catalogue pauses; the checkbox resolved.
6. Chips.
7. Playtest for order-of-revelation walls, which no test will find.

The tab-strip merge in section 8 follows separately.
