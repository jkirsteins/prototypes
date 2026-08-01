# Settlement growth and pact cards

2026-08-01. Four new cards, one reworked card, one reworked mechanic.

## Why

Two things in the current card pool are thinner than they look.

**Found a settlement is a one-shot per land.** `settled` is a list of faction
ids, so a land is either settled or not, forever. The map already authors
between 2 and 9 settlement slots per land (`maxSettlements` in `map.json`, one
`unlocked` dot plus the rest locked) and the game uses exactly one of the locked
ones. A land with eight spare slots plays identically to a land with one.

**Alliance is a five-turn truce and nothing else.** It costs a card and a turn
to stop two factions hitting each other. Measured impact 0.156 lands - the
weakest of the two rare cards, and rare only by a judgement call the tier table
itself flags as resting on noise.

Both get a reason to exist, and three cards join them to make the new choices
answerable.

## The five changes

### 1. Found a settlement grows, gated by Population boom

Every land starts with one settlement already standing. **Found a settlement
raises a land to its second**, and that is all it can do unaided.

**Population boom** (new, untargeted) raises the actor's allowance by one.
With one boom held, Found a settlement may take a land to its third; with two,
to its fourth, and so on. The allowance is an "up to", not a step: with two
booms held you may still take a one-settlement land to two.

**Every Found a settlement spends one boom**, floored at zero - including the
one that only reached the base second settlement. That is the cost of the
allowance being an "up to": a boom saved for a big land is a boom not spent on a
small one.

Per land, the ceiling is the map's `maxSettlements`. Saaremaa stops at 2 and can
never take a boom; Eastern Aukštaitija stops at 9.

Nothing else changes: each settlement past the first still adds +1 to the Might
bar rivals need to subjugate that realm, and the Status bar is still untouched.
A big settled realm therefore becomes very hard to take on Might, and the
patient Status siege stays the answer - which is the asymmetry
`gripPartsOn` already documents, now with room to actually bite.

**State.** `settled: string[]` becomes `settlements: Record<string, number>`,
faction id -> settlements *founded* this game (absent = 0). The pre-standing
first settlement is not counted and raises nobody's bar - counting it would add
+1 to every land's bar uniformly, which is no rule at all. `sites: string[]`
becomes `siteCaps: Record<string, number>`, faction id -> locked dots the map
authors for that land (= `maxSettlements - 1`); absent or 0 means the land can
never be built in. `booms: Record<string, number>` joins `omens` as a
faction-keyed count of unspent readings.

**Legality.** Found a settlement is aimed inward at the actor's own realm, as
today, with two block reasons instead of one:

- `no-free-site`: `settlements[land] >= siteCaps[land]`. The map has no dot
  left. Replaces today's reason of the same name and absorbs `already-settled`
  for the 2-slot lands.
- `needs-population` (new): the land already holds
  `SETTLEMENT_BASE_CAP + booms[actor]` settlements. Carries `{ have, allowance }`
  so the tooltip can say what is missing and what fixes it.

`already-settled` is retired: its meaning is now the allowance rule at the base
value.

Population boom is always legal and stacks, like Favourable omens - a held boom
is never a dead card, it just waits for the next Found a settlement.

### 2. Alliance grants a shared-border Might bonus

While a pact between A and B is active, **both allies gain +1 Might against
every faction that borders both realms**. It lapses with the pact. It does not
accumulate: it is one +1 for the pact's whole life, not +1 a turn.

**The affected set is frozen when the pact is sealed.** `alliances` stops being
`Record<key, expiry>` and becomes `Record<key, { expiry, against: string[] }>`,
where `against` is `reachOf(A) ∩ reachOf(B)` minus both realms' own members, at
the instant of sealing. Frozen rather than live for one reason: a live set would
silently change every time either ally conquered a land or a shared neighbour
was incorporated, and a lead that moves with no event behind it is exactly what
`GameEvent.amount` exists to prevent (see the drift rule in CLAUDE.md). Frozen,
it moves exactly twice - at the seal and at the lapse - and both are events.

Being frozen is also what makes it previewable: the card tip can name the
factions the pact will buy you a lead over, before you commit.

**Leads.** `leadsOf` stays a pure read of the relation store. A new
`leadsIn(view, a, b)` in `playability.ts` adds `pactBonusOn(view, a, b)` to
`a`'s Might and subtracts `pactBonusOn(view, b, a)`, and every rules, AI and UI
site that asks "what is A's lead over B" moves to it. `game.ts`'s pre-assassination
Status capture keeps raw `leadsOf`: it reads Status, which no pact touches, and
it runs against a `relations` value mid-mutation.

**The lapse is an event.** `beginTurn` sweeps `alliances` for pacts whose expiry
the turn counter has reached, deletes them, and logs one `pact-lapsed` per pact
carrying the two allies, `track: "might"`, `amount: 1` and the frozen `against`
set. Deleting is what makes "still in the record" the guard against logging the
same lapse twice, and it also stops `alliances` growing without bound.

