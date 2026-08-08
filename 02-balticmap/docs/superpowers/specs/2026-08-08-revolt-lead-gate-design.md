# Revolt lead gate

2026-08-08. Supersedes the "Revolt carries no lead condition" invariant that
the 2026-07-30 reclaim-cut design and the 2026-07-28 notices-followups design
both state - those documents stay as history of why Revolt exists at all.

## The rule

Playing Revolt is legal only when the vassal's live Might lead over its
DIRECT overlord meets a threshold:

    lead >= REVOLT_BASE_THRESHOLD - fullRealmOf(lord).size        (base 4)

- The realm size is the scoreboard number - the lord, every vassal to any
  depth (the revolting vassal included), plus annexed lands. A lord whose only
  holding is you gives a threshold of 2; at four lands the gate stands open at
  0; past four it goes negative and even a vassal at a deficit may walk.
- The lead is `leadsIn` - the live rules read, pact bonuses included - so any
  card that moves the pair moves the gate with it, today and in the future.
- `revoltRequirement` in src/playability.ts is the one spelling of the rule;
  legality (`revolt-lead` block reason), the hover prose and the tests all ask
  it. The hostage lock still outranks the gate, for the subjugate-precedence
  reason: a gate nothing the actor plays can lift comes first.
- The lord's Seat of power is deliberately NO term here: `SEAT_BAR_BONUS`
  guards the ruler against subjugation, not its hold over vassals. A test
  pins the non-interaction.

## What feeds the pair, and what must not

The design intent is that the gate opens mainly through the lord's growth.
Two vassal-side income streams therefore skip the DIRECT overlord:

- The Fortify fan-out (playCard) and the passive garrison tick (beginTurn)
  exclude the actor's direct lord. A grand-lord is still hit - only the one
  fealty link is protected. The skipped lord is frozen on the event as
  `overlordFactionId`, because the standings walk runs after the batch, when
  the overlord may already have changed (the `pactAgainst` precedent).

Deliberately kept:

- The tribute-shortfall bump (lord gains against an underpaying vassal) - it
  drives the vassal's lead negative and the revolt further away, which is the
  lord's enforcement mechanism working.
- The Revolt parting blow (+1, omen-doublable) and the +1 poach penalty.
- Pact bonuses through `leadsIn`.

## Subjugation resets the vassal's side

Every successful subjugation clears the raw counter vassal -> new lord
(`resetMight` in src/relations.ts - one direction only; the lord's grip, which
prices the poach surcharge, survives). A vassalage therefore opens with the
gate at the lord's realm size alone, less whatever grip the lord had built.
The cleared value rides on the `subjugated` event as `amount` (omitted at 0),
or the standings walk could not replay the move; `leadMovesOf` emits it beside
the un-carried constant +1 poach penalty.

## AI

Step 2 (revolt-first) is unchanged in code: `playableSet` is the legality
guard, so the AI revolts the moment the gate opens and never before, with no
second reading of the rule to drift. The step-7 Fortify threat scan now
ignores a lead held only by the direct lord - the fan-out cannot answer it,
so playing Fortify against it would be a play-because-held.

## Stranded

A held Revolt behind a closed gate is NOT a dead run: the threshold falls
with every land the lord takes, so the card remains an escape the board moves
toward. `isStranded` is unchanged - only a vassal holding neither a Revolt
nor a Seeds of revolt in any pile is finished.
