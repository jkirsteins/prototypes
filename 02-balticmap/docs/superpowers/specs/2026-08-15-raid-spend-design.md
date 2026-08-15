# A raid is as strong as the land behind it is willing to bleed

A Raid deals a flat 1. Strong raid deals 2, Great raid deals 1 per arrow, and
the only dial the player holds is which card they happen to have drawn. The
attack half of the game therefore has no decision in it: the target is a
choice, the source is a choice, and the force is whatever the card says.

This makes the force a choice too. A raid card spends defense out of the land
its army marches from, 1:1, and the arrow lands for what was spent. Raiding
hard leaves that border land soft, and the softness is on the map for every
rival to read.

## What a raid costs

A raid card commits one free army out of its source land, exactly as it does
now, AND spends defense out of that same land. The army comes home by lapsing;
the defense does not. It is gone until healed - Fortify, Hillfort and the
harvest heal are the way back - and that permanence is the whole tension: an
army you get back is a loan, and a card whose cost is a loan is not a decision.

The ceiling is a fraction of the source land's CURRENT defense, not its
maximum. A land already wounded raids more feebly, which is what makes a
successful counter-raid worth more than the point it took off the score.

| card        | may spend                        | at 5 / 6 | at 1 / 6 | at 0 / 6        |
| ----------- | -------------------------------- | -------- | -------- | --------------- |
| Raid        | half, rounded up                 | 1..3     | 1        | no legal source |
| Strong raid | all of it                        | 1..5     | 1        | no legal source |
| Great raid  | all of it, per land, pooled      | 0..5     | 0..1     | out of the fan  |

Great raid's per-land figures start at 0 because the pool may leave a land
nothing - see below. Its total never does.

The minimum is 1. A land with nothing left to spend has no raid in it, and
that is stated as legality rather than as a zero-strength arrow: an arrow on
the map is a promise of damage, and a 0 STR arrow that exists only to soak a
counter is a second thing arrows mean.

**`STRONG_BONUS` stops reaching raids.** Strong raid's identity moves from
"one more damage" to "may spend twice as deep", which is the same card one
better in the sense the strong pair has always meant - a seat that traded up
did not get a different card, it got more of the one it had. The constant
stays where it is for the fortify pair, which is untouched.

### The table, and why it stays a table

`ATTACK_DAMAGE` in `src/defense.ts` is retired and replaced by

```ts
export const RAID_SPEND_FRACTION: Readonly<Record<string, number>> = {
  "raid": 0.5,
  "strong-raid": 1,
  "great-raid": 1,
};
```

with one reader:

```ts
export function spendCeilingFor(cardId: string, current: number): number {
  const fraction = RAID_SPEND_FRACTION[cardId] ?? 0;
  return Math.max(0, Math.ceil(current * fraction));
}
```

A fraction table rather than a table of functions, because `CARD_RULES` in
`src/cards.ts` has to fingerprint it and a function does not stringify. It
takes `ATTACK_DAMAGE`'s slot in `CardRules.attackDamage`, renamed
`raidSpendFraction`, so `cardRulesHash` still refuses a handshake between two
deploys whose raid ceilings differ. That is the point of the hash: two builds
that disagree about how hard a Raid can hit disagree about what the player's
own card is about to do.

The table survives for the reason it was made a table in the first place - a
new attack card gets 0 here rather than quietly inheriting a Raid's ceiling
from an else branch.

## Great raid's pool

Great raid sends one arrow per land of the realm bordering the target
(`greatRaidMarches` in `src/playability.ts`). It asks for ONE total, N, and
spreads it across the fan. Each land is capped at its own current defense.

N is spread as evenly as those caps allow: a land that hits its cap stops
taking points while the others keep climbing. The ceiling on N is the sum of
the caps.

```
Selonians 6 / 6, Semigallians 4 / 4, Latgallians 3 / 9   ->  N up to 13

N = 2    ->  1, 1, 0        two arrows
N = 6    ->  2, 2, 2
N = 11   ->  4, 4, 3
N = 13   ->  6, 4, 3
```

The remainder goes in FAN ORDER - the order `greatRaidMarches` returns, which
is map order - so a seeded run splits the same way every time and the tally
the player watched is the tally that gets declared.

**A land allocated 0 sends no arrow.** At a low total the fan is narrower than
the border, and that has to be true rather than fudged: the minimum is 1
everywhere, so a 0 STR arrow cannot exist here either. Dropping the land drops
its army commitment with it, since `greatRaidMarches` is what decides who
holds an army. A Great raid at N = 1 is therefore one Raid out of the realm's
strongest bordering land, which is a legal and deliberately poor play.