`pact-lapsed` is a modal notice when the human is one of the two allies: their
Might lead against several factions just dropped, and hostile cards between the
two of them are legal again. Not critical - the expiry turn has been on the card
tip, the map badge and the log line since the pact was sealed.

**Standings.** The alliance `play` event carries `amount: 1`, `track: "might"`
and the frozen `against` list in a new `pactAgainst?: string[]` field.
`leadMovesOf` reads both ends off it: if the human is in `against`, their lead
drops 1 against each of the two allies; if the human is an ally, their lead
rises 1 against each faction in `against`. `pact-lapsed` is the same, negated.
This is the first fan-out event the walk can resolve exactly in both directions -
Fortify cannot, because it does not carry who was alive at the time.

### 3. Distrustful neighbour - the guard against Alliance

Secret, untargeted, no stacking. **The next Alliance sealed with you fails.**
The card is spent, the pact is not sealed, and the guard is consumed.

Secret because the point is that you cannot tell in advance which rival will
turn your Alliance aside - the same reason Bodyguard is secret. The log shows
"plays a secret card" while it is held, and names it once an Alliance against
you comes back `prevented`, exactly as Bodyguard's reveal clause works. You
already know something turned the pact aside; a log that then refused to say
what would be the one thing lying to you.

### 4. Eloping heirs - the guard against Shrewd marriage

Secret, untargeted, no stacking. **The next Shrewd marriage against you fails.**
Same shape, same reveal rule.

### 5. A feast - Fortify on the Status track

Untargeted, +1 Status over every other living faction at once. Doublable by
Favourable omens, like Fortify.

Status has had exactly one source all game: a single Shrewd marriage, +1 a play,
one target at a time. Might has Raid's convex yield, Fortify's fan-out and the
garrison tick. `gripPartsOn` sets the Status bar *lower* than the Might bar
precisely because Status climbs so slowly - but the Status siege is still the
only answer to a heavily settled realm, and change 1 above makes those realms
much more common. A feast is the second Status source that makes that answer
reachable.

## Three guards, one table

Bodyguard, Distrustful neighbour and Eloping heirs are one mechanic:

```ts
export const GUARDS: Readonly<Record<string, string>> = {
  "bodyguard": "assassinate-ruler",
  "distrustful-neighbour": "alliance",
  "eloping-heirs": "shrewd-marriage",
};
```

Everything that is card-specific about Bodyguard today becomes a lookup through
this table:

- `GameState.bodyguards: string[]` -> `guards: Record<string, string[]>`, guard
  card id -> faction ids holding it unspent.
- `playCard`: one branch. A targeted card whose id appears as a value in
  `GUARDS`, aimed at a faction holding the matching guard, consumes the guard,
  sets `prevented` and skips the effect. Assassinate ruler's `targetRuler` stamp
  stays card-specific.
- `cardBlockReason`: `already-held` for any guard card whose holder list already
  contains the actor.
- `failureRiskOf`: `{ kind: "hidden", because: <guard card id> }` for any card
  with a guard. Alliance and Shrewd marriage become fallible cards, and both
  gain a `CARD_RISK` line and a per-target risk row.
- `revealedSecrets`: the pending queue keys on `factionId|cardId` rather than
  `factionId`, and a `prevented` play pops from the queue for
  `guardAgainst(e.cardId)`. Exact rather than "most recent secret" - which the
  current doc comment explicitly says a second secret card must replace, because
  a faction can now hold all three guards at once.

The secret set and the guard set become the same set, and `tests/cards.test.ts`
pins that identity rather than pinning the literal `["bodyguard"]`. Both
constraints on a secret card still hold for all three: none moves a relation
counter, and each has a reveal clause.

## AI policy

New `POLICY_COVERAGE` entries, all naming a real branch rather than leaning on
the last-resort fallthrough:

- `population-boom` - **8d**: raise the population before settling. Fires when
  Found a settlement is in hand and every land of the realm is blocked by
  `needs-population` rather than `no-free-site` - that is, when a boom would
  unlock a target the actor otherwise has none of.
- `a-feast` - **7**: the defensive fan-out step, which stops being
  Fortify-specific. Fortify answers a rival leading on Might, A feast answers one
  leading on Status. Holding both, the more threatened track goes first.
- `distrustful-neighbour` - **8e**: refuse a pact you would rather not be
  offered. Fires when some faction in reach is within two plays of being
  subjugated by the actor: a pact sealed with it would freeze that conquest for
  five turns, which is the same reasoning step 5 already uses to refuse allying
  with its own best target.
- `eloping-heirs` - **8f**: guard the marriage bed. Mirrors 8c: fires when the
  nearest Status threat is within two of clearing its bar, which is exactly the
  position step 6 hunts with Shrewd marriage.
- `found-settlement` - branches 7b and 9b unchanged; they read
  `validTargetsFor`, which the new legality already answers.

## What it cost elsewhere

Growing the pool from 12 deck-buildable non-basics to 16 turned out to matter
more than any of the five changes.

