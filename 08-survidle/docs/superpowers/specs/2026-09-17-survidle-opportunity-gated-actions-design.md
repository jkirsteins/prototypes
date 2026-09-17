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

They were not enough. The list the overhaul produced is the one measured
at the top of this document: eighty-four rows, seventy-two of them
refusals. Scannable, and still the long list. Discovery-by-revelation is
the moment the tester was protecting; scrolling past twenty-two
unmakeable recipes is the chore he was complaining about. Gating is on
his side of that line.

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

Revealed is not startable, and the difference is the whole design. The
distinction the player reads is unchanged from today: a row with a
duration can be clicked, a row with a reason cannot.

**The rule.** A row is revealed when the survivor has, or can plainly
get, the tools and knowledge it names. It may still be blocked, and every
legitimate block teaches something. What gets gated is the one block that
teaches nothing: a tool the player has never heard of.

Classifying all seventy-two of day 1's blocked rows against that rule:

| Class | Example | Rows | |
| --- | --- | --- | --- |
| Calendar decides | `Tap a birch: the sap has not risen` | 3 | **reveal** |
| Place decides | `Gather stone: no rock in Elglia` | 2 | **reveal** |
| Prior step on screen | `Cook raw meat: needs a lit fire` | ~10 | **reveal** |
| Camp not yet made | `lean-to: no camp here yet` | 15 | revealed by the camp opportunity, on making camp |
| Tool chain, no concept of it | `Make hide coat: needs a bone needle` | ~40 | **gate** |

The first three are the world teaching itself: its year, its geography,
its order of operations. Hiding `no eggs until May` does not protect a
discovery, it deletes one.

A revealed row may still be blocked on **materials**, and that is
intended. The moment `Make hide coat` appears, the player learns hide and
sinew matter. The shopping list exists for exactly that. Revelation means
"you now know this is a thing", never "you can do this now".

Day 1 under this rule is roughly twelve startable rows plus five to seven
revealed-but-blocked: about eighteen, against eighty-four today.

**A caution for whoever authors `REVEAL`.** A row carries several blocks
and the UI prints one. `log cabin` displays `Building 10, you are 1` and
is *also* blocked by `no camp here yet`. Authoring this table by reading
the displayed reason would therefore be wrong. It has to be keyed off the
tool and skill requirements in the task definition.

Revelation is permanent within a run. A row never leaves the board once
shown, whatever happens to the opportunity that brought it. Rows
disappearing under the player is the failure `docs/ux.md`'s "nothing is
taken away by a redraw" section exists to prevent, and it applies here.

Revelation is a property of the **run**, not the survivor. An heir
inherits the board their ancestor uncovered. This matches the reasoning
already written into `opportunities.ts`, that goals outlive survivors and
must be readable off the world rather than off a life.

### 3.4 An opportunity reveals a chain, not a row

`Light a field fire` is blocked on `needs a fire drill`. The drill wants 2
sticks and 1 cordage; cordage wants 3 bark. Every link is gatherable on
day 1. Reveal the fire and hide the drill and the player is looking at a
locked door with no handle.

So an opportunity reveals **every row in the chain it names**. First fire
brings `bark`, `craft:cordage`, `craft:fireDrill` and `light` at once. The
intermediate rows are blocked, but blocked in class three: the prior step
is on screen, which is the case that teaches sequence.

This gives the crisp form of the whole rule:

> **A revealed row's blocks may only name things revealed by the same
> opportunity or an earlier one.**

Inside a chain, a block is a next step. Across chains, it is a locked door
with no handle. That sentence is the spec, and section 4 makes it a test.

### 3.5 The day-1 set

Landing reveals roughly eighteen rows: the twelve startable ones, plus the
handful the world itself is holding shut.

```
Gather    deadwood, sticks, berries, bark
          tap a birch      the sap has not risen     (calendar)
          gather eggs      no eggs until May         (calendar)
          gather stone     no rock in Elglia         (place)
Explore   explore this region
Build     make camp here
Camp      rest, sleep, drink
Make      cordage, fire drill                        (chain, for the fire)
Camp      light a field fire   needs a fire drill    (chain)
```

Hunt draws nothing. Make draws two rows instead of twenty-two. The
remaining sixty-six appear as the run reaches them.

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

**`tests/reveal.test.ts`, no locked doors.** Section 3.4's rule, enforced.
The single failure mode this whole design has is a revealed action blocked
by an unrevealed one, and this is the test that forbids it.

A block is not only a tool. `Make cordage` is blocked on 3 bark, and bark
comes from an action. So the test resolves each block to a **producing
action, transitively**, and requires that action to be revealed by the
same opportunity or an earlier one:

| Block | Resolves via | Declared? |
| --- | --- | --- |
| tool (`tool: "knife"`) | `RECIPES[r].out.item` | yes, `items.ts:244` |
| material (`needs: [{item}]`) | `RECIPES` / gather task | recipes yes, gather **no** |
| structure (`no camp here yet`) | `STRUCTURES[s].needs` | yes, `items.ts:276` |
| mend cost | mend table | yes, `items.ts:318` |
| season, place | nothing; the world fixes it | exempt |
| skill level | the rows that train that skill | see below |

**One table has to be added for this to close.** Gather tasks do not
declare what they yield: nothing in the code says `bark` produces `bark`
or `chop` produces `log`. That is roughly ten entries, authored beside
`REVEAL` and under the same coverage discipline, and without it the
transitive walk stops at the first raw material.

**Skill levels are the one block that is not an action.** `Make bow` wants
Crafting 5. The test cannot demand that a level be "revealed", so it
demands the next best thing: at least one revealed row trains that skill.
A recipe gated on Crafting 5 with no revealed crafting work is a locked
door like any other.

This test reads requirements off the task definitions rather than off the
displayed reason, which is what section 3.3's caution demands, and it is
the only mechanical check that the board a player is looking at can
actually be acted on.

Together these answer a question the game currently cannot answer at all:
which opportunities are missing. Any row that cannot name one is a hole in
the opportunity catalogue, and the test prints it.

### What the tests cannot catch

Ordering *within* what is legal. The no-locked-doors test proves the
player can reach every revealed row; it cannot prove the route is a good
one, or that eighteen rows on day 1 is the right number rather than twelve
or thirty. Pacing is a playtest finding, and this spec does not pretend
otherwise.

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

1. The gather-yield table, ~10 entries. Without it the third test cannot
   resolve a material to the action that makes it.
2. `tests/reveal.test.ts`, all three rules, against an empty `REVEAL`. Red.
3. `REVEAL` authored to green, 77 entries, keyed off task requirements
   rather than displayed reasons.
4. The Do pane draws only revealed rows; `docs/ux.md` section rewritten.
5. `defaultPanes` reads the current opportunity; `clear` control.
6. The opportunity card routes; catalogue pauses; the checkbox resolved.
7. Chips.
8. Playtest for pacing, which no test will find.

The tab-strip merge in section 8 follows separately.
