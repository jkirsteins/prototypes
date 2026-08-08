# Turnip harvest: the turnip bar and its pick-one-of-three boons

Date: 2026-08-08. Status: implemented alongside this doc.

## Problem

A new player's collection is thin, so `buildPlayerDeck` pads their ten with
"Grow turnips" (`grow-crops`), a card defined as no effect. Early runs are
therefore several dead plays per cycle with nothing to show for them. The
feature turns those dead plays into a catch-up engine that pays out early and
fades on its own.

## Design

### The bar

The HUD status bar carries a turnip chip (`.status-turnips`): a count and a
mini fill bar reading `Turnips 2/4`. Fill is derived from the log -
`runTurnips(state.log)` in src/xp.ts, the established convention - never a
counter on GameState. The chip hides for a run that grew no turnips and holds
none anywhere, so a good deck never sees the mechanic.

### Escalating thresholds

The first harvest costs 4 turnip plays; each next costs 2 more (costs 4, 6,
8, ... - cumulative 4, 10, 18, ...). Under the `turn:unlimited` rule variant
every cost is x3 (12, 30, 54, ...), because several plays a turn make a
turnip roughly a third as scarce. `harvestThreshold` / `harvestsEarned` /
`harvestProgress` in src/xp.ts own the math; `tests/xp.test.ts` pins it.

The mechanic self-limits three ways: costs escalate, good decks hold few
turnips, and the swap boons remove turnips - shrinking the income that feeds
the next threshold.

### The trigger is a card

Crossing a threshold shuffles a **Turnip harvest** (`turnip-harvest`) into
the human's draw pile, as a consequence event (`harvest-earned`) of the
turnip play that crossed - the seeds-of-revolt injection shape. A critical
notice ("A harvest is ready") announces it: a card entered what the player
holds, the same ground the tribute injection interrupts on.

Human-only: the injection is gated on `state.humanSeat !== null &&
state.current === state.humanSeat`, never bare player id, so `runWorld`'s
symmetric simulations (humanSeat null) stay symmetric while `runGame`'s
potato-deck human seat - exactly the weak deck this exists for - earns
harvests in the balance arms.

### Playing the harvest

Playing it rolls THREE options from a seven-boon pool, weighted (10 each;
the subjugation boon 2 - it hands over a whole vassalage), without
replacement, then draws the named card the swap-known boon offers - exactly
four rng draws, whatever comes up (the constant-draw pattern from
src/packs.ts; the card is drawn even when swap-known missed the roll). The
player keeps one. An ineligible boon still occupies its slot, greyed with
the reason - the roll teaches the pool exists - and if the whole roll comes
up dead the last slot becomes the always-eligible 1-wealth boon, so the card
is never dead in hand (and is on `cardBlockReason`'s always-legal list for
the same reason).

The pool (src/harvest.ts):

| id | effect | eligibility |
|---|---|---|
| swap-common | trade one Grow turnips (deck, then discard, then hand) for a random rare or epic from ACQUIRABLE_CARDS, shuffled into the deck | a turnip exists |
| swap-known | same, for the ONE card the roll named - any acquirable rarity, shown by name in the slot, so the player knows the prize before choosing | a turnip exists |
| might-reset | for every living rival holding a raw Might lead over the actor, the actor's counter rises by the deficit, so each such lead levels to 0 | a rival is ahead |
| wealth-1 | +1 wealth | always |
| wealth-income | +5 x `wealthIncomeFor` (five turns of the tick) | always |
| subjugate | take a neighbour as vassal, `insufficient-lead` waived - truce, respite, liege, reach, already-vassal still refuse | such a target exists |
| empower | mark a card from deck+discard; its next play resolves twice | an eligible card exists |

The two swaps split the trade decision: the named card is certain but may be
common; the blind draw is at least rare. The reset boon levels the STORE
only, the `levelMight` precedent - a lead bought by a live pact is not the
boon's to erase.

All boons are run-only; nothing banks to the collection. The swap gains go
into the DECK - a future draw, never a free play. The named card rides on
the choice object (`cardId`): the pick already happened at roll time, so
resolution spends exactly what the roll named and draws nothing.

### The choice flow (main.ts)

Clicking the harvest opens the modal pre-play, the targeting-flow shape:
nothing commits until the boon and its sub-pick are settled, then one
`playCard(..., { harvest: choice })`. The subjugation boon reuses the armed
targeting cues with its own frozen target set; the empower boon opens a card
picker. Escape steps back (target/picker to modal, modal to closed - card
kept, turn unspent). The whole roll - effect ids AND the named card - is
cached until any play commits, so cancelling cannot fish for a better roll
or a better trade; eligibility is re-derived on every open.