**Enemy decks got a quarter denser.** `buildAiDeck` rolls each non-basic at 0.5
against a `DECK_SIZE` cap, so a bigger pool means a fuller enemy deck: 8.66 live
cards of ten rather than 6.99, measured over 5000 decks. No card changed what it
does; there is simply more happening per rival per round.

The `flailing-full-deck` scenario is what caught it, and it is re-banded rather
than diluted back - an enemy holding turnips instead of cards is not a
difficulty knob worth having, and the roll is what gives each seat a deck of its
own. The player who holds every card and plays the leftmost one now falls at
turn 10.5 rather than 40, and is taken as a vassal in 96% of games rather than
79%. What did *not* move is `defeatShare`, still 0.73 inside its old band: the
extra subjugations are ones they revolt back out of, which is the Seeds of
revolt slot doing its job. The other seven scenarios hold their existing bands,
including `competent-full-deck` - skill still matters.

**Every measured impact roughly halved,** for the same reason: smaller human
realms compress the outcome the regression fits against. Subjugate 0.684 ->
0.270, Fortify 0.516 -> 0.247, Incorporate 0.591 -> 0.192. That emptied the epic
tier against the old 0.389 cut, so the thresholds are re-cut in the gaps of the
new table: epic at 0.120 (the 0.104 chasm between A feast and Found a
settlement, twice the width of anything else) and rare at -0.017.

Resulting tiers, from `npm run rarity` at 1500 decks:

| tier | cards |
|---|---|
| epic | Incorporate (0.192), A feast (0.172) |
| rare | Found a settlement (0.068), Shrewd marriage (0.066), Favourable omens (0.041), Assassinate ruler (0.021), Extended diplomacy (0.010) |
| common | Alliance (-0.043), Population boom (-0.049), Bodyguard (-0.059), Eloping heirs (-0.068), Distrustful neighbour (-0.069) |

**A feast is the strongest new card by a distance** and the only one that
reaches epic. That is the Status track being starved: it had one +1-a-play
source and now has a fan-out, and the fan-out is what makes the Status siege a
real answer to a settled realm.

**Alliance measures negative even with the new bonus.** The pact buys Might for
*both* sides, and the truce freezes the actor's own conquest for five turns, so
the card pays a rival as much as it pays you. Worth watching in play: if it
stays a trap, the bonus wants to be one-sided rather than mutual.

Sim baselines all moved with the rng stream and were recaptured.

## Deliberately not doing

- **No new track, no new counter on the map.** Population boom is a hand-held
  allowance, not a resource bar.
- **No live shared-neighbour set.** See change 2.
- **No stacking guards.** Each of the three refuses a second copy while unspent,
  as Bodyguard does.
- **Alliance is not doublable.** A reading doubling a bonus that also lands on
  somebody else's side of the pact is a rule nobody would guess.
- **The `settled` event keeps its wording.** "founds a new settlement", not
  "founds a third settlement": the ordinal would need a new event field for a
  cosmetic gain, and the map dot and the bar tooltip already carry the count.

## Verification

`npm test` and `npm run build` must pass. The exhaustive registries do most of
the guarding: `NOTICE_RULES` and `nestsUnderItsPlay` will not compile until
`pact-lapsed` is classified, `POLICY_COVERAGE` fails until each new card names a
branch, `tests/naming-convention.test.ts` drives every event type through both
text producers, and `tests/standings.test.ts` replays seeded games against the
real relations - which is what will catch a pact seal or lapse that forgot its
amount.

Then play it in the browser through `http://127.0.0.1:4173/prototypes/`. All of
the following were driven through a real run to turn 30:

- **Settlement growth.** A land reached four settlements, and the hover
  breakdown read `Might -1/7. Your thresholds: 4 from realm size (2 lands), +3
  from 3 settlements` against `Status +1/2` with no settlement term - the
  asymmetry the whole change rests on, at a depth one settlement per land could
  never reach. Each founding drew the next authored dot.
- **The allowance.** Holding two booms, the card tip read `2 population booms
  held: your people support 4 settlements in a land`, and a land already at four
  came back `4 settlements here already, and your people support 4. A Population
  boom raises that by one.`
- **The pact.** The armed-card preview named the frozen set before committing
  (`+1 Might for both of you against the 1 faction bordering both realms, until
  the pact lapses`), the Might badges moved to `M+1` against the shared
  neighbours, and the lapse raised its own modal (`Your pact with Lietuva has run
  out (Might 0 -> -1)`), once per pact.
- **The guards.** A rival's Shrewd marriage came back `- prevented`, and that
  faction's earlier `played a secret card` line rewrote itself to `played Eloping
  heirs` while their *other* held secret stayed hidden - the per-card reveal
  doing what a per-faction one could not.
- **A feast** logged `+1 Status against all`.

**One bug the browser pass caught that the tests did not:** a sealed Alliance
logged `+1 Might against all`, borrowing the fan-out wording for a card that
hits only the shared neighbours - and reading as a gain even when a rival's pact
had landed on you. `impactText` now separates the bounded case from the fan-out,
and `tests/hud.test.ts` pins both forms.
