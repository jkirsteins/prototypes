# Hostages - design

Prototype 03. A hostage situation presented as an FTL-style text event, running a
two-sided card duel underneath. One scenario, built deep: a home invasion, you and
your wife, and an escaped murderer who wants to know where the money is.

## 1. Premise and scope

You are taped to a dining chair in your own living room. Your wife is on the couch.
The man who kicked the door in has a knife and one question. He wants three pieces
of information; you have exactly three to give, and giving up the third loses the
run.

MVP ships **one** taker archetype (The Convict, an escaped murderer) and **one**
relation (wife). Other archetypes and relations are explicitly out of scope until
the loop proves fun. Escape as an alternate win condition is out of scope; the only
victory is overpowering him.

Stack matches the sibling prototype `02-balticmap`: Vite, vanilla TypeScript, no UI
framework, vitest with happy-dom, `base: "/prototypes/03/"` so the shared GitHub
Pages workflow picks it up.

## 2. Actors and attributes

| Actor | Willpower | Vigor | Other |
| --- | --- | --- | --- |
| You | 6 | 6 | starts `Bound` |
| Wife | - | 4 | Bond 3 |
| The Convict | 6 | 8 | armed (`WeaponDown` false) |

Willpower is the mental track and the coercion lever. Vigor is the physical track.
The wife has no Willpower; she is not an agent.

**Bond multiplier.** Vigor damage dealt to the wife also costs you Willpower equal
to `damage * bondMultiplier`. Bond 3 (wife) gives a multiplier of 2. The field
exists so future relations can vary it: Bond 1-2 gives 1, Bond -1 gives 0 and
instead grants you +1 Willpower.

### States

On the Convict:

- `Distracted(n)` - decrements at the end of each of his turns. Gates several of
  your offensives and forbids his `Brace`.
- `Off-balance` - a boolean, cleared the moment it is consumed by a card.
- `WeaponDown` - his knife is out of his hand. Forbids his knife cards.
- `Incapacitated` - set when his Vigor reaches 0. See section 6.

On you:

- `Bound` - forbids most physical offensives.
- `Toppled` - you and the chair are on the floor. See `Rock the Chair`.

### Scene

The scene is state, not scenery. Every spatial value gates cards on both sides.

- **Zone**: `LivingRoom` or `Bedroom`. Only `Lamp Cord` is zone-gated today; the
  field exists so the second knowledge card has a mechanical consequence.
- **His range**: `Near` or `Away`. His `Backhand` and `Butt of the Knife` need
  `Near`; his `Ransack` sets `Away`; all your physical offensives need `Near`.
  Cards that move him are therefore tempo cards.
- **Your posture** is derived from `Bound` and `Toppled`, not stored separately:
  bound in the chair, toppled on the floor, or free and standing.

## 3. Cards

Every card has an id, a side, a kind (`offensive` or `defensive`), optional tags, a
requirement predicate, a list of typed effects, rules text, flavour text, and a
narration template for the log.

Effects are **data**, never inline functions:

```ts
type Effect =
  | { kind: "damage"; target: Target; amount: number }
  | { kind: "willpower"; target: Target; amount: number }
  | { kind: "setState"; target: Target; state: StateKey; value: boolean | number }
  | { kind: "setRange"; value: Range }
  | { kind: "setZone"; value: Zone }
  | { kind: "negateLead" }
  | { kind: "reduceIncomingDamage"; factor: number }
  | { kind: "redirectToPlayer" }
  | { kind: "stripCoercion" };
```

The same objects drive resolution, log narration, and assertions in tests.

### 3.1 Player deck (16 cards, 13 unique)

Offensive:

| Card | Requires | Effect | Answerable by |
| --- | --- | --- | --- |
| Wiggle Out of the Ropes | `Bound` | clear `Bound` | Expert Knots |
| Rock the Chair | `Bound` | you gain `Toppled` | - |
| Headbutt | his `Near` + `Distracted` | his Vigor -3 | - (Brace needs him undistracted) |
| Kick His Knee | not `Bound`, his `Near` | his Vigor -1, he gains `Off-balance` | Brace |
| Shoulder Charge | not `Bound`, his `Near` | his Vigor -2, or -5 if `Off-balance` (consumes it) | Brace |
| Grab for the Knife | not `Bound`, his `Near`, not `WeaponDown`, (`Distracted` or `Off-balance`) | set `WeaponDown` | - |
| Stall Him With Questions x2 | - | his Willpower -2 | I've Heard That Before |
| Lie About the Money | - | he gains `Distracted(2)`, range -> `Away` | I've Heard That Before |
| Lamp Cord | zone `Bedroom`, not `Bound`, his `Near` | his Vigor -2, he gains `Off-balance` | Brace |

`Stall Him With Questions` and `Lie About the Money` carry the `deception` tag.
`Headbutt` is the only physical offensive legal while you are still `Bound`, which
is what makes the first secret's `Distracted(2)` worth spending early.

Defensive:

| Card | Requires | Effect |
| --- | --- | --- |
| Stoic x2 | any lead | your Willpower +2, applied before the lead resolves |
| Take It For Her | lead has the `threatensWife` tag | you put yourself between them: the wife takes nothing and no Bond Willpower loss applies; instead your Vigor -2 |
| Flinch x2 | lead deals Vigor damage to you | halve that damage, rounded up |
| Talk Him Down | lead has a coercion clause | strip the clause; its damage still lands |

Duplicated cards: `Stall Him With Questions`, `Stoic`, `Flinch`.

### 3.2 The three secrets

Three unique defensive fixtures, permanently in hand, never drawn or discarded, and
always a legal answer to any lead. Playing one as an answer negates the lead
outright, restores your Willpower to 3, applies its state, and removes the card from
the run.

1. **"There's a jar in the freezer."** He walks to the kitchen. Range -> `Away`, he
   gains `Distracted(2)`. Buys distance and time.
2. **"The safe is behind the headboard."** He moves the whole scene. Zone ->
   `Bedroom`, range -> `Near`, he gains `Off-balance` while he claws at the wall.
   Buys a strike window and turns on `Lamp Cord`.
3. **"It's under the floorboard in the nursery."** He has what he came for.
   Immediate loss, resolved before any other effect.

So two are genuinely spendable and the third is the run. When surrendered under
coercion (section 5) the negation does not apply, because there is no lead left to
negate; the Willpower restore and the state still do.

### 3.3 Convict deck (15 cards, 12 unique)

Offensive:

| Card | Requires | Effect |
| --- | --- | --- |
| Backhand x2 | his `Near` | your Vigor -1, your Willpower -1 |
| Butt of the Knife | his `Near`, not `WeaponDown` | your Vigor -3 |
| Where Is It? x2 | - | your Willpower -2, **coercion** |
| Knife to Her Throat | not `WeaponDown` | your Willpower -3, **coercion**, tag `threatensWife` |
| Break Her Fingers | `coercionDefused` is set | wife Vigor -2 (Bond then costs you Willpower -4), tag `threatensWife` |
| Tighten the Ropes | his `Near` | if you are not `Bound`, apply `Bound`; otherwise your Vigor -1 |
| Ransack the Room | - | range -> `Away`, he gains `Distracted(1)`, your Willpower -2 |
| Drag You to the Bedroom | zone `LivingRoom` | zone -> `Bedroom`, range -> `Near`, your Vigor -1 |
| Snatch It Back | `WeaponDown` | clear `WeaponDown`, your Willpower -1 |

Defensive:

| Card | Requires | Effect |
| --- | --- | --- |
| Expert Knots | lead is `Wiggle Out of the Ropes` | negate; your Vigor -1 |
| Brace x2 | not `Distracted`, lead deals Vigor damage to him | negate that damage |
| I've Heard That Before | lead has the `deception` tag | negate; your Willpower -2 |

`Snatch It Back` is the only way he recovers his knife, and it sits in his deck like
any other card, so `WeaponDown` lasts until he happens to draw it. Disarming him is
a real but temporary swing rather than a permanent state change.

`coercionDefused` is a run flag, set the first time you neutralise a coercion clause
(by `Talk Him Down`, or by having Willpower above 0 when the clause checks). It
gates `Break Her Fingers`, so violence against your wife is always a consequence of
a choice you made, never his opener.

