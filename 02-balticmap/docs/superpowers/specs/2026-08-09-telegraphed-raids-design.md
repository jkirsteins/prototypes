# Telegraphed raids: marches, armies and arrows

Implemented 2026-08-09 on `worktree-defense-score`, on top of the 2026-08-08
defense-score rules. This doc records the rules as shipped and the decisions
behind them; `src/marches.ts`, `src/arrows.ts` and the doc comments in
`src/game.ts` are the detail.

## The problem

Every card resolved the instant it was played. `playCard` moved the defense
score in the same call, so an attack was never something anyone could see
coming: the defender learned about a raid from the round-summary modal, after
the fact, and the only counterplay was healing on a hunch.

## The rule

A Raid is **declared** on the turn it is played and **resolves at the start of
the declaring seat's next turn**. In between it is a visible arrow on the map -
source, target, and the exact damage it will deal - and everyone gets one turn
to answer.

Only the Raid family telegraphs. Every other card still resolves at once.

### Marches

`GameState.marches` keys a `March` by direction: actor, `from`, `to`, cardId,
a **frozen** damage, `holdsArmy`, and an expiry on the `src/timed.ts` clock
(declared on turn T stores T+1; `state.turn` is a round counter that bumps on
the wrap to seat 0, so T+1 is that seat's next turn whichever seat it is).

Damage is frozen at declaration and not recomputed. It has to be: Favourable
omens are cashed by `playCard` when the card is played, so a march that
recomputed on landing would find the stack spent. Freezing is also what makes
the number printed on the arrow a promise rather than an estimate - losing your
ruler after drawing the arrow does not disarm it.

### The clash

Resolution is **per axis**, not per march. An axis is the unordered pair of
lands two marches run between; both sides come off the board together and only
the difference lands, on whichever side pushed less hard. Armies **pair off one
for one** in declaration order (`resolveAxis` in `src/marches.ts`), and a
leftover on the longer side meets nobody and lands in full - so the uncontested
case falls out for free, an axis with an empty side having a delta equal to its
full strength. Summing each side was the first shape and is not what the code
does; the pairing comment in `src/marches.ts` says why.

A counter still in flight is pulled in even though its own expiry has not come
round. That is what "resolves at the earlier of the two turns" means, and it is
load-bearing: leaving half a clash on the board would let the attack land first
and the counter it provoked survive to strike an already-battered land.

Three outcomes, all of them reported:

- one side wins: the loser's land takes the difference;
- the counter wins: the difference lands on the **attacker's own** land;
- the two cancel: no score moves, but both armies are spent, and a
  `march-resolved` with no `amount` says so. Silence here was a real hole found
  in the browser pass - you played a Raid, it was answered exactly, and nothing
  anywhere told you.

And whichever side the difference lands on, it may not stop at damage: if what
lands EXCEEDS what that land has standing, the army walks in and takes it
(`capturesOnArrival` in `src/defense.ts`). Symmetric, because it is asked of
the difference and not of the attacker - a counter-raid strong enough overruns
the land the attack was launched from, which is what makes marching out with
your last defenders a decision. Exactly equal is a flattening and not a
conquest, so the two-raid timing game survives the rule.

A march is dropped (`march-lapsed`) if the ground moved under it: its source
left the actor's realm, its source was annexed away, or its target left the
actor's attack reach.

### Armies

`GameState.armies` is sparse with a default of one per land, the
`src/defense.ts` convention (absent key means the default, not zero). A march
holds its source's army until it lands, so armies cap how many attacks a realm
can have in flight. Armies belong to the **land**, so they change hands with it
on Subjugate and Incorporate with no bookkeeping.

Great raid is **one sally that fans out**: the first arrow out of each land
holds that land's army and the rest of its fan ride along free, so the card
still hits every bordering polygon exactly once. Charging an army per arrow was
tried first and rejected - a one-land realm could then draw exactly one Great
raid arrow, which is strictly worse than the Raid it costs the same turn as,
and the card would be dead until a third land.

### Create army

A harvest-only neutral that stations a second army on one land of your realm.
It is **consumed on play** (`CONSUMED_CARDS` in `src/cards.ts`) rather than
discarded: its effect is permanent, and a deck this small reshuffles its
discard back every few turns, so a copy cycling round would compound one pick
into a realm fielding a dozen arrows.

## Events

`damaged` was retired. Every attack lands as a march now, so it had no emitter
left, and a dead entry in four exhaustive registries is exactly the rot those
registries exist to catch. Two types replace it:

- `march-resolved` - `targetFactionId` is the land that took the damage (the
  attacker's own, on a won counter), `sourceFactionId` the other end, `amount`
  what actually moved, `clash` the two side totals when both sides had armies.
  No `amount` with a `clash` is a standoff; neither is `metNothing`, an arrow
  arriving where there was nothing left to move - a demand coming due, or an
  army walking into a land already flat. One line per arrival either way,
  including the arrival that took the land.
- `march-lapsed` - a fizzle, silent in `NOTICE_RULES` because it moves nothing.

Both classify as **nobody's consequence** in `nestsUnderItsPlay`: they resolve
from `beginTurn`, whose batch opens with no play, and the card that caused them
was a turn ago. That keeps `appendEvents`' rule ("caused by this play" is
exactly "not first in a batch that starts with a play") untouched. Because they
are top-level lines they name both ends of the arrow themselves.

## UI

- **Arrows.** One tapered spear per march (`spearPolygon` in `src/arrows.ts`),
  drawn as a filled polygon rather than a stroked line with a `marker-end`: the
  map's stroke widths are user-space constants that do not compensate for zoom,
  so a marker head would swell and shrink independently of its shaft. Red into
  your realm, gold for yours, the attacker's colour faded for a rival quarrel.
  Under the badges, so a shaft never buries a defense number. Hidden while a
  card is armed - targeting cues own the map.
- **Laid out per axis.** The side that declared first (`Axis.opening`) runs
  full size on the line; the side answering it runs smaller, shorter and clear
  of it, because two equal spears nose to nose are one confused shape and which
  is the attack is the whole question. Each side is a bundle laid out side by
  side, so several armies read as several arrows.
- **Anchored on towns.** Ends are the closest pair of settlements across the
  border, not bounding-box centres - these polygons bend around coastline and a
  box centre can sit in a bay, so arrows were starting at sea. Purely
  presentational; the rules never see it.
- **An answerable arrow is a button.** Holding a Raid that could counter it
  makes the arrow itself clickable, no source or target to pick: aiming a
  counter by hand back down an arrow already on screen is the game asking the
  player to restate what it can see. It is the only thing in the arrow layer
  that takes pointer events, and it measures the press against the map's own
  drag threshold so panning from on top of one still works.
- **Two-step targeting.** Raid's first click picks the land the army marches
  out of, which is a real decision because that is the land a counter comes
  back at. The status line asks in those words; "Choose a target" on the first
  click would send the player at the enemy.
- **Army pips** ride above each badge, hollow while committed, capped at five
  and then counted (Create army is uncapped).
- **The clash flash.** A ghost of the arrow fades out under the damage that got
  through - `-3/10` red when it was your land, `+7/10` green when it was
  theirs, `0/10` neutral for a standoff. Input stays locked through it: a march
  is the one thing that moves while the player is not being shown a play.

## Multiplayer

`PROTOCOL_VERSION` 3. `sourceId` rides the play action and is checked
host-side, refused rather than redirected - redirecting would expose a land the
guest never chose to expose.

Nothing else changed, and that is the point of the design: a counter-raid is an
ordinary Raid played on the **defender's own turn**, so telegraphed attacks
need no out-of-turn action. `validateAction`'s "not this seat's turn" refusal
and the AI's one-decision-per-turn shape both survive intact.

## AI

- **5A, answering a march** - a new spine step directly under the heals it
  competes with, because an arrow is visible for exactly one turn. Counter when
  we out-muscle the incoming, or when the hit would open one of our gates.
  Both strategies: every seat starts holding Raids whatever build it picked.
- **Bracing** - step 5 heals against the *braced* score, standing defense less
  what is in the air, netted against our own counter. Repairing a land an arrow
  is already pointed at is a wasted turn.
- **Source picking** - every raid the policy returns picks its own tail,
  preferring the land that best survives being counter-raided.
- **12, garrison** - Create army on a starved frontier land, on the shared
  spine rather than in `warpathBuild`, since a pestilence seat can harvest it.

## Fortify, fixed alongside

Not part of the telegraph, but found by playing it: Fortify healed `1 per
Favourable omens reading held` over the whole realm, so a seat holding no
readings healed **zero** - and Fortify is a third of all plays in the game.
The delay made it worse, because Fortify is the card you most want to react to
an arrow with.

It is a flat `FORTIFY_HEAL = 4` on one chosen land now, aimed inward like
Hillfort and blocked on a land already at full defense. Below Hillfort's 15 on
purpose: Fortify is what every deck starts with five copies of, Hillfort is the
same shape twice as strong and has to be harvested. The AI's step 5 spends the
stronger of the two heals it holds on the land it picks.

8 was the first guess and pushed world medians past 123 with two bands out of
range. Measured down to 4, which keeps the game's pace recognisable.

## Measured

Worlds lengthened by roughly a tenth (medians 81/75/92 -> 89.5/82/91.5) and
still resolve on every arm. Damage barely moved - 1979 per world against 2041 -
so the delay costs tempo rather than output. Targeting diversity improved:
first-legal-target share fell from 52.5% to 40.0%.

`new-player-flailing` needed its turn cap raised from 80 to 150. At 80 its
defeatShare fell to 0.21 while its medianDefeatTurn sat at 78 - the metric had
stopped measuring whether a flailing player falls and started measuring whether
they fall before the horizon. At 150 it answers its own question again: 0.94
fall, median turn 90.

Fixing Fortify then lengthened worlds another quarter, to 110/113.5/114, still
resolving on every arm. Bands re-captured at that pacing.