The allocation is a pure arithmetic helper in `src/defense.ts`, knowing
nothing of marches or realms:

```ts
export function allocateSpend(
  caps: readonly number[], total: number,
): number[];
```

`src/playability.ts` composes it with `greatRaidMarches`, because that is
where the fan already lives. Its own test file walks the boundaries: a total
of 0, a total above the sum, one land, a fan where every cap is 0.

**A Great raid whose fan can spend nothing is not playable**, the same rule
as a Raid out of an empty land. `handBlockReason` gets it for free once the
ceiling is what legality asks about.

## Asking the player

The flow gains one step at the end:

    arm the card  ->  click the source  ->  click the target  ->  slider  ->  play

(Great raid has no source click - `MARCH_CARDS` is `raid` and `strong-raid` -
so for it the slider follows the target click directly.)

The slider is an overlay built on the transfer-offer shape already in
`src/hud.ts`: one row per source land naming the land and what it would be
left with, the arrow strength beside the slider, and two buttons.

```
Raid   Selonians -> Jersikans

[==========--------]   3 of 3          arrow: 3 STR
Selonians                          keeps 2 / 6

           [ Send them ]   [ Cancel ]
```

```
Great raid   -> Jersikans

[============------]   8 of 13         3 arrows
Selonians       spends 3      keeps 3 / 6
Semigallians    spends 3      keeps 1 / 4
Latgallians     spends 2      keeps 1 / 9

           [ Send them ]   [ Cancel ]
```

The tally is the whole point of the single slider: the player drags one
number and reads off which lands are about to be emptied for it. A land that
has hit its cap stays put while the rows below it climb, which is how the
allocation rule is TAUGHT rather than written down somewhere the player will
not look. A row allocated 0 stays visible, greyed, saying "sends nothing".

Land names are `faction()` segments and not text, per the naming rule, so
pointing at one lights its realm on the map while the player is deciding how
much of it to spend.

**This overlay cancels, and the transfer offer does not.** The difference is
real: a transfer is asked after the land has already changed hands, so backing
out and confirming 0 lead to the same place. Here nothing has happened yet -
the card is still in hand and the army has not left - so Cancel returns to the
armed state with the source still picked.

### The amount rides the play decision

`spend?: number` joins the `play` decision in `src/decisions.ts`, the
`NetAction` play in `src/net-protocol.ts`, the `AiAction` play in
`src/ai.ts`, and `playCard`'s `opts` in `src/game.ts` - the same four places
`sourceId` already sits, for the same reason. There is no new `DecisionKind`
and no new `DECISION_ROUTES` row: the amount is part of playing the card, not
a question raised about a play that already happened.

So the guest raises its own overlay, sends the number with its play, and the
router does not learn a fifth thing. The host re-clamps `spend` against the
ceiling it computes itself, exactly as `net-protocol.ts` re-validates
`sourceId` against `marchSourcesAgainst` today - a wire is the same attack
surface as a hand-edited record.

An omitted or out-of-range `spend` is clamped into `[1, ceiling]` rather than
refused. An AI seat that names none, a replayed URL, an older build's action:
all of them mean "as little as the card allows", which is the safe reading.

### What the map says before the amount is settled

The hover preview and the aim-preview arrow quote the CEILING while aiming -
"up to 3" - because the amount is not chosen yet and a preview that quoted 1
would be describing the least the card can do. `attackImpactOn` gains the same
treatment: it answers "what could this card take off that land", and its
callers are the card tip and the land hover, both of which are read before the
slider exists.

`capturesOnArrival` is untouched. Whether the ceiling would take the land is
a question the hover may answer separately; whether the arrow that was
actually sent takes it is decided at arrival off `March.damage`, as now.

`attackImpactOn` answers "what could this card take off that land", so for a
pooled Great raid it is the whole pool and not one arrow's worth: the total
is `(N + arrows * leadership) * multiplier`, since the leader's bonus is
added per arrow while the spend is divided between them. Its existing
`arrows` field still says how many blows that is, which is what stops the
card tip promising one big hit for a play that lands three small ones.

## The damage, and the leader, and the readings

`attackDamageFor` in `src/playability.ts` gains a `spend` argument:

```ts
damage = (spend + leadershipBonus(view, actor, cardId)) * omensMultiplier(...)
```

The shape is unchanged - `spend` simply takes the place `ATTACK_DAMAGE[cardId]`
held. Two consequences follow from leaving it alone:

- **Favourable omens doubles the arrow and not the price.** Spend 3 holding a
  reading and the land pays 3 while the arrow lands 6. That is what makes a
  reading worth holding rather than a discount worth spending, and it is the
  same relationship the card has always had to a raid's damage.
- **A leader's raid prowess still adds flat.** A hardened chief makes every
  raid one better whatever it cost, which keeps the ability worth having on a
  seat whose lands are too poor to spend deep.

Every caller must now name a spend. There are four:

1. `playCard`, from the decision.
2. The restless raid in `beginTurn` (`src/game.ts`) - see below.
3. The AI, through its new policy branch.
4. The hover and card-tip previews, which pass the ceiling.

`March.damage` still freezes at declaration and is still what the arrow
prints, which is why the number on the arrow is a promise: the defense was
already spent when the arrow appeared.

## `levied`: the log line for spending your own blood

Nothing in `GameEventType` describes a land losing defense to its own side's
play. `plagued` and `march-resolved` are the two lines that move a defense
score down, and both mean "somebody did this to you". Borrowing either would
put a line in the player's log saying their own land was attacked by the raid
they chose to send.

So `levied` is a new `GameEventType`, pushed as a consequence of the play -
which means `playCard` pushes it onto the play's own batch and it indents
under the play in the log without any branch saying so, per the consequence
rule. It carries `targetFactionId` (the source land) and `amount` (the spend),
so `impactText` renders `(Defense -3 -> 2)` beside it from the same walk
everything else uses.

One event per land. A Great raid across three lands levies three times, each
naming its own land and its own number, because the badge walk is per-polygon
and one line carrying a total would have nowhere to land.

Three exhaustive records refuse to compile until `levied` is classified, and
each answer is written here so the implementation is not inventing them:

- **`NOTICE_RULES`** (`src/notices.ts`): `silent`, reason "the player chose
  it; the play line above it names the card and the log carries the number".
  A modal telling you what you just decided is a modal that teaches nothing.
- **`PRESENTATION_RULES`** (`src/presentation.ts`): `presented`, returning a
  beat with the source land's `BadgeWalk` and NO camera and NO label - the
  `causedHere` shape. The player is looking at the land they aimed out of; the
  badge simply walks down to the number it now holds. On a land whose badge is
  not drawn at all, `causedLabel` raises the sentence instead, which is the
  existing gap-filler and needs no new machinery.
- **`EVENT_SOUNDS`** (`src/audio-manifest.ts`): null, with the reason on the
  `PRESENTATION_RULES` entry - the play's own card sound already fired, and a
  second cue on the same gesture reads as two things happening.

## Legality

`marchSourcesFor` in `src/playability.ts` currently asks for a free army. It
now asks for a free army AND `spendCeilingFor(cardId, defenseOf(view, land))
>= 1`. It already takes the card id, so this is one clause.

The knock-on is that a land at 0 defense is not a legal source for any raid
card, which is visible everywhere legality already is: the map does not light
it on the source click, `handBlockReason` explains a hand that cannot raid,
and `attackReach` is unaffected because reach is a question about borders and
not about strength.

**The raid keyword's repeat rule is untouched and now has a second bound.**
`turnAccepts` and `repeatGroup` do not change. What stops a run of raids was
armies; it is now armies OR defense, whichever the source runs out of first,
and both are the board rather than a count of plays - which is what the
repeating-keyword rule asks for. Two raids out of one land in a turn compete
for the same defense as well as the same armies.

## The AI

One new `POLICY_COVERAGE` entry and one new function in `src/ai.ts`:

```ts
function raidSpendFor(
  state: GameState, v: RulesView, actor: string,
  cardId: string, from: string, to: string,
): number
```

- A source is a FRONTIER if any land bordering it is held outside the actor's
  full realm, the target excepted. Out of a frontier land the AI spends 1: it
  will not gut the land facing a rival to hit a different one.
- Otherwise the source is INTERIOR, and the AI spends
  `min(ceiling, defenseOf(view, to) + 1)` - enough to take the land, and not a
  point more. If that number exceeds the ceiling the AI still spends the
  ceiling: the blow that cannot capture is still the blow that softens.

For Great raid the same question is asked of the fan: the total is the sum of
what each land in the fan would have spent on its own, capped at the pool.

