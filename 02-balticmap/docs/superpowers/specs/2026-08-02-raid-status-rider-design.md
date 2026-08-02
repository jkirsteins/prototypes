# Raid +1 Status rider - measured and rejected

Status: **rejected 2026-08-02**. No code shipped. This document exists so the
next person who has this idea starts from the numbers instead of re-running
the experiment blind.

## The proposal

Raid would also gain +1 Status over the raided faction (renown from the raid),
on top of its convex Might yield, doubled by Favourable omens like the rest of
the play. Direction chosen in discussion: a bonus to the raider, not a cost.
Shape chosen: flat - every raid gives it - accepting that Raid then covers
Shrewd marriage's core effect against bordering targets and re-tiers on the
next rarity pass.

## What was built (and then reverted)

A full implementation existed and passed every unit suite: `statusGain` on
`raidGainFor`, a `bumpStatusBy` in the raid branch, a `statusAmount` event
field (the both-tracks convention on `GameEvent.track` cannot carry it because
the two magnitudes differ), the second delta in `leadMovesOf`, the two-slice
`(Might +3 -> 5, Status +1 -> 1)` suffix - which needed **no** hud change,
`impactText` and the modal line were already list-shaped - a second
`standingMove` row in `availableImpacts`, the map-tip line, and a Status
entry in the AI's step-6 finishing check.

## Why it was rejected

The `competent-full-deck` pacing gate: a player who plays as well as the
enemies do must not be first subjugated before median turn 22 (band 22..55,
"the world must not be so aggressive that skill stops mattering"). Early bars
are about 2 points, so one-land raids feeding both tracks let the fastest
neighbour clear a status bar in two plays. Measured, 26 games, seeds 1..26:

- flat rider: median first subjugation **9** - far outside 22..55
- rider only on 2+ border lands: median **20** - still outside
- rider only on 3+ border lands: median **17.5** (pre-gate-fix run; the
  variant does not rescue it)
- no rider: in band

Everything else held in every shape: all world bands, the stalemate number,
the other four scenarios. The failure is specifically the early game
becoming lethal to competent play, which is the one thing that gate exists
to refuse. Options were: cripple the rider to 2+ borders AND still lower the
gate's floor, or drop the rider. Dropped.

## A bug worth remembering from the probes

The first version of the AI change added `{ cardId: "raid", field: "status" }`
to the step-6 TRACKS walk without gating on the gain. A finisher check of
`lead + gain >= needed` with `gain = 0` (narrow border) or with the bar
already cleared fires every turn at a target it cannot help, and both the AI
seats and the competent-policy human wasted turns re-raiding cleared targets -
that alone moved the gate's median from in-band to 18 with the rider fully
off. Any future entry in that walk must require the play to actually CROSS
the bar: `gain > 0 && lead < needed && lead + gain >= needed`.

## Also learned

- A rules change to one card re-fits the whole rarity regression: the same
  `npm run rarity` pass moved five other cards' tiers (assassinate-ruler and
  extended-diplomacy up, bodyguard, a-feast and take-hostage down). Tier churn
  on unrelated cards is expected, not a sign the pass is broken.
- The seeded-games baseline (`npm run capture:baseline`) and the scenario
  bands are the two gates unit tests cannot stand in for; the unit suites were
  fully green on a change the pacing gate then refused.
