# Realm tempo: make size buy accumulation, not just defence

Low-ceremony plan. One implementation pass, no subagents, a single verification
and tuning sweep at the end. No intermediate re-measurement.

## The problem, measured

Measured at `6336dc7`, `full-deck` arm, 52 worlds, 300-turn cap: **7 unresolved
(13.5%)**. Re-run at a 1500-turn cap, **all 7 resolve** (t302..t521). These are
not deadlocks. Each is a two-bloc endgame 13 or 14 lands of the 15 needed, with
70 to 187 turns of zero progress first.

Traced endgames (earlier tree, same signature): the leader's last rival is a
peer, the bar against it is `2 * 12..13` = 20 to 26, and the measured pairwise
lead sits at **0** for the whole tail. In one seed the tail was sampled every
turn: lead sufficient on 0% of turns.

Root cause: **realm size buys defence and victory count but no accumulation
rate.** `advance()` skips incorporated seats, and only vassals pay tribute, so a
14-land realm takes exactly one action per round, the same as a one-land minnow.
Raid is the only card whose yield scales with realm size (`borderStrength`);
Fortify and Shrewd marriage are flat `+1`. So two peers gain at the same rate,
their difference random-walks near zero, and the bar is unreachable.

Grip is deliberately **not** changed. It stays `2 * lands + settlements`,
defender-only, so a minnow still cannot touch a giant. A relative bar was
considered and rejected: it would break the single realm-wide grip number at
`hud.ts:338` and the notices that ask what lead anyone needs against your realm.

## Change 1: deterministic passive Fortify from incorporated lands

In `beginTurn`, alongside the existing `tickLoyalty` call - same shape, a per-turn
passive derived from state.

```
passive = floor(incorporatedLandsInRealm(actor) / PASSIVE_PER_LANDS)
relations = bumpMightAllBy(relations, actor, living, passive)
```

`living` matches Fortify's own definition: every faction except the actor that is
not incorporated. Emit one log event carrying the count when `passive > 0`, not
one per land, or a 14-land realm prints fourteen lines a round.

Two deliberate properties:

- **Deterministic, so it consumes no rng.** Seeded streams stay aligned with the
  committed fixture, which makes the baseline diff interpretable instead of a
  wholesale reshuffle. Bands still move, but because behaviour changed, not
  because draw order shifted.
- **Not doubled by Favourable omens.** Computed outside the card path, so it
  never touches `mult`. A garrison must not eat the reading the player was saving
  for a Raid.

Fortify is defensive as well as offensive here, which is why this one mechanic
serves both halves of the intent: the bar is `2*lands + settlements`, but a
rival's *lead* against you is `their.might - your.might`, so raising your own
counter cancels their lead as well as building yours.

Known wart: `floor` creates plateaus - at `PASSIVE_PER_LANDS = 5`, realms of 11
and 13 incorporated lands both yield `+2`, so the drift between near-peers is
zero. Change 2 is what carries near-ties; this change carries the broad
size-buys-tempo intent. If the sweep shows the passive needs to break ties on its
own, the fix is a per-faction remainder accumulator (add `N` per round, grant
`floor(acc / k)`, keep the remainder), which is exactly linear with integer
output. Do not reach for it unless measurement demands it.

## Change 2: convex Raid

`ai.ts:64` and `game.ts:386-388` both take `borderStrength` raw. Route both
through one helper:

```
raidYield(b) = b * (b + 1) / 2      // triangular
```

`b=1 -> 1` (unchanged), `2 -> 3`, `3 -> 6`, `5 -> 15`, `6 -> 21`.

The convexity only bites once several of your lands touch the same target, which
means you are already large - so the early game, where nearly every faction has
one land and `b=1`, is untouched. That is the intent expressed on the
accumulation side rather than in the bar.

Card text becomes "+1 Might for your first land on their border, +2 for the
second, and so on." Alternative if the sweep says triangular is too weak: `b*b`.

## Change 3: frontrunner scoreboard

Top right. The leader always; plus the player's own row when the player is not
the leader. Two rows maximum. `realmOf(f).length / victoryRealmSize(count)`,
rendered as `14/15 lands - 93%` so the actionable count is visible next to the
percentage.

Purely additive, no rules risk. It also makes the remaining grind legible rather
than invisible, which is the honest presentation of a tail that still exists.

## AI work (required by the repo card rule)

Change 2 alters a card's effect, so the AI must be revisited in this changeset:

- `ai.ts:64` values Raid by raw `borderStrength`; it must use `raidYield`, or the
  policy will undervalue a wide border and keep picking flat gains.
- Raid already has a policy branch and a coverage-map entry; confirm the entry
  still names it, and add tests that Raid is preferred when the border is wide
  and that the passive gain is accounted for where the policy forecasts whether a
  bar is reachable.
