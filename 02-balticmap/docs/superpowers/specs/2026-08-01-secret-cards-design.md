# Secret cards

2026-08-01. Bodyguard is the first one.

## The problem

The rules already treat "who has a guard posted" as hidden information, and say
so at length. `failureRiskOf` in `src/playability.ts` returns
`{ kind: "hidden", because: "bodyguard" }` for every Assassinate ruler target
with this comment beside it:

> Unconditional, and it must stay that way: `view.bodyguards` is right there, and
> reading it would turn this warning into a detector telling the player exactly
> which rivals had spent a card defending themselves. The guard is theirs to
> know.

The activity log was that detector. `eventSegments` renders every `play` as
`<actor> played <card name>`, so "Nadruvians played Bodyguard" handed over what
the tooltip had just refused. The targeting UI kept the secret and the log gave
it away three lines later, in the same panel, permanently.

## The shape

A `secret: boolean` on `CardDef`. When a card is secret, the activity log
renders somebody else's play of it as "played a secret card" - the actor, the
verb, and nothing more.

This is presentation only. No rules change, no `GameState` field, no new
`GameEventType`, no rng draw. Nothing in `src/game.ts`, `src/ai.ts` or
`src/sim.ts` moved, so no committed band can shift and `npm run balance` has
nothing to say about it.

### The whole clause is hidden, not just the name

`clause(actor, "play", [t(" a secret card")], "past")` and nothing else. The
card, its target and its suffix all describe the card, and a target alone often
names it by elimination.

Plain text is deliberate here and is not a hole in the naming rule in
`CLAUDE.md`. That rule makes a NAME a node the player can point at; there is no
name here to point at, and nothing in "a secret card" can fall behind a rename in
`src/cards.ts`. `tests/naming-convention.test.ts` states the property directly
rather than leaving it as a side effect of the leak sweep, because a line reading
"Alpha played" would pass that sweep just as well.

### Hidden from them, never from you

`!you`, the same asymmetry the `draw` line already carries: you see which card
you drew and they do not. Your own Bodyguard logs by name. A player who cannot
read back their own turn is not being kept in suspense, they are being lied to.

### Two constraints no type can check

Both live in the doc comment on `CardDef.secret`.

**A secret card must move no relation counter.** `impactText` prints
`(Might +1 -> 2)` beside the line from the event's own `amount`/`track`, and
nothing here hides that suffix. A secret card that moved a track would be named
in all but words. Bodyguard moves nothing. `tests/cards.test.ts` pins the secret
set to exactly `["bodyguard"]` so the next card marked secret has to be checked
against this before the list grows, and a hud test asserts a secret line carries
no `.log-change` at all.

**Secrecy is not a discovery route, and it removes none.** A card is learnt from
a pack - `openPack` in `src/meta.ts` is the only writer of `knownCards` - never
from witnessing it played. Hiding the name in the log therefore costs Bodyguard
nothing: it is in `ACQUIRABLE_CARDS` and reachable exactly as before. A card
whose only route was being witnessed must not ship regardless (repo `CLAUDE.md`),
so marking one secret could never be what broke it.

`secret` is required on `CardDef` rather than optional so the exhaustive
`expectProps` sweep in `tests/cards.test.ts` makes a new card decide. Same guard
style as `NOTICE_RULES` and `POLICY_COVERAGE`: prose did not work.

## Revealing

A secret is not permanent. Two things end one.

**The postmortem reveals everything.** `pmLog` passes `reveal: true`. The run is
over; a player reading back a finished game is owed what everyone was holding.

**A spent guard reveals itself.** When a blade comes back turned aside, the
player knows what the target was holding whether the log says so or not - and a
log that then kept insisting on "a secret card" would be the one thing in the
panel actually lying to them. `revealedSecrets(state)` walks the log and returns
the indices of secret plays that are now public.

There is exactly one clause today: a `play` with `prevented === true` spent the
guard of `targetFactionId`, revealing that faction's most recent not-yet-revealed
secret play. That is exact rather than approximate, and for two reasons that must
both hold before a second clause is added: `cardBlockReason` makes a second
Bodyguard illegal while the first is unspent, so a faction never has two secrets
in flight; and Bodyguard is the only secret card, so there is no second kind of
secret to confuse it with. A second secret card states its own link there rather
than inheriting this one.

### Per play, not per faction

The reveal is keyed by the log index of the individual play. Keying it by faction
would un-hide every future guard that rival posts, which is the detector this
change exists to remove - one fizzled assassination and Bodyguard would be public
for that rival for the rest of the run. `tests/hud.test.ts` has this as a named
test, and it is the one that fails under a per-faction implementation while
everything else still passes.

### Derived, not stored

`revealedSecrets` reads the log; it is not a `GameState` field. What the player
has seen is a fact about the player, not about the board, so it lives beside
`isObservable` in `src/hud.ts` with the rest of the knowledge model. The rules
stay untouched and the reveal cannot desynchronise from the log it is read from.

### Rewriting a line already on screen

`renderLog` appends; it never used to go back. It now keeps `entryByIndex` (log
index -> rendered element, sparse where `isObservable` dropped one) and
`shownRevealed`, both cleared with `renderedEvents` when the panel resets.

A reveal detaches the existing `.log-change` span, replaces the entry's segments
with the revealed ones, re-appends the span, refreshes `data-factions` and
re-runs the highlight. Preserving the suffix rather than rebuilding it is the
point: the suffix comes from `walkStandings` over the batch that produced the
event, and that batch is long gone by the time a reveal fires several turns
later. By the constraint above there is never a suffix on a secret line - but
carrying it is two lines that cannot be wrong, where rebuilding it from a walk
that no longer exists could be.

A play revealed by something in its own batch renders revealed from the start.
There is nothing to flash at a player who never saw the hidden version.

`.log-revealed` is a one-shot CSS animation, longer and warmer than `.log-new`
because it has to be noticed several screens above where the player is looking
rather than at the bottom edge where new entries arrive. Nothing in the game
logic waits on it, so the "never re-derive an animation's duration" rule has
nothing to bite on here.

## Deliberately unchanged

- **`POLICY_COVERAGE`**: bodyguard already has `8c: post a guard` in
  `src/ai.ts`. No rules change, so no new branch.
- **`NOTICE_RULES`**: no new event type. Bodyguard raises no modal today and
  still raises none.
- **`ai.ts` reads `state.bodyguards` directly** and so still knows who is
  guarded. That omniscience predates this and is a separate question.
- **`pmBuildup`** names cards in plain text, and does not hide a secret one -
  the postmortem reveals everything. No secret card can reach it today anyway:
  it keeps only plays aimed at the human and Bodyguard is untargeted. A future
  *targeted* secret card is the case that would land there, and it is the second
  of the two places such a card must check.
