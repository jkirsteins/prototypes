# Status track removal

Status: shipped 2026-08-08

## What changed and why

The game tracked two pairwise relation counters, Might and Status, and the
Status track was removed entirely. Six of 22 cards were involved: Shrewd
marriage, A feast, Pay status tribute and Eloping heirs were deleted;
Assassinate ruler was reworked to level the Might lead instead of Status
(successor seating unchanged), so Bodyguard survives as its guard.

The two-track store collapsed to one number: `Relations` is
`Record<"a|b", number>`, `leadOf`/`leadsIn` return numbers, and every
per-track abstraction went with it - `TributeTrack`, `TrackBars`,
`clearsBars`, `withSurcharge`, `TrackRace`, `Threat.statusShortfall`,
`GameEvent.track`, `StandingChange.track`, the `S` badge tspan, the second
tooltip block. A one-member union or a one-key Record is the degenerate
abstraction the repo doctrine warns about, so none was kept "for later".

## Decisions worth recording

**Assassinate levels the store; pacts survive.** Status had no pact term, so
the old capture read raw `leadsOf`. Might has one (`leadsIn` adds
`PACT_MIGHT_BONUS` per live pact), and the levelling only zeroes the raw
counters - so the event's `amount` is captured through `leadsIn` (the visible
signed lead), and the visible post-play lead equals the live pact terms. The
standings walk's `set` move then stays consistent end to end: `before` is the
recorded amount, `after` is the current visible lead, both in the same
convention as the badge. The tooltip subtracts the raw store lead
(`(b) => b - leadOf(...)`) for the same reason. A residual lead after "resets
to none" is a live pact's term, already explained by the badge's amber boost
mark; the card text stays short on purpose.

**`GameEvent.track` was dropped, not narrowed.** The one contract change is
in `xpForEvent`: the scaling gate moved from "the event has a track" to "the
event is a play". This reproduces the old payouts for every surviving event -
tribute/garrisoned/pact-lapsed have base 0 and are dropped earlier;
`reclaimed` deliberately pays base alone - and tests/xp.test.ts pins it.

**The AI's own-best-target alliance exclusion is gone as provably dead.** On
one shared counter, a threat within one play of subjugating you leads you by
at least 1, so you trail it and can never simultaneously hold a Subjugate-
grade lead over it. The two-track scenario the exclusion answered cannot be
constructed any more. The own-vassal exclusion stays; a vassal can out-raid
its lord.

**Old URLs keep booting.** `parseRel` drops an unknown track name, so
`rel=talavians:might=3,status=-2` boots with the might pair applied and the
status pair swallowed. Pinned by a regression test.

**Tribute is one card.** `TRIBUTE_CARDS` is a one-entry readonly list, kept
as the single place the set is written down (injection, strip, legality,
doubling, footnotes all read it). The plural footnote copy collapsed to
"Pay military tribute was shuffled into your deck." via the existing
`plural()` helpers. "Pay military tribute" keeps its name: the qualifier is
vestigial with one tribute, but renaming is churn with no mechanical gain.

**DEFAULT_DECK's freed slot went to Take hostage** - the vassal-defence verb
the default deck lacked, already covered by AI step 5b. The balance run shows
it at 1.9% play share with every deck card played at least once.

## Measurements

- **Pacing bands: all held unchanged.** `competent-full-deck` and every other
  scenario band passed without retuning, confirming the hypothesis that Might
  at 2/land (vs Status's 8/land) was already the route the AI actually used;
  the Status bar was the long way in and its removal did not move first-
  subjugation timing.
- **Balance (12 worlds, full deck):** 83.3% unified, 16.7% capped, median end
  turn 81, median stall 56.5. Play share: fortify 17.3%, favourable-omens
  16.8%, alliance 16.5%, raid 15.4%, assassinate-ruler 14.7%; no never-played
  cards.
- **Rarity re-measured** (`npm run rarity`, 500 decks): the rules moved every
  coefficient, and both cuts (0.013 / 0.139) still land in gaps. Re-tiered:
  Favourable omens 0.195 -> epic, Found a settlement 0.074 -> rare, Extended
  diplomacy -0.005 -> common, Take hostage -0.018 -> common. Epic holds
  Incorporate (0.507) and Favourable omens; the non-empty-epic guard in
  tests/packs.test.ts passes. Assassinate ruler measured -0.194 - levelling
  might is defensive tempo, not expansion, so a negative realm-size
  coefficient is expected, not alarming.
- **Baseline re-frozen twice** (after the Stage-1 rework and after the
  deletions): the roster shrank, which changes `buildAiDeck`'s rng draw
  count, and the rules moved - both legitimate staleness causes per the
  procedure in tests/rng-isolation.test.ts.

## What to play, and what would look wrong

Play an assassinate into a pact-boosted lead and read the log line: the
suffix should end at the pact residue, not 0, and the map badge should agree.
Subjugate off a pure might siege - the tooltip's single block must sum to the
badge figure. Play a default-deck game and watch for Take hostage against a
restive vassal. Wrong would be: any "Status" string in the UI, an `S` entry
on a badge, a log suffix disagreeing with the modal, or a picker tile whose
text now spills (the texts shortened, so spill is unlikely, but the measure
snippet in AGENTS.md is the check).