### 3.4 Fixtures

- **Bind His Hands** (yours, offensive). Legal only against an `Incapacitated`
  convict. Never discarded; retryable.
- **Not Yet** (his, defensive, once per run). Answers `Bind His Hands` only. Clears
  `Incapacitated`, sets his Vigor to 3, and is spent.

## 4. Turn structure

Hands start at 3, dealt from a shuffled deck. You act first.

A turn is:

1. **Draw 1.** Skipped if the hand is already at the cap of 5.
2. **Lead** exactly one offensive card from hand, or **pass**. Passing draws 1 more
   card instead (still respecting the cap).
3. The other side may **answer** with at most one defensive card, or decline.
4. **Resolve**: the answer's effects apply first, then whatever survives of the
   lead.
5. Both played cards go to their owners' discard piles. Secrets are removed from the
   run instead.
6. **Coercion check** (only after a convict lead; see section 5).
7. **End check** (section 6).

When a deck runs out, its discard pile is shuffled and becomes the new deck. Runs
therefore cannot end by decking out; that constraint may return later.

Defending is not free. An answer spends a card that is not replaced that turn, so a
defensive run leaves you with nothing to press with.

**Toppled interrupt.** If you are `Toppled` at the start of his turn, he spends the
whole turn hauling you and the chair upright: you lose `Toppled`, he ends `Near` and
`Off-balance`, and he leads no card. `Rock the Chair` therefore trades one of your
turns for one of his plus a strike window, and is only legal while `Bound`.

## 5. Coercion

Coercion clauses live on convict offensives and resolve **after** the exchange, not
during it.

1. His coercion card leads and you answer normally (or decline).
2. Effects resolve, including any Willpower you gained from `Stoic`.
3. If the card still carries its clause (`Talk Him Down` strips it) and your
   Willpower is at 0, the clause fires.
4. When it fires you enter a forced-surrender phase. The only legal actions are the
   secrets you still hold. There is no decline.
5. If it does not fire, set `coercionDefused`.

This ordering is the design's centre of gravity. It means a +2 Willpower answer can
lift you back over the line and defuse a threat outright, and it means giving up a
secret is a Willpower reset you may sometimes want to trigger on purpose.

Willpower floors at 0 and never goes negative. Playing a secret sets it to 3.

## 6. Winning and losing

**Incapacitation.** When his Vigor reaches 0 it clamps there and he gains
`Incapacitated`. On his turns while incapacitated he recovers 2 Vigor and does
nothing else. `Incapacitated` clears once his Vigor reaches 4, so knocking him down
opens a window of roughly two of your turns.

**Victory.** `Bind His Hands` against an `Incapacitated` convict. If he still holds
`Not Yet` he plays it, surging to Vigor 3 and clearing `Incapacitated`; you must put
him down a second time, and the second time he has no answer. Landing it wins.

**Defeat**, checked in this order:

1. The third secret is played.
2. Your Vigor reaches 0.
3. Your wife's Vigor reaches 0.

## 7. Opening event

Before the first turn, an FTL-style event screen: the door comes in, and you pick
one of three reactions. Each sets a different opening stance.

| Choice | Effect |
| --- | --- |
| Reach for the phone | Your Vigor 4 (he beat you for it), Willpower 7, he starts `Near` |
| Step in front of her | Wife Vigor 6, your Vigor 5, Willpower 6, he starts `Near` |
| Do exactly as he says | Your Vigor 6, Willpower 4, his Willpower 5 (he thinks this is easy), he starts `Away` |

All three leave you `Bound` in the `LivingRoom`.

## 8. AI

Fully deterministic priority lists. Randomness is confined to shuffling, so a seed
reproduces a run exactly.

**Leading**, first match wins:

1. `Incapacitated` -> recover 2 Vigor, no card.
2. You are `Toppled` -> the haul-up interrupt.
3. `WeaponDown` and `Snatch It Back` is in hand -> play it.
4. Your Willpower <= 2 and a coercion card is legal -> play the one with the largest
   Willpower cost.
