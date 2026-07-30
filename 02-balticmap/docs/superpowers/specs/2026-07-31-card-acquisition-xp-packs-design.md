# Balticmap: card acquisition via XP, levels and packs

Date: 2026-07-31
Status: approved

## Goal

Replace witnessing with earning. The player starts knowing Raid, Subjugate
and Fortify (plus the free Grow potatoes filler). Playing the game - any
card play, gaining Might or Status, subjugating, revolting, and so on -
earns XP. XP accumulates forever across runs. Crossing a level threshold
banks a pending pack; the deck screen lets the player open banked packs,
Hearthstone-style, two cards each, before building a deck. Duplicates are
allowed - a pack never guarantees a new card.

Supersedes `2026-07-26-balticmap-learning-loop-design.md`. That doc's
witnessing mechanic (`seenPool`, `seenThisRun`, one unlock per game, later
auto-unlock-everything-seen) is removed outright, not layered under this.

## Starting cards & data model

`STARTING_KNOWN_CARDS = ["raid", "subjugate", "fortify"]` in `cards.ts`,
replacing the old "only Grow potatoes" bootstrap.

`CardDef` gains `rarity: "common" | "rare" | "epic"`. Every card is tagged
`"common"` today - rare and epic exist as a type and as pack-weighting
machinery, but nothing is assigned to them yet. That is a deliberate,
separate balance pass, not part of this change.

The **acquirable pool** - cards a pack can draw - is every deck-buildable
non-basic minus the three starting cards:

```
shrewd-marriage, incorporate, seeds-of-revolt, assassinate-ruler, alliance,
extended-diplomacy, bodyguard, favourable-omens, found-settlement
```

Nine cards. Grow potatoes stays free filler outside the pool, exactly as
today. Pay tribute and Revolt stay injection-only (excluded already by the
existing `deckBuildable`/`maxPerDeck` filters that also drive
`ALL_DECK_BUILDABLE_NON_BASICS`).

## XP: derived centrally from the event log, not granted at call sites

A new pure `src/xp.ts` exports an **exhaustive**
`XP_TABLE: Record<GameEventType, number>`. Adding a new `GameEventType`
without adding it to this table fails to compile - the same enforcement
`NOTICE_RULES` already uses for notices, applied to XP.

```
play: 1
subjugated: 4
incorporated: 4
reclaimed: 4        (Revolt)
settled: 3
seeded: 2
released: 1         (your own Subjugate freeing someone else's vassals)
subjugate-failed: 1
incorporate-failed: 1
victory: 15
draw: 0
reshuffle: 0
discard: 0
tribute: 0           (forced, not a choice)
garrisoned: 0        (continuous automatic gain, not an action)
defeat: 0
unified: 0
surrendered: 0
```

`xpForEvent(e: GameEvent): number` returns the table value, plus
`+1 per point of amount` for events carrying a `track` (Raid,
Shrewd marriage, Fortify, Assassinate ruler, Revolt) - a bigger Raid earns
more than a token one.

**Single call site.** In `game.ts`, the play-resolution function currently
has a "learning hook" block (~line 603) that computes `seenThisRun`. That
block is replaced with one that sums `xpForEvent` over the events just
pushed for this play, filtered to the human (`playerId === 1`), and adds
the result to a new `GameState.xpThisRun: number` (replacing
`seenThisRun: string[]`). Nowhere else in `game.ts` touches XP.

Confirmed: a subjugated human earns 0 XP from tribute or garrison while
vassalized. Revolting still pays off through the `reclaimed` event.

## Level curve & pack granting

Also in `xp.ts`:

```
xpThresholdForLevel(level) = 25 * level * (level + 1) / 2
levelForXp(xp) = largest level where xpThresholdForLevel(level) <= xp
```

Thresholds: 25, 75, 150, 250, 375, 525, 700, 900, 1125, ... - fast early
(a rough first run at ~20 turns plausibly clears 25-40 XP from base plays
alone, so pack #1 is reachable even off a weak Raid/Subjugate/Fortify +
turnip deck), decelerating later. No hard level cap: XP keeps climbing
past full collection, and since draws allow duplicates, over-leveling
becomes duplicate pulls rather than a dead end.

These numbers are a starting calibration, not gospel - validate with
`npm run balance` once implemented and adjust `xp.ts`'s constants if real
runs land far from this curve. Do not hand-tune elsewhere; the constants
are the one place to change.

## Turnip milestones (easter egg)

Growing a lot of turnips is its own hidden reward path, independent of
XP. `MetaRecord` gains `turnipsGrown: number` - a persistent, cross-run
count of every Grow potatoes the human has ever played.

Explicit milestones: 10, 100, 1,000, 5,000, 10,000. Past 10,000 the
milestone list keeps going by doubling the previous one (20,000, 40,000,
80,000, ...) - an "ever increasing curve" in the same decelerating-payoff
spirit as the XP level curve, so it does not become a repeatable grind
once the joke has landed.

```ts
TURNIP_MILESTONES_BASE = [10, 100, 1000, 5000, 10000]
turnipMilestone(n: number): number // n-th milestone, 0-indexed; doubles past index 4
turnipPacksEarned(turnipsGrown: number): number // count of milestones crossed
```

Each milestone crossed grants exactly one bonus pack, folded into the
same `pendingPacks` total as XP levels:

```
pendingPacks(meta) = levelForXp(meta.xp) + turnipPacksEarned(meta.turnipsGrown) - meta.packsOpened
```

Wired through the same single call site and merge points XP already
uses: `GameState.turnipsGrownThisRun` increments alongside `xpThisRun`
whenever the human's play is `grow-crops`, and merges into
`meta.turnipsGrown` at the same run-end points that merge `xpThisRun`
into `meta.xp`. No new hook, no new merge site.