- No card is added, so the new discoverability rule does not bite. Raid and
  Fortify are both already deck-buildable and witnessed.

## Constants

Both tunables in one place so the sweep is a single edit:
`PASSIVE_PER_LANDS` and the `raidYield` curve.

## Single verification pass, at the end

Sweep once, then set the constants, then verify once. Nothing re-measured
in between.

1. Tuning sweep, 52 worlds per arm: `PASSIVE_PER_LANDS` in {3, 4, 5} against
   triangular Raid, plus the current rules as control. Pick on two numbers:
   unresolved share at the 300-turn cap, and `medianEndTurn` against the ~150
   target.
2. `npm test`, `npm run build`.
3. `npm run simulate:check` - move any band that shifted, with a measured value
   and a stated reason in the comment, per the file's existing convention.
4. Re-freeze `tests/fixtures/seeded-games-baseline.json`.
5. `scripts/.probe-stall.ts` for the unresolved rate and stall lengths.
6. Chrome pass through the root dev server for the scoreboard.

## Risks to watch in the sweep

- **Snowball.** Median is already 114 turns against a ~150 target and both
  changes push the same direction. If `medianEndTurn` crashes toward 60, raise
  `PASSIVE_PER_LANDS` before weakening the Raid curve - the Raid curve is what
  fixes the endgame, the passive is the broad reward.
- **Mid-game runaway.** A five-land realm faces a bar of 2 against a one-land
  neighbour. Passive gain makes that continuously clearable. Watch
  `medianLargestRealm` and mean incorporations for a map that collapses early.
- **Exact ties.** A true 13v13 may still hang, since both changes scale with size
  and an exact tie has no asymmetry to amplify. Only if the sweep shows one
  hanging does a bar decay or tiebreak earn its place - not before.

---

## Outcome (measured 2026-07-30, at `6336dc7` plus this changeset)

**The goal was met.** `full-deck`, 52 worlds, 300-turn cap: **0 unresolved, down
from 7 (13.5%)**. All three world arms now report `unifiedShare` 1.00, and their
lower bounds were tightened from 0.77/0.81 to 0.85 so a drift back toward
stalling fails the test rather than passing quietly.

`PASSIVE_PER_LANDS = 4`, picked from this sweep:

| arm | unresolved | median end turn |
| --- | --- | --- |
| before this changeset | 13.5% | 114 |
| convex Raid only, no passive | 5.8% | 140 |
| + passive k=3 | 0% | 97 |
| **+ passive k=4 (shipped)** | **0%** | **106** |
| + passive k=5 | 1.9% | 114 |
| + passive k=6 | 1.9% | 109 |

Both changes were needed: convex Raid alone leaves 5.8% hanging, and the passive
alone was never tested in isolation because it cannot break a peer standoff on
its own - that was the point of making Raid convex.

### What it cost, stated plainly

Median resolution is **105.5 turns against the ~150 target**, so the game is now
slightly *shorter* than intended rather than dragging past it. The lever for
lengthening it again is the win threshold in `victoryRealmSize`, not these rules.

Two human-facing bands moved against the player and were re-derived rather than
quietly widened:

- **`competent-full-deck` subjugatedShare: 0.15 -> 0.50.** A skilled player is
  now subjugated in half of games. Attributed by disabling the passive and
  re-running: convex Raid alone accounts for 0.38 of the 0.50. This is the
  intended mechanic - large realms out-accumulate small ones, the AI grows and a
  single seat does not - but it is the biggest cost of the changeset. Note it is
  subjugation, not defeat, and vassalage is escapable. `PASSIVE_PER_LANDS = 6`
  measures 0.42 here while still resolving 98% of worlds, if this proves too
  punishing in play.
- **`flailing-full-deck`:** first subjugation moves *later* (26 -> 40) because a
  one-land player is now the narrowest target on the map and nobody spends a
  convex Raid on them, while defeatShare rises (0.27 -> 0.62) because the blow
  lands much harder once it comes.

### Also shipped

Surrender (two-click confirm, own postmortem), the frontrunner scoreboard,
non-interactive learned-cards modal replacing the one-unlock-per-game choice, and
notices for failed Subjugate/Incorporate attempts against the player. That last
one fixed a real bug: `incorporate-failed` was silent on the reasoning that
"nobody else can incorporate a land the human holds", which is false whenever the
human is somebody's vassal - their overlord annexing them ends the run, and a
missed roll left no trace at all.

### Verified

610 tests, `npm run build`, all 7 scenario bands, baseline fixture re-frozen, and
a Chrome pass through the root dev server. The browser pass earned its keep: the
Surrender button was overlapping the deck pile at bottom right and was moved to
the top left, which no unit test would have caught.