5. You are not `Bound` and `Tighten the Ropes` is legal -> play it.
6. `coercionDefused` and `Break Her Fingers` is legal and your Willpower > 4 -> play
   it.
7. `Ransack the Room` is legal and your Willpower > 3 -> play it.
8. Otherwise the legal offensive with the highest total damage, ties broken by deck
   order.
9. Nothing legal -> pass.

**Answering**, first match wins:

1. Lead is `Bind His Hands` and `Not Yet` is unspent -> play it.
2. Lead is `Wiggle Out of the Ropes` and he holds `Expert Knots` -> play it.
3. Lead has the `deception` tag, he holds `I've Heard That Before`, and his
   Willpower <= 3 -> play it.
4. Lead deals him 3 or more Vigor and `Brace` is legal -> play it.
5. Otherwise decline.

## 9. Screens and presentation

Flow: `Title` -> `Opening event` -> `Duel` -> `Ending`, with `Play again` returning
to `Title`.

**Title.** Scenario blurb, `New game`.

**Opening event.** Prose, then the three choices as text options.

**Duel.** One column:

- A status board for all three actors: attribute numbers, state badges, his range,
  the zone, secrets remaining.
- A turn banner that is never ambiguous: `YOUR TURN - lead a card`,
  `THE CONVICT'S TURN`, `HE IS WAITING - answer or decline`,
  `HE HAS YOU - give up a secret`.
- The activity log, newest last, every entry attributed to a side and naming the
  card played, the answer, and the resulting numbers.
- Your hand as text buttons showing rules text and flavour. Illegal cards stay
  visible and greyed with the blocking reason spelled out, for example
  `needs: he is Distracted`.
- Secrets and `Bind His Hands` render in a separate fixtures row, always present.

**Answer prompts** interrupt inline, naming what is being answered, and list only
legal defensive cards plus `Decline`.

**Ending.** The outcome in one line, then an after-action account assembled from the
log: how many turns it lasted, which secrets you gave up and whether each was
volunteered or coerced, your wife's lowest Vigor, whether you forced out `Not Yet`,
the largest single Willpower swing and its cause. Then `Play again`.

Presentation is deliberately plain text. No art, no animation.

## 10. Code layout

```
src/types.ts                 actors, cards, effects, phases
src/rng.ts                   seeded RNG
src/content/cards-player.ts  player deck and fixtures
src/content/cards-convict.ts convict deck and fixture
src/content/scenario.ts      opening event, prose, narration templates
src/deck.ts                  draw, discard, reshuffle
src/legality.ts              one predicate per requirement
src/effects.ts               typed effect application
src/game.ts                  phase machine and end checks
src/ai.ts                    lead and answer policies
src/log.ts                   structured entries and narration
src/summary.ts               after-action account
src/ui/title.ts, event.ts, duel.ts, ending.ts, render.ts
src/main.ts                  bootstrap
src/style.css
```

`game.ts` owns state transitions and never touches the DOM. The `ui/` modules read
state and emit intents. This keeps the whole rules engine testable without a
browser.

## 11. Testing

Vitest, one test file per module, mirroring `02-balticmap/tests`.

- `legality` - every card's requirement, both satisfied and blocked.
- `effects` - each effect kind, including Bond multiplication, damage clamping at 0,
  and Willpower flooring.
- `deck` - draw, hand cap, reshuffle when empty.
- `game` - the exchange order (answer before lead), the coercion-after-resolution
  ordering, the `Stoic` defuse, the forced-surrender phase, the `Toppled` interrupt,
  incapacitation and recovery, `Not Yet` firing once.
- `ai` - each priority rule in isolation.
- `summary` - an account generated from a scripted log.
- Integration - two seeded full runs asserted end to end: one reaching victory
  through `Not Yet`, one losing to the third secret.
- DOM smoke tests under happy-dom: each screen renders, illegal cards are disabled
  with reasons, the turn banner matches the phase.

A browser pass in Chrome before the work is called done, per standing practice.

## 12. Deliberately out of scope

Escape as a win condition. Additional taker archetypes and relations. Relation
specific cards. Deck building or progression between runs. Persistence. Card art.
Decking out as a loss condition.