**Stays hidden.** No progress counter, no "N turnips until your next
pack" indicator anywhere in the UI - showing progress would spoil the
easter egg. The bonus pack simply appears as one more pending pack at the
deck screen next time, indistinguishable from an XP-earned one. Whether a
pending pack came from a level or a turnip milestone is not tracked once
it is banked; only the count matters.

## Persistence

`MetaRecord` (in `meta.ts`) becomes:

```ts
{ knownCards: string[], xp: number, turnipsGrown: number, packsOpened: number }
```

`seenPool` is removed. `pendingPacks(meta)` (shown above) is derived,
never stored redundantly - `packsOpened` is the one persisted counter,
matching the "reconstruct from a log rather than track a shadow counter"
pattern `standings.ts` already uses for the round summary.

At every point that currently banks `seenThisRun` into `seenPool` (run
end, or "New game" clicked mid-run, in `main.ts`), it instead does
`meta.xp += state.xpThisRun` and `meta.turnipsGrown +=
state.turnipsGrownThisRun`.

`initialMeta()` becomes:

```json
{ "knownCards": ["grow-crops", "raid", "subjugate", "fortify"], "xp": 0, "turnipsGrown": 0, "packsOpened": 0 }
```

Old-shape records in localStorage (with `seenPool`) fail the new shape
validation in `loadMeta` and fall back to `initialMeta()` - the same
silent-fallback behavior corrupt data already gets. No migration path;
losing an old seen-pool on this refactor is acceptable.

## Pack contents

New `src/packs.ts`:

```ts
openPack(acquirableIds: string[], rng: Rng): string[] // length 2
```

Each of the 2 slots independently rolls a rarity tier by weight
(documented target `common 70 / rare 25 / epic 5` - inert today since only
common is populated; rolling rare or epic with zero cards in it falls back
to common), then picks uniformly among that tier's cards from
`acquirableIds`. Duplicates are allowed - the draw does not consult
`knownCards` at all. `Rng` is the same injected type `cards.ts` already
uses, so this is seed-deterministic like everything else.

Applying a pack's result to `knownCards` is a plain array union (add if
absent, no-op if already known) - the "already known" outcome is purely a
UI label, not a different code path.

## UI: pack opening

No new `GamePhase`. This lives in the same deck-screen slot the old
"learned cards" overlay used - a modal state inside `deck-screen.ts`, not
new phase wiring in `main.ts`.

When `pendingPacks(meta) > 0`, the deck builder underneath stays hidden
and a pack-opening overlay shows instead: a pack the player clicks, which
shakes/glows then bursts, revealing its 2 cards one at a time with a flip,
each tagged NEW (gold) or a dim "already known" mark. Animation goes
through `runAnimation`/WAAPI exactly like every other animation in this
codebase - `onDone`-driven, no hardcoded duplicate timer reproducing the
animation length (the rule `animate.ts` already documents). A
Continue/"Open next pack" button (reusing the existing `notice-continue`
class) advances until `pendingPacks` reaches 0, then the normal deck
builder appears underneath.

The old "N cards still undiscovered" counter becomes "N of 9 collected",
computed from `knownCards ∩ acquirable pool` - no `seenPool` needed to
drive it.

The postmortem's "Seen this run" loot row is removed (nothing is
witnessed anymore). The postmortem instead gets a small "+N XP earned"
line, computed from `state.xpThisRun` - keeps a run-end payoff visible
without a second modal, consistent with `victory`/`defeat`/`surrendered`
already being silent notices ("postmortem overlay covers it").

## Removed

- `seenPool`, `seenThisRun` (state field)
- `mergeSeen`, `unlockCard`, `unlockAllSeen`
- `deck-screen.ts`'s `learnedOverlay` / `onDismissLearned`
- the witnessing-detection block in `game.ts` (~line 603)
- `2026-07-26-balticmap-learning-loop-design.md`'s mechanic is superseded;
  the doc itself is kept for history with a status note pointing here,
  not deleted.

## Testing

- `tests/xp.test.ts` (new): `XP_TABLE` exhaustiveness (compile-time via
  `Record<GameEventType, number>`), `xpForEvent` amount-scaling,
  `xpThresholdForLevel`/`levelForXp` math, `turnipMilestone` doubling past
  index 4, `turnipPacksEarned` crossing math, combined `pendingPacks`.
- `tests/packs.test.ts` (new): weighted draw with a seeded rng, empty-tier
  (rare/epic) fallback to common, duplicates allowed and not filtered.
- `tests/meta.test.ts`: updated for the new record shape, `bankXp`-style
  XP merge, pack-opening merge into `knownCards`, old-shape record
  fallback.
- `tests/game.test.ts`: `xpThisRun` accumulation replacing the
  seen-detection tests - per event type, per the table, including the
  amount-scaled cases and the 0-XP forced events.
- `tests/deck-screen.test.ts`: pack-opening flow (one pack at a time,
  gates the deck builder, "N of 9 collected") replacing the learned-modal
  tests.
- Manual e2e in Chrome: play a short first run, confirm a pack is pending
  at the deck screen, open it, see both cards land in `knownCards` (or
  show "already known" on a duplicate), build a deck with one, and see
  the "+N XP earned" line on a postmortem.

## Out of scope

- Populating rare/epic tiers with actual cards (separate balance pass).
- Dust, currency, or any conversion for duplicate pulls.
- Any change to AI deck generation (`buildAiDeck` is untouched - XP only
  ever accrues from `playerId === 1` events).
- Multiple save slots, cloud sync, or a level cap.