Choiceless callers - the sim's naive human, a `turns=` fast-forward, an AI
seat - auto-resolve via `autoHarvestChoice`: same four draws, first live
boon in rolled order, sub-picks settled without further draws (the target
and the empowered card take the first eligible, the swap-known boon the card
the roll already named).
`POLICY_COVERAGE["turnip-harvest"]` is step 9e: cash it on any legal turn,
above turnips, below the ruler's level.

### Empower

`GameState.empoweredCardId` (the one new state field) holds the mark; the
hand card glows (`.card-empowered`) and its tip says why. The next human play
of that card runs the effect chain twice - `playCard`'s chain is a
`resolveEffect` closure for exactly this - with the amount rules: raid and
the fan-out ACCUMULATE `amount` (the walk needs the sum), alliance and
assassinate first-stamp (a pact's bonus applies once - the pact just runs
longer; a second swing reads a levelled store). A second-swing dead-play
refusal just stops the second swing; a guard-prevented play keeps the mark
(nothing resolved, nothing spent). Forced cards, the fillers and the harvest
itself are never eligible. Readings and the mark compound: an omens-doubled,
empowered Fortify logs `- doubled, empowered (+4 Might against all)`.

### Events

Five new `GameEventType`s, each through every exhaustive gate
(NOTICE_RULES, XP_TABLE, nestsUnderItsPlay, eventSegments, naming samples):
`harvest-earned` (modal, critical), `harvest-traded`, `harvest-might`,
`harvest-wealth`, `empowered` (all silent - the player picked them).
`harvest-might` is always one pair (`targetFactionId` + `amount`): the
might-reset boon fans out as one event PER trailing rival, each carrying its
own deficit, so `leadMovesOf` resolves a HUMAN-authored fan-out through the
ordinary single-target arm - no frozen `affected` list needed. The
subjugation boon emits the existing `subjugated`/`released` events. Plays
that resolved twice carry `empowered: true`.

## Measured

- `npm test`: 1135 pass, including the re-frozen seeded baseline
  (`npm run capture:baseline` - the injection adds draws and the potato-deck
  seats now earn harvests, a legitimate behaviour change; the fixed-deck
  humanSeat-null world arms are provably outside every new path, and
  buildAiDeck's draw count is unchanged since the harvest is not
  deck-buildable).
- `npm run balance`: all 53 pass. The potato pacing bands HELD - the boost
  was absorbed without moving the fall-fast gates - and the world metrics are
  unchanged (full-deck worlds hold no turnips).
- Browser (seeded boots): the modal and its greyed reasons, the chip's fill
  and escalation (0/4 -> 3/4 -> harvest -> 0/6), the x3 chip under
  unlimited, the map-targeting chain with Escape-back and the anti-fishing
  cached roll, and the empower glow through to the doubled resolution.

## Playtest guidance

Play a sparse-collection run (`?screen=deck&known=`), lean on turnips, cash
two harvests. Wrong would look like: a modal with zero live options, the bar
disagreeing with its count, a boon subjugation whiffing or landing through a
truce, the harvest notice quoting numbers the log does not, or a glowing card
resolving once.

## Amendment: the 2026-08-09 rebalance

The ten-boon pool above shrank to seven, and the sections were rewritten to
match. What changed and why:

- `swap-known` no longer trades against the player's collection; it offers
  ONE card pre-rolled from all of ACQUIRABLE_CARDS and names it in the slot.
  A trade whose prize is a surprise from your own collection was neither
  exciting nor informative; a named prize is a real decision against the
  blind swap.
- `swap-common` now draws from the rares and epics. A guaranteed common was
  strictly worse than the named trade in practice; excluding commons gives
  the blind draw a floor to weigh against the certainty of the named one.
- `might-random`, `might-chosen` and `might-all` (+1 flavours) were all too
  small to matter and are gone. In their place, `might-reset` erases the
  actor's raw Might deficit against every rival ahead of them - a catch-up
  boon in a catch-up engine, worth more the further behind you are, worth
  nothing when you lead.
- `incorporate` was removed: with the card itself no-fail since the failure
  rolls came out of Subjugate and Incorporate, the boon was a duplicate
  windfall.
- The roll is now four constant draws (three slots + the named card), the
  named card is cached with the roll (anti-fishing covers the trade), and
  `GameEvent.affected` is gone - the reset boon logs one single-target
  `harvest-might` per trailing rival, each with its own deficit as `amount`.

Measured: `npm test` 1165 pass; the seeded baseline re-captured byte-identical
(the fixed-deck humanSeat-null arms never reach a harvest play).