The three raid cards keep whatever `chooseAction` branch already picks the
card and the target; what they gain is a sentence in their `POLICY_COVERAGE`
entries saying how hard the branch hits, because "picks a target" stopped
being the whole of the decision:

    ...and spends to capture out of an interior land, 1 out of a frontier
    one - the fan's per-land totals summed for Great raid

All three name the same rule, since the policy is one function over the class
rather than three copies keyed by card id.

## The restless raid

A quiet land raids a neighbour about one round in four
(`RESTLESS_RAID_CHANCE`, resolved at the round wrap in `src/game.ts`). It
calls `attackDamageFor(view, land, "raid")`, so it now needs a spend.

**It spends 1.** Spending its ceiling would grind the grey middle down over a
long run: a quiet land raids every fourth round, never heals on purpose, and
would sink toward 0 while nobody watched - which softens the whole map and
makes the passive statuses a slow gift to whoever gets there first. Spending 1
is exactly today's behaviour and keeps the change to the cards the player
holds.

It still pushes a `levied` event, because the land really did lose the point
and the badge on the map has to agree with the store.

## Boot params

`march=` gains an optional amount: `march=jersikans>selonians:3`, one clause
per arrow as now. The amount is clamped into `[1, ceiling]` against the source
as it stands when the clause is read.

Marches are declared LAST in `applyBootParams`, after the armies, the realm
and the defense overrides, and that ordering is kept rather than adjusted. So
the spend lands on top of `defense=`, and the two compose the way the sentence
reads: `defense=selonians:5&march=selonians>jersikans:3` boots Selonians at 2
with a 3 STR arrow in flight - `defense=` names the land before its army set
out, which is the only reading under which a booted march looks like a
declared one.

**It defaults to 1** when the clause names no amount, so every URL in
`CLAUDE.md`, in the tests and in anybody's notes still means what it means
today. A clause whose source cannot spend at all is dropped, the same as a
clause naming a source with no free army - a URL conjures nothing.

The spend applies to the source's defense at boot, so a booted march reads on
the map exactly as a declared one does.

## Card text

Raid, Strong raid and Great raid all need their prose rewritten, and
`textSegments` with it where they carry one. The keyword text on `raid` in
`KEYWORDS` needs the second bound named.

    Raid          Send an army at a bordering land, spending up to half this
                  land's defense. It lands next turn for what you spent, less
                  any counter-raid.

    Strong raid   Send an army at a bordering land, spending as much of this
                  land's defense as you like. It lands next turn for what you
                  spent, less any counter-raid.

    Great raid    Every land of yours bordering one land raids it, one army
                  each, spending defense you divide between them. Each lands
                  next turn like a Raid, answered separately.

The `raid` keyword text gains: "...while you hold one and a land can spare an
army and the defense to send it."

## Testing

- `spendCeilingFor` and `allocateSpend` get direct unit tests - the
  boundaries are 0, 1, an exact cap, a total above the sum, and a one-land
  fan.
- `tests/playability.test.ts` pins that a land at 0 defense is no source, and
  that the ceiling reads off CURRENT rather than maximum defense.
- `tests/cards.test.ts` pins the fraction table and that `cardRulesHash`
  moves when a fraction does.
- `tests/naming-convention.test.ts` and `tests/presentation.test.ts` cover
  `levied` for free once it is classified, since both walk every event type.
- `tests/two-seat.test.ts` gains a guest raid carrying a `spend`, which is the
  test that would notice the field failing to cross the wire.
- `tests/boot-params.test.ts` pins the default of 1 and the clamp.
- `tests/standings.test.ts` gains the `levied` walk, so the log suffix and
  the round summary cannot quote different numbers for one spend.

## What this moves, and what it does not

A 6 / 6 land can send a 6 STR arrow with a Strong raid and stand at 0. That is
the intended drama, and it is also how a rival's Subjugate demand gets its gate
opened - `subjugationGateOpen` asks about the score and does not care who
lowered it. Nothing special is written for that case; it falls out.

Nothing in the arrow scene changes. Width is already strength
(`clamp(span * 0.55, 30, 96)` split by strength share), so a 6 STR arrow beside
a 1 STR answer already draws as the lopsided thing it is.

Nothing in the clash math changes. `resolveAxis` already pairs armies one for
one and lands the difference on whoever pushed less hard; it simply sees
bigger and more varied numbers.

**This moves the balance substantially and the numbers are not guessed at
here.** Play share, targeting bias, waste and the stalemate number all sit
downstream of what an attack costs. `npm run balance` is run after the
implementation lands and its output read before this is called done - the repo
rule is that balance evidence is produced on demand, and this is the demand.
